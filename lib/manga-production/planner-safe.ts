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

/** Legacy fallback splitter kept for non-cinematic pacing and regression compatibility. */
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
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    try{
      const result=await planMangaPagesBase(input);
      if(result.nextBeatIndex===input.beats.length)return result;
      lastError=new Error(`Manga page planner consumed ${result.nextBeatIndex}/${input.beats.length} beats in an exact continuity group.`);
    }catch(error){
      lastError=error;
      if(!isSemanticPlannerError(error))throw error;
    }
  }
  throw lastError instanceof Error?lastError:new Error("Manga page planner could not preserve beat order after retrying.");
}

async function planSequentialChunks(input:AdaptivePagePlannerInput,counts:number[]):Promise<MangaPagePlan>{
  const remainingBeats=input.beats.slice(input.startBeatIndex);
  const pages:MangaPagePlan["pages"]=[];
  let cursor=0;
  let continuityState=input.previousState;
  let pageStartNumber=input.pageStartNumber;
  let provider=`xKiro · ${input.analysisModel}`;
  const clean=baseInput(input);

  for(const count of counts){
    const beatGroup=remainingBeats.slice(cursor,cursor+count);
    if(beatGroup.length<3)throw new Error("Manga page planner produced an invalid final beat group smaller than three panels.");
    const groupResult=await planExactGroup({
      ...clean,
      beats:beatGroup,
      startBeatIndex:0,
      pageStartNumber,
      previousState:continuityState
    });

    pages.push(...groupResult.pages);
    cursor+=count;
    continuityState=groupResult.continuityState;
    provider=groupResult.provider;
    pageStartNumber=(groupResult.pages.at(-1)?.pageNumber||pageStartNumber)+1;
  }

  return {pages,nextBeatIndex:input.startBeatIndex+cursor,continuityState,provider};
}

/**
 * Cinematic is the StoryFrame default: page count is derived from beat count,
 * not fixed to 6/12 pages. The policy targets about 3-4 panels/page and plans
 * two pages at a time (normally 6-8 beats) so continuity state is carried
 * forward without making one model call per panel/page.
 *
 * Other pacing modes keep the existing fast bulk path and deterministic
 * semantic-error fallback.
 */
export async function planMangaPagesSafe(input:AdaptivePagePlannerInput):Promise<MangaPagePlan>{
  const remaining=input.beats.length-input.startBeatIndex;
  const clean=baseInput(input);
  if(remaining<3)return planMangaPagesBase(clean);

  const pacing=input.pacingPreset||"Cinematic";
  if(pacing==="Cinematic"){
    const counts=partitionPlanningChunkCounts(remaining,pacing);
    if(!counts.length)throw new Error("Manga page planner could not derive adaptive cinematic page groups.");
    return planSequentialChunks(input,counts);
  }

  try{
    const fast=await planMangaPagesBase(clean);
    const left=input.beats.length-fast.nextBeatIndex;
    if(left!==1&&left!==2)return fast;
  }catch(error){
    if(!isSemanticPlannerError(error))throw error;
  }

  const remainingBeats=input.beats.slice(input.startBeatIndex);
  const counts=partitionBeatCounts(remainingBeats.length);
  if(!counts.length)throw new Error("Manga page planner could not split the remaining story beats into valid 3-5 panel pages.");
  return planSequentialChunks(input,counts);
}
