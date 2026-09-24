import {narrationAccessToken,narrationProjectId} from "./narration-google-auth";

export const DEFAULT_NARRATION_TTS_MODEL="gemini-3.1-flash-tts-preview";
export const DEFAULT_NARRATION_VOICE="Kore";
export const DEFAULT_NARRATION_STYLE="Fast-paced Hindi fantasy/anime recap voice. Speak like the protagonist is personally recounting what is happening right now: direct, energetic, confident and slightly raw. Keep sentences short, transitions quick, and emphasize sudden danger, attacks, wins, losses, ranks, numbers, rewards and discoveries when present. Use natural micro-pauses after strong actions and reveals, but do not become theatrical or documentary-like. Avoid formal newsreader cadence and avoid reading every line with the same rhythm. Pronunciation must stay clear and human.";

const MAX_FIELD_BYTES=3900;
function trimUtf8(value:string,maxBytes=MAX_FIELD_BYTES){
  const text=value.trim();
  if(Buffer.byteLength(text,"utf8")<=maxBytes)return text;
  let low=0,high=text.length;
  while(low<high){const mid=Math.ceil((low+high)/2);if(Buffer.byteLength(text.slice(0,mid),"utf8")<=maxBytes)low=mid;else high=mid-1}
  return text.slice(0,low).trim();
}

export async function synthesizeNarrationSegment(input:{text:string;voice?:string;stylePrompt?:string;languageCode?:string}){
  const project=narrationProjectId();
  if(!project)throw new Error("Narration TTS is not configured. Add NARRATION_TTS_PROJECT_ID in Vercel.");
  const token=await narrationAccessToken();
  const text=trimUtf8(input.text);
  if(!text)throw new Error("Narration TTS received empty text.");
  const prompt=trimUtf8(input.stylePrompt||DEFAULT_NARRATION_STYLE);
  const voice=(input.voice||DEFAULT_NARRATION_VOICE).trim();
  const model=process.env.NARRATION_TTS_MODEL?.trim()||DEFAULT_NARRATION_TTS_MODEL;
  const response=await fetch("https://texttospeech.googleapis.com/v1/text:synthesize",{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"x-goog-user-project":project,"Content-Type":"application/json"},
    body:JSON.stringify({
      input:{prompt,text},
      voice:{languageCode:input.languageCode||"hi-IN",name:voice,modelName:model},
      audioConfig:{audioEncoding:"MP3"}
    }),
    cache:"no-store"
  });
  const raw=await response.text();
  if(!response.ok)throw new Error(`Narration TTS failed (${response.status}) model=${model} voice=${voice} textBytes=${Buffer.byteLength(text,"utf8")} promptBytes=${Buffer.byteLength(prompt,"utf8")}: ${raw.replace(/\s+/g," ").slice(0,500)}`);
  const parsed=JSON.parse(raw) as {audioContent?:string};
  if(!parsed.audioContent)throw new Error("Narration TTS returned no audio.");
  return {audioDataUrl:`data:audio/mpeg;base64,${parsed.audioContent}`};
}
