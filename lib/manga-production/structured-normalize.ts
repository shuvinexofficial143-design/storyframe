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

function normalizeLayout(value:unknown):unknown{
  if(!value||typeof value!=="object"||Array.isArray(value))return value;
  const output:Record<string,string>={};
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
    const text=structuredText(item,"");
    if(text)output[key]=text;
  }
  return output;
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
      if(TEXT_FIELDS.has(key)&&(typeof item==="object"||Array.isArray(item))){
        output[key]=structuredText(item,"");
        continue;
      }
      output[key]=visit(item);
    }
    return output;
  };
  return visit(value) as T;
}
