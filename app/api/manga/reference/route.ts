import {NextResponse} from "next/server";
import {z} from "zod";

const Input=z.object({
  name:z.string().min(1).max(120),
  referencePrompt:z.string().min(10).max(6000),
  seed:z.number().int().min(1).max(99_999_999)
});

const PUBLIC_IMAGE_BASE="https://image.pollinations.ai/prompt";
const IMAGE_MODEL="flux-anime";

function buildReferenceUrl(input:{prompt:string;seed:number}){
  const url=new URL(`${PUBLIC_IMAGE_BASE}/${encodeURIComponent(input.prompt)}`);
  url.searchParams.set("width","512");
  url.searchParams.set("height","768");
  url.searchParams.set("model",IMAGE_MODEL);
  url.searchParams.set("nologo","true");
  url.searchParams.set("seed",String(input.seed));
  return url.toString();
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success){
      return NextResponse.json({error:"Invalid character reference request",details:parsed.error.flatten()},{status:400});
    }

    const {name,referencePrompt,seed}=parsed.data;
    const prompt=[
      `Canonical anime/manhwa character reference portrait for ${name}.`,
      referencePrompt,
      "Single recurring character only, waist-up three-quarter portrait, face clearly visible, neutral expression, clean simple background, full hairstyle visible, costume details clearly readable.",
      "This is the master identity reference: make the face distinctive and repeatable. Preserve the exact same face shape, eye color, hairstyle, hair length, age impression, skin tone, body proportions, outfit silhouette and signature accessories in every future depiction.",
      "flux-anime, polished manhwa/anime illustration, highly detailed, cinematic soft lighting, clean anatomy. No text, no labels, no watermark, no logo."
    ].join(" ");

    const sourceUrl=buildReferenceUrl({prompt,seed});
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
        throw new Error(`Pollinations public flux-anime reference request failed (${response.status})${message?`: ${message.replace(/\s+/g," ").slice(0,400)}`:""}`);
      }

      const contentType=response.headers.get("content-type")||"image/jpeg";
      const bytes=Buffer.from(await response.arrayBuffer());
      return NextResponse.json({
        imageDataUrl:`data:${contentType};base64,${bytes.toString("base64")}`,
        model:IMAGE_MODEL,
        seed,
        sourceUrl
      });
    }finally{
      clearTimeout(timer);
    }
  }catch(error){
    console.error("Character public flux-anime reference generation failed",error);
    const message=error instanceof Error?error.message:"Character reference generation failed";
    return NextResponse.json({
      error:message.includes("aborted")?"Pollinations flux-anime reference generation timed out. Please retry.":message
    },{status:502});
  }
}
