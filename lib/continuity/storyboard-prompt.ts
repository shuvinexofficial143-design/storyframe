export const VISUAL_CATEGORIES=[
  "ESTABLISHING",
  "ACTION",
  "MOVEMENT",
  "CHARACTER INTRODUCTION",
  "DIALOGUE",
  "REACTION",
  "CLOSE-UP",
  "CROWD",
  "ENVIRONMENT",
  "REVEAL",
  "MAGIC / CULTIVATION",
  "TRANSITION",
  "EMOTIONAL BEAT"
] as const;

export type VisualCategory=(typeof VISUAL_CATEGORIES)[number];

export function buildWebsiteReadyStoryboardPrompt(input:{
  projectName:string;
  chapterTitle:string;
  story:string;
  targetScenes:number;
  referenceLibrary:unknown;
  existingVisualBible?:unknown;
  existingProps?:unknown;
  existingVehicles?:unknown;
}){
  const hasBible=Boolean(input.existingVisualBible);
  return `You are the continuity director, Xianxia/Donghua art director and cinematic storyboard architect for StoryFrame.

PROJECT: ${input.projectName}
CHAPTER: ${input.chapterTitle}
TARGET SCENES: approximately ${input.targetScenes}

EXISTING PROJECT VISUAL BIBLE:
${JSON.stringify(input.existingVisualBible||null)}

EXISTING REFERENCE LIBRARY:
${JSON.stringify(input.referenceLibrary)}

EXISTING PROPS:
${JSON.stringify(input.existingProps||[])}

EXISTING VEHICLES:
${JSON.stringify(input.existingVehicles||[])}

CHAPTER STORY:
${input.story}

MISSION:
Create continuity-aware cinematic beats, not sentence-by-sentence splits. Every recurring entity belongs to one persistent visual universe. Existing canonical definitions are authoritative and must never be silently redesigned.

RETURN STRICT JSON ONLY using this shape:
{
  "summary":"short chapter summary",
  "projectVisualBible":${hasBible?"null":"{\"visualStyle\":{\"genre\":\"Xianxia / Donghua\",\"renderStyle\":\"...\",\"detailLevel\":\"high\",\"lightingStyle\":\"...\",\"colorPalette\":[\"...\"],\"architectureStyle\":\"...\",\"environmentStyle\":\"...\",\"cameraLanguage\":\"...\",\"aspectRatio\":\"16:9\"},\"masterStylePrompt\":\"...\",\"negativeStylePrompt\":\"...\",\"world\":{\"id\":\"WORLD_001\",\"genre\":\"...\",\"environmentRules\":[\"...\"],\"architecture\":{\"materials\":[\"...\"],\"roofStyle\":\"...\",\"ornamentStyle\":\"...\",\"energyTechnology\":\"...\"},\"palette\":[\"...\"],\"canonicalPrompt\":\"...\",\"locked\":true}}"},
  "characters":[{
    "name":"...","role":"...","visualDescription":"...","outfit":"...","eyeColor":"...","hairColor":"...","keyFeatures":["..."],"referencePrompt":"...",
    "identityLock":{"gender":"...","apparentAge":"...","faceShape":"...","skinTone":"...","eyeColor":"...","eyeShape":"...","hairColor":"...","hairLength":"...","hairstyle":"...","bodyBuild":"...","heightClass":"..."},
    "costumeLock":{"primaryOutfit":"...","primaryColors":["..."],"belt":"...","boots":"...","accessories":"...","weapons":["..."]},
    "personalityVisuals":"..."
  }],
  "locations":[{"name":"...","architectureStyle":"...","lighting":"...","colorPalette":"...","referencePrompt":"...","geometryIdentity":"...","materials":"...","importantFeatures":["..."]}],
  "props":[{"name":"...","kind":"prop or artifact","owner":"...","shape":"...","size":"...","materials":"...","colors":["..."],"ornamentation":"...","magicalEffects":"...","canonicalPrompt":"..."}],
  "vehicles":[{"name":"...","owner":"...","shape":"...","size":"...","materials":"...","colors":["..."],"ornamentation":"...","magicalEffects":"...","canonicalPrompt":"..."}],
  "scenes":[{
    "scene_number":1,
    "scene_title":"...",
    "visual_category":"ESTABLISHING",
    "narration_text":"exact source segment",
    "description":"concise visual beat",
    "character_names":["exact canonical name"],
    "location_names":["exact canonical location"],
    "prop_names":["..."],
    "vehicle_names":["..."],
    "camera_shot":"wide establishing shot",
    "camera_angle":"...",
    "lens_feel":"...",
    "composition":"...",
    "camera_movement_suggestion":"...",
    "action":"...",
    "emotion":"...",
    "lighting_style":"...",
    "time_of_day":"...",
    "weather":"...",
    "story_state":"compact state after this beat",
    "character_states":{"Exact Character Name":"normal/injured/wet/dusty/battle damaged/ceremonial outfit/etc"},
    "continuity_notes":"what must remain unchanged",
    "image_prompt":"current scene action/composition only; do not restate canonical bibles"
  }]
}

RULES:
1. Allowed visual_category values are exactly: ${JSON.stringify(VISUAL_CATEGORIES)}.
2. Do NOT split sentence-by-sentence. Split on meaningful world/action/dialogue/reaction/reveal/magic/emotional transitions.
3. characters[], locations[], props[] and vehicles[] contain ONLY genuinely NEW project references. Existing entities must be reused by exact canonical name.
4. Existing character identity/costume, location geometry/materials, vehicle design and props are authoritative. Never redesign them.
5. If a story intentionally changes costume/state, put that in character_states and story_state; do not mutate base identity.
6. image_prompt describes only scene-specific action, camera, composition and lighting. The StoryFrame prompt compiler appends MASTER STYLE + WORLD + LOCATION + CHARACTER + OBJECT + PREVIOUS SCENE locks.
7. narration_text must preserve the exact source-language story segment.
8. No subtitles, speech bubbles, readable text, watermark or logo.
9. If projectVisualBible already exists, return projectVisualBible:null. Never rewrite the persistent bible per scene or per chapter.
10. Keep continuity memory compact. Do not copy all prior scenes.

Return valid JSON only. No markdown. No commentary.`;
}
