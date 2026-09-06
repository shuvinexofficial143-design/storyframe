import {NextResponse} from "next/server";
import {z} from "zod";

const Input=z.object({
  name:z.string().min(1).max(120),
  referencePrompt:z.string().min(10).max(6000),
  seed:z.number().int().min(1).max(99_999_999)
});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid character reference request",details:parsed.error.flatten()},{status:400});
    const apiKey=process.env.POLLINATIONS_API_KEY?.trim();
    if(!apiKey) return NextResponse.json({error:"POLLINATIONS_API_KEY is not configured on the server."},{status:401});

    const model=process.env.POLLINATIONS_REFERENCE_MODEL?.trim()||"flux";
    const {name,referencePrompt,seed}=parsed.data;
    const prompt=[
      `Canonical character reference portrait for ${name}.`,
      referencePrompt,
      "Single recurring character only, waist-up three-quarter portrait, face clearly visible, neutral expression, clean simple background, full hairstyle visible, costume details clearly readable.",
      "This is the master identity reference for later scenes: make the face distinctive, realistic and repeatable. No text, no labels, no watermark, no logo."
    ].join(" ");

    const url=new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`);
    url.searchParams.set("model",model);
    url.searchParams.set("width","512");
    url.searchParams.set("height","768");
    url.searchParams.set("seed",String(seed));
    url.searchParams.set("nologo","true");
    url.searchParams.set("safe","true");
    url.searchParams.set("enhance","true");

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(Number(process.env.POLLINATIONS_IMAGE_TIMEOUT_MS||0),60000));
    try{
      const response=await fetch(url.toString(),{headers:{Authorization:`Bearer ${apiKey}`},signal:controller.signal,cache:"no-store"});
      if(!response.ok){
        const message=await response.text();
        throw new Error(`Pollinations ${response.status}: ${message.slice(0,500)}`);
      }
      const contentType=response.headers.get("content-type")||"image/jpeg";
      const bytes=Buffer.from(await response.arrayBuffer());
      return NextResponse.json({imageDataUrl:`data:${contentType};base64,${bytes.toString("base64")}`,model,seed});
    }finally{
      clearTimeout(timer);
    }
  }catch(error){
    console.error("Character reference generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Character reference generation failed"},{status:502});
  }
}
