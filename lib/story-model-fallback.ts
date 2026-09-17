import {isVertexStoryAnalysisModel,type StoryAnalysisModel} from "./story-analysis-models";
import {hasXKiro} from "./xkiro";

export const STORY_ANALYSIS_FALLBACK_MODEL:StoryAnalysisModel="mistralai/mistral-large-2512";
export const VERTEX_STORY_RETRY_DELAYS_MS=[2_000,5_000] as const;

export function isRetryableVertexStoryFailure(error:unknown){
  if(!(error instanceof Error))return false;
  const message=error.message.toLowerCase();
  return /\b429\b|resource exhausted|quota|rate limit|too many requests|temporar(?:y|ily) unavailable|\b50[0234]\b|timed out|timeout|malformed json|empty story analysis response|full 65k output budget/.test(message);
}

const defaultSleep=(ms:number)=>new Promise<void>((resolve)=>setTimeout(resolve,ms));

export async function withStoryModelFallback<T>(input:{
  model:StoryAnalysisModel;
  run:(model:StoryAnalysisModel)=>Promise<T>;
  sleep?:(ms:number)=>Promise<void>;
  retryDelaysMs?:readonly number[];
}){
  try{
    return {data:await input.run(input.model),model:input.model,fallbackUsed:false};
  }catch(firstError){
    if(!isVertexStoryAnalysisModel(input.model)||!isRetryableVertexStoryFailure(firstError))throw firstError;

    const sleep=input.sleep||defaultSleep;
    const retryDelays=input.retryDelaysMs??VERTEX_STORY_RETRY_DELAYS_MS;
    let lastError:unknown=firstError;

    for(const delayMs of retryDelays){
      console.warn("Vertex story model temporarily unavailable; retrying primary model after backoff.",{primaryModel:input.model,delayMs,error:lastError instanceof Error?lastError.message:String(lastError)});
      await sleep(delayMs);
      try{
        return {data:await input.run(input.model),model:input.model,fallbackUsed:false};
      }catch(error){
        lastError=error;
        if(!isRetryableVertexStoryFailure(error))throw error;
      }
    }

    if(!hasXKiro())throw lastError;
    console.warn("Vertex story model still unavailable after backoff; using xKiro fallback.",{primaryModel:input.model,fallbackModel:STORY_ANALYSIS_FALLBACK_MODEL,error:lastError instanceof Error?lastError.message:String(lastError)});
    return {data:await input.run(STORY_ANALYSIS_FALLBACK_MODEL),model:STORY_ANALYSIS_FALLBACK_MODEL,fallbackUsed:true};
  }
}
