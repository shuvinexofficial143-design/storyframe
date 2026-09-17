import {NextResponse} from "next/server";
import {start} from "workflow/api";
import {z} from "zod";
import {buildMangaChapterWorkflow} from "@/app/workflows/manga-chapter-build";
import {STORY_ANALYSIS_MODELS} from "@/lib/story-analysis-models";
import {MANGA_PACING_PRESETS} from "@/lib/manga-production/pacing-policy";
import {MANGA_STYLE_PRESETS} from "@/lib/manga-production/types";

const Input=z.object({
  projectName:z.string().min(1),
  chapterTitle:z.string().min(1),
  story:z.string().min(20).max(120000),
  analysisModel:z.enum(STORY_ANALYSIS_MODELS),
  stylePreset:z.enum(MANGA_STYLE_PRESETS),
  pacingPreset:z.enum(MANGA_PACING_PRESETS),
  masterSeed:z.number().int(),
  requestedAt:z.string().min(1),
  existingCharacters:z.array(z.unknown()).default([]),
  existingLocations:z.array(z.unknown()).default([]),
  existingProps:z.array(z.unknown()).default([]),
  previousContinuity:z.unknown().nullable().optional(),
  chapterContext:z.string().optional()
});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid background manga build request",details:parsed.error.flatten()},{status:400});
    const run=await start(buildMangaChapterWorkflow,[parsed.data as never]);
    return NextResponse.json({runId:run.runId,status:await run.status},{status:202});
  }catch(error){
    console.error("Could not start background manga workflow",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Could not start background manga workflow"},{status:500});
  }
}
