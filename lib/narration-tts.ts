import {narrationAccessToken,narrationProjectId} from "./narration-google-auth";

export const DEFAULT_NARRATION_TTS_MODEL="gemini-3.1-flash-tts-preview";
export const DEFAULT_NARRATION_VOICE="Kore";
export const DEFAULT_NARRATION_STYLE="Warm cinematic Hindi storyteller. Sound conversational and engaging, not like a document reader. Use natural pauses, curiosity, tension and emotional emphasis. Keep pronunciation clear and human.";

export async function synthesizeNarrationSegment(input:{text:string;voice?:string;stylePrompt?:string;languageCode?:string}){
  const project=narrationProjectId();
  if(!project)throw new Error("Narration TTS is not configured. Add NARRATION_TTS_PROJECT_ID in Vercel.");
  const token=await narrationAccessToken();
  const response=await fetch("https://texttospeech.googleapis.com/v1/text:synthesize",{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"x-goog-user-project":project,"Content-Type":"application/json"},
    body:JSON.stringify({
      input:{prompt:(input.stylePrompt||DEFAULT_NARRATION_STYLE).slice(0,3800),text:input.text},
      voice:{languageCode:input.languageCode||"hi-IN",name:input.voice||DEFAULT_NARRATION_VOICE,modelName:process.env.NARRATION_TTS_MODEL?.trim()||DEFAULT_NARRATION_TTS_MODEL},
      audioConfig:{audioEncoding:"MP3"}
    }),
    cache:"no-store"
  });
  const raw=await response.text();
  if(!response.ok)throw new Error(`Narration TTS failed (${response.status}): ${raw.replace(/\s+/g," ").slice(0,500)}`);
  const parsed=JSON.parse(raw) as {audioContent?:string};
  if(!parsed.audioContent)throw new Error("Narration TTS returned no audio.");
  return {audioDataUrl:`data:audio/mpeg;base64,${parsed.audioContent}`};
}
