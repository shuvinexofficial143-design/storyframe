import {z} from "zod";
import {AnalyzeInput} from "./analyzer";
import {buildWebsiteReadyStoryboardPrompt,VISUAL_CATEGORIES} from "./storyboard-prompt";
import type {AnalyzeChapterResponse} from "./project-types";

const IdentityLock=z.object({gender:z.string().default("unspecified"),apparentAge:z.string().default("young adult"),faceShape:z.string().default("distinct consistent face"),skinTone:z.string().default("consistent natural skin tone"),eyeColor:z.string().default("dark brown"),eyeShape:z.string().default("expressive anime eyes"),hairColor:z.string().default("black"),hairLength:z.string().default("medium"),hairstyle:z.string().default("story-appropriate cultivation hairstyle"),bodyBuild:z.string().default("slim athletic"),heightClass:z.string().default("average")});
const CostumeLock=z.object({primaryOutfit:z.string().default("stable story-appropriate cultivation outfit"),primaryColors:z.array(z.string()).default([]),belt:z.string().default("consistent belt"),boots:z.string().default("consistent boots"),accessories:z.string().default("preserve established accessories"),weapons:z.array(z.string()).default([])});
const CharacterOut=z.object({name:z.string(),role:z.string().default("recurring character"),visualDescription:z.string(),outfit:z.string(),eyeColor:z.string(),hairColor:z.string(),keyFeatures:z.array(z.string()).default([]),referencePrompt:z.string(),identityLock:IdentityLock.optional(),costumeLock:CostumeLock.optional(),personalityVisuals:z.string().optional()});
const LocationOut=z.object({name:z.string(),architectureStyle:z.string(),lighting:z.string(),colorPalette:z.string(),referencePrompt:z.string(),geometryIdentity:z.string().optional(),materials:z.string().optional(),importantFeatures:z.array(z.string()).optional()});
const PropOut=z.object({name:z.string(),kind:z.enum(["prop","artifact"]).default("prop"),owner:z.string().optional(),shape:z.string().default("established recurring shape"),size:z.string().default("story-appropriate scale"),materials:z.string().default("story-appropriate materials"),colors:z.array(z.string()).default([]),ornamentation:z.string().default("consistent ornamentation"),magicalEffects:z.string().default("none unless established"),canonicalPrompt:z.string()});
const VehicleOut=z.object({name:z.string(),owner:z.string().optional(),shape:z.string().default("established recurring silhouette"),size:z.string().default("story-appropriate scale"),materials:z.string().default("story-appropriate materials"),colors:z.array(z.string()).default([]),ornamentation:z.string().default("consistent ornamentation"),magicalEffects:z.string().default("none unless established"),canonicalPrompt:z.string()});
const StateDetail=z.object({character_name:z.string(),state_id:z.string().default("normal"),state_name:z.string().default("Normal"),description:z.string().default("base established appearance"),outfit_override:z.string().optional(),visual_effects:z.array(z.string()).default([])});
const RawScene=z.object({scene_number:z.number().int().positive(),scene_title:z.string(),visual_category:z.enum(VISUAL_CATEGORIES),narration_text:z.string(),description:z.string().default(""),character_names:z.array(z.string()).default([]),location_names:z.array(z.string()).default([]),prop_names:z.array(z.string()).default([]),vehicle_names:z.array(z.string()).default([]),camera_shot:z.string().default("cinematic shot"),camera_angle:z.string().default("eye-level"),lens_feel:z.string().default("cinematic natural perspective"),composition:z.string().default("clear focal hierarchy"),camera_movement_suggestion:z.string().default("subtle cinematic movement"),action:z.string().default(""),emotion:z.string().default(""),lighting_style:z.string().default("cinematic motivated lighting"),time_of_day:z.string().default("unspecified"),weather:z.string().default("stable"),story_state:z.string().default(""),character_states:z.record(z.string(),z.string()).default({}),character_state_details:z.array(StateDetail).default([]),continuity_notes:z.string().default("preserve established visual continuity"),image_prompt:z.string().default("")});
const RawOutput=z.object({summary:z.string(),projectVisualBible:z.unknown().nullable().optional(),characters:z.array(CharacterOut).default([]),locations:z.array(LocationOut).default([]),props:z.array(PropOut).default([]),vehicles:z.array(VehicleOut).default([]),scenes:z.array(RawScene)});

function extractJson(value:string){
  const cleaned=value.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start===-1||end===-1||end<=start)throw new Error("Structured JSON not found in Gemini response");
  return JSON.parse(cleaned.slice(start,end+1));
}

function normalize(raw:z.infer<typeof RawOutput>):AnalyzeChapterResponse{
  return {
    summary:raw.summary,
    provider:"gemini",
    projectVisualBible:raw.projectVisualBible&&typeof raw.projectVisualBible==="object"?raw.projectVisualBible:undefined,
    characters:raw.characters,
    locations:raw.locations,
    props:raw.props,
    vehicles:raw.vehicles,
    scenes:raw.scenes.sort((a,b)=>a.scene_number-b.scene_number).map((scene,index)=>({
      sceneNumber:index+1,
      title:scene.scene_title,
      visualCategory:scene.visual_category,
      sourceText:scene.narration_text,
      description:scene.description||scene.narration_text,
      characterNames:scene.character_names,
      locationNames:scene.location_names,
      propNames:scene.prop_names,
      vehicleNames:scene.vehicle_names,
      cameraShot:scene.camera_shot,
      cameraAngle:scene.camera_angle,
      lensFeel:scene.lens_feel,
      composition:scene.composition,
      cameraMovementSuggestion:scene.camera_movement_suggestion,
      action:scene.action||scene.description||scene.narration_text,
      emotion:scene.emotion,
      lightingStyle:scene.lighting_style,
      timeOfDay:scene.time_of_day,
      weather:scene.weather,
      storyState:scene.story_state||scene.narration_text,
      characterStates:scene.character_states,
      characterStateDetails:scene.character_state_details.map((state)=>({characterName:state.character_name,stateId:state.state_id,stateName:state.state_name,description:state.description,outfitOverride:state.outfit_override,visualEffects:state.visual_effects})),
      continuityNotes:scene.continuity_notes,
      imagePrompt:scene.image_prompt,
      narrationScript:scene.narration_text
    }))
  };
}

export async function tryGeminiContinuityAnalysis(rawInput:unknown){
  const apiKey=process.env.GEMINI_ANALYSIS_API_KEY?.trim();
  if(!apiKey)return null;

  const parsed=AnalyzeInput.safeParse(rawInput);
  if(!parsed.success)return {ok:false as const,status:400,error:"Invalid chapter analysis request",details:parsed.error.flatten()};
  const input=parsed.data;
  const model=process.env.GEMINI_ANALYSIS_MODEL?.trim()||"gemini-3.5-flash-lite";
  const prompt=buildWebsiteReadyStoryboardPrompt({
    projectName:input.projectName,
    chapterTitle:input.chapterTitle,
    story:input.story,
    targetScenes:input.targetScenes,
    referenceLibrary:{characters:input.existingCharacters,locations:input.existingLocations},
    existingVisualBible:input.existingVisualBible,
    existingProps:input.existingProps,
    existingVehicles:input.existingVehicles
  })+`\n\nCHARACTER STATE DETAIL RULE: For any intentional temporary condition or costume change, also emit character_state_details inside that scene as [{\"character_name\":\"...\",\"state_id\":\"ceremonial-outfit\",\"state_name\":\"Ceremonial Outfit\",\"description\":\"...\",\"outfit_override\":\"...\",\"visual_effects\":[]}]. Base identity must never change.`;

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(Number(process.env.GEMINI_ANALYSIS_TIMEOUT_MS||0),90000));
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:"You are StoryFrame's cinematic continuity director. Return strict JSON only. Existing canonical data is authoritative. Never redesign locked recurring entities."}]},
        contents:[{role:"user",parts:[{text:prompt}]}],
        generationConfig:{
          temperature:0.1,
          maxOutputTokens:16000,
          responseFormat:{text:{mimeType:"application/json"}}
        }
      }),
      signal:controller.signal,
      cache:"no-store"
    });
    const text=await response.text();
    if(!response.ok)throw new Error(`Gemini analysis ${response.status}: ${text.replace(/\s+/g," ").slice(0,500)}`);
    const envelope=JSON.parse(text) as {candidates?:Array<{content?:{parts?:Array<{text?:unknown}>}}>};
    const modelText=envelope.candidates?.[0]?.content?.parts?.map((part)=>typeof part.text==="string"?part.text:"").join("")||"";
    if(!modelText)throw new Error("Gemini returned no structured chapter analysis");
    const result=RawOutput.parse(extractJson(modelText));
    return {ok:true as const,data:{...normalize(result),provider:`gemini:${model}`}};
  }catch(error){
    console.error("Gemini continuity analysis failed; allowing existing fallback pipeline",error);
    return {ok:false as const,status:502,error:error instanceof Error?error.message:"Gemini analysis failed"};
  }finally{
    clearTimeout(timer);
  }
}
