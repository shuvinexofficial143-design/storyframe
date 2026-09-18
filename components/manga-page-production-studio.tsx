"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {BookOpen,Download,ImageIcon,Loader2,MapPinned,Plus,Sparkles,Users} from "lucide-react";
import {parseJsonResponse} from "@/lib/fetch-json";
import {deriveSeed} from "@/lib/continuity/seed";
import {createChapter,createProject,normalizeName} from "@/lib/continuity/project-defaults";
import {loadStudioState,saveStudioState} from "@/lib/continuity/storage";
import type {CharacterReference,MangaChapter,MangaProject,MangaStudioState} from "@/lib/continuity/project-types";
import {composeGeneratedMangaPage} from "@/lib/manga-production/full-page-composer";
import {compileMangaPagePrompt} from "@/lib/manga-production/page-prompt-compiler";
import {mergeMangaMasterIntoProject} from "@/lib/manga-production/project-bridge";
import {calculatePlannedCoverage} from "@/lib/manga-production/validators";
import {MANGA_PACING_PRESETS,type MangaPacingPreset} from "@/lib/manga-production/pacing-policy";
import {MANGA_STYLE_PRESETS,type MangaChapterProduction,type MangaMasterAnalysis,type MangaPage,type MangaPagePlan,type MangaStylePreset} from "@/lib/manga-production/types";
import {downloadDataUrl} from "@/lib/manga-production/composer";
import {continuationContextText,getInheritedMangaStyle,getPreviousChapterContinuity,getPreviousRenderedMangaPage} from "@/lib/manga-production/chapter-continuity";
import {requestQueuedMangaImage} from "@/lib/manga-production/image-request-queue";

const now=()=>new Date().toISOString();
const wait=(ms:number)=>new Promise<void>((resolve)=>setTimeout(resolve,ms));
const safeFilePart=(value:string)=>value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g,"-").replace(/\s+/g," ").slice(0,80)||"manga";
const pad=(value:number,width:number)=>String(value).padStart(width,"0");

function mutateProject(state:MangaStudioState,projectId:string,updater:(project:MangaProject)=>MangaProject){
  return {...state,projects:state.projects.map((project)=>project.id===projectId?updater(project):project)};
}

type ImageResponse={imageDataUrl:string;sourceUrl?:string;model:string;provider:string;seed:number;warning?:string;fallbackUsed?:boolean};
type ReferenceResponse={imageDataUrl:string;sourceUrl:string;model:string;provider:string;seed:number;warning?:string};
type MasterResponse={kind:"master";data:MangaMasterAnalysis};
type PagesResponse={kind:"pages";data:MangaPagePlan};
type Tab="story"|"characters"|"locations"|"script"|"pages"|"export"|"download";
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

  const applyState=(fn:(current:MangaStudioState)=>MangaStudioState)=>{
    const next=fn(stateRef.current);
    stateRef.current=next;
    setState(next);
  };

  useEffect(()=>{
    try{
      const staleKeys:string[]=[];
      for(let index=0;index<localStorage.length;index+=1){
        const key=localStorage.key(index);
        if(key?.startsWith("storyframe-manga-background-run:"))staleKeys.push(key);
      }
      staleKeys.forEach((key)=>localStorage.removeItem(key));
    }catch{}
  },[]);

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
    return getInheritedMangaStyle(project,chapter.id)||"Classic Black & White Manga";
  })();

  const addProject=()=>{
    if(busy)return;
    const current=stateRef.current;
    const next=createProject(`Manga Project ${current.projects.length+1}`);
    applyState((value)=>({...value,activeProjectId:next.id,projects:[...value.projects,next]}));
    setPacingPreset("Balanced");
    setTab("story");
    setError("");
    setProgress("");
    setNotice(`${next.name} created as a completely new manga project.`);
  };

  const addChapter=()=>{
    if(busy)return;
    const newChapter=createChapter(`Chapter ${project.chapters.length+1}`);
    const currentIndex=project.chapters.findIndex((item)=>item.id===chapter.id);
    const chapters=[...project.chapters];
    chapters.splice(currentIndex>=0?currentIndex+1:chapters.length,0,newChapter);
    const inheritedStyle=production?.stylePreset||resolvedStyle;
    try{localStorage.setItem(`manga-style-${newChapter.id}`,inheritedStyle)}catch{}
    updateProject((current)=>({...current,activeChapterId:newChapter.id,chapters,updatedAt:now()}));
    setTab("story");
    setError("");
    setNotice(`${newChapter.title} created. Character, location, prop and previous-chapter visual continuity will be inherited automatically.`);
  };

  const preparePrimaryReference=async(character:CharacterReference)=>requestQueuedMangaImage<ReferenceResponse>({
    url:"/api/manga/reference-continuity",
    label:`Preparing ${character.name} reference`,
    onStatus:setProgress,
    body:{name:character.name,referencePrompt:character.referencePrompt,seed:character.seedBase,view:"primary"}
  });

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
      const merged=mergeMangaMasterIntoProject(project,chapter.id,master,resolvedStyle);
      const previousContinuity=getPreviousChapterContinuity(project,chapter.id);
      const inheritedCharacters=previousContinuity?{...master.initialCharacterStates,...previousContinuity.characters}:master.initialCharacterStates;
      const chapterContext=continuationContextText(project,chapter.id);
      const initialState={
        currentPage:0,
        timeline:previousContinuity?.timeline||master.timeline[0]?.event||"Story start",
        timeOfDay:previousContinuity?.timeOfDay||master.timeline[0]?.timeOfDay||"unspecified",
        currentLocation:previousContinuity?.currentLocation||master.timeline[0]?.location||"",
        characters:inheritedCharacters,
        activeProps:previousContinuity?.activeProps?.length?previousContinuity.activeProps:master.props.filter((item)=>item.currentOwner||item.currentLocation).map((item)=>item.name),
        previousPageEndState:previousContinuity?.previousPageEndState||"Story start"
      };
      const initialProduction:MangaChapterProduction={
        schemaVersion:1,
        stylePreset:resolvedStyle,
        pacingPreset,
        storySummary:chapterContext?`${chapterContext}\nCurrent chapter summary: ${master.storySummary}`:master.storySummary,
        timeline:master.timeline,
        beats:master.beats,
        locationProfiles:master.locations,
        propStates:master.props,
        initialCharacterStates:inheritedCharacters,
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
      setNotice(`${beatDetailLabel(pacingPreset)} detail manga ready. ${master.beats.length} visual beats are planned into ${planned.production.pages.length} complete pages. Story coverage ${planned.production.coverage.percent}%.${previousContinuity?" Previous chapter continuity is locked in.":""}`);
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
    if(!current)throw new Error("The requested manga page is no longer available in the active chapter.");
    const currentProject=await ensurePageReferences(current.project,current.page);
    const latest=locatePage(pageId);
    if(!latest)throw new Error(`Page ${current.page.pageNumber} disappeared before generation could start.`);
    const pageIndex=latest.production.pages.findIndex((item)=>item.id===pageId);
    const previousPage=pageIndex>0?latest.production.pages[pageIndex-1]:getPreviousRenderedMangaPage(currentProject,latest.chapter.id);
    const compiled=compileMangaPagePrompt({project:currentProject,production:latest.production,page:latest.page,previousPage,stronger});
    const seed=deriveSeed(currentProject.visualBible.masterSeed,latest.page.id,stronger?1:0);

    applyState((currentState)=>mutateProject(currentState,currentProject.id,(p)=>({...p,chapters:p.chapters.map((c)=>c.id===latest.chapter.id&&c.manga?{...c,manga:{...c.manga,pages:c.manga.pages.map((pg)=>pg.id===pageId?{...pg,status:"generating",error:undefined}:pg),updatedAt:now()}}:c)})));

    const data=await requestQueuedMangaImage<ImageResponse>({
      url:"/api/manga/page-image",
      label:`Page ${latest.page.pageNumber}`,
      onStatus:setProgress,
      body:{prompt:compiled.prompt,negativePrompt:compiled.negativePrompt,seed,referenceImages:compiled.referenceImages}
    });
    const pageForCompose={...latest.page,rawPageImageDataUrl:data.imageDataUrl,pagePrompt:compiled.prompt,renderProvider:data.provider,renderModel:data.model,renderSeed:data.seed,status:"generated" as const};
    setProgress(`Adding dialogue and SFX to Page ${latest.page.pageNumber}…`);
    const composed=await composeGeneratedMangaPage(data.imageDataUrl,pageForCompose,latest.production.stylePreset);

    applyState((currentState)=>mutateProject(currentState,currentProject.id,(p)=>({...p,chapters:p.chapters.map((c)=>c.id===latest.chapter.id&&c.manga?{...c,manga:{...c.manga,pages:c.manga.pages.map((pg)=>pg.id===pageId?{...pg,...pageForCompose,composedImageDataUrl:composed,status:"composed",error:undefined}:pg),updatedAt:now()}}:c),updatedAt:now()})));
    const verified=locatePage(pageId);
    if(!verified?.page.composedImageDataUrl||verified.page.status!=="composed")throw new Error(`Page ${latest.page.pageNumber} finished rendering but was not saved, so the queue stopped before the next page.`);
    if(data.warning)setNotice(`Page ${latest.page.pageNumber} generated. ${data.warning}`);
    else setNotice(`Page ${latest.page.pageNumber} generated as one complete manga page and dialogue overlay was added.`);
    return verified.page;
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
    const orderedPages=[...currentProduction.pages].sort((a,b)=>a.pageNumber-b.pageNumber);
    const initialPending=orderedPages.filter((page)=>!page.composedImageDataUrl).length;
    if(!initialPending){setNotice("All manga pages are already generated.");return}
    setBusy("all-pages");setError("");setNotice("");
    let completed=0;
    try{
      for(const plannedPage of orderedPages){
        const existing=locatePage(plannedPage.id);
        if(existing?.page.composedImageDataUrl)continue;
        let pageFinished=false;
        let lastError="Page generation failed";
        for(let attempt=1;attempt<=3&&!pageFinished;attempt+=1){
          setProgress(`Strict sequential render ${completed+1}/${initialPending}: Page ${plannedPage.pageNumber} · attempt ${attempt}/3. The next page will not start until this page is complete.`);
          try{
            await renderPage(plannedPage.id,false);
            const verified=locatePage(plannedPage.id);
            if(!verified?.page.composedImageDataUrl||verified.page.status!=="composed")throw new Error(`Page ${plannedPage.pageNumber} was not fully composed.`);
            pageFinished=true;
          }catch(reason){
            lastError=reason instanceof Error?reason.message:"Page generation failed";
            if(attempt<3){
              setProgress(`Page ${plannedPage.pageNumber} did not finish. Retrying the SAME page before continuing…`);
              await wait(attempt*3000);
            }
          }
        }
        if(!pageFinished)throw new Error(`Page ${plannedPage.pageNumber} could not finish after 3 attempts. Queue stopped here and later pages were NOT started. ${lastError}`);
        completed+=1;
      }
      setNotice(`${completed} remaining manga pages generated in strict order. No later page starts until the current page is fully saved and composed.`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Chapter page generation stopped at the first unfinished page. Run Generate All Pages again to resume there.");
    }finally{
      setBusy("");setProgress("");
    }
  };

  const generateReference=async(character:CharacterReference,view:ReferenceView)=>{
    setBusy(`ref-${character.id}-${view}`);setError("");
    try{
      const ref=await requestQueuedMangaImage<ReferenceResponse>({
        url:"/api/manga/reference-continuity",
        label:`${character.name} ${view} reference`,
        onStatus:setProgress,
        body:{name:character.name,referencePrompt:character.referencePrompt,seed:character.seedBase,view}
      });
      updateProject((p)=>({...p,characters:p.characters.map((item)=>item.id===character.id?{...item,manualReferenceImage:view==="primary"?ref.imageDataUrl:item.manualReferenceImage,referenceImages:[...item.referenceImages,{type:view,url:ref.sourceUrl||ref.imageDataUrl,seed:ref.seed,provider:ref.provider,createdAt:now()}],updatedAt:now()}:item),updatedAt:now()}));
      setNotice(`${character.name}: ${view} reference saved.`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Reference generation failed");
    }finally{
      setBusy("");setProgress("");
    }
  };

  const downloadAllProjectPages=async()=>{
    const items=project.chapters.flatMap((item,chapterIndex)=>[...(item.manga?.pages||[])]
      .filter((page)=>Boolean(page.composedImageDataUrl))
      .sort((a,b)=>a.pageNumber-b.pageNumber)
      .map((page)=>({chapter:item,chapterIndex,page,image:page.composedImageDataUrl!})));
    if(!items.length){setError("इस project में अभी कोई generated manga page download करने के लिए नहीं है।");return}
    setBusy("download-all");setError("");setNotice("");
    try{
      for(let index=0;index<items.length;index+=1){
        const item=items[index];
        setProgress(`Downloading ${index+1}/${items.length}: ${item.chapter.title} · Page ${item.page.pageNumber}…`);
        const filename=`${safeFilePart(project.name)}-chapter-${pad(item.chapterIndex+1,2)}-page-${pad(item.page.pageNumber,3)}.jpg`;
        downloadDataUrl(item.image,filename);
        await wait(500);
      }
      setNotice(`${items.length} manga pages downloaded one-by-one in chapter/page order. If your browser asks, allow multiple downloads for this site.`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"All manga pages could not be downloaded.");
    }finally{
      setBusy("");setProgress("");
    }
  };

  const downloadCurrentChapterPages=async()=>{
    const chapterIndex=Math.max(0,project.chapters.findIndex((item)=>item.id===chapter.id));
    const items=[...(chapter.manga?.pages||[])]
      .filter((page)=>Boolean(page.composedImageDataUrl))
      .sort((a,b)=>a.pageNumber-b.pageNumber)
      .map((page)=>({page,image:page.composedImageDataUrl!}));
    if(!items.length){setError(`${chapter.title} में अभी कोई generated manga page download करने के लिए नहीं है।`);return}
    setBusy("download-chapter");setError("");setNotice("");
    try{
      for(let index=0;index<items.length;index+=1){
        const item=items[index];
        setProgress(`Downloading ${chapter.title} ${index+1}/${items.length}: Page ${item.page.pageNumber}…`);
        const filename=`${safeFilePart(project.name)}-chapter-${pad(chapterIndex+1,2)}-page-${pad(item.page.pageNumber,3)}.jpg`;
        downloadDataUrl(item.image,filename);
        await wait(500);
      }
      setNotice(`${chapter.title} के ${items.length} generated pages page-number order में download हो गए।`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:`${chapter.title} के pages download नहीं हो पाए।`);
    }finally{
      setBusy("");setProgress("");
    }
  };

  const chapterNumber=Math.max(1,project.chapters.findIndex((item)=>item.id===chapter.id)+1);
  const generatedChapterPages=chapter.manga?.pages.filter((page)=>Boolean(page.composedImageDataUrl)).length||0;
  const plannedChapterPages=chapter.manga?.pages.length||0;
  const generatedProjectPages=project.chapters.reduce((sum,item)=>sum+(item.manga?.pages.filter((page)=>Boolean(page.composedImageDataUrl)).length||0),0);
  const plannedProjectPages=project.chapters.reduce((sum,item)=>sum+(item.manga?.pages.length||0),0);
  const tabs:[Tab,string][]=[["story","Story"],["characters","Characters"],["locations","Locations"],["script","Manga Script"],["pages","Manga Pages"],["export","Export"],["download","Download All"]];
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
            <div className="flex min-w-0 gap-2"><select disabled={!!busy} value={project.id} onChange={(e)=>applyState((current)=>({...current,activeProjectId:e.target.value}))} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm disabled:opacity-50">{state.projects.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={!!busy} onClick={addProject} title="Create a completely new manga project" className="whitespace-nowrap rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-50"><Plus className="mr-1 inline" size={13}/> New Project</button></div>
            <div className="flex min-w-0 gap-2"><select disabled={!!busy} value={chapter.id} onChange={(e)=>updateProject((p)=>({...p,activeChapterId:e.target.value}))} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm disabled:opacity-50">{project.chapters.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select><button disabled={!!busy} onClick={addChapter} title="Create the next chapter with previous-chapter continuity" className="whitespace-nowrap rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200 disabled:opacity-50"><Plus className="mr-1 inline" size={13}/> New Chapter</button></div>
            <select disabled={!!busy} value={resolvedStyle} onChange={(e)=>changeStyle(e.target.value)} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm disabled:opacity-50">{MANGA_STYLE_PRESETS.map((item)=><option key={item}>{item}</option>)}</select>
            <select disabled={!!busy} value={pacingPreset} onChange={(e)=>changePacing(e.target.value)} title="Controls visual-beat detail; final count still adapts to chapter length." className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm disabled:opacity-50">
              <option value="Fast">Beat Detail: Low</option>
              <option value="Balanced">Beat Detail: Standard</option>
              <option value="Cinematic">Beat Detail: Highest</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto">{tabs.map(([id,label])=><button key={id} disabled={!!busy} onClick={()=>setTab(id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm disabled:opacity-50 ${tab===id?"bg-violet-500 text-white":"bg-white/5 text-zinc-400"}`}>{label}</button>)}</div>
      </section>

      {progress&&<div className="rounded-2xl border border-violet-500/20 bg-violet-500/8 p-4 text-sm text-violet-200"><Loader2 className="mr-2 inline animate-spin" size={15}/>{progress}</div>}
      {notice&&<div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4 text-sm text-emerald-200">{notice}</div>}
      {error&&<div className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4 text-sm text-red-200">{error}</div>}

      {tab==="story"&&<section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold">Full Story</h2><p className="text-sm text-zinc-500">AI first analyzes the story and plans every page. New chapters automatically continue the previous chapter&apos;s locked characters, locations, props and ending state.</p></div>
          <button disabled={!!busy} onClick={()=>void buildManga()} className="rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold disabled:opacity-50">{building?<Loader2 className="mr-1 inline animate-spin" size={16}/>:<Sparkles className="mr-1 inline" size={16}/>} {building?"Building Manga…":"Build Manga Script & Pages"}</button>
        </div>
        <textarea value={chapter.story} onChange={(e)=>setStory(e.target.value)} className="min-h-[420px] w-full rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-7 outline-none focus:border-violet-500/50" placeholder="Paste the full story here…"/>
      </section>}

      {tab==="characters"&&<section className="grid gap-4 md:grid-cols-2">{project.characters.length?project.characters.map((character)=><article key={character.id} className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
        <div className="flex gap-4">{character.manualReferenceImage?<img src={character.manualReferenceImage} alt="" className="h-28 w-28 rounded-xl object-cover"/>:<div className="grid h-28 w-28 place-items-center rounded-xl bg-white/5"><Users/></div>}<div className="min-w-0 flex-1"><div className="font-bold">{character.name}</div><div className="mt-1 text-sm text-zinc-400">{character.visualDescription}</div><div className="mt-2 text-xs text-zinc-500">Outfit: {character.outfit}</div></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{(["primary","full-body","three-quarter","side","sheet"] as ReferenceView[]).map((view)=><button key={view} onClick={()=>void generateReference(character,view)} disabled={!!busy} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-50">{view}</button>)}</div>
      </article>):<div className="text-zinc-500">Build Manga Script first to create the Character Bible.</div>}</section>}

      {tab==="locations"&&<section className="grid gap-4 md:grid-cols-2">{production?.locationProfiles.length?production.locationProfiles.map((location)=><article key={location.id} className="rounded-2xl border border-white/10 bg-[#0d1017] p-4"><div className="flex items-center gap-2 font-bold"><MapPinned size={16} className="text-violet-400"/>{location.name}</div><p className="mt-2 text-sm text-zinc-400">{location.architecture}</p><p className="mt-3 text-xs text-emerald-300">{location.continuityNotes}</p></article>):<div className="text-zinc-500">No manga location bible yet.</div>}</section>}

      {tab==="script"&&<section className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Manga Script</h2><p className="text-sm text-zinc-500">{production?`${production.beats.length} visual beats · ${production.pages.length} planned pages · ${beatDetailLabel(production.pacingPreset||"Balanced")} detail`:"Build the Manga Script first."}</p></div>{production&&production.nextBeatIndex<production.beats.length&&<button disabled={!!busy} onClick={()=>void planNextPages()} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold disabled:opacity-50">Plan All Remaining Pages</button>}</div>
          {production&&<><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full bg-emerald-500" style={{width:`${production.coverage.percent}%`}}/></div><div className="mt-2 text-xs text-zinc-500">Story Coverage: {production.coverage.percent}%</div></>}
        </div>
        {production?.beats.map((beat,index)=><article key={beat.id} className="rounded-xl border border-white/8 bg-[#0d1017] p-4"><div className="text-xs font-bold text-violet-300">{index+1}. {beat.type.toUpperCase()}</div><div className="mt-2 font-semibold">{beat.storyBeat}</div><div className="mt-1 text-sm text-zinc-500">{beat.sourceText}</div></article>)}
      </section>}

      {tab==="pages"&&<section className="space-y-6">
        {production?.pages.length?<>
          <div className="flex flex-col gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/8 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold">Premium Page Mode</div><div className="text-sm text-zinc-400">Strict order: Page 1 must finish and save before Page 2 starts. Failed pages retry in place; later pages are never skipped.</div></div><button disabled={!!busy} onClick={()=>void generateAllPages()} className="rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold disabled:opacity-50">{busy==="all-pages"?<Loader2 className="mr-1 inline animate-spin" size={15}/>:<Sparkles className="mr-1 inline" size={15}/>} Generate All Pages</button></div>
          {production.pages.map((page)=><article key={page.id} className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-lg font-bold">Page {page.pageNumber} <span className="ml-2 text-xs font-normal text-violet-300">{page.panels.length} panels</span></div><div className="mt-1 inline-flex rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-semibold text-violet-200">{chapter.title} · Page {page.pageNumber}</div><div className="mt-2 text-xs text-zinc-500">{page.pagePurpose} · {page.panelLayout}</div>{page.renderProvider&&<div className="mt-1 text-[11px] text-zinc-600">{page.renderProvider} · {page.renderModel}</div>}</div><div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={()=>void generatePage(page.id)} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold disabled:opacity-50">{busy===page.id?<Loader2 className="mr-1 inline animate-spin" size={14}/>:<ImageIcon className="mr-1 inline" size={14}/>} {page.composedImageDataUrl?"Regenerate Page":"Generate Page"}</button><button disabled={!!busy} onClick={()=>void generatePage(page.id,true)} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-50">Strong Continuity Retry</button>{page.composedImageDataUrl&&<button disabled={!!busy} onClick={()=>downloadDataUrl(page.composedImageDataUrl!,`${safeFilePart(project.name)}-chapter-${pad(chapterNumber,2)}-page-${pad(page.pageNumber,3)}.jpg`)} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 disabled:opacity-50"><Download className="mr-1 inline" size={13}/> Download</button>}</div></div>
            {page.composedImageDataUrl?<img src={page.composedImageDataUrl} alt={`${chapter.title} manga page ${page.pageNumber}`} className="mx-auto mt-5 max-h-[980px] w-auto rounded-xl border border-white/10 bg-white object-contain"/>:<div className="mt-5 grid min-h-[440px] place-items-center rounded-xl border border-dashed border-white/10 bg-black/20 text-center text-zinc-600"><div><ImageIcon className="mx-auto mb-3"/><div>{chapter.title} · Page {page.pageNumber} will appear here</div><div className="mt-1 text-xs">One page image containing all {page.panels.length} planned panels</div></div></div>}
            {page.error&&<div className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{page.error}</div>}
            <details className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3"><summary className="cursor-pointer text-sm font-semibold text-zinc-300">View panel plan ({page.panels.length} panels)</summary><div className="mt-3 grid gap-3 md:grid-cols-2">{page.panels.map((panel)=><div key={panel.id} className="rounded-lg border border-white/8 p-3"><div className="text-xs font-bold text-cyan-300">Panel {panel.panelNumber} · {panel.cameraShot}</div><div className="mt-1 text-sm">{panel.storyBeat}</div><div className="mt-1 text-xs text-zinc-500">{panel.action}</div>{panel.dialogue.map((line,index)=><div key={index} className="mt-1 text-xs text-amber-200">{line.speaker||line.bubbleType}: {line.text}</div>)}</div>)}</div></details>
          </article>)}
        </>:<div className="rounded-2xl border border-white/10 bg-[#0d1017] p-8 text-center text-zinc-500">Build Manga Script & Pages first.</div>}
      </section>}

      {tab==="export"&&<section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-bold">Export Manga</h2><p className="mt-1 text-sm text-zinc-500">Download complete composed manga pages or export the production JSON.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>{const data=`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({projectId:project.id,chapterId:chapter.id,manga:production},null,2))}`;downloadDataUrl(data,`${project.name}-${chapter.title}-manga.json`)}} disabled={!production||!!busy} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold disabled:opacity-40">Export Manga JSON</button>{production?.pages.filter((page)=>page.composedImageDataUrl).map((page)=><button key={page.id} disabled={!!busy} onClick={()=>downloadDataUrl(page.composedImageDataUrl!,`${safeFilePart(project.name)}-chapter-${pad(chapterNumber,2)}-page-${pad(page.pageNumber,3)}.jpg`)} className="rounded-xl border border-white/10 px-4 py-2 text-sm disabled:opacity-50">{chapter.title} · Page {page.pageNumber}</button>)}</div></section>}

      {tab==="download"&&<section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="font-bold">Download Manga Pages</h2><p className="mt-1 text-sm text-zinc-500">Download only the selected chapter, or download the whole project in Chapter 1 → Page 1, Page 2… then Chapter 2 order.</p><p className="mt-2 text-xs text-zinc-600">Selected: {chapter.title} · {generatedChapterPages}/{plannedChapterPages} generated. Project total: {generatedProjectPages}/{plannedProjectPages} generated.</p></div>
          <div className="flex flex-wrap gap-2">
            <button disabled={!!busy||generatedChapterPages===0} onClick={()=>void downloadCurrentChapterPages()} className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-100 disabled:opacity-40">{busy==="download-chapter"?<Loader2 className="mr-1 inline animate-spin" size={15}/>:<Download className="mr-1 inline" size={15}/>} Download {chapter.title}</button>
            <button disabled={!!busy||generatedProjectPages===0} onClick={()=>void downloadAllProjectPages()} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-40">{busy==="download-all"?<Loader2 className="mr-1 inline animate-spin" size={15}/>:<Download className="mr-1 inline" size={15}/>} Download All in Order</button>
          </div>
        </div>
      </section>}
    </div>
  </main>;
}
