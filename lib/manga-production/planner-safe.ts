import {planMangaPages as planMangaPagesBase} from "./planner";
import type {MangaPagePlan} from "./types";

type PagePlannerInput=Parameters<typeof planMangaPagesBase>[0];

const SEMANTIC_PLANNER_ERROR=/(skipped or reordered beats|duplicated a story beat|unknown beat ID|Fewer than three unplanned manga beats remain)/i;

function isSemanticPlannerError(error:unknown){
  return error instanceof Error&&SEMANTIC_PLANNER_ERROR.test(error.message);
}

/**
 * Split a remaining beat count into safe 3-5 beat groups.
 * Every group can be represented by exactly one valid manga page, so a fallback
 * request cannot legally leave a 1-2 beat tail behind.
 */
export function partitionBeatCounts(total:number){
  if(total<3)return [];
  for(let groups=Math.ceil(total/5);groups<=Math.floor(total/3);groups+=1){
    const base=Math.floor(total/groups);
    const extra=total%groups;
    const counts=Array.from({length:groups},(_,index)=>base+(index<extra?1:0));
    if(counts.every((count)=>count>=3&&count<=5))return counts;
  }
  return [];
}

async function planExactGroup(input:PagePlannerInput,maxAttempts=3){
  let lastError:unknown;
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    try{
      const result=await planMangaPagesBase(input);
      if(result.nextBeatIndex===input.beats.length)return result;
      lastError=new Error(`Manga page planner consumed ${result.nextBeatIndex}/${input.beats.length} beats in an exact fallback group.`);
    }catch(error){
      lastError=error;
      if(!isSemanticPlannerError(error))throw error;
    }
  }
  throw lastError instanceof Error?lastError:new Error("Manga page planner could not preserve beat order after retrying.");
}

/**
 * Fast path keeps the normal bulk planner. If the model reorders/skips beats,
 * or leaves an unusable 1-2 beat tail, retry deterministically in 3-5 beat
 * groups while carrying continuity forward page by page.
 */
export async function planMangaPagesSafe(input:PagePlannerInput):Promise<MangaPagePlan>{
  const remaining=input.beats.length-input.startBeatIndex;
  if(remaining<3)return planMangaPagesBase(input);

  try{
    const fast=await planMangaPagesBase(input);
    const left=input.beats.length-fast.nextBeatIndex;
    if(left!==1&&left!==2)return fast;
  }catch(error){
    if(!isSemanticPlannerError(error))throw error;
  }

  const remainingBeats=input.beats.slice(input.startBeatIndex);
  const counts=partitionBeatCounts(remainingBeats.length);
  if(!counts.length)throw new Error("Manga page planner could not split the remaining story beats into valid 3-5 panel pages.");

  const pages:MangaPagePlan["pages"]=[];
  let cursor=0;
  let continuityState=input.previousState;
  let pageStartNumber=input.pageStartNumber;
  let provider=`xKiro · ${input.analysisModel}`;

  for(const count of counts){
    const beatGroup=remainingBeats.slice(cursor,cursor+count);
    const groupResult=await planExactGroup({
      ...input,
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

  return {
    pages,
    nextBeatIndex:input.startBeatIndex+cursor,
    continuityState,
    provider
  };
}
