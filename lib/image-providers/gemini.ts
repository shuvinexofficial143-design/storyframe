import sharp from "sharp";
import type {ImageGenerationInput,ImageProvider} from "./types";

const DEFAULT_MODEL="gemini-3.1-flash-image";
const MAX_REFERENCE_EDGE=896;
const GOOGLE_SCOPE="https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TOKEN_URL="https://oauth2.googleapis.com/token";

const ASPECTS=[
  {id:"1:1",value:1},
  {id:"3:2",value:3/2},
  {id:"2:3",value:2/3},
  {id:"3:4",value:3/4},
  {id:"4:3",value:4/3},
  {id:"4:5",value:4/5},
  {id:"5:4",value:5/4},
  {id:"9:16",value:9/16},
  {id:"16:9",value:16/9},
  {id:"21:9",value:21/9}
] as const;

function nearestAspect(width:number,height:number){const ratio=width/height;return ASPECTS.reduce((best,item)=>Math.abs(item.value-ratio)<Math.abs(best.value-ratio)?item:best).id}

function projectId(){return process.env.VERTEX_AI_PROJECT_ID?.trim()||process.env.GOOGLE_CLOUD_PROJECT_ID?.trim()||process.env.GOOGLE_CLOUD_PROJECT?.trim()||""}
function apiKey(){return process.env.GEMINI_API_KEY?.trim()||process.env.GOOGLE_API_KEY?.trim()||process.env.VERTEX_AI_API_KEY?.trim()||process.env.GOOGLE_CLOUD_API_KEY?.trim()||""}
function location(){return process.env.VERTEX_AI_LOCATION?.trim()||process.env.GOOGLE_CLOUD_LOCATION?.trim()||"global"}
function parseDataUrl(value:string){const match=value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);if(!match)return null;return {mimeType:match[1],bytes:Buffer.from(match[2],"base64")}}
async function loadReference(value:string,index:number){
  const inline=parseDataUrl(value);let bytes:Buffer;
  if(inline)bytes=inline.bytes;else{const response=await fetch(value,{cache:"no-store"});if(!response.ok)throw new Error(`Vertex Gemini reference image ${index+1} could not be loaded (${response.status}).`);bytes=Buffer.from(await response.arrayBuffer())}
  const prepared=await sharp(bytes).rotate().resize({width:MAX_REFERENCE_EDGE,height:MAX_REFERENCE_EDGE,fit:"inside",withoutEnlargement:true}).jpeg({quality:88,mozjpeg:true}).toBuffer();
  return {inlineData:{mimeType:"image/jpeg",data:prepared.toString("base64")}};
}

function endpoint(model:string){const project=projectId();const region=location();const host=region==="global"?"aiplatform.googleapis.com":`${region}-aiplatform.googleapis.com`;return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`}

export const geminiImageProvider:ImageProvider={
  id:"gemini",
  name:"Google Cloud Vertex AI · Gemini 3.1 Flash Image",
  defaultModel:process.env.GEMINI_IMAGE_MODEL?.trim()||DEFAULT_MODEL,
  capabilities:{textToImage:true,imageReference:true,imageToImage:true,characterReference:true,negativePrompt:false,deterministicSeed:false},
  responseKind:"gemini-json",
  isConfigured(){return Boolean(projectId()&&apiKey())},
  async buildRequest(input:ImageGenerationInput){
    const project=projectId();const key=apiKey();
    if(!project)throw new Error("Vertex AI image generation is not configured. Add VERTEX_AI_PROJECT_ID (the Google Cloud project ID, not only the display name) in Vercel Environment Variables.");
    if(!key)throw new Error("Vertex AI image generation is not configured. Add GEMINI_API_KEY or GOOGLE_API_KEY in Vercel Environment Variables.");
    const model=input.model||geminiImageProvider.defaultModel;const references=(input.referenceImages||[]).filter(Boolean).slice(0,4);const referenceInputs=await Promise.all(references.map((value,index)=>loadReference(value,index)));const avoidance=input.negativePrompt?.trim()?`AVOID / NEGATIVE CONTINUITY: ${input.negativePrompt.trim()}`:"";const seedAnchor=`StoryFrame continuity anchor: ${input.seed}. Gemini does not expose a deterministic image seed parameter, so use this number only as a stable creative continuity cue and never render it as text.`;
    const referenceInstruction=references.length?"REFERENCE PRIORITY: preserve the exact identity and visual facts from the supplied reference images. StoryFrame orders recurring character references first, environment/location references second, and the immediately previous generated frame last. Keep the same face, hairstyle, apparent age, body proportions, costume design and colors, recurring architecture, props and visual world. Change only the action, pose, camera, lighting, emotion or story-authorized state required by the current request.":"";
    const providerInstruction="Generate exactly ONE image that follows the supplied visual style, subject, continuity and composition. It may be a manga panel, cinematic frame, character reference or other StoryFrame asset; do not override the requested style. Return image and text modalities as required by Vertex Gemini image models. No captions, speech bubbles, watermark text, logo or UI unless the supplied request explicitly requires a non-image overlay (StoryFrame normally adds text itself).";
    const prompt=[input.prompt,referenceInstruction,avoidance,seedAnchor,providerInstruction].filter(Boolean).join("\n\n");
    const url=new URL(endpoint(model));const headers:Record<string,string>={"Content-Type":"application/json; charset=utf-8"};url.searchParams.set("key",key);
    return {url:url.toString(),method:"POST" as const,headers,body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},...referenceInputs]}],generationConfig:{responseModalities:["TEXT","IMAGE"],imageConfig:{aspectRatio:nearestAspect(input.width,input.height),imageSize:"1K"}}})};
  }
};
