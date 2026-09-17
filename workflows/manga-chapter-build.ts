import {sleep} from "workflow";
import {analyzeMangaMaster} from "@/lib/manga-production/planner";
import {planMangaPagesSafe} from "@/lib/manga-production/planner-safe";
import {analyzeLongMangaMaster,shouldUseLongStoryAnalysis} from "@/lib/manga-production/long-story";
import {refineMangaMasterForPacing} from "@/lib/manga-production/adaptive-master";
import {calculatePlannedCoverage} from "@/lib/manga-production/validators";
import type {MangaPacingPreset} from "@/lib/manga-production/pacing-policy";
import type {MangaChapterProduction,MangaContinuityState,MangaMasterAnalysis,MangaStylePreset} from "@/lib/manga-production/types";
import {isVertexStoryAnalysisModel,storyAnalysisProviderLabel,type StoryAnalysisModel} from "@/lib/story-analysis-models";
import {withStoryModelFallback} from "@/lib/story-model-fallback";

export type MangaChapterBuildWorkflowInput={
  projectId:string;
  chapterId:string;
  projectName:string;
  chapterTitle:string;
  story:string;
  analysisModel:StoryAnalysisModel;
  stylePreset:MangaStylePreset;
  pacingPreset:MangaPacingPreset;
  existingCharacters:unknown[];
  existingLocations:unknown[];
  existingProps:unknown[];
  previousContinuity?:MangaContinuityState|null;
  chapterContext?:string;
  pagePlanningCooldownSeconds:number;
  startedAt:string;
};

export type MangaChapterBuildWorkflowResult={
  projectId:string;
  chapterId:string;
  master:MangaMasterAnalysis;
  production:MangaChapterProduction;
};

type MasterStepResult={master:MangaMasterAnalysis;model:StoryAnalysisModel;fallbackUsed:boolean};

function providerLabel(model:StoryAnalysisModel,fallbackUsed:boolean,pacing:MangaPacingPreset){
  const base=storyAnalysisProviderLabel(model);
  return `${base}${fallbackUsed?" · automatic fallback from Gemini 3.1 Pro":""} · durable background build · adaptive ${pacing.toLowerCase()} pacing`;
}

async function analyzeMasterStep(input:MangaChapterBuildWorkflowInput):Promise<MasterStepResult>{
  "use step";
  const result=await withStoryModelFallback({
    model:input.analysisModel,
    retryDelaysMs:[],
    run:async(model)=>{
      const masterInput={
        action:"master" as const,
        projectName:input.projectName,
        chapterTitle:input.chapterTitle,
        story:input.story,
        analysisModel:model,
        stylePreset:input.stylePreset,
        pacingPreset:input.pacingPreset,
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

  return {
    master:{...refined,provider:providerLabel(result.model,result.fallbackUsed,input.pacingPreset)},
    model:result.model,
    fallbackUsed:result.fallbackUsed
  };
}

async function planOnePageStep(input:{
  analysisModel:StoryAnalysisModel;
  pacingPreset:MangaPacingPreset;
  stylePreset:MangaStylePreset;
  storySummary:string;
  beats:MangaMasterAnalysis["beats"];
  startBeatIndex:number;
  pageStartNumber:number;
  previousState:MangaContinuityState;
  characters:unknown[];
  locations:MangaMasterAnalysis["locations"];
  props:MangaMasterAnalysis["props"];
}){
  "use step";
  const result=await withStoryModelFallback({
    model:input.analysisModel,
    run:(model)=>planMangaPagesSafe({
      analysisModel:model,
      pacingPreset:input.pacingPreset,
      stylePreset:input.stylePreset,
      storySummary:input.storySummary,
      beats:input.beats,
      startBeatIndex:input.startBeatIndex,
      pageStartNumber:input.pageStartNumber,
      previousState:input.previousState,
      characters:input.characters,
      locations:input.locations,
      props:input.props
    })
  });
  if(result.data.nextBeatIndex<=input.startBeatIndex)throw new Error("Background manga page planner made no progress.");
  if(!result.data.pages.length)throw new Error("Background manga page planner returned no page.");
  return result.data;
}

export async function buildMangaChapterWorkflow(input:MangaChapterBuildWorkflowInput):Promise<MangaChapterBuildWorkflowResult>{
  "use workflow";

  const masterResult=await analyzeMasterStep(input);
  const master=masterResult.master;
  const previous=input.previousContinuity||null;
  const inheritedCharacters=previous?{...master.initialCharacterStates,...previous.characters}:master.initialCharacterStates;
  const storySummary=input.chapterContext?`${input.chapterContext}\nCurrent chapter summary: ${master.storySummary}`:master.storySummary;
  const initialState:MangaContinuityState={
    currentPage:0,
    timeline:previous?.timeline||master.timeline[0]?.event||"Story start",
    timeOfDay:previous?.timeOfDay||master.timeline[0]?.timeOfDay||"unspecified",
    currentLocation:previous?.currentLocation||master.timeline[0]?.location||"",
    characters:inheritedCharacters,
    activeProps:previous?.activeProps?.length?previous.activeProps:master.props.filter((item)=>item.currentOwner||item.currentLocation).map((item)=>item.name),
    previousPageEndState:previous?.previousPageEndState||"Story start"
  };

  let nextBeatIndex=0;
  let continuityState=initialState;
  const pages:MangaChapterProduction["pages"]=[];
  let guard=0;

  while(nextBeatIndex<master.beats.length){
    guard+=1;
    if(guard>Math.max(12,master.beats.length+2))throw new Error("Background manga planning stopped because the planner did not finish the remaining beats.");

    if(guard>1&&isVertexStoryAnalysisModel(input.analysisModel)&&input.pagePlanningCooldownSeconds>0){
      await sleep(`${input.pagePlanningCooldownSeconds}s`);
    }

    const planned=await planOnePageStep({
      analysisModel:input.analysisModel,
      pacingPreset:input.pacingPreset,
      stylePreset:input.stylePreset,
      storySummary,
      beats:master.beats,
      startBeatIndex:nextBeatIndex,
      pageStartNumber:(pages.at(-1)?.pageNumber||0)+1,
      previousState:continuityState,
      characters:input.existingCharacters,
      locations:master.locations,
      props:master.props
    });

    pages.push(...planned.pages);
    nextBeatIndex=planned.nextBeatIndex;
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
    updatedAt:input.startedAt
  };

  return {projectId:input.projectId,chapterId:input.chapterId,master,production};
}
