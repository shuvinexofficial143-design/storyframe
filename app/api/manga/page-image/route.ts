import {NextResponse} from "next/server";
import {z} from "zod";
import {generateImageWithFallback,isRetryableImageProviderFailure} from "@/lib/image-providers";

const Input=z.object({
  prompt:z.string().min(40).max(40000),
  seed:z.number().int().min(1).max(99_999_999),
  negativePrompt:z.string().optional(),
  referenceImages:z.array(z.string()).max(4).default([])
});

export const maxDuration=120;

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid manga page image request",details:parsed.error.flatten()},{status:400});

    const {prompt,seed,negativePrompt,referenceImages}=parsed.data;
    const model=process.env.GEMINI_PAGE_IMAGE_MODEL?.trim()||undefined;
    const width=1200;
    const height=1800;
    // Manga pages are continuity-critical. Do not silently switch image models
    // on a temporary Gemini quota spike; let the browser queue pause and retry.
    const result=await generateImageWithFallback({prompt,seed,width,height,negativePrompt,referenceImages,model,allowFallback:false});

    return NextResponse.json({
      imageDataUrl:result.imageDataUrl,
      sourceUrl:result.sourceUrl||result.imageDataUrl,
      model:result.model,
      provider:result.provider,
      seed:result.seed,
      width,
      height,
      pageMode:true,
      referenceCount:result.referenceCount,
      referenceMode:result.referenceMode,
      capabilities:result.capabilities,
      fallbackUsed:result.fallbackUsed||false,
      primaryError:result.primaryError,
      warning:result.warning
    });
  }catch(error){
    console.error("Full manga page generation failed",error);
    const message=error instanceof Error?error.message:"Manga page generation failed";
    if(isRetryableImageProviderFailure(error)){
      const quota=/\b429\b|resource exhausted|quota|rate limit|too many requests/i.test(message);
      return NextResponse.json({error:message,retryable:true},{status:quota?429:503});
    }
    return NextResponse.json({error:message},{status:502});
  }
}
