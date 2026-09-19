"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {Loader2,Play,RotateCcw,Sparkles,WandSparkles} from "lucide-react";
import {parseJsonResponse} from "@/lib/fetch-json";
import {DEFAULT_STORY_ANALYSIS_MODEL,STORY_ANALYSIS_MODEL_OPTIONS,type StoryAnalysisModel} from "@/lib/story-analysis-models";
import {loadStoryGeneratorState,saveStoryGeneratorState} from "@/lib/story-generator/storage";
import type {GeneratedStoryChapter,StoryGeneratorState,StoryOverview} from "@/lib/story-generator/types";

type OverviewResponse={kind:"overview";data:StoryOverview};
type ChapterResponse={kind:"chapter";data:{title:string;story:string;summary:string;endingState:string;nextHook:string;continuityMemory:string;storyComplete:boolean;provider?:string}};
type ExplainerResponse={kind:"explainer";data:{explainer:string;provider?:string}};
type MangaResult={requestId:string;ok:boolean;synced?:boolean;projectId?:string;chapterId?:string;message?:string};

const now=()=>new Date().toISOString();
const defaultExplainerPrompt="इस chapter को engaging Hindi YouTube/anime story explainer की तरह समझाओ। शुरुआत strong hook से करो, chronology साफ रखो, important action/reactions detail में बताओ, unnecessary description छोटा रखो और suspense natural तरीके से build करो।";
const initialState=():StoryGeneratorState=>({
  schemaVersion:1,
  prompt:"",
  targetHours:12,
  chapterWordTarget:2200,
  explainerPrompt:defaultExplainerPrompt,
  analysisModel:DEFAULT_STORY_ANALYSIS_MODEL,
  autoContinue:false,
  autoGenerateManga:true,
  chapters:[],
  running:false,
  status:"",
  error:"",
  updatedAt:now()
});

function wordCount(value:string){return value.trim()?value.trim().split(/\s+/).filter(Boolean).length:0}
function chapterId(number:number){return `generated-chapter-${number}-${Date.now().toString(36)}`}
function requestId(number:number){return `storygen-${number}-${Date.now().toString(36)}`}

export type StoryGeneratorView="generator"|"chapters"|"explainer";

export function StoryGeneratorWorkspace({view="generator",onOpenMangaStory}:{view?:StoryGeneratorView;onOpenMangaStory?:()=>void}){
  const [state,setState]=useState<StoryGeneratorState>(()=>initialState());
  const stateRef=useRef(state);
  const [hydrated,setHydrated]=useState(false);
  const [selectedChapterId,setSelectedChapterId]=useState("");
  const pendingMangaRef=useRef(new Map<string,{chapterId:string;mode:"sync"|"build"}>());
  const nextChapterRunnerRef=useRef<()=>Promise<void>>(async()=>{});

  const applyState=(updater:(current:StoryGeneratorState)=>StoryGeneratorState)=>{
    const next=updater(stateRef.current);
    stateRef.current=next;
    setState(next);
    return next;
  };

  useEffect(()=>{
    let cancelled=false;
    loadStoryGeneratorState().then((saved)=>{
      if(cancelled||!saved)return;
      stateRef.current=saved;
      setState(saved);
      if(saved.chapters.length)setSelectedChapterId(saved.chapters.at(-1)?.id||"");
    }).catch(console.error).finally(()=>{if(!cancelled)setHydrated(true)});
    return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    stateRef.current=state;
    if(!hydrated)return;
    const timer=setTimeout(()=>void saveStoryGeneratorState(state).catch(console.error),250);
    return()=>clearTimeout(timer);
  },[state,hydrated]);

  useEffect(()=>{
    const handler=(event:Event)=>{
      const detail=(event as CustomEvent<MangaResult>).detail;
      if(!detail?.requestId)return;
      const pending=pendingMangaRef.current.get(detail.requestId);
      if(!pending)return;
      pendingMangaRef.current.delete(detail.requestId);
      const current=stateRef.current;
      const target=current.chapters.find((item)=>item.id===pending.chapterId);
      if(!target)return;
      const syncOnly=pending.mode==="sync"||detail.synced===true;
      const next=applyState((value)=>({
        ...value,
        running:false,
        status:detail.ok
          ? syncOnly?`Chapter ${target.number} synced to Manga Studio. Original chapter is ready to build.`:`Chapter ${target.number} manga complete.`
          :`Chapter ${target.number} manga stopped.`,
        error:detail.ok?"":detail.message||"Manga pipeline failed.",
        mangaProjectId:detail.projectId||value.mangaProjectId,
        chapters:value.chapters.map((item)=>item.id===pending.chapterId?{
          ...item,
          mangaStatus:detail.ok?(syncOnly?"queued":"complete"):"error",
          mangaProjectId:detail.projectId||item.mangaProjectId,
          mangaChapterId:detail.chapterId||item.mangaChapterId,
          error:detail.ok?undefined:(detail.message||"Manga pipeline failed."),
          updatedAt:now()
        }:item),
        updatedAt:now()
      }));
      if(detail.ok&&!syncOnly&&next.autoContinue&&!target.storyComplete){
        setTimeout(()=>void nextChapterRunnerRef.current(),800);
      }
    };
    window.addEventListener("storyframe:story-generator-result",handler);
    return()=>window.removeEventListener("storyframe:story-generator-result",handler);
  },[]);

  const totalWords=useMemo(()=>state.chapters.reduce((sum,item)=>sum+item.wordCount,0),[state.chapters]);
  const selected=state.chapters.find((item)=>item.id===selectedChapterId)||state.chapters.at(-1);

  const update=(patch:Partial<StoryGeneratorState>)=>applyState((current)=>({...current,...patch,updatedAt:now()}));

  const generateOverview=async()=>{
    const current=stateRef.current;
    if(current.prompt.trim().length<20){update({error:"पहले Story Prompt में अपना concept/detail लिखो।"});return}
    update({running:true,status:"Creating story overview and long-form story bible…",error:""});
    try{
      const response=await fetch("/api/story-generator",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        action:"overview",
        analysisModel:current.analysisModel,
        prompt:current.prompt,
        targetHours:current.targetHours,
        chapterWordTarget:current.chapterWordTarget
      })});
      const data=await parseJsonResponse<OverviewResponse>(response);
      applyState((value)=>({...value,overview:data.data,chapters:[],mangaProjectId:undefined,running:false,status:"Story overview ready. Generate Chapter 1 when ready.",error:"",updatedAt:now()}));
      setSelectedChapterId("");
    }catch(error){
      update({running:false,status:"",error:error instanceof Error?error.message:"Story overview generation failed."});
    }
  };

  const dispatchToMangaStudio=(chapter:GeneratedStoryChapter,mode:"sync"|"build"="build")=>{
    const current=stateRef.current;
    const id=requestId(chapter.number);
    pendingMangaRef.current.set(id,{chapterId:chapter.id,mode});
    const syncOnly=mode==="sync";
    applyState((value)=>({...value,running:true,status:syncOnly
      ?`Chapter ${chapter.number}: syncing original story into Manga Studio…`
      :`Chapter ${chapter.number}: existing Manga Studio pipeline is analyzing, planning and generating pages…`,
      error:"",
      chapters:value.chapters.map((item)=>item.id===chapter.id?{...item,mangaStatus:syncOnly?"queued":"building",updatedAt:now()}:item),
      updatedAt:now()}));
    window.dispatchEvent(new CustomEvent("storyframe:story-generator-command",{detail:{
      requestId:id,
      projectId:current.mangaProjectId,
      existingChapterId:chapter.mangaChapterId,
      newProjectName:current.mangaProjectId?undefined:(current.overview?.title||"Generated Manga Story"),
      analysisModel:current.analysisModel,
      chapterNumber:chapter.number,
      title:chapter.title,
      story:chapter.story,
      summary:chapter.summary,
      autoGenerateImages:!syncOnly,
      syncOnly
    }}));
  };

  const generateNextChapter=async()=>{
    const current=stateRef.current;
    if(current.running)return;
    if(!current.overview){update({error:"पहले Story Overview generate करो।"});return}
    if(current.chapters.at(-1)?.storyComplete){update({status:"Story already reached its planned ending.",error:""});return}

    const number=current.chapters.length+1;
    update({running:true,status:`Generating Chapter ${number}…`,error:""});
    try{
      const chapterResponse=await fetch("/api/story-generator",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        action:"chapter",
        analysisModel:current.analysisModel,
        overview:current.overview,
        chapterNumber:number,
        previousSummaries:current.chapters.slice(-8).map((item)=>({number:item.number,title:item.title,summary:item.summary,endingState:item.endingState})),
        continuityMemory:current.chapters.at(-1)?.continuityMemory||"",
        totalWordsSoFar:current.chapters.reduce((sum,item)=>sum+item.wordCount,0)
      })});
      const generated=(await parseJsonResponse<ChapterResponse>(chapterResponse)).data;
      const created:GeneratedStoryChapter={
        id:chapterId(number),
        number,
        title:generated.title,
        story:generated.story,
        summary:generated.summary,
        endingState:generated.endingState,
        nextHook:generated.nextHook,
        continuityMemory:generated.continuityMemory,
        explainer:"",
        wordCount:wordCount(generated.story),
        storyComplete:generated.storyComplete,
        mangaStatus:"not-started",
        createdAt:now(),
        updatedAt:now()
      };
      applyState((value)=>({...value,chapters:[...value.chapters,created],status:`Chapter ${number} saved. Generating explainer…`,updatedAt:now()}));
      setSelectedChapterId(created.id);

      const latest=stateRef.current;
      let explainer="";
      let explainerWarning="";
      try{
        const explainerResponse=await fetch("/api/story-generator",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          action:"explainer",
          analysisModel:latest.analysisModel,
          chapterTitle:created.title,
          chapterStory:created.story,
          explainerPrompt:latest.explainerPrompt
        })});
        explainer=(await parseJsonResponse<ExplainerResponse>(explainerResponse)).data.explainer;
      }catch(error){
        explainerWarning=error instanceof Error?error.message:"Explainer generation failed.";
      }
      const saved=applyState((value)=>({...value,running:false,status:explainerWarning
        ?`Chapter ${number} saved. Explainer failed, but the original chapter is ready for Manga Studio.`
        :`Chapter ${number} + explainer ready.`,
        error:"",
        chapters:value.chapters.map((item)=>item.id===created.id?{...item,explainer,updatedAt:now()}:item),
        updatedAt:now()}));
      const ready=saved.chapters.find((item)=>item.id===created.id)!;

      if(saved.autoGenerateManga)dispatchToMangaStudio(ready,"build");
      else dispatchToMangaStudio(ready,"sync");
    }catch(error){
      update({running:false,status:"",error:error instanceof Error?error.message:`Chapter ${number} generation failed.`});
    }
  };

  // eslint-disable-next-line react-hooks/refs -- auto-continue must call the latest chapter generator closure after async manga completion.
  nextChapterRunnerRef.current=generateNextChapter;

  const openSelectedInManga=()=>{
    if(!selected||state.running)return;
    if(selected.mangaStatus==="complete"){
      onOpenMangaStory?.();
      return;
    }
    dispatchToMangaStudio(selected,"build");
    setTimeout(()=>onOpenMangaStory?.(),50);
  };

  const retryResume=()=>{
    if(state.running)return;
    const current=stateRef.current;
    const target=current.chapters.find((item)=>item.id===selectedChapterId)||current.chapters.at(-1);
    if(target&&(target.mangaStatus==="error"||target.mangaStatus==="queued")){
      dispatchToMangaStudio(target,"build");
      setTimeout(()=>onOpenMangaStory?.(),50);
      return;
    }
    if(current.overview){
      void generateNextChapter();
      return;
    }
    void generateOverview();
  };

  const resetGenerator=()=>{
    if(state.running)return;
    const fresh=initialState();
    stateRef.current=fresh;
    setState(fresh);
    setSelectedChapterId("");
  };

  const chapterTabs=state.chapters.length?<div className="flex gap-2 overflow-x-auto">{state.chapters.map((item)=><button key={item.id} onClick={()=>setSelectedChapterId(item.id)} className={"whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold "+(selected?.id===item.id?"bg-violet-600 text-white":"bg-slate-100 text-slate-600")}>Ch {item.number} · {item.mangaStatus}</button>)}</div>:null;
  const showRetry=Boolean(state.error)||selected?.mangaStatus==="error";

  return <section className="bg-white text-slate-900">
    <div className="space-y-5 py-1">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xl font-black"><WandSparkles className="text-violet-600" size={21}/>{view==="generator"?"Story Generator":view==="chapters"?"Chapters":"Chapter Explainer"}</div>
            <p className="mt-1 text-sm text-slate-500">{view==="generator"?"Prompt → Story Overview → one chapter at a time.":view==="chapters"?"Generated original chapters stay separate from explainer text and feed the existing Manga Studio pipeline.":"Chapter-wise YouTube/story explainer output. This text is never sent to Manga Studio."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {view==="generator"&&<button disabled={state.running} onClick={resetGenerator} className="rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:opacity-40"><RotateCcw className="mr-1 inline" size={14}/> New Story</button>}
            {view==="chapters"&&<button disabled={state.running||!state.overview} onClick={()=>void generateNextChapter()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{state.running?<Loader2 className="mr-1 inline animate-spin" size={15}/>:<Play className="mr-1 inline" size={15}/>} Generate Next Chapter</button>}
            {showRetry&&<button disabled={state.running} onClick={retryResume} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 disabled:opacity-40">Retry / Resume</button>}
          </div>
        </div>
        {state.status&&<div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">{state.running&&<Loader2 className="mr-2 inline animate-spin" size={14}/>} {state.status}</div>}
        {state.error&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}
      </div>

      {view==="generator"&&<>
        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 font-bold">Story Prompt</div>
            <textarea disabled={state.running} value={state.prompt} onChange={(event)=>update({prompt:event.target.value})} className="min-h-64 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 outline-none focus:border-violet-400 disabled:opacity-60" placeholder="अपना पूरा concept, world, hero, genre, story कैसी होनी चाहिए, कितनी लंबी होनी चाहिए और special instructions यहाँ लिखो…"/>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-slate-600">Target Story Hours<input disabled={state.running} type="number" min={1} max={100} step={.5} value={state.targetHours} onChange={(e)=>update({targetHours:Number(e.target.value)||1})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"/></label>
              <label className="text-xs font-semibold text-slate-600">Approx. Words / Chapter<input disabled={state.running} type="number" min={800} max={5000} step={100} value={state.chapterWordTarget} onChange={(e)=>update({chapterWordTarget:Number(e.target.value)||2200})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"/></label>
              <label className="text-xs font-semibold text-slate-600">Story Model<select disabled={state.running} value={state.analysisModel} onChange={(e)=>update({analysisModel:e.target.value as StoryAnalysisModel})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">{STORY_ANALYSIS_MODEL_OPTIONS.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-5 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={state.autoGenerateManga} disabled={state.running} onChange={(e)=>update({autoGenerateManga:e.target.checked})}/> Auto run existing Manga pipeline</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={state.autoContinue} onChange={(e)=>update({autoContinue:e.target.checked})}/> Auto Continue to next chapter after completion</label>
            </div>
            <button disabled={state.running||state.prompt.trim().length<20} onClick={()=>void generateOverview()} className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><Sparkles className="mr-1 inline" size={15}/> Generate Story Overview</button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="font-bold">Story Overview</div>
            {state.overview?<div className="mt-4 space-y-4 text-sm">
              <div><div className="text-xl font-black">{state.overview.title}</div><div className="mt-1 text-slate-500">{state.overview.genre} · {state.overview.tone} · {state.overview.language}</div></div>
              <p className="leading-6">{state.overview.overview}</p>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Long-form plan</div><div className="mt-1">{state.overview.targetHours} hours · ~{state.overview.estimatedChapterCount} estimated chapters · ~{state.overview.chapterWordTarget} words/chapter</div><div className="mt-1 text-xs text-slate-500">Estimated chapters are guidance only; there is no fixed chapter cap.</div></div>
              <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">Story Bible</summary><div className="mt-3 whitespace-pre-wrap leading-6 text-slate-600">{state.overview.storyBible}</div></details>
              <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">Major Arcs</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-600">{state.overview.majorArcs.map((arc,index)=><li key={index}>{arc}</li>)}</ol></details>
            </div>:<div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Story Prompt के बाद पहले overview बनेगा; chapters एक-एक करके generate होंगे।</div>}
          </div>
        </div>
      </>}

      {view==="chapters"&&<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-bold">Generated Chapters</div><div className="text-xs text-slate-500">{state.chapters.length} chapters · {totalWords.toLocaleString()} story words generated</div></div>{state.autoContinue&&<div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Auto Continue ON</div>}</div>
        <div className="mt-4">{chapterTabs}</div>
        {selected?<article className="mt-5 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-xs font-bold uppercase tracking-wide text-violet-600">Original Chapter {selected.number}</div><h3 className="mt-1 text-lg font-black">{selected.title}</h3><div className="mt-1 text-xs text-slate-400">{selected.wordCount} words · Manga: {selected.mangaStatus}</div></div>
            <div className="flex flex-wrap gap-2">
              {selected.mangaStatus==="error"&&<button disabled={state.running} onClick={retryResume} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-40">Retry / Resume</button>}
              <button disabled={state.running||selected.mangaStatus==="building"} onClick={openSelectedInManga} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{selected.mangaStatus==="complete"?"Open Manga Studio":"Open in Manga Studio & Build"}</button>
            </div>
          </div>
          <div className="mt-4 max-h-[680px] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.story}</div>
          {selected.error&&<div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{selected.error}</div>}
        </article>:<div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Story Generator में overview बनाकर Chapter 1 generate करो।</div>}
      </div>}

      {view==="explainer"&&<div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="font-bold">Explainer Prompt</div>
          <p className="mt-1 text-xs text-slate-500">यह सिर्फ chapter-wise explainer output के लिए है। Original chapter और Manga Studio story इससे नहीं बदलेंगे।</p>
          <textarea disabled={state.running} value={state.explainerPrompt} onChange={(e)=>update({explainerPrompt:e.target.value})} className="mt-3 min-h-44 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-violet-400"/>
          <div className="mt-4">{chapterTabs}</div>
        </div>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-cyan-600">Chapter Explainer</div>
          <h3 className="mt-1 font-bold">{selected?("Chapter "+selected.number+": "+selected.title):"No chapter selected"}</h3>
          <div className="mt-1 text-[11px] text-slate-400">Explainer stays separate and is never sent to Manga Studio.</div>
          <div className="mt-4 max-h-[680px] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected?.explainer||"इस chapter का explainer अभी generate नहीं हुआ।"}</div>
        </article>
      </div>}
    </div>
  </section>;
}
