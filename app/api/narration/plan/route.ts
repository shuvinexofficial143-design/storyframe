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

function cleanSpoken(value:unknown){return typeof value==="string"?value.replace(/\s+/g," ").trim():""}
function narrationSafeText(value:string){return value.replace(/\b(?:naked|nude|nudity|undressed|shirtless)\b/gi,"modestly covered").replace(/\b(?:sex|sexual|intercourse|rape|molest(?:ed|ation)?|assaulted)\b/gi,"sensitive off-screen incident").replace(/\b(?:blood(?:y|ied|shed)?|gore|gory|mutilat(?:e|ed|ion)|dismember(?:ed|ment))\b/gi,"injury").replace(/\b(?:kill(?:ed|ing|s)?|murder(?:ed|ing)?|stab(?:bed|bing)?|shoot(?:ing|s|shot)?)\b/gi,"violent conflict").replace(/\b(?:stained bedsheet|blood-stained sheet)\b/gi,"bedsheet").replace(/\s+/g," ").trim()}
function safeNarrationPages(pages:Array<z.infer<typeof Page>>){return pages.map((page)=>({pageId:page.id,pageNumber:page.pageNumber,pagePurpose:narrationSafeText(page.pagePurpose),beats:page.beats.map((beat)=>({storyBeat:narrationSafeText(beat.storyBeat),sourceText:narrationSafeText(beat.sourceText)}))}))}
function fallbackPageText(page:z.infer<typeof Page>){const parts=page.beats.flatMap((beat)=>[cleanSpoken(beat.storyBeat),cleanSpoken(beat.sourceText)]).filter(Boolean);return parts.filter((value,index)=>parts.indexOf(value)===index).join(" ").slice(0,2200)}
function normalizeNarration(raw:unknown,pages:Array<z.infer<typeof Page>>){const parsed=LooseOutput.safeParse(raw);const data=parsed.success?parsed.data:{};const returned=Array.isArray(data.segments)?data.segments:[];const byId=new Map<string,string>();const byNumber=new Map<number,string>();for(const item of returned){const spoken=cleanSpoken(item.text)||cleanSpoken(item.narration)||cleanSpoken(item.script);if(!spoken)continue;const id=cleanSpoken(item.pageId)||cleanSpoken(item.sceneId);if(id)byId.set(id,spoken);if(item.pageNumber)byNumber.set(item.pageNumber,spoken)}const segments=pages.map((page)=>({pageId:page.id,pageNumber:page.pageNumber,text:byId.get(page.id)||byNumber.get(page.pageNumber)||fallbackPageText(page)}));const explicit=cleanSpoken(data.explainer)||cleanSpoken(data.narration)||cleanSpoken(data.script);const explainer=explicit||segments.map((item)=>item.text).filter(Boolean).join(" ");return {explainer,segments}}

function chunkPages(pages:Array<z.infer<typeof Page>>){
  const chunks:Array<Array<z.infer<typeof Page>>>=[];
  let current:Array<z.infer<typeof Page>>=[],chars=0;
  for(const page of pages){
    const size=JSON.stringify(safeNarrationPages([page])).length;
    if(current.length&&(current.length>=18||chars+size>24_000)){chunks.push(current);current=[];chars=0}
    current.push(page);chars+=size;
  }
  if(current.length)chunks.push(current);
  return chunks;
}

const systemPrompt="You are StoryFrame's cinematic Hindi story-explainer writer and audio-to-visual editor. Return strict JSON only. Write primarily in FIRST PERSON from the protagonist's point of view when supported. Use natural simple spoken Hindi, short punchy clauses, immediate cause→effect transitions, concrete actions and grounded emotions. Preserve facts and chronology; never invent plot events. Return every supplied page exactly once, in page-number order.";

async function planChunk(data:z.infer<typeof Input>,pages:Array<z.infer<typeof Page>>,chunkIndex:number,totalChunks:number){
  const context=safeNarrationPages(pages);
  const story=narrationSafeText(data.story);
  const storyExcerpt=story.length>28_000?story.slice(0,14_000)+"\n...[middle omitted for bounded narration request]...\n"+story.slice(-14_000):story;
  const result=await withStoryModelFallback({
    model:data.analysisModel as never,retryDelaysMs:[2_000,5_000,10_000],
    run:(model)=>xkiroJsonCompletion({model,systemPrompt,userPrompt:`TITLE: ${data.title}
NARRATION CHUNK: ${chunkIndex+1}/${totalChunks}

STORY CONTEXT:
${storyExcerpt}

PAGES TO NARRATE:
${JSON.stringify(context)}

Return exactly {"segments":[{"pageId":"exact id","pageNumber":1,"text":"Hindi spoken narration"}]}.
Rules: include only these supplied pages, exactly once and in order; match each page's beats; first-person where valid; no markdown; concise TTS-ready Hindi.`,temperature:.25,maxTokens:12000})
  });
  return normalizeNarration(result.data.json,pages).segments;
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid narration plan request",details:parsed.error.flatten()},{status:400});
    const data=parsed.data;
    if(!isStoryAnalysisModel(data.analysisModel))return NextResponse.json({error:"Unsupported narration planning model"},{status:400});

    const chunks=chunkPages(data.pages);
    const segments=[];
    for(let index=0;index<chunks.length;index+=1)segments.push(...await planChunk(data,chunks[index],index,chunks.length));
    const explainer=segments.map((item)=>item.text).filter(Boolean).join(" ");
    if(!explainer||explainer.length<20)throw new Error("Narration planner returned no usable spoken narration.");
    const unusable=segments.find((segment)=>segment.text.length<8);
    if(unusable)throw new Error(`Narration planner could not create usable narration for visual page ${unusable.pageNumber}.`);

    return NextResponse.json({kind:"narration-plan",data:{explainer,segments},repaired:true,chunked:chunks.length>1,chunks:chunks.length});
  }catch(error){
    console.error("Narration planning failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Narration planning failed"},{status:502});
  }
}
