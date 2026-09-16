import {z} from "zod";
import {xkiroJsonCompletion} from "../xkiro";
import {isStoryAnalysisModel,type StoryAnalysisModel} from "../story-analysis-models";
import {normalizeMangaStructuredData} from "./structured-normalize";
import type {MangaMasterAnalysis} from "./types";
import {estimateAdaptivePacing,pacingPrompt,type MangaPacingPreset} from "./pacing-policy";

const Dialogue=z.object({speaker:z.string().default(""),text:z.string().default(""),emotion:z.string().default("neutral"),bubbleType:z.enum(["speech","thought","shout","whisper","narration"]).default("speech")});
const Beat=z.object({sourceText:z.string().default(""),storyBeat:z.string().min(1),type:z.enum(["action","reaction","reveal","dialogue","transition","environment","object","emotion"]).default("action"),characterNames:z.array(z.string()).default([]),locationName:z.string().default(""),action:z.string().default(""),reaction:z.string().default(""),dialogue:z.array(Dialogue).default([]),importantProps:z.array(z.string()).default([]),stateAfter:z.string().default("")});
const Output=z.object({beats:z.array(Beat).min(4).max(300)});

const SYSTEM=`You are StoryFrame's manga pacing and continuity editor. Return strict JSON only. Your job is to EXPAND an already-correct chronological beat list only when it is too compressed for professional manga pacing. Split source-supported moments into smaller visual beats; never invent new plot events, dialogue, powers, props, locations or outcomes. One beat may contain only one immediately visible action, reaction, reveal, dialogue turn with visible acting, object insert, environment beat, emotion beat or explicit transition. Preserve exact chronology and continuity of character identity, outfit, held objects, injuries, wet/dirty state, location, screen direction and story state. Setup, action, reaction, impact and aftermath should be separate when the source actually contains them. Return one complete JSON object and nothing else.`;

export async function refineMangaMasterForPacing(input:{analysisModel:StoryAnalysisModel;pacingPreset:MangaPacingPreset;story:string;master:MangaMasterAnalysis}):Promise<MangaMasterAnalysis>{
  const estimate=estimateAdaptivePacing(input.story,input.pacingPreset);
  if(input.master.beats.length>=estimate.minBeats)return input.master;
  if(estimate.targetBeats>110)return input.master;
  if(!isStoryAnalysisModel(input.analysisModel))return input.master;

  const prompt=`${pacingPrompt(input.pacingPreset,input.story)}\n\nSOURCE STORY (authoritative):\n${input.story}\n\nLOCKED CHARACTERS:\n${JSON.stringify(input.master.characters)}\n\nLOCKED LOCATIONS:\n${JSON.stringify(input.master.locations)}\n\nLOCKED PROPS:\n${JSON.stringify(input.master.props)}\n\nCURRENT BEATS (${input.master.beats.length}; too compressed):\n${JSON.stringify(input.master.beats)}\n\nExpand by SPLITTING these beats into finer source-supported visual moments. Preserve every current event and its order. Do not add filler merely to reach the guidance range. Return exactly {"beats":[{"sourceText":"exact source segment","storyBeat":"one visible moment","type":"action|reaction|reveal|dialogue|transition|environment|object|emotion","characterNames":[],"locationName":"","action":"","reaction":"","dialogue":[{"speaker":"","text":"","emotion":"","bubbleType":"speech|thought|shout|whisper|narration"}],"importantProps":[],"stateAfter":"precise continuity state after this beat"}]}.`;

  try{
    const completion=await xkiroJsonCompletion({model:input.analysisModel,systemPrompt:SYSTEM,userPrompt:prompt,temperature:.08,maxTokens:Math.min(60000,Math.max(18000,estimate.targetBeats*420))});
    const normalized=normalizeMangaStructuredData(completion.json);
    const parsed=Output.safeParse(normalized);
    if(!parsed.success||parsed.data.beats.length<=input.master.beats.length)return input.master;
    const beats=parsed.data.beats.map((beat,index)=>({id:`beat-${index+1}`,...beat}));
    return {...input.master,beats,provider:`${input.master.provider} · adaptive ${input.pacingPreset.toLowerCase()} pacing`};
  }catch(error){
    console.warn("Adaptive manga beat expansion skipped after model failure",error);
    return input.master;
  }
}
