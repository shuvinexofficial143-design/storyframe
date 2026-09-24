export const DEFAULT_IMAGE_REQUEST_INTERVAL_MS=10_000;
export const IMAGE_TRANSIENT_BACKOFF_MS=[4_000,8_000] as const;
export const IMAGE_QUOTA_RETRY_MS=12_000;

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

function serverRetryDelay(payload:unknown,fallback:number){
  if(payload&&typeof payload==="object"){
    const retryAfterMs=(payload as {retryAfterMs?:unknown}).retryAfterMs;
    if(typeof retryAfterMs==="number"&&Number.isFinite(retryAfterMs))return Math.max(1_000,Math.min(15_000,retryAfterMs));
  }
  return fallback;
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
  url:string;body:unknown;label:string;onStatus?:(message:string)=>void;minIntervalMs?:number;signal?:AbortSignal;
}){
  return runQueued(async()=>{
    const minInterval=Math.max(0,input.minIntervalMs??DEFAULT_IMAGE_REQUEST_INTERVAL_MS);
    let transientAttempt=0;
    let quotaRetried=false;

    while(true){
      const gap=Math.max(0,minInterval-(Date.now()-lastImageRequestStartedAt));
      if(gap>0){
        input.onStatus?.(`${input.label}: waiting ${Math.ceil(gap/1000)}s for the next image request slot…`);
        await sleep(gap,input.signal);
      }

      lastImageRequestStartedAt=Date.now();
      input.onStatus?.(`${input.label}: sending image request…`);
      throwIfAborted(input.signal);
      const response=await fetch(input.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input.body),signal:input.signal});
      const text=await response.text();
      const payload=parsePayload(text);
      if(response.ok)return payload as T;

      const message=errorMessage(payload,response.status);
      if(response.status===429){
        if(quotaRetried)throw new Error(`${message} Automatic retry stopped after one quota retry. Wait for Google Vertex AI quota to recover, then run Generate All Pages again; completed pages are kept.`);
        quotaRetried=true;
        const waitMs=serverRetryDelay(payload,IMAGE_QUOTA_RETRY_MS);
        input.onStatus?.(`${input.label}: Google Vertex AI quota is temporarily exhausted. One retry in ${Math.ceil(waitMs/1000)}s; completed pages are safe…`);
        await sleep(waitMs,input.signal);
        continue;
      }

      const retryable=response.status===500||response.status===502||response.status===503||response.status===504;
      if(!retryable||transientAttempt>=IMAGE_TRANSIENT_BACKOFF_MS.length)throw new Error(message);
      const waitMs=serverRetryDelay(payload,IMAGE_TRANSIENT_BACKOFF_MS[transientAttempt]);
      transientAttempt+=1;
      input.onStatus?.(`${input.label}: temporary provider error. Retrying in ${Math.ceil(waitMs/1000)}s (${transientAttempt}/${IMAGE_TRANSIENT_BACKOFF_MS.length})…`);
      await sleep(waitMs,input.signal);
    }
  },input.signal);
}
