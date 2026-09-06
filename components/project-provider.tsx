"use client";
import React,{createContext,useContext,useEffect,useMemo,useState} from "react";
import {defaultProject} from "@/lib/default-project";
import type {Character,Location,ProjectState,Scene} from "@/lib/types";

const KEY="storyframe-ai-project-v3";
const LEGACY_KEYS=["storyframe-ai-project-v2","storyframe-ai-project-v1"];

type AnalysisPayload={summary:string;characters:Character[];locations:Location[];scenes:Scene[];analysisProvider?:string;imageProvider?:string};
type Ctx={project:ProjectState;updateProject:(patch:Partial<ProjectState>)=>void;replaceAnalysis:(data:AnalysisPayload)=>void;updateCharacter:(id:string,patch:Partial<Character>)=>void;updateLocation:(id:string,patch:Partial<Location>)=>void;updateScene:(id:string,patch:Partial<Scene>)=>void;resetProject:()=>void};
const Context=createContext<Ctx|null>(null);

function hydrateProject(parsed:ProjectState):ProjectState{
  return {...parsed,characters:(parsed.characters||[]).map((character)=>({...character,referenceImage:character.referenceImage||character.referenceImageSourceUrl})),scenes:(parsed.scenes||[]).map((scene)=>({...scene,generatedImage:scene.generatedImage||scene.generatedImageSourceUrl}))};
}

function loadInitialProject():ProjectState{
  if(typeof window==="undefined") return defaultProject;
  try{
    const current=window.localStorage.getItem(KEY);
    if(current) return hydrateProject(JSON.parse(current) as ProjectState);
    for(const legacyKey of LEGACY_KEYS){
      const stored=window.localStorage.getItem(legacyKey);
      if(stored) return hydrateProject(JSON.parse(stored) as ProjectState);
    }
    return defaultProject;
  }catch{
    return defaultProject;
  }
}

function compactForStorage(project:ProjectState):ProjectState{
  return {...project,characters:project.characters.map((character)=>({...character,referenceImage:character.referenceImage?.startsWith("data:")?character.referenceImageSourceUrl:character.referenceImage})),scenes:project.scenes.map((scene)=>({...scene,generatedImage:scene.generatedImage?.startsWith("data:")?scene.generatedImageSourceUrl:scene.generatedImage}))};
}

export function ProjectProvider({children}:{children:React.ReactNode}){
  const [project,setProject]=useState<ProjectState>(loadInitialProject);

  useEffect(()=>{
    try{
      window.localStorage.setItem(KEY,JSON.stringify(compactForStorage(project)));
    }catch(error){
      console.warn("StoryFrame autosave skipped",error);
    }
  },[project]);

  const value=useMemo<Ctx>(()=>({
    project,
    updateProject:(patch)=>setProject((current)=>({...current,...patch})),
    replaceAnalysis:(data)=>setProject((current)=>({...current,...data})),
    updateCharacter:(id,patch)=>setProject((current)=>({...current,characters:current.characters.map((value)=>value.id===id?{...value,...patch}:value)})),
    updateLocation:(id,patch)=>setProject((current)=>({...current,locations:current.locations.map((value)=>value.id===id?{...value,...patch}:value)})),
    updateScene:(id,patch)=>setProject((current)=>({...current,scenes:current.scenes.map((value)=>value.id===id?{...value,...patch}:value)})),
    resetProject:()=>setProject({...defaultProject,id:`project-${Date.now()}`})
  }),[project]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProject(){
  const value=useContext(Context);
  if(!value) throw new Error("ProjectProvider missing");
  return value;
}
