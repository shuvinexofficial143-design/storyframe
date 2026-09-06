export const VISUAL_CATEGORIES=[
  "Establishing Shot",
  "Action Shot",
  "Crowd Shot",
  "Close-Up Motivation",
  "Next Generation Training"
] as const;

export type VisualCategory=(typeof VISUAL_CATEGORIES)[number];

export const WEBSITE_READY_SCENE_JSON_EXAMPLE=`[
  {
    "scene_number": 1,
    "scene_title": "The Flying Spiritual Warship",
    "visual_category": "Establishing Shot",
    "image_prompt": "Wide-angle cinematic shot of a colossal flying spiritual warship gliding above misty mountain peaks, glowing spiritual runes across its golden hull, disciples visible on deck, dramatic sunrise backlight and volumetric clouds, Xianxia, Manhwa style, highly detailed, 8k, photorealistic lighting, ray tracing, detailed textures, Unreal Engine 5 render.",
    "narration_text": "Exact source-story segment for this scene.",
    "character_names": ["Exact canonical character name"],
    "location_names": ["Exact canonical location name"],
    "camera_angle": "wide-angle cinematic aerial shot",
    "lighting_style": "golden hour backlight with volumetric fog",
    "continuity_notes": "Preserve the locked ship design, character identities, clothing, props and location layout."
  }
]`;

export function buildWebsiteReadyStoryboardPrompt(input:{
  projectName:string;
  chapterTitle:string;
  story:string;
  targetScenes:number;
  referenceLibrary:unknown;
}){
  return `You are an expert Xianxia / Manhwa / Anime Art Director, Storyboard Artist, and visual continuity director for a production website.

PROJECT: ${input.projectName}
CHAPTER: ${input.chapterTitle}
TARGET SCENES: approximately ${input.targetScenes}

EXISTING PROJECT REFERENCE LIBRARY:
${JSON.stringify(input.referenceLibrary)}

INPUT STORY SCRIPT:
${input.story}

TASK:
Analyze the story and split it into distinct, highly visual CINEMATIC BEATS. Do NOT split sentence-by-sentence. Merge adjacent lines that belong to one visual beat and create a new scene only when location, action, crowd focus, emotional motivation, or future/training relationship meaningfully changes.

VISUAL CATEGORIES — use only these exact values when applicable:
1. Establishing Shot — grand world, sects, cities, mountains, palaces, flying spiritual ships, artifacts, major environments.
2. Action Shot — movement, combat, sword flight, cultivation techniques, spellcasting, spiritual energy, chases, dynamic physical action.
3. Crowd Shot — passengers, cultivators, warriors, nobles, citizens, disciples, merchants, social life, deck scenes, group reactions.
4. Close-Up Motivation — facial emotion, eyes, hands, treasures, spirit stones, money bags, jade slips, ambition, greed, fear, strategy, scheming.
5. Next Generation Training — mentorship, inheritance, disciples, younger generation, training, legacy, future relationship or growth.

RETURN STRICT JSON ONLY.
Return one top-level JSON object with this exact shape:
{
  "summary": "short chapter summary",
  "characters": [
    {
      "name": "...",
      "visualDescription": "...",
      "outfit": "...",
      "eyeColor": "...",
      "hairColor": "...",
      "keyFeatures": ["..."],
      "referencePrompt": "concrete reusable canonical character description"
    }
  ],
  "locations": [
    {
      "name": "...",
      "architectureStyle": "...",
      "lighting": "...",
      "colorPalette": "...",
      "referencePrompt": "concrete reusable canonical environment description"
    }
  ],
  "scenes": ${WEBSITE_READY_SCENE_JSON_EXAMPLE}
}

SCENE RULES:
- scene_number: integer starting at 1 in chronological order.
- scene_title: short cinematic English title.
- visual_category: exactly one of ${JSON.stringify(VISUAL_CATEGORIES)}.
- image_prompt: English only, approximately 40-50 words. It MUST include a clear camera angle, atmospheric lighting, story action, composition, and these quality/style concepts naturally: Xianxia, Manhwa style, highly detailed, 8k, photorealistic lighting, ray tracing, detailed textures, Unreal Engine 5 render.
- narration_text: copy the exact Hindi/English source-story segment represented by that scene. Do not paraphrase it.
- character_names: exact canonical names of every visible recurring character. Reuse names from the existing reference library exactly.
- location_names: exact canonical names of every visible recurring place. Reuse names from the existing reference library exactly.
- camera_angle: concise camera framing/angle.
- lighting_style: concise atmosphere/lighting description.
- continuity_notes: machine-readable production note about what must remain visually unchanged.

REFERENCE LIBRARY RULES:
- characters[] and locations[] contain ONLY genuinely new references discovered in this chapter.
- NEVER redesign or re-output an existing reference as new.
- Existing recurring characters must reuse the exact canonical visual traits, outfit descriptions, face identity and names from the supplied library.
- Existing locations must reuse their exact architecture, layout, palette and recurring props.
- If a pronoun clearly refers to an existing recurring character, still put that canonical character name in character_names.

IMAGE RULES:
- Do not put subtitles, speech bubbles, logos, watermarks, UI, readable signs, captions or text inside image prompts.
- Do not repeat the locked character/location reference strings inside image_prompt; the website appends them after parsing.
- Avoid identical framing for consecutive scenes.
- Use visually different compositions while preserving identity and environment continuity.

Return valid JSON only. No markdown fences. No commentary.`;
}
