import {DEFAULT_STORY_ANALYSIS_MODEL,isStoryAnalysisModel,isVertexStoryAnalysisModel,storyAnalysisProviderLabel,type StoryAnalysisModel} from "./story-analysis-models";
import {hasVertexStoryAnalysis,vertexStoryJsonCompletion} from "./vertex-story";

export const XKIRO_STORY_MODELS=["mistralai/mistral-medium-3.5","mistralai/mistral-large-2512"] as const;
export type XKiroStoryModel=(typeof XKIRO_STORY_MODELS)[number];
export const DEFAULT_XKIRO_STORY_MODEL:XKiroStoryModel="mistralai/mistral-medium-3.5";

export type XKiroFailureCode="not_configured"|"invalid_model"|"unauthorized"|"rate_limited"|"timeout"|"server_error"|"invalid_response"|"empty_response"|"request_failed";

export class XKiroRequestError extends Error{
  constructor(message:string,public readonly code:XKiroFailureCode,public readonly status?:number){super(message);this.name="XKiroRequestError"}
}

const getBaseUrl=()=>process.env.XKIRO_BASE_URL?.replace(/\/$/,"")||"https://api.xkiro.com/v1";
const getApiKey=()=>process.env.XKIRO_API_KEY?.trim()||"";
const getTimeout=()=>{const value=Number(process.env.XKIRO_ANALYZE_TIMEOUT_MS||90000);return Number.isFinite(value)&&value>0?value:90000};

export function hasXKiro(){return Boolean(getApiKey())}
export function hasStoryAnalysisModel(model:StoryAnalysisModel){return isVertexStoryAnalysisModel(model)?hasVertexStoryAnalysis():hasXKiro()}
export function isXKiroStoryModel(value:unknown):value is XKiroStoryModel{return typeof value==="string"&&(XKIRO_STORY_MODELS as readonly string[]).includes(value)}

async function fetchWithTimeout(input:string|URL,init:RequestInit,timeoutMs:number){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(input,{...init,signal:controller.signal})}catch(error){if(error instanceof Error&&error.name==="AbortError")throw new XKiroRequestError(`xKiro request timed out after ${Math.round(timeoutMs/1000)} seconds.`,"timeout",504);throw new XKiroRequestError("xKiro request could not be completed.","request_failed",502)}finally{clearTimeout(timer)}}

function extractBalancedObject(value:string):string|undefined{
  const start=value.indexOf("{");if(start<0)return undefined;
  let depth=0,inString=false,escaped=false;
  for(let index=start;index<value.length;index+=1){
    const char=value[index];
    if(inString){
      if(escaped){escaped=false;continue}
      if(char==="\\"){escaped=true;continue}
      if(char==='"')inString=false;
      continue;
    }
    if(char==='"'){inString=true;continue}
    if(char==="{")depth+=1;
    else if(char==="}"){depth-=1;if(depth===0)return value.slice(start,index+1)}
  }
  return undefined;
}

function repairCommonJson(value:string):string{
  let escapedText="",inString=false,escaped=false;
  for(const char of value){
    if(inString){
      if(escaped){escapedText+=char;escaped=false;continue}
      if(char==="\\"){escapedText+=char;escaped=true;continue}
      if(char==='"'){escapedText+=char;inString=false;continue}
      if(char==="\n"){escapedText+="\\n";continue}
      if(char==="\r"){escapedText+="\\r";continue}
      if(char==="\t"){escapedText+="\\t";continue}
      escapedText+=char;continue;
    }
    if(char==='"')inString=true;
    escapedText+=char;
  }

  let output="";inString=false;escaped=false;
  for(let index=0;index<escapedText.length;index+=1){
    const char=escapedText[index];
    if(inString){output+=char;if(escaped){escaped=false;continue}if(char==="\\"){escaped=true;continue}if(char==='"')inString=false;continue}
    if(char==='"'){inString=true;output+=char;continue}
    if(char===","){
      let next=index+1;while(next<escapedText.length&&/\s/.test(escapedText[next]))next+=1;
      if(escapedText[next]==="}"||escapedText[next]==="]")continue;
    }
    output+=char;
  }
  return output;
}

function closeIncompleteJson(value:string):string{
  let output=value.trim();if(!output)return output;
  const stack:string[]=[];let inString=false,escaped=false;
  for(const char of output){
    if(inString){
      if(escaped){escaped=false;continue}
      if(char==="\\"){escaped=true;continue}
      if(char==='"')inString=false;
      continue;
    }
    if(char==='"'){inString=true;continue}
    if(char==="{"||char==="[")stack.push(char);
    else if(char==="}"||char==="]"){
      const expected=char==="}"?"{":"[";
      if(stack.at(-1)===expected)stack.pop();
    }
  }
  if(inString){if(escaped&&output.endsWith("\\"))output=output.slice(0,-1);output+='"'}
  output=output.trimEnd().replace(/,\s*$/,"");
  if(/:\s*$/.test(output))output+="null";
  while(stack.length)output+=stack.pop()==="{"?"}":"]";
  return output;
}

export function extractFirstJsonObject(value:string){
  const cleaned=value.replace(/^\uFEFF/,"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
  const balanced=extractBalancedObject(cleaned);const start=cleaned.indexOf("{");const raw=balanced??(start>=0?cleaned.slice(start):"");
  if(!raw)throw new XKiroRequestError("xKiro returned malformed JSON.","invalid_response",502);
  const repaired=repairCommonJson(raw);const candidates=balanced?[raw,repaired]:[raw,repaired,closeIncompleteJson(repaired)];
  for(const candidate of candidates){try{return JSON.parse(candidate)}catch{}}
  throw new XKiroRequestError("xKiro returned malformed JSON.","invalid_response",502);
}

function contentText(content:unknown){if(typeof content==="string")return content;if(Array.isArray(content))return content.map((part)=>typeof part==="string"?part:part&&typeof part==="object"&&"text" in part&&typeof (part as {text?:unknown}).text==="string"?(part as {text:string}).text:"").join("");if(content&&typeof content==="object")return JSON.stringify(content);return ""}
function statusError(status:number){if(status===401||status===403)return new XKiroRequestError("xKiro authentication failed. Check the server-side XKIRO_API_KEY.","unauthorized",status);if(status===429)return new XKiroRequestError("xKiro rate limit reached. StoryFrame will try its existing fallback analysis.","rate_limited",status);if(status>=500)return new XKiroRequestError("xKiro is temporarily unavailable. StoryFrame will try its existing fallback analysis.","server_error",status);return new XKiroRequestError(`xKiro request failed with status ${status}.`,"request_failed",status)}

async function parseChatResponse(response:Response){const raw=await response.text();if(!response.ok){console.error("xKiro API error",{status:response.status,body:raw.replace(/\s+/g," ").slice(0,500)});throw statusError(response.status)}let envelope:unknown;try{envelope=JSON.parse(raw)}catch{console.error("xKiro returned non-JSON API envelope",raw.replace(/\s+/g," ").slice(0,500));throw new XKiroRequestError("xKiro returned an invalid API response.","invalid_response",502)}const content=(envelope as {choices?:Array<{message?:{content?:unknown}}>}|null)?.choices?.[0]?.message?.content;const text=contentText(content);if(!text)throw new XKiroRequestError("xKiro returned an empty analysis response.","empty_response",502);return {text,json:extractFirstJsonObject(text)}}

function outputTokenLimit(model:StoryAnalysisModel,requested:number){
  const hardLimit=model==="mistralai/mistral-large-2512"?15000:32000;
  return Math.max(256,Math.min(requested,hardLimit));
}

async function requestJsonCompletion(input:{model:StoryAnalysisModel;systemPrompt:string;userPrompt:string;maxTokens:number;temperature:number}){
  const key=getApiKey();
  const textBudget=input.model==="mistralai/mistral-medium-3.5"?Math.max(input.maxTokens,24000):input.maxTokens;
  const response=await fetchWithTimeout(`${getBaseUrl()}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:input.model,messages:[{role:"system",content:input.systemPrompt},{role:"user",content:input.userPrompt}],temperature:input.temperature,max_tokens:outputTokenLimit(input.model,textBudget),response_format:{type:"json_object"}}),cache:"no-store"},getTimeout());
  return parseChatResponse(response);
}

export async function xkiroJsonCompletion(input:{model:StoryAnalysisModel;systemPrompt:string;userPrompt:string;maxTokens?:number;temperature?:number}){
  if(!isStoryAnalysisModel(input.model))throw new XKiroRequestError("Unsupported story model.","invalid_model",400);
  if(isVertexStoryAnalysisModel(input.model))return vertexStoryJsonCompletion(input);
  const key=getApiKey();if(!key)throw new XKiroRequestError("XKIRO_API_KEY is not configured.","not_configured",503);
  const maxTokens=input.maxTokens??14000;const temperature=input.temperature??0.15;
  try{return await requestJsonCompletion({model:input.model,systemPrompt:input.systemPrompt,userPrompt:input.userPrompt,maxTokens,temperature})}
  catch(error){
    if(!(error instanceof XKiroRequestError)||error.code!=="invalid_response")throw error;
    console.warn("xKiro returned malformed structured output; retrying once with stricter JSON instructions.");
    const retryPrompt=`${input.userPrompt}\n\nSTRICT JSON RETRY: Return exactly ONE complete valid JSON object and nothing else. Do not use markdown fences. Escape quotes and line breaks inside string values. Do not use trailing commas. Close every array and object. If space is limited, make descriptions shorter rather than truncating the JSON.`;
    return requestJsonCompletion({model:input.model,systemPrompt:input.systemPrompt,userPrompt:retryPrompt,maxTokens,temperature:Math.min(temperature,0.03)});
  }
}

export async function xkiroVisionJsonCompletion(input:{model:StoryAnalysisModel;systemPrompt:string;userPrompt:string;images:string[];maxTokens?:number;temperature?:number}){
  if(isVertexStoryAnalysisModel(input.model))throw new XKiroRequestError("Gemini 3.1 Pro is connected for story analysis; visual QA still uses an xKiro vision model.","invalid_model",400);
  const key=getApiKey();if(!key)throw new XKiroRequestError("XKIRO_API_KEY is not configured.","not_configured",503);if(!isXKiroStoryModel(input.model))throw new XKiroRequestError("Unsupported xKiro vision model.","invalid_model",400);
  const images=input.images.filter(Boolean).slice(0,3);
  if(!images.length)throw new XKiroRequestError("Panel QA requires at least one image.","invalid_response",400);
  const content=[...images.map((url)=>({type:"image_url" as const,image_url:{url}})),{type:"text" as const,text:input.userPrompt}];
  const response=await fetchWithTimeout(`${getBaseUrl()}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:input.model,messages:[{role:"system",content:input.systemPrompt},{role:"user",content}],temperature:input.temperature??0,max_tokens:outputTokenLimit(input.model,input.maxTokens??1800),response_format:{type:"json_object"}}),cache:"no-store"},getTimeout());
  return parseChatResponse(response);
}

export async function xkiroAnalyzeStory(input:{story:string;visualStyle:string;model:StoryAnalysisModel}){const words=input.story.trim().split(/\s+/).filter(Boolean).length;const targetScenes=Math.min(60,Math.max(4,Math.ceil(words/60)));const system=`You are StoryFrame AI, an expert visual story director and storyboard prompt writer. Return STRICT valid JSON only, never markdown or commentary. Preserve source chronology and facts; do not invent major plot events. Output exactly these top-level keys: summary, characters, locations, scenes. characters[] fields: name, role, appearance, outfit, consistencyNotes. locations[] fields: name, architecture, lighting, continuity. scenes[] fields: sourceText, description, characterNames, locationName, cameraShot, cameraAngle, duration, imagePrompt, negativePrompt, continuityNotes. Break the story into meaningful visual beats. Character descriptions must be reusable and consistent. Location descriptions must preserve reusable layout, architecture, props and lighting. imagePrompt must always be in English and standalone usable. Never request captions, subtitles, logos, watermarks or speech bubbles.`;const user=`Visual style: ${input.visualStyle}\nScene budget: approximately ${targetScenes}; actual story beats are more important, maximum 60 scenes.\n\nStory:\n${input.story}`;const result=await xkiroJsonCompletion({model:input.model,systemPrompt:system,userPrompt:user,temperature:0.15,maxTokens:14000});return {raw:result.text,json:result.json,provider:isVertexStoryAnalysisModel(input.model)?"vertex-ai":"xkiro",providerLabel:storyAnalysisProviderLabel(input.model),model:input.model}}
