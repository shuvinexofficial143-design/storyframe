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

const schema={
  type:"object",
  properties:{
    summary:{type:"string"},
    characters:{type:"array",items:{type:"object",properties:{
      name:{type:"string"},visualDescription:{type:"string"},outfit:{type:"string"},eyeColor:{type:"string"},hairColor:{type:"string"},keyFeatures:{type:"array",items:{type:"string"}},referencePrompt:{type:"string"}
    },required:["name","visualDescription","outfit","eyeColor","hairColor","keyFeatures","referencePrompt"]}},
    locations:{type:"array",items:{type:"object",properties:{
      name:{type:"string"},architectureStyle:{type:"string"},lighting:{type:"string"},colorPalette:{type:"string"},referencePrompt:{type:"string"}
    },required:["name","architectureStyle","lighting","colorPalette","referencePrompt"]}},
    scenes:{type:"array",items:{type:"object",properties:{
      title:{type:"string"},sourceText:{type:"string"},description:{type:"string"},characterNames:{type:"array",items:{type:"string"}},locationNames:{type:"array",items:{type:"string"}},cameraShot:{type:"string"},imagePrompt:{type:"string"},narrationScript:{type:"string"}
    },required:["title","sourceText","description","characterNames","locationNames","cameraShot","imagePrompt","narrationScript"]}}
  },
  required:["summary","characters","locations","scenes"]
};

function fallback(story:string,targetScenes:number){
  const sentences=story.replace(/\s+/g," ").split(/(?<=[.!?।])\s+/).filter(Boolean);
  const count=Math.min(targetScenes,Math.max(2,Math.ceil(sentences.length/2)));
  const chunk=Math.max(1,Math.ceil(sentences.length/count));
  const scenes=[];
  for(let i=0;i<sentences.length;i+=chunk){
    const sourceText=sentences.slice(i,i+chunk).join(" ");
    const sceneNumber=scenes.length+1;
    scenes.push({
      title:`Scene ${sceneNumber}`,
      sourceText,
      description:sourceText,
      characterNames:[],
      locationNames:[],
      cameraShot:sceneNumber%3===1?"Wide cinematic shot":sceneNumber%3===2?"Medium cinematic shot":"Close-up cinematic shot",
      imagePrompt:`Cinematic visual storytelling frame depicting: ${sourceText}. coherent environment, expressive composition, dramatic lighting, highly detailed, 16:9`,
      narrationScript:sourceText
    });
  }
  return {summary:sentences.slice(0,3).join(" "),characters:[],locations:[],scenes:scenes.slice(0,targetScenes),provider:"heuristic-fallback"};
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid chapter analysis request",details:parsed.error.flatten()},{status:400});
    const input=parsed.data;
    const apiKey=process.env.GEMINI_API_KEY?.trim();
    if(!apiKey) return NextResponse.json({...fallback(input.story,input.targetScenes),warning:"GEMINI_API_KEY is not configured. Used local fallback analysis."});

    const model=process.env.GEMINI_TEXT_MODEL?.trim()||"gemini-3.5-flash-lite";
    const library={
      characters:input.existingCharacters.map(({manualReferenceImage,...item})=>item),
      locations:input.existingLocations
    };
    const prompt=`You are the continuity director for a manga/webtoon production studio.\n\nProject: ${input.projectName}\nChapter: ${input.chapterTitle}\nTarget visual scenes: about ${input.targetScenes}.\n\nEXISTING PROJECT REFERENCE LIBRARY:\n${JSON.stringify(library,null,2)}\n\nCHAPTER STORY:\n${input.story}\n\nRules:\n1. Break the chapter into visually meaningful story beats, not arbitrary paragraphs.\n2. For every existing character/location, USE THE EXACT SAME NAME as the reference library. Do not rename aliases.\n3. Never redesign an existing reference. Scene prompts must respect its exact appearance/outfit/location continuity.\n4. In characters[] and locations[], return ONLY genuinely new references not already present in the library.\n5. New character referencePrompt must be a compact reusable visual token string containing age impression, face, body silhouette, skin tone if stated, eyes, hair, outfit, accessories and signature features. Never invent sensitive traits not supported by the story.\n6. New location referencePrompt must be a compact reusable environment token containing architecture, layout cues, lighting and color palette.\n7. Each scene must list characterNames/locationNames using exact canonical names.\n8. imagePrompt must describe only this scene's action, composition, camera, lighting and art direction. Do not repeat library reference strings; the app will append exact locked references later.\n9. narrationScript should be clean narration matching the scene and may be Hindi/English according to the source story language.\n10. Return valid structured JSON only.`;

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Number(process.env.GEMINI_ANALYZE_TIMEOUT_MS||30000));
    try{
      const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
        body:JSON.stringify({
          contents:[{role:"user",parts:[{text:prompt}]}],
          generationConfig:{
            temperature:0.15,
            maxOutputTokens:16000,
            responseFormat:{text:{mimeType:"application/json",schema}}
          }
        }),
        signal:controller.signal,
        cache:"no-store"
      });
      const raw=await response.text();
      if(!response.ok) throw new Error(`Gemini ${response.status}: ${raw.slice(0,500)}`);
      const envelope=JSON.parse(raw) as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
      const text=envelope.candidates?.[0]?.content?.parts?.map((part)=>part.text||"").join("")||"";
      if(!text) throw new Error("Gemini returned no structured content");
      const result=Output.parse(JSON.parse(text));
      return NextResponse.json({...result,provider:model});
    }finally{
      clearTimeout(timer);
    }
  }catch(error){
    console.error("Manga chapter analysis failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Chapter analysis failed"},{status:502});
  }
}
