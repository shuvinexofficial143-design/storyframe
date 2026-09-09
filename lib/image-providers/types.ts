export type ImageProviderCapabilities={
  textToImage:boolean;
  imageReference:boolean;
  imageToImage:boolean;
  characterReference:boolean;
  negativePrompt:boolean;
  deterministicSeed:boolean;
};

export type ImageProviderResponseKind="binary"|"cloudflare-json"|"gemini-json";

export type ImageGenerationInput={
  prompt:string;
  seed:number;
  width:number;
  height:number;
  model?:string;
  negativePrompt?:string;
  referenceImages?:string[];
};

export type ImageProviderRequest={
  url:string;
  method:"GET"|"POST";
  headers?:Record<string,string>;
  body?:BodyInit;
};

export type ImageGenerationResult={
  imageDataUrl:string;
  sourceUrl?:string;
  model:string;
  provider:string;
  seed:number;
  referenceCount:number;
  referenceMode:"reference"|"text-only";
  capabilities:ImageProviderCapabilities;
  fallbackUsed?:boolean;
  primaryError?:string;
  warning?:string;
};

export interface ImageProvider{
  id:string;
  name:string;
  capabilities:ImageProviderCapabilities;
  defaultModel:string;
  responseKind:ImageProviderResponseKind;
  isConfigured?:()=>boolean;
  buildRequest(input:ImageGenerationInput):ImageProviderRequest|Promise<ImageProviderRequest>;
}
