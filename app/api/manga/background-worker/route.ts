import {NextResponse} from "next/server";
import {z} from "zod";
import {getBackgroundJob,putBackgroundJob,type BackgroundJob} from "@/lib/background-job-store";
import {publishBackgroundStep,verifyBackgroundWorker} from "@/lib/background-qstash";
import {analyzeMangaMaster} from "@/lib/manga-production/planner";
import {analyzeLongMangaMaster,shouldUseLongStoryAnalysis} from "@/lib/manga-production/long-story";
import {refineMangaMasterForPacing} from "@/lib/manga-production/adaptive-master";
import {planMangaPagesSafe} from "@/lib/manga-production/planner-safe";
import {calculatePlannedCoverage} from "@/lib/manga-production/validators";
import {deriveSeed} from "@/lib/continuity/seed";
import {storyAnalysisProviderLabel,type StoryAnalysisModel} from "@/lib/story-analysis-models";
import {withStoryModelFallback} from "@/lib/story-model-fallback";
import type {MangaChapterProduction,MangaMasterAnalysis,MangaPage,MangaPacingPreset,MangaStylePreset} from "@/lib/manga-production/types";

export const maxDuration=300;

type Payload={
  projectId:string;chapterId:string;projectName:string;chapterTitle:string;story:string;analysisModel:StoryAnalysisModel;
  stylePreset:MangaStylePreset;pacingPreset:MangaPacingPreset;masterSeed:number;
  existingCharacters:unknown[];existingLocations:unknown[];existingProps:unknown[];
  previousContinuity?:any;chapterContext:string;
};
type Result={master:MangaMasterAnalysis;production:MangaChapterProduction};
const Body=z.object({runId:z.string().uuid()});

function providerLabel(model:StoryAnalysisModel,pacing:string){return `${storyAnalysisProviderLabel(model)} · adaptive ${pacing.toLowerCase()} pacing`}
const now=()=>new Date().toISOString();

function seedPages(masterSeed:number,pages:MangaPage[]){
  return pages.map((page)=>({...page,panels:page.panels.map((panel)=>({...panel,seed:deriveSeed(masterSeed,panel.id,0)}))}));
}

async function enqueueNext(request:Request,runId:string,delaySeconds=1){
  const origin=new URL(request.url).origin;
  await publishBackgroundStep({destination:`${origin}/api/manga/background-worker`,runId,delaySeconds});
}

async function saveFailure(request:Request,job:BackgroundJob<Payload,Result>,error:unknown){
  const message=error instanceof Error?error.message:"Background manga worker failed";
  const attempts=(job.attempts||0)+1;
  if(attempts<4&&job.status!=="cancelled"){
    job.status="waiting";job.attempts=attempts;job.error=message;
    job.progress=`Temporary error. Background retry ${attempts+1}/4 scheduled…`;job.updatedAt=now();
    await putBackgroundJob(job);
    await enqueueNext(request,job.id,Math.min(45,8*attempts));
    return;
  }
  job.status="failed";job.attempts=attempts;job.error=message;job.progress="Background manga build failed.";job.updatedAt=now();
  await putBackgroundJob(job);
}

export async function POST(request:Request){
  if(!verifyBackgroundWorker(request))return NextResponse.json({error:"Unauthorized background worker request"},{status:401});
  const parsed=Body.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({error:"Invalid worker message"},{status:400});
  const job=await getBackgroundJob<Payload,Result>(parsed.data.runId);
  if(!job)return NextResponse.json({ok:true,expired:true});
  if(job.status==="cancelled"||job.status==="completed")return NextResponse.json({ok:true,status:job.status});

  try{
    job.status="running";job.error=undefined;job.updatedAt=now();
    if(job.phase==="master"){
      job.progress="Background: analyzing story and continuity…";
      await putBackgroundJob(job);
      const p=job.payload;
      const analysis=await withStoryModelFallback({
        model:p.analysisModel,retryDelaysMs:[6_000,12_000,24_000],retryOnlyRateLimit:false,
        run:async(model)=>{
          const input={projectName:p.projectName,chapterTitle:p.chapterTitle,story:p.story,analysisModel:model,stylePreset:p.stylePreset,existingCharacters:p.existingCharacters,existingLocations:p.existingLocations,existingProps:p.existingProps};
          return shouldUseLongStoryAnalysis(p.story)?analyzeLongMangaMaster(input):analyzeMangaMaster(input);
        }
      });
      const master=await refineMangaMasterForPacing({analysisModel:analysis.model,pacingPreset:p.pacingPreset,story:p.story,master:analysis.data});
      master.provider=providerLabel(analysis.model,p.pacingPreset);
      const previous=p.previousContinuity||null;
      const inheritedCharacters=previous?{...master.initialCharacterStates,...(previous.characters||{})}:master.initialCharacterStates;
      const initialState={
        currentPage:0,
        timeline:previous?.timeline||master.timeline[0]?.event||"Story start",
        timeOfDay:previous?.timeOfDay||master.timeline[0]?.timeOfDay||"unspecified",
        currentLocation:previous?.currentLocation||master.timeline[0]?.location||"",
        characters:inheritedCharacters,
        activeProps:Array.isArray(previous?.activeProps)&&previous.activeProps.length?previous.activeProps:master.props.filter((item)=>item.currentOwner||item.currentLocation).map((item)=>item.name),
        previousPageEndState:previous?.previousPageEndState||"Story start"
      };
      const production:MangaChapterProduction={
        schemaVersion:1,stylePreset:p.stylePreset,pacingPreset:p.pacingPreset,
        storySummary:p.chapterContext?`${p.chapterContext}\nCurrent chapter summary: ${master.storySummary}`:master.storySummary,
        timeline:master.timeline,beats:master.beats,locationProfiles:master.locations,propStates:master.props,
        initialCharacterStates:inheritedCharacters,pages:[],nextBeatIndex:0,continuityState:initialState,
        coverage:{percent:0,coveredBeatIds:[],missingBeats:master.beats.map((beat)=>({beatId:beat.id,storyBeat:beat.storyBeat,sourceText:beat.sourceText}))},
        analysisProvider:master.provider,updatedAt:now()
      };
      job.result={master,production};job.phase="pages";job.attempts=0;
      job.progress=`Story analyzed: ${master.beats.length} beats. Background page planning started…`;job.updatedAt=now();
      await putBackgroundJob(job);
      await enqueueNext(request,job.id,1);
      return NextResponse.json({ok:true,phase:"pages"});
    }

    if(job.phase==="pages"){
      if(!job.result)throw new Error("Background job lost its master-analysis result.");
      const p=job.payload;
      const production=job.result.production;
      if(production.nextBeatIndex>=production.beats.length){
        job.status="completed";job.phase="complete";job.progress=`Complete: ${production.pages.length} manga pages planned.`;job.updatedAt=now();
        await putBackgroundJob(job);
        return NextResponse.json({ok:true,status:"completed"});
      }
      const start=production.nextBeatIndex;
      job.progress=`Background: planning pages · ${start}/${production.beats.length} beats assigned…`;job.updatedAt=now();
      await putBackgroundJob(job);
      const plannedResult=await withStoryModelFallback({
        model:p.analysisModel,
        run:(model)=>planMangaPagesSafe({
          analysisModel:model,pacingPreset:p.pacingPreset,stylePreset:p.stylePreset,storySummary:production.storySummary,
          beats:production.beats,startBeatIndex:start,pageStartNumber:(production.pages.at(-1)?.pageNumber||0)+1,
          previousState:production.continuityState,characters:p.existingCharacters,locations:production.locationProfiles,props:production.propStates
        })
      });
      const planned=plannedResult.data;
      if(planned.nextBeatIndex<=start)throw new Error("Background page planner made no progress.");
      const pages=[...production.pages,...seedPages(p.masterSeed,planned.pages)];
      job.result.production={...production,pages,nextBeatIndex:planned.nextBeatIndex,continuityState:planned.continuityState,coverage:calculatePlannedCoverage(production.beats,pages),updatedAt:now()};
      job.attempts=0;job.updatedAt=now();
      if(job.result.production.nextBeatIndex>=job.result.production.beats.length){
        job.status="completed";job.phase="complete";job.progress=`Complete: ${pages.length} manga pages planned.`;
        await putBackgroundJob(job);
        return NextResponse.json({ok:true,status:"completed"});
      }
      job.status="queued";job.progress=`Background: ${job.result.production.nextBeatIndex}/${job.result.production.beats.length} beats planned. Continuing…`;
      await putBackgroundJob(job);
      await enqueueNext(request,job.id,4);
      return NextResponse.json({ok:true,status:"queued"});
    }

    return NextResponse.json({ok:true,status:job.status});
  }catch(error){
    await saveFailure(request,job,error);
    return NextResponse.json({ok:true,retrying:job.status!=="failed"});
  }
}
