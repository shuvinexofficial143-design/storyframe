import {NextResponse} from "next/server";
import {z} from "zod";
import {buildWebsiteReadyStoryboardPrompt,VISUAL_CATEGORIES,type VisualCategory} from "@/lib/manga-storyboard-prompt";

const ExistingCharacter=z.object({
  id:z.string(),name:z.string(),visualDescription:z.string(),outfit:z.string(),eyeColor:z.string(),hairColor:z.string(),keyFeatures:z.array(z.string()),referencePrompt:z.string(),seedBase:z.number(),manualReferenceImage:z.string().optional(),createdInChapterId:z.string(),updatedAt:z.string()
});
const ExistingLocation=z.object({
  id:z.string(),name:z.string(),architectureStyle:z.string(),lighting:z.string(),colorPalette:z.string(),referencePrompt:z.string(),createdInChapterId:z.string(),updatedAt:z.string()
});
const Input=z.object({
  projectName:z.string().min(1),
  chapterTitle:z.string().min(1),
  story:z.string().min(20).max(120000),
  existingCharacters:z.array(ExistingCharacter).default([]),
  existingLocations:z.array(ExistingLocation).default([]),
  targetScenes:z.number().int().min(2).max(40).default(8)
});

const CharacterOut=z.object({
  name:z.string(),visualDescription:z.string(),outfit:z.string(),eyeColor:z.string(),hairColor:z.string(),keyFeatures:z.array(z.string()),referencePrompt:z.string()
});
const LocationOut=z.object({
  name:z.string(),architectureStyle:z.string(),lighting:z.string(),colorPalette:z.string(),referencePrompt:z.string()
});
const RawSceneOut=z.object({
  scene_number:z.number().int().positive(),
  scene_title:z.string().min(1),
  visual_category:z.enum(VISUAL_CATEGORIES),
  image_prompt:z.string().min(80).max(1200),
  narration_text:z.string().min(1),
  character_names:z.array(z.string()).default([]),
  location_names:z.array(z.string()).default([]),
  camera_angle:z.string().min(1),
  lighting_style:z.string().min(1),
  continuity_notes:z.string().min(1)
});
const RawOutput=z.object({summary:z.string(),characters:z.array(CharacterOut),locations:z.array(LocationOut),scenes:z.array(RawSceneOut)});
type CharacterOutput=z.infer<typeof CharacterOut>;
type LocationOutput=z.infer<typeof LocationOut>;
type ParsedInput=z.infer<typeof Input>;
type RawOutputType=z.infer<typeof RawOutput>;

type NormalizedScene={
  sceneNumber:number;
  title:string;
  visualCategory:VisualCategory;
  sourceText:string;
  description:string;
  characterNames:string[];
  locationNames:string[];
  cameraShot:string;
  cameraAngle:string;
  lightingStyle:string;
  continuityNotes:string;
  imagePrompt:string;
  narrationScript:string;
};

function normalizeName(value:string){return value.trim().toLocaleLowerCase().replace(/\s+/g," ")}

function extractJson(value:string){
  const cleaned=value.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start===-1||end===-1||end<=start) throw new Error("Structured JSON not found in Pollinations response");
  return JSON.parse(cleaned.slice(start,end+1));
}

function normalizeModelOutput(result:RawOutputType){
  const scenes:NormalizedScene[]=result.scenes
    .sort((a,b)=>a.scene_number-b.scene_number)
    .map((scene,index)=>({
      sceneNumber:index+1,
      title:scene.scene_title,
      visualCategory:scene.visual_category,
      sourceText:scene.narration_text,
      description:scene.narration_text,
      characterNames:scene.character_names,
      locationNames:scene.location_names,
      cameraShot:scene.camera_angle,
      cameraAngle:scene.camera_angle,
      lightingStyle:scene.lighting_style,
      continuityNotes:scene.continuity_notes,
      imagePrompt:scene.image_prompt,
      narrationScript:scene.narration_text
    }));
  return {summary:result.summary,characters:result.characters,locations:result.locations,scenes};
}

const hindiStopWords=new Set([
  "और","वह","उस","यह","था","थी","थे","में","का","की","के","को","से","पर","एक","ने","फिर","लेकिन","जब","तो","भी","ही","है","हैं","रहा","रही","गया","गई","कर","करके","अपने","उसने","उनके","उसका","उसकी","उसके","पास","सामने","अंदर","बाहर","हाथ","आंखें","आवाज","दरवाजा","कमरा","घर","रात","दिन","कुछ","किसी","तरफ","ओर","बाद","पहले","साथ","लिए","जैसे","कहा","देखा","लगा","हो"
]);
const englishStopWords=new Set(["the","a","an","he","she","they","it","this","that","and","but","when","then","after","before","inside","outside","with","from","into","there","here"]);

function detectFallbackCharacters(input:ParsedInput):CharacterOutput[]{
  if(input.existingCharacters.length) return [];
  const counts=new Map<string,number>();
  const latin=input.story.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g)||[];
  const devanagari=input.story.match(/[\u0900-\u097F]{2,}/g)||[];
  for(const raw of [...latin,...devanagari]){
    const name=raw.trim();
    const key=normalizeName(name);
    if(!key||englishStopWords.has(key)||hindiStopWords.has(name)) continue;
    counts.set(name,(counts.get(name)||0)+1);
  }
  const candidates=[...counts.entries()].sort((a,b)=>b[1]-a[1]).filter(([,count])=>count>=2).slice(0,4).map(([name])=>name);
  const names=candidates.length?candidates:["Main Character"];
  return names.map((name,index)=>({
    name,
    visualDescription:index===0?"Canonical recurring protagonist. Preserve one exact face, age impression, body silhouette and skin tone across every scene.":"Canonical recurring supporting character. Preserve one exact face and body silhouette across every appearance.",
    outfit:"Keep one stable story-appropriate Xianxia/Manhwa outfit until the story explicitly changes it.",
    eyeColor:"dark brown",
    hairColor:"black",
    keyFeatures:["same exact face in every scene","stable hairstyle","stable body proportions"],
    referencePrompt:`${name}, canonical recurring story character, one fixed recognizable face, dark brown eyes, black hair, stable body proportions, stable story-appropriate clothing, same identity in every scene, cinematic Xianxia Manhwa character design`
  }));
}

function detectFallbackLocations(input:ParsedInput):LocationOutput[]{
  if(input.existingLocations.length) return [];
  const rules:Array<[string,RegExp,string]>=[
    ["Haveli",/हवेली|haveli|mansion/i,"old Indian haveli architecture, carved doors, weathered walls, deep corridors"],
    ["Courtyard",/आंगन|आँगन|दालान|courtyard/i,"old courtyard with consistent columns, floor layout and entrances"],
    ["Underground Chamber",/तहखाना|basement|crypt|underground/i,"dark underground stone chamber with fixed stairway and wall layout"],
    ["Temple",/मंदिर|temple/i,"traditional temple architecture with fixed shrine and pillars"],
    ["Mountain Sect",/पर्वत|पहाड़|mountain|sect/i,"towering Xianxia mountain sect with fixed peaks, stairs, halls and cloud bridges"],
    ["Forest",/जंगल|forest|woods/i,"dense forest with recurring trail, tree pattern and atmospheric lighting"],
    ["Room",/कमरा|room/i,"same recurring interior room layout, doors, windows and furniture"],
    ["Street",/सड़क|गली|street|lane/i,"same recurring street layout and surrounding buildings"]
  ];
  const matches=rules.filter(([,pattern])=>pattern.test(input.story)).slice(0,4);
  const selected=matches.length?matches:[["Primary Story Location",/.*/,"one fixed recurring environment layout derived from the story"] as [string,RegExp,string]];
  return selected.map(([name,,architecture])=>({
    name,
    architectureStyle:architecture,
    lighting:"cinematic atmospheric lighting consistent with story time and mood",
    colorPalette:"stable restrained cinematic palette",
    referencePrompt:`${name}, ${architecture}, preserve the same architecture, layout, doors, windows, recurring props, lighting logic and color palette across scenes`
  }));
}

function fallbackCategory(text:string,index:number):VisualCategory{
  if(/train|training|mentor|master|disciple|inherit|legacy|शिष्य|गुरु|प्रशिक्षण|अभ्यास|युवा पीढ़ी/i.test(text)) return "Next Generation Training";
  if(/fight|attack|sword|battle|run|fly|flying|spell|energy|technique|cultivat|तलवार|युद्ध|हमला|दौड़|उड़|शक्ति|साधना/i.test(text)) return "Action Shot";
  if(/crowd|passenger|citizen|people|disciples|merchant|warriors|भीड़|लोग|यात्री|नागरिक|व्यापारी|योद्धा/i.test(text)) return "Crowd Shot";
  if(/money|stone|treasure|eyes|face|fear|greed|plan|scheme|emotion|सिक्क|पत्थर|खजाना|आंख|चेहरा|डर|लालच|योजना/i.test(text)) return "Close-Up Motivation";
  return index===0?"Establishing Shot":"Close-Up Motivation";
}

function fallbackPrompt(category:VisualCategory,characterNames:string[],locationNames:string[]){
  const subjects=characterNames.length?`recurring characters ${characterNames.join(", ")}`:"the story protagonist";
  const location=locationNames[0]||"the established story environment";
  const camera=category==="Close-Up Motivation"?"macro cinematic close-up":category==="Action Shot"?"dynamic low-angle cinematic shot":category==="Crowd Shot"?"wide-angle crowd composition":category==="Next Generation Training"?"medium-wide mentorship composition":"wide-angle cinematic establishing shot";
  return `${camera} of ${subjects} within ${location}, preserving exact canonical identities and story continuity, expressive composition, dramatic volumetric fog and motivated rim lighting, Xianxia, Manhwa style, highly detailed, 8k, photorealistic lighting, ray tracing, detailed textures, Unreal Engine 5 render, cinematic depth, no text or watermark.`;
}

function fallback(input:ParsedInput){
  const sentences=input.story.replace(/\s+/g," ").split(/(?<=[.!?।])\s+/).filter(Boolean);
  const desired=Math.min(input.targetScenes,Math.max(2,Math.ceil(sentences.length/2)));
  const chunk=Math.max(1,Math.ceil(sentences.length/desired));
  const newCharacters=detectFallbackCharacters(input);
  const newLocations=detectFallbackLocations(input);
  const allCharacters=[...input.existingCharacters,...newCharacters];
  const allLocations=[...input.existingLocations,...newLocations];
  const scenes:NormalizedScene[]=[];

  for(let i=0;i<sentences.length;i+=chunk){
    const sourceText=sentences.slice(i,i+chunk).join(" ");
    const sourceNormalized=normalizeName(sourceText);
    const sceneNumber=scenes.length+1;
    let characterNames=allCharacters.filter((item)=>sourceNormalized.includes(normalizeName(item.name))).map((item)=>item.name);
    if(!characterNames.length&&allCharacters[0]) characterNames=[allCharacters[0].name];
    let locationNames=allLocations.filter((item)=>sourceNormalized.includes(normalizeName(item.name))).map((item)=>item.name);
    if(!locationNames.length&&allLocations[0]) locationNames=[allLocations[0].name];
    const visualCategory=fallbackCategory(sourceText,scenes.length);
    const cameraAngle=visualCategory==="Close-Up Motivation"?"macro close-up":visualCategory==="Action Shot"?"dynamic low-angle shot":visualCategory==="Crowd Shot"?"wide-angle cinematic crowd shot":visualCategory==="Next Generation Training"?"medium-wide mentorship shot":"wide-angle cinematic establishing shot";
    const lightingStyle=visualCategory==="Establishing Shot"?"golden hour backlight with volumetric fog":"dramatic motivated rim light with volumetric atmosphere";
    scenes.push({
      sceneNumber,
      title:`${visualCategory} ${sceneNumber}`,
      visualCategory,
      sourceText,
      description:sourceText,
      characterNames,
      locationNames,
      cameraShot:cameraAngle,
      cameraAngle,
      lightingStyle,
      continuityNotes:"Preserve the exact recurring character identities, outfits, props, architecture and environment layout established in the project reference library.",
      imagePrompt:fallbackPrompt(visualCategory,characterNames,locationNames),
      narrationScript:sourceText
    });
  }

  return {summary:sentences.slice(0,3).join(" "),characters:newCharacters,locations:newLocations,scenes:scenes.slice(0,input.targetScenes),provider:"cinematic-continuity-fallback"};
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid chapter analysis request",details:parsed.error.flatten()},{status:400});
    const input=parsed.data;

    const apiKey=process.env.POLLINATIONS_API_KEY?.trim();
    if(!apiKey){
      return NextResponse.json({...fallback(input),warning:"Pollinations API key is not configured. Used cinematic continuity-aware local analysis."});
    }

    const baseUrl=process.env.POLLINATIONS_BASE_URL?.replace(/\/$/,"")||"https://gen.pollinations.ai";
    const model=process.env.POLLINATIONS_MANGA_TEXT_MODEL?.trim()||"openai-fast";
    const library={characters:input.existingCharacters.map(({manualReferenceImage,...item})=>item),locations:input.existingLocations};

    const system="You are StoryFrame's Xianxia / Manhwa / Anime cinematic storyboard engine and continuity director. Return strict valid JSON only. Never redesign an existing project reference. Preserve exact source chronology and exact narration segments.";
    const user=buildWebsiteReadyStoryboardPrompt({projectName:input.projectName,chapterTitle:input.chapterTitle,story:input.story,targetScenes:input.targetScenes,referenceLibrary:library});

    const controller=new AbortController();
    const timeoutMs=Math.max(Number(process.env.POLLINATIONS_ANALYZE_TIMEOUT_MS||0),90000);
    const timer=setTimeout(()=>controller.abort(),timeoutMs);

    try{
      const response=await fetch(`${baseUrl}/v1/chat/completions`,{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
        body:JSON.stringify({
          model,
          messages:[{role:"system",content:system},{role:"user",content:user}],
          temperature:0.1,
          max_tokens:14000,
          response_format:{type:"json_object"}
        }),
        signal:controller.signal,
        cache:"no-store"
      });

      const raw=await response.text();
      if(!response.ok) throw new Error(`Pollinations text ${response.status}: ${raw.replace(/\s+/g," ").slice(0,500)}`);
      const envelope=JSON.parse(raw) as {choices?:Array<{message?:{content?:unknown}}>};
      const content=envelope.choices?.[0]?.message?.content;
      const text=typeof content==="string"?content:content&&typeof content==="object"?JSON.stringify(content):"";
      if(!text) throw new Error("Pollinations returned no structured chapter analysis");
      const parsedOutput=RawOutput.parse(extractJson(text));
      const result=normalizeModelOutput(parsedOutput);
      return NextResponse.json({...result,provider:`pollinations:${model}:cinematic-schema-v1`});
    }catch(error){
      console.error("Pollinations cinematic manga analysis failed; using continuity fallback",error);
      const result=fallback(input);
      const reason=error instanceof Error?error.message:"unknown error";
      return NextResponse.json({...result,warning:`Cinematic AI analysis was unavailable (${reason}). Used continuity-aware fallback with the same website scene schema.`});
    }finally{
      clearTimeout(timer);
    }
  }catch(error){
    console.error("Manga chapter analysis failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Chapter analysis failed"},{status:502});
  }
}
