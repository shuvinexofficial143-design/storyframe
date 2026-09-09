import sharp from "sharp";
import type {ImageGenerationInput,ImageProvider} from "./types";

const DEFAULT_MODEL="@cf/black-forest-labs/flux-2-klein-9b";
const MAX_REFERENCE_EDGE=448;

async function referenceToBlob(value:string,index:number){
  const response=await fetch(value,{cache:"no-store"});
  if(!response.ok) throw new Error(`Reference image ${index+1} could not be loaded (${response.status})`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const resized=await sharp(bytes)
    .rotate()
    .resize({width:MAX_REFERENCE_EDGE,height:MAX_REFERENCE_EDGE,fit:"inside",withoutEnlargement:true})
    .png()
    .toBuffer();
  return new Blob([new Uint8Array(resized)],{type:"image/png"});
}

export const cloudflareImageProvider:ImageProvider={
  id:"cloudflare",
  name:"Cloudflare Workers AI · FLUX.2 klein 9B",
  defaultModel:process.env.CLOUDFLARE_IMAGE_MODEL?.trim()||DEFAULT_MODEL,
  capabilities:{
    textToImage:true,
    imageReference:true,
    imageToImage:true,
    characterReference:true,
    negativePrompt:false,
    deterministicSeed:true
  },
  responseKind:"cloudflare-json",
  isConfigured(){
    return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim()&&process.env.CLOUDFLARE_API_TOKEN?.trim());
  },
  async buildRequest(input:ImageGenerationInput){
    const accountId=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken=process.env.CLOUDFLARE_API_TOKEN?.trim();
    if(!accountId||!apiToken) throw new Error("Cloudflare Workers AI is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Vercel.");

    const references=(input.referenceImages||[]).filter(Boolean).slice(0,4);
    const referenceInstruction=references.length
      ?"REFERENCE CONDITIONING PRIORITY: input image 0 has the highest identity priority, followed by image 1, image 2, then image 3. StoryFrame orders references as recurring character references first, environment references second, and the previous scene last. Preserve established character identity, costume, environment geometry and recurring object design while changing only the action, pose, camera and story-authorized state required by this scene."
      :"";
    const avoidance=input.negativePrompt?.trim()?`AVOID / NEGATIVE CONTINUITY: ${input.negativePrompt.trim()}`:"";
    const prompt=[input.prompt,referenceInstruction,avoidance].filter(Boolean).join("\n\n");

    const form=new FormData();
    form.append("prompt",prompt);
    form.append("width",String(input.width));
    form.append("height",String(input.height));
    form.append("seed",String(input.seed));

    for(const [index,reference] of references.entries()){
      const blob=await referenceToBlob(reference,index);
      form.append(`input_image_${index}`,blob,`storyframe-reference-${index}.png`);
    }

    const model=input.model||cloudflareImageProvider.defaultModel;
    return {
      url:`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      method:"POST" as const,
      headers:{Authorization:`Bearer ${apiToken}`},
      body:form
    };
  }
};
