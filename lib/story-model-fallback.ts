import {isVertexStoryAnalysisModel,type StoryAnalysisModel} from "./story-analysis-models";
import {hasXKiro} from "./xkiro";

export const STORY_ANALYSIS_FALLBACK_MODEL:StoryAnalysisModel="mistralai/mistral-large-2512";

export function isRetryableVertexStoryFailure(error:unknown){
  if(!(error instanceof Error))return false;
  const message=error.message.toLowerCase();
  return /\b429\b|resource exhausted|quota|rate limit|too many requests|temporar(?:y|ily) unavailable|\b50[0234]\b|timed out|timeout|malformed json|empty story analysis response|full 65k output budget/.test(message);
}

export async function withStoryModelFallback<T>(input:{
  model:StoryAnalysisModel;
  run:(model:StoryAnalysisModel)=>Promise<T>;
}){
  try{
    return {data:await input.run(input.model),model:input.model,fallbackUsed:false};
  }catch(error){
    if(!isVertexStoryAnalysisModel(input.model)||!isRetryableVertexStoryFailure(error)||!hasXKiro())throw error;
    console.warn("Vertex story model temporarily unavailable; retrying with xKiro fallback.",{primaryModel:input.model,fallbackModel:STORY_ANALYSIS_FALLBACK_MODEL,error:error instanceof Error?error.message:String(error)});
    return {data:await input.run(STORY_ANALYSIS_FALLBACK_MODEL),model:STORY_ANALYSIS_FALLBACK_MODEL,fallbackUsed:true};
  }
}
