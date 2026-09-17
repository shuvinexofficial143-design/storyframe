"use client";

import {useEffect,useState} from "react";
import {BrainCircuit} from "lucide-react";
import {loadStudioState,saveStudioState} from "@/lib/continuity/storage";
import {
  DEFAULT_STORY_ANALYSIS_MODEL,
  STORY_ANALYSIS_MODEL_OPTIONS,
  isStoryAnalysisModel,
  type StoryAnalysisModel
} from "@/lib/story-analysis-models";

const STORAGE_KEY="storyframe-analysis-model";
const COOKIE_NAME="storyframe-analysis-model";

function persistBrowserSelection(model:StoryAnalysisModel){
  try{localStorage.setItem(STORAGE_KEY,model)}catch{}
  document.cookie=`${COOKIE_NAME}=${encodeURIComponent(model)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function AnalysisModelSelector(){
  const [model,setModel]=useState<StoryAnalysisModel>(DEFAULT_STORY_ANALYSIS_MODEL);

  useEffect(()=>{
    let cancelled=false;
    void (async()=>{
      const saved=await loadStudioState().catch(()=>null);
      const active=saved?.projects.find((project)=>project.id===saved.activeProjectId);
      let next:StoryAnalysisModel=active?.analysisModel||DEFAULT_STORY_ANALYSIS_MODEL;
      try{
        const local=localStorage.getItem(STORAGE_KEY);
        if(isStoryAnalysisModel(local))next=local;
      }catch{}
      if(cancelled)return;
      setModel(next);
      persistBrowserSelection(next);
    })();
    return()=>{cancelled=true};
  },[]);

  const changeModel=async(value:string)=>{
    if(!isStoryAnalysisModel(value))return;
    setModel(value);
    persistBrowserSelection(value);

    const saved=await loadStudioState().catch(()=>null);
    if(!saved?.projects.length)return;
    const projects=saved.projects.map((project)=>project.id===saved.activeProjectId?{...project,analysisModel:value,updatedAt:new Date().toISOString()}:project);
    await saveStudioState({...saved,projects}).catch(console.error);
  };

  const selected=STORY_ANALYSIS_MODEL_OPTIONS.find((item)=>item.value===model)||STORY_ANALYSIS_MODEL_OPTIONS[0];

  return <div className="border-b border-slate-200 bg-white px-4 py-3 text-slate-900">
    <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-700"><BrainCircuit size={17}/></div>
        <div><div className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">AI Story Model</div><div className="text-xs text-slate-500">{selected.description}</div></div>
      </div>
      <select aria-label="AI Story Model" value={model} onChange={(event)=>void changeModel(event.target.value)} className="min-w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none shadow-sm focus:border-violet-500/60">
        {STORY_ANALYSIS_MODEL_OPTIONS.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  </div>;
}
