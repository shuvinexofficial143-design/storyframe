import {NextResponse} from "next/server";
import {z} from "zod";
import {xkiroJsonCompletion} from "@/lib/xkiro";
import {isStoryAnalysisModel} from "@/lib/story-analysis-models";
import {withStoryModelFallback} from "@/lib/story-model-fallback";

export const maxDuration=300;

const Page=z.object({
  id:z.string().min(1),
  pageNumber:z.number().int().min(1),
  pagePurpose:z.string().default(""),
  beats:z.array(z.object({storyBeat:z.string().default(""),sourceText:z.string().default("")})).min(1)
});
const Input=z.object({
  title:z.string().min(1).max(300),
  story:z.string().min(20).max(120000),
  analysisModel:z.string(),
  pages:z.array(Page).min(1).max(250)
});
const Segment=z.object({pageId:z.string().min(1),pageNumber:z.number().int().min(1),text:z.string().min(20)});
const Output=z.object({explainer:z.string().min(40),segments:z.array(Segment).min(1)});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid narration plan request",details:parsed.error.flatten()},{status:400});
    const data=parsed.data;
    if(!isStoryAnalysisModel(data.analysisModel))return NextResponse.json({error:"Unsupported narration planning model"},{status:400});

    const pageContext=data.pages.map((page)=>({
      pageId:page.id,
      pageNumber:page.pageNumber,
      pagePurpose:page.pagePurpose,
      beats:page.beats
    }));

    const result=await withStoryModelFallback({
      model:data.analysisModel,
      retryDelaysMs:[6_000,12_000,24_000],
      run:(model)=>xkiroJsonCompletion({
        model,
        systemPrompt:"You are StoryFrame's cinematic Hindi story-explainer writer and audio-to-visual editor. Return strict JSON only. Write natural spoken Hindi in third-person explainer style. It must feel like a skilled YouTube/anime story narrator: conversational, emotionally alive, curious, suspenseful and clear. Never sound like a textbook, report, documentary transcript or literal line-by-line reading. Preserve the actual story facts and chronology. Do not invent plot events. Then divide the narration into page-aligned segments so each segment describes only what is visible on that supplied page. Every supplied page must appear exactly once, in page-number order.",
        userPrompt:`TITLE: ${data.title}

ORIGINAL STORY:
${data.story}

GENERATED VISUAL PAGES:
${JSON.stringify(pageContext)}

Return exactly:
{"explainer":"complete engaging narration","segments":[{"pageId":"exact supplied page id","pageNumber":1,"text":"spoken narration heard while this page/image is on screen"}]}

Rules:
- Include every supplied page exactly once and in order.
- Segment text must match that page's beats; do not put a later event over an earlier image.
- Keep transitions natural between segments.
- Use Hindi suitable for TTS: short-to-medium sentences, natural punctuation and pauses.
- Strong opening hook, then clean chronology, emotional reactions, tension and curiosity.
- No markdown and no headings inside spoken text.`,
        temperature:.35,
        maxTokens:24000
      })
    });

    const checked=Output.safeParse(result.data.json);
    if(!checked.success)throw new Error("Narration planner returned incomplete structured data.");
    const expected=data.pages.map((p)=>p.id);
    const actual=checked.data.segments.map((s)=>s.pageId);
    if(actual.length!==expected.length||actual.some((id,index)=>id!==expected[index]))throw new Error("Narration planner did not preserve the exact visual page order.");

    return NextResponse.json({kind:"narration-plan",data:checked.data});
  }catch(error){
    console.error("Narration planning failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Narration planning failed"},{status:502});
  }
}
