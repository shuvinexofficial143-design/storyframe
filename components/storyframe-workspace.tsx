"use client";

import {BookOpen} from "lucide-react";
import {MangaPageProductionStudio} from "./manga-page-production-studio";

export function StoryFrameWorkspace(){
  return <>
    <div className="border-b border-white/10 bg-[#0b0d13] px-4 py-3 text-zinc-100">
      <div className="mx-auto flex max-w-7xl">
        <div className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white"><BookOpen size={16}/> Manga Studio</div>
      </div>
    </div>
    <MangaPageProductionStudio/>
  </>;
}
