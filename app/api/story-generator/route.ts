import {NextResponse} from "next/server";
import {z} from "zod";
import {xkiroJsonCompletion,XKiroRequestError} from "@/lib/xkiro";
import {STORY_ANALYSIS_MODELS,storyAnalysisProviderLabel} from "@/lib/story-analysis-models";
import {withStoryModelFallback} from "@/lib/story-model-fallback";

export const maxDuration=300;

const OverviewInput=z.object({
  action:z.literal("overview"),
  analysisModel:z.enum(STORY_ANALYSIS_MODELS),
  prompt:z.string().min(20).max(40000),
  targetHours:z.number().min(1).max(100),
  chapterWordTarget:z.number().int().min(800).max(5000)
});

const ChapterInput=z.object({
  action:z.literal("chapter"),
  analysisModel:z.enum(STORY_ANALYSIS_MODELS),
  overview:z.object({
    title:z.string(),overview:z.string(),genre:z.string(),tone:z.string(),language:z.string(),storyBible:z.string(),
    majorArcs:z.array(z.string()),endingDirection:z.string(),targetHours:z.number(),chapterWordTarget:z.number(),
    estimatedChapterCount:z.number(),generationRules:z.array(z.string())
  }),
  chapterNumber:z.number().int().min(1),
  previousSummaries:z.array(z.object({number:z.number(),title:z.string(),summary:z.string(),endingState:z.string()})).max(12).default([]),
  continuityMemory:z.string().max(20000).default(""),
  totalWordsSoFar:z.number().int().min(0).default(0)
});

const ExplainerInput=z.object({
  action:z.literal("explainer"),
  analysisModel:z.enum(STORY_ANALYSIS_MODELS),
  chapterTitle:z.string().min(1),
  chapterStory:z.string().min(20).max(80000),
  explainerPrompt:z.string().min(10).max(12000)
});

const Input=z.discriminatedUnion("action",[OverviewInput,ChapterInput,ExplainerInput]);

function readableStructuredText(value:unknown):string{
  if(typeof value==="string")return value.trim();
  if(typeof value==="number"||typeof value==="boolean")return String(value);
  if(Array.isArray(value))return value.map((item)=>readableStructuredText(item)).filter(Boolean).join("\n");
  if(value&&typeof value==="object"){
    return Object.entries(value as Record<string,unknown>)
      .map(([key,item])=>{
        const text=readableStructuredText(item);
        return text?`${key.replace(/([a-z])([A-Z])/g,"$1 $2")}: ${text}`:"";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

const FlexibleText=(min=0)=>z.preprocess((value)=>readableStructuredText(value),z.string().min(min));
const FlexibleTextArray=z.preprocess((value)=>{
  if(Array.isArray(value))return value.map((item)=>readableStructuredText(item)).filter(Boolean);
  if(value&&typeof value==="object")return Object.entries(value as Record<string,unknown>).map(([key,item])=>`${key}: ${readableStructuredText(item)}`).filter(Boolean);
  const text=readableStructuredText(value);
  return text?[text]:[];
},z.array(z.string()));

const OverviewOutput=z.object({
  title:FlexibleText(1),
  overview:FlexibleText(20),
  genre:FlexibleText().default("Story"),
  tone:FlexibleText().default("cinematic"),
  language:FlexibleText().default("Hindi"),
  storyBible:FlexibleText(20),
  majorArcs:FlexibleTextArray.pipe(z.array(z.string()).min(1)),
  endingDirection:FlexibleText(10),
  generationRules:FlexibleTextArray.default([])
});

const FlexibleBoolean=z.preprocess((value)=>{
  if(typeof value==="boolean")return value;
  if(typeof value==="number")return value!==0;
  if(typeof value==="string"){
    const normalized=value.trim().toLowerCase();
    if(["true","yes","1","complete","completed"].includes(normalized))return true;
    if(["false","no","0","incomplete","ongoing","continue"].includes(normalized))return false;
  }
  return false;
},z.boolean());

function compactExcerpt(value:string,fromEnd=false,max=900){
  const normalized=value.replace(/\s+/g," ").trim();
  if(normalized.length<=max)return normalized;
  return fromEnd?`…${normalized.slice(-max)}`:`${normalized.slice(0,max)}…`;
}

const ChapterOutput=z.object({
  title:FlexibleText(1),
  story:FlexibleText(200),
  summary:FlexibleText().default(""),
  endingState:FlexibleText().default(""),
  nextHook:FlexibleText().default(""),
  continuityMemory:FlexibleText().default(""),
  storyComplete:FlexibleBoolean.default(false)
}).transform((value)=>{
  const summary=value.summary.length>=20
    ? value.summary
    : `Chapter ${value.title} summary context: ${compactExcerpt(value.story,false,900)}`;
  const endingState=value.endingState.length>=10
    ? value.endingState
    : `Chapter ending state: ${compactExcerpt(value.story,true,700)}`;
  const continuityMemory=value.continuityMemory.length>=20
    ? value.continuityMemory
    : `${summary}\n\n${endingState}${value.nextHook?`\n\nNext hook: ${value.nextHook}`:""}`.slice(0,12000);
  return {...value,summary,endingState,continuityMemory};
});

const ExplainerOutput=z.object({explainer:FlexibleText(100)});

const SYSTEM_OVERVIEW=`You are StoryFrame Long-Form Story Architect. Return strict JSON only. Design a long-running story from the user's concept without writing all chapters now. The story must be suitable for sequential chapter generation, manga adaptation and continuity over many chapters. Plan broad arcs, world rules, character progression, mysteries and the ending direction. Do not hard-cap chapter count; duration and natural pacing matter more than a fixed number.`;

const SYSTEM_CHAPTER=`You are StoryFrame Chapter Writer. Return strict JSON only. Write exactly ONE next chapter, never multiple chapters. Preserve the supplied Story Bible, chronology, character identities, powers, relationships, unresolved plot points and ending state. The chapter must read like a complete story chapter with a beginning, escalation and closing hook while continuing the larger series. Do not summarize instead of writing the chapter. Do not finish the entire story early unless the planned ending has genuinely been reached near the requested total duration. summary must contain a useful chapter recap, endingState must state the exact physical/story state at the chapter end, and continuityMemory must be a compact authoritative state for generating the next chapter. Never return placeholder words such as "same", "done", "continue", "N/A" or empty metadata.`;

const SYSTEM_EXPLAINER=`You are StoryFrame Explainer Writer. Return strict JSON only. Transform the supplied chapter into a separate narration/explainer script following the user's explainer instructions. Preserve facts and chronology. This output is for narration and must not alter the original chapter.`;

async function runJson<T>(model:(typeof STORY_ANALYSIS_MODELS)[number],systemPrompt:string,userPrompt:string,schema:z.ZodType<T>,maxTokens:number){
  const result=await withStoryModelFallback({
    model,
    run:async(activeModel)=>{
      const completion=await xkiroJsonCompletion({model:activeModel,systemPrompt,userPrompt,maxTokens,temperature:.18});
      const parsed=schema.safeParse(completion.json);
      if(!parsed.success)throw new Error(`Story generator returned incomplete structured data: ${parsed.error.issues.slice(0,4).map((issue)=>issue.path.join(".")+": "+issue.message).join("; ")}`);
      return {data:parsed.data,model:activeModel};
    }
  });
  return {data:result.data.data,model:result.model,fallbackUsed:result.fallbackUsed};
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid story generator request",details:parsed.error.flatten()},{status:400});
    const data=parsed.data;

    if(data.action==="overview"){
      const wordsPerHour=8400;
      const targetWords=Math.round(data.targetHours*wordsPerHour);
      const estimatedChapterCount=Math.max(1,Math.round(targetWords/data.chapterWordTarget));
      const prompt=`USER STORY PROMPT:\n${data.prompt}\n\nTARGET NARRATED LENGTH: about ${data.targetHours} hours (~${targetWords} story words at 140 spoken words/minute).\nPREFERRED CHAPTER SIZE: about ${data.chapterWordTarget} words.\nESTIMATED NATURAL SCALE: around ${estimatedChapterCount} chapters, but this is guidance, NOT a hard chapter limit. Use more or fewer chapters if story pacing requires it.\n\nReturn exactly {"title":"","overview":"","genre":"","tone":"","language":"","storyBible":"","majorArcs":[""],"endingDirection":"","generationRules":[""]}. Story Bible must include protagonist, important recurring characters, world rules/power system, progression rules, antagonists, relationships, mysteries, long-term promises and continuity facts. Major arcs should cover the full target duration without pre-writing chapter prose.`;
      const result=await runJson(data.analysisModel,SYSTEM_OVERVIEW,prompt,OverviewOutput,18000);
      return NextResponse.json({
        kind:"overview",
        data:{...result.data,targetHours:data.targetHours,chapterWordTarget:data.chapterWordTarget,estimatedChapterCount,provider:`${storyAnalysisProviderLabel(result.model)}${result.fallbackUsed?" · fallback":""}`}
      });
    }

    if(data.action==="chapter"){
      const targetWords=Math.round(data.overview.targetHours*8400);
      const remainingWords=Math.max(0,targetWords-data.totalWordsSoFar);
      const recent=data.previousSummaries.slice(-8);
      const progressPercent=targetWords?Math.round((data.totalWordsSoFar/targetWords)*100):0;
      const prompt=`STORY OVERVIEW:\n${data.overview.overview}\n\nSTORY BIBLE (authoritative):\n${data.overview.storyBible}\n\nMAJOR ARCS:\n${data.overview.majorArcs.map((arc,index)=>`${index+1}. ${arc}`).join("\n")}\n\nENDING DIRECTION:\n${data.overview.endingDirection}\n\nGENERATION RULES:\n${data.overview.generationRules.join("\n")}\n\nCHAPTER TO WRITE: ${data.chapterNumber}\nTARGET CHAPTER LENGTH: about ${data.overview.chapterWordTarget} words.\nTOTAL TARGET LENGTH: about ${targetWords} words; already generated ${data.totalWordsSoFar} words (~${progressPercent}%). Remaining target roughly ${remainingWords} words. Do not rush the ending merely because chapter number is high.\n\nCURRENT CONTINUITY MEMORY:\n${data.continuityMemory||"Story has not started yet."}\n\nRECENT CHAPTER SUMMARIES:\n${recent.length?recent.map((item)=>`Chapter ${item.number} — ${item.title}: ${item.summary}\nEnding: ${item.endingState}`).join("\n\n"):"None; this is Chapter 1."}\n\nWrite ONLY Chapter ${data.chapterNumber}. Return exactly {"title":"","story":"","summary":"","endingState":"","nextHook":"","continuityMemory":"","storyComplete":false}. storyComplete should become true only when the planned ending is actually complete and the long-form target has been substantially fulfilled; normally keep it false before roughly 85% of target duration.`;
      const result=await runJson(data.analysisModel,SYSTEM_CHAPTER,prompt,ChapterOutput,32000);
      return NextResponse.json({kind:"chapter",data:{...result.data,provider:`${storyAnalysisProviderLabel(result.model)}${result.fallbackUsed?" · fallback":""}`}});
    }

    const prompt=`CHAPTER TITLE: ${data.chapterTitle}\n\nORIGINAL CHAPTER:\n${data.chapterStory}\n\nUSER EXPLAINER INSTRUCTIONS:\n${data.explainerPrompt}\n\nReturn exactly {"explainer":"complete narration/explainer script"}.`;
    const result=await runJson(data.analysisModel,SYSTEM_EXPLAINER,prompt,ExplainerOutput,24000);
    return NextResponse.json({kind:"explainer",data:{...result.data,provider:`${storyAnalysisProviderLabel(result.model)}${result.fallbackUsed?" · fallback":""}`}});
  }catch(error){
    if(error instanceof XKiroRequestError)return NextResponse.json({error:error.message},{status:error.status||502});
    console.error("Story generator failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Story generation failed"},{status:502});
  }
}
