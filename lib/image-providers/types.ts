export type ImageProviderCapabilities={
  textToImage:boolean;
  imageReference:boolean;
  imageToImage:boolean;
  characterReference:boolean;
  negativePrompt:boolean;
};

export type ImageGenerationInput={
  prompt:string;
  seed:number;
  width:number;
  height:number;
  model:string;
  negativePrompt?:string;
  referenceImages?:string[];
};

export type ImageProviderRequest={
  url:string;
  method:"GET"|"POST";
  headers?:Record<string,string>;
  body?:BodyInit;
};

export interface ImageProvider{
  id:string;
  name:string;
  capabilities:ImageProviderCapabilities;
  defaultModel:string;
  buildRequest(input:ImageGenerationInput):ImageProviderRequest;
}
