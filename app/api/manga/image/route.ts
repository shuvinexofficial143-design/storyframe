import {NextResponse} from "next/server";
import {z} from "zod";

const Input=z.object({
  prompt:z.string().min(10).max(18000),
  seed:z.number().int().min(1).max(99_999_999),
  width:z.number().int().min(512).max(1536).default(1024),
  height:z.number().int().min(512).max(1536).default(576),
  referenceImages:z.array(z.string().min(20)).max(3).default([])
});

type GeneratedImage={imageDataUrl:string;model:string;referenceMode:"reference-edit"|"text-to-image";warning?:string};

function parseDataUrl(value:string){
  const match=value.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if(!match) throw new Error("Reference image must be a base64 data URL");
  return {mime:match[1],bytes:Buffer.from(match[2],"base64")};
}

async function fetchBinaryAsDataUrl(url:string,apiKey:string){
  const response=await fetch(url,{headers:{Authorization:`Bearer ${apiKey}`},cache:"no-store"});
  if(!response.ok) throw new Error(`Reference result fetch failed (${response.status})`);
  const contentType=response.headers.get("content-type")||"image/png";
  const bytes=Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function generateWithReferenceEdits(input:{prompt:string;referenceImages:string[];width:number;height:number;apiKey:string}) : Promise<GeneratedImage>{
  const model=process.env.POLLINATIONS_MANGA_CONSISTENCY_MODEL?.trim()||"klein";
  const form=new FormData();
  for(const [index,dataUrl] of input.referenceImages.slice(0,2).entries()){
    const parsed=parseDataUrl(dataUrl);
    const extension=parsed.mime.includes("png")?"png":"jpg";
    form.append("image",new Blob([parsed.bytes],{type:parsed.mime}),`character-${index+1}.${extension}`);
  }
  form.append("prompt",`${input.prompt}\n\nREFERENCE IMAGE PRIORITY: preserve the exact identity, face shape, eyes, nose, mouth, hairstyle, age impression, skin tone, body proportions and clothing design of the supplied character reference image(s). Change only pose, expression, camera and scene environment as required by the story.`);
  form.append("model",model);
  form.append("size",`${input.width}x${input.height}`);

  const response=await fetch("https://gen.pollinations.ai/v1/images/edits",{
    method:"POST",
    headers:{Authorization:`Bearer ${input.apiKey}`},
    body:form,
    cache:"no-store"
  });
  const raw=await response.text();
  if(!response.ok) throw new Error(`Reference model ${model} failed (${response.status}): ${raw.replace(/\s+/g," ").slice(0,350)}`);

  const payload=JSON.parse(raw) as {data?:Array<{b64_json?:string;url?:string}>};
  const item=payload.data?.[0];
  if(item?.b64_json) return {imageDataUrl:`data:image/png;base64,${item.b64_json}`,model,referenceMode:"reference-edit"};
  if(item?.url) return {imageDataUrl:await fetchBinaryAsDataUrl(item.url,input.apiKey),model,referenceMode:"reference-edit"};
  throw new Error(`Reference model ${model} returned no image data`);
}

async function generateWithFlux(input:{prompt:string;seed:number;width:number;height:number;apiKey:string;warning?:string}):Promise<GeneratedImage>{
  const model=process.env.POLLINATIONS_IMAGE_MODEL?.trim()||"flux";
  const url=new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(input.prompt)}`);
  url.searchParams.set("model",model);
  url.searchParams.set("width",String(input.width));
  url.searchParams.set("height",String(input.height));
  url.searchParams.set("seed",String(input.seed));
  url.searchParams.set("nologo","true");
  url.searchParams.set("safe","true");
  url.searchParams.set("enhance","true");

  const response=await fetch(url.toString(),{headers:{Authorization:`Bearer ${input.apiKey}`},cache:"no-store"});
  if(!response.ok){
    const message=await response.text();
    throw new Error(`Pollinations ${response.status}: ${message.slice(0,500)}`);
  }
  const contentType=response.headers.get("content-type")||"image/jpeg";
  const bytes=Buffer.from(await response.arrayBuffer());
  return {imageDataUrl:`data:${contentType};base64,${bytes.toString("base64")}`,model,referenceMode:"text-to-image",warning:input.warning};
}

export async function POST(request:Request){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(Number(process.env.POLLINATIONS_IMAGE_TIMEOUT_MS||0),90000));
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid image request",details:parsed.error.flatten()},{status:400});
    const apiKey=process.env.POLLINATIONS_API_KEY?.trim();
    if(!apiKey) return NextResponse.json({error:"POLLINATIONS_API_KEY is not configured on the server."},{status:401});

    const {prompt,seed,width,height,referenceImages}=parsed.data;
    let result:GeneratedImage;

    if(referenceImages.length){
      try{
        result=await Promise.race([
          generateWithReferenceEdits({prompt,referenceImages,width,height,apiKey}),
          new Promise<never>((_,reject)=>controller.signal.addEventListener("abort",()=>reject(new Error("Reference generation timed out")),{once:true}))
        ]);
      }catch(error){
        const warning=error instanceof Error?error.message:"Reference model failed";
        result=await generateWithFlux({prompt,seed,width,height,apiKey,warning:`Reference-image mode was unavailable; Flux fallback used. ${warning}`});
      }
    }else{
      result=await generateWithFlux({prompt,seed,width,height,apiKey});
    }

    return NextResponse.json({...result,seed,width,height,referenceCount:referenceImages.length});
  }catch(error){
    console.error("Manga scene image generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Image generation failed"},{status:502});
  }finally{
    clearTimeout(timer);
  }
}
