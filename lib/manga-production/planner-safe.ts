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
    storySummary:`${input.storySummary}\n\nPLANNER CONTROL: This is an exact continuity chunk containing ${input.beats.length} supplied beats. Consume ALL supplied beat IDs in order in this response. Use enough 3-5 panel pages to cover every supplied beat exactly once; do not stop after the first page. The full supplied list is the required contiguous prefix.`
  };
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    try{
      const result=await planMangaPagesBase(exactInput);
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
 * Every beat-detail level uses sequential continuity chunks. Page count is
 * derived from the selected density instead of a fixed chapter size. Each
 * chunk normally spans about two pages, then the exact end state is carried
 * into the next chunk so Low, Standard and Highest all preserve continuity.
 */
export async function planMangaPagesSafe(input:AdaptivePagePlannerInput):Promise<MangaPagePlan>{
  const remaining=input.beats.length-input.startBeatIndex;
  const clean=baseInput(input);
  if(remaining<3)return planMangaPagesBase(clean);

  const pacing=input.pacingPreset||"Balanced";
  const counts=partitionPlanningChunkCounts(remaining,pacing);
  if(!counts.length)throw new Error("Manga page planner could not derive adaptive continuity page groups.");
  return planSequentialChunks(input,counts);
}
