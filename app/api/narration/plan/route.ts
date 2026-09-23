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
        systemPrompt:"You are StoryFrame's cinematic Hindi story-explainer writer and audio-to-visual editor. Return strict JSON only. Write the narration primarily in FIRST PERSON from the protagonist's point of view when the source supports a clear protagonist, using natural spoken Hindi such as 'मैं', 'मेरे', 'मुझे', 'मेरे पीछे', 'मैं देखता हूँ'. Make it feel like the protagonist is rapidly recounting events as they happen, not like an outside documentary narrator. Use present-tense or immediate-recap phrasing, short punchy clauses, quick cause→effect transitions, concrete actions, reactions, danger, gains/losses, ranks/stats/resources when they matter, and occasional compact thoughts or judgments. The language should be simple, direct, energetic and slightly raw—like a fast-paced fantasy/anime recap voiceover—without copying any source wording. Avoid literary prose, formal exposition, repetitive 'फिर', long moral commentary, or textbook/report tone. Keep third-person only for moments the protagonist cannot know or when the source genuinely changes viewpoint. Preserve actual story facts and chronology; never invent plot events. Then divide the narration into page-aligned segments so each segment describes only what is visible on that supplied page. Every supplied page must appear exactly once, in page-number order.",
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
- Use Hindi suitable for TTS: mostly short sentences and punchy clauses with natural punctuation.
- Prefer first-person protagonist narration wherever the source permits it; do not drift into detached third-person summary.
- Keep a fast recap rhythm: action → immediate result → reaction/decision → next visual.
- Mention numbers, ranks, kills, rewards, resources, territory, injuries, weapons or system-style progress only when present in the source.
- Use compact connective phrases instead of formal transitions; avoid sounding polished like an essay.
- Keep emotional language grounded: shock, anger, pressure, confidence, fear or relief should follow actual events.
- Do not add greetings, channel commentary, calls to action or invented jokes.
- Strong opening hook, then clean chronology, escalating tension and curiosity.
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
