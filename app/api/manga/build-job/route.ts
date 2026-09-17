import {NextResponse} from "next/server";
import {z} from "zod";
import {getRun,start} from "workflow/api";
import {MANGA_PACING_PRESETS} from "@/lib/manga-production/pacing-policy";
import {MANGA_STYLE_PRESETS,type MangaContinuityState} from "@/lib/manga-production/types";
import {STORY_ANALYSIS_MODELS} from "@/lib/story-analysis-models";
import {buildMangaChapterWorkflow,type MangaChapterBuildWorkflowInput,type MangaChapterBuildWorkflowResult} from "@/workflows/manga-chapter-build";

export const maxDuration=30;

const StartInput=z.object({
  projectId:z.string().min(1),
  chapterId:z.string().min(1),
  projectName:z.string().min(1),
  chapterTitle:z.string().min(1),
  story:z.string().min(20).max(120000),
  analysisModel:z.enum(STORY_ANALYSIS_MODELS),
  stylePreset:z.enum(MANGA_STYLE_PRESETS),
  pacingPreset:z.enum(MANGA_PACING_PRESETS),
  existingCharacters:z.array(z.unknown()).default([]),
  existingLocations:z.array(z.unknown()).default([]),
  existingProps:z.array(z.unknown()).default([]),
  previousContinuity:z.unknown().nullable().optional(),
  chapterContext:z.string().max(30000).optional()
});

function planningCooldownSeconds(){
  const raw=Number(process.env.GEMINI_PAGE_PLANNING_COOLDOWN_MS||12000);
  const milliseconds=Number.isFinite(raw)?Math.max(0,Math.min(60_000,Math.round(raw))):12_000;
  return Math.ceil(milliseconds/1000);
}

export async function POST(request:Request){
  try{
    const parsed=StartInput.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid background manga build request",details:parsed.error.flatten()},{status:400});
    const input:MangaChapterBuildWorkflowInput={
      ...parsed.data,
      previousContinuity:(parsed.data.previousContinuity||null) as MangaContinuityState|null,
      pagePlanningCooldownSeconds:planningCooldownSeconds(),
      startedAt:new Date().toISOString()
    };
    const run=await start(buildMangaChapterWorkflow,[input]);
    return NextResponse.json({runId:run.runId,status:"running"},{status:202});
  }catch(error){
    console.error("Could not start durable manga build",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Could not start background manga build"},{status:502});
  }
}

export async function GET(request:Request){
  const runId=new URL(request.url).searchParams.get("runId")?.trim();
  if(!runId)return NextResponse.json({error:"runId is required"},{status:400});
  try{
    const run=getRun<MangaChapterBuildWorkflowResult>(runId);
    const status=await run.status;
    if(status==="completed"){
      const result=await run.returnValue;
      return NextResponse.json({status,result});
    }
    if(status==="failed")return NextResponse.json({status,error:"Background manga build failed. You can retry the chapter build."});
    return NextResponse.json({status});
  }catch(error){
    console.error("Could not read durable manga build",{runId,error});
    return NextResponse.json({error:error instanceof Error?error.message:"Could not read background manga build"},{status:404});
  }
}
