import {NextResponse} from "next/server";
import {z} from "zod";
import {generateImageWithFallback} from "@/lib/image-providers";

const Input=z.object({
  name:z.string().min(1).max(120),
  referencePrompt:z.string().min(10).max(8000),
  seed:z.number().int().min(1).max(99_999_999),
  view:z.enum(["primary","full-body"]).default("primary")
});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid character reference request",details:parsed.error.flatten()},{status:400});

    const {name,referencePrompt,seed,view}=parsed.data;
    const prompt=[
      `Canonical character reference for ${name}.`,
      referencePrompt,
      view==="full-body"
        ?"Full-body standing reference, entire costume and footwear visible, neutral pose, clean simple background."
        :"Front or three-quarter portrait, face clearly visible, neutral expression, full hairstyle visible, primary costume details readable.",
      "This is the master StoryFrame identity asset. Make the face distinctive and repeatable. Preserve exact facial structure, eye color, hairstyle, apparent age, body proportions, costume silhouette, colors and signature accessories. No text, labels, watermark or logo."
    ].join(" ");

    const result=await generateImageWithFallback({prompt,seed,width:448,height:448,referenceImages:[]});

    return NextResponse.json({
      imageDataUrl:result.imageDataUrl,
      sourceUrl:result.sourceUrl||result.imageDataUrl,
      model:result.model,
      provider:result.provider,
      seed:result.seed,
      capabilities:result.capabilities,
      fallbackUsed:result.fallbackUsed||false,
      primaryError:result.primaryError,
      warning:result.warning
    });
  }catch(error){
    console.error("Continuity character reference generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Character reference generation failed"},{status:502});
  }
}
