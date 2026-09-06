import {NextResponse} from "next/server";
import {z} from "zod";
import type {Character} from "@/lib/types";
import {hashString, pollinationsImageToDataUri} from "@/lib/pollinations";

const CharacterInput=z.object({id:z.string(),name:z.string(),role:z.string(),appearance:z.string(),outfit:z.string(),locked:z.boolean(),referencePrompt:z.string().optional(),consistencyNotes:z.string().optional(),referenceImage:z.string().optional(),referenceImageSourceUrl:z.string().optional(),referenceSeed:z.number().optional()});
const Input=z.object({character:CharacterInput,visualStyle:z.string().default("Cinematic Anime Realism")});

function buildReferencePrompt(character:Character,visualStyle:string,seed:number){
  return [
    `Create a clean character reference portrait for ${character.name}.`,
    `Role: ${character.role}.`,
    `Appearance: ${character.appearance}.`,
    `Outfit: ${character.outfit}.`,
    `${character.consistencyNotes||"Keep face shape, hairstyle and silhouette memorable and repeatable."}`,
    `Visual style: ${visualStyle}.`,
    `Show a polished front-facing or three-quarter hero portrait with a simple studio or parchment-like background and clear readable costume details.`,
    `This image will be used as the locked reference design for later scene generation. Character seed: ${seed}.`,
    `No text, no watermark, no logo.`
  ].join("\n\n");
}

export async function POST(req:Request){
  const parsed=Input.safeParse(await req.json());
  if(!parsed.success) return NextResponse.json({error:"Invalid request"},{status:400});

  const {character,visualStyle}=parsed.data;
  const seed=character.referenceSeed||hashString(character.name+character.appearance+character.outfit);
  const prompt=buildReferencePrompt(character as Character,visualStyle,seed);

  try{
    const result=await pollinationsImageToDataUri({prompt,aspectRatio:"4:5",seed});
    return NextResponse.json({image:result.dataUri,sourceUrl:result.sourceUrl,provider:result.provider,seed,prompt,model:result.model});
  }catch(error){
    console.error("Pollinations character reference generation failed",error);
    return NextResponse.json({error:"Character reference generation failed"},{status:500});
  }
}
