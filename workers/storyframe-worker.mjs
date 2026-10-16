/**
 * Durable StoryFrame worker. Run on a persistent VPS/Cloud Run worker, NOT inside a browser.
 * Required: STORYFRAME_BASE_URL, STORYFRAME_PIPELINE_TOKEN, MONGODB_URI.
 * Optional: MONGODB_DATABASE, WORKER_POLL_MS, WORKER_ID.
 *
 * The pipeline intentionally stops at an explicit "render_pending" checkpoint:
 * the existing browser-only video renderer cannot be used headlessly. Never
 * report a completed video until a server-side renderer is integrated.
 */
import {MongoClient} from "mongodb";
import {randomUUID} from "node:crypto";

const required=(name)=>{const value=process.env[name];if(!value)throw new Error(`Missing ${name}`);return value};
const base=required("STORYFRAME_BASE_URL").replace(/\/$/,"");
const token=required("STORYFRAME_PIPELINE_TOKEN");
const mongo=new MongoClient(required("MONGODB_URI"),{maxPoolSize:4});
const dbName=process.env.MONGODB_DATABASE||"storyframe";
const workerId=process.env.WORKER_ID||randomUUID();
const pollMs=Math.max(1000,Number(process.env.WORKER_POLL_MS)||5000);
const leaseMs=120000;
let stopping=false;
process.on("SIGTERM",()=>{stopping=true});
process.on("SIGINT",()=>{stopping=true});
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(path,payload){
  const response=await fetch(base+path,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${token}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(280000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(body).slice(0,400)}`);
  return body;
}
async function main(){
  await mongo.connect();
  const db=mongo.db(dbName),jobs=db.collection("pipeline_jobs"),assets=db.collection("pipeline_assets"),events=db.collection("pipeline_events");
  await jobs.createIndex({status:1,leaseUntil:1,createdAt:1});
  await assets.createIndex({jobId:1,stepId:1},{unique:true});
  console.log("StoryFrame worker ready",workerId);
  while(!stopping){
    const now=new Date();
    const job=await jobs.findOneAndUpdate({
      $or:[{status:"queued"},{status:"running",leaseUntil:{$lt:now}}],
      attempts:{$lt:5}
    },{$set:{status:"running",workerId,leaseUntil:new Date(Date.now()+leaseMs),updatedAt:now},$inc:{attempts:1}},
    {sort:{createdAt:1},returnDocument:"after"});
    if(!job){await sleep(pollMs);continue}
    const id=job.jobId;
    let heartbeat;
    const progress=async(phase,message,completed=0,total=0)=> {
      await jobs.updateOne({jobId:id,workerId,status:"running"},{$set:{phase,message,completed,total,updatedAt:new Date()}});
      await events.insertOne({jobId:id,phase,message,completed,total,createdAt:new Date()});
    };
    const checkpoint=async(stepId,produce)=>{
      const existing=await assets.findOne({jobId:id,stepId});
      if(existing)return existing.result;
      const result=await produce();
      await assets.updateOne({jobId:id,stepId},{$setOnInsert:{jobId:id,stepId,result,createdAt:new Date()}},{upsert:true});
      return result;
    };
    try{
      heartbeat=setInterval(()=>{jobs.updateOne({jobId:id,workerId,status:"running"},{$set:{leaseUntil:new Date(Date.now()+leaseMs),updatedAt:new Date()}}).catch(console.error)},30000);
      await progress("analysis","Analyzing story");
      const analysis=await checkpoint("analysis",()=>call("/api/analyze",{story:job.prompt}));
      if(!Array.isArray(analysis.scenes)||!analysis.scenes.length)throw new Error("Analysis did not return scenes");
      for(let index=0;index<analysis.scenes.length;index++){
        const scene=analysis.scenes[index];
        await progress("images",`Generating scene ${index+1}/${analysis.scenes.length}`,index,analysis.scenes.length);
        const location=analysis.locations?.find(item=>item.id===scene.locationId);
        await checkpoint(`image-${index+1}`,()=>call("/api/generate",{scene,characters:analysis.characters||[],location,visualStyle:"Cinematic Film (Ultra-Photorealistic)",aspectRatio:"16:9"}));
      }
      await progress("voice","Generating narration");
      const voice=await checkpoint("narration",()=>call("/api/narration/tts",{text:job.prompt.slice(0,12000)}));
      if(!voice)throw new Error("Narration returned no result");
      // Explicit stop rather than falsely marking a video completed.
      await jobs.updateOne({jobId:id,workerId},{$set:{status:"render_pending",phase:"video",message:"Images and narration ready; server video renderer not integrated",updatedAt:new Date()},$unset:{leaseUntil:""}});
      await events.insertOne({jobId:id,phase:"video",message:"Awaiting server-side video renderer",createdAt:new Date()});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const attempts=Number(job.attempts)||1;
      const terminal=attempts>=5;
      await jobs.updateOne({jobId:id,workerId},{$set:{status:terminal?"failed":"queued",phase:"error",message,updatedAt:new Date()},$unset:{leaseUntil:""}});
      await events.insertOne({jobId:id,phase:"error",message,createdAt:new Date()});
      if(!terminal)await sleep(Math.min(30000,1000*2**attempts));
    }finally{if(heartbeat)clearInterval(heartbeat)}
  }
  await mongo.close();
}
main().catch(error=>{console.error(error);process.exitCode=1});
