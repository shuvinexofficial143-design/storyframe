import {sleep} from "workflow";
import {analyzeMangaMaster} from "@/lib/manga-production/planner";
import {planMangaPagesSafe} from "@/lib/manga-production/planner-safe";
import {analyzeLongMangaMaster,shouldUseLongStoryAnalysis} from "@/lib/manga-production/long-story";
import {refineMangaMasterForPacing} from "@/lib/manga-production/adaptive-master";
import {calculatePlannedCoverage} from "@/lib/manga-production/validators";
import {deriveSeed} from "@/lib/continuity/seed";
import {isVertexStoryAnalysisModel,storyAnalysisProviderLabel,type StoryAnalysisModel} from "@/lib/story-analysis-models";
import {withStoryModelFallback} from "@/lib/story-model-fallback";
import {partitionPlanningChunkCounts,type MangaPacingPreset} from "@/lib/manga-production/pacing-policy";
import type {MangaChapterProduction,MangaContinuityState,MangaMasterAnalysis,MangaPage,MangaStylePreset} from "@/lib/manga-production/types";

export type MangaBackgroundBuildInput={
  projectName:string;
  chapterTitle:string;
  story:string;
  analysisModel:StoryAnalysisModel;
  stylePreset:MangaStylePreset;
  pacingPreset:MangaPacingPreset;
  masterSeed:number;
  requestedAt:string;
  existingCharacters:unknown[];
  existingLocations:unknown[];
  existingProps:unknown[];
  previousContinuity?:MangaContinuityState|null;
  chapterContext?:string;
};

export type MangaBackgroundBuildResult=
  |{ok:true;master:MangaMasterAnalysis;production:MangaChapterProduction}
  |{ok:false;stage:string;error:string};

function workflowError(error:unknown){
  return error instanceof Error?error.message:String(error||"Unknown background manga build error");
}

function providerLabel(model:StoryAnalysisModel,fallbackUsed:boolean,pacing:MangaPacingPreset){
  return `${storyAnalysisProviderLabel(model)}${fallbackUsed?" · automatic fallback from Gemini 3.1 Pro":""} · adaptive ${pacing.toLowerCase()} pacing`;
}

async function analyzeMasterStep(input:MangaBackgroundBuildInput){
  "use step";
  const result=await withStoryModelFallback({
    model:input.analysisModel,
    run:async(model)=>{
      const masterInput={
        projectName:input.projectName,
        chapterTitle:input.chapterTitle,
        story:input.story,
        analysisModel:model,
        stylePreset:input.stylePreset,
        existingCharacters:input.existingCharacters,
        existingLocations:input.existingLocations,
        existingProps:input.existingProps
      };
      return shouldUseLongStoryAnalysis(input.story)
        ?await analyzeLongMangaMaster(masterInput)
        :await analyzeMangaMaster(masterInput);
    }
  });
  const refined=result.fallbackUsed
    ?result.data
    :await refineMangaMasterForPacing({analysisModel:result.model,pacingPreset:input.pacingPreset,story:input.story,master:result.data});
  return {master:{...refined,provider:providerLabel(result.model,result.fallbackUsed,input.pacingPreset)},model:result.model};
}

async function planOnePageStep(input:{
  analysisModel:StoryAnalysisModel;
  pacingPreset:MangaPacingPreset;
  stylePreset:MangaStylePreset;
  storySummary:string;
  beats:MangaChapterProduction["beats"];
  startBeatIndex:number;
  pageStartNumber:number;
  previousState:MangaContinuityState;
  characters:unknown[];
  locations:unknown[];
  props:unknown[];
}){
  "use step";
  const result=await withStoryModelFallback({
    model:input.analysisModel,
    run:(model)=>planMangaPagesSafe({...input,analysisModel:model})
  });
  return result.data;
}

function seedPages(masterSeed:number,pages:MangaPage[]){
  return pages.map((page)=>({...page,panels:page.panels.map((panel)=>({...panel,seed:deriveSeed(masterSeed,panel.id,0)}))}));
}

export async function buildMangaChapterWorkflow(input:MangaBackgroundBuildInput):Promise<MangaBackgroundBuildResult>{
  "use workflow";

  let analyzed:Awaited<ReturnType<typeof analyzeMasterStep>>;
  try{
    analyzed=await analyzeMasterStep(input);
  }catch(error){
    return {ok:false,stage:"Story analysis",error:workflowError(error)};
  }
  const master=analyzed.master;
  const previous=input.previousContinuity||null;
  const inheritedCharacters=previous?{...master.initialCharacterStates,...previous.characters}:master.initialCharacterStates;
  const initialState:MangaContinuityState={
    currentPage:0,
    timeline:previous?.timeline||master.timeline[0]?.event||"Story start",
    timeOfDay:previous?.timeOfDay||master.timeline[0]?.timeOfDay||"unspecified",
    currentLocation:previous?.currentLocation||master.timeline[0]?.location||"",
    characters:inheritedCharacters,
    activeProps:previous?.activeProps?.length?previous.activeProps:master.props.filter((item)=>item.currentOwner||item.currentLocation).map((item)=>item.name),
    previousPageEndState:previous?.previousPageEndState||"Story start"
  };

  let pages:MangaPage[]=[];
  let nextBeatIndex=0;
  let continuityState=initialState;
  let guard=0;
  const storySummary=input.chapterContext?`${input.chapterContext}\nCurrent chapter summary: ${master.storySummary}`:master.storySummary;
  const plannerCharacters=[...input.existingCharacters,...master.characters];

  while(nextBeatIndex<master.beats.length){
    guard+=1;
    if(guard>Math.max(12,master.beats.length+2))throw new Error("Background manga planning stopped because the planner did not finish the remaining beats.");
    const remaining=master.beats.length-nextBeatIndex;
    const nextPageBeatCount=partitionPlanningChunkCounts(remaining,input.pacingPreset)[0];
    const pageNumber=(pages.at(-1)?.pageNumber||0)+1;
    if(!nextPageBeatCount)return {ok:false,stage:`Page ${pageNumber} planning`,error:"Could not derive the next 3-5 beat page group."};
    const pageBeats=master.beats.slice(nextBeatIndex,nextBeatIndex+nextPageBeatCount);
    if(isVertexStoryAnalysisModel(analyzed.model))await sleep("12 seconds");
    let planned:Awaited<ReturnType<typeof planOnePageStep>>;
    try{
      planned=await planOnePageStep({
        analysisModel:analyzed.model,
        pacingPreset:input.pacingPreset,
        stylePreset:input.stylePreset,
        storySummary,
        beats:pageBeats,
        startBeatIndex:0,
        pageStartNumber:pageNumber,
        previousState:continuityState,
        characters:plannerCharacters,
        locations:master.locations,
        props:master.props
      });
    }catch(error){
      return {ok:false,stage:`Page ${pageNumber} planning`,error:workflowError(error)};
    }
    if(planned.nextBeatIndex!==pageBeats.length){
      return {ok:false,stage:`Page ${pageNumber} planning`,error:`Planner consumed ${planned.nextBeatIndex}/${pageBeats.length} beats; the queue stopped before skipping anything.`};
    }
    pages=[...pages,...seedPages(input.masterSeed,planned.pages)];
    nextBeatIndex+=pageBeats.length;
    continuityState=planned.continuityState;
  }

  const production:MangaChapterProduction={
    schemaVersion:1,
    stylePreset:input.stylePreset,
    pacingPreset:input.pacingPreset,
    storySummary,
    timeline:master.timeline,
    beats:master.beats,
    locationProfiles:master.locations,
    propStates:master.props,
    initialCharacterStates:inheritedCharacters,
    pages,
    nextBeatIndex,
    continuityState,
    coverage:calculatePlannedCoverage(master.beats,pages),
    analysisProvider:master.provider,
    updatedAt:input.requestedAt
  };

  return {ok:true,master,production};
}
