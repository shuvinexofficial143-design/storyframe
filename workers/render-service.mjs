// Render Free Web Service bootstrap: health endpoint + optional worker process.
// No credentials are ever embedded in source code.
import http from "node:http";
import {spawn} from "node:child_process";
const port=Number(process.env.PORT)||10000;
let worker=null;
let state="waiting_for_configuration";
const required=["MONGODB_URI","STORYFRAME_PIPELINE_TOKEN","STORYFRAME_BASE_URL"];
const missing=required.filter(name=>!process.env[name]);
const server=http.createServer((req,res)=>{
  res.writeHead(req.url==="/health"?200:404,{"content-type":"application/json"});
  res.end(JSON.stringify({service:"storyframe-worker",state,configured:missing.length===0,workerRunning:Boolean(worker&&!worker.killed)}));
});
server.listen(port,"0.0.0.0",()=>{
  console.log("StoryFrame worker health server listening",port);
  if(missing.length){console.warn("Worker not started; required environment variables are missing:",missing.join(", "));return}
  state="starting";
  worker=spawn(process.execPath,["workers/storyframe-worker.mjs"],{stdio:"inherit",env:process.env});
  worker.on("spawn",()=>{state="running"});
  worker.on("exit",(code)=>{state="worker_exited";console.error("Worker exited",code)});
});
process.on("SIGTERM",()=>{worker?.kill("SIGTERM");server.close()});
