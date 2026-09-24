import {NextResponse} from "next/server";
import {z} from "zod";
import {generateImageWithFallback,isRetryableImageProviderFailure} from "@/lib/image-providers";
import {persistGeneratedImage} from "@/lib/media-store";

const Input=z.object({
  name:z.string().min(1).max(120),
  referencePrompt:z.string().min(10).max(8000),
  seed:z.number().int().min(1).max(99_999_999),
  view:z.enum(["primary","full-body","three-quarter","side","sheet"]).default("primary")
});

const VIEW_PROMPT={
  primary:"Front portrait, face clearly visible, neutral expression, complete hairstyle visible, primary costume neckline and signature accessories readable, clean simple background.",
  "full-body":"Full-body standing reference, entire costume and footwear visible, neutral pose, clean simple background.",
  "three-quarter":"Three-quarter character reference, face turned about 45 degrees, neutral expression, hairstyle silhouette and primary costume clearly readable, clean simple background.",
  side:"Clean side-profile character reference, exact nose/chin/forehead silhouette, ear and hairstyle profile clearly visible, neutral expression, primary costume readable, clean simple background.",
  sheet:"One clean character model sheet showing the SAME character in four separated reference views: front portrait, three-quarter view, side profile and full-body neutral standing pose. Keep facial identity, hairstyle, age, body proportions, costume and accessories identical across all four views. Plain light background, no labels or text."
} as const;

export const maxDuration=120;

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid character reference request",details:parsed.error.flatten()},{status:400});

    const {name,referencePrompt,seed,view}=parsed.data;
    // Reference sheets only need stable visible identity. Remove common
    // story-context wording that can trip image safety filters even when the
    // intended output is a neutral character turnaround.
    const safeReferencePrompt=referencePrompt
      .replace(/\b(?:blood|bloody|gore|corpse|dead body|murder(?:ed)?|kill(?:ed|ing)?|suicide|self[- ]harm|tortur(?:e|ed|ing)|sexual|nude|naked|explicit)\b/gi,"")
      .replace(/\s{2,}/g," ")
      .trim();
    const prompt=[
      `Canonical character reference for ${name}.`,
      safeReferencePrompt,
      VIEW_PROMPT[view],
      "This is a master StoryFrame identity asset, not a story scene. Make the face distinctive and repeatable. Preserve exact facial structure, eye color, hairstyle, apparent age, body proportions, costume silhouette, colors and signature accessories. No dialogue, captions, labels, watermark, logo or UI."
    ].join(" ");
    const sheet=view==="sheet";
    const result=await generateImageWithFallback({prompt,seed,width:sheet?896:512,height:sheet?1024:512,referenceImages:[],allowFallback:false,retryProvider:false});
    const media=await persistGeneratedImage({imageDataUrl:result.imageDataUrl,filename:`reference-${name.replace(/[^a-zA-Z0-9_-]+/g,"-")}-${view}-${seed}.webp`,metadata:{type:"character-reference",name,view,seed,model:result.model,provider:result.provider}});

    return NextResponse.json({imageDataUrl:media.imageUrl,sourceUrl:media.imageUrl,mediaId:media.id,model:result.model,provider:result.provider,seed:result.seed,view,capabilities:result.capabilities,fallbackUsed:result.fallbackUsed||false,primaryError:result.primaryError,warning:result.warning});
  }catch(error){
    console.error("Continuity character reference generation failed",error);
    const message=error instanceof Error?error.message:"Character reference generation failed";
    if(isRetryableImageProviderFailure(error)){
      const quota=/\b429\b|resource exhausted|quota|rate limit|too many requests/i.test(message);
      return NextResponse.json({error:message,retryable:true},{status:quota?429:503});
    }
    return NextResponse.json({error:message},{status:502});
  }
}
