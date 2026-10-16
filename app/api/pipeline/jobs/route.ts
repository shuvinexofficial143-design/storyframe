import {NextResponse} from "next/server";
import {randomUUID,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {mongoConfigured,mongoDb} from "@/lib/mongodb";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const NewJob=z.object({
  projectId:z.string().min(1).max(160),
  chapterId:z.string().min(1).max(160),
  prompt:z.string().min(1).max(20000),
});
const Patch=z.object({
  jobId:z.string().uuid(),
  status:z.enum(["queued","running","completed","failed"]),
  phase:z.enum(["analysis","planning","images","narration","voice","video","complete","error"]),
  completed:z.number().int().nonnegative(),
  total:z.number().int().nonnegative(),
  message:z.string().max(1000).default(""),
  resultUrl:z.string().url().max(4000).optional(),
});
function authorized(request:Request){
  const secret=process.env.STORYFRAME_PIPELINE_TOKEN;
  const supplied=request.headers.get("authorization")?.replace(/^Bearer /i,"")||"";
  if(!secret||!supplied)return false;
  const a=Buffer.from(secret),b=Buffer.from(supplied);
  return a.length===b.length&&timingSafeEqual(a,b);
}
function unavailable(){return NextResponse.json({error:"Pipeline database is not configured"},{status:503});}
function denied(){return NextResponse.json({error:"Unauthorized"},{status:401});}

export async function POST(request:Request){
  if(!authorized(request))return denied();
  if(!mongoConfigured())return unavailable();
  const parsed=NewJob.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Invalid job",details:parsed.error.flatten()},{status:400});
  const now=new Date(),jobId=randomUUID();
  const job={jobId,...parsed.data,status:"queued",phase:"analysis",completed:0,total:0,message:"Queued",createdAt:now,updatedAt:now,attempts:0};
  const db=await mongoDb();
  await db.collection("pipeline_jobs").insertOne(job);
  await db.collection("pipeline_events").insertOne({jobId,sequence:0,status:"queued",phase:"analysis",message:"Queued",createdAt:now});
  return NextResponse.json({ok:true,jobId,status:"queued"},{status:201});
}

export async function GET(request:Request){
  if(!authorized(request))return denied();
  if(!mongoConfigured())return unavailable();
  const url=new URL(request.url);
  const jobId=url.searchParams.get("jobId");
  const projectId=url.searchParams.get("projectId");
  if(!jobId&&!projectId)return NextResponse.json({error:"jobId or projectId required"},{status:400});
  const query=jobId?{jobId}:{projectId:projectId!};
  const jobs=await (await mongoDb()).collection("pipeline_jobs").find(query,{projection:{_id:0,prompt:0}}).sort({createdAt:-1}).limit(jobId?1:30).toArray();
  return NextResponse.json({ok:true,jobs});
}

export async function PATCH(request:Request){
  if(!authorized(request))return denied();
  if(!mongoConfigured())return unavailable();
  const parsed=Patch.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Invalid progress update"},{status:400});
  const {jobId,...change}=parsed.data;
  if(change.total>0&&change.completed>change.total)return NextResponse.json({error:"completed exceeds total"},{status:400});
  const db=await mongoDb(),now=new Date();
  const result=await db.collection("pipeline_jobs").updateOne({jobId,status:{$nin:["completed","failed"]}},{$set:{...change,updatedAt:now}});
  if(!result.matchedCount)return NextResponse.json({error:"Job missing or terminal"},{status:409});
  await db.collection("pipeline_events").insertOne({jobId,...change,createdAt:now});
  return NextResponse.json({ok:true});
}
