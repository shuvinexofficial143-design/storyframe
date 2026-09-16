"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {BookOpen,Download,ImageIcon,Loader2,MapPinned,Sparkles,Users} from "lucide-react";
import {parseJsonResponse} from "@/lib/fetch-json";
import {deriveSeed} from "@/lib/continuity/seed";
import {createProject,normalizeName} from "@/lib/continuity/project-defaults";
import {loadStudioState,saveStudioState} from "@/lib/continuity/storage";
import type {CharacterReference,MangaChapter,MangaProject,MangaStudioState} from "@/lib/continuity/project-types";
import {composeGeneratedMangaPage} from "@/lib/manga-production/full-page-composer";
import {compileMangaPagePrompt} from "@/lib/manga-production/page-prompt-compiler";
import {mergeMangaMasterIntoProject} from "@/lib/manga-production/project-bridge";
import {calculatePlannedCoverage} from "@/lib/manga-production/validators";
import {MANGA_PACING_PRESETS,type MangaPacingPreset} from "@/lib/manga-production/pacing-policy";
import {MANGA_STYLE_PRESETS,type MangaChapterProduction,type MangaMasterAnalysis,type MangaPage,type MangaPagePlan,type MangaStylePreset} from "@/lib/manga-production/types";
import {downloadDataUrl} from "@/lib/manga-production/composer";

const now=()=>new Date().toISOString();

function mutateProject(state:MangaStudioState,projectId:string,updater:(project:MangaProject)=>MangaProject){
  return {...state,projects:state.projects.map((project)=>project.id===projectId?updater(project):project)};
}

type ImageResponse={imageDataUrl:string;sourceUrl?:string;model:string;provider:string;seed:number;warning?:string;fallbackUsed?:boolean};
type ReferenceResponse={imageDataUrl:string;sourceUrl:string;model:string;provider:string;seed:number;warning?:string};
type MasterResponse={kind:"master";data:MangaMasterAnalysis};
type PagesResponse={kind:"pages";data:MangaPagePlan};
type Tab="story"|"characters"|"locations"|"script"|"pages"|"export";
type ReferenceView="primary"|"full-body"|"three-quarter"|"side"|"sheet";

const beatDetailLabel=(preset:MangaPacingPreset)=>preset==="Fast"?"Low":preset==="Balanced"?"Standard":"Highest";

export function MangaPageProductionStudio(){
  const [state,setState]=useState<MangaStudioState>(()=>{const p=createProject("My Manga Project");return {activeProjectId:p.id,projects:[p]}});
  const stateRef=useRef(state);
  const [hydrated,setHydrated]=useState(false);
  const [tab,setTab]=useState<Tab>("story");
  const [busy,setBusy]=useState("");
  const [progress,setProgress]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [pacingPreset,setPacingPreset]=useState<MangaPacingPreset>("Balanced");

  const applyState=(fn:(current:MangaStudioState)=>MangaStudioState)=>setState((current)=>{
    const next=fn(current);
    stateRef.current=next;
    return next;
  });

  useEffect(()=>{
    let cancelled=false;
    loadStudioState().then((saved)=>{
      if(!cancelled&&saved?.projects?.length){stateRef.current=saved;setState(saved)}
    }).catch(console.error).finally(()=>{if(!cancelled)setHydrated(true)});
    return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    stateRef.current=state;
    if(!hydrated)return;
    const timer=setTimeout(()=>void saveStudioState(state).catch(console.error),300);
    return()=>clearTimeout(timer);
  },[state,hydrated]);

  const project=useMemo(()=>state.projects.find((item)=>item.id===state.activeProjectId)||state.projects[0],[state]);
  const chapter=useMemo(()=>project?.chapters.find((item)=>item.id===project.activeChapterId)||project?.chapters[0],[project]);
  if(!project||!chapter)return <div className="p-8 text-zinc-400">Loading Manga Studio…</div>;
  const production=chapter.manga;

  const updateProject=(fn:(project:MangaProject)=>MangaProject)=>applyState((current)=>mutateProject(current,project.id,fn));
  const updateChapter=(fn:(chapter:MangaChapter)=>MangaChapter)=>updateProject((current)=>({...current,updatedAt:now(),chapters:current.chapters.map((item)=>item.id===chapter.id?fn(item):item)}));
  const setStory=(story:string)=>updateChapter((item)=>({...item,story,updatedAt:now()}));

  const changePacing=(value:string)=>{
    if(!MANGA_PACING_PRESETS.includes(value as MangaPacingPreset))return;
    setPacingPreset(value as MangaPacingPreset);
  };

  const changeStyle=(value:string)=>{
    if(!MANGA_STYLE_PRESETS.includes(value as MangaStylePreset))return;
    const next=value as MangaStylePreset;
    if(production)updateChapter((item)=>({...item,manga:{...production,stylePreset:next,updatedAt:now()},updatedAt:now()}));
    else try{localStorage.setItem(`manga-style-${chapter.id}`,next)}catch{}
  };

  const resolvedStyle=(()=>{
    if(production)return production.stylePreset;
    try{
      const saved=localStorage.getItem(`manga-style-${chapter.id}`);
      if(MANGA_STYLE_PRESETS.includes(saved as MangaStylePreset))return saved as MangaStylePreset;
    }catch{}
    return "Classic Black & White Manga" as MangaStylePreset;
  })();

  const preparePrimaryReference=async(character:CharacterReference)=>{
    const response=await fetch("/api/manga/reference-continuity",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:character.name,referencePrompt:character.referencePrompt,seed:character.seedBase,view:"primary"})
    });
    return parseJsonResponse<ReferenceResponse>(response);
  };

  const requestPageChunk=async(currentProject:MangaProject,currentProduction:MangaChapterProduction,startBeatIndex:number,pageStartNumber:number)=>{
    const response=await fetch("/api/manga/production-plan",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"pages",
        analysisModel:currentProject.analysisModel,
        stylePreset:currentProduction.stylePreset,
        pacingPreset:currentProduction.pacingPreset||pacingPreset,
        storySummary:currentProduction.storySummary,
        beats:currentProduction.beats,
        startBeatIndex,
        pageStartNumber,
        previousState:currentProduction.continuityState,
        characters:currentProject.characters,
        locations:currentProduction.locationProfiles,
        props:currentProduction.propStates
      })
    });
    return (await parseJsonResponse<PagesResponse>(response)).data;
  };

  const seedPages=(currentProject:MangaProject,pages:MangaPage[])=>pages.map((page)=>({...page,panels:page.panels.map((panel)=>({...panel,seed:deriveSeed(currentProject.visualBible.masterSeed,panel.id,0)}))}));

  const saveProduction=(baseProject:MangaProject,chapterId:string,nextProduction:MangaChapterProduction)=>{
    const nextProject={...baseProject,updatedAt:now(),chapters:baseProject.chapters.map((item)=>item.id===chapterId?{...item,manga:nextProduction,updatedAt:now()}:item)};
    applyState((current)=>mutateProject(current,baseProject.id,()=>nextProject));
    return nextProject;
  };

  const planAllRemainingPages=async(baseProject:MangaProject,chapterId:string,startProduction:MangaChapterProduction)=>{
    let workingProject=baseProject;
    let workingProduction=startProduction;
    let guard=0;
    while(workingProduction.nextBeatIndex<workingProduction.beats.length){
      guard+=1;
      if(guard>Math.max(12,workingProduction.beats.length+2))throw new Error("Manga page planning stopped because the planner did not finish the remaining beats.");
      const startIndex=workingProduction.nextBeatIndex;
      setBusy("planning");
      setProgress(`Planning manga pages… ${startIndex}/${workingProduction.beats.length} beats assigned`);
      const planned=await requestPageChunk(workingProject,workingProduction,startIndex,(workingProduction.pages.at(-1)?.pageNumber||0)+1);
      if(planned.nextBeatIndex<=startIndex)throw new Error("Manga page planner made no progress. Please retry.");
      const pages=[...workingProduction.pages,...seedPages(workingProject,planned.pages)];
      workingProduction={
        ...workingProduction,
        pages,
        nextBeatIndex:planned.nextBeatIndex,
        continuityState:planned.continuityState,
        coverage:calculatePlannedCoverage(workingProduction.beats,pages),
        updatedAt:now()
      };
      workingProject=saveProduction(workingProject,chapterId,workingProduction);
    }
    return {project:workingProject,production:workingProduction};
  };

  const buildManga=async()=>{
    if(chapter.story.trim().length<20){setError("पहले पूरी story paste करो।");return}
    setBusy("master");setProgress(`Analyzing story · ${beatDetailLabel(pacingPreset)} beat detail…`);setError("");setNotice("");
    try{
      const response=await fetch("/api/manga/production-plan",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"master",projectName:project.name,chapterTitle:chapter.title,story:chapter.story,analysisModel:project.analysisModel,stylePreset:resolvedStyle,pacingPreset,existingCharacters:project.characters,existingLocations:project.locations,existingProps:project.props})
      });
      const master=(await parseJsonResponse<MasterResponse>(response)).data;
      const merged=mergeMangaMasterIntoProject(project,chapter.id,master);
      const initialState={
        currentPage:0,
        timeline:master.timeline[0]?.event||"Story start",
        timeOfDay:master.timeline[0]?.timeOfDay||"unspecified",
        currentLocation:master.timeline[0]?.location||"",
        characters:master.initialCharacterStates,
        activeProps:master.props.filter((item)=>item.currentOwner||item.currentLocation).map((item)=>item.name),
        previousPageEndState:"Story start"
      };
      const initialProduction:MangaChapterProduction={
        schemaVersion:1,
        stylePreset:resolvedStyle,
        pacingPreset,
        storySummary:master.storySummary,
        timeline:master.timeline,
        beats:master.beats,
        locationProfiles:master.locations,
        propStates:master.props,
        initialCharacterStates:master.initialCharacterStates,
        pages:[],
        nextBeatIndex:0,
        continuityState:initialState,
        coverage:{percent:0,coveredBeatIds:[],missingBeats:master.beats.map((beat)=>({beatId:beat.id,storyBeat:beat.storyBeat,sourceText:beat.sourceText}))},
        analysisProvider:master.provider,
        updatedAt:now()
      };
      let nextProject:MangaProject={...project,characters:merged.characters,locations:merged.locations,props:merged.props,updatedAt:now(),chapters:project.chapters.map((item)=>item.id===chapter.id?{...item,manga:initialProduction,updatedAt:now()}:item)};
      applyState((current)=>mutateProject(current,project.id,()=>nextProject));
      setProgress(`Story analyzed: ${master.beats.length} visual beats. Planning complete pages…`);
      const planned=await planAllRemainingPages(nextProject,chapter.id,initialProduction);
      nextProject=planned.project;
      setTab("pages");
      setNotice(`${beatDetailLabel(pacingPreset)} detail manga ready. ${master.beats.length} visual beats are planned into ${planned.production.pages.length} complete pages. Story coverage ${planned.production.coverage.percent}%.`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Manga planning failed");
    }finally{
      setBusy("");setProgress("");
    }
  };

  const planNextPages=async()=>{
    if(!production||production.nextBeatIndex>=production.beats.length)return;
    setBusy("planning");setError("");setNotice("");
    try{
      const planned=await planAllRemainingPages(project,chapter.id,production);
      setNotice(`All remaining pages planned. Coverage ${planned.production.coverage.percent}%.`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Remaining manga pages could not be planned");
    }finally{
      setBusy("");setProgress("");
    }
  };

  const locatePage=(pageId:string)=>{
    const current=stateRef.current;
    const p=current.projects.find((item)=>item.id===current.activeProjectId);
    const c=p?.chapters.find((item)=>item.id===p.activeChapterId);
    const prod=c?.manga;
    const page=prod?.pages.find((item)=>item.id===pageId);
    return p&&c&&prod&&page?{project:p,chapter:c,production:prod,page}:null;
  };

  const ensurePageReferences=async(currentProject:MangaProject,page:MangaPage)=>{
    let nextProject=currentProject;
    const names=[...new Set(page.panels.flatMap((panel)=>panel.characters))];
    for(const characterName of names){
      const character=nextProject.characters.find((item)=>normalizeName(item.name)===normalizeName(characterName));
      if(!character||character.manualReferenceImage||character.referenceImages.length)continue;
      try{
        setProgress(`Preparing ${character.name} reference once for page continuity…`);
        const ref=await preparePrimaryReference(character);
        const record={type:"primary" as const,url:ref.sourceUrl||ref.imageDataUrl,seed:ref.seed,provider:ref.provider,createdAt:now()};
        nextProject={...nextProject,characters:nextProject.characters.map((item)=>item.id===character.id?{...item,manualReferenceImage:ref.imageDataUrl,referenceImages:[...item.referenceImages,record],updatedAt:now()}:item),updatedAt:now()};
        applyState((current)=>mutateProject(current,nextProject.id,()=>nextProject));
      }catch(reason){
        console.error("Manga canonical reference failed",reason);
      }
    }
    return nextProject;
  };

  const renderPage=async(pageId:string,stronger=false)=>{
    const current=locatePage(pageId);
    if(!current)return;
    const currentProject=await ensurePageReferences(current.project,current.page);
    const latest=locatePage(pageId);
    if(!latest)return;
    const pageIndex=latest.production.pages.findIndex((item)=>item.id===pageId);
    const previousPage=pageIndex>0?latest.production.pages[pageIndex-1]:undefined;
    const compiled=compileMangaPagePrompt({project:currentProject,production:latest.production,page:latest.page,previousPage,stronger});
    const seed=deriveSeed(currentProject.visualBible.masterSeed,latest.page.id,stronger?1:0);

    applyState((currentState)=>mutateProject(currentState,currentProject.id,(p)=>({...p,chapters:p.chapters.map((c)=>c.id===latest.chapter.id&&c.manga?{...c,manga:{...c.manga,pages:c.manga.pages.map((pg)=>pg.id===pageId?{...pg,status:"generating",error:undefined}:pg),updatedAt:now()}}:c)})));

    setProgress(`Generating complete Page ${latest.page.pageNumber} in one image call…`);
    const response=await fetch("/api/manga/page-image",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prompt:compiled.prompt,negativePrompt:compiled.negativePrompt,seed,referenceImages:compiled.referenceImages})
    });
    const data=await parseJsonResponse<ImageResponse>(response);
    const pageForCompose={...latest.page,rawPageImageDataUrl:data.imageDataUrl,pagePrompt:compiled.prompt,renderProvider:data.provider,renderModel:data.model,renderSeed:data.seed,status:"generated" as const};
    setProgress(`Adding dialogue and SFX to Page ${latest.page.pageNumber}…`);
    const composed=await composeGeneratedMangaPage(data.imageDataUrl,pageForCompose);

    applyState((currentState)=>mutateProject(currentState,currentProject.id,(p)=>({...p,chapters:p.chapters.map((c)=>c.id===latest.chapter.id&&c.manga?{...c,manga:{...c.manga,pages:c.manga.pages.map((pg)=>pg.id===pageId?{...pg,...pageForCompose,composedImageDataUrl:composed,status:"composed",error:undefined}:pg),updatedAt:now()}}:c),updatedAt:now()})));
    if(data.warning)setNotice(`Page ${latest.page.pageNumber} generated. ${data.warning}`);
    else setNotice(`Page ${latest.page.pageNumber} generated as one complete manga page and dialogue overlay was added.`);
  };

  const generatePage=async(pageId:string,stronger=false)=>{
    setBusy(pageId);setError("");setNotice("");
    try{
      await renderPage(pageId,stronger);
    }catch(reason){
      const message=reason instanceof Error?reason.message:"Page generation failed";
      const current=locatePage(pageId);
      if(current)applyState((currentState)=>mutateProject(currentState,current.project.id,(p)=>({...p,chapters:p.chapters.map((c)=>c.id===current.chapter.id&&c.manga?{...c,manga:{...c.manga,pages:c.manga.pages.map((pg)=>pg.id===pageId?{...pg,status:"needs-review",error:message}:pg)}}:c)})));
      setError(message);
    }finally{
      setBusy("");setProgress("");
    }
  };

  const generateAllPages=async()=>{
    const currentProduction=chapter.manga;
    if(!currentProduction?.pages.length)return;
    setBusy("all-pages");setError("");setNotice("");
    try{
      for(let index=0;index<currentProduction.pages.length;index+=1){
        const pageId=currentProduction.pages[index].id;
        setProgress(`Chapter render ${index+1}/${currentProduction.pages.length}: preparing Page ${currentProduction.pages[index].pageNumber}…`);
        await renderPage(pageId,false);
      }
      setNotice(`${currentProduction.pages.length} manga pages generated page-by-page. Each page used one main image generation call.`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Chapter page generation stopped");
    }finally{
      setBusy("");setProgress("");
    }
  };

  const generateReference=async(character:CharacterReference,view:ReferenceView)=>{
    setBusy(`ref-${character.id}-${view}`);setError("");
    try{
      const response=await fetch("/api/manga/reference-continuity",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:character.name,referencePrompt:character.referencePrompt,seed:character.seedBase,view})
      });
      const ref=await parseJsonResponse<ReferenceResponse>(response);
      updateProject((p)=>({...p,characters:p.characters.map((item)=>item.id===character.id?{...item,manualReferenceImage:view==="primary"?ref.imageDataUrl:item.manualReferenceImage,referenceImages:[...item.referenceImages,{type:view,url:ref.sourceUrl||ref.imageDataUrl,seed:ref.seed,provider:ref.provider,createdAt:now()}],updatedAt:now()}:item),updatedAt:now()}));
      setNotice(`${character.name}: ${view} reference saved.`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Reference generation failed");
    }finally{
      setBusy("");
    }
  };

  const tabs:[Tab,string][]=[["story","Story"],["characters","Characters"],["locations","Locations"],["script","Manga Script"],["pages","Manga Pages"],["export","Export"]];
  const building=busy==="master"||busy==="planning";

  return <main className="min-h-screen bg-[#080a0f] text-zinc-100">
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold"><BookOpen className="text-violet-400" size={19}/> StoryFrame Premium Manga</div>
            <p className="mt-1 text-sm text-zinc-500">Story → planned panels → one complete image per manga page → clean dialogue overlay.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <select value={project.id} onChange={(e)=>applyState((current)=>({...current,activeProjectId:e.target.value}))} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">{state.projects.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select value={chapter.id} onChange={(e)=>updateProject((p)=>({...p,activeChapterId:e.target.value}))} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">{project.chapters.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select>
            <select value={resolvedStyle} onChange={(e)=>changeStyle(e.target.value)} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">{MANGA_STYLE_PRESETS.map((item)=><option key={item}>{item}</option>)}</select>
            <select value={pacingPreset} onChange={(e)=>changePacing(e.target.value)} title="Controls visual-beat detail; final count still adapts to chapter length." className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">
              <option value="Fast">Beat Detail: Low</option>
              <option value="Balanced">Beat Detail: Standard</option>
              <option value="Cinematic">Beat Detail: Highest</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto">{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm ${tab===id?"bg-violet-500 text-white":"bg-white/5 text-zinc-400"}`}>{label}</button>)}</div>
      </section>

      {progress&&<div className="rounded-2xl border border-violet-500/20 bg-violet-500/8 p-4 text-sm text-violet-200"><Loader2 className="mr-2 inline animate-spin" size={15}/>{progress}</div>}
      {notice&&<div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4 text-sm text-emerald-200">{notice}</div>}
      {error&&<div className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4 text-sm text-red-200">{error}</div>}

      {tab==="story"&&<section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold">Full Story</h2><p className="text-sm text-zinc-500">AI first analyzes the story and plans every page. Beat Detail controls pacing, while final beat/page counts still adapt to the chapter.</p></div>
          <button disabled={!!busy} onClick={()=>void buildManga()} className="rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold disabled:opacity-50">{building?<Loader2 className="mr-1 inline animate-spin" size={16}/>:<Sparkles className="mr-1 inline" size={16}/>} {building?"Building Manga…":"Build Manga Script & Pages"}</button>
        </div>
        <textarea value={chapter.story} onChange={(e)=>setStory(e.target.value)} className="min-h-[420px] w-full rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-7 outline-none focus:border-violet-500/50" placeholder="Paste the full story here…"/>
      </section>}

      {tab==="characters"&&<section className="grid gap-4 md:grid-cols-2">{project.characters.length?project.characters.map((character)=><article key={character.id} className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
        <div className="flex gap-4">{character.manualReferenceImage?<img src={character.manualReferenceImage} alt="" className="h-28 w-28 rounded-xl object-cover"/>:<div className="grid h-28 w-28 place-items-center rounded-xl bg-white/5"><Users/></div>}<div className="min-w-0 flex-1"><div className="font-bold">{character.name}</div><div className="mt-1 text-sm text-zinc-400">{character.visualDescription}</div><div className="mt-2 text-xs text-zinc-500">Outfit: {character.outfit}</div></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{(["primary","full-body","three-quarter","side","sheet"] as ReferenceView[]).map((view)=><button key={view} onClick={()=>void generateReference(character,view)} disabled={!!busy} className="rounded-lg border border-white/10 px-3 py-2 text-xs">{view}</button>)}</div>
      </article>):<div className="text-zinc-500">Build Manga Script first to create the Character Bible.</div>}</section>}

      {tab==="locations"&&<section className="grid gap-4 md:grid-cols-2">{production?.locationProfiles.length?production.locationProfiles.map((location)=><article key={location.id} className="rounded-2xl border border-white/10 bg-[#0d1017] p-4"><div className="flex items-center gap-2 font-bold"><MapPinned size={16} className="text-violet-400"/>{location.name}</div><p className="mt-2 text-sm text-zinc-400">{location.architecture}</p><p className="mt-3 text-xs text-emerald-300">{location.continuityNotes}</p></article>):<div className="text-zinc-500">No manga location bible yet.</div>}</section>}

      {tab==="script"&&<section className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Manga Script</h2><p className="text-sm text-zinc-500">{production?`${production.beats.length} visual beats · ${production.pages.length} planned pages · ${beatDetailLabel(production.pacingPreset||"Balanced")} detail`:"Build the Manga Script first."}</p></div>{production&&production.nextBeatIndex<production.beats.length&&<button disabled={!!busy} onClick={()=>void planNextPages()} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold">Plan All Remaining Pages</button>}</div>
          {production&&<><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full bg-emerald-500" style={{width:`${production.coverage.percent}%`}}/></div><div className="mt-2 text-xs text-zinc-500">Story Coverage: {production.coverage.percent}%</div></>}
        </div>
        {production?.beats.map((beat,index)=><article key={beat.id} className="rounded-xl border border-white/8 bg-[#0d1017] p-4"><div className="text-xs font-bold text-violet-300">{index+1}. {beat.type.toUpperCase()}</div><div className="mt-2 font-semibold">{beat.storyBeat}</div><div className="mt-1 text-sm text-zinc-500">{beat.sourceText}</div></article>)}
      </section>}

      {tab==="pages"&&<section className="space-y-6">
        {production?.pages.length?<>
          <div className="flex flex-col gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/8 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold">Premium Page Mode</div><div className="text-sm text-zinc-400">Each planned page is rendered in one main image call. Panels stay inside that page.</div></div><button disabled={!!busy} onClick={()=>void generateAllPages()} className="rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold disabled:opacity-50">{busy==="all-pages"?<Loader2 className="mr-1 inline animate-spin" size={15}/>:<Sparkles className="mr-1 inline" size={15}/>} Generate All Pages</button></div>
          {production.pages.map((page)=><article key={page.id} className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-lg font-bold">Page {page.pageNumber} <span className="ml-2 text-xs font-normal text-violet-300">{page.panels.length} panels</span></div><div className="mt-1 text-xs text-zinc-500">{page.pagePurpose} · {page.panelLayout}</div>{page.renderProvider&&<div className="mt-1 text-[11px] text-zinc-600">{page.renderProvider} · {page.renderModel}</div>}</div><div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={()=>void generatePage(page.id)} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold">{busy===page.id?<Loader2 className="mr-1 inline animate-spin" size={14}/>:<ImageIcon className="mr-1 inline" size={14}/>} {page.composedImageDataUrl?"Regenerate Page":"Generate Page"}</button><button disabled={!!busy} onClick={()=>void generatePage(page.id,true)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Strong Continuity Retry</button>{page.composedImageDataUrl&&<button onClick={()=>downloadDataUrl(page.composedImageDataUrl!,`manga-page-${page.pageNumber}.jpg`)} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300"><Download className="mr-1 inline" size={13}/> Download</button>}</div></div>
            {page.composedImageDataUrl?<img src={page.composedImageDataUrl} alt={`Manga page ${page.pageNumber}`} className="mx-auto mt-5 max-h-[980px] w-auto rounded-xl border border-white/10 bg-white object-contain"/>:<div className="mt-5 grid min-h-[440px] place-items-center rounded-xl border border-dashed border-white/10 bg-black/20 text-center text-zinc-600"><div><ImageIcon className="mx-auto mb-3"/><div>Full Page {page.pageNumber} will appear here</div><div className="mt-1 text-xs">One page image containing all {page.panels.length} planned panels</div></div></div>}
            {page.error&&<div className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{page.error}</div>}
            <details className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3"><summary className="cursor-pointer text-sm font-semibold text-zinc-300">View panel plan ({page.panels.length} panels)</summary><div className="mt-3 grid gap-3 md:grid-cols-2">{page.panels.map((panel)=><div key={panel.id} className="rounded-lg border border-white/8 p-3"><div className="text-xs font-bold text-cyan-300">Panel {panel.panelNumber} · {panel.cameraShot}</div><div className="mt-1 text-sm">{panel.storyBeat}</div><div className="mt-1 text-xs text-zinc-500">{panel.action}</div>{panel.dialogue.map((line,index)=><div key={index} className="mt-1 text-xs text-amber-200">{line.speaker||line.bubbleType}: {line.text}</div>)}</div>)}</div></details>
          </article>)}
        </>:<div className="rounded-2xl border border-white/10 bg-[#0d1017] p-8 text-center text-zinc-500">Build Manga Script & Pages first.</div>}
      </section>}

      {tab==="export"&&<section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-bold">Export Manga</h2><p className="mt-1 text-sm text-zinc-500">Download complete composed manga pages or export the production JSON.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>{const data=`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({projectId:project.id,chapterId:chapter.id,manga:production},null,2))}`;downloadDataUrl(data,`${project.name}-${chapter.title}-manga.json`)}} disabled={!production} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold disabled:opacity-40">Export Manga JSON</button>{production?.pages.filter((page)=>page.composedImageDataUrl).map((page)=><button key={page.id} onClick={()=>downloadDataUrl(page.composedImageDataUrl!,`manga-page-${page.pageNumber}.jpg`)} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Page {page.pageNumber}</button>)}</div></section>}
    </div>
  </main>;
}
