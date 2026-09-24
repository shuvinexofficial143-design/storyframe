import {NextResponse} from "next/server";
import {z} from "zod";
import {generateImageWithFallback,isRetryableImageProviderFailure} from "@/lib/image-providers";
import {persistGeneratedImage} from "@/lib/media-store";

function isPolicyBlocked(error:unknown){
  return error instanceof Error&&/PROHIBITED_CONTENT|blockReason["']?\s*:\s*["']?(?:PROHIBITED_CONTENT|SAFETY)/i.test(error.message);
}

function conservativePagePrompt(prompt:string){
  // A policy-block retry should describe only visible, non-graphic staging.
  // Keep names/layout/style anchors where possible, but remove narrative prose
  // that can contain violence, sexual context, or other safety-triggering text.
  const lines=prompt.split(/\n+/).map((line)=>line.trim()).filter(Boolean);
  const safe=lines.filter((line)=>!/(blood|gore|kill|murder|dead|death|corpse|wound|injur|tortur|suicide|self[- ]harm|rape|sexual|nude|naked|bedroom intimacy|explicit|weapon attack|stab|shoot)/i.test(line));
  return [
    "Create a non-graphic, policy-safe black-and-white manga page using the established character and location references.",
    "Preserve the requested panel count, reading order, character identity, clothing, camera composition and continuity.",
    "Show tense or dramatic moments through facial expressions, posture, lighting and reaction shots only. No graphic injury, sexual content, nudity, abuse, or explicit violence.",
    ...safe.slice(0,18)
  ].join(" ").slice(0,12000);
}

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
    // Keep the visual/story intent, but strip wording that commonly causes a
    // neutral manga illustration request to be rejected before generation.
    const safePrompt=prompt
      .replace(/\b(?:gore|gory|graphic(?:ally)?|mutilat(?:e|ed|ion)|dismember(?:ed|ment)?|decapitat(?:e|ed|ion)|disembowel(?:ed|ment)?|corpse|dead body|suicide|self[- ]harm|tortur(?:e|ed|ing)|rape|sexual assault|explicit sex|nude|naked)\b/gi,"")
      .replace(/\s{2,}/g," ")
      .trim();
    const safeNegativePrompt=negativePrompt
      ?.replace(/\b(?:gore|gory|mutilation|dismemberment|decapitation|corpse|suicide|self[- ]harm|rape|sexual assault|explicit sex|nude|naked)\b/gi,"")
      .replace(/\s{2,}/g," ")
      .trim();
    const model=process.env.GEMINI_PAGE_IMAGE_MODEL?.trim()||undefined;
    const width=1200;
    const height=1800;
    // Manga pages are continuity-critical. Keep one request in flight from the
    // browser queue, but allow an in-family Gemini model failover on temporary
    // quota/capacity errors. Public text-only fallback remains disabled.
    let result;
    try{
      result=await generateImageWithFallback({prompt:safePrompt,seed,width,height,negativePrompt:safeNegativePrompt,referenceImages,model,allowFallback:false,retryProvider:true});
    }catch(error){
      if(!isPolicyBlocked(error))throw error;
      console.warn("Manga page prompt was policy-blocked; retrying once with conservative visual staging.",{seed});
      result=await generateImageWithFallback({
        prompt:conservativePagePrompt(safePrompt),
        seed,
        width,
        height,
        negativePrompt:"no graphic violence, no injury detail, no sexual content, no nudity, no abuse, no disturbing imagery, no text except short story dialogue",
        referenceImages,
        model,
        allowFallback:false,
        retryProvider:false
      });
    }
    const media=await persistGeneratedImage({imageDataUrl:result.imageDataUrl,filename:`manga-page-${seed}.webp`,metadata:{type:"manga-page",seed,model:result.model,provider:result.provider}});

    return NextResponse.json({
      imageDataUrl:media.imageUrl,
      sourceUrl:media.imageUrl,
      mediaId:media.id,
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
