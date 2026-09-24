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
const LooseSegment=z.object({
  pageId:z.string().optional(),
  sceneId:z.string().optional(),
  pageNumber:z.coerce.number().int().min(1).optional(),
  text:z.string().optional(),
  narration:z.string().optional(),
  script:z.string().optional()
}).passthrough();
const LooseOutput=z.object({
  explainer:z.string().optional(),
  narration:z.string().optional(),
  script:z.string().optional(),
  segments:z.array(LooseSegment).optional()
}).passthrough();

function cleanSpoken(value:unknown){
  return typeof value==="string"?value.replace(/\s+/g," ").trim():"";
}

function narrationSafeText(value:string){
  return value
    .replace(/\b(?:naked|nude|nudity|undressed|shirtless)\b/gi,"modestly covered")
    .replace(/\b(?:sex|sexual|intercourse|rape|molest(?:ed|ation)?|assaulted)\b/gi,"sensitive off-screen incident")
    .replace(/\b(?:blood(?:y|ied|shed)?|gore|gory|mutilat(?:e|ed|ion)|dismember(?:ed|ment))\b/gi,"injury")
    .replace(/\b(?:kill(?:ed|ing|s)?|murder(?:ed|ing)?|stab(?:bed|bing)?|shoot(?:ing|s|shot)?)\b/gi,"violent conflict")
    .replace(/\b(?:stained bedsheet|blood-stained sheet)\b/gi,"bedsheet")
    .replace(/\s+/g," ")
    .trim();
}

function safeNarrationPages(pages:Array<z.infer<typeof Page>>){
  return pages.map((page)=>({
    pageId:page.id,
    pageNumber:page.pageNumber,
    pagePurpose:narrationSafeText(page.pagePurpose),
    beats:page.beats.map((beat)=>({
      storyBeat:narrationSafeText(beat.storyBeat),
      sourceText:narrationSafeText(beat.sourceText)
    }))
  }));
}

function fallbackPageText(page:z.infer<typeof Page>){
  const parts=page.beats.flatMap((beat)=>[cleanSpoken(beat.storyBeat),cleanSpoken(beat.sourceText)]).filter(Boolean);
  return parts.filter((value,index)=>parts.indexOf(value)===index).join(" ").slice(0,2200);
}

function normalizeNarration(raw:unknown,pages:Array<z.infer<typeof Page>>){
  const parsed=LooseOutput.safeParse(raw);
  const data=parsed.success?parsed.data:{};
  const returned=Array.isArray(data.segments)?data.segments:[];
  const byId=new Map<string,string>();
  const byNumber=new Map<number,string>();

  for(const item of returned){
    const spoken=cleanSpoken(item.text)||cleanSpoken(item.narration)||cleanSpoken(item.script);
    if(!spoken)continue;
    const id=cleanSpoken(item.pageId)||cleanSpoken(item.sceneId);
    if(id)byId.set(id,spoken);
    if(item.pageNumber)byNumber.set(item.pageNumber,spoken);
  }

  const segments=pages.map((page)=>({
    pageId:page.id,
    pageNumber:page.pageNumber,
    text:byId.get(page.id)||byNumber.get(page.pageNumber)||fallbackPageText(page)
  }));

  const explicit=cleanSpoken(data.explainer)||cleanSpoken(data.narration)||cleanSpoken(data.script);
  const explainer=explicit||segments.map((item)=>item.text).filter(Boolean).join(" ");
  return {explainer,segments};
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid narration plan request",details:parsed.error.flatten()},{status:400});
    const data=parsed.data;
    if(!isStoryAnalysisModel(data.analysisModel))return NextResponse.json({error:"Unsupported narration planning model"},{status:400});

    // Narration does not need explicit visual details. Send a narration-safe copy so a
    // policy-sensitive image/story phrase cannot make Vertex return zero candidates.
    const pageContext=safeNarrationPages(data.pages);
    const narrationStory=narrationSafeText(data.story);

    const result=await withStoryModelFallback({
      model:data.analysisModel,
      retryDelaysMs:[6_000,12_000,24_000],
      run:(model)=>xkiroJsonCompletion({
        model,
        systemPrompt:"You are StoryFrame's cinematic Hindi story-explainer writer and audio-to-visual editor. Return strict JSON only. Write the narration primarily in FIRST PERSON from the protagonist's point of view when the source supports a clear protagonist, using natural spoken Hindi such as 'मैं', 'मेरे', 'मुझे', 'मेरे पीछे', 'मैं देखता हूँ'. Make it feel like the protagonist is rapidly recounting events as they happen, not like an outside documentary narrator. Use present-tense or immediate-recap phrasing, short punchy clauses, quick cause→effect transitions, concrete actions, reactions, danger, gains/losses, ranks/stats/resources when they matter, and occasional compact thoughts or judgments. The language should be simple, direct, energetic and slightly raw—like a fast-paced fantasy/anime recap voiceover—without copying any source wording. Avoid literary prose, formal exposition, repetitive 'फिर', long moral commentary, or textbook/report tone. Keep third-person only for moments the protagonist cannot know or when the source genuinely changes viewpoint. Preserve actual story facts and chronology; never invent plot events. Then divide the narration into page-aligned segments so each segment describes only what is visible on that supplied page. Every supplied page must appear exactly once, in page-number order.",
        userPrompt:`TITLE: ${data.title}

ORIGINAL STORY (narration-safe wording):
${narrationStory}

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

    const normalized=normalizeNarration(result.data.json,data.pages);
    if(!normalized.explainer||normalized.explainer.length<20)throw new Error("Narration planner returned no usable spoken narration.");
    const unusable=normalized.segments.find((segment)=>segment.text.length<8);
    if(unusable)throw new Error(`Narration planner could not create usable narration for visual page ${unusable.pageNumber}.`);

    return NextResponse.json({
      kind:"narration-plan",
      data:normalized,
      repaired:true
    });
  }catch(error){
    console.error("Narration planning failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Narration planning failed"},{status:502});
  }
}
