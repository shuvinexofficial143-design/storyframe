"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {BookOpen,Boxes,Clapperboard,Film,GalleryHorizontalEnd,Home,MapPinned,Settings,Sparkles,Users} from "lucide-react";
import {useProject} from "./project-provider";

const nav=[["/","Dashboard",Home],["/projects","Projects",Boxes],["/story","Story",BookOpen],["/characters","Characters",Users],["/locations","Locations",MapPinned],["/scenes","Scenes",Clapperboard],["/storyboard","Storyboard",GalleryHorizontalEnd],["/timeline","Timeline",Film],["/settings","Settings",Settings]] as const;

export function AppShell({children}:{children:React.ReactNode}){
  const path=usePathname();
  const {project}=useProject();
  return <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
    <aside className="border-b border-white/8 bg-black/20 p-4 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
      <div className="mb-6 flex items-center gap-3 px-2 py-2"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500 shadow-lg shadow-violet-500/20"><Sparkles size={20}/></div><div><div className="font-black">StoryFrame AI</div><div className="text-xs text-zinc-500">Cinematic story pipeline</div></div></div>
      <nav className="grid grid-cols-3 gap-2 lg:grid-cols-1">{nav.map(([href,label,Icon])=><Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${path===href?"bg-white/10 text-white":"text-zinc-400 hover:bg-white/5 hover:text-white"}`}><Icon size={17}/><span className="hidden sm:inline">{label}</span></Link>)}</nav>
      <div className="mt-6 hidden rounded-2xl border border-white/8 bg-white/[.03] p-4 lg:block"><div className="text-xs uppercase tracking-wider text-zinc-500">Active project</div><div className="mt-2 truncate text-sm font-semibold">{project.name}</div><div className="mt-1 text-xs text-zinc-500">{project.scenes.length} scenes · {project.characters.length} characters</div><div className="mt-3 text-xs text-zinc-500">Analysis: {project.analysisProvider||"mock"} · Images: {project.imageProvider||"mock"}</div></div>
    </aside>
    <main className="min-w-0"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/8 bg-[#08090c]/80 px-4 backdrop-blur-xl md:px-7"><div><div className="text-sm font-semibold">{project.storyTitle||project.name}</div><div className="text-xs text-zinc-500">{project.chapter} · {project.aspectRatio}</div></div><div className="flex items-center gap-2 text-xs text-zinc-500"><span className="h-2 w-2 rounded-full bg-emerald-400"/> Pollinations-ready</div></header><div className="gridbg min-h-[calc(100vh-4rem)] p-4 md:p-7">{children}</div></main>
  </div>;
}
