import type {Character,Location,Scene} from "./types";

const baseUrl=process.env.POLLINATIONS_BASE_URL?.replace(/\/$/,"")||"https://gen.pollinations.ai";
const apiKey=process.env.POLLINATIONS_API_KEY?.trim();
const analyzeTimeoutMs=Number(process.env.POLLINATIONS_ANALYZE_TIMEOUT_MS||10000);
const imageTimeoutMs=Number(process.env.POLLINATIONS_IMAGE_TIMEOUT_MS||45000);

export function hasPollinations(){
  return Boolean(baseUrl);
}

export function getAuthHeaders():Record<string,string>{
  const headers:Record<string,string>={};
  if(apiKey) headers.Authorization=`Bearer ${apiKey}`;
  return headers;
}

export function hashString(value:string){
  let hash=0;
  for(let i=0;i<value.length;i++) hash=(hash*31+value.charCodeAt(i))>>>0;
  return (hash%9000000)+1000;
}

export function aspectRatioToSize(aspectRatio:string){
  const [w,h]=aspectRatio.split(":").map(Number);
  if(!w||!h) return {width:1280,height:720};
  if(w===h) return {width:1024,height:1024};
  if(w>h) return {width:1280,height:Math.max(512,Math.round((1280*h)/w))};
  return {width:Math.max(512,Math.round((1024*w)/h)),height:1024};
}

async function fetchWithTimeout(input:string|URL,init:RequestInit,timeoutMs:number){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(input,{...init,signal:controller.signal});
  }catch(error){
    if(error instanceof Error&&error.name==="AbortError") throw new Error(`Request timed out after ${Math.round(timeoutMs/1000)} seconds`);
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

export function buildCharacterConsistencyBlock(characters:Character[]){
  if(!characters.length) return "";
  const lines=characters.map((character)=>{
    const seed=character.referenceSeed||hashString(character.name+character.appearance+character.outfit);
    const lockInstruction=character.locked?"This character is locked. Match the same face, hairstyle, body type, age and costume closely.":"Keep the face, silhouette and outfit stable unless the story clearly changes them.";
    const referenceInstruction=character.referenceImageSourceUrl?"A character reference image is supplied. Follow it closely for identity, hairstyle and costume.":"No reference image is available yet; follow the written design exactly.";
    return `- ${character.name}. Role: ${character.role}. Appearance: ${character.appearance}. Outfit: ${character.outfit}. ${character.consistencyNotes||""} Character seed: ${seed}. ${referenceInstruction} ${lockInstruction}`.trim();
  });
  return `Character continuity rules:\n${lines.join("\n")}`;
}

export function buildLocationContinuityBlock(location?:Location){
  if(!location) return "";
  return `Location continuity rules:\n- ${location.name}. Architecture: ${location.architecture}. Lighting: ${location.lighting}. Continuity: ${location.continuity}.`;
}

export function buildScenePrompt(input:{scene:Scene;characters:Character[];location?:Location;visualStyle:string;aspectRatio:string}){
  const {scene,characters,location,visualStyle,aspectRatio}=input;
  const characterNames=characters.length?characters.map((character)=>character.name).join(", "):"No named character";
  return [
    `Create one polished, visually strong cinematic frame for scene ${scene.sceneNumber}.`,
    `Scene description: ${scene.description}.`,
    `Narrative moment: ${scene.sourceText}.`,
    `Featured characters: ${characterNames}.`,
    `Camera: ${scene.cameraShot}, ${scene.cameraAngle}.`,
    `Visual style: ${visualStyle}. Target aspect ratio: ${aspectRatio}.`,
    buildCharacterConsistencyBlock(characters),
    buildLocationContinuityBlock(location),
    `Continuity note: ${scene.continuityNotes}.`,
    `Primary image direction: ${scene.imagePrompt}.`,
    `Avoid: ${scene.negativePrompt}.`,
    `Quality rules: cinematic lighting, readable subject separation, coherent anatomy, accurate hands, stable faces, correct proportions, detailed environment, natural depth, no text, no captions, no watermark, no logo, no UI.`,
    `If reference images are supplied, prioritize matching identity and costume over changing the character design.`
  ].filter(Boolean).join("\n\n");
}

export async function pollinationsImageToDataUri(input:{prompt:string;aspectRatio:string;seed:number;transparent?:boolean;referenceImages?:string[];modelOverride?:string}){
  const {prompt,aspectRatio,seed,transparent,referenceImages=[],modelOverride}=input;
  const model=modelOverride||process.env.POLLINATIONS_IMAGE_MODEL||"flux";
  const {width,height}=aspectRatioToSize(aspectRatio);
  const url=new URL(`${baseUrl}/image/${encodeURIComponent(prompt)}`);
  url.searchParams.set("model",model);
  url.searchParams.set("width",String(width));
  url.searchParams.set("height",String(height));
  url.searchParams.set("seed",String(seed));
  url.searchParams.set("safe","true");
  url.searchParams.set("enhance","true");
  if(apiKey){
    url.searchParams.set("private","true");
    url.searchParams.set("nologo","true");
  }
  if(referenceImages.length) url.searchParams.set("image",referenceImages.slice(0,4).join("|"));
  if(transparent) url.searchParams.set("transparent","true");

  const response=await fetchWithTimeout(url.toString(),{headers:getAuthHeaders(),cache:"no-store"},imageTimeoutMs);
  if(!response.ok){
    const errorText=await response.text();
    throw new Error(`Pollinations image request failed (${response.status}): ${errorText.replace(/\s+/g," ").slice(0,220)}`);
  }

  const contentType=response.headers.get("content-type")||"image/jpeg";
  const data=Buffer.from(await response.arrayBuffer()).toString("base64");
  return {dataUri:`data:${contentType};base64,${data}`,sourceUrl:url.toString(),provider:"pollinations",seed,model};
}

function extractFirstJsonObject(value:string){
  const cleaned=value.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start===-1||end===-1||end<=start) throw new Error("JSON object not found in model response");
  return JSON.parse(cleaned.slice(start,end+1));
}

export async function pollinationsAnalyzeStory(input:{story:string;visualStyle:string}){
  const model=process.env.POLLINATIONS_TEXT_MODEL||"openai";
  const system=`You are StoryFrame AI, a visual story director. Return STRICT JSON only, never markdown. Preserve the source chronology and do not invent major plot events. Output keys: summary, characters, locations, scenes. characters[] fields: name, role, appearance, outfit, consistencyNotes. locations[] fields: name, architecture, lighting, continuity. scenes[] fields: sourceText, description, characterNames, locationName, cameraShot, cameraAngle, duration, imagePrompt, negativePrompt, continuityNotes. Create 4-10 visual scenes depending on source length. Break on real visual beats: establishing shot, entrance, action, reveal, reaction, close-up, location change, suspense or payoff. Character and location descriptions must be concrete enough to reuse consistently. imagePrompt must be in English even when the source story is Hindi. Do not put subtitles, narration text, speech bubbles, logos or watermarks inside image prompts.`;
  const user=`Visual style: ${input.visualStyle}\n\nStory:\n${input.story}`;

  const response=await fetchWithTimeout(`${baseUrl}/v1/chat/completions`,{
    method:"POST",
    headers:{"Content-Type":"application/json",...getAuthHeaders()},
    body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:user}],temperature:0.15}),
    cache:"no-store"
  },analyzeTimeoutMs);

  const raw=await response.text();
  if(!response.ok) throw new Error(`Pollinations text request failed (${response.status}): ${raw.replace(/\s+/g," ").slice(0,220)}`);

  let data:unknown;
  try{
    data=JSON.parse(raw);
  }catch{
    throw new Error(`Pollinations returned non-JSON API data: ${raw.replace(/\s+/g," ").slice(0,220)}`);
  }

  const content=(data as {choices?:Array<{message?:{content?:unknown}}>}|null)?.choices?.[0]?.message?.content;
  const text=typeof content==="string"?content:content&&typeof content==="object"?JSON.stringify(content):"";
  if(!text) throw new Error("No analysis content received from Pollinations");
  return {raw:text,json:extractFirstJsonObject(text),provider:"pollinations"};
}
