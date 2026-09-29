"use client";

import {useState} from "react";
import {BookOpen,ListChecks} from "lucide-react";
import {MangaPageProductionStudio} from "./manga-page-production-studio";
import {StoryGeneratorWorkspace} from "./story-generator-workspace";

type WorkspaceSection="studio"|"chapters";

export function StoryFrameWorkspace(){
  const [section,setSection]=useState<WorkspaceSection>("studio");
  return <>
    <div className="border-b border-slate-200 bg-white px-4 py-3 text-slate-900">
      <div className="mx-auto flex max-w-7xl gap-2">
        <button onClick={()=>setSection("studio")} className={"flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition "+(section==="studio"?"bg-violet-500 text-white":"border border-slate-200 bg-white text-slate-600")}><BookOpen size={16}/> Manga Studio</button>
        <button onClick={()=>setSection("chapters")} className={"flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition "+(section==="chapters"?"bg-violet-500 text-white":"border border-slate-200 bg-white text-slate-600")}><ListChecks size={16}/> Chapters</button>
      </div>
    </div>
    <div className={section==="studio"?"block":"hidden"}><MangaPageProductionStudio/></div>
    <div className={section==="chapters"?"mx-auto max-w-7xl p-4 md:p-6":"hidden"}><StoryGeneratorWorkspace view="chapters" onOpenMangaStory={()=>setSection("studio")}/></div>
  </>;
}
