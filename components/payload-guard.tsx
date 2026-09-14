"use client";

import {useEffect} from "react";
import {prepareImageReferences,preparePrimaryImage,stripBinaryMedia} from "@/lib/client-payload";

const TEXT_ONLY_ENDPOINTS=new Set([
  "/api/analyze",
  "/api/manga/analyze",
  "/api/manga/analyze-continuity",
  "/api/manga/production-plan"
]);

async function compactImageRequest(path:string,payload:Record<string,unknown>){
  const next={...payload};
  if(path==="/api/manga/image-continuity"||path==="/api/manga/image"){
    const refs=Array.isArray(next.referenceImages)?next.referenceImages.filter((value):value is string=>typeof value==="string"):[];
    next.referenceImages=await prepareImageReferences(refs,4);
    return next;
  }
  if(path==="/api/manga/panel-qa"){
    if(typeof next.image==="string")next.image=await preparePrimaryImage(next.image);
    const refs=Array.isArray(next.referenceImages)?next.referenceImages.filter((value):value is string=>typeof value==="string"):[];
    next.referenceImages=await prepareImageReferences(refs,2);
    return next;
  }
  if(path==="/api/generate"){
    if(next.scene&&typeof next.scene==="object"){
      const scene={...(next.scene as Record<string,unknown>)};
      delete scene.generatedImage;delete scene.generatedImageSourceUrl;
      next.scene=scene;
    }
    if(Array.isArray(next.characters)){
      next.characters=await Promise.all(next.characters.map(async(value)=>{
        if(!value||typeof value!=="object")return value;
        const character={...(value as Record<string,unknown>)};
        const refs=[character.referenceImageSourceUrl,character.referenceImage].filter((item):item is string=>typeof item==="string"&&item.length>0);
        const safe=await prepareImageReferences(refs,1);
        delete character.referenceImage;delete character.referenceImageSourceUrl;
        if(safe[0])character.referenceImageSourceUrl=safe[0];
        return character;
      }));
    }
    return next;
  }
  return next;
}

export function PayloadGuard(){
  useEffect(()=>{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(!init?.body||typeof init.body!=="string")return nativeFetch(input,init);
      const raw=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
      let url:URL;try{url=new URL(raw,window.location.origin)}catch{return nativeFetch(input,init)}
      if(url.origin!==window.location.origin)return nativeFetch(input,init);
      if(!TEXT_ONLY_ENDPOINTS.has(url.pathname)&&!["/api/manga/image-continuity","/api/manga/image","/api/manga/panel-qa","/api/generate"].includes(url.pathname))return nativeFetch(input,init);
      try{
        const parsed=JSON.parse(init.body) as Record<string,unknown>;
        const payload=TEXT_ONLY_ENDPOINTS.has(url.pathname)?stripBinaryMedia(parsed):await compactImageRequest(url.pathname,parsed);
        return nativeFetch(input,{...init,body:JSON.stringify(payload)});
      }catch(error){
        console.warn("StoryFrame payload guard could not compact request",error);
        return nativeFetch(input,init);
      }
    };
    return()=>{window.fetch=nativeFetch};
  },[]);
  return null;
}
