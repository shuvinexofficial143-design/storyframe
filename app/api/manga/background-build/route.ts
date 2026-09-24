import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {MANGA_PACING_PRESETS} from "@/lib/manga-production/pacing-policy";
import {MANGA_STYLE_PRESETS} from "@/lib/manga-production/types";
import {STORY_ANALYSIS_MODELS} from "@/lib/story-analysis-models";
import {backgroundJobStoreConfigured,putBackgroundJob,type BackgroundJob} from "@/lib/background-job-store";
import {backgroundQStashConfigured,publishBackgroundStep} from "@/lib/background-qstash";

export const maxDuration=30;

const Input=z.object({
  projectId:z.string().min(1),
  chapterId:z.string().min(1),
  projectName:z.string().min(1),
  chapterTitle:z.string().min(1),
  story:z.string().min(20).max(120000),
  analysisModel:z.enum(STORY_ANALYSIS_MODELS),
  stylePreset:z.enum(MANGA_STYLE_PRESETS),
  pacingPreset:z.enum(MANGA_PACING_PRESETS),
  masterSeed:z.number().int(),
  existingCharacters:z.array(z.unknown()).default([]),
  existingLocations:z.array(z.unknown()).default([]),
  existingProps:z.array(z.unknown()).default([]),
  previousContinuity:z.unknown().nullable().optional(),
  chapterContext:z.string().default("")
});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid background manga request",details:parsed.error.flatten()},{status:400});
    if(!backgroundJobStoreConfigured()||!backgroundQStashConfigured()){
      return NextResponse.json({error:"Background mode is not configured yet. Add MONGODB_URI and QSTASH_TOKEN in Vercel."},{status:503});
    }
    const id=randomUUID();
    const now=new Date().toISOString();
    const job:BackgroundJob<typeof parsed.data>={
      id,status:"queued",phase:"master",progress:"Queued for background story analysis…",createdAt:now,updatedAt:now,attempts:0,payload:parsed.data
    };
    await putBackgroundJob(job);
    const origin=new URL(request.url).origin;
    await publishBackgroundStep({destination:`${origin}/api/manga/background-worker`,runId:id});
    return NextResponse.json({runId:id,status:job.status,progress:job.progress});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not start background manga build"},{status:502});
  }
}
