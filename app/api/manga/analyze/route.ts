import {NextResponse} from "next/server";
import {z} from "zod";

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
const SceneOut=z.object({
  title:z.string(),sourceText:z.string(),description:z.string(),characterNames:z.array(z.string()),locationNames:z.array(z.string()),cameraShot:z.string(),imagePrompt:z.string(),narrationScript:z.string()
});
const Output=z.object({summary:z.string(),characters:z.array(CharacterOut),locations:z.array(LocationOut),scenes:z.array(SceneOut)});
type SceneOutput=z.infer<typeof SceneOut>;
type CharacterOutput=z.infer<typeof CharacterOut>;
type LocationOutput=z.infer<typeof LocationOut>;
type ParsedInput=z.infer<typeof Input>;

function normalizeName(value:string){return value.trim().toLocaleLowerCase().replace(/\s+/g," ")}

function extractJson(value:string){
  const cleaned=value.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start===-1||end===-1||end<=start) throw new Error("Structured JSON not found in Pollinations response");
  return JSON.parse(cleaned.slice(start,end+1));
}

const hindiStopWords=new Set([
  "और","वह","उस","यह","था","थी","थे","में","का","की","के","को","से","पर","एक","ने","फिर","लेकिन","जब","तो","भी","ही","है","हैं","रहा","रही","गया","गई","कर","करके","अपने","उसने","उनके","उसका","उसकी","उसके","पास","सामने","अंदर","बाहर","हाथ","आंखें","आवाज","दरवाजा","कमरा","घर","रात","दिन","कुछ","किसी","तरफ","ओर","बाद","पहले","साथ","लिए","लिए","जैसे","कहा","देखा","लगा","हो","गई","गया"
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
    outfit:"Keep one stable story-appropriate outfit until the story explicitly changes it.",
    eyeColor:"dark brown",
    hairColor:"black",
    keyFeatures:["same exact face in every scene","stable hairstyle","stable body proportions"],
    referencePrompt:`${name}, canonical recurring story character, one fixed recognizable face, dark brown eyes, black hair, stable body proportions, stable story-appropriate clothing, same identity in every scene, cinematic realistic character design`
  }));
}

function detectFallbackLocations(input:ParsedInput):LocationOutput[]{
  if(input.existingLocations.length) return [];
  const rules:Array<[string,RegExp,string]>=[
    ["Haveli",/हवेली|haveli|mansion/i,"old Indian haveli architecture, carved doors, weathered walls, deep corridors"],
    ["Courtyard",/आंगन|आँगन|दालान|courtyard/i,"old courtyard with consistent columns, floor layout and entrances"],
    ["Underground Chamber",/तहखाना|basement|crypt|underground/i,"dark underground stone chamber with fixed stairway and wall layout"],
    ["Temple",/मंदिर|temple/i,"traditional temple architecture with fixed shrine and pillars"],
    ["Forest",/जंगल|forest|woods/i,"dense forest with recurring trail, tree pattern and atmospheric lighting"],
    ["Room",/कमरा|room/i,"same recurring interior room layout, doors, windows and furniture"],
    ["Street",/सड़क|गली|street|lane/i,"same recurring street layout and surrounding buildings"]
  ];
  const matches=rules.filter(([,pattern])=>pattern.test(input.story)).slice(0,4);
  const selected=matches.length?matches:[["Primary Story Location",/.*/,"one fixed recurring environment layout derived from the story"] as [string,RegExp,string]];
  return selected.map(([name,,architecture])=>({
    name,
    architectureStyle:architecture,
    lighting:"cinematic lighting consistent with the story time and mood",
    colorPalette:"stable restrained cinematic palette",
    referencePrompt:`${name}, ${architecture}, preserve the same architecture, layout, doors, windows, recurring props, lighting logic and color palette across scenes`
  }));
}

function fallback(input:ParsedInput){
  const sentences=input.story.replace(/\s+/g," ").split(/(?<=[.!?।])\s+/).filter(Boolean);
  const count=Math.min(input.targetScenes,Math.max(2,Math.ceil(sentences.length/2)));
  const chunk=Math.max(1,Math.ceil(sentences.length/count));
  const newCharacters=detectFallbackCharacters(input);
  const newLocations=detectFallbackLocations(input);
  const allCharacters=[...input.existingCharacters,...newCharacters];
  const allLocations=[...input.existingLocations,...newLocations];
  const scenes:SceneOutput[]=[];

  for(let i=0;i<sentences.length;i+=chunk){
    const sourceText=sentences.slice(i,i+chunk).join(" ");
    const sourceNormalized=normalizeName(sourceText);
    const sceneNumber=scenes.length+1;
    let characterNames=allCharacters.filter((item)=>sourceNormalized.includes(normalizeName(item.name))).map((item)=>item.name);
    if(!characterNames.length&&allCharacters[0]) characterNames=[allCharacters[0].name];
    let locationNames=allLocations.filter((item)=>sourceNormalized.includes(normalizeName(item.name))).map((item)=>item.name);
    if(!locationNames.length&&allLocations[0]) locationNames=[allLocations[0].name];
    scenes.push({
      title:`Scene ${sceneNumber}`,
      sourceText,
      description:sourceText,
      characterNames,
      locationNames,
      cameraShot:sceneNumber%4===1?"Wide cinematic establishing shot":sceneNumber%4===2?"Medium cinematic shot":sceneNumber%4===3?"Close-up emotional shot":"Over-the-shoulder cinematic shot",
      imagePrompt:`Cinematic story frame depicting exactly this moment: ${sourceText}. Keep the recurring protagonist visually identical to previous scenes. coherent environment, realistic anatomy, expressive composition, dramatic motivated lighting, highly detailed, 16:9`,
      narrationScript:sourceText
    });
  }

  return {summary:sentences.slice(0,3).join(" "),characters:newCharacters,locations:newLocations,scenes:scenes.slice(0,input.targetScenes),provider:"continuity-fallback"};
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid chapter analysis request",details:parsed.error.flatten()},{status:400});
    const input=parsed.data;

    const apiKey=process.env.POLLINATIONS_API_KEY?.trim();
    if(!apiKey){
      return NextResponse.json({...fallback(input),warning:"Pollinations API key is not configured. Used continuity-aware local analysis."});
    }

    const baseUrl=process.env.POLLINATIONS_BASE_URL?.replace(/\/$/,"")||"https://gen.pollinations.ai";
    const model=process.env.POLLINATIONS_MANGA_TEXT_MODEL?.trim()||"openai-fast";
    const library={characters:input.existingCharacters.map(({manualReferenceImage,...item})=>item),locations:input.existingLocations};

    const system=`You are the continuity director for a manga/webtoon production studio. Return STRICT JSON only, with no markdown fences or commentary. Preserve source chronology. Never redesign an existing project reference. Your job is visual continuity, not creative rewriting.`;
    const user=`Project: ${input.projectName}\nChapter: ${input.chapterTitle}\nTarget visual scenes: ${input.targetScenes}.\n\nEXISTING PROJECT REFERENCE LIBRARY:\n${JSON.stringify(library)}\n\nCHAPTER STORY:\n${input.story}\n\nReturn exactly this JSON shape:\n{\n  "summary":"...",\n  "characters":[{"name":"...","visualDescription":"...","outfit":"...","eyeColor":"...","hairColor":"...","keyFeatures":["..."],"referencePrompt":"..."}],\n  "locations":[{"name":"...","architectureStyle":"...","lighting":"...","colorPalette":"...","referencePrompt":"..."}],\n  "scenes":[{"title":"...","sourceText":"...","description":"...","characterNames":["..."],"locationNames":["..."],"cameraShot":"...","imagePrompt":"...","narrationScript":"..."}]\n}\n\nRules:\n1. Break the chapter into visually meaningful chronological beats, not arbitrary paragraphs.\n2. Reuse EXACT canonical names from the existing library.\n3. Never redesign existing characters or locations.\n4. characters[] and locations[] contain ONLY genuinely new references.\n5. Every important recurring person must appear in characterNames in every scene where they are visually present, including pronoun-only continuation scenes.\n6. New character referencePrompt must be concrete and reusable: age impression, face shape, skin tone when supported, eyes, hair, body silhouette, outfit, accessories and signature features.\n7. New location referencePrompt must include architecture, layout cues, recurring props, lighting and color palette.\n8. imagePrompt must be English and describe only the exact scene action, composition, camera and lighting. Do not duplicate locked reference strings; the app appends them.\n9. narrationScript follows the source language and meaning.\n10. No subtitles, speech bubbles, logos, watermark or written text in image prompts.`;

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
          max_tokens:12000,
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
      const result=Output.parse(extractJson(text));
      return NextResponse.json({...result,provider:`pollinations:${model}`});
    }catch(error){
      console.error("Pollinations manga analysis failed; using continuity fallback",error);
      const result=fallback(input);
      const reason=error instanceof Error?error.message:"unknown error";
      return NextResponse.json({...result,warning:`Fast AI analysis was unavailable (${reason}). Used continuity-aware fallback with stable character/location references.`});
    }finally{
      clearTimeout(timer);
    }
  }catch(error){
    console.error("Manga chapter analysis failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Chapter analysis failed"},{status:502});
  }
}
