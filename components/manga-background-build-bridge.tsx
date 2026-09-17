"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {Loader2} from "lucide-react";
import {loadStudioState,saveStudioState} from "@/lib/continuity/storage";
import type {MangaProject,MangaStudioState} from "@/lib/continuity/project-types";
import {deriveSeed} from "@/lib/continuity/seed";
import {continuationContextText,getInheritedMangaStyle,getPreviousChapterContinuity} from "@/lib/manga-production/chapter-continuity";
import {mergeMangaMasterIntoProject} from "@/lib/manga-production/project-bridge";
import {MANGA_PACING_PRESETS,type MangaPacingPreset} from "@/lib/manga-production/pacing-policy";
import {MANGA_STYLE_PRESETS,type MangaChapterProduction,type MangaMasterAnalysis,type MangaStylePreset} from "@/lib/manga-production/types";

type StoredJob={runId:string;projectId:string;chapterId:string;chapterTitle:string;startedAt:string};
type BuildResult={projectId:string;chapterId:string;master:MangaMasterAnalysis;production:MangaChapterProduction};
type JobStatusResponse={status:string;result?:BuildResult;error?:string};
type BannerState={kind:"running"|"done"|"error";message:string}|null;

const JOBS_KEY="storyframe-durable-manga-jobs-v1";

function readJobs():StoredJob[]{
  try{
    const value=JSON.parse(localStorage.getItem(JOBS_KEY)||"[]") as unknown;
    return Array.isArray(value)?value.filter((item):item is StoredJob=>Boolean(item&&typeof item==="object"&&"runId" in item&&"projectId" in item&&"chapterId" in item)):[];
  }catch{return []}
}

function writeJobs(jobs:StoredJob[]){
  try{localStorage.setItem(JOBS_KEY,JSON.stringify(jobs))}catch{}
}

function optionValues(select:HTMLSelectElement){return new Set(Array.from(select.options,(option)=>option.value))}

function resolveSelection(state:MangaStudioState){
  const selects=Array.from(document.querySelectorAll<HTMLSelectElement>("select"));
  const projectSelect=selects.find((select)=>state.projects.some((project)=>optionValues(select).has(project.id)));
  const projectId=projectSelect?.value||state.activeProjectId;
  const project=state.projects.find((item)=>item.id===projectId)||state.projects.find((item)=>item.id===state.activeProjectId)||state.projects[0];
  if(!project)return null;
  const chapterSelect=selects.find((select)=>project.chapters.some((chapter)=>optionValues(select).has(chapter.id)));
  const chapterId=chapterSelect?.value||project.activeChapterId;
  const chapter=project.chapters.find((item)=>item.id===chapterId)||project.chapters.find((item)=>item.id===project.activeChapterId)||project.chapters[0];
  if(!chapter)return null;
  return {project,chapter};
}

function selectedPacing():MangaPacingPreset{
  const values=new Set<string>(MANGA_PACING_PRESETS);
  const select=Array.from(document.querySelectorAll<HTMLSelectElement>("select")).find((item)=>values.has(item.value));
  return (select?.value as MangaPacingPreset)||"Balanced";
}

function selectedStyle(project:MangaProject,chapterId:string):MangaStylePreset{
  const values=new Set<string>(MANGA_STYLE_PRESETS);
  const select=Array.from(document.querySelectorAll<HTMLSelectElement>("select")).find((item)=>values.has(item.value));
  if(select)return select.value as MangaStylePreset;
  return project.chapters.find((item)=>item.id===chapterId)?.manga?.stylePreset||getInheritedMangaStyle(project,chapterId)||"Classic Black & White Manga";
}

function liveStory(fallback:string){
  const textarea=document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Paste the full story"]');
  return textarea?.value||fallback;
}

function compactForWorkflow<T>(value:T):T{
  return JSON.parse(JSON.stringify(value,(key,child)=>{
    if(typeof child==="string"&&child.startsWith("data:image/"))return undefined;
    if(key==="referenceImages"&&Array.isArray(child))return child.filter((item)=>!item?.url?.startsWith?.("data:image/"));
    return child;
  })) as T;
}

function seedProduction(project:MangaProject,production:MangaChapterProduction):MangaChapterProduction{
  return {
    ...production,
    pages:production.pages.map((page)=>({...page,panels:page.panels.map((panel)=>({...panel,seed:deriveSeed(project.visualBible.masterSeed,panel.id,0)}))})),
    updatedAt:new Date().toISOString()
  };
}

async function installResult(job:StoredJob,result:BuildResult){
  const state=await loadStudioState();
  if(!state?.projects.length)return false;
  const project=state.projects.find((item)=>item.id===job.projectId);
  if(!project)return false;
  const chapter=project.chapters.find((item)=>item.id===job.chapterId);
  if(!chapter)return false;

  const merged=mergeMangaMasterIntoProject(project,job.chapterId,result.master,result.production.stylePreset);
  const production=seedProduction(project,result.production);
  const updatedProject:MangaProject={
    ...project,
    characters:merged.characters,
    locations:merged.locations,
    props:merged.props,
    updatedAt:new Date().toISOString(),
    chapters:project.chapters.map((item)=>item.id===job.chapterId?{...item,manga:production,analysisProvider:result.master.provider,updatedAt:new Date().toISOString()}:item)
  };
  const nextState:MangaStudioState={...state,projects:state.projects.map((item)=>item.id===project.id?updatedProject:item)};
  await saveStudioState(nextState);
  return true;
}

export function MangaBackgroundBuildBridge(){
  const [banner,setBanner]=useState<BannerState>(null);
  const syncingRef=useRef(false);
  const reloadingRef=useRef(false);

  const syncJobs=useCallback(async()=>{
    if(syncingRef.current||typeof window==="undefined")return;
    const jobs=readJobs();
    if(!jobs.length)return;
    syncingRef.current=true;
    try{
      const remaining:StoredJob[]=[];
      for(const job of jobs){
        try{
          const response=await fetch(`/api/manga/build-job?runId=${encodeURIComponent(job.runId)}`,{cache:"no-store"});
          const data=await response.json().catch(()=>null) as JobStatusResponse|null;
          if(!response.ok||!data){remaining.push(job);continue}
          if(data.status==="completed"&&data.result){
            const installed=await installResult(job,data.result);
            if(installed){
              setBanner({kind:"done",message:`${job.chapterTitle} background build complete. Manga Script और Pages save हो गए हैं।`});
              if(!reloadingRef.current){
                reloadingRef.current=true;
                setTimeout(()=>window.location.reload(),900);
              }
            }
            continue;
          }
          if(data.status==="failed"||data.status==="cancelled"){
            setBanner({kind:"error",message:`${job.chapterTitle} background build रुका: ${data.error||"workflow failed"}`});
            continue;
          }
          remaining.push(job);
          setBanner({kind:"running",message:`${job.chapterTitle} server पर background में बन रहा है। आप website बंद कर सकते हैं; वापस आने पर progress/result restore होगा।`});
        }catch{
          remaining.push(job);
        }
      }
      writeJobs(remaining);
    }finally{
      syncingRef.current=false;
    }
  },[]);

  const startBuild=useCallback(async()=>{
    const saved=await loadStudioState().catch(()=>null);
    if(!saved?.projects.length){setBanner({kind:"error",message:"Project state अभी तैयार नहीं है। एक बार page refresh करके फिर Build दबाएँ।"});return}
    const selection=resolveSelection(saved);
    if(!selection)return;
    const {project,chapter}=selection;
    const story=liveStory(chapter.story).trim();
    if(story.length<20){setBanner({kind:"error",message:"पहले पूरी story paste करो।"});return}

    const existing=readJobs().find((item)=>item.projectId===project.id&&item.chapterId===chapter.id);
    if(existing){
      setBanner({kind:"running",message:`${chapter.title} का background build पहले से चल रहा है। Duplicate job start नहीं किया गया।`});
      void syncJobs();
      return;
    }

    const pacingPreset=selectedPacing();
    const stylePreset=selectedStyle(project,chapter.id);
    const previousContinuity=getPreviousChapterContinuity(project,chapter.id);
    const chapterContext=continuationContextText(project,chapter.id);
    setBanner({kind:"running",message:`${chapter.title} background build start हो रहा है…`});

    try{
      const response=await fetch("/api/manga/build-job",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          projectId:project.id,
          chapterId:chapter.id,
          projectName:project.name,
          chapterTitle:chapter.title,
          story,
          analysisModel:project.analysisModel,
          stylePreset,
          pacingPreset,
          existingCharacters:compactForWorkflow(project.characters),
          existingLocations:compactForWorkflow(project.locations),
          existingProps:compactForWorkflow(project.props),
          previousContinuity,
          chapterContext
        })
      });
      const data=await response.json().catch(()=>null) as {runId?:string;error?:string}|null;
      if(!response.ok||!data?.runId)throw new Error(data?.error||`Background build could not start (${response.status})`);
      const jobs=readJobs();
      writeJobs([...jobs,{runId:data.runId,projectId:project.id,chapterId:chapter.id,chapterTitle:chapter.title,startedAt:new Date().toISOString()}]);
      setBanner({kind:"running",message:`${chapter.title} server पर background में बन रहा है। अब browser/tab बंद करने पर भी build चलता रहेगा।`});
      void syncJobs();
    }catch(error){
      setBanner({kind:"error",message:error instanceof Error?error.message:"Background manga build start नहीं हो पाया।"});
    }
  },[syncJobs]);

  useEffect(()=>{
    const capture=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest("button"):null;
      if(!(target instanceof HTMLButtonElement)||target.disabled)return;
      const text=(target.textContent||"").replace(/\s+/g," ").trim();
      if(!text.includes("Build Manga Script & Pages"))return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void startBuild();
    };
    document.addEventListener("click",capture,true);
    return()=>document.removeEventListener("click",capture,true);
  },[startBuild]);

  useEffect(()=>{
    void syncJobs();
    const timer=window.setInterval(()=>void syncJobs(),5000);
    const wake=()=>void syncJobs();
    window.addEventListener("focus",wake);
    document.addEventListener("visibilitychange",wake);
    return()=>{
      window.clearInterval(timer);
      window.removeEventListener("focus",wake);
      document.removeEventListener("visibilitychange",wake);
    };
  },[syncJobs]);

  if(!banner)return null;
  return <div className={`fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-xl rounded-2xl border px-4 py-3 text-sm shadow-xl sm:left-auto sm:right-5 ${banner.kind==="error"?"border-red-200 bg-red-50 text-red-700":banner.kind==="done"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-violet-200 bg-white text-slate-700"}`}>
    <div className="flex items-start gap-3">{banner.kind==="running"&&<Loader2 className="mt-0.5 shrink-0 animate-spin text-violet-600" size={16}/>}<div>{banner.message}</div></div>
  </div>;
}
