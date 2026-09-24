import {isVertexStoryAnalysisModel,type StoryAnalysisModel} from "./story-analysis-models";

export const VERTEX_STORY_RETRY_DELAYS_MS=[6_000,12_000,24_000] as const;

export function isRetryableVertexStoryFailure(error:unknown){
  if(!(error instanceof Error))return false;
  const message=error.message.toLowerCase();
  return /\b429\b|resource exhausted|quota|rate limit|too many requests|temporar(?:y|ily) unavailable|\b50[0234]\b|timed out|timeout|malformed json|empty story analysis response|no visible story json|empty_response|candidates:\s*0|full 65k output budget/.test(message);
}

export function isVertexRateLimitFailure(error:unknown){
  if(!(error instanceof Error))return false;
  const message=error.message.toLowerCase();
  return /\b429\b|resource exhausted|quota|rate limit|too many requests|temporar(?:y|ily) unavailable|\b50[0234]\b/.test(message);
}

export function isVertexTimeoutFailure(error:unknown){
  if(!(error instanceof Error))return false;
  return /timed out|timeout/.test(error.message.toLowerCase());
}

const defaultSleep=(ms:number)=>new Promise<void>((resolve)=>{
  const jitter=Math.floor(Math.random()*Math.min(1_500,Math.max(300,ms*.15)));
  setTimeout(resolve,ms+jitter);
});

export async function withStoryModelFallback<T>(input:{
  model:StoryAnalysisModel;
  run:(model:StoryAnalysisModel)=>Promise<T>;
  sleep?:(ms:number)=>Promise<void>;
  retryDelaysMs?:readonly number[];
  retryOnlyRateLimit?:boolean;
}){
  try{
    return {data:await input.run(input.model),model:input.model,fallbackUsed:false};
  }catch(firstError){
    if(!isVertexStoryAnalysisModel(input.model)||!isRetryableVertexStoryFailure(firstError))throw firstError;

    const sleep=input.sleep||defaultSleep;
    const retryDelays=input.retryDelaysMs??VERTEX_STORY_RETRY_DELAYS_MS;
    let lastError:unknown=firstError;

    for(let index=0;index<retryDelays.length;index+=1){
      if(input.retryOnlyRateLimit&&!isVertexRateLimitFailure(lastError))break;
      if(isVertexTimeoutFailure(lastError)&&index>0)break;

      const delayMs=retryDelays[index];
      console.warn("Vertex Gemini temporarily unavailable; retrying the SAME Gemini model after adaptive backoff.",{
        model:input.model,delayMs,error:lastError instanceof Error?lastError.message:String(lastError)
      });
      await sleep(delayMs);
      try{
        return {data:await input.run(input.model),model:input.model,fallbackUsed:false};
      }catch(error){
        lastError=error;
        if(!isRetryableVertexStoryFailure(error))throw error;
      }
    }

    throw lastError;
  }
}
