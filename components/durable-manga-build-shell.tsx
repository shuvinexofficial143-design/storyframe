"use client";

import {useCallback,useEffect,useRef,useState,type ReactNode,type MouseEvent} from "react";
import {CheckCircle2,CloudCog,Loader2} from "lucide-react";
import {loadStudioState,saveStudioState} from "@/lib/continuity/storage";
import {mergeMangaMasterIntoProject} from "@/lib/manga-production/project-bridge";
import {continuationContextText,getInheritedMangaStyle,getPreviousChapterContinuity} from "@/lib/manga-production/chapter-continuity";
import {MANGA_PACING_PRESETS,type MangaPacingPreset} from "@/lib/manga-production/pacing-policy";
import {MANGA_STYLE_PRESETS,type MangaChapterProduction,type MangaMasterAnalysis,type MangaStylePreset} from "@/lib/manga-production/types";

const RUN_PREFIX="storyframe-manga-background-run:";
const wait=(ms:number)=>new Promise<void>((resolve)=>setTimeout(resolve,ms));

type PendingRun={runId:string;projectId:string;chapterId:string;chapterTitle:string;startedAt:string};
type StartResponse={runId?:string;status?:string;error?:string};
type BackgroundResult={ok?:boolean;master?:MangaMasterAnalysis;production?:MangaChapterProduction;stage?:string;error?:string};
type StatusResponse={status?:string;result?:BackgroundResult;error?:string};

function runKey(projectId:string,chapterId:string){return `${RUN_PREFIX}${projectId}:${chapterId}`}

function readPendingRuns(){
  const runs:PendingRun[]=[];
  try{
    for(let index=0;index<localStorage.length;index+=1){
      const key=localStorage.key(index);
      if(!key?.startsWith(RUN_PREFIX))continue;
      const raw=localStorage.getItem(key);
      if(!raw)continue;
      try{
        const parsed=JSON.parse(raw) as PendingRun;
        if(parsed.runId&&parsed.projectId&&parsed.chapterId)runs.push(parsed);
      }catch{}
    }
  }catch{}
  return runs;
}

function compactExistingCharacter(character:Record<string,unknown>){
  const rest={...character};
  delete rest.manualReferenceImage;
  delete rest.referenceImages;
  delete rest.states;
  return rest;
}

function compactExistingLocation(location:Record<string,unknown>){
  const rest={...location};
  delete rest.referenceImages;
  return rest;
}

function compactExistingObject(item:Record<string,unknown>){
  const rest={...item};
  delete rest.referenceImages;
  return rest;
}

function selectedPacingFromPage():MangaPacingPreset{
  if(typeof document==="undefined")return "Balanced";
  const select=[...document.querySelectorAll("select")].find((item)=>item.selectedOptions[0]?.textContent?.startsWith("Beat Detail:"));
  const value=select?.value;
  return MANGA_PACING_PRESETS.includes(value as MangaPacingPreset)?value as MangaPacingPreset:"Balanced";
}

function selectedStyleForChapter(chapterId:string,productionStyle?:MangaStylePreset,inherited?:MangaStylePreset):MangaStylePreset{
  if(productionStyle)return productionStyle;
  try{
    const saved=localStorage.getItem(`manga-style-${chapterId}`);
    if(MANGA_STYLE_PRESETS.includes(saved as MangaStylePreset))return saved as MangaStylePreset;
  }catch{}
  return inherited||"Classic Black & White Manga";
}

export function DurableMangaBuildShell({children}:{children:ReactNode}){
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [runningCount,setRunningCount]=useState(0);
  const applyingRef=useRef(new Set<string>());
  const startingRef=useRef(false);

  const applyCompletedRun=useCallback(async(record:PendingRun,result:{master:MangaMasterAnalysis;production:MangaChapterProduction})=>{
    if(applyingRef.current.has(record.runId))return;
    applyingRef.current.add(record.runId);
    try{
      const saved=await loadStudioState();
      if(!saved?.projects.length)throw new Error("Saved Manga Studio project was not found for the completed background build.");
      const project=saved.projects.find((item)=>item.id===record.projectId);
      if(!project)throw new Error("The project for this background build no longer exists.");
      const chapter=project.chapters.find((item)=>item.id===record.chapterId);
      if(!chapter)throw new Error("The chapter for this background build no longer exists.");

      const merged=mergeMangaMasterIntoProject(project,chapter.id,result.master,result.production.stylePreset);
      const updatedAt=new Date().toISOString();
      const nextProject={
        ...project,
        characters:merged.characters,
        locations:merged.locations,
        props:merged.props,
        updatedAt,
        chapters:project.chapters.map((item)=>item.id===chapter.id?{
          ...item,
          summary:result.master.storySummary,
          analysisProvider:result.master.provider,
          manga:{...result.production,updatedAt},
          updatedAt
        }:item)
      };
      const nextState={...saved,projects:saved.projects.map((item)=>item.id===project.id?nextProject:item)};
      await saveStudioState(nextState);
      try{localStorage.removeItem(runKey(record.projectId,record.chapterId))}catch{}
      setMessage(`${record.chapterTitle} background build complete. Manga script, beats and all page plans are saved.`);
      setError("");
      window.setTimeout(()=>window.location.reload(),650);
    }finally{
      applyingRef.current.delete(record.runId);
    }
  },[]);

  const pollRuns=useCallback(async()=>{
    const runs=readPendingRuns();
    setRunningCount(runs.length);
    if(!runs.length)return;
    for(const record of runs){
      try{
        const response=await fetch(`/api/manga/background-build/${encodeURIComponent(record.runId)}`,{cache:"no-store"});
        const data=await response.json().catch(()=>({error:"Background build status returned invalid data."})) as StatusResponse;
        if(!response.ok)throw new Error(data.error||`Background build status failed (${response.status}).`);
        if(data.status==="completed"&&data.result){
          if(data.result.ok===false||data.result.error){
            try{localStorage.removeItem(runKey(record.projectId,record.chapterId))}catch{}
            const stage=data.result.stage?`${data.result.stage}: `:"";
            setRunningCount((count)=>Math.max(0,count-1));
            setError(`${record.chapterTitle} background build stopped. ${stage}${data.result.error||"Unknown server error"} · Run ${record.runId}`);
            continue;
          }
          if(data.result.master&&data.result.production){
            await applyCompletedRun(record,{master:data.result.master,production:data.result.production});
            continue;
          }
        }
        if(data.status==="failed"||data.status==="cancelled"){
          try{localStorage.removeItem(runKey(record.projectId,record.chapterId))}catch{}
          setError(`${record.chapterTitle} background build stopped on the server. ${data.error||"Press Build Manga Script & Pages to retry."} · Run ${record.runId}`);
          continue;
        }
        setMessage(`${record.chapterTitle} is building on the server. You can close this website; the durable workflow will continue.`);
      }catch(reason){
        setError(reason instanceof Error?reason.message:"Could not check background manga progress.");
      }
    }
  },[applyCompletedRun]);

  useEffect(()=>{
    const initial=window.setTimeout(()=>void pollRuns(),0);
    const timer=window.setInterval(()=>void pollRuns(),5000);
    return()=>{window.clearTimeout(initial);window.clearInterval(timer)};
  },[pollRuns]);

  const startBackgroundBuild=async()=>{
    if(startingRef.current)return;
    startingRef.current=true;
    try{
      setError("");
      setMessage("Saving the current story and starting the server workflow…");
      await wait(450);
      const saved=await loadStudioState();
      if(!saved?.projects.length)throw new Error("Manga Studio project is not ready yet. Please try again.");
      const project=saved.projects.find((item)=>item.id===saved.activeProjectId)||saved.projects[0];
      const chapter=project.chapters.find((item)=>item.id===project.activeChapterId)||project.chapters[0];
      if(!chapter||chapter.story.trim().length<20)throw new Error("पहले पूरी story paste करो।");

      const key=runKey(project.id,chapter.id);
      try{
        const existing=localStorage.getItem(key);
        if(existing){
          const parsed=JSON.parse(existing) as PendingRun;
          if(parsed.runId){setMessage(`${chapter.title} is already building on the server.`);return}
        }
      }catch{}

      const pacingPreset=selectedPacingFromPage();
      const stylePreset=selectedStyleForChapter(chapter.id,chapter.manga?.stylePreset,getInheritedMangaStyle(project,chapter.id));
      const response=await fetch("/api/manga/background-build",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          projectName:project.name,
          chapterTitle:chapter.title,
          story:chapter.story,
          analysisModel:project.analysisModel,
          stylePreset,
          pacingPreset,
          masterSeed:project.visualBible.masterSeed,
          requestedAt:new Date().toISOString(),
          existingCharacters:project.characters.map((item)=>compactExistingCharacter(item as unknown as Record<string,unknown>)),
          existingLocations:project.locations.map((item)=>compactExistingLocation(item as unknown as Record<string,unknown>)),
          existingProps:project.props.map((item)=>compactExistingObject(item as unknown as Record<string,unknown>)),
          previousContinuity:getPreviousChapterContinuity(project,chapter.id),
          chapterContext:continuationContextText(project,chapter.id)
        })
      });
      const data=await response.json().catch(()=>({error:"Background build start returned invalid data."})) as StartResponse;
      if(!response.ok||!data.runId)throw new Error(data.error||`Could not start background manga build (${response.status}).`);
      const record:PendingRun={runId:data.runId,projectId:project.id,chapterId:chapter.id,chapterTitle:chapter.title,startedAt:new Date().toISOString()};
      try{localStorage.setItem(key,JSON.stringify(record))}catch{}
      setRunningCount((count)=>Math.max(1,count+1));
      setMessage(`${chapter.title} background build started. You can close Chrome now; story analysis and page planning will continue on the server.`);
      void pollRuns();
    }finally{
      startingRef.current=false;
    }
  };

  const captureBuildClick=(event:MouseEvent<HTMLDivElement>)=>{
    const element=event.target as HTMLElement|null;
    const button=element?.closest("button");
    if(!button)return;
    const text=button.textContent||"";
    if(!text.includes("Build Manga Script & Pages"))return;
    event.preventDefault();
    event.stopPropagation();
    void startBackgroundBuild().catch((reason)=>setError(reason instanceof Error?reason.message:"Could not start background manga build."));
  };

  return <div onClickCapture={captureBuildClick} className="min-h-screen bg-white">
    {(message||error||runningCount>0)&&<div className="mx-auto max-w-7xl px-4 pt-4">
      {error?<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>:<div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">{runningCount>0?<Loader2 className="shrink-0 animate-spin" size={17}/>:<CheckCircle2 className="shrink-0" size={17}/>}<CloudCog className="shrink-0" size={17}/><span>{message}</span></div>}
    </div>}
    {children}
  </div>;
}
