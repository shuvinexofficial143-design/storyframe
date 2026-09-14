"use client";

import {useEffect} from "react";
import {prepareImageReferences,preparePrimaryImage,stripBinaryMedia} from "@/lib/client-payload";

const TEXT_ONLY_ENDPOINTS=new Set([
  "/api/analyze",
  "/api/manga/analyze",
  "/api/manga/analyze-continuity",
  "/api/manga/production-plan"
]);
const IMAGE_ENDPOINTS=new Set([
  "/api/manga/image-continuity",
  "/api/manga/image",
  "/api/manga/panel-qa",
  "/api/generate"
]);
// Stay comfortably below Vercel's request-body hard limit. Base64 is ASCII,
// while normal story text can contain multi-byte UTF-8 characters, so use a
// conservative character budget instead of trying to sit near the edge.
const SAFE_REQUEST_CHARS=3_200_000;

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

function emergencyShrink(path:string,payload:Record<string,unknown>){
  const next={...payload};
  if(path==="/api/manga/image-continuity"||path==="/api/manga/image"){
    // Character identity references are already encoded into the prompt. When
    // an old project still contains unusually large binary data, keeping the
    // first reference is safer than letting Vercel reject the whole request.
    next.referenceImages=Array.isArray(next.referenceImages)?next.referenceImages.slice(0,1):[];
    return next;
  }
  if(path==="/api/manga/panel-qa"){
    next.referenceImages=[];
    return next;
  }
  if(path==="/api/generate"&&Array.isArray(next.characters)){
    let keptReference=false;
    next.characters=next.characters.map((value)=>{
      if(!value||typeof value!=="object")return value;
      const character={...(value as Record<string,unknown>)};
      if(typeof character.referenceImageSourceUrl==="string"&&!keptReference){
        keptReference=true;
      }else{
        delete character.referenceImageSourceUrl;
      }
      delete character.referenceImage;
      return character;
    });
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
      if(!TEXT_ONLY_ENDPOINTS.has(url.pathname)&&!IMAGE_ENDPOINTS.has(url.pathname))return nativeFetch(input,init);
      try{
        const parsed=JSON.parse(init.body) as Record<string,unknown>;
        let payload=TEXT_ONLY_ENDPOINTS.has(url.pathname)?stripBinaryMedia(parsed):await compactImageRequest(url.pathname,parsed);
        let body=JSON.stringify(payload);
        if(body.length>SAFE_REQUEST_CHARS&&IMAGE_ENDPOINTS.has(url.pathname)){
          payload=emergencyShrink(url.pathname,payload);
          body=JSON.stringify(payload);
          console.warn(`StoryFrame reduced ${url.pathname} payload to avoid Vercel request-size rejection.`);
        }
        // Text-only payloads have all binary media removed. If one is still
        // unusually large, send the sanitized version rather than falling back
        // to the original body, which may contain megabytes of embedded images.
        return nativeFetch(input,{...init,body});
      }catch(error){
        console.warn("StoryFrame payload guard could not compact request",error);
        // Do not re-send a known oversized JSON body when compaction itself
        // failed; the normal request is safe only when it is already small.
        if(init.body.length>SAFE_REQUEST_CHARS){
          return Promise.resolve(new Response(JSON.stringify({error:"Request contains oversized embedded media. Regenerate or remove the old reference image and retry."}),{status:413,headers:{"Content-Type":"application/json"}}));
        }
        return nativeFetch(input,init);
      }
    };
    return()=>{window.fetch=nativeFetch};
  },[]);
  return null;
}
