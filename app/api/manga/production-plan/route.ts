import {NextResponse} from "next/server";
import {z} from "zod";
import {analyzeMangaMaster} from "@/lib/manga-production/planner";
import {planMangaPagesSafe} from "@/lib/manga-production/planner-safe";
import {analyzeLongMangaMaster,shouldUseLongStoryAnalysis} from "@/lib/manga-production/long-story";
import {MANGA_STYLE_PRESETS} from "@/lib/manga-production/types";
import {STORY_ANALYSIS_MODELS,isStoryAnalysisModel,storyAnalysisProviderLabel,type StoryAnalysisModel} from "@/lib/story-analysis-models";
import {XKiroRequestError} from "@/lib/xkiro";

const Base=z.object({
  action:z.enum(["master","pages"]),
  analysisModel:z.enum(STORY_ANALYSIS_MODELS),
  stylePreset:z.enum(MANGA_STYLE_PRESETS)
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

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid manga production request",details:parsed.error.flatten()},{status:400});
    const analysisModel=liveSelectedModel(request,parsed.data.analysisModel);
    const provider=storyAnalysisProviderLabel(analysisModel);

    if(parsed.data.action==="master"){
      const masterInput={...parsed.data,analysisModel};
      const analyzed=shouldUseLongStoryAnalysis(parsed.data.story)
        ?await analyzeLongMangaMaster(masterInput)
        :await analyzeMangaMaster(masterInput);
      return NextResponse.json({kind:"master",data:{...analyzed,provider}});
    }

    const planned=await planMangaPagesSafe({
      analysisModel,
      stylePreset:parsed.data.stylePreset,
      storySummary:parsed.data.storySummary,
      beats:parsed.data.beats as never,
      startBeatIndex:parsed.data.startBeatIndex,
      pageStartNumber:parsed.data.pageStartNumber,
      previousState:parsed.data.previousState as never,
      characters:parsed.data.characters,
      locations:parsed.data.locations,
      props:parsed.data.props
    });
    return NextResponse.json({kind:"pages",data:{...planned,provider}});
  }catch(error){
    if(error instanceof XKiroRequestError){
      console.error("Manga production xKiro request failed",{code:error.code,status:error.status,message:error.message});
      return NextResponse.json({error:error.message},{status:error.status||502});
    }
    console.error("Manga production planning failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Manga production planning failed"},{status:502});
  }
}
