import {isStoryAnalysisModel} from "../story-analysis-models";
import type {MangaStudioState} from "./project-types";
import {migrateProject} from "./project-defaults";

const DB_NAME="storyframe-manga-continuity";
const STORE="studio";
const STATE_KEY="state-v1";
const ANALYSIS_MODEL_KEY="storyframe-analysis-model";
const MAX_SAFE_DATA_URL_CHARS=420_000;

function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}

function browserAnalysisModel(){
  if(typeof localStorage==="undefined")return undefined;
  try{
    const value=localStorage.getItem(ANALYSIS_MODEL_KEY);
    return isStoryAnalysisModel(value)?value:undefined;
  }catch{
    return undefined;
  }
}

function applyBrowserModel(state:MangaStudioState):MangaStudioState{
  const model=browserAnalysisModel();
  if(!model)return state;
  return {...state,projects:state.projects.map((project)=>project.id===state.activeProjectId?{...project,analysisModel:model}:project)};
}

function oversizedDataUrl(value:unknown){return typeof value==="string"&&value.startsWith("data:image/")&&value.length>MAX_SAFE_DATA_URL_CHARS}

function pruneOversizedRequestMedia<T>(value:T):T{
  const visit=(input:unknown,key?:string):unknown=>{
    // Keep imageDataUrl/generatedImage fields so old artwork remains visible/downloadable.
    // Remove only request-facing copies that would otherwise be re-posted to Vercel.
    if((key==="manualReferenceImage"||key==="generatedImageUrl"||key==="sourceUrl")&&oversizedDataUrl(input))return undefined;
    if(key==="referenceImages"&&Array.isArray(input)){
      return input.filter((item)=>{
        if(!item||typeof item!=="object")return true;
        return !oversizedDataUrl((item as {url?:unknown}).url);
      }).map((item)=>visit(item));
    }
    if(Array.isArray(input))return input.map((item)=>visit(item)).filter((item)=>item!==undefined);
    if(input&&typeof input==="object"){
      const next:Record<string,unknown>={};
      for(const [childKey,childValue] of Object.entries(input as Record<string,unknown>)){
        const mapped=visit(childValue,childKey);if(mapped!==undefined)next[childKey]=mapped;
      }
      return next;
    }
    return input;
  };
  return visit(value) as T;
}

export async function loadStudioState():Promise<MangaStudioState|null>{
  if(typeof indexedDB==="undefined")return null;
  const db=await openDb();
  const state=await new Promise<MangaStudioState|null>((resolve,reject)=>{const tx=db.transaction(STORE,"readonly");const req=tx.objectStore(STORE).get(STATE_KEY);req.onsuccess=()=>resolve((req.result as MangaStudioState|undefined)||null);req.onerror=()=>reject(req.error)});
  if(!state?.projects?.length)return state;
  const projects=state.projects.map((project)=>pruneOversizedRequestMedia(migrateProject(project)));
  return applyBrowserModel({activeProjectId:projects.some((p)=>p.id===state.activeProjectId)?state.activeProjectId:projects[0].id,projects});
}

export async function saveStudioState(state:MangaStudioState):Promise<void>{
  if(typeof indexedDB==="undefined")return;
  const db=await openDb();
  const normalized=pruneOversizedRequestMedia(applyBrowserModel(state));
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(normalized,STATE_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
}
