import {cloudflareImageProvider} from "./cloudflare";
import {geminiImageProvider} from "./gemini";
import {pollinationsImageProvider} from "./pollinations";
import type {ImageGenerationInput,ImageGenerationResult,ImageProvider} from "./types";

const providers:Record<string,ImageProvider>={
  gemini:geminiImageProvider,
  cloudflare:cloudflareImageProvider,
  pollinations:pollinationsImageProvider
};

export function getImageProvider(id="gemini"){
  return providers[id]||geminiImageProvider;
}

export function listImageProviders(){
  return Object.values(providers).map((provider)=>({id:provider.id,name:provider.name,defaultModel:provider.defaultModel,capabilities:provider.capabilities,configured:provider.isConfigured?provider.isConfigured():true}));
}

function preferredProviderId(){
  // User-selected StoryFrame behavior: Gemini is the image-generation provider whenever its key exists.
  // Text/story analysis remains on the existing Pollinations/local continuity pipeline.
  if(geminiImageProvider.isConfigured?.())return "gemini";
  return process.env.STORYFRAME_DEFAULT_IMAGE_PROVIDER?.trim().toLowerCase()||"gemini";
}

function extractGeminiImage(payload:unknown){
  const data=payload as {
    output_image?:{data?:unknown;mime_type?:unknown};
    steps?:Array<{content?:Array<{type?:unknown;data?:unknown;mime_type?:unknown}>}>;
  };

  const direct=data.output_image;
  if(direct&&typeof direct.data==="string"&&direct.data){
    return {data:direct.data,mimeType:typeof direct.mime_type==="string"?direct.mime_type:"image/jpeg"};
  }

  for(const step of data.steps||[]){
    for(const part of step.content||[]){
      if(part.type==="image"&&typeof part.data==="string"&&part.data){
        return {data:part.data,mimeType:typeof part.mime_type==="string"?part.mime_type:"image/jpeg"};
      }
    }
  }
  return null;
}

async function executeProvider(provider:ImageProvider,input:ImageGenerationInput):Promise<ImageGenerationResult>{
  if(provider.isConfigured&&!provider.isConfigured())throw new Error(`${provider.name} is not configured.`);
  const model=input.model||provider.defaultModel;
  const spec=await provider.buildRequest({...input,model});
  const response=await fetch(spec.url,{method:spec.method,headers:spec.headers,body:spec.body,cache:"no-store"});

  if(!response.ok){
    const message=await response.text().catch(()=>"");
    throw new Error(`${provider.name} image request failed (${response.status})${message?`: ${message.replace(/\s+/g," ").slice(0,500)}`:""}`);
  }

  let imageDataUrl:string;
  let sourceUrl:string|undefined;

  if(provider.responseKind==="cloudflare-json"){
    const payload=await response.json() as {success?:boolean;result?:{image?:string};errors?:Array<{message?:string}>};
    const image=payload.result?.image;
    if(typeof image!=="string"||!image)throw new Error(payload.errors?.[0]?.message||`${provider.name} returned no image data.`);
    imageDataUrl=`data:image/png;base64,${image}`;
  }else if(provider.responseKind==="gemini-json"){
    const payload=await response.json();
    const image=extractGeminiImage(payload);
    if(!image)throw new Error(`${provider.name} returned no generated image.`);
    imageDataUrl=`data:${image.mimeType};base64,${image.data}`;
  }else{
    const contentType=response.headers.get("content-type")||"image/jpeg";
    const bytes=Buffer.from(await response.arrayBuffer());
    imageDataUrl=`data:${contentType};base64,${bytes.toString("base64")}`;
    sourceUrl=spec.url;
  }

  const requestedReferences=input.referenceImages?.length||0;
  const referenceCount=provider.capabilities.imageReference?Math.min(requestedReferences,4):0;
  const warnings:string[]=[];
  if(requestedReferences&&!provider.capabilities.imageReference){
    warnings.push(`${provider.name} is running in StoryFrame text-only continuity mode. Stored reference images were not sent.`);
  }
  if(!provider.capabilities.deterministicSeed){
    warnings.push(`${provider.name} does not expose a deterministic image seed parameter. StoryFrame preserves the scene seed as continuity metadata/prompt anchor; Regenerate Same may not be pixel-identical.`);
  }

  return {
    imageDataUrl,
    sourceUrl,
    model,
    provider:provider.id,
    seed:input.seed,
    referenceCount,
    referenceMode:referenceCount?"reference":"text-only",
    capabilities:provider.capabilities,
    warning:warnings.length?warnings.join(" "):undefined
  };
}

export async function generateImageWithFallback(input:ImageGenerationInput):Promise<ImageGenerationResult>{
  const desired=getImageProvider(preferredProviderId());

  if(desired.id==="pollinations")return executeProvider(desired,input);

  try{
    return await executeProvider(desired,input);
  }catch(error){
    const primaryError=error instanceof Error?error.message:"Primary provider failed";
    const fallback=await executeProvider(pollinationsImageProvider,{...input,model:pollinationsImageProvider.defaultModel,referenceImages:[]});
    return {
      ...fallback,
      fallbackUsed:true,
      primaryError,
      warning:`${desired.name} primary generation was unavailable, so StoryFrame used Pollinations flux-anime fallback. ${primaryError}`
    };
  }
}
