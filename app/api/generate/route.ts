import {NextResponse} from "next/server";
import {z} from "zod";
import type {Character,Location,Scene} from "@/lib/types";
import {buildScenePrompt,hashString,pollinationsImageToDataUri} from "@/lib/pollinations";

const CharacterInput=z.object({id:z.string(),name:z.string(),role:z.string(),appearance:z.string(),outfit:z.string(),locked:z.boolean(),referencePrompt:z.string().optional(),consistencyNotes:z.string().optional(),referenceImage:z.string().optional(),referenceImageSourceUrl:z.string().optional(),referenceSeed:z.number().optional()});
const LocationInput=z.object({id:z.string(),name:z.string(),architecture:z.string(),lighting:z.string(),continuity:z.string(),locked:z.boolean()});
const SceneInput=z.object({id:z.string(),sceneNumber:z.number().int().positive(),sourceText:z.string(),description:z.string(),characterIds:z.array(z.string()),locationId:z.string().optional(),cameraShot:z.string(),cameraAngle:z.string(),duration:z.number(),imagePrompt:z.string(),negativePrompt:z.string(),continuityNotes:z.string(),generatedImage:z.string().optional(),generatedImageSourceUrl:z.string().optional(),generationSeed:z.number().optional(),generationModel:z.string().optional(),referenceCount:z.number().optional(),provider:z.string().optional(),errorMessage:z.string().optional(),generationStatus:z.enum(["idle","queued","generating","completed","failed"])});
const Input=z.object({scene:SceneInput,characters:z.array(CharacterInput).default([]),location:LocationInput.optional(),visualStyle:z.string().default("Cinematic Film (Ultra-Photorealistic)"),aspectRatio:z.string().default("16:9")});

export async function POST(req:Request){
  try{
    const parsed=Input.safeParse(await req.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid scene generation request"},{status:400});

    const {scene,characters,location,visualStyle,aspectRatio}=parsed.data;
    const sceneData=scene as Scene;
    const characterData=characters as Character[];
    const locationData=location as Location|undefined;
    const finalPrompt=buildScenePrompt({scene:sceneData,characters:characterData,location:locationData,visualStyle,aspectRatio});
    const seed=scene.generationSeed||hashString(`${scene.id}-${scene.sceneNumber}-${characterData.map((character)=>character.referenceSeed||character.name).join("|")}`);
    const referenceImages=characterData.filter((character)=>Boolean(character.referenceImageSourceUrl)).sort((a,b)=>Number(b.locked)-Number(a.locked)).slice(0,4).map((character)=>character.referenceImageSourceUrl as string);
    const baseModel=process.env.POLLINATIONS_IMAGE_MODEL||"flux";
    const consistencyModel=process.env.POLLINATIONS_CONSISTENCY_MODEL||"kontext";

    let result;
    let usedReferences=referenceImages.length;
    try{
      result=await pollinationsImageToDataUri({prompt:finalPrompt,aspectRatio,seed,referenceImages,modelOverride:referenceImages.length?consistencyModel:baseModel});
    }catch(firstError){
      if(!referenceImages.length) throw firstError;
      console.error("Reference model failed; retrying Flux without image references",firstError);
      usedReferences=0;
      result=await pollinationsImageToDataUri({prompt:finalPrompt,aspectRatio,seed,referenceImages:[],modelOverride:baseModel});
    }

    return NextResponse.json({image:result.dataUri,sourceUrl:result.sourceUrl,provider:result.provider,seed,prompt:finalPrompt,model:result.model,referenceCount:usedReferences});
  }catch(error){
    console.error("Scene image generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Image generation failed"},{status:502});
  }
}
