const baseUrl=process.env.XKIRO_BASE_URL?.replace(/\/$/,"")||"https://api.xkiro.com/v1";
const apiKey=process.env.XKIRO_API_KEY?.trim();
const analyzeTimeoutMs=Number(process.env.XKIRO_ANALYZE_TIMEOUT_MS||90000);

export const XKIRO_STORY_MODELS=["mistralai/mistral-medium-3.5","mistralai/mistral-large-2512"] as const;
export type XKiroStoryModel=(typeof XKIRO_STORY_MODELS)[number];

export function hasXKiro(){
  return Boolean(apiKey);
}

export function isXKiroStoryModel(value:string):value is XKiroStoryModel{
  return (XKIRO_STORY_MODELS as readonly string[]).includes(value);
}

async function fetchWithTimeout(input:string|URL,init:RequestInit,timeoutMs:number){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(input,{...init,signal:controller.signal});
  }catch(error){
    if(error instanceof Error&&error.name==="AbortError") throw new Error(`xKiro request timed out after ${Math.round(timeoutMs/1000)} seconds`);
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

function extractFirstJsonObject(value:string){
  const cleaned=value.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start===-1||end===-1||end<=start) throw new Error("JSON object not found in xKiro model response");
  return JSON.parse(cleaned.slice(start,end+1));
}

function messageContentToText(content:unknown){
  if(typeof content==="string") return content;
  if(Array.isArray(content)) return content.map((part)=>{
    if(typeof part==="string") return part;
    if(part&&typeof part==="object"&&"text" in part&&typeof (part as {text?:unknown}).text==="string") return (part as {text:string}).text;
    return "";
  }).join("");
  if(content&&typeof content==="object") return JSON.stringify(content);
  return "";
}

export async function xkiroAnalyzeStory(input:{story:string;visualStyle:string;model:XKiroStoryModel}){
  if(!apiKey) throw new Error("XKIRO_API_KEY is not configured");
  if(!isXKiroStoryModel(input.model)) throw new Error("Unsupported xKiro story model");

  const words=input.story.trim().split(/\s+/).filter(Boolean).length;
  const targetScenes=Math.min(60,Math.max(4,Math.ceil(words/60)));
  const system=`You are StoryFrame AI, an expert visual story director and storyboard prompt writer. Return STRICT valid JSON only, never markdown or commentary. Preserve source chronology and facts; do not invent major plot events. Output exactly these top-level keys: summary, characters, locations, scenes. characters[] fields: name, role, appearance, outfit, consistencyNotes. locations[] fields: name, architecture, lighting, continuity. scenes[] fields: sourceText, description, characterNames, locationName, cameraShot, cameraAngle, duration, imagePrompt, negativePrompt, continuityNotes. Break the story into true visual beats: establishing shot, entrance, action, reaction, reveal, close-up, location change, suspense, transition and payoff. Keep visually distinct actions/reactions separate when useful. Character descriptions must include stable reusable identity details such as approximate age, face, hair, build and clothing when the story supports them. Location descriptions must preserve reusable layout, architecture, props and lighting continuity. imagePrompt must always be in English even if the source story is Hindi. Each imagePrompt must be a standalone high-quality visual prompt with subject, action, environment, camera framing, lighting, mood and continuity details. Never request text, captions, subtitles, logos, watermarks or speech bubbles inside generated images. Use only character/location names actually supported by the story. Keep JSON compact enough to fit the response limit.`;
  const user=`Visual style: ${input.visualStyle}\nTarget scene count: about ${targetScenes} scenes. Use fewer or more only when the actual visual beats require it, with a maximum of 60 scenes.\n\nStory:\n${input.story}`;

  const response=await fetchWithTimeout(`${baseUrl}/chat/completions`,{
    method:"POST",
    headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:input.model,
      messages:[{role:"system",content:system},{role:"user",content:user}],
      temperature:0.15,
      max_tokens:14000,
      response_format:{type:"json_object"}
    }),
    cache:"no-store"
  },analyzeTimeoutMs);

  const raw=await response.text();
  if(!response.ok) throw new Error(`xKiro request failed (${response.status}): ${raw.replace(/\s+/g," ").slice(0,300)}`);

  let data:unknown;
  try{
    data=JSON.parse(raw);
  }catch{
    throw new Error(`xKiro returned non-JSON API data: ${raw.replace(/\s+/g," ").slice(0,300)}`);
  }

  const content=(data as {choices?:Array<{message?:{content?:unknown}}>}|null)?.choices?.[0]?.message?.content;
  const text=messageContentToText(content);
  if(!text) throw new Error("No analysis content received from xKiro");

  return {raw:text,json:extractFirstJsonObject(text),provider:"xkiro",model:input.model};
}
