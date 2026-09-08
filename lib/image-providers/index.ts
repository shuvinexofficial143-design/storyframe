import {cloudflareImageProvider} from "./cloudflare";
import {pollinationsImageProvider} from "./pollinations";
import type {ImageGenerationInput,ImageGenerationResult,ImageProvider} from "./types";

const providers:Record<string,ImageProvider>={
  cloudflare:cloudflareImageProvider,
  pollinations:pollinationsImageProvider
};

export function getImageProvider(id="pollinations"){
  return providers[id]||pollinationsImageProvider;
}

export function listImageProviders(){
  return Object.values(providers).map((provider)=>({id:provider.id,name:provider.name,defaultModel:provider.defaultModel,capabilities:provider.capabilities,configured:provider.isConfigured?provider.isConfigured():true}));
}

function preferredProviderId(){
  return process.env.STORYFRAME_DEFAULT_IMAGE_PROVIDER?.trim().toLowerCase()||"cloudflare";
}

async function executeProvider(provider:ImageProvider,input:ImageGenerationInput):Promise<ImageGenerationResult>{
  if(provider.isConfigured&&!provider.isConfigured()) throw new Error(`${provider.name} is not configured.`);
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
    if(typeof image!=="string"||!image) throw new Error(payload.errors?.[0]?.message||`${provider.name} returned no image data.`);
    imageDataUrl=`data:image/png;base64,${image}`;
  }else{
    const contentType=response.headers.get("content-type")||"image/jpeg";
    const bytes=Buffer.from(await response.arrayBuffer());
    imageDataUrl=`data:${contentType};base64,${bytes.toString("base64")}`;
    sourceUrl=spec.url;
  }

  const requestedReferences=input.referenceImages?.length||0;
  const referenceCount=provider.capabilities.imageReference?Math.min(requestedReferences,4):0;
  const warning=requestedReferences&&!provider.capabilities.imageReference
    ?`${provider.name} is text-to-image only. StoryFrame preserved canonical prompt locks and the deterministic seed, but did not send reference images.`
    :undefined;

  return {
    imageDataUrl,
    sourceUrl,
    model,
    provider:provider.id,
    seed:input.seed,
    referenceCount,
    referenceMode:referenceCount?"reference":"text-only",
    capabilities:provider.capabilities,
    warning
  };
}

export async function generateImageWithFallback(input:ImageGenerationInput):Promise<ImageGenerationResult>{
  const desired=getImageProvider(preferredProviderId());

  if(desired.id==="pollinations") return executeProvider(desired,input);

  try{
    return await executeProvider(desired,input);
  }catch(error){
    const primaryError=error instanceof Error?error.message:"Primary provider failed";
    const fallback=await executeProvider(pollinationsImageProvider,{...input,model:pollinationsImageProvider.defaultModel,referenceImages:[]});
    return {
      ...fallback,
      fallbackUsed:true,
      primaryError,
      warning:`Cloudflare primary generation was unavailable, so StoryFrame used Pollinations flux-anime fallback. ${primaryError}`
    };
  }
}
