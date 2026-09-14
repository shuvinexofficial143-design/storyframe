"use client";

import {useEffect,useState} from "react";
import {BookOpen,Clapperboard} from "lucide-react";
import {CinematicContinuityStudio} from "./cinematic-continuity-studio";
import {MangaProductionStudio} from "./manga-production-studio";

const STORAGE_KEY="storyframe-workspace-mode";
type Mode="manga"|"cinematic";

export function StoryFrameWorkspace(){
  const [mode,setMode]=useState<Mode>("manga");
  useEffect(()=>{try{const saved=localStorage.getItem(STORAGE_KEY);if(saved==="manga"||saved==="cinematic")setMode(saved)}catch{}},[]);
  const change=(next:Mode)=>{setMode(next);try{localStorage.setItem(STORAGE_KEY,next)}catch{}};
  return <>
    <div className="border-b border-white/10 bg-[#0b0d13] px-4 py-3 text-zinc-100">
      <div className="mx-auto flex max-w-7xl gap-2">
        <button onClick={()=>change("manga")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${mode==="manga"?"bg-violet-500 text-white":"border border-white/10 bg-white/5 text-zinc-400"}`}><BookOpen size={16}/> Manga Studio</button>
        <button onClick={()=>change("cinematic")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${mode==="cinematic"?"bg-violet-500 text-white":"border border-white/10 bg-white/5 text-zinc-400"}`}><Clapperboard size={16}/> Cinematic Legacy</button>
      </div>
    </div>
    {mode==="manga"?<MangaProductionStudio/>:<CinematicContinuityStudio/>}
  </>;
}
