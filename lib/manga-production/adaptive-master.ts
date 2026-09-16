import {z} from "zod";
import {xkiroJsonCompletion} from "../xkiro";
import {isStoryAnalysisModel,type StoryAnalysisModel} from "../story-analysis-models";
import {normalizeMangaStructuredData} from "./structured-normalize";
import type {MangaMasterAnalysis,MangaStoryBeat} from "./types";
import {estimateAdaptivePacing,pacingPrompt,type MangaPacingPreset} from "./pacing-policy";

const Dialogue=z.object({speaker:z.string().default(""),text:z.string().default(""),emotion:z.string().default("neutral"),bubbleType:z.enum(["speech","thought","shout","whisper","narration"]).default("speech")});
const Beat=z.object({sourceText:z.string().default(""),storyBeat:z.string().min(1),type:z.enum(["action","reaction","reveal","dialogue","transition","environment","object","emotion"]).default("action"),characterNames:z.array(z.string()).default([]),locationName:z.string().default(""),action:z.string().default(""),reaction:z.string().default(""),dialogue:z.array(Dialogue).default([]),importantProps:z.array(z.string()).default([]),stateAfter:z.string().default("")});
const Output=z.object({beats:z.array(Beat).min(4).max(300)});

const SYSTEM=`You are StoryFrame's manga pacing and continuity editor. Return strict JSON only. Normalize an already-correct chronological manga beat list to the requested detail level. When the list is too compressed, SPLIT only source-supported moments. When it is too detailed, MERGE only adjacent micro-beats that can naturally coexist in one manga panel. Never invent or delete plot events, dialogue, powers, props, locations, outcomes or state changes. Never reorder events. Never merge across an explicit location/time transition, a major reveal, impact/reaction pair, or a state change that needs its own panel. Preserve character identity, outfit, held objects, injuries, wet/dirty state, location, screen direction and story state. The final stateAfter of a merged beat must equal the final physical/story state of the last source beat in that group. Return one complete JSON object and nothing else.`;

const unique=(items:string[])=>[...new Set(items.filter(Boolean))];

function mergeBeatGroup(group:MangaStoryBeat[],index:number):MangaStoryBeat{
  const last=group[group.length-1];
  const reverse=[...group].reverse();
  const type=group.length===1?group[0].type:(group.find((item)=>item.type==="reveal")?.type||group.find((item)=>item.type==="reaction")?.type||last.type);
  return {
    id:`beat-${index+1}`,
    sourceText:unique(group.map((item)=>item.sourceText)).join(" "),
    storyBeat:group.map((item)=>item.storyBeat).filter(Boolean).join(" → "),
    type,
    characterNames:unique(group.flatMap((item)=>item.characterNames)),
    locationName:reverse.find((item)=>item.locationName)?.locationName||"",
    action:group.map((item)=>item.action).filter(Boolean).join(" Then "),
    reaction:group.map((item)=>item.reaction).filter(Boolean).join(" Then "),
    dialogue:group.flatMap((item)=>item.dialogue),
    importantProps:unique(group.flatMap((item)=>item.importantProps)),
    stateAfter:last.stateAfter
  };
}

export function condenseAdjacentMangaBeats(beats:MangaStoryBeat[],target:number){
  const desired=Math.max(4,Math.min(beats.length,target));
  if(beats.length<=desired)return beats.map((beat,index)=>({...beat,id:`beat-${index+1}`}));
  const output:MangaStoryBeat[]=[];
  for(let index=0;index<desired;index+=1){
    const start=Math.floor(index*beats.length/desired);
    const end=Math.max(start+1,Math.floor((index+1)*beats.length/desired));
    output.push(mergeBeatGroup(beats.slice(start,end),index));
  }
  return output;
}

export async function refineMangaMasterForPacing(input:{analysisModel:StoryAnalysisModel;pacingPreset:MangaPacingPreset;story:string;master:MangaMasterAnalysis}):Promise<MangaMasterAnalysis>{
  const estimate=estimateAdaptivePacing(input.story,input.pacingPreset);
  const currentCount=input.master.beats.length;
  if(currentCount>=estimate.minBeats&&currentCount<=estimate.maxBeats)return input.master;
  if(!isStoryAnalysisModel(input.analysisModel))return input.master;

  const mode=currentCount<estimate.minBeats?"expand":"condense";
  if(estimate.targetBeats>150){
    if(mode==="condense"){
      const beats=condenseAdjacentMangaBeats(input.master.beats,estimate.targetBeats);
      return {...input.master,beats,provider:`${input.master.provider} · adaptive ${input.pacingPreset.toLowerCase()} pacing`};
    }
    return input.master;
  }

  const action=mode==="expand"
    ?"Expand by SPLITTING compressed source-supported beats into finer visible moments. Preserve every current event and its order."
    :"Condense by MERGING adjacent camera-only, atmosphere-only or tiny motion micro-beats that can naturally share one panel. Preserve every event, reaction, dialogue line, transition and resulting state. Do not merge major impact/reaction or reveal moments that deserve separate panels.";
  const prompt=`${pacingPrompt(input.pacingPreset,input.story)}\n\nSOURCE STORY (authoritative):\n${input.story}\n\nLOCKED CHARACTERS:\n${JSON.stringify(input.master.characters)}\n\nLOCKED LOCATIONS:\n${JSON.stringify(input.master.locations)}\n\nLOCKED PROPS:\n${JSON.stringify(input.master.props)}\n\nCURRENT BEATS (${currentCount}; requested range ${estimate.minBeats}-${estimate.maxBeats}, center ${estimate.targetBeats}):\n${JSON.stringify(input.master.beats)}\n\n${action}\nAim near ${estimate.targetBeats} beats, but story logic is more important than an exact number. Return exactly {"beats":[{"sourceText":"exact source segment","storyBeat":"one panel-readable visible moment","type":"action|reaction|reveal|dialogue|transition|environment|object|emotion","characterNames":[],"locationName":"","action":"","reaction":"","dialogue":[{"speaker":"","text":"","emotion":"","bubbleType":"speech|thought|shout|whisper|narration"}],"importantProps":[],"stateAfter":"precise continuity state after this beat"}]}.`;

  try{
    const completion=await xkiroJsonCompletion({model:input.analysisModel,systemPrompt:SYSTEM,userPrompt:prompt,temperature:.06,maxTokens:Math.min(60000,Math.max(18000,estimate.targetBeats*420))});
    const normalized=normalizeMangaStructuredData(completion.json);
    const parsed=Output.safeParse(normalized);
    if(parsed.success){
      let beats=parsed.data.beats.map((beat,index)=>({id:`beat-${index+1}`,...beat}));
      const movedCorrectDirection=mode==="expand"?beats.length>currentCount:beats.length<currentCount;
      if(movedCorrectDirection){
        if(beats.length>estimate.maxBeats)beats=condenseAdjacentMangaBeats(beats,estimate.targetBeats);
        if(mode==="condense"&&beats.length<estimate.minBeats)beats=condenseAdjacentMangaBeats(input.master.beats,estimate.targetBeats);
        return {...input.master,beats,provider:`${input.master.provider} · adaptive ${input.pacingPreset.toLowerCase()} pacing`};
      }
    }
  }catch(error){
    console.warn(`Adaptive manga beat ${mode} model pass failed; using safe continuity-preserving fallback when possible.`,error);
  }

  if(mode==="condense"){
    const beats=condenseAdjacentMangaBeats(input.master.beats,estimate.targetBeats);
    return {...input.master,beats,provider:`${input.master.provider} · adaptive ${input.pacingPreset.toLowerCase()} pacing · deterministic density fallback`};
  }
  return input.master;
}
