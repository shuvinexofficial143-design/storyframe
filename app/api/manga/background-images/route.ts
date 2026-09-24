import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {backgroundJobStoreConfigured,putBackgroundJob,type BackgroundJob} from "@/lib/background-job-store";
import {backgroundQStashConfigured,publishBackgroundStep} from "@/lib/background-qstash";

export const maxDuration=30;

const MissingReference=z.object({name:z.string().min(1).max(120),referencePrompt:z.string().min(10).max(8000),seed:z.number().int().min(1).max(99_999_999)});
const PageTask=z.object({
  pageId:z.string().min(1),pageNumber:z.number().int().positive(),prompt:z.string().min(40).max(40000),
  negativePrompt:z.string().optional(),seed:z.number().int().min(1).max(99_999_999),
  referenceImages:z.array(z.string()).max(4).default([]),missingReferences:z.array(MissingReference).max(4).default([])
});
const Input=z.object({projectId:z.string().min(1),chapterId:z.string().min(1),pages:z.array(PageTask).min(1).max(250)});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid background image request",details:parsed.error.flatten()},{status:400});
    if(!backgroundJobStoreConfigured()||!backgroundQStashConfigured())return NextResponse.json({error:"Background image mode requires MONGODB_URI and QSTASH_TOKEN in Vercel."},{status:503});
    const id=randomUUID(),now=new Date().toISOString();
    const job:BackgroundJob<typeof parsed.data,{pages:Array<{pageId:string;pageNumber:number;imageDataUrl:string;sourceUrl:string;model:string;provider:string;seed:number}>;references:Array<{name:string;imageDataUrl:string;sourceUrl:string;model:string;provider:string;seed:number}>}>={
      id,status:"queued",phase:"images",progress:`Queued ${parsed.data.pages.length} manga page(s) for server-side image generation…`,createdAt:now,updatedAt:now,attempts:0,payload:parsed.data,result:{pages:[],references:[]}
    };
    await putBackgroundJob(job);
    await publishBackgroundStep({destination:`${new URL(request.url).origin}/api/manga/background-image-worker`,runId:id});
    return NextResponse.json({runId:id,status:job.status,progress:job.progress});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not start background image generation"},{status:502})}
}
