import {createSign} from "node:crypto";
import {isVertexStoryAnalysisModel,vertexStoryModelId,type StoryAnalysisModel} from "./story-analysis-models";

type ServiceAccount={project_id?:string;client_email:string;private_key:string;token_uri?:string};
type VertexCompletionInput={model:StoryAnalysisModel;systemPrompt:string;userPrompt:string;maxTokens?:number;temperature?:number};

const GOOGLE_SCOPE="https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TOKEN_URL="https://oauth2.googleapis.com/token";
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
  const response=await fetch(account.token_uri||GOOGLE_TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth2-grant-type:jwt-bearer",assertion}),cache:"no-store"});
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

function responseText(payload:unknown){
  const data=payload as {candidates?:Array<{content?:{parts?:Array<{text?:unknown;thought?:unknown}>}}>};
  const parts=data.candidates?.[0]?.content?.parts||[];
  return parts.filter((part)=>part.thought!==true&&typeof part.text==="string").map((part)=>part.text as string).join("").trim();
}

function parseJsonObject(value:string){
  const cleaned=value.replace(/^\uFEFF/,"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
  try{return JSON.parse(cleaned)}catch{}
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start>=0&&end>start){
    const slice=cleaned.slice(start,end+1).replace(/,\s*([}\]])/g,"$1");
    try{return JSON.parse(slice)}catch{}
  }
  throw new Error("Vertex Gemini returned malformed JSON.");
}

export function hasVertexStoryAnalysis(){return Boolean(projectId()&&(parseServiceAccount()||apiKey()))}

export async function vertexStoryJsonCompletion(input:VertexCompletionInput){
  if(!isVertexStoryAnalysisModel(input.model))throw new Error("Unsupported Vertex story analysis model.");
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
    contents:[{role:"user",parts:[{text:input.userPrompt}]}],
    generationConfig:{
      temperature:input.temperature??0.12,
      maxOutputTokens:Math.max(1024,Math.min(input.maxTokens??14000,32768)),
      responseMimeType:"application/json",
      thinkingConfig:{thinkingLevel:"HIGH"}
    }
  };

  const response=await fetchWithTimeout(url.toString(),{method:"POST",headers,body:JSON.stringify(body),cache:"no-store"});
  const raw=await response.text();
  if(!response.ok){
    let message=raw.replace(/\s+/g," ").slice(0,700);
    try{const parsed=JSON.parse(raw) as {error?:{message?:string}};message=parsed.error?.message||message}catch{}
    throw new Error(`Vertex Gemini story request failed (${response.status})${message?`: ${message}`:""}`);
  }
  let payload:unknown;
  try{payload=JSON.parse(raw)}catch{throw new Error("Vertex Gemini returned an invalid API response.")}
  const text=responseText(payload);
  if(!text)throw new Error("Vertex Gemini returned an empty story analysis response.");
  return {text,json:parseJsonObject(text)};
}
