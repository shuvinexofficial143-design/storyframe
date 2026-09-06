import {NextResponse} from "next/server";
import {z} from "zod";
import {hashString,hasPollinations,pollinationsAnalyzeStory} from "@/lib/pollinations";

const Input=z.object({story:z.string().min(20).max(100000),visualStyle:z.string().default("Cinematic Film (Ultra-Photorealistic)")});
const shots=["Extreme Wide Shot","Wide Shot","Medium Shot","Medium Close-Up","Close-Up","Over-the-Shoulder","Low Angle"];
const angles=["Eye Level","Three Quarter","Low Angle","High Angle","POV"];
const stop=new Set(["The","He","She","They","This","That","When","After","Before","Inside","Outside","Blue","Ancient"]);
const locRules:[[string,RegExp],...Array<[string,RegExp]>]=[["Internet Cafe",/internet cafe|café|cafe|shop|दुकान/i],["Ancient Haveli",/haveli|हवेली|महल|old mansion|palace/i],["Courtyard",/courtyard|दालान|आंगन/i],["Ancient City",/city|street|town|नगर|शहर|सड़क/i],["Forest",/forest|woods|जंगल/i],["Temple",/temple|मंदिर/i],["Marketplace",/market|bazaar|बाजार/i],["Underground Chamber",/crypt|cellar|basement|underground|तहखाना/i]];

const ExternalCharacter=z.object({name:z.string(),role:z.string().default("Supporting character"),appearance:z.string().default("Maintain a stable face and body design"),outfit:z.string().default("Keep costume continuity"),consistencyNotes:z.string().default("Maintain the same visual identity across scenes")});
const ExternalLocation=z.object({name:z.string(),architecture:z.string().default("Preserve the major environment design"),lighting:z.string().default("Use coherent cinematic lighting"),continuity:z.string().default("Preserve props and layout across scenes")});
const ExternalScene=z.object({sourceText:z.string(),description:z.string(),characterNames:z.array(z.string()).default([]),locationName:z.string().optional(),cameraShot:z.string().default("Medium Shot"),cameraAngle:z.string().default("Eye Level"),duration:z.number().min(2).max(10).default(4),imagePrompt:z.string(),negativePrompt:z.string().default("text, watermark, low quality, deformed hands"),continuityNotes:z.string().default("Carry appearance, costume and environment continuity forward")});
const ExternalPayload=z.object({summary:z.string(),characters:z.array(ExternalCharacter).default([]),locations:z.array(ExternalLocation).default([]),scenes:z.array(ExternalScene).default([])});

function heuristicAnalyze(story:string,visualStyle:string){
  const sentences=story.replace(/\s+/g," ").split(/(?<=[.!?।])\s+/).map((sentence)=>sentence.trim()).filter(Boolean);
  const counts=new Map<string,number>();
  for(const sentence of sentences){
    for(const name of sentence.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g)||[]){
      if(!stop.has(name)) counts.set(name,(counts.get(name)||0)+1);
    }
  }

  let names=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name])=>name);
  if(!names.length) names=["Main Character"];

  const characters=names.map((name,index)=>({id:`char-${index+1}`,name,role:index===0?"Primary character":"Supporting character",appearance:`Consistent ${name} design with identifiable facial structure and story-appropriate age and build`,outfit:"Keep the same approved outfit until the story explicitly changes it",consistencyNotes:"Keep hairstyle, face shape, body silhouette and costume stable across all scenes.",locked:false,referenceSeed:hashString(name)}));
  const found=locRules.filter(([,rule])=>rule.test(story)).map(([name])=>name);
  const locationNames=found.length?found:["Primary Story Location"];
  const locations=locationNames.map((name,index)=>({id:`loc-${index+1}`,name,architecture:`Persistent architecture for ${name}`,lighting:"Cinematic motivated lighting with stable direction and mood",continuity:"Preserve doors, windows, furniture, landmarks and major props unless the story changes them",locked:false}));

  const targetSceneCount=Math.min(8,Math.max(4,Math.ceil(sentences.length/2)));
  const chunkSize=Math.max(1,Math.ceil(sentences.length/targetSceneCount));
  const chunks:string[]=[];
  for(let index=0;index<sentences.length;index+=chunkSize) chunks.push(sentences.slice(index,index+chunkSize).join(" "));

  const scenes=chunks.map((text,index)=>{
    const mentionedCharacters=characters.filter((character)=>text.toLowerCase().includes(character.name.toLowerCase()));
    const refs=mentionedCharacters.length?mentionedCharacters:characters.slice(0,Math.min(2,characters.length));
    const refIds=refs.map((character)=>character.id);
    const refNames=refs.map((character)=>character.name).join(", ");
    const location=locations[Math.min(index,locations.length-1)]||locations[0];
    const shot=shots[index%shots.length];
    const angle=angles[index%angles.length];
    return {id:`scene-${index+1}`,sceneNumber:index+1,sourceText:text,description:text.length>150?`${text.slice(0,147)}...`:text,characterIds:refIds,locationId:location?.id,cameraShot:shot,cameraAngle:angle,duration:Math.max(3,Math.min(6,Math.ceil(text.split(/\s+/).length/10))),imagePrompt:[`${shot}, ${angle}.`,text,`Featured characters: ${refNames||"main character"}.`,`Preserve the established ${location?.name||"location"} layout and important props.`,`Visual style: ${visualStyle}.`,`Cinematic storytelling frame, expressive body language, detailed environment, coherent lighting, strong composition, no text, no captions, no speech bubbles.`].join(" "),negativePrompt:"wrong face, inconsistent outfit, duplicate character, extra limbs, deformed hands, blurry face, text, watermark, logo, inconsistent architecture, cropped head, low quality",continuityNotes:"Carry clothing, held objects, environment layout and emotional state forward from the previous scene.",generationStatus:"idle" as const,generationSeed:hashString(`${text}-${index+1}`)};
  });

  return {summary:sentences.slice(0,3).join(" "),characters,locations,scenes,analysisProvider:"heuristic-fallback",imageProvider:"pollinations"};
}

function normalizeExternal(external:z.infer<typeof ExternalPayload>,visualStyle:string){
  const characters=external.characters.length?external.characters:[{name:"Main Character",role:"Primary character",appearance:"Maintain a stable face and body design",outfit:"Keep costume continuity",consistencyNotes:"Maintain the same visual identity across scenes"}];
  const locations=external.locations.length?external.locations:[{name:"Primary Story Location",architecture:"Preserve the major environment design",lighting:"Use coherent cinematic lighting",continuity:"Preserve props and layout across scenes"}];
  const mappedCharacters=characters.map((character,index)=>({id:`char-${index+1}`,name:character.name,role:character.role,appearance:character.appearance,outfit:character.outfit,consistencyNotes:character.consistencyNotes,locked:false,referenceSeed:hashString(character.name+character.appearance+character.outfit)}));
  const mappedLocations=locations.map((location,index)=>({id:`loc-${index+1}`,name:location.name,architecture:location.architecture,lighting:location.lighting,continuity:location.continuity,locked:false}));
  const scenes=external.scenes.map((scene,index)=>{
    const characterIds=scene.characterNames.map((name)=>mappedCharacters.find((character)=>character.name.toLowerCase()===name.toLowerCase())?.id).filter(Boolean) as string[];
    const locationId=mappedLocations.find((location)=>location.name.toLowerCase()===(scene.locationName||"").toLowerCase())?.id||mappedLocations[0]?.id;
    return {id:`scene-${index+1}`,sceneNumber:index+1,sourceText:scene.sourceText,description:scene.description,characterIds:characterIds.length?characterIds:mappedCharacters.slice(0,Math.min(2,mappedCharacters.length)).map((character)=>character.id),locationId,cameraShot:scene.cameraShot,cameraAngle:scene.cameraAngle,duration:scene.duration,imagePrompt:scene.imagePrompt.includes(visualStyle)?scene.imagePrompt:`${scene.imagePrompt}. Style: ${visualStyle}.`,negativePrompt:scene.negativePrompt,continuityNotes:scene.continuityNotes,generationStatus:"idle" as const,generationSeed:hashString(`${scene.sourceText}-${index+1}`)};
  });
  return {summary:external.summary,characters:mappedCharacters,locations:mappedLocations,scenes,analysisProvider:"pollinations",imageProvider:"pollinations"};
}

export async function POST(req:Request){
  try{
    const parsed=Input.safeParse(await req.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid story"},{status:400});
    const {story,visualStyle}=parsed.data;

    if(hasPollinations()){
      try{
        const analysis=await pollinationsAnalyzeStory({story,visualStyle});
        const validated=ExternalPayload.parse(analysis.json);
        if(validated.scenes.length) return NextResponse.json(normalizeExternal(validated,visualStyle));
      }catch(error){
        console.error("Pollinations analysis failed; using local fallback",error);
      }
    }

    return NextResponse.json(heuristicAnalyze(story,visualStyle));
  }catch(error){
    console.error("Analyze route failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Failed to analyze story"},{status:500});
  }
}
