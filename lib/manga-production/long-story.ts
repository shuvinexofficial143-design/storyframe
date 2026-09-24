import {z} from "zod";
import {xkiroJsonCompletion} from "../xkiro";
import {isStoryAnalysisModel} from "../story-analysis-models";
import {MANGA_STYLE_PRESETS,type MangaCharacterState,type MangaMasterAnalysis} from "./types";
import {MANGA_STYLE_PROMPTS} from "./presets";
import {normalizeMangaStructuredData} from "./structured-normalize";
import type {MangaMasterInput} from "./planner";

const Dialogue=z.object({speaker:z.string().default(""),text:z.string().default(""),emotion:z.string().default("neutral"),bubbleType:z.enum(["speech","thought","shout","whisper","narration"]).default("speech")});
const Character=z.object({
  name:z.string().min(1),role:z.string().default("recurring character"),gender:z.string().default("unspecified"),approximateAge:z.string().default("young adult"),
  face:z.object({shape:z.string().default("consistent face"),eyes:z.string().default("expressive eyes"),eyebrows:z.string().default("consistent eyebrows"),nose:z.string().default("consistent nose"),mouth:z.string().default("consistent mouth"),specialFeatures:z.string().default("none unless established")}).default({shape:"consistent face",eyes:"expressive eyes",eyebrows:"consistent eyebrows",nose:"consistent nose",mouth:"consistent mouth",specialFeatures:"none unless established"}),
  hair:z.object({color:z.string().default("black"),style:z.string().default("consistent hairstyle"),length:z.string().default("medium")}).default({color:"black",style:"consistent hairstyle",length:"medium"}),
  body:z.object({build:z.string().default("average"),height:z.string().default("average"),proportions:z.string().default("natural consistent proportions")}).default({build:"average",height:"average",proportions:"natural consistent proportions"}),
  defaultOutfit:z.string().default("story-appropriate consistent outfit"),currentOutfit:z.string().default("story-appropriate consistent outfit"),accessories:z.array(z.string()).default([]),importantObjects:z.array(z.string()).default([]),consistencyNotes:z.string().default("Keep face, hair, age, body build, outfit and accessories consistent until the story explicitly changes them.")
});
const Location=z.object({name:z.string().min(1),architecture:z.string().default("story-appropriate architecture"),layout:z.record(z.string(),z.string()).default({}),importantProps:z.array(z.string()).default([]),lighting:z.string().default("story-appropriate motivated lighting"),timeOfDay:z.string().default("unspecified"),continuityNotes:z.string().default("Preserve established layout and fixed objects.")});
const Prop=z.object({name:z.string().min(1),appearance:z.string().default("stable recurring appearance"),currentOwner:z.string().default(""),currentLocation:z.string().default(""),condition:z.string().default("normal"),continuityNotes:z.string().default("Preserve object appearance, owner/location and condition until story changes them.")});
const Timeline=z.object({sourceText:z.string().default(""),event:z.string().min(1),timeOfDay:z.string().default("unspecified"),location:z.string().default(""),characterNames:z.array(z.string()).default([]),propNames:z.array(z.string()).default([])});
const InitialState=z.object({characterName:z.string().min(1),currentLocation:z.string().default(""),position:z.string().default(""),bodyDirection:z.string().default(""),pose:z.string().default(""),expression:z.string().default("neutral"),currentOutfit:z.string().default(""),heldObjects:z.array(z.string()).default([]),injuries:z.array(z.string()).default([]),dirtyClothes:z.boolean().default(false),wetClothes:z.boolean().default(false)});
const GlobalOutput=z.object({storySummary:z.string().min(1),characters:z.array(Character).default([]),locations:z.array(Location).default([]),props:z.array(Prop).default([]),timeline:z.array(Timeline).default([]),initialCharacterStates:z.array(InitialState).default([])});
const Beat=z.object({sourceText:z.string().default(""),storyBeat:z.string().min(1),type:z.enum(["action","reaction","reveal","dialogue","transition","environment","object","emotion"]).default("action"),characterNames:z.array(z.string()).default([]),locationName:z.string().default(""),action:z.string().default(""),reaction:z.string().default(""),dialogue:z.array(Dialogue).default([]),importantProps:z.array(z.string()).default([]),stateAfter:z.string().default("")});
const BeatOutput=z.object({beats:z.array(Beat).min(1).max(90),chunkEndState:z.string().min(1)});

const GLOBAL_SYSTEM=`You are StoryFrame Manga Director. Return strict JSON only. This is the GLOBAL continuity pass for a long story. Extract stable reusable Character, Location and Prop bibles, a compact whole-story summary, chronological timeline and initial physical state. Preserve story facts and chronology. Do not invent major events. Existing locked StoryFrame entities are authoritative. Do NOT produce panel beats in this pass.`;
const BEAT_SYSTEM=`You are StoryFrame Manga Beat Director. Return strict JSON only. Visible dialogue is selective because final video narration carries explanation: retain only short plot-essential spoken lines, strong reactions, or critical system/quest/reward information; avoid redundant narration and long stat dumps. Convert ONLY the supplied story chunk into extremely small sequential visual beats. One beat equals ONE visible action, ONE visible reaction, ONE reveal, ONE dialogue turn with visible acting, ONE object insert, or ONE explicit transition. Never compress a multi-step event. Never reorder or skip important chunk events. The GLOBAL bibles are authoritative. Start exactly from PREVIOUS CHUNK END STATE, and end with an explicit chunkEndState for the next chunk. Source text stays in the original language.`;

function issueSummary(error:z.ZodError){return error.issues.slice(0,12).map((issue)=>`${issue.path.map(String).join(".")||"root"}: ${issue.message}`).join("; ")}
async function requestValidated<T>(model:MangaMasterInput["analysisModel"],systemPrompt:string,userPrompt:string,schema:z.ZodType<T>,maxTokens:number){
  if(!isStoryAnalysisModel(model))throw new Error("Unsupported xKiro manga analysis model.");
  let completion=await xkiroJsonCompletion({model,systemPrompt,userPrompt,temperature:.1,maxTokens});
  let normalized=normalizeMangaStructuredData(completion.json);
  let parsed=schema.safeParse(normalized);
  if(!parsed.success){
    const repair=`${userPrompt}\n\nREPAIR RETRY: Previous JSON failed schema validation: ${issueSummary(parsed.error)}. Return the COMPLETE corrected JSON object only. Previous JSON: ${JSON.stringify(normalized).slice(0,40000)}`;
    completion=await xkiroJsonCompletion({model,systemPrompt,userPrompt:repair,temperature:.03,maxTokens});
    normalized=normalizeMangaStructuredData(completion.json);
    parsed=schema.safeParse(normalized);
  }
  if(!parsed.success)throw new Error(`Long-story manga analysis returned incomplete structured data: ${issueSummary(parsed.error)}`);
  return parsed.data;
}

function splitLongStory(story:string,maxChars=12000){
  const paragraphs=story.split(/\n{2,}/).map((item)=>item.trim()).filter(Boolean);
  const chunks:string[]=[];let current="";
  const push=(piece:string)=>{
    if(!piece)return;
    if((current?current.length+2:0)+piece.length<=maxChars){current=current?`${current}\n\n${piece}`:piece;return}
    if(current){chunks.push(current);current=""}
    if(piece.length<=maxChars){current=piece;return}
    const sentences=piece.split(/(?<=[.!?।])\s+/).filter(Boolean);let inner="";
    for(const sentence of sentences){
      if((inner?inner.length+1:0)+sentence.length<=maxChars)inner=inner?`${inner} ${sentence}`:sentence;
      else{if(inner)chunks.push(inner);inner=sentence.length<=maxChars?sentence:"";if(sentence.length>maxChars){for(let i=0;i<sentence.length;i+=maxChars)chunks.push(sentence.slice(i,i+maxChars))}}
    }
    current=inner;
  };
  for(const paragraph of paragraphs)push(paragraph);
  if(current)chunks.push(current);
  return chunks.length?chunks:[story];
}

export function shouldUseLongStoryAnalysis(story:string){
  const words=story.trim().split(/\s+/).filter(Boolean).length;
  // Manga master analysis is the heaviest structured Gemini request. A single
  // 2k+ word chapter can spend the full 120s request window while trying to
  // emit every fine-grained beat at once. Route medium/long chapters through
  // the existing sequential chunk analyzer instead: one compact global pass,
  // then smaller ordered beat chunks that preserve continuity.
  return story.length>9000||words>1800;
}

export async function analyzeLongMangaMaster(input:MangaMasterInput):Promise<MangaMasterAnalysis>{
  if(!isStoryAnalysisModel(input.analysisModel))throw new Error("Unsupported xKiro manga analysis model.");
  if(!MANGA_STYLE_PRESETS.includes(input.stylePreset))throw new Error("Unsupported manga style preset.");
  const style=MANGA_STYLE_PROMPTS[input.stylePreset];
  const globalPrompt=`PROJECT: ${input.projectName}\nCHAPTER: ${input.chapterTitle}\nSTYLE: ${input.stylePreset} — ${style}\n\nEXISTING LOCKED CHARACTERS:\n${JSON.stringify(input.existingCharacters)}\n\nEXISTING LOCKED LOCATIONS:\n${JSON.stringify(input.existingLocations)}\n\nEXISTING LOCKED PROPS:\n${JSON.stringify(input.existingProps)}\n\nFULL STORY:\n${input.story}\n\nReturn exactly:\n{"storySummary":"compact whole-story summary","characters":[{"name":"","role":"","gender":"","approximateAge":"","face":{"shape":"","eyes":"","eyebrows":"","nose":"","mouth":"","specialFeatures":""},"hair":{"color":"","style":"","length":""},"body":{"build":"","height":"","proportions":""},"defaultOutfit":"","currentOutfit":"","accessories":[],"importantObjects":[],"consistencyNotes":""}],"locations":[{"name":"","architecture":"","layout":{},"importantProps":[],"lighting":"","timeOfDay":"","continuityNotes":""}],"props":[{"name":"","appearance":"","currentOwner":"","currentLocation":"","condition":"","continuityNotes":""}],"timeline":[{"sourceText":"","event":"","timeOfDay":"","location":"","characterNames":[],"propNames":[]}],"initialCharacterStates":[{"characterName":"","currentLocation":"","position":"","bodyDirection":"","pose":"","expression":"","currentOutfit":"","heldObjects":[],"injuries":[],"dirtyClothes":false,"wetClothes":false}]}`;
  const global=await requestValidated(input.analysisModel,GLOBAL_SYSTEM,globalPrompt,GlobalOutput,12000);
  const chunks=splitLongStory(input.story);
  const beats:z.infer<typeof Beat>[]=[];
  let previousState="Story start. Use the extracted initialCharacterStates as the authoritative opening physical state.";
  for(let index=0;index<chunks.length;index+=1){
    const chunk=chunks[index];
    const prompt=`LONG STORY CHUNK ${index+1}/${chunks.length}\nMANGA STYLE: ${input.stylePreset} — ${style}\nGLOBAL SUMMARY: ${global.storySummary}\nGLOBAL CHARACTERS: ${JSON.stringify(global.characters)}\nGLOBAL LOCATIONS: ${JSON.stringify(global.locations)}\nGLOBAL PROPS: ${JSON.stringify(global.props)}\nPREVIOUS CHUNK END STATE: ${previousState}\n\nSOURCE CHUNK (analyze every important visible event in order):\n${chunk}\n\nReturn exactly {"beats":[{"sourceText":"exact source segment","storyBeat":"one immediately visible beat","type":"action|reaction|reveal|dialogue|transition|environment|object|emotion","characterNames":[],"locationName":"","action":"","reaction":"","dialogue":[{"speaker":"","text":"","emotion":"","bubbleType":"speech|thought|shout|whisper|narration"}],"importantProps":[],"stateAfter":"exact physical/story state after this beat"}],"chunkEndState":"exact state after the final beat, suitable for the next chunk"}. Do not repeat events already represented by PREVIOUS CHUNK END STATE.`;
    const result=await requestValidated(input.analysisModel,BEAT_SYSTEM,prompt,BeatOutput,12000);
    beats.push(...result.beats);
    previousState=result.chunkEndState;
    if(beats.length>300)throw new Error("This story expands beyond StoryFrame's current 300 manga-beat chapter limit. Split it into multiple chapters so continuity can remain reliable.");
  }

  const initialCharacterStates:Record<string,MangaCharacterState>={};
  for(const item of global.initialCharacterStates){initialCharacterStates[item.characterName]={characterId:item.characterName,currentLocation:item.currentLocation,position:item.position,bodyDirection:item.bodyDirection,pose:item.pose,expression:item.expression,currentOutfit:item.currentOutfit,heldObjects:item.heldObjects,injuries:item.injuries,dirtyClothes:item.dirtyClothes,wetClothes:item.wetClothes}}
  return {
    storySummary:global.storySummary,
    characters:global.characters,
    locations:global.locations.map((item,index)=>({id:`manga-loc-${index+1}`,...item})),
    props:global.props.map((item,index)=>({id:`manga-prop-${index+1}`,...item})),
    timeline:global.timeline.map((item,index)=>({id:`timeline-${index+1}`,...item})),
    beats:beats.map((item,index)=>({id:`beat-${index+1}`,...item})),
    initialCharacterStates,
    provider:`xKiro · ${input.analysisModel} · long-story sequential chunks`
  };
}
