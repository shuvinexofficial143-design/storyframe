import {NextResponse} from "next/server";
import {z} from "zod";

const Input=z.object({
  prompt:z.string().min(10).max(18000),
  seed:z.number().int().min(1).max(99_999_999),
  width:z.number().int().min(512).max(1536).default(1024),
  height:z.number().int().min(512).max(1536).default(576),
  referenceImages:z.array(z.string().min(20)).max(3).default([])
});

const PUBLIC_IMAGE_BASE="https://image.pollinations.ai/prompt";
const IMAGE_MODEL="flux-anime";

type GeneratedImage={
  imageDataUrl:string;
  model:string;
  referenceMode:"text-to-image";
  sourceUrl:string;
  warning?:string;
};

function buildPublicImageUrl(input:{prompt:string;seed:number;width:number;height:number}){
  const url=new URL(`${PUBLIC_IMAGE_BASE}/${encodeURIComponent(input.prompt)}`);
  url.searchParams.set("width",String(input.width));
  url.searchParams.set("height",String(input.height));
  url.searchParams.set("model",IMAGE_MODEL);
  url.searchParams.set("nologo","true");
  url.searchParams.set("seed",String(input.seed));
  return url.toString();
}

async function generateWithPublicFluxAnime(input:{prompt:string;seed:number;width:number;height:number;referenceCount:number}):Promise<GeneratedImage>{
  const sourceUrl=buildPublicImageUrl(input);
  const controller=new AbortController();
  const timeoutMs=Math.max(Number(process.env.POLLINATIONS_IMAGE_TIMEOUT_MS||0),90000);
  const timer=setTimeout(()=>controller.abort(),timeoutMs);

  try{
    const response=await fetch(sourceUrl,{
      headers:{Accept:"image/*"},
      signal:controller.signal,
      cache:"no-store"
    });

    if(!response.ok){
      const message=await response.text().catch(()=>"");
      throw new Error(`Pollinations public flux-anime request failed (${response.status})${message?`: ${message.replace(/\s+/g," ").slice(0,400)}`:""}`);
    }

    const contentType=response.headers.get("content-type")||"image/jpeg";
    const bytes=Buffer.from(await response.arrayBuffer());
    return {
      imageDataUrl:`data:${contentType};base64,${bytes.toString("base64")}`,
      model:IMAGE_MODEL,
      referenceMode:"text-to-image",
      sourceUrl,
      warning:input.referenceCount>0
        ?"Public flux-anime generation is using the locked character/location prompt tokens and preserved seed. Stored reference images are not sent to a protected edit endpoint."
        :undefined
    };
  }finally{
    clearTimeout(timer);
  }
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success){
      return NextResponse.json({error:"Invalid image request",details:parsed.error.flatten()},{status:400});
    }

    const {prompt,seed,width,height,referenceImages}=parsed.data;

    // Seed is deliberately preserved exactly as supplied by the continuity engine.
    // Recurring character/location identity is carried by the canonical prompt locks
    // already appended to `prompt` before this route is called.
    const result=await generateWithPublicFluxAnime({
      prompt,
      seed,
      width,
      height,
      referenceCount:referenceImages.length
    });

    return NextResponse.json({
      ...result,
      seed,
      width,
      height,
      referenceCount:referenceImages.length
    });
  }catch(error){
    console.error("Manga public flux-anime generation failed",error);
    const message=error instanceof Error?error.message:"Image generation failed";
    return NextResponse.json({
      error:message.includes("aborted")?"Pollinations flux-anime image generation timed out. Please retry.":message
    },{status:502});
  }
}
