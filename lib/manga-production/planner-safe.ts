import {planMangaPages as planMangaPagesBase} from "./planner";
import {partitionPlanningChunkCounts,type MangaPacingPreset} from "./pacing-policy";
import type {MangaPagePlan} from "./types";

type PagePlannerInput=Parameters<typeof planMangaPagesBase>[0];
type AdaptivePagePlannerInput=PagePlannerInput&{pacingPreset?:MangaPacingPreset};

const SEMANTIC_PLANNER_ERROR=/(skipped or reordered beats|duplicated a story beat|unknown beat ID|Fewer than three unplanned manga beats remain)/i;

function isSemanticPlannerError(error:unknown){
  return error instanceof Error&&SEMANTIC_PLANNER_ERROR.test(error.message);
}

function baseInput(input:AdaptivePagePlannerInput):PagePlannerInput{
  const {pacingPreset:_pacingPreset,...rest}=input;
  return rest;
}

/** Legacy safe splitter kept for compatibility and targeted tests. */
export function partitionBeatCounts(total:number){
  if(total<3)return [];
  const threes=Math.floor(total/3);
  const remainder=total%3;
  if(remainder===0)return Array.from({length:threes},()=>3);
  if(remainder===1){
    if(threes<1)return total===4?[4]:[];
    return [...Array.from({length:Math.max(0,threes-1)},()=>3),4];
  }
  if(threes<1)return total===5?[5]:[];
  return [...Array.from({length:Math.max(0,threes-1)},()=>3),5];
}

async function planExactGroup(input:PagePlannerInput,maxAttempts=3){
  let lastError:unknown;
  const exactInput:PagePlannerInput={
    ...input,
    storySummary:`${input.storySummary}\n\nPLANNER CONTROL: This request is for ONE manga page only. It contains exactly ${input.beats.length} supplied beats. Consume ALL supplied beat IDs in order in one 3-5 panel page. Do not return a second page. Preserve the exact incoming continuity state and produce the exact end state for the next page.`
  };
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    try{
      const result=await planMangaPagesBase(exactInput);
      if(result.nextBeatIndex===input.beats.length&&result.pages.length===1)return result;
      lastError=new Error(`Manga page planner returned ${result.pages.length} page(s) and consumed ${result.nextBeatIndex}/${input.beats.length} beats; exactly one complete page was required.`);
    }catch(error){
      lastError=error;
      if(!isSemanticPlannerError(error))throw error;
    }
  }
  throw lastError instanceof Error?lastError:new Error("Manga page planner could not preserve beat order after retrying.");
}

/**
 * One API request plans exactly one manga page. The caller then sends the next
 * request after this one finishes, carrying forward the returned continuity
 * state. This avoids bursting multiple Gemini page-planning calls inside one
 * server request and keeps page order deterministic.
 */
export async function planMangaPagesSafe(input:AdaptivePagePlannerInput):Promise<MangaPagePlan>{
  const remaining=input.beats.length-input.startBeatIndex;
  const clean=baseInput(input);
  if(remaining<3)return planMangaPagesBase(clean);

  const pacing=input.pacingPreset||"Balanced";
  const pageCounts=partitionPlanningChunkCounts(remaining,pacing);
  const count=pageCounts[0];
  if(!count||count<3||count>5)throw new Error("Manga page planner could not derive a valid 3-5 panel next page.");

  const beatGroup=input.beats.slice(input.startBeatIndex,input.startBeatIndex+count);
  if(beatGroup.length!==count)throw new Error("Manga page planner could not collect the expected beats for the next page.");

  const result=await planExactGroup({
    ...clean,
    beats:beatGroup,
    startBeatIndex:0,
    pageStartNumber:input.pageStartNumber,
    previousState:input.previousState
  });

  return {
    pages:result.pages,
    nextBeatIndex:input.startBeatIndex+count,
    continuityState:result.continuityState,
    provider:result.provider
  };
}
