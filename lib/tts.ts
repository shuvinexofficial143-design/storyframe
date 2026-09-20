import {googleAccessToken,googleProjectId} from "./google-cloud-auth";

import {DEFAULT_TTS_VOICE,STORYFRAME_TTS_VOICES,type StoryframeTtsVoice} from "./tts-voices";

export const DEFAULT_TTS_MODEL="gemini-3.1-flash-tts-preview";

function byteLength(value:string){return Buffer.byteLength(value,"utf8")}

export function splitTtsText(text:string,maxBytes=3600){
  const normalized=text.replace(/\r/g,"").trim();
  if(byteLength(normalized)<=maxBytes)return [normalized];
  const paragraphs=normalized.split(/\n{2,}/).flatMap((paragraph)=>{
    if(byteLength(paragraph)<=maxBytes)return [paragraph];
    return paragraph.split(/(?<=[।.!?])\s+/);
  }).filter(Boolean);
  const chunks:string[]=[];
  let current="";
  for(const part of paragraphs){
    if(byteLength(part)>maxBytes){
      const words=part.split(/\s+/);
      for(const word of words){
        const candidate=current?`${current} ${word}`:word;
        if(byteLength(candidate)>maxBytes&&current){chunks.push(current);current=word}else current=candidate;
      }
      continue;
    }
    const candidate=current?`${current}\n\n${part}`:part;
    if(byteLength(candidate)>maxBytes&&current){chunks.push(current);current=part}else current=candidate;
  }
  if(current)chunks.push(current);
  return chunks;
}

export async function synthesizeTtsChunk(input:{
  text:string;
  voice:StoryframeTtsVoice;
  prompt:string;
  languageCode?:string;
  model?:string;
}){
  const project=googleProjectId();
  if(!project)throw new Error("VERTEX_AI_PROJECT_ID is missing.");
  const token=await googleAccessToken();
  const response=await fetch("https://texttospeech.googleapis.com/v1/text:synthesize",{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"x-goog-user-project":project,"Content-Type":"application/json"},
    body:JSON.stringify({
      input:{prompt:input.prompt.slice(0,3800),text:input.text},
      voice:{languageCode:input.languageCode||"hi-IN",name:input.voice,modelName:input.model||process.env.GEMINI_TTS_MODEL?.trim()||DEFAULT_TTS_MODEL},
      audioConfig:{audioEncoding:"MP3"}
    }),
    cache:"no-store"
  });
  const raw=await response.text();
  if(!response.ok)throw new Error(`Google TTS failed (${response.status}): ${raw.replace(/\s+/g," ").slice(0,500)}`);
  const parsed=JSON.parse(raw) as {audioContent?:string};
  if(!parsed.audioContent)throw new Error("Google TTS returned no audio.");
  return Buffer.from(parsed.audioContent,"base64");
}

export async function synthesizeLongNarration(input:{
  text:string;
  voice:StoryframeTtsVoice;
  prompt:string;
  languageCode?:string;
  onChunk?:(done:number,total:number)=>void;
}){
  const chunks=splitTtsText(input.text);
  const audio:Buffer[]=[];
  for(let index=0;index<chunks.length;index+=1){
    audio.push(await synthesizeTtsChunk({...input,text:chunks[index]}));
    input.onChunk?.(index+1,chunks.length);
  }
  return {bytes:Buffer.concat(audio),chunks:chunks.length};
}
