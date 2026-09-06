export type CharacterReference={
  id:string;
  name:string;
  visualDescription:string;
  outfit:string;
  eyeColor:string;
  hairColor:string;
  keyFeatures:string[];
  referencePrompt:string;
  seedBase:number;
  manualReferenceImage?:string;
  createdInChapterId:string;
  updatedAt:string;
};

export type LocationReference={
  id:string;
  name:string;
  architectureStyle:string;
  lighting:string;
  colorPalette:string;
  referencePrompt:string;
  createdInChapterId:string;
  updatedAt:string;
};

export type MangaScene={
  id:string;
  sceneNumber:number;
  title:string;
  sourceText:string;
  description:string;
  characterNames:string[];
  locationNames:string[];
  cameraShot:string;
  baseImagePrompt:string;
  imagePrompt:string;
  narrationScript:string;
  seed:number;
  imageDataUrl?:string;
  imageModel?:string;
  status:"idle"|"generating"|"complete"|"error";
  error?:string;
};

export type MangaChapter={
  id:string;
  title:string;
  story:string;
  summary:string;
  scenes:MangaScene[];
  analysisProvider?:string;
  createdAt:string;
  updatedAt:string;
};

export type MangaProject={
  id:string;
  name:string;
  activeChapterId:string;
  chapters:MangaChapter[];
  characters:CharacterReference[];
  locations:LocationReference[];
  createdAt:string;
  updatedAt:string;
};

export type MangaStudioState={
  activeProjectId:string;
  projects:MangaProject[];
};

export type AnalyzeChapterResponse={
  summary:string;
  provider:string;
  characters:Array<Omit<CharacterReference,"id"|"seedBase"|"createdInChapterId"|"updatedAt"|"manualReferenceImage">>;
  locations:Array<Omit<LocationReference,"id"|"createdInChapterId"|"updatedAt">>;
  scenes:Array<{
    title:string;
    sourceText:string;
    description:string;
    characterNames:string[];
    locationNames:string[];
    cameraShot:string;
    imagePrompt:string;
    narrationScript:string;
  }>;
};

const DB_NAME="storyframe-manga-continuity";
const STORE="studio";
const STATE_KEY="state-v1";

export function id(prefix:string){
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
}

export function normalizeName(value:string){
  return value.trim().toLocaleLowerCase().replace(/\s+/g," ");
}

export function hashString(value:string){
  let hash=2166136261;
  for(let i=0;i<value.length;i++){
    hash^=value.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return Math.abs(hash>>>0)%9_000_000+100_000;
}

export function createChapter(title="Chapter 1"):MangaChapter{
  const now=new Date().toISOString();
  return {id:id("chapter"),title,story:"",summary:"",scenes:[],createdAt:now,updatedAt:now};
}

export function createProject(name="My Manga Project"):MangaProject{
  const now=new Date().toISOString();
  const chapter=createChapter();
  return {id:id("project"),name,activeChapterId:chapter.id,chapters:[chapter],characters:[],locations:[],createdAt:now,updatedAt:now};
}

export function createInitialState():MangaStudioState{
  const project=createProject("My Manga Project");
  return {activeProjectId:project.id,projects:[project]};
}

function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

export async function loadStudioState():Promise<MangaStudioState|null>{
  if(typeof indexedDB==="undefined") return null;
  const db=await openDb();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).get(STATE_KEY);
    req.onsuccess=()=>resolve((req.result as MangaStudioState|undefined)||null);
    req.onerror=()=>reject(req.error);
  });
}

export async function saveStudioState(state:MangaStudioState):Promise<void>{
  if(typeof indexedDB==="undefined") return;
  const db=await openDb();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(state,STATE_KEY);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}

export function mergeCharacterReferences(existing:CharacterReference[],incoming:AnalyzeChapterResponse["characters"],chapterId:string){
  const next=[...existing];
  const byName=new Map(next.map((item)=>[normalizeName(item.name),item]));
  for(const candidate of incoming){
    const key=normalizeName(candidate.name);
    if(byName.has(key)) continue;
    const now=new Date().toISOString();
    const reference:CharacterReference={
      ...candidate,
      id:id("character"),
      seedBase:hashString(`${candidate.name}|${candidate.referencePrompt}`),
      createdInChapterId:chapterId,
      updatedAt:now
    };
    next.push(reference);
    byName.set(key,reference);
  }
  return next;
}

export function mergeLocationReferences(existing:LocationReference[],incoming:AnalyzeChapterResponse["locations"],chapterId:string){
  const next=[...existing];
  const byName=new Map(next.map((item)=>[normalizeName(item.name),item]));
  for(const candidate of incoming){
    const key=normalizeName(candidate.name);
    if(byName.has(key)) continue;
    const now=new Date().toISOString();
    const reference:LocationReference={...candidate,id:id("location"),createdInChapterId:chapterId,updatedAt:now};
    next.push(reference);
    byName.set(key,reference);
  }
  return next;
}

export function buildCanonicalScenePrompt(input:{
  scene:AnalyzeChapterResponse["scenes"][number];
  sceneNumber:number;
  projectId:string;
  chapterId:string;
  characters:CharacterReference[];
  locations:LocationReference[];
}){
  const {scene,sceneNumber,projectId,chapterId,characters,locations}=input;
  const charRefs=scene.characterNames.map((name)=>characters.find((item)=>normalizeName(item.name)===normalizeName(name))).filter(Boolean) as CharacterReference[];
  const locRefs=scene.locationNames.map((name)=>locations.find((item)=>normalizeName(item.name)===normalizeName(name))).filter(Boolean) as LocationReference[];
  const characterBlock=charRefs.length?`\n\nIDENTITY LOCK — these are the exact recurring characters. Do not redesign them:\n${charRefs.map((item)=>`${item.name}: ${item.referencePrompt}`).join("\n")}`:"";
  const locationBlock=locRefs.length?`\n\nLOCATION LOCK — preserve these exact environment traits:\n${locRefs.map((item)=>`${item.name}: ${item.referencePrompt}`).join("\n")}`:"";
  const identitySeed=charRefs[0]?.seedBase??hashString(`${projectId}|${chapterId}|${locRefs[0]?.name||sceneNumber}`);
  return {
    prompt:`${scene.imagePrompt}${characterBlock}${locationBlock}\n\nSTRICT CONTINUITY: the same named character must keep the exact same face shape, eye color, hairstyle, hair length, age impression, skin tone, body proportions and outfit across every scene. Never substitute a different-looking person. Preserve recurring architecture, doors, windows, palette and props. Change only pose, expression, camera, lighting and story action. cinematic composition, realistic anatomy, detailed hands, no text, no logo, no watermark.`,
    seed:identitySeed
  };
}
