import {NextResponse} from "next/server";
import {z} from "zod";
import {mongoConfigured,mongoDb} from "@/lib/mongodb";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const Body=z.object({
  projectId:z.string().min(1).max(160),
  chapterId:z.string().min(1).max(160),
  chapterNumber:z.number().int().positive().optional(),
  phase:z.enum(["idle","analysis","planning","images","narration","voice","video","complete","error"]),
  message:z.string().max(1000).default(""),
  completed:z.number().int().nonnegative().optional(),
  total:z.number().int().nonnegative().optional()
});

export async function POST(request:Request){
  if(!mongoConfigured())return NextResponse.json({ok:false,configured:false},{status:503});
  const body=Body.parse(await request.json());
  const db=await mongoDb(),collection=db.collection("chapter_pipeline_jobs");
  await collection.updateOne(
    {projectId:body.projectId,chapterId:body.chapterId},
    {$set:{...body,updatedAt:new Date()},$setOnInsert:{createdAt:new Date()}},
    {upsert:true}
  );
  // MongoDB is only a recovery mirror for the newest three chapters of a project.
  // Final video blobs/URLs are deliberately never accepted by this endpoint.
  const keep=await collection.find({projectId:body.projectId}).sort({chapterNumber:-1,updatedAt:-1}).limit(3).project({_id:1}).toArray();
  const ids=keep.map((item)=>item._id);
  if(ids.length)await collection.deleteMany({projectId:body.projectId,_id:{$nin:ids}});
  return NextResponse.json({ok:true,retained:ids.length});
}

export async function GET(request:Request){
  if(!mongoConfigured())return NextResponse.json({ok:false,configured:false},{status:503});
  const url=new URL(request.url),projectId=url.searchParams.get("projectId"),chapterId=url.searchParams.get("chapterId");
  if(!projectId||!chapterId)return NextResponse.json({error:"projectId and chapterId are required"},{status:400});
  const job=await (await mongoDb()).collection("chapter_pipeline_jobs").findOne({projectId,chapterId},{projection:{_id:0}});
  return NextResponse.json({ok:true,job});
}
