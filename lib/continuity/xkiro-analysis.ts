import {AnalyzeInput,ContinuityRawOutput,normalizeContinuityOutput,resolveTargetScenes,type ParsedAnalyzeInput} from "./analyzer";
import {XKiroRequestError,xkiroJsonCompletion} from "../xkiro";
import {VISUAL_CATEGORIES,type VisualCategory} from "./storyboard-prompt";

const SYSTEM_PROMPT=`You are StoryFrame AI, an expert visual story director, storyboard artist, continuity director, and image-prompt writer.

Return STRICT valid JSON only. Never return markdown, code fences, commentary, or prose outside the JSON object.
Preserve the original story chronology and important facts. Do not invent major plot events.
Break the story into meaningful VISUAL scenes, not sentence-by-sentence chunks. Do not combine clearly different visual actions when separate frames would tell the story better.

Analyze characters, reusable appearance and clothing, recurring locations, environment architecture, important props, visual actions, reactions, transitions, reveals, suspense, establishing shots, close-ups and emotional beats.

All imagePrompt values MUST be written in English even when the source story is Hindi. Every imagePrompt must be standalone usable and include the relevant subject identity, appearance/outfit, pose or action, facial expression, environment, important props, camera framing, composition, lighting, mood, visual style and continuity facts.

Never request subtitles, speech bubbles, narration text, logos, UI, captions, readable signs or watermarks inside image prompts.
Preserve the same face, hairstyle, apparent age, body type and costume until the story explicitly changes them.
Preserve recurring location layout, doors/windows, furniture, landmarks, important props, materials and lighting direction when continuity requires it.
Existing StoryFrame locked characters, locations and Visual Bible supplied by the user are authoritative and must not be silently redesigned.`;

type JsonRecord=Record<string,unknown>;

function record(value:unknown):JsonRecord{return value&&typeof value==="object"&&!Array.isArray(value)?value as JsonRecord:{}}
function text(value:unknown,fallback=""){return typeof value==="string"&&value.trim()?value.trim():fallback}
function list(value:unknown){return Array.isArray(value)?value.map((item)=>text(item)).filter(Boolean):typeof value==="string"&&value.trim()?[value.trim()]:[]}
function numberValue(value:unknown,fallback:number){const n=typeof value==="number"?value:Number(value);return Number.isFinite(n)?n:fallback}
function first(obj:JsonRecord,...keys:string[]){for(const key of keys){if(obj[key]!==undefined&&obj[key]!==null)return obj[key]}return undefined}

function unwrapPayload(value:unknown):JsonRecord{
  let current=record(value);
  for(let depth=0;depth<4;depth+=1){
    const hasUsefulKeys=["summary","characters","locations","scenes","storyboard","sceneBreakdown","scene_breakdown"].some((key)=>current[key]!==undefined);
    if(hasUsefulKeys)return current;
    const nested=first(current,"analysis","result","data","output","storyAnalysis","story_analysis","storyboardData","storyboard_data");
    if(!nested||typeof nested!=="object"||Array.isArray(nested))break;
    current=record(nested);
  }
  return current;
}

function nestedArray(value:unknown,keys:string[]):unknown[]{
  if(Array.isArray(value))return value;
  const obj=record(value);
  for(const key of keys){
    const candidate=obj[key];
    if(Array.isArray(candidate))return candidate;
    if(candidate&&typeof candidate==="object"&&!Array.isArray(candidate)){
      const nested=nestedArray(candidate,keys);
      if(nested.length)return nested;
    }
  }
  return [];
}

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
  const name=text(first(item,"name","characterName","character_name"),"Unnamed Character");
  const appearance=text(first(item,"visualDescription","appearance","description"),`Stable reusable visual identity for ${name}`);
  const outfit=text(first(item,"outfit","costume","clothing"),"Preserve the same established outfit until the story explicitly changes it");
  const consistency=text(first(item,"consistencyNotes","consistency_notes","continuity"),"Keep the same facial structure, hairstyle, approximate age, body build and outfit across all scenes until the story explicitly changes them.");
  return {
    name,
    role:text(first(item,"role"),"recurring character"),
    visualDescription:appearance,
    outfit,
    eyeColor:text(first(item,"eyeColor","eye_color"),"preserve established eye color"),
    hairColor:text(first(item,"hairColor","hair_color"),"preserve established hair color"),
    keyFeatures:list(first(item,"keyFeatures","key_features")).length?list(first(item,"keyFeatures","key_features")):[consistency],
    referencePrompt:text(first(item,"referencePrompt","canonicalPrompt","canonical_prompt"),`${name}, ${appearance}, ${outfit}. ${consistency}`),
    personalityVisuals:text(first(item,"personalityVisuals","personality_visuals"),"")||undefined
  };
}

function adaptLocation(value:unknown){
  const item=record(value);
  const name=text(first(item,"name","locationName","location_name"),"Primary Story Location");
  const architecture=text(first(item,"architectureStyle","architecture"),`Preserve the established architecture and layout of ${name}`);
  const lighting=text(first(item,"lighting"),"Cinematic motivated lighting consistent with the story");
  const continuity=text(first(item,"continuity","continuityNotes","continuity_notes","geometryIdentity"),"Preserve doors, windows, furniture, landmarks, major props and layout across recurring scenes.");
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
  const rawKind=text(first(item,"kind"),"prop");
  return {
    name,
    ...(kind==="prop"?{kind:rawKind==="artifact"?"artifact" as const:"prop" as const}:{}),
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
  const locationNames=list(first(item,"location_names","locationNames","locationName","location_name","location"));
  const cameraShot=text(first(item,"camera_shot","cameraShot","shotType","shot_type"),index===0?"wide establishing shot":"medium cinematic shot");
  const cameraAngle=text(first(item,"camera_angle","cameraAngle"),"eye-level");
  const continuity=text(first(item,"continuity_notes","continuityNotes"),"Preserve established character identity, costume, location layout, props and story state from previous scenes.");
  const negative=text(first(item,"negativePrompt","negative_prompt"),"");
  const imagePrompt=text(first(item,"image_prompt","imagePrompt","prompt"),`${cameraShot}, ${cameraAngle}. ${description}. Cinematic storytelling, detailed environment, coherent lighting, consistent characters and location, no text, no watermark.`);
  const statesRaw=record(first(item,"character_states","characterStates"));
  const characterStates=Object.fromEntries(Object.entries(statesRaw).map(([key,val])=>[key,text(val,"normal")]));
  return {
    scene_number:Math.max(1,Math.round(numberValue(first(item,"scene_number","sceneNumber"),index+1))),
    scene_title:text(first(item,"scene_title","sceneTitle","title"),`Scene ${index+1}`),
    visual_category:visualCategory(first(item,"visual_category","visualCategory","type","category"),index,item),
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
    character_state_details:[],
    continuity_notes:negative?`${continuity} Avoid: ${negative}`:continuity,
    image_prompt:imagePrompt
  };
}

function adaptXKiroPayload(value:unknown){
  const payload=unwrapPayload(value);
  const charactersRaw=nestedArray(first(payload,"characters","characterProfiles","character_profiles"),["characters","items","profiles"]);
  const locationsRaw=nestedArray(first(payload,"locations","locationProfiles","location_profiles"),["locations","items","profiles"]);
  const propsRaw=nestedArray(first(payload,"props","artifacts"),["props","artifacts","items"]);
  const vehiclesRaw=nestedArray(first(payload,"vehicles"),["vehicles","items"]);
  const scenesCandidate=first(payload,"scenes","storyboard","sceneBreakdown","scene_breakdown","visualScenes","visual_scenes");
  const scenesRaw=nestedArray(scenesCandidate,["scenes","items","beats","shots","storyboard"]);
  return {
    summary:text(first(payload,"summary","storySummary","story_summary"),"Story analyzed into cinematic visual beats."),
    projectVisualBible:null,
    characters:charactersRaw.map(adaptCharacter),
    locations:locationsRaw.map(adaptLocation),
    props:propsRaw.map((item)=>adaptObject(item,"prop")),
    vehicles:vehiclesRaw.map((item)=>adaptObject(item,"vehicle")),
    scenes:scenesRaw.slice(0,60).map(adaptScene)
  };
}

function buildXKiroPrompt(input:ParsedAnalyzeInput){
  const target=resolveTargetScenes(input.story,input.targetScenes);
  return `PROJECT: ${input.projectName}\nCHAPTER: ${input.chapterTitle}\nVISUAL STYLE: ${input.visualStyle||"Use the persistent StoryFrame Visual Bible style."}\nSCENE BUDGET: approximately ${target}; actual visual beats are more important; never exceed 60 scenes.\n\nEXISTING LOCKED CHARACTERS (authoritative):\n${JSON.stringify(input.existingCharacters)}\n\nEXISTING LOCKED LOCATIONS (authoritative):\n${JSON.stringify(input.existingLocations)}\n\nEXISTING VISUAL BIBLE (authoritative):\n${JSON.stringify(input.existingVisualBible||null)}\n\nSTORY:\n${input.story}\n\nReturn exactly one JSON object with this compact shape:\n{\n  "summary":"...",\n  "characters":[{"name":"...","role":"...","appearance":"...","outfit":"...","consistencyNotes":"..."}],\n  "locations":[{"name":"...","architecture":"...","lighting":"...","continuity":"..."}],\n  "scenes":[{\n    "sourceText":"exact source-story segment represented by this scene",\n    "description":"visual beat description",\n    "characterNames":["exact character names"],\n    "locationName":"exact location name",\n    "cameraShot":"...",\n    "cameraAngle":"...",\n    "duration":4,\n    "imagePrompt":"rich standalone English image-generation prompt",\n    "negativePrompt":"no text, no watermark, plus scene-specific avoidances",\n    "continuityNotes":"..."\n  }]\n}\n\nRules:\n- characters and locations must be arrays even if empty. scenes must contain at least one scene.\n- Use exact canonical names for already-known characters/locations.\n- Do not output null for required text fields; use an empty string only when truly unavailable.\n- imagePrompt must be in English and visually rich.\n- Keep sourceText in the original story language and chronology.\n- Do not invent major plot events.\n- Do not include markdown or any keys outside the JSON object.`;
}

function validationSummary(error:{issues:Array<{path:PropertyKey[];message:string}>}){
  return error.issues.slice(0,12).map((issue)=>`${issue.path.map(String).join(".")||"root"}: ${issue.message}`).join("; ");
}

async function requestAndValidate(input:ParsedAnalyzeInput,userPrompt:string){
  const completion=await xkiroJsonCompletion({model:input.analysisModel,systemPrompt:SYSTEM_PROMPT,userPrompt,temperature:0.15,maxTokens:14000});
  const adapted=adaptXKiroPayload(completion.json);
  return {completion,adapted,validated:ContinuityRawOutput.safeParse(adapted)};
}

export async function tryXKiroContinuityAnalysis(rawInput:unknown){
  const parsed=AnalyzeInput.safeParse(rawInput);
  if(!parsed.success)return {ok:false as const,status:400,error:"Invalid chapter analysis request",details:parsed.error.flatten()};
  const input=parsed.data;

  try{
    const basePrompt=buildXKiroPrompt(input);
    let attempt=await requestAndValidate(input,basePrompt);

    if(!attempt.validated.success){
      const issues=validationSummary(attempt.validated.error);
      console.warn("xKiro continuity response needs one repair retry",issues);
      const previous=JSON.stringify(attempt.completion.json).slice(0,40000);
      const repairPrompt=`${basePrompt}\n\nREPAIR RETRY:\nYour previous JSON was valid JSON but incomplete for StoryFrame. Validation problems: ${issues}.\nReturn the COMPLETE corrected JSON object, not a patch. Preserve the same story facts and chronology. Ensure scenes is a non-empty array.\n\nPREVIOUS JSON TO REPAIR:\n${previous}`;
      attempt=await requestAndValidate(input,repairPrompt);
    }

    if(!attempt.validated.success){
      console.error("xKiro continuity validation failed after repair",attempt.validated.error.flatten());
      return {ok:false as const,status:502,error:"xKiro returned incomplete story data after an automatic repair attempt. StoryFrame switched to fallback analysis."};
    }

    return {ok:true as const,data:{...normalizeContinuityOutput(attempt.validated.data),provider:`xKiro · ${input.analysisModel}`}};
  }catch(error){
    if(error instanceof XKiroRequestError){
      console.error("xKiro continuity analysis failed",{code:error.code,status:error.status,message:error.message});
      return {ok:false as const,status:error.status||502,error:error.message};
    }
    console.error("xKiro continuity analysis failed",error);
    return {ok:false as const,status:502,error:"xKiro story analysis was unavailable."};
  }
}
