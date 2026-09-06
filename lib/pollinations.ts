import type {Character, Location, Scene} from "./types";

const baseUrl=process.env.POLLINATIONS_BASE_URL?.replace(/\/$/,"")||"https://gen.pollinations.ai";
const apiKey=process.env.POLLINATIONS_API_KEY?.trim();

export function hasPollinations(){
  return Boolean(baseUrl);
}

export function getAuthHeaders():Record<string,string>{
  return apiKey?{Authorization:`Bearer ${apiKey}`}:{ };
}

export function hashString(value:string){
  let hash=0;
  for(let i=0;i<value.length;i++) hash=(hash*31+value.charCodeAt(i))>>>0;
  return (hash%900000)+1000;
}

export function aspectRatioToSize(aspectRatio:string){
  const [w,h]=aspectRatio.split(":").map(Number);
  if(!w||!h) return {width:1280,height:720};
  if(w===h) return {width:1024,height:1024};
  if(w>h) return {width:1280,height:Math.max(512,Math.round((1280*h)/w))};
  return {width:Math.max(512,Math.round((1024*w)/h)),height:1024};
}

export function buildCharacterConsistencyBlock(characters:Character[]){
  if(!characters.length) return "";
  const lines=characters.map((character)=>{
    const seed=character.referenceSeed||hashString(character.name+character.appearance+character.outfit);
    const lockInstruction=character.locked?"Treat this design as locked and keep the same face, hairstyle, body type and costume.":"Keep the design stable across scenes unless the story explicitly changes it.";
    return `- ${character.name}: ${character.appearance}. Outfit: ${character.outfit}. ${character.consistencyNotes||""} Character seed hint: ${seed}. ${lockInstruction}`.trim();
  });
  return `Character continuity rules:\n${lines.join("\n")}`;
}

export function buildLocationContinuityBlock(location?:Location){
  if(!location) return "";
  return `Location continuity rules:\n- ${location.name}: Architecture ${location.architecture}. Lighting ${location.lighting}. Continuity ${location.continuity}.`;
}

export function buildScenePrompt(input:{scene:Scene;characters:Character[];location?:Location;visualStyle:string;aspectRatio:string}){
  const {scene,characters,location,visualStyle,aspectRatio}=input;
  const charBlock=buildCharacterConsistencyBlock(characters);
  const locBlock=buildLocationContinuityBlock(location);
  return [
    `Create a single polished cinematic frame for scene ${scene.sceneNumber}.`,
    `Story action: ${scene.sourceText}`,
    `Shot design: ${scene.cameraShot}, ${scene.cameraAngle}.`,
    `Visual style: ${visualStyle}. Aspect ratio: ${aspectRatio}.`,
    charBlock,
    locBlock,
    `Scene continuity notes: ${scene.continuityNotes}`,
    `Primary scene prompt: ${scene.imagePrompt}`,
    `Negative prompt / things to avoid: ${scene.negativePrompt}`,
    `No captions, no speech bubbles, no UI, no watermark, no logo.`
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
  if(referenceImages.length) url.searchParams.set("image",referenceImages.join("|"));
  if(transparent) url.searchParams.set("transparent","true");

  const response=await fetch(url.toString(),{headers:{...getAuthHeaders()},cache:"no-store"});
  if(!response.ok) throw new Error(`Pollinations image request failed: ${response.status}`);
  const contentType=response.headers.get("content-type")||"image/jpeg";
  const data=Buffer.from(await response.arrayBuffer()).toString("base64");
  return {dataUri:`data:${contentType};base64,${data}`,sourceUrl:url.toString(),provider:"pollinations",seed,model};
}

function extractFirstJsonObject(value:string){
  const start=value.indexOf("{");
  const end=value.lastIndexOf("}");
  if(start===-1||end===-1||end<=start) throw new Error("JSON object not found");
  return JSON.parse(value.slice(start,end+1));
}

export async function pollinationsAnalyzeStory(input:{story:string;visualStyle:string}){
  const model=process.env.POLLINATIONS_TEXT_MODEL||"openai";
  const system=`You are StoryFrame AI. Analyze a narrative and return strict JSON only. You must produce a compact, production-ready visual breakdown with recurring character consistency and location continuity. Return keys: summary, characters, locations, scenes. characters[] fields: name, role, appearance, outfit, consistencyNotes. locations[] fields: name, architecture, lighting, continuity. scenes[] fields: sourceText, description, characterNames, locationName, cameraShot, cameraAngle, duration, imagePrompt, negativePrompt, continuityNotes. Keep 4-12 scenes depending on story length.`;
  const user=`Visual style: ${input.visualStyle}\n\nStory:\n${input.story}`;
  const response=await fetch(`${baseUrl}/v1/chat/completions`,{
    method:"POST",
    headers:{"Content-Type":"application/json",...getAuthHeaders()},
    body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:user}],temperature:0.2}),
    cache:"no-store"
  });
  if(!response.ok) throw new Error(`Pollinations text request failed: ${response.status}`);
  const data=await response.json();
  const text=data?.choices?.[0]?.message?.content;
  if(typeof text!=="string") throw new Error("No analysis content received");
  return {raw:text,json:extractFirstJsonObject(text),provider:"pollinations"};
}
