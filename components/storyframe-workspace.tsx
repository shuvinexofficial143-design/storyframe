"use client";

import {BookOpen} from "lucide-react";
import {DurableMangaBuildShell} from "./durable-manga-build-shell";
import {MangaPageProductionStudio} from "./manga-page-production-studio";

export function StoryFrameWorkspace(){
  return <DurableMangaBuildShell>
    <div className="border-b border-slate-200 bg-white px-4 py-3 text-slate-900">
      <div className="mx-auto flex max-w-7xl">
        <div className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"><BookOpen size={16}/> Manga Studio</div>
      </div>
    </div>
    <MangaPageProductionStudio/>
  </DurableMangaBuildShell>;
}
