function humanizeKey(value:string):string{return value.replace(/([a-z0-9])([A-Z])/g,"$1 $2").replace(/[_-]+/g," ").trim()}

function tryParseJsonValue(value:unknown):unknown{
  if(typeof value!=="string")return value;
  const text=value.trim();
  if(!text)return value;
  const looksJson=(text.startsWith("[")&&text.endsWith("]"))||(text.startsWith("{")&&text.endsWith("}"));
  if(!looksJson)return value;
  try{return JSON.parse(text)}catch{return value}
}

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
  "sourceText","event","storyBeat","locationName","action","reaction","stateAfter","characterName","characterId","position","bodyDirection","pose","expression",
  "speaker","text","emotion","pagePurpose","startState","panelLayout","location","characterPositions","cameraShot","cameraAngle","cameraDirection","foreground","midground","background","composition","mood",
  "continuityFromPreviousPanel","continuityToNextPanel","imagePrompt","negativePrompt","continuityToNextPage","previousPageEndState","chunkEndState"
]);

const STRING_ARRAY_FIELDS=new Set([
  "accessories","importantObjects","importantProps","characterNames","propNames","heldObjects","injuries","soundEffects","activeProps","validationIssues"
]);

const BOOLEAN_FIELDS=new Set(["dirtyClothes","wetClothes"]);
const OBJECT_WITH_DEFAULT_FIELDS=new Set(["face","hair","body"]);
const BEAT_TYPES=new Set(["action","reaction","reveal","dialogue","transition","environment","object","emotion"]);
const BUBBLE_TYPES=new Set(["speech","thought","shout","whisper","narration"]);

function splitLooseList(value:string):string[]{
  const clean=(item:string)=>item.trim().replace(/^(?:[-*•]|\d+[.)])\s*/,"").trim();
  const parts=value.split(/(?:\r?\n|;|\|)+/).map(clean).filter(Boolean);
  return parts.length>1?parts:[clean(value)].filter(Boolean);
}

function normalizeStringArray(value:unknown):string[]{
  const parsed=tryParseJsonValue(value);
  if(parsed!==value)return normalizeStringArray(parsed);
  if(value==null)return [];
  if(Array.isArray(value))return value.map((item)=>structuredText(item,"")).filter((item):item is string=>Boolean(item));
  if(typeof value==="object"){
    return Object.values(value as Record<string,unknown>).map((item)=>structuredText(item,"")).filter((item):item is string=>Boolean(item));
  }
  const text=structuredText(value,"");
  return text?splitLooseList(text):[];
}

function normalizeBoolean(value:unknown):boolean{
  if(typeof value==="boolean")return value;
  if(typeof value==="number")return value!==0;
  if(typeof value==="string")return ["true","yes","1","y","wet","dirty"].includes(value.trim().toLowerCase());
  return false;
}

function normalizeLayout(value:unknown):Record<string,string>{
  const parsed=tryParseJsonValue(value);
  if(parsed!==value)return normalizeLayout(parsed);
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

function normalizeDialogue(value:unknown,visit:(input:unknown)=>unknown):unknown[]{
  const parsed=tryParseJsonValue(value);
  if(parsed!==value)return normalizeDialogue(parsed,visit);
  if(value==null)return [];
  if(Array.isArray(value))return value.map((item)=>typeof item==="string"?{speaker:"",text:item,emotion:"neutral",bubbleType:"speech"}:visit(item));
  if(typeof value==="string")return [{speaker:"",text:value,emotion:"neutral",bubbleType:"speech"}];
  if(typeof value==="object"){
    const record=value as Record<string,unknown>;
    if("text" in record||"speaker" in record||"bubbleType" in record)return [visit(record)];
    return Object.values(record).map((item)=>typeof item==="string"?{speaker:"",text:item,emotion:"neutral",bubbleType:"speech"}:visit(item));
  }
  return [];
}

function normalizeEnum(value:unknown,allowed:Set<string>,fallback:string):string{
  const text=structuredText(value,"").trim().toLowerCase().replace(/[_-]+/g," ");
  if(allowed.has(text))return text;
  const compact=text.replace(/\s+/g,"-");
  return allowed.has(compact)?compact:fallback;
}

function looksLikeMasterRoot(source:Record<string,unknown>):boolean{
  return "storySummary" in source&&( "timeline" in source||"beats" in source||"locations" in source||"props" in source||"initialCharacterStates" in source);
}

function looksLikeContinuityState(source:Record<string,unknown>):boolean{
  if("event" in source||"sourceText" in source)return false;
  return "activeProps" in source||"previousPageEndState" in source||("currentLocation" in source&&("characters" in source||"timeOfDay" in source));
}

function looksLikePanel(source:Record<string,unknown>):boolean{
  return "beatId" in source||("storyBeat" in source&&("cameraShot" in source||"action" in source||"characterStates" in source));
}

function timelineEvent(event:string){
  return {sourceText:"",event,timeOfDay:"unspecified",location:"",characterNames:[],propNames:[]};
}

function normalizeTimeline(value:unknown,source:Record<string,unknown>,visit:(input:unknown)=>unknown):unknown{
  if(looksLikeContinuityState(source))return structuredText(tryParseJsonValue(value),"");
  const parsed=tryParseJsonValue(value);
  if(parsed!==value)return normalizeTimeline(parsed,source,visit);
  if(value==null)return [];
  if(Array.isArray(value)){
    return value.map((item)=>{
      if(item&&typeof item==="object")return visit(item);
      const event=structuredText(item,"");
      return event?timelineEvent(event):null;
    }).filter((item):item is Exclude<typeof item,null>=>item!==null);
  }
  if(typeof value==="object"){
    const record=value as Record<string,unknown>;
    if("event" in record||"sourceText" in record||"location" in record)return [visit(record)];
    return Object.entries(record).map(([key,item])=>{
      if(item&&typeof item==="object"&&!Array.isArray(item)){
        const nested=item as Record<string,unknown>;
        return visit({event:nested.event??humanizeKey(key),...nested});
      }
      const text=structuredText(item,"");
      return text?timelineEvent(`${humanizeKey(key)}: ${text}`):null;
    }).filter((item):item is Exclude<typeof item,null>=>item!==null);
  }
  const events=splitLooseList(structuredText(value,""));
  return events.map(timelineEvent);
}

function minimalCharacter(name:string):Record<string,unknown>{return {name,face:{},hair:{},body:{}}}
function minimalLocation(name:string):Record<string,unknown>{return {name}}
function minimalProp(name:string,appearance=""):Record<string,unknown>{return {name,...(appearance?{appearance}:{})}}
function minimalInitialState(name:string):Record<string,unknown>{return {characterName:name}}
function minimalBeat(text:string):Record<string,unknown>{return {sourceText:text,storyBeat:text,type:"action",characterNames:[],locationName:"",action:text,reaction:"",dialogue:[],importantProps:[],stateAfter:""}}

function entityName(record:Record<string,unknown>,preferred:"name"|"characterName"):string{
  return structuredText(record[preferred]??record.name??record.characterName??record.characterId??record.id,"");
}

function normalizeNamedEntityArray(value:unknown,kind:"characters"|"locations"|"props"|"initialCharacterStates",visit:(input:unknown)=>unknown):unknown[]{
  const parsed=tryParseJsonValue(value);
  if(parsed!==value)return normalizeNamedEntityArray(parsed,kind,visit);
  const preferred=kind==="initialCharacterStates"?"characterName" as const:"name" as const;
  const minimal=(name:string,text="")=>kind==="characters"?minimalCharacter(name):kind==="locations"?minimalLocation(name):kind==="props"?minimalProp(name,text):minimalInitialState(name);
  const itemLike=(record:Record<string,unknown>)=>preferred in record||"name" in record||"characterName" in record||"role" in record||"architecture" in record||"appearance" in record||"currentOutfit" in record;
  if(value==null)return [];
  if(Array.isArray(value)){
    return value.flatMap((item)=>{
      if(item&&typeof item==="object"&&!Array.isArray(item)){
        const record=item as Record<string,unknown>;const name=entityName(record,preferred);
        return [visit({...minimal(name||"Unnamed"),...record})];
      }
      const text=structuredText(item,"");return text?[visit(minimal(text))]:[];
    });
  }
  if(typeof value==="object"){
    const record=value as Record<string,unknown>;
    if(itemLike(record)){
      const name=entityName(record,preferred)||"Unnamed";
      return [visit({...minimal(name),...record})];
    }
    return Object.entries(record).flatMap(([key,item])=>{
      if(item&&typeof item==="object"&&!Array.isArray(item)){
        const nested=item as Record<string,unknown>;const name=entityName(nested,preferred)||humanizeKey(key);
        return [visit({...minimal(name),...nested,[preferred]:name})];
      }
      const text=structuredText(item,"");const name=humanizeKey(key)||text;
      return name?[visit(minimal(name,text))]:[];
    });
  }
  const text=structuredText(value,"");return text?[visit(minimal(text))]:[];
}

function normalizeBeats(value:unknown,visit:(input:unknown)=>unknown):unknown[]{
  const parsed=tryParseJsonValue(value);
  if(parsed!==value)return normalizeBeats(parsed,visit);
  if(value==null)return [];
  if(Array.isArray(value))return value.flatMap((item)=>item&&typeof item==="object"?[visit(item)]:splitLooseList(structuredText(item,"")).map((text)=>visit(minimalBeat(text))));
  if(typeof value==="object"){
    const record=value as Record<string,unknown>;
    if("storyBeat" in record||"action" in record||"sourceText" in record)return [visit(record)];
    return Object.entries(record).flatMap(([key,item])=>item&&typeof item==="object"?[visit(item)]:[visit(minimalBeat(structuredText(item,humanizeKey(key))))]);
  }
  return splitLooseList(structuredText(value,"")).map((text)=>visit(minimalBeat(text)));
}

function normalizeObjectArray(value:unknown,markers:string[],visit:(input:unknown)=>unknown):unknown[]{
  const parsed=tryParseJsonValue(value);
  if(parsed!==value)return normalizeObjectArray(parsed,markers,visit);
  if(value==null)return [];
  if(Array.isArray(value))return value.filter((item)=>item&&typeof item==="object"&&!Array.isArray(item)).map((item)=>visit(item));
  if(typeof value!=="object")return [];
  const record=value as Record<string,unknown>;
  if(markers.some((key)=>key in record))return [visit(record)];
  return Object.values(record).filter((item)=>item&&typeof item==="object"&&!Array.isArray(item)).map((item)=>visit(item));
}

function normalizeCharacterRecord(value:unknown,visit:(input:unknown)=>unknown):Record<string,unknown>{
  const parsed=tryParseJsonValue(value);
  if(parsed!==value)return normalizeCharacterRecord(parsed,visit);
  const output:Record<string,unknown>={};
  if(value==null)return output;
  if(Array.isArray(value)){
    for(const item of value){
      if(!item||typeof item!=="object"||Array.isArray(item))continue;
      const record=item as Record<string,unknown>;const name=entityName(record,"characterName");
      if(name)output[name]=visit(record);
    }
    return output;
  }
  if(typeof value!=="object")return output;
  const record=value as Record<string,unknown>;
  const selfName=entityName(record,"characterName");
  if(selfName&&("pose" in record||"currentLocation" in record||"currentOutfit" in record))return {[selfName]:visit(record)};
  for(const [key,item] of Object.entries(record))if(item&&typeof item==="object"&&!Array.isArray(item))output[key]=visit(item);
  return output;
}

function normalizeContinuityState(value:unknown,visit:(input:unknown)=>unknown):Record<string,unknown>{
  const parsed=tryParseJsonValue(value);
  if(parsed!==value)return normalizeContinuityState(parsed,visit);
  if(value&&typeof value==="object"&&!Array.isArray(value))return visit(value) as Record<string,unknown>;
  const text=structuredText(value,"");
  return {timeline:text,timeOfDay:"unspecified",currentLocation:"",characters:{},activeProps:[],previousPageEndState:text};
}

function positiveInteger(value:unknown):number{
  const parsed=Number(value);return Number.isFinite(parsed)&&parsed>0?Math.trunc(parsed):0;
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
      if(key==="timeline"){
        output[key]=normalizeTimeline(item,source,visit);
        continue;
      }
      if(key==="locations"){
        output[key]=normalizeNamedEntityArray(item,"locations",visit);
        continue;
      }
      if(key==="props"){
        output[key]=normalizeNamedEntityArray(item,"props",visit);
        continue;
      }
      if(key==="initialCharacterStates"){
        output[key]=normalizeNamedEntityArray(item,"initialCharacterStates",visit);
        continue;
      }
      if(key==="beats"){
        output[key]=normalizeBeats(item,visit);
        continue;
      }
      if(key==="pages"){
        output[key]=normalizeObjectArray(item,["pagePurpose","panels","startState"],visit);
        continue;
      }
      if(key==="panels"){
        output[key]=normalizeObjectArray(item,["beatId","storyBeat","action","cameraShot"],visit);
        continue;
      }
      if(key==="characterStates"){
        output[key]=normalizeCharacterRecord(item,visit);
        continue;
      }
      if(key==="endState"){
        output[key]="panels" in source?structuredText(item,""):"pages" in source?normalizeContinuityState(item,visit):visit(item);
        continue;
      }
      if(key==="characters"){
        if(looksLikeMasterRoot(source))output[key]=normalizeNamedEntityArray(item,"characters",visit);
        else if(looksLikeContinuityState(source))output[key]=normalizeCharacterRecord(item,visit);
        else if(looksLikePanel(source))output[key]=normalizeStringArray(item);
        else output[key]=item&&typeof item==="object"&&!Array.isArray(item)?visit(item):normalizeStringArray(item);
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
        output[key]=positiveInteger(item);
        continue;
      }
      if(TEXT_FIELDS.has(key)){
        output[key]=structuredText(item,"");
        continue;
      }
      output[key]=visit(item);
    }

    if(Array.isArray(output.pages)){
      if(!positiveInteger(output.consumedBeatCount)){
        const count=output.pages.reduce((total,page)=>{
          if(!page||typeof page!=="object")return total;
          const panels=(page as Record<string,unknown>).panels;
          return total+(Array.isArray(panels)?panels.length:0);
        },0);
        if(count>0)output.consumedBeatCount=count;
      }
      if(!output.endState){
        const last=output.pages.at(-1) as Record<string,unknown>|undefined;
        output.endState=normalizeContinuityState(last?.endState??"",visit);
      }
    }
    return output;
  };
  return visit(value) as T;
}
