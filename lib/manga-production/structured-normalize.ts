function humanizeKey(value:string):string{return value.replace(/([a-z0-9])([A-Z])/g,"$1 $2").replace(/[_-]+/g," ").trim()}

export function structuredText(value:unknown,fallback=""):string{
  if(value==null)return fallback;
  if(typeof value==="string")return value.trim()||fallback;
  if(typeof value==="number"||typeof value==="boolean")return String(value);
  if(Array.isArray(value)){
    const parts:string[]=value.map((item):string=>structuredText(item,"")).filter((item):item is string=>Boolean(item));
    return parts.length?parts.join("; "):fallback;
  }
  if(typeof value==="object"){
    const parts:string[]=Object.entries(value as Record<string,unknown>).map(([key,item]):string=>{
      const text:string=structuredText(item,"");
      return text?`${humanizeKey(key)}: ${text}`:"";
    }).filter((item):item is string=>Boolean(item));
    return parts.length?parts.join("; "):fallback;
  }
  return fallback;
}

const TEXT_FIELDS=new Set([
  "name","role","gender","approximateAge","shape","eyes","eyebrows","nose","mouth","specialFeatures","color","style","length","build","height","proportions",
  "defaultOutfit","currentOutfit","consistencyNotes","architecture","lighting","timeOfDay","continuityNotes","appearance","currentOwner","currentLocation","condition",
  "sourceText","event","storyBeat","locationName","action","reaction","stateAfter","characterName","position","bodyDirection","pose","expression",
  "speaker","text","emotion","pagePurpose","startState","panelLayout","location","characterPositions","cameraShot","cameraAngle","cameraDirection","foreground","midground","background","composition","mood",
  "continuityFromPreviousPanel","continuityToNextPanel","imagePrompt","negativePrompt","continuityToNextPage","timeline","previousPageEndState","chunkEndState"
]);

const STRING_ARRAY_FIELDS=new Set([
  "accessories","importantObjects","importantProps","characterNames","propNames","heldObjects","injuries","soundEffects","activeProps"
]);

const BOOLEAN_FIELDS=new Set(["dirtyClothes","wetClothes"]);
const OBJECT_WITH_DEFAULT_FIELDS=new Set(["face","hair","body"]);
const BEAT_TYPES=new Set(["action","reaction","reveal","dialogue","transition","environment","object","emotion"]);
const BUBBLE_TYPES=new Set(["speech","thought","shout","whisper","narration"]);

function normalizeStringArray(value:unknown):string[]{
  if(value==null)return [];
  if(Array.isArray(value))return value.map((item)=>structuredText(item,"")).filter((item):item is string=>Boolean(item));
  const text=structuredText(value,"");
  return text?[text]:[];
}

function normalizeBoolean(value:unknown):boolean{
  if(typeof value==="boolean")return value;
  if(typeof value==="number")return value!==0;
  if(typeof value==="string")return ["true","yes","1","y","wet","dirty"].includes(value.trim().toLowerCase());
  return false;
}

function normalizeLayout(value:unknown):Record<string,string>{
  if(value==null)return {};
  if(Array.isArray(value)){
    const text=structuredText(value,"");
    return text?{details:text}:{};
  }
  if(typeof value!=="object"){
    const text=structuredText(value,"");
    return text?{details:text}:{};
  }
  const output:Record<string,string>={};
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
    const text=structuredText(item,"");
    if(text)output[key]=text;
  }
  return output;
}

function normalizeCharacterList(value:unknown):unknown{
  // Top-level master `characters` is an array of character objects, while
  // panel/page `characters` can be a list of names or an end-state record.
  if(Array.isArray(value)){
    if(value.every((item)=>item==null||typeof item!=="object"))return normalizeStringArray(value);
    return value;
  }
  if(typeof value==="string")return normalizeStringArray(value);
  return value;
}

function normalizeDialogue(value:unknown,visit:(input:unknown)=>unknown):unknown[]{
  if(value==null)return [];
  if(Array.isArray(value))return value.map((item)=>visit(item));
  if(typeof value==="string")return [{speaker:"",text:value,emotion:"neutral",bubbleType:"speech"}];
  if(typeof value==="object")return [visit(value)];
  return [];
}

function normalizeEnum(value:unknown,allowed:Set<string>,fallback:string):string{
  const text=structuredText(value,"").trim().toLowerCase().replace(/[_-]+/g," ");
  if(allowed.has(text))return text;
  const compact=text.replace(/\s+/g,"-");
  return allowed.has(compact)?compact:fallback;
}

export function normalizeMangaStructuredData<T>(value:T):T{
  const visit=(input:unknown):unknown=>{
    if(Array.isArray(input))return input.map((item)=>visit(item));
    if(!input||typeof input!=="object")return input;
    const source=input as Record<string,unknown>;
    const output:Record<string,unknown>={};
    for(const [key,item] of Object.entries(source)){
      if(key==="layout"){
        output[key]=normalizeLayout(item);
        continue;
      }
      // A page's endState is text, while the top-level PageOutput endState is
      // a structured continuity object. Only coerce the page form.
      if(key==="endState"&&Array.isArray(source.panels)){
        output[key]=structuredText(item,"");
        continue;
      }
      if(key==="characters"){
        output[key]=visit(normalizeCharacterList(item));
        continue;
      }
      if(key==="dialogue"){
        output[key]=normalizeDialogue(item,visit);
        continue;
      }
      if(key==="type"){
        output[key]=normalizeEnum(item,BEAT_TYPES,"action");
        continue;
      }
      if(key==="bubbleType"){
        output[key]=normalizeEnum(item,BUBBLE_TYPES,"speech");
        continue;
      }
      if(OBJECT_WITH_DEFAULT_FIELDS.has(key)){
        output[key]=item&&typeof item==="object"&&!Array.isArray(item)?visit(item):{};
        continue;
      }
      if(STRING_ARRAY_FIELDS.has(key)){
        output[key]=normalizeStringArray(item);
        continue;
      }
      if(BOOLEAN_FIELDS.has(key)){
        output[key]=normalizeBoolean(item);
        continue;
      }
      if(key==="consumedBeatCount"){
        const parsed=Number(item);output[key]=Number.isFinite(parsed)?Math.trunc(parsed):0;
        continue;
      }
      // Always normalize known text fields, not only object/array values. This
      // safely absorbs null, numeric and boolean variants emitted by LLMs.
      if(TEXT_FIELDS.has(key)){
        output[key]=structuredText(item,"");
        continue;
      }
      output[key]=visit(item);
    }
    return output;
  };
  return visit(value) as T;
}
