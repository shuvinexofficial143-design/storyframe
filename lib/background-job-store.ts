export type BackgroundJobStatus="queued"|"running"|"waiting"|"completed"|"failed"|"cancelled";

export type BackgroundJob<TPayload=unknown,TResult=unknown>={
  id:string;
  status:BackgroundJobStatus;
  phase:"master"|"pages"|"complete";
  progress:string;
  createdAt:string;
  updatedAt:string;
  attempts:number;
  payload:TPayload;
  result?:TResult;
  error?:string;
};

const prefix="storyframe:bg:";
const ttlSeconds=24*60*60;

function redisUrl(){return (process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL||"").replace(/\/$/,"")}
function redisToken(){return process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN||""}

export function backgroundRedisConfigured(){return Boolean(redisUrl()&&redisToken())}

async function command(args:Array<string|number>){
  const url=redisUrl(),token=redisToken();
  if(!url||!token)throw new Error("Background Redis is not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel.");
  const response=await fetch(url,{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify(args),
    cache:"no-store"
  });
  const body=await response.json().catch(()=>null) as {result?:unknown;error?:string}|null;
  if(!response.ok||body?.error)throw new Error(`Background Redis request failed (${response.status})${body?.error?`: ${body.error}`:""}`);
  return body?.result;
}

export async function putBackgroundJob(job:BackgroundJob){
  await command(["SET",prefix+job.id,JSON.stringify(job),"EX",ttlSeconds]);
}

export async function getBackgroundJob<TPayload=unknown,TResult=unknown>(id:string):Promise<BackgroundJob<TPayload,TResult>|null>{
  const value=await command(["GET",prefix+id]);
  if(typeof value!=="string"||!value)return null;
  try{return JSON.parse(value) as BackgroundJob<TPayload,TResult>}catch{return null}
}

export async function deleteBackgroundJob(id:string){
  await command(["DEL",prefix+id]);
}
