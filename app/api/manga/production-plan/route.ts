import {NextResponse} from "next/server";
import {z} from "zod";
import {analyzeMangaMaster} from "@/lib/manga-production/planner";
import {planMangaPagesSafe} from "@/lib/manga-production/planner-safe";
import {analyzeLongMangaMaster,shouldUseLongStoryAnalysis} from "@/lib/manga-production/long-story";
import {refineMangaMasterForPacing} from "@/lib/manga-production/adaptive-master";
import {MANGA_PACING_PRESETS} from "@/lib/manga-production/pacing-policy";
import {MANGA_STYLE_PRESETS} from "@/lib/manga-production/types";
import {STORY_ANALYSIS_MODELS,isStoryAnalysisModel,isVertexStoryAnalysisModel,storyAnalysisProviderLabel,type StoryAnalysisModel} from "@/lib/story-analysis-models";
import {withStoryModelFallback} from "@/lib/story-model-fallback";
import {XKiroRequestError} from "@/lib/xkiro";

// Master analysis can legitimately include one long Gemini call plus an optional
// pacing-normalization pass. Keep enough headroom for both instead of letting
// Vercel kill the function at the old 120s boundary and return non-JSON HTML.
export const maxDuration=300;

const DEFAULT_GEMINI_PAGE_PLANNING_COOLDOWN_MS=12_000;

const Base=z.object({
  action:z.enum(["master","pages"]),
  analysisModel:z.enum(STORY_ANALYSIS_MODELS),
  stylePreset:z.enum(MANGA_STYLE_PRESETS),
  pacingPreset:z.enum(MANGA_PACING_PRESETS).default("Balanced")
});

const Master=Base.extend({
  action:z.literal("master"),
  projectName:z.string().min(1),
  chapterTitle:z.string().min(1),
  story:z.string().min(20).max(120000),
  existingCharacters:z.array(z.unknown()).default([]),
  existingLocations:z.array(z.unknown()).default([]),
  existingProps:z.array(z.unknown()).default([])
});

const Pages=Base.extend({
  action:z.literal("pages"),
  storySummary:z.string().min(1),
  beats:z.array(z.unknown()).min(1).max(300),
  startBeatIndex:z.number().int().min(0).max(299),
  pageStartNumber:z.number().int().min(1).max(999),
  previousState:z.unknown(),
  characters:z.array(z.unknown()).default([]),
  locations:z.array(z.unknown()).default([]),
  props:z.array(z.unknown()).default([])
});

const Input=z.discriminatedUnion("action",[Master,Pages]);
const MODEL_COOKIE="storyframe-analysis-model";

function liveSelectedModel(request:Request,fallback:StoryAnalysisModel){
  const raw=request.headers.get("cookie")||"";
  const pair=raw.split(";").map((item)=>item.trim()).find((item)=>item.startsWith(`${MODEL_COOKIE}=`));
  if(!pair)return fallback;
  try{
    const value=decodeURIComponent(pair.slice(MODEL_COOKIE.length+1));
    return isStoryAnalysisModel(value)?value:fallback;
  }catch{
    return fallback;
  }
}

function providerLabel(model:StoryAnalysisModel,fallbackUsed:boolean,pacing:string){
  const base=storyAnalysisProviderLabel(model);
  return `${base}${fallbackUsed?" · automatic fallback from Gemini 3.1 Pro":""} · adaptive ${pacing.toLowerCase()} pacing`;
}

function pagePlanningCooldownMs(){
  const configured=Number(process.env.GEMINI_PAGE_PLANNING_COOLDOWN_MS||DEFAULT_GEMINI_PAGE_PLANNING_COOLDOWN_MS);
  if(!Number.isFinite(configured))return DEFAULT_GEMINI_PAGE_PLANNING_COOLDOWN_MS;
  return Math.max(0,Math.min(60_000,Math.round(configured)));
}

async function wait(ms:number){
  if(ms<=0)return;
  await new Promise<void>((resolve)=>setTimeout(resolve,ms));
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid manga production request",details:parsed.error.flatten()},{status:400});
    const data=parsed.data;
    const analysisModel=liveSelectedModel(request,data.analysisModel);

    if(data.action==="master"){
      const masterData=data;

      // Do not repeat a potentially 120-second master-analysis call inside the
      // same server invocation. If Gemini times out/429s, fail over immediately
      // to xKiro so the request still has time to return a proper JSON response.
      const result=await withStoryModelFallback({
        model:analysisModel,
        retryDelaysMs:[],
        run:async(model)=>{
          const masterInput={...masterData,analysisModel:model};
          return shouldUseLongStoryAnalysis(masterData.story)
            ?await analyzeLongMangaMaster(masterInput)
            :await analyzeMangaMaster(masterInput);
        }
      });

      // Pacing refinement is intentionally outside the fallback wrapper. A
      // refinement failure must never cause the entire expensive master analysis
      // to run again. When fallback was already needed, return that valid master
      // immediately and let page planning preserve its beat order/continuity.
      const refined=result.fallbackUsed
        ?result.data
        :await refineMangaMasterForPacing({analysisModel:result.model,pacingPreset:masterData.pacingPreset,story:masterData.story,master:result.data});

      return NextResponse.json({kind:"master",data:{...refined,provider:providerLabel(result.model,result.fallbackUsed,masterData.pacingPreset)}});
    }

    const pagesData=data;
    // Gemini page planning is deliberately paced. The browser already waits for
    // each response before asking for the next page, so this cooldown prevents
    // a chapter build from creating a request burst against Vertex AI quotas.
    if(isVertexStoryAnalysisModel(analysisModel))await wait(pagePlanningCooldownMs());

    const result=await withStoryModelFallback({
      model:analysisModel,
      run:(model)=>planMangaPagesSafe({
        analysisModel:model,
        pacingPreset:pagesData.pacingPreset,
        stylePreset:pagesData.stylePreset,
        storySummary:pagesData.storySummary,
        beats:pagesData.beats as never,
        startBeatIndex:pagesData.startBeatIndex,
        pageStartNumber:pagesData.pageStartNumber,
        previousState:pagesData.previousState as never,
        characters:pagesData.characters,
        locations:pagesData.locations,
        props:pagesData.props
      })
    });
    return NextResponse.json({kind:"pages",data:{...result.data,provider:providerLabel(result.model,result.fallbackUsed,pagesData.pacingPreset)}});
  }catch(error){
    if(error instanceof XKiroRequestError){
      console.error("Manga production story-model request failed",{code:error.code,status:error.status,message:error.message});
      return NextResponse.json({error:error.message},{status:error.status||502});
    }
    console.error("Manga production planning failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Manga production planning failed"},{status:502});
  }
}
