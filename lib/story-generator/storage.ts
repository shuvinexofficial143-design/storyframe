import type {StoryGeneratorState} from "./types";

const DB_NAME="storyframe-story-generator";
const STORE="generator";
const KEY="state-v1";

function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

export async function loadStoryGeneratorState():Promise<StoryGeneratorState|null>{
  if(typeof indexedDB==="undefined")return null;
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).get(KEY);
    req.onsuccess=()=>resolve((req.result as StoryGeneratorState|undefined)||null);
    req.onerror=()=>reject(req.error);
  });
}

export async function saveStoryGeneratorState(state:StoryGeneratorState):Promise<void>{
  if(typeof indexedDB==="undefined")return;
  const db=await openDb();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(state,KEY);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
