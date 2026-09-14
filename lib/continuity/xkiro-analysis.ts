import {AnalyzeInput,ContinuityRawOutput,buildContinuityAnalysisPrompt,normalizeContinuityOutput} from "./analyzer";
import {XKiroRequestError,xkiroJsonCompletion} from "../xkiro";

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

The user prompt defines the exact JSON shape required by the existing StoryFrame continuity pipeline. Follow it exactly.`;

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

    const validated=ContinuityRawOutput.safeParse(completion.json);
    if(!validated.success){
      console.error("xKiro continuity validation failed",validated.error.flatten());
      return {ok:false as const,status:502,error:"xKiro returned story data that did not pass StoryFrame validation."};
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
