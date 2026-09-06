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
type ParsedInput=z.infer<typeof Input>;

function normalizeName(value:string){return value.trim().toLowerCase().replace(/\s+/g," ")}

function extractJson(value:string){
  const cleaned=value.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start===-1||end===-1||end<=start) throw new Error("Structured JSON not found in Pollinations response");
  return JSON.parse(cleaned.slice(start,end+1));
}

function fallback(input:ParsedInput){
  const sentences=input.story.replace(/\s+/g," ").split(/(?<=[.!?।])\s+/).filter(Boolean);
  const count=Math.min(input.targetScenes,Math.max(2,Math.ceil(sentences.length/2)));
  const chunk=Math.max(1,Math.ceil(sentences.length/count));
  const scenes:SceneOutput[]=[];

  for(let i=0;i<sentences.length;i+=chunk){
    const sourceText=sentences.slice(i,i+chunk).join(" ");
    const sourceNormalized=normalizeName(sourceText);
    const sceneNumber:number=scenes.length+1;
    const characterNames=input.existingCharacters.filter((item)=>sourceNormalized.includes(normalizeName(item.name))).map((item)=>item.name);
    const locationNames=input.existingLocations.filter((item)=>sourceNormalized.includes(normalizeName(item.name))).map((item)=>item.name);
    scenes.push({
      title:`Scene ${sceneNumber}`,
      sourceText,
      description:sourceText,
      characterNames,
      locationNames,
      cameraShot:sceneNumber%3===1?"Wide cinematic shot":sceneNumber%3===2?"Medium cinematic shot":"Close-up cinematic shot",
      imagePrompt:`Cinematic visual storytelling frame depicting: ${sourceText}. coherent environment, expressive composition, dramatic lighting, highly detailed, 16:9`,
      narrationScript:sourceText
    });
  }

  return {
    summary:sentences.slice(0,3).join(" "),
    characters:[],
    locations:[],
    scenes:scenes.slice(0,input.targetScenes),
    provider:"heuristic-fallback"
  };
}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success) return NextResponse.json({error:"Invalid chapter analysis request",details:parsed.error.flatten()},{status:400});
    const input=parsed.data;

    const apiKey=process.env.POLLINATIONS_API_KEY?.trim();
    if(!apiKey){
      return NextResponse.json({...fallback(input),warning:"POLLINATIONS_API_KEY is not configured. Used local continuity-aware fallback analysis."});
    }

    const baseUrl=process.env.POLLINATIONS_BASE_URL?.replace(/\/$/,"")||"https://gen.pollinations.ai";
    const model=process.env.POLLINATIONS_TEXT_MODEL?.trim()||"openai";
    const library={
      characters:input.existingCharacters.map(({manualReferenceImage,...item})=>item),
      locations:input.existingLocations
    };

    const system=`You are the continuity director for a manga/webtoon production studio. Return STRICT JSON only, with no markdown fences or commentary. Preserve chronology and never redesign an existing project reference.`;
    const user=`Project: ${input.projectName}\nChapter: ${input.chapterTitle}\nTarget visual scenes: about ${input.targetScenes}.\n\nEXISTING PROJECT REFERENCE LIBRARY:\n${JSON.stringify(library,null,2)}\n\nCHAPTER STORY:\n${input.story}\n\nReturn exactly this JSON shape:\n{\n  "summary":"...",\n  "characters":[{"name":"...","visualDescription":"...","outfit":"...","eyeColor":"...","hairColor":"...","keyFeatures":["..."],"referencePrompt":"..."}],\n  "locations":[{"name":"...","architectureStyle":"...","lighting":"...","colorPalette":"...","referencePrompt":"..."}],\n  "scenes":[{"title":"...","sourceText":"...","description":"...","characterNames":["..."],"locationNames":["..."],"cameraShot":"...","imagePrompt":"...","narrationScript":"..."}]\n}\n\nRules:\n1. Break the chapter into visually meaningful story beats, not arbitrary paragraphs.\n2. For every existing character/location, USE THE EXACT SAME canonical name from the reference library.\n3. Never redesign an existing reference and never return an existing reference inside characters[] or locations[].\n4. characters[] and locations[] must contain ONLY genuinely new references.\n5. New character referencePrompt must be a compact reusable visual token with face, body silhouette, eyes, hair, outfit, accessories and signature features supported by the story.\n6. New location referencePrompt must contain architecture, layout cues, lighting and color palette.\n7. Each scene must list characterNames/locationNames using exact canonical names.\n8. imagePrompt must describe only scene action, composition, camera, lighting and art direction. The app will append locked reference strings later.\n9. imagePrompt must be English for image-generation quality, even when narration is Hindi.\n10. narrationScript should match the source language and scene.\n11. No subtitles, speech bubbles, logos, watermarks or text inside image prompts.`;

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Number(process.env.POLLINATIONS_ANALYZE_TIMEOUT_MS||30000));

    try{
      const response=await fetch(`${baseUrl}/v1/chat/completions`,{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
        body:JSON.stringify({
          model,
          messages:[{role:"system",content:system},{role:"user",content:user}],
          temperature:0.15
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
      console.error("Pollinations manga analysis failed; using fallback",error);
      return NextResponse.json({...fallback(input),warning:error instanceof Error?`Pollinations analysis failed: ${error.message}. Used local continuity-aware fallback.`:"Pollinations analysis failed. Used local continuity-aware fallback."});
    }finally{
      clearTimeout(timer);
    }
  }catch(error){
    console.error("Manga chapter analysis failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Chapter analysis failed"},{status:502});
  }
}
