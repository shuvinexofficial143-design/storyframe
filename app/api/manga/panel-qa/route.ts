import {NextResponse} from "next/server";
import {z} from "zod";
import {STORY_ANALYSIS_MODELS} from "@/lib/story-analysis-models";
import {XKiroRequestError,xkiroVisionJsonCompletion} from "@/lib/xkiro";

const ImageValue=z.string().min(20).max(8_000_000).refine((value)=>value.startsWith("data:image/")||/^https:\/\//i.test(value),"Expected an image data URL or HTTPS URL");
const Input=z.object({
  analysisModel:z.enum(STORY_ANALYSIS_MODELS),
  image:ImageValue,
  referenceImages:z.array(ImageValue).max(2).default([]),
  storyBeat:z.string().min(1).max(4000),
  expectedCharacters:z.array(z.string()).max(12).default([]),
  expectedLocation:z.string().max(1000).default(""),
  expectedProps:z.array(z.string()).max(20).default([]),
  expectedOutfitState:z.string().max(4000).default(""),
  stylePreset:z.string().max(120).default("Classic Black & White Manga")
});

const Check=z.enum(["pass","warning","fail"]);
const Output=z.object({
  pass:z.boolean(),
  confidence:z.coerce.number().min(0).max(1).default(.5),
  checks:z.object({
    storyMatch:Check,
    characterCount:Check,
    identityConsistency:Check,
    outfitContinuity:Check,
    propContinuity:Check,
    mangaStyle:Check,
    unexpectedText:Check,
    anatomy:Check
  }),
  issues:z.array(z.string()).max(20).default([]),
  recommendation:z.enum(["accept","review","regenerate"])
});

const SYSTEM=`You are StoryFrame Manga Panel QA, a strict visual continuity inspector. The FIRST supplied image is the newly generated manga panel. Any following images are canonical character/reference images for comparison. Return strict JSON only. Inspect only what is visually observable; do not invent missing evidence. Verify the panel depicts the expected story beat, has the expected number/identity of characters, preserves visible outfit/hair/face facts when references are supplied, includes important props when they should be visible, is genuine black-and-white manga rather than colored anime/3D/game art, contains no unexpected rendered captions/speech bubbles/logos/watermarks, and has no obvious extra limbs or severe anatomy defects. A check may be "warning" when the crop/angle makes a fact impossible to verify. Set pass=false when regeneration is clearly warranted.`;

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid manga panel QA request",details:parsed.error.flatten()},{status:400});
    const input=parsed.data;
    const prompt=`EXPECTED STORY BEAT: ${input.storyBeat}\nEXPECTED CHARACTERS: ${input.expectedCharacters.join(", ")||"none / environment or object panel"}\nEXPECTED LOCATION: ${input.expectedLocation||"not specified"}\nEXPECTED IMPORTANT PROPS: ${input.expectedProps.join(", ")||"none"}\nEXPECTED OUTFIT / STATE: ${input.expectedOutfitState||"use supplied canonical references and visible continuity"}\nMANGA STYLE PRESET: ${input.stylePreset}\n\nReturn exactly:\n{"pass":true,"confidence":0.0,"checks":{"storyMatch":"pass|warning|fail","characterCount":"pass|warning|fail","identityConsistency":"pass|warning|fail","outfitContinuity":"pass|warning|fail","propContinuity":"pass|warning|fail","mangaStyle":"pass|warning|fail","unexpectedText":"pass|warning|fail","anatomy":"pass|warning|fail"},"issues":[],"recommendation":"accept|review|regenerate"}`;
    const result=await xkiroVisionJsonCompletion({model:input.analysisModel,systemPrompt:SYSTEM,userPrompt:prompt,images:[input.image,...input.referenceImages],temperature:0,maxTokens:1800});
    const checked=Output.safeParse(result.json);
    if(!checked.success){
      console.error("xKiro manga panel QA schema failure",checked.error.flatten());
      return NextResponse.json({error:"Panel QA returned incomplete structured data."},{status:502});
    }
    return NextResponse.json({provider:`xKiro Vision · ${input.analysisModel}`,...checked.data});
  }catch(error){
    if(error instanceof XKiroRequestError){console.error("xKiro panel QA failed",{code:error.code,status:error.status,message:error.message});return NextResponse.json({error:error.message},{status:error.status||502})}
    console.error("Manga panel QA failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Manga panel QA failed"},{status:502});
  }
}
