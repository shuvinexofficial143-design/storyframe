"use client";
import React,{createContext,useContext,useEffect,useMemo,useState} from "react";
import {defaultProject} from "@/lib/default-project";
import type {Character,Location,ProjectState,Scene} from "@/lib/types";

const KEY="storyframe-ai-project-v2";

type AnalysisPayload={
  summary:string;
  characters:Character[];
  locations:Location[];
  scenes:Scene[];
  analysisProvider?:string;
  imageProvider?:string;
};

type Ctx={
  project:ProjectState;
  updateProject:(p:Partial<ProjectState>)=>void;
  replaceAnalysis:(d:AnalysisPayload)=>void;
  updateCharacter:(id:string,p:Partial<Character>)=>void;
  updateLocation:(id:string,p:Partial<Location>)=>void;
  updateScene:(id:string,p:Partial<Scene>)=>void;
  resetProject:()=>void;
};

const Context=createContext<Ctx|null>(null);

export function ProjectProvider({children}:{children:React.ReactNode}){
  const[project,setProject]=useState<ProjectState>(defaultProject);
  const[ready,setReady]=useState(false);

  useEffect(()=>{
    try{
      const stored=localStorage.getItem(KEY);
      if(stored) setProject(JSON.parse(stored));
    }catch{}
    setReady(true);
  },[]);

  useEffect(()=>{
    if(ready) localStorage.setItem(KEY,JSON.stringify(project));
  },[project,ready]);

  const value=useMemo<Ctx>(()=>({
    project,
    updateProject:(p)=>setProject((current)=>({...current,...p})),
    replaceAnalysis:(data)=>setProject((current)=>({...current,...data})),
    updateCharacter:(id,p)=>setProject((current)=>({...current,characters:current.characters.map((value)=>value.id===id?{...value,...p}:value)})),
    updateLocation:(id,p)=>setProject((current)=>({...current,locations:current.locations.map((value)=>value.id===id?{...value,...p}:value)})),
    updateScene:(id,p)=>setProject((current)=>({...current,scenes:current.scenes.map((value)=>value.id===id?{...value,...p}:value)})),
    resetProject:()=>setProject({...defaultProject,id:`project-${Date.now()}`})
  }),[project]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProject(){
  const value=useContext(Context);
  if(!value) throw new Error("ProjectProvider missing");
  return value;
}
