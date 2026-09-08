import type {ImageGenerationInput,ImageProvider} from "./types";

export const POLLINATIONS_PUBLIC_IMAGE_BASE="https://image.pollinations.ai";

export function buildPollinationsPublicUrl(input:ImageGenerationInput){
  const url=new URL(`${POLLINATIONS_PUBLIC_IMAGE_BASE}/prompt/${encodeURIComponent(input.prompt)}`);
  url.searchParams.set("model",input.model||"flux-anime");
  url.searchParams.set("seed",String(input.seed));
  url.searchParams.set("width",String(input.width));
  url.searchParams.set("height",String(input.height));
  url.searchParams.set("nologo","true");
  return url.toString();
}

export const pollinationsImageProvider:ImageProvider={
  id:"pollinations",
  name:"Pollinations Public · flux-anime",
  defaultModel:"flux-anime",
  capabilities:{
    textToImage:true,
    imageReference:false,
    imageToImage:false,
    characterReference:false,
    negativePrompt:false
  },
  responseKind:"binary",
  isConfigured(){return true},
  buildRequest(input){
    return {url:buildPollinationsPublicUrl({...input,model:input.model||"flux-anime"}),method:"GET",headers:{Accept:"image/*"}};
  }
};
