import {NextResponse} from "next/server";
import {z} from "zod";

const Input=z.object({
  prompt:z.string().min(10).max(14000),
  seed:z.number().int().min(1).max(99_999_999),
  width:z.number().int().min(512).max(1536).default(1024),
  height:z.number().int().min(512).max(1536).default(576)
});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid image request",details:parsed.error.flatten()},{status:400});
    const apiKey=process.env.POLLINATIONS_API_KEY?.trim();
    if(!apiKey) return NextResponse.json({error:"POLLINATIONS_API_KEY is not configured on the server."},{status:401});

    const model=process.env.POLLINATIONS_IMAGE_MODEL?.trim()||"flux";
    const {prompt,seed,width,height}=parsed.data;
    const url=new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`);
    url.searchParams.set("model",model);
    url.searchParams.set("width",String(width));
    url.searchParams.set("height",String(height));
    url.searchParams.set("seed",String(seed));
    url.searchParams.set("nologo","true");
    url.searchParams.set("safe","true");
    url.searchParams.set("enhance","true");

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Number(process.env.POLLINATIONS_IMAGE_TIMEOUT_MS||60000));
    try{
      const response=await fetch(url.toString(),{
        headers:{Authorization:`Bearer ${apiKey}`},
        signal:controller.signal,
        cache:"no-store"
      });
      if(!response.ok){
        const message=await response.text();
        throw new Error(`Pollinations ${response.status}: ${message.slice(0,500)}`);
      }
      const contentType=response.headers.get("content-type")||"image/jpeg";
      const bytes=Buffer.from(await response.arrayBuffer());
      return NextResponse.json({
        imageDataUrl:`data:${contentType};base64,${bytes.toString("base64")}`,
        model,
        seed,
        width,
        height
      });
    }finally{
      clearTimeout(timer);
    }
  }catch(error){
    console.error("Manga scene image generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Image generation failed"},{status:502});
  }
}
