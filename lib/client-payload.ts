"use client";

const DEFAULT_MAX_REFERENCE_BYTES=300_000;
const DEFAULT_MAX_EDGE=768;
const DEFAULT_TOTAL_DATA_URL_CHARS=2_200_000;

function isDataUrl(value:string){return value.startsWith("data:image/")}
function approximateBinaryBytes(dataUrl:string){const comma=dataUrl.indexOf(",");if(comma<0)return dataUrl.length;const payload=dataUrl.slice(comma+1);return Math.ceil(payload.length*0.75)}

function loadImage(src:string){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error("Reference image could not be prepared for upload."));
    image.src=src;
  });
}

function canvasDataUrl(canvas:HTMLCanvasElement,quality:number){
  const webp=canvas.toDataURL("image/webp",quality);
  if(webp.startsWith("data:image/webp"))return webp;
  return canvas.toDataURL("image/jpeg",quality);
}

export async function compactImageDataUrl(value:string,maxBytes=DEFAULT_MAX_REFERENCE_BYTES,maxEdge=DEFAULT_MAX_EDGE){
  if(!isDataUrl(value)||approximateBinaryBytes(value)<=maxBytes)return value;
  const image=await loadImage(value);
  let scale=Math.min(1,maxEdge/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height));
  let best=value;

  for(let pass=0;pass<4;pass+=1){
    const width=Math.max(1,Math.round((image.naturalWidth||image.width)*scale));
    const height=Math.max(1,Math.round((image.naturalHeight||image.height)*scale));
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d");if(!context)throw new Error("Browser image compressor is unavailable.");
    context.drawImage(image,0,0,width,height);
    for(const quality of [0.82,0.72,0.62,0.52,0.44]){
      const output=canvasDataUrl(canvas,quality);
      if(output.length<best.length)best=output;
      if(approximateBinaryBytes(output)<=maxBytes)return output;
    }
    scale*=0.78;
  }
  return best;
}

export async function prepareImageReferences(values:string[],maxImages=4){
  const output:string[]=[];let dataChars=0;
  for(const value of values.filter(Boolean).slice(0,maxImages)){
    if(!isDataUrl(value)){output.push(value);continue}
    try{
      const compacted=await compactImageDataUrl(value);
      if(dataChars+compacted.length>DEFAULT_TOTAL_DATA_URL_CHARS)continue;
      dataChars+=compacted.length;output.push(compacted);
    }catch{
      // Never send an old multi-megabyte data URL that could make Vercel reject the whole request.
      if(value.length<420_000&&dataChars+value.length<=DEFAULT_TOTAL_DATA_URL_CHARS){dataChars+=value.length;output.push(value)}
    }
  }
  return output;
}

export async function preparePrimaryImage(value:string){
  if(!isDataUrl(value))return value;
  return compactImageDataUrl(value,420_000,896);
}

const BINARY_KEYS=new Set(["manualReferenceImage","imageDataUrl","generatedImage","generatedImageSourceUrl","referenceImage","referenceImageSourceUrl","composedImageDataUrl"]);

export function stripBinaryMedia<T>(value:T):T{
  const visit=(input:unknown,key?:string):unknown=>{
    if(key==="referenceImages")return [];
    if(key&&BINARY_KEYS.has(key))return undefined;
    if(Array.isArray(input))return input.map((item)=>visit(item)).filter((item)=>item!==undefined);
    if(input&&typeof input==="object"){
      const next:Record<string,unknown>={};
      for(const [childKey,childValue] of Object.entries(input as Record<string,unknown>)){
        const mapped=visit(childValue,childKey);if(mapped!==undefined)next[childKey]=mapped;
      }
      return next;
    }
    return input;
  };
  return visit(value) as T;
}
