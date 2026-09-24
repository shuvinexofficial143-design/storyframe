export const DEFAULT_IMAGE_REQUEST_INTERVAL_MS=10_000;
export const IMAGE_QUOTA_BACKOFF_MS=[10_000,20_000,40_000,60_000,90_000] as const;

let lastImageRequestStartedAt=0;
let queueTail:Promise<void>=Promise.resolve();

const abortError=()=>new DOMException("Request cancelled","AbortError");
const throwIfAborted=(signal?:AbortSignal)=>{if(signal?.aborted)throw abortError()};
const sleep=(ms:number,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  throwIfAborted(signal);
  const timer=setTimeout(()=>{signal?.removeEventListener("abort",onAbort);resolve()},ms);
  const onAbort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",onAbort);reject(abortError())};
  signal?.addEventListener("abort",onAbort,{once:true});
});

function parsePayload(text:string){
  if(!text)return null;
  try{return JSON.parse(text) as unknown}catch{return {error:text.replace(/\s+/g," ").slice(0,300)}}
}

function errorMessage(payload:unknown,status:number){
  if(payload&&typeof payload==="object"){
    const value=payload as {error?:unknown;message?:unknown};
    if(typeof value.error==="string"&&value.error)return value.error;
    if(typeof value.message==="string"&&value.message)return value.message;
  }
  return `Image request failed with status ${status}`;
}

function retryDelay(payload:unknown,attempt:number){
  if(payload&&typeof payload==="object"){
    const retryAfterMs=(payload as {retryAfterMs?:unknown}).retryAfterMs;
    if(typeof retryAfterMs==="number"&&Number.isFinite(retryAfterMs))return Math.max(1_000,Math.min(90_000,retryAfterMs));
  }
  const base=IMAGE_QUOTA_BACKOFF_MS[Math.min(attempt,IMAGE_QUOTA_BACKOFF_MS.length-1)];
  const jitter=Math.floor(Math.random()*Math.min(1_000,Math.max(250,base*.25)));
  return base+jitter;
}

async function runQueued<T>(work:()=>Promise<T>,signal?:AbortSignal){
  let release:()=>void=()=>{};
  const previous=queueTail;
  queueTail=new Promise<void>((resolve)=>{release=resolve});
  await previous.catch(()=>{});
  throwIfAborted(signal);
  try{return await work()}finally{release()}
}

export function requestQueuedMangaImage<T>(input:{
  url:string;
  body:unknown;
  label:string;
  onStatus?:(message:string)=>void;
  minIntervalMs?:number;
  signal?:AbortSignal;
}){
  return runQueued(async()=>{
    const minInterval=Math.max(0,input.minIntervalMs??DEFAULT_IMAGE_REQUEST_INTERVAL_MS);
    let lastError="Image request failed";

    for(let attempt=0;attempt<=IMAGE_QUOTA_BACKOFF_MS.length;attempt+=1){
      const gap=Math.max(0,minInterval-(Date.now()-lastImageRequestStartedAt));
      if(gap>0){
        input.onStatus?.(`${input.label}: waiting ${Math.ceil(gap/1000)}s for the Gemini image request slot…`);
        await sleep(gap,input.signal);
      }

      lastImageRequestStartedAt=Date.now();
      input.onStatus?.(`${input.label}: sending one image request…`);
      throwIfAborted(input.signal);
      const response=await fetch(input.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input.body),signal:input.signal});
      const text=await response.text();
      const payload=parsePayload(text);
      if(response.ok)return payload as T;

      lastError=errorMessage(payload,response.status);
      const retryable=response.status===429||response.status===500||response.status===502||response.status===503||response.status===504;
      if(!retryable||attempt>=IMAGE_QUOTA_BACKOFF_MS.length)throw new Error(lastError);

      const waitMs=retryDelay(payload,attempt);
      const reason=lastError.replace(/\s+/g," ").slice(0,220);
      input.onStatus?.(`${input.label}: request temporarily rejected. ${reason} Waiting ${Math.ceil(waitMs/1000)}s before retry…`);
      await sleep(waitMs,input.signal);
    }

    throw new Error(lastError);
  },input.signal);
}
