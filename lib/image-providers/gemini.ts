import type {ImageGenerationInput,ImageProvider} from "./types";

const DEFAULT_MODEL="gemini-3.1-flash-lite-image";
const ENDPOINT="https://generativelanguage.googleapis.com/v1beta/interactions";

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

export const geminiImageProvider:ImageProvider={
  id:"gemini",
  name:"Gemini 3.1 Flash Lite Image · Nano Banana 2 Lite",
  defaultModel:process.env.GEMINI_IMAGE_MODEL?.trim()||DEFAULT_MODEL,
  capabilities:{
    textToImage:true,
    imageReference:false,
    imageToImage:true,
    characterReference:false,
    negativePrompt:false,
    deterministicSeed:false
  },
  responseKind:"gemini-json",
  isConfigured(){
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  },
  buildRequest(input:ImageGenerationInput){
    const apiKey=process.env.GEMINI_API_KEY?.trim();
    if(!apiKey) throw new Error("Gemini image generation is not configured. Add GEMINI_API_KEY in Vercel Environment Variables.");

    const model=input.model||geminiImageProvider.defaultModel;
    const avoidance=input.negativePrompt?.trim()?`AVOID / NEGATIVE CONTINUITY: ${input.negativePrompt.trim()}`:"";
    const seedAnchor=`StoryFrame continuity variation anchor: ${input.seed}. Treat this number only as a stable creative anchor; do not render it as text.`;
    const prompt=[input.prompt,avoidance,seedAnchor,"Generate exactly one image. No captions, no watermark text, no logo, no UI."].filter(Boolean).join("\n\n");

    return {
      url:ENDPOINT,
      method:"POST" as const,
      headers:{
        "x-goog-api-key":apiKey,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model,
        input:[{type:"text",text:prompt}],
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
