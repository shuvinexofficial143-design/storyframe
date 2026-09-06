import {NextResponse} from "next/server";
import {z} from "zod";
import {hashString, hasPollinations, pollinationsAnalyzeStory} from "@/lib/pollinations";

const Input=z.object({story:z.string().min(20).max(100000),visualStyle:z.string().default("Cinematic Anime Realism")});
const shots=["Extreme Wide Shot","Medium Shot","Close-Up","Over-the-Shoulder","Insert Shot","Low Angle","Medium Close-Up"];
const angles=["Eye Level","Three Quarter","Low Angle","High Angle","POV"];
const stop=new Set(["The","He","She","They","This","That","When","After","Before","Inside","Outside","Blue","Ancient"]);
const locRules:[[string,RegExp],...Array<[string,RegExp]>]=[["Internet Cafe",/internet cafe|café|cafe|shop|दुकान/i],["Ancient City",/city|street|town|नगर|शहर|सड़क/i],["Forest",/forest|woods|जंगल/i],["Temple",/temple|मंदिर/i],["Palace",/palace|महल/i],["Marketplace",/market|bazaar|बाजार/i]];

const ExternalCharacter=z.object({name:z.string(),role:z.string().default("Supporting character"),appearance:z.string().default("Maintain a stable face and body design"),outfit:z.string().default("Keep costume continuity"),consistencyNotes:z.string().default("Maintain the same visual identity across scenes")});
const ExternalLocation=z.object({name:z.string(),architecture:z.string().default("Preserve the major environment design"),lighting:z.string().default("Use coherent cinematic lighting"),continuity:z.string().default("Preserve props and layout across scenes")});
const ExternalScene=z.object({sourceText:z.string(),description:z.string(),characterNames:z.array(z.string()).default([]),locationName:z.string().optional(),cameraShot:z.string().default("Medium Shot"),cameraAngle:z.string().default("Eye Level"),duration:z.number().min(2).max(8).default(4),imagePrompt:z.string(),negativePrompt:z.string().default("text, watermark, low quality, deformed hands"),continuityNotes:z.string().default("Carry appearance, costume and environment continuity forward")});
const ExternalPayload=z.object({summary:z.string(),characters:z.array(ExternalCharacter).default([]),locations:z.array(ExternalLocation).default([]),scenes:z.array(ExternalScene).default([])});

function heuristicAnalyze(story:string,visualStyle:string){
  const sentences=story.replace(/\s+/g," ").split(/(?<=[.!?।])\s+/).map(s=>s.trim()).filter(Boolean);
  const counts=new Map<string,number>();
  for(const s of sentences){
    for(const name of s.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g)||[]){
      if(!stop.has(name)) counts.set(name,(counts.get(name)||0)+1);
    }
  }
  let names=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);
  if(!names.length) names=["Main Character"];
  const characters=names.map((name,i)=>({
    id:`char-${i+1}`,
    name,
    role:i===0?"Primary character":"Supporting character",
    appearance:`Consistent ${name} design with identifiable facial structure and story-appropriate age/build`,
    outfit:"Keep the same approved outfit until the story explicitly changes it",
    consistencyNotes:"Keep hairstyle, face shape and costume stable across all scenes.",
    locked:false,
    referenceSeed:hashString(name)
  }));
  const found=locRules.filter(([,r])=>r.test(story)).map(([n])=>n);
  const ln=found.length?found:["Primary Story Location"];
  const locations=ln.map((name,i)=>({
    id:`loc-${i+1}`,
    name,
    architecture:`Persistent architecture for ${name}`,
    lighting:"Cinematic motivated lighting with stable direction and mood",
    continuity:"Preserve doors, windows, furniture, landmarks and major props unless the story changes them",
    locked:false
  }));
  const chunks:string[]=[];
  for(let i=0;i<sentences.length;i+=2) chunks.push(sentences.slice(i,i+2).join(" "));
  const scenes=chunks.map((text,i)=>{
    const mentioned=characters.filter(c=>text.toLowerCase().includes(c.name.toLowerCase())).map(c=>c.id);
    const refs=mentioned.length?mentioned:characters.slice(0,Math.min(2,characters.length)).map(c=>c.id);
    const loc=locations[Math.min(i,locations.length-1)]||locations[0];
    const shot=shots[i%shots.length],angle=angles[i%angles.length];
    return {
      id:`scene-${i+1}`,
      sceneNumber:i+1,
      sourceText:text,
      description:text.length>150?text.slice(0,147)+"...":text,
      characterIds:refs,
      locationId:loc?.id,
      cameraShot:shot,
      cameraAngle:angle,
      duration:Math.max(3,Math.min(5,Math.ceil(text.split(/\s+/).length/9))),
      imagePrompt:`${shot}, ${angle}. ${text} Preserve approved character identities for ${refs.join(", ")}. Preserve the established ${loc?.name||"location"} layout and important props. ${visualStyle}, cinematic storytelling frame, expressive body language, detailed environment, coherent lighting, strong composition, 16:9, no text, no captions, no speech bubbles.`,
      negativePrompt:"wrong face, inconsistent outfit, duplicate character, extra limbs, deformed hands, blurry face, text, watermark, logo, inconsistent architecture, cropped head, low quality",
      continuityNotes:"Carry clothing, held objects, environment layout and emotional state forward from the previous scene.",
      generationStatus:"idle" as const,
      generationSeed:hashString(`${text}-${i+1}`)
    };
  });
  return {summary:sentences.slice(0,3).join(" "),characters,locations,scenes,analysisProvider:"mock",imageProvider:"mock"};
}

function normalizeExternal(external:z.infer<typeof ExternalPayload>,visualStyle:string){
  const characters=external.characters.length?external.characters:[{name:"Main Character",role:"Primary character",appearance:"Maintain a stable face and body design",outfit:"Keep costume continuity",consistencyNotes:"Maintain the same visual identity across scenes"}];
  const locations=external.locations.length?external.locations:[{name:"Primary Story Location",architecture:"Preserve the major environment design",lighting:"Use coherent cinematic lighting",continuity:"Preserve props and layout across scenes"}];

  const mappedCharacters=characters.map((character,index)=>({
    id:`char-${index+1}`,
    name:character.name,
    role:character.role,
    appearance:character.appearance,
    outfit:character.outfit,
    consistencyNotes:character.consistencyNotes,
    locked:false,
    referenceSeed:hashString(character.name+character.appearance+character.outfit)
  }));

  const mappedLocations=locations.map((location,index)=>({
    id:`loc-${index+1}`,
    name:location.name,
    architecture:location.architecture,
    lighting:location.lighting,
    continuity:location.continuity,
    locked:false
  }));

  const scenes=(external.scenes.length?external.scenes:[]).map((scene,index)=>{
    const characterIds=scene.characterNames.map((name)=>mappedCharacters.find((character)=>character.name.toLowerCase()===name.toLowerCase())?.id).filter(Boolean) as string[];
    const locationId=mappedLocations.find((location)=>location.name.toLowerCase()===(scene.locationName||"").toLowerCase())?.id||mappedLocations[0]?.id;
    return {
      id:`scene-${index+1}`,
      sceneNumber:index+1,
      sourceText:scene.sourceText,
      description:scene.description,
      characterIds:characterIds.length?characterIds:mappedCharacters.slice(0,Math.min(2,mappedCharacters.length)).map((character)=>character.id),
      locationId,
      cameraShot:scene.cameraShot,
      cameraAngle:scene.cameraAngle,
      duration:scene.duration,
      imagePrompt:scene.imagePrompt.includes(visualStyle)?scene.imagePrompt:`${scene.imagePrompt}. Style: ${visualStyle}.`,
      negativePrompt:scene.negativePrompt,
      continuityNotes:scene.continuityNotes,
      generationStatus:"idle" as const,
      generationSeed:hashString(`${scene.sourceText}-${index+1}`)
    };
  });

  return {summary:external.summary,characters:mappedCharacters,locations:mappedLocations,scenes,analysisProvider:"pollinations",imageProvider:"pollinations"};
}

export async function POST(req:Request){
  const parsed=Input.safeParse(await req.json());
  if(!parsed.success) return NextResponse.json({error:"Invalid story"},{status:400});
  const {story,visualStyle}=parsed.data;

  if(hasPollinations()){
    try{
      const analysis=await pollinationsAnalyzeStory({story,visualStyle});
      const validated=ExternalPayload.parse(analysis.json);
      return NextResponse.json(normalizeExternal(validated,visualStyle));
    }catch(error){
      console.error("Pollinations analyze failed, falling back to heuristic analysis",error);
    }
  }

  return NextResponse.json(heuristicAnalyze(story,visualStyle));
}
