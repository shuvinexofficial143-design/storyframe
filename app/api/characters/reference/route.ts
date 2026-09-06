import {NextResponse} from "next/server";
import {z} from "zod";
import type {Character} from "@/lib/types";
import {hashString,pollinationsImageToDataUri} from "@/lib/pollinations";

const CharacterInput=z.object({id:z.string(),name:z.string(),role:z.string(),appearance:z.string(),outfit:z.string(),locked:z.boolean(),referencePrompt:z.string().optional(),consistencyNotes:z.string().optional(),referenceImage:z.string().optional(),referenceImageSourceUrl:z.string().optional(),referenceSeed:z.number().optional()});
const Input=z.object({character:CharacterInput,visualStyle:z.string().default("Cinematic Film (Ultra-Photorealistic)")});

function buildReferencePrompt(character:Character,visualStyle:string,seed:number){
  return [
    `Create a high-quality reusable character reference portrait for ${character.name}.`,
    `Role: ${character.role}.`,
    `Appearance: ${character.appearance}.`,
    `Outfit: ${character.outfit}.`,
    character.consistencyNotes||"Keep face shape, hairstyle, body silhouette and costume identity memorable and repeatable.",
    `Visual style: ${visualStyle}.`,
    `Show a polished front-facing or three-quarter portrait with clean cinematic lighting, visible facial features and clearly readable costume details.`,
    `Keep the background simple so the character identity is easy to reuse in later scenes.`,
    `Character seed: ${seed}.`,
    `No text, no watermark, no logo, no UI.`
  ].join("\n\n");
}

export async function POST(req:Request){
  try{
    const parsed=Input.safeParse(await req.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid character reference request"},{status:400});
    const {character,visualStyle}=parsed.data;
    const seed=character.referenceSeed||hashString(character.name+character.appearance+character.outfit);
    const prompt=buildReferencePrompt(character as Character,visualStyle,seed);
    const result=await pollinationsImageToDataUri({prompt,aspectRatio:"4:5",seed,modelOverride:process.env.POLLINATIONS_IMAGE_MODEL||"flux"});
    return NextResponse.json({image:result.dataUri,sourceUrl:result.sourceUrl,provider:result.provider,seed,prompt,model:result.model});
  }catch(error){
    console.error("Character reference generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Character reference generation failed"},{status:502});
  }
}
