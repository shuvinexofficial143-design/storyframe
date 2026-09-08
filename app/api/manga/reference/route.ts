import {NextResponse} from "next/server";
import {z} from "zod";
import {generateImageWithFallback} from "@/lib/image-providers";

const Input=z.object({
  name:z.string().min(1).max(120),
  referencePrompt:z.string().min(10).max(6000),
  seed:z.number().int().min(1).max(99_999_999)
});

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
      "Single recurring character only, front or three-quarter portrait, face clearly visible, neutral expression, clean simple background, full hairstyle visible, costume details clearly readable.",
      "This is the master identity reference: preserve the exact same face shape, eye color, hairstyle, hair length, apparent age, skin tone, body proportions, outfit silhouette and signature accessories in every future depiction.",
      "polished manhwa/anime illustration, highly detailed, cinematic soft lighting, clean anatomy. No text, no labels, no watermark, no logo."
    ].join(" ");

    const result=await generateImageWithFallback({prompt,seed,width:448,height:448,referenceImages:[]});

    return NextResponse.json({
      imageDataUrl:result.imageDataUrl,
      sourceUrl:result.sourceUrl||result.imageDataUrl,
      model:result.model,
      provider:result.provider,
      seed:result.seed,
      fallbackUsed:result.fallbackUsed||false,
      primaryError:result.primaryError,
      warning:result.warning
    });
  }catch(error){
    console.error("Character reference generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Character reference generation failed"},{status:502});
  }
}
