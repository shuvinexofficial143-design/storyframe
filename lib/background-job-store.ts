import {mongoConfigured,mongoDb} from "./mongodb";

export type BackgroundJobStatus="queued"|"running"|"waiting"|"completed"|"failed"|"cancelled";

export type BackgroundJob<TPayload=unknown,TResult=unknown>={
  id:string;
  status:BackgroundJobStatus;
  phase:"master"|"pages"|"images"|"complete";
  progress:string;
  createdAt:string;
  updatedAt:string;
  attempts:number;
  payload:TPayload;
  result?:TResult;
  error?:string;
};

const COLLECTION="background_jobs";
const TTL_MS=24*60*60*1000;

declare global {
  // eslint-disable-next-line no-var
  var __storyframeBackgroundJobsIndexPromise:Promise<unknown>|undefined;
}

export function backgroundJobStoreConfigured(){return mongoConfigured()}

async function collection(){
  if(!mongoConfigured())throw new Error("Background job storage is not configured. Add MONGODB_URI in Vercel.");
  const db=await mongoDb();
  const jobs=db.collection(COLLECTION);
  if(!global.__storyframeBackgroundJobsIndexPromise){
    global.__storyframeBackgroundJobsIndexPromise=jobs.createIndex({expiresAt:1},{expireAfterSeconds:0,name:"background_jobs_expiry"}).catch((error)=>{
      global.__storyframeBackgroundJobsIndexPromise=undefined;
      throw error;
    });
  }
  await global.__storyframeBackgroundJobsIndexPromise;
  return jobs;
}

function expiry(){return new Date(Date.now()+TTL_MS)}

export async function putBackgroundJob(job:BackgroundJob){
  const jobs=await collection();
  await jobs.replaceOne(
    {id:job.id},
    {...job,expiresAt:expiry()},
    {upsert:true}
  );
}

export async function getBackgroundJob<TPayload=unknown,TResult=unknown>(id:string):Promise<BackgroundJob<TPayload,TResult>|null>{
  const jobs=await collection();
  const value=await jobs.findOne({id});
  if(!value)return null;
  const {expiresAt:_expiresAt,_id,...job}=value as Record<string,unknown>;
  return job as unknown as BackgroundJob<TPayload,TResult>;
}

export async function deleteBackgroundJob(id:string){
  const jobs=await collection();
  await jobs.deleteOne({id});
}
