import {AnalyzeInput,ContinuityRawOutput,buildContinuityAnalysisPrompt,normalizeContinuityOutput} from "./analyzer";
import {XKiroRequestError,xkiroJsonCompletion} from "../xkiro";
import {VISUAL_CATEGORIES,type VisualCategory} from "./storyboard-prompt";

const SYSTEM_PROMPT=`You are StoryFrame AI, an expert visual story director, storyboard artist, continuity director, and image-prompt writer.

Return STRICT valid JSON only. Never return markdown, code fences, commentary, or prose outside the JSON object.

Preserve the original story chronology and important facts. Do not invent major plot events.

Analyze the story deeply and identify:
- main and supporting characters
- reusable character appearance and clothing
- character visual consistency
- recurring locations and environment architecture
- lighting and atmosphere
- scene continuity
- important props, artifacts, and vehicles
- visual actions and reactions
- story transitions and reveals
- suspense beats
- establishing shots
- close-ups
- emotional beats

Break the story into meaningful VISUAL scenes, not sentence-by-sentence chunks. Do not combine clearly different visual actions when separate frames would tell the story better. Every scene must be useful for image generation.

All image_prompt values MUST be written in English even when the source story is Hindi. Each image prompt should be a strong standalone visual description with relevant character identity, appearance, outfit, pose/action, facial expression, location, environment details, important props, camera shot, camera angle, composition, lighting, mood, visual style, and continuity facts.

Never request subtitles, speech bubbles, narration text, logos, UI, captions, readable signs, or watermarks inside image prompts.

Character descriptions must be reusable across future scenes. Preserve the same face, hairstyle, apparent age, body type, and costume unless the story explicitly changes them. If the source does not specify a visual detail, choose a restrained reusable detail only when needed for consistency; do not invent extreme or plot-changing details.

Location descriptions must preserve recurring building/room layout, doors/windows, furniture, important props, landmarks, materials, and lighting direction whenever continuity requires it.

Existing StoryFrame Visual Bible, locked characters, locations, props, and vehicles in the user prompt are authoritative. Never silently redesign them. Story-authorized temporary states such as injury, wet clothes, battle damage, or a costume change must be represented as temporary scene state rather than rewriting the base identity.

Prefer the exact JSON shape requested in the user prompt. StoryFrame will safely normalize harmless camelCase/snake_case field differences, but all factual content and scene chronology must remain correct.`;

type JsonRecord=Record<string,unknown>;

function record(value:unknown):JsonRecord{return value&&typeof value==="object"&&!Array.isArray(value)?value as JsonRecord:{}}
function text(value:unknown,fallback=""){return typeof value==="string"&&value.trim()?value.trim():fallback}
function list(value:unknown){return Array.isArray(value)?value.map((item)=>text(item)).filter(Boolean):typeof value==="string"&&value.trim()?[value.trim()]:[]}
function numberValue(value:unknown,fallback:number){const n=typeof value==="number"?value:Number(value);return Number.isFinite(n)?n:fallback}
function first(obj:JsonRecord,...keys:string[]){for(const key of keys){if(obj[key]!==undefined&&obj[key]!==null)return obj[key]}return undefined}

function visualCategory(value:unknown,index:number,scene:JsonRecord):VisualCategory{
  const raw=text(value).toUpperCase().replace(/_/g," ").replace(/\s+/g," ");
  const exact=(VISUAL_CATEGORIES as readonly string[]).find((item)=>item===raw);
  if(exact)return exact as VisualCategory;
  const source=`${raw} ${text(first(scene,"camera_shot","cameraShot"))} ${text(first(scene,"description","action"))}`.toLowerCase();
  if(source.includes("close"))return "CLOSE-UP";
  if(source.includes("crowd")||source.includes("group"))return "CROWD";
  if(source.includes("dialog"))return "DIALOGUE";
  if(source.includes("reaction")||source.includes("react"))return "REACTION";
  if(source.includes("reveal")||source.includes("discover"))return "REVEAL";
  if(source.includes("magic")||source.includes("cultivation")||source.includes("energy")||source.includes("spiritual"))return "MAGIC / CULTIVATION";
  if(source.includes("move")||source.includes("walk")||source.includes("run")||source.includes("travel"))return "MOVEMENT";
  if(source.includes("transition"))return "TRANSITION";
  if(source.includes("emotion")||source.includes("sad")||source.includes("fear")||source.includes("joy"))return "EMOTIONAL BEAT";
  if(source.includes("environment")||source.includes("landscape"))return "ENVIRONMENT";
  if(source.includes("introduc"))return "CHARACTER INTRODUCTION";
  if(source.includes("action")||source.includes("fight")||source.includes("attack")||source.includes("battle"))return "ACTION";
  return index===0?"ESTABLISHING":"ACTION";
}

function adaptCharacter(value:unknown){
  const item=record(value);
  const name=text(first(item,"name","characterName"),"Unnamed Character");
  const appearance=text(first(item,"visualDescription","appearance","description"),`Stable reusable visual identity for ${name}`);
  const outfit=text(first(item,"outfit","costume","clothing"),"Preserve the same established outfit until the story explicitly changes it");
  const consistency=text(first(item,"consistencyNotes","consistency_notes"),"Keep the same facial structure, hairstyle, approximate age, body build and outfit across scenes until the story explicitly changes them.");
  return {
    name,
    role:text(first(item,"role"),"recurring character"),
    visualDescription:appearance,
    outfit,
    eyeColor:text(first(item,"eyeColor","eye_color"),"preserve established eye color"),
    hairColor:text(first(item,"hairColor","hair_color"),"preserve established hair color"),
    keyFeatures:list(first(item,"keyFeatures","key_features")).length?list(first(item,"keyFeatures","key_features")):[consistency],
    referencePrompt:text(first(item,"referencePrompt","canonicalPrompt","canonical_prompt"),`${name}, ${appearance}, ${outfit}. ${consistency}`),
    identityLock:first(item,"identityLock","identity_lock"),
    costumeLock:first(item,"costumeLock","costume_lock"),
    personalityVisuals:text(first(item,"personalityVisuals","personality_visuals"),"")||undefined
  };
}

function adaptLocation(value:unknown){
  const item=record(value);
  const name=text(first(item,"name","locationName"),"Primary Story Location");
  const architecture=text(first(item,"architectureStyle","architecture"),`Preserve the established architecture and layout of ${name}`);
  const lighting=text(first(item,"lighting"),"Cinematic motivated lighting consistent with the story");
  const continuity=text(first(item,"continuity","continuityNotes","geometryIdentity"),"Preserve doors, windows, furniture, landmarks, major props and layout across recurring scenes.");
  return {
    name,
    architectureStyle:architecture,
    lighting,
    colorPalette:text(first(item,"colorPalette","color_palette"),"follow the persistent project Visual Bible palette"),
    referencePrompt:text(first(item,"referencePrompt","canonicalPrompt","canonical_prompt"),`${name}, ${architecture}, ${lighting}. ${continuity}`),
    geometryIdentity:continuity,
    materials:text(first(item,"materials"),"preserve established story-appropriate materials"),
    importantFeatures:list(first(item,"importantFeatures","important_features"))
  };
}

function adaptObject(value:unknown,kind:"prop"|"vehicle"){
  const item=record(value);
  const name=text(first(item,"name"),kind==="vehicle"?"Recurring Vehicle":"Recurring Prop");
  return {
    name,
    ...(kind==="prop"?{kind:text(first(item,"kind"),"prop")==="artifact"?"artifact":"prop" as const}:{}),
    owner:text(first(item,"owner"),"")||undefined,
    shape:text(first(item,"shape"),"preserve established recurring shape"),
    size:text(first(item,"size"),"story-appropriate scale"),
    materials:text(first(item,"materials"),"story-appropriate materials"),
    colors:list(first(item,"colors","colorPalette","color_palette")),
    ornamentation:text(first(item,"ornamentation"),"preserve established ornamentation"),
    magicalEffects:text(first(item,"magicalEffects","magical_effects"),"none unless established by the story"),
    canonicalPrompt:text(first(item,"canonicalPrompt","canonical_prompt","referencePrompt"),`${name}, preserve the established recurring design without redesign`)
  };
}

function adaptScene(value:unknown,index:number){
  const item=record(value);
  const source=text(first(item,"narration_text","sourceText","storyText","source_text"),text(first(item,"description","action"),`Scene ${index+1}`));
  const description=text(first(item,"description","action"),source);
  const characterNames=list(first(item,"character_names","characterNames","characters"));
  const locationNames=list(first(item,"location_names","locationNames","locationName","location"));
  const cameraShot=text(first(item,"camera_shot","cameraShot","shotType"),index===0?"wide establishing shot":"medium cinematic shot");
  const cameraAngle=text(first(item,"camera_angle","cameraAngle"),"eye-level");
  const continuity=text(first(item,"continuity_notes","continuityNotes"),"Preserve established character identity, costume, location layout, props and story state from previous scenes.");
  const imagePrompt=text(first(item,"image_prompt","imagePrompt","prompt"),`${cameraShot}, ${cameraAngle}. ${description}. Cinematic storytelling, detailed environment, coherent lighting, consistent characters and location, no text, no watermark.`);
  const stateDetailsRaw=first(item,"character_state_details","characterStateDetails");
  const stateDetails=Array.isArray(stateDetailsRaw)?stateDetailsRaw.map((state)=>{const s=record(state);return {character_name:text(first(s,"character_name","characterName"),"Character"),state_id:text(first(s,"state_id","stateId"),"normal"),state_name:text(first(s,"state_name","stateName"),"Normal"),description:text(first(s,"description"),"base established appearance"),outfit_override:text(first(s,"outfit_override","outfitOverride"),"")||undefined,visual_effects:list(first(s,"visual_effects","visualEffects"))}}):[];
  const statesRaw=record(first(item,"character_states","characterStates"));
  const characterStates=Object.fromEntries(Object.entries(statesRaw).map(([key,val])=>[key,text(val,"normal")]));
  return {
    scene_number:Math.max(1,Math.round(numberValue(first(item,"scene_number","sceneNumber"),index+1))),
    scene_title:text(first(item,"scene_title","sceneTitle","title"),`Scene ${index+1}`),
    visual_category:visualCategory(first(item,"visual_category","visualCategory","type"),index,item),
    narration_text:source,
    description,
    character_names:characterNames,
    location_names:locationNames,
    prop_names:list(first(item,"prop_names","propNames","props")),
    vehicle_names:list(first(item,"vehicle_names","vehicleNames","vehicles")),
    camera_shot:cameraShot,
    camera_angle:cameraAngle,
    lens_feel:text(first(item,"lens_feel","lensFeel"),"cinematic natural perspective"),
    composition:text(first(item,"composition"),"clear focal hierarchy with cinematic depth"),
    camera_movement_suggestion:text(first(item,"camera_movement_suggestion","cameraMovementSuggestion"),"subtle cinematic movement"),
    action:text(first(item,"action"),description),
    emotion:text(first(item,"emotion","mood"),"story-appropriate emotion"),
    lighting_style:text(first(item,"lighting_style","lightingStyle","lighting"),"cinematic motivated lighting"),
    time_of_day:text(first(item,"time_of_day","timeOfDay"),"consistent with story"),
    weather:text(first(item,"weather"),"preserve unless story changes it"),
    story_state:text(first(item,"story_state","storyState"),description),
    character_states:characterStates,
    character_state_details:stateDetails,
    continuity_notes:continuity,
    image_prompt:imagePrompt
  };
}

function adaptXKiroPayload(value:unknown){
  const root=record(value);
  const payload=record(first(root,"analysis","result","data")||root);
  const charactersRaw=first(payload,"characters","characterProfiles","character_profiles");
  const locationsRaw=first(payload,"locations","locationProfiles","location_profiles");
  const propsRaw=first(payload,"props","artifacts");
  const vehiclesRaw=first(payload,"vehicles");
  const scenesRaw=first(payload,"scenes","storyboard","sceneBreakdown","scene_breakdown");
  return {
    summary:text(first(payload,"summary","storySummary","story_summary"),"Story analyzed into cinematic visual beats."),
    projectVisualBible:first(payload,"projectVisualBible","project_visual_bible")??null,
    characters:Array.isArray(charactersRaw)?charactersRaw.map(adaptCharacter):[],
    locations:Array.isArray(locationsRaw)?locationsRaw.map(adaptLocation):[],
    props:Array.isArray(propsRaw)?propsRaw.map((item)=>adaptObject(item,"prop")):[],
    vehicles:Array.isArray(vehiclesRaw)?vehiclesRaw.map((item)=>adaptObject(item,"vehicle")):[],
    scenes:Array.isArray(scenesRaw)?scenesRaw.slice(0,60).map(adaptScene):[]
  };
}

export async function tryXKiroContinuityAnalysis(rawInput:unknown){
  const parsed=AnalyzeInput.safeParse(rawInput);
  if(!parsed.success){
    return {ok:false as const,status:400,error:"Invalid chapter analysis request",details:parsed.error.flatten()};
  }

  const input=parsed.data;
  try{
    const completion=await xkiroJsonCompletion({
      model:input.analysisModel,
      systemPrompt:SYSTEM_PROMPT,
      userPrompt:buildContinuityAnalysisPrompt(input),
      temperature:0.15,
      maxTokens:14000
    });

    const adapted=adaptXKiroPayload(completion.json);
    const validated=ContinuityRawOutput.safeParse(adapted);
    if(!validated.success){
      console.error("xKiro continuity validation failed after normalization",validated.error.flatten());
      return {ok:false as const,status:502,error:"xKiro returned incomplete story data. StoryFrame tried safe normalization, then switched to fallback analysis."};
    }

    return {
      ok:true as const,
      data:{
        ...normalizeContinuityOutput(validated.data),
        provider:`xKiro · ${input.analysisModel}`
      }
    };
  }catch(error){
    if(error instanceof XKiroRequestError){
      console.error("xKiro continuity analysis failed",{code:error.code,status:error.status,message:error.message});
      return {ok:false as const,status:error.status||502,error:error.message};
    }
    console.error("xKiro continuity analysis failed",error);
    return {ok:false as const,status:502,error:"xKiro story analysis was unavailable."};
  }
}
