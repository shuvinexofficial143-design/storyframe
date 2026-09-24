import {createSign} from "node:crypto";
import {isVertexStoryAnalysisModel,vertexStoryModelId,type StoryAnalysisModel} from "./story-analysis-models";

type ServiceAccount={project_id?:string;client_email:string;private_key:string;token_uri?:string};
type VertexCompletionInput={model:StoryAnalysisModel;systemPrompt:string;userPrompt:string;maxTokens?:number;temperature?:number};
type VertexPayload={candidates?:Array<{finishReason?:string;content?:{parts?:Array<{text?:unknown;thought?:unknown}>}}>};

const GOOGLE_SCOPE="https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TOKEN_URL="https://oauth2.googleapis.com/token";
const GEMINI_31_PRO_MAX_OUTPUT_TOKENS=65536;
let tokenCache:{accessToken:string;expiresAt:number}|null=null;

function parseServiceAccount():ServiceAccount|null{
  const direct=process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON?.trim();
  const encoded=process.env.VERTEX_AI_SERVICE_ACCOUNT_BASE64?.trim();
  const raw=direct||(encoded?Buffer.from(encoded,"base64").toString("utf8"):"");
  if(!raw)return null;
  try{
    const parsed=JSON.parse(raw) as Partial<ServiceAccount>;
    if(!parsed.client_email||!parsed.private_key)return null;
    return parsed as ServiceAccount;
  }catch{return null}
}

function projectId(){return process.env.VERTEX_AI_PROJECT_ID?.trim()||process.env.GOOGLE_CLOUD_PROJECT_ID?.trim()||process.env.GOOGLE_CLOUD_PROJECT?.trim()||parseServiceAccount()?.project_id?.trim()||""}
function location(){return process.env.VERTEX_AI_LOCATION?.trim()||process.env.GOOGLE_CLOUD_LOCATION?.trim()||"global"}
function apiKey(){return process.env.VERTEX_AI_API_KEY?.trim()||process.env.GOOGLE_CLOUD_API_KEY?.trim()||process.env.GEMINI_API_KEY?.trim()||""}
function timeoutMs(){const value=Number(process.env.VERTEX_STORY_TIMEOUT_MS||120000);return Number.isFinite(value)&&value>0?value:120000}
function base64url(value:string|Buffer){const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,"utf8");return bytes.toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}

async function serviceAccountAccessToken(account:ServiceAccount){
  const now=Math.floor(Date.now()/1000);
  if(tokenCache&&tokenCache.expiresAt>now+90)return tokenCache.accessToken;
  const header=base64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const payload=base64url(JSON.stringify({iss:account.client_email,scope:GOOGLE_SCOPE,aud:account.token_uri||GOOGLE_TOKEN_URL,iat:now,exp:now+3600}));
  const unsigned=`${header}.${payload}`;
  const signer=createSign("RSA-SHA256");signer.update(unsigned);signer.end();
  const assertion=`${unsigned}.${base64url(signer.sign(account.private_key))}`;
  const response=await fetch(account.token_uri||GOOGLE_TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),cache:"no-store"});
  const data=await response.json().catch(()=>null) as {access_token?:string;expires_in?:number;error_description?:string}|null;
  if(!response.ok||!data?.access_token)throw new Error(`Vertex AI service-account authentication failed (${response.status})${data?.error_description?`: ${data.error_description}`:""}`);
  tokenCache={accessToken:data.access_token,expiresAt:now+(data.expires_in||3600)};
  return data.access_token;
}

function endpoint(model:string){
  const region=location();
  const host=region==="global"?"aiplatform.googleapis.com":`${region}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(projectId())}/locations/${encodeURIComponent(region)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

async function fetchWithTimeout(url:string,init:RequestInit){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs());
  try{return await fetch(url,{...init,signal:controller.signal})}
  catch(error){if(error instanceof Error&&error.name==="AbortError")throw new Error(`Vertex Gemini story analysis timed out after ${Math.round(timeoutMs()/1000)} seconds.`);throw error}
  finally{clearTimeout(timer)}
}

function responseText(payload:VertexPayload){
  const parts=payload.candidates?.[0]?.content?.parts||[];
  return parts.filter((part)=>part.thought!==true&&typeof part.text==="string").map((part)=>part.text as string).join("").trim();
}

function repairCommonJson(value:string){
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

function extractBalancedObject(value:string){
  const start=value.indexOf("{");if(start<0)return undefined;
  let depth=0,inString=false,escaped=false;
  for(let index=start;index<value.length;index+=1){
    const char=value[index];
    if(inString){if(escaped){escaped=false;continue}if(char==="\\"){escaped=true;continue}if(char==='"')inString=false;continue}
    if(char==='"'){inString=true;continue}
    if(char==="{")depth+=1;
    else if(char==="}"){depth-=1;if(depth===0)return value.slice(start,index+1)}
  }
  return undefined;
}

function closeIncompleteJson(value:string){
  let output=value.trim();if(!output)return output;
  const stack:string[]=[];let inString=false,escaped=false;
  for(const char of output){
    if(inString){if(escaped){escaped=false;continue}if(char==="\\"){escaped=true;continue}if(char==='"')inString=false;continue}
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

export function parseVertexJsonObject(value:string){
  const cleaned=value.replace(/^\uFEFF/,"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
  const balanced=extractBalancedObject(cleaned);
  const start=cleaned.indexOf("{");
  const raw=balanced??(start>=0?cleaned.slice(start):cleaned);
  const repaired=repairCommonJson(raw);
  const candidates=[cleaned,raw,repaired,closeIncompleteJson(repaired)].filter((item,index,all)=>item&&all.indexOf(item)===index);
  for(const candidate of candidates){try{return JSON.parse(candidate)}catch{}}
  throw new Error("Vertex Gemini returned malformed JSON.");
}

export function hasVertexStoryAnalysis(){return Boolean(projectId()&&(parseServiceAccount()||apiKey()))}

async function requestOnce(input:VertexCompletionInput,userPrompt:string,maxOutputTokens:number,thinkingLevel:"HIGH"|"MEDIUM"){
  const project=projectId();
  const account=parseServiceAccount();
  const key=apiKey();
  if(!project)throw new Error("Vertex AI story analysis is not configured. Add VERTEX_AI_PROJECT_ID in Vercel Environment Variables.");
  if(!account&&!key)throw new Error("Vertex AI story analysis is not configured. Add VERTEX_AI_SERVICE_ACCOUNT_JSON (recommended) or VERTEX_AI_API_KEY in Vercel Environment Variables.");

  const url=new URL(endpoint(vertexStoryModelId(input.model)));
  const headers:Record<string,string>={"Content-Type":"application/json; charset=utf-8"};
  if(account)headers.Authorization=`Bearer ${await serviceAccountAccessToken(account)}`;
  else url.searchParams.set("key",key);

  const body={
    systemInstruction:{parts:[{text:input.systemPrompt}]},
    contents:[{role:"user",parts:[{text:userPrompt}]}],
    generationConfig:{
      temperature:input.temperature??0.12,
      maxOutputTokens:Math.max(1024,Math.min(maxOutputTokens,GEMINI_31_PRO_MAX_OUTPUT_TOKENS)),
      responseMimeType:"application/json",
      thinkingConfig:{thinkingLevel}
    }
  };

  const response=await fetchWithTimeout(url.toString(),{method:"POST",headers,body:JSON.stringify(body),cache:"no-store"});
  const raw=await response.text();
  if(!response.ok){
    let message=raw.replace(/\s+/g," ").slice(0,700);
    try{const parsed=JSON.parse(raw) as {error?:{message?:string}};message=parsed.error?.message||message}catch{}
    throw new Error(`Vertex Gemini story request failed (${response.status})${message?`: ${message}`:""}`);
  }
  let payload:VertexPayload;
  try{payload=JSON.parse(raw) as VertexPayload}catch{throw new Error("Vertex Gemini returned an invalid API response.")}
  const text=responseText(payload);
  return {text,finishReason:payload.candidates?.[0]?.finishReason||""};
}

export async function vertexStoryJsonCompletion(input:VertexCompletionInput){
  if(!isVertexStoryAnalysisModel(input.model))throw new Error("Unsupported Vertex story analysis model.");

  // Page planning is mostly deterministic formatting, so MEDIUM thinking is faster and leaves
  // more output budget for the large JSON. Master/global story analysis keeps HIGH reasoning.
  const pageLike=/Page Planner|Beat Director|Long-Story Director/i.test(input.systemPrompt);
  const firstThinking=pageLike?"MEDIUM" as const:"HIGH" as const;
  const requested=input.maxTokens??14000;
  const firstBudget=Math.max(requested,32768);
  const first=await requestOnce(input,input.userPrompt,firstBudget,firstThinking);

  if(first.text&&first.finishReason!=="MAX_TOKENS"){
    try{return {text:first.text,json:parseVertexJsonObject(first.text)}}catch(error){
      if(!(error instanceof Error)||!error.message.includes("malformed JSON"))throw error;
    }
  }

  const recoveryReason=!first.text?"empty_response":(first.finishReason||"parse_error");
  console.warn("Vertex Gemini returned empty, truncated or malformed structured output; retrying immediately with full output budget and MEDIUM thinking.",{finishReason:recoveryReason});
  const retryPrompt=`${input.userPrompt}\n\nSTRICT JSON RECOVERY RETRY: Return exactly ONE COMPLETE valid JSON object and nothing else. Do not use markdown fences. Preserve every requested story beat and its order. Keep descriptions concise enough to finish the entire object. Escape quotes and line breaks inside strings. Do not use trailing commas. Close every array and object. Never stop mid-JSON. IMPORTANT: produce the final JSON response directly; do not spend the response budget on hidden reasoning.`;
  const retry=await requestOnce({...input,temperature:Math.min(input.temperature??0.12,0.03)},retryPrompt,GEMINI_31_PRO_MAX_OUTPUT_TOKENS,"MEDIUM");
  if(!retry.text){
    throw new Error(`Vertex Gemini returned an empty story analysis response twice (finish reason: ${retry.finishReason||"unknown"}). Please retry; StoryFrame already performed an immediate full-budget recovery attempt.`);
  }
  if(retry.finishReason==="MAX_TOKENS")throw new Error("Vertex Gemini structured output exceeded the full 65K output budget. StoryFrame should split this planning step into smaller chunks.");
  return {text:retry.text,json:parseVertexJsonObject(retry.text)};
}
