import {NextResponse} from "next/server";
import {z} from "zod";
import type {Character, Location, Scene} from "@/lib/types";
import {buildScenePrompt, hashString, pollinationsImageToDataUri} from "@/lib/pollinations";

const CharacterInput=z.object({id:z.string(),name:z.string(),role:z.string(),appearance:z.string(),outfit:z.string(),locked:z.boolean(),referencePrompt:z.string().optional(),consistencyNotes:z.string().optional(),referenceImage:z.string().optional(),referenceImageSourceUrl:z.string().optional(),referenceSeed:z.number().optional()});
const LocationInput=z.object({id:z.string(),name:z.string(),architecture:z.string(),lighting:z.string(),continuity:z.string(),locked:z.boolean()});
const SceneInput=z.object({
  id:z.string(),
  sceneNumber:z.number().int().positive(),
  sourceText:z.string(),
  description:z.string(),
  characterIds:z.array(z.string()),
  locationId:z.string().optional(),
  cameraShot:z.string(),
  cameraAngle:z.string(),
  duration:z.number(),
  imagePrompt:z.string(),
  negativePrompt:z.string(),
  continuityNotes:z.string(),
  generatedImage:z.string().optional(),
  generationSeed:z.number().optional(),
  provider:z.string().optional(),
  generationStatus:z.enum(["idle","queued","generating","completed","failed"])
});
const Input=z.object({
  scene:SceneInput,
  characters:z.array(CharacterInput).default([]),
  location:LocationInput.optional(),
  visualStyle:z.string().default("Cinematic Anime Realism"),
  aspectRatio:z.string().default("16:9")
});

function mockSceneImage(scene:Scene){
  const hue=(scene.sceneNumber*47)%360;
  const lines=scene.imagePrompt.split(/\s+/).reduce<string[]>((acc,word)=>{
    const current=acc[acc.length-1]||"";
    if((current+" "+word).trim().length>58) acc.push(word);
    else acc[acc.length-1]=(current+" "+word).trim();
    return acc;
  },[""]).slice(0,5);
  const tspans=lines.map((line,index)=>`<tspan x="70" dy="${index?30:0}">${line.replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[char]||char))}</tspan>`).join("");
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 55% 22%)"/><stop offset="1" stop-color="#08090c"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/><circle cx="1020" cy="130" r="360" fill="hsl(${(hue+60)%360} 80% 60%)" opacity=".12"/><path d="M0 570 C250 430 420 650 650 530 S1000 430 1280 560 V720 H0Z" fill="#050608" opacity=".75"/><text x="70" y="90" fill="white" font-size="24" font-family="Arial" font-weight="700">STORYFRAME · SCENE ${String(scene.sceneNumber).padStart(3,"0")}</text><text x="70" y="430" fill="white" font-size="24" font-family="Arial" opacity=".9">${tspans}</text><text x="70" y="650" fill="white" opacity=".5" font-size="18" font-family="Arial">Mock Image Provider · ready for Pollinations adapter</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function POST(req:Request){
  const parsed=Input.safeParse(await req.json());
  if(!parsed.success) return NextResponse.json({error:"Invalid request"},{status:400});

  const {scene,characters,location,visualStyle,aspectRatio}=parsed.data;
  const sceneData=scene as Scene;
  const characterData=characters as Character[];
  const locationData=location as Location|undefined;

  const finalPrompt=buildScenePrompt({scene:sceneData,characters:characterData,location:locationData,visualStyle,aspectRatio});
  const seed=scene.generationSeed||hashString(`${scene.id}-${scene.sceneNumber}-${characterData.map(character=>character.referenceSeed||character.name).join("|")}`);

  try{
    const referenceImages=characterData.map((character)=>character.referenceImageSourceUrl).filter(Boolean) as string[];
    const consistencyModel=referenceImages.length?(process.env.POLLINATIONS_CONSISTENCY_MODEL||"kontext"):undefined;
    const result=await pollinationsImageToDataUri({prompt:finalPrompt,aspectRatio,seed,referenceImages,modelOverride:consistencyModel});
    return NextResponse.json({image:result.dataUri,sourceUrl:result.sourceUrl,provider:result.provider,seed,prompt:finalPrompt,model:result.model});
  }catch(error){
    console.error("Pollinations image generation failed, falling back to mock image",error);
    return NextResponse.json({image:mockSceneImage(sceneData),provider:"mock",seed,prompt:finalPrompt});
  }
}
