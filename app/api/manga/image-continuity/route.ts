import {NextResponse} from "next/server";
import {z} from "zod";
import {generateImageWithFallback} from "@/lib/image-providers";

const Input=z.object({
  prompt:z.string().min(10).max(24000),
  seed:z.number().int().min(1).max(99_999_999),
  width:z.number().int().min(256).max(1920).default(1024),
  height:z.number().int().min(256).max(1920).default(576),
  negativePrompt:z.string().optional(),
  referenceImages:z.array(z.string()).max(4).default([]),
  provider:z.string().optional()
});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid image request",details:parsed.error.flatten()},{status:400});

    const {prompt,seed,width,height,negativePrompt,referenceImages}=parsed.data;
    const result=await generateImageWithFallback({prompt,seed,width,height,negativePrompt,referenceImages});

    return NextResponse.json({
      imageDataUrl:result.imageDataUrl,
      sourceUrl:result.sourceUrl||result.imageDataUrl,
      model:result.model,
      provider:result.provider,
      seed:result.seed,
      width,
      height,
      referenceCount:result.referenceCount,
      referenceMode:result.referenceMode,
      capabilities:result.capabilities,
      fallbackUsed:result.fallbackUsed||false,
      primaryError:result.primaryError,
      warning:result.warning
    });
  }catch(error){
    console.error("Continuity image generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Image generation failed"},{status:502});
  }
}
