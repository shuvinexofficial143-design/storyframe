import sharp from "sharp";
import type {ImageGenerationInput,ImageProvider} from "./types";

const DEFAULT_MODEL="gemini-3.1-flash-image";
const ENDPOINT="https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_REFERENCE_EDGE=896;

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

function nearestAspect(width:number,height:number){
  const ratio=width/height;
  return ASPECTS.reduce((best,item)=>Math.abs(item.value-ratio)<Math.abs(best.value-ratio)?item:best).id;
}

function parseDataUrl(value:string){
  const match=value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if(!match)return null;
  return {mimeType:match[1],bytes:Buffer.from(match[2],"base64")};
}

async function loadReference(value:string,index:number){
  const inline=parseDataUrl(value);
  let bytes:Buffer;

  if(inline){
    bytes=inline.bytes;
  }else{
    const response=await fetch(value,{cache:"no-store"});
    if(!response.ok)throw new Error(`Gemini reference image ${index+1} could not be loaded (${response.status}).`);
    bytes=Buffer.from(await response.arrayBuffer());
  }

  const prepared=await sharp(bytes)
    .rotate()
    .resize({width:MAX_REFERENCE_EDGE,height:MAX_REFERENCE_EDGE,fit:"inside",withoutEnlargement:true})
    .jpeg({quality:88,mozjpeg:true})
    .toBuffer();

  return {
    type:"image" as const,
    mime_type:"image/jpeg",
    data:prepared.toString("base64")
  };
}

export const geminiImageProvider:ImageProvider={
  id:"gemini",
  name:"Gemini 3.1 Flash Image · Nano Banana 2",
  defaultModel:process.env.GEMINI_IMAGE_MODEL?.trim()||DEFAULT_MODEL,
  capabilities:{
    textToImage:true,
    imageReference:true,
    imageToImage:true,
    characterReference:true,
    negativePrompt:false,
    deterministicSeed:false
  },
  responseKind:"gemini-json",
  isConfigured(){
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  },
  async buildRequest(input:ImageGenerationInput){
    const apiKey=process.env.GEMINI_API_KEY?.trim();
    if(!apiKey)throw new Error("Gemini image generation is not configured. Add GEMINI_API_KEY in Vercel Environment Variables.");

    const model=input.model||geminiImageProvider.defaultModel;
    const references=(input.referenceImages||[]).filter(Boolean).slice(0,4);
    const referenceInputs=await Promise.all(references.map((value,index)=>loadReference(value,index)));
    const avoidance=input.negativePrompt?.trim()?`AVOID / NEGATIVE CONTINUITY: ${input.negativePrompt.trim()}`:"";
    const seedAnchor=`StoryFrame continuity anchor: ${input.seed}. Gemini does not expose a deterministic seed parameter, so use this number only as a stable creative continuity cue and never render it as text.`;
    const referenceInstruction=references.length
      ?"REFERENCE PRIORITY: preserve the exact identity and visual facts from the supplied reference images. StoryFrame orders references as recurring character references first, environment/location references second, and the previous scene last. Keep the same face, hairstyle, apparent age, body proportions, costume design and colors, recurring architecture, props and visual world. Change only the action, pose, camera, lighting, emotion or story-authorized state required by the current scene."
      :"";
    const prompt=[input.prompt,referenceInstruction,avoidance,seedAnchor,"Generate exactly one cinematic storyboard image. No captions, speech bubbles, watermark text, logo or UI."].filter(Boolean).join("\n\n");

    return {
      url:ENDPOINT,
      method:"POST" as const,
      headers:{
        "x-goog-api-key":apiKey,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model,
        input:[{type:"text",text:prompt},...referenceInputs],
        response_format:{
          type:"image",
          mime_type:"image/jpeg",
          aspect_ratio:nearestAspect(input.width,input.height),
          image_size:"1K"
        }
      })
    };
  }
};
