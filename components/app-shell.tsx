"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {BookOpen,Boxes,Clapperboard,Film,GalleryHorizontalEnd,Home,Loader2,MapPinned,Settings,Sparkles,Users} from "lucide-react";
import {useProject} from "./project-provider";
import {AnalysisModelSelector} from "./analysis-model-selector";
import {StoryFrameWorkspace} from "./storyframe-workspace";

const nav=[["/","Continuity Studio",Home],["/projects","Legacy Projects",Boxes],["/story","Legacy Story",BookOpen],["/characters","Legacy Characters",Users],["/locations","Legacy Locations",MapPinned],["/scenes","Legacy Scenes",Clapperboard],["/storyboard","Legacy Storyboard",GalleryHorizontalEnd],["/timeline","Legacy Timeline",Film],["/settings","Settings",Settings]] as const;

export function AppShell({children}:{children:React.ReactNode}){
  const path=usePathname();
  const {project}=useProject();
  const [mangaJob,setMangaJob]=useState({busy:false,progress:""});
  const [generatorJob,setGeneratorJob]=useState({busy:false,progress:""});

  useEffect(()=>{
    const handler=(event:Event)=>{
      const detail=(event as CustomEvent<{busy?:boolean;progress?:string}>).detail||{};
      setMangaJob({busy:Boolean(detail.busy),progress:typeof detail.progress==="string"?detail.progress:""});
    };
    window.addEventListener("storyframe:manga-job-status",handler);
    return()=>window.removeEventListener("storyframe:manga-job-status",handler);
  },[]);

  useEffect(()=>{
    const handler=(event:Event)=>{
      const detail=(event as CustomEvent<{busy?:boolean;progress?:string}>).detail||{};
      setGeneratorJob({busy:Boolean(detail.busy),progress:typeof detail.progress==="string"?detail.progress:""});
    };
    window.addEventListener("storyframe:story-generator-job-status",handler);
    return()=>window.removeEventListener("storyframe:story-generator-job-status",handler);
  },[]);

  const cancelActiveWork=()=>{
    window.dispatchEvent(new CustomEvent("storyframe:cancel-manga-job"));
    window.dispatchEvent(new CustomEvent("storyframe:cancel-story-generator-job"));
  };
  const activeBusy=mangaJob.busy||generatorJob.busy;
  const activeProgress=mangaJob.busy?(mangaJob.progress||"Manga job is still running…"):(generatorJob.progress||"Story Generator is still running…");

  return <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
    <aside className="border-b border-white/8 bg-black/20 p-4 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
      <div className="mb-6 flex items-center gap-3 px-2 py-2"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500 shadow-lg shadow-violet-500/20"><Sparkles size={20}/></div><div><div className="font-black">StoryFrame AI</div><div className="text-xs text-zinc-500">Cinematic story pipeline</div></div></div>
      <nav className="grid grid-cols-3 gap-2 lg:grid-cols-1">{nav.map(([href,label,Icon])=><Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${path===href?"bg-white/10 text-white":"text-zinc-400 hover:bg-white/5 hover:text-white"}`}><Icon size={17}/><span className="hidden sm:inline">{label}</span></Link>)}</nav>
      <div className="mt-6 hidden rounded-2xl border border-white/8 bg-white/[.03] p-4 lg:block"><div className="text-xs uppercase tracking-wider text-zinc-500">Legacy active project</div><div className="mt-2 truncate text-sm font-semibold">{project.name}</div><div className="mt-1 text-xs text-zinc-500">{project.scenes.length} scenes · {project.characters.length} characters</div></div>
    </aside>
    <main className="min-w-0"><header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-white/8 bg-white/90 px-4 py-3 text-slate-900 backdrop-blur-xl md:px-7"><div className="min-w-0"><div className="text-sm font-semibold">{path==="/"?"Manga Studio":project.storyTitle||project.name}</div><div className="truncate text-xs text-slate-500">{activeBusy?activeProgress:(path==="/"?"All workspace navigation stays available here.":`${project.chapter} · ${project.aspectRatio}`)}</div></div><div className="flex shrink-0 items-center gap-2">{activeBusy&&<Link href="/" className="inline-flex items-center gap-1.5 rounded-lg bg-violet-100 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700"><Loader2 className="animate-spin" size={13}/> Running</Link>}{activeBusy&&<button onClick={cancelActiveWork} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">Cancel</button>}{path!=="/"&&<Link href="/" className="text-xs font-semibold text-violet-600">Open Manga Studio</Link>}</div></header><div className="gridbg min-h-[calc(100vh-4rem)] p-4 md:p-7"><div className={path==="/"?"block":"hidden"}><AnalysisModelSelector/><StoryFrameWorkspace/></div>{path!=="/"&&children}</div></main>
  </div>;
}
