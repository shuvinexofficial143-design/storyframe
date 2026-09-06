"use client";

import {useEffect,useMemo,useState} from "react";
import {BookOpen,ChevronRight,Clapperboard,Copy,Download,ImageIcon,Library,Loader2,MapPinned,Plus,RefreshCw,Sparkles,Upload,Users} from "lucide-react";
import {parseJsonResponse} from "@/lib/fetch-json";
import {
  type AnalyzeChapterResponse,
  type CharacterReference,
  type LocationReference,
  type MangaChapter,
  type MangaProject,
  type MangaScene,
  type MangaStudioState,
  buildCanonicalScenePrompt,
  createChapter,
  createInitialState,
  createProject,
  hashString,
  loadStudioState,
  mergeCharacterReferences,
  mergeLocationReferences,
  normalizeName,
  saveStudioState
} from "@/lib/manga-studio";

function copyText(text:string){
  void navigator.clipboard?.writeText(text);
}

function downloadDataUrl(dataUrl:string,fileName:string){
  const anchor=document.createElement("a");
  anchor.href=dataUrl;
  anchor.download=fileName;
  anchor.click();
}

function rebuildPrompt(scene:MangaScene,project:MangaProject){
  const charRefs=scene.characterNames.map((name)=>project.characters.find((item)=>normalizeName(item.name)===normalizeName(name))).filter(Boolean) as CharacterReference[];
  const locRefs=scene.locationNames.map((name)=>project.locations.find((item)=>normalizeName(item.name)===normalizeName(name))).filter(Boolean) as LocationReference[];
  const charBlock=charRefs.length?`\n\nLOCKED CHARACTER REFERENCES — reuse exactly:\n${charRefs.map((item)=>`${item.name}: ${item.referencePrompt}`).join("\n")}`:"";
  const locBlock=locRefs.length?`\n\nLOCKED LOCATION REFERENCES — reuse exactly:\n${locRefs.map((item)=>`${item.name}: ${item.referencePrompt}`).join("\n")}`:"";
  return `${scene.baseImagePrompt}${charBlock}${locBlock}\n\nContinuity rules: same face, hair, eyes, outfit, body silhouette, architecture, palette and recurring props as the locked references. cinematic composition, clean anatomy, detailed hands, no text, no logo, no watermark.`;
}

function mutateProjectState(state:MangaStudioState,projectId:string,updater:(project:MangaProject)=>MangaProject){
  return {...state,projects:state.projects.map((project)=>project.id===projectId?updater(project):project)};
}

export function MangaContinuityStudio(){
  const [state,setState]=useState<MangaStudioState>(()=>createInitialState());
  const [hydrated,setHydrated]=useState(false);
  const [view,setView]=useState<"workspace"|"library">("workspace");
  const [libraryTab,setLibraryTab]=useState<"characters"|"locations">("characters");
  const [createOpen,setCreateOpen]=useState(false);
  const [newProjectName,setNewProjectName]=useState("");
  const [targetScenes,setTargetScenes]=useState(8);
  const [analyzing,setAnalyzing]=useState(false);
  const [generatingAll,setGeneratingAll]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    let cancelled=false;
    loadStudioState().then((saved)=>{
      if(!cancelled&&saved?.projects?.length) setState(saved);
    }).catch(console.error).finally(()=>{if(!cancelled)setHydrated(true)});
    return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    if(!hydrated) return;
    const timer=setTimeout(()=>{void saveStudioState(state).catch(console.error)},350);
    return()=>clearTimeout(timer);
  },[state,hydrated]);

  const activeProject=useMemo(()=>state.projects.find((project)=>project.id===state.activeProjectId)||state.projects[0],[state]);
  const activeChapter=useMemo(()=>activeProject?.chapters.find((chapter)=>chapter.id===activeProject.activeChapterId)||activeProject?.chapters[0],[activeProject]);

  if(!activeProject||!activeChapter) return <div className="p-10 text-zinc-400">Loading project…</div>;

  const updateActiveProject=(updater:(project:MangaProject)=>MangaProject)=>{
    setState((current)=>mutateProjectState(current,activeProject.id,updater));
  };

  const updateActiveChapter=(updater:(chapter:MangaChapter)=>MangaChapter)=>{
    updateActiveProject((project)=>({...project,updatedAt:new Date().toISOString(),chapters:project.chapters.map((chapter)=>chapter.id===activeChapter.id?updater(chapter):chapter)}));
  };

  const createNewProject=()=>{
    const name=newProjectName.trim();
    if(!name) return;
    const project=createProject(name);
    setState((current)=>({activeProjectId:project.id,projects:[...current.projects,project]}));
    setNewProjectName("");
    setCreateOpen(false);
    setView("workspace");
  };

  const addChapter=()=>{
    updateActiveProject((project)=>{
      const chapter=createChapter(`Chapter ${project.chapters.length+1}`);
      return {...project,activeChapterId:chapter.id,chapters:[...project.chapters,chapter],updatedAt:new Date().toISOString()};
    });
    setView("workspace");
  };

  const analyzeChapter=async()=>{
    if(activeChapter.story.trim().length<20){setError("Paste a longer chapter before analysis.");return}
    setAnalyzing(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/manga/analyze",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          projectName:activeProject.name,
          chapterTitle:activeChapter.title,
          story:activeChapter.story,
          existingCharacters:activeProject.characters,
          existingLocations:activeProject.locations,
          targetScenes
        })
      });
      const data=await parseJsonResponse<AnalyzeChapterResponse&{warning?:string}>(response);
      const mergedCharacters=mergeCharacterReferences(activeProject.characters,data.characters,activeChapter.id);
      const mergedLocations=mergeLocationReferences(activeProject.locations,data.locations,activeChapter.id);
      const scenes:MangaScene[]=data.scenes.map((scene,index)=>{
        const continuity=buildCanonicalScenePrompt({scene,sceneNumber:index+1,projectId:activeProject.id,chapterId:activeChapter.id,characters:mergedCharacters,locations:mergedLocations});
        return {
          id:`scene-${activeChapter.id}-${index+1}-${Date.now().toString(36)}`,
          sceneNumber:index+1,
          title:scene.title,
          sourceText:scene.sourceText,
          description:scene.description,
          characterNames:scene.characterNames,
          locationNames:scene.locationNames,
          cameraShot:scene.cameraShot,
          baseImagePrompt:scene.imagePrompt,
          imagePrompt:continuity.prompt,
          narrationScript:scene.narrationScript,
          seed:continuity.seed,
          status:"idle"
        };
      });
      updateActiveProject((project)=>({
        ...project,
        characters:mergedCharacters,
        locations:mergedLocations,
        updatedAt:new Date().toISOString(),
        chapters:project.chapters.map((chapter)=>chapter.id===activeChapter.id?{...chapter,summary:data.summary,scenes,analysisProvider:data.provider,updatedAt:new Date().toISOString()}:chapter)
      }));
      setNotice(data.warning||`Analyzed with ${data.provider}. Added ${Math.max(0,mergedCharacters.length-activeProject.characters.length)} new characters and ${Math.max(0,mergedLocations.length-activeProject.locations.length)} new locations.`);
    }catch(value){
      setError(value instanceof Error?value.message:"Chapter analysis failed");
    }finally{setAnalyzing(false)}
  };

  const generateSceneImage=async(sceneId:string,newSeed=false)=>{
    const scene=activeChapter.scenes.find((item)=>item.id===sceneId);
    if(!scene) return;
    const seed=newSeed?hashString(`${scene.seed}|${Date.now()}|${Math.random()}`):scene.seed;
    updateActiveChapter((chapter)=>({...chapter,scenes:chapter.scenes.map((item)=>item.id===sceneId?{...item,seed,status:"generating",error:undefined}:item)}));
    try{
      const response=await fetch("/api/manga/image",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:scene.imagePrompt,seed,width:1024,height:576})
      });
      const data=await parseJsonResponse<{imageDataUrl:string;model:string;seed:number}>(response);
      updateActiveChapter((chapter)=>({...chapter,scenes:chapter.scenes.map((item)=>item.id===sceneId?{...item,imageDataUrl:data.imageDataUrl,imageModel:data.model,seed:data.seed,status:"complete",error:undefined}:item)}));
    }catch(value){
      const message=value instanceof Error?value.message:"Image generation failed";
      updateActiveChapter((chapter)=>({...chapter,scenes:chapter.scenes.map((item)=>item.id===sceneId?{...item,status:"error",error:message}:item)}));
    }
  };

  const generateAllImages=async()=>{
    setGeneratingAll(true);
    for(const scene of activeChapter.scenes){
      await generateSceneImage(scene.id,false);
    }
    setGeneratingAll(false);
  };

  const updateCharacter=(id:string,patch:Partial<CharacterReference>)=>{
    updateActiveProject((project)=>{
      const characters=project.characters.map((item)=>item.id===id?{...item,...patch,updatedAt:new Date().toISOString()}:item);
      const draft={...project,characters};
      return {...draft,chapters:draft.chapters.map((chapter)=>({...chapter,scenes:chapter.scenes.map((scene)=>scene.characterNames.some((name)=>normalizeName(name)===normalizeName(characters.find((item)=>item.id===id)?.name||""))?{...scene,imagePrompt:rebuildPrompt(scene,draft),imageDataUrl:undefined,status:"idle",error:undefined}:scene)}))};
    });
  };

  const updateLocation=(id:string,patch:Partial<LocationReference>)=>{
    updateActiveProject((project)=>{
      const locations=project.locations.map((item)=>item.id===id?{...item,...patch,updatedAt:new Date().toISOString()}:item);
      const draft={...project,locations};
      return {...draft,chapters:draft.chapters.map((chapter)=>({...chapter,scenes:chapter.scenes.map((scene)=>scene.locationNames.some((name)=>normalizeName(name)===normalizeName(locations.find((item)=>item.id===id)?.name||""))?{...scene,imagePrompt:rebuildPrompt(scene,draft),imageDataUrl:undefined,status:"idle",error:undefined}:scene)}))};
    });
  };

  const uploadCharacterImage=(characterId:string,file:File|undefined)=>{
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{if(typeof reader.result==="string")updateCharacter(characterId,{manualReferenceImage:reader.result})};
    reader.readAsDataURL(file);
  };

  const exportProject=()=>{
    const blob=new Blob([JSON.stringify(activeProject,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download=`${activeProject.name.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}-continuity.json`;anchor.click();URL.revokeObjectURL(url);
  };

  return <div className="min-h-screen bg-[#07080b] text-zinc-100 lg:grid lg:grid-cols-[310px_1fr]">
    <aside className="border-b border-white/10 bg-[#0c0e14] p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 px-2 py-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500"><Sparkles size={19}/></div>
        <div><div className="font-black">StoryFrame Continuity</div><div className="text-xs text-zinc-500">Manga & Webtoon Studio</div></div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-4">
        <div className="text-[11px] font-bold uppercase tracking-[.18em] text-zinc-500">Project</div>
        <select value={activeProject.id} onChange={(event)=>setState((current)=>({...current,activeProjectId:event.target.value}))} className="mt-3 w-full rounded-xl border border-white/10 bg-[#11141c] px-3 py-2.5 text-sm outline-none">
          {state.projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <button onClick={()=>setCreateOpen(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-3 py-2.5 text-sm font-bold hover:bg-violet-400"><Plus size={15}/> Create New Project</button>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between px-2"><div className="text-[11px] font-bold uppercase tracking-[.18em] text-zinc-500">Chapters</div><button onClick={addChapter} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><Plus size={15}/></button></div>
        <div className="mt-2 space-y-1">
          {activeProject.chapters.map((chapter)=><button key={chapter.id} onClick={()=>{updateActiveProject((project)=>({...project,activeChapterId:chapter.id}));setView("workspace")}} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${chapter.id===activeChapter.id?"bg-violet-500/15 text-violet-200":"text-zinc-400 hover:bg-white/5 hover:text-white"}`}><span className="flex items-center gap-2"><BookOpen size={14}/>{chapter.title}</span><ChevronRight size={14}/></button>)}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.02] p-3">
        <button onClick={()=>{setView("library");setLibraryTab("characters")}} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-white/5"><span className="flex items-center gap-2"><Users size={15}/> Characters</span><span className="rounded-full bg-white/8 px-2 py-0.5 text-xs">{activeProject.characters.length}</span></button>
        <button onClick={()=>{setView("library");setLibraryTab("locations")}} className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-white/5"><span className="flex items-center gap-2"><MapPinned size={15}/> Places</span><span className="rounded-full bg-white/8 px-2 py-0.5 text-xs">{activeProject.locations.length}</span></button>
        <button onClick={()=>setView("workspace")} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-white/5"><Clapperboard size={15}/> Chapter Workspace</button>
      </div>

      <button onClick={exportProject} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5"><Download size={15}/> Export Project JSON</button>
    </aside>

    <main className="min-w-0">
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-white/10 bg-[#08090d]/85 px-4 py-3 backdrop-blur-xl md:px-7">
        <div><div className="font-bold">{activeProject.name}</div><div className="text-xs text-zinc-500">{activeChapter.title} · {activeProject.characters.length} characters · {activeProject.locations.length} places</div></div>
        <div className="hidden items-center gap-2 text-xs text-emerald-400 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-400"/> Cross-chapter continuity active</div>
      </header>

      <div className="mx-auto max-w-7xl p-4 md:p-7">
        {error&&<div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {notice&&<div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}

        {view==="workspace"?<>
          <section className="rounded-3xl border border-white/10 bg-[#10131b] p-5 shadow-2xl md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div><div className="text-xs font-bold uppercase tracking-[.2em] text-violet-400">Chapter Workspace</div><input value={activeChapter.title} onChange={(event)=>updateActiveChapter((chapter)=>({...chapter,title:event.target.value,updatedAt:new Date().toISOString()}))} className="mt-2 w-full bg-transparent text-2xl font-black outline-none md:text-3xl"/><p className="mt-2 text-sm text-zinc-500">Existing Project Reference Library is automatically included when this chapter is analyzed.</p></div>
              <div className="flex gap-2"><select value={targetScenes} onChange={(event)=>setTargetScenes(Number(event.target.value))} className="rounded-xl border border-white/10 bg-[#0a0c11] px-3 py-2.5 text-sm">{[4,6,8,10,12,16,20].map((value)=><option key={value} value={value}>{value} scenes</option>)}</select><button onClick={analyzeChapter} disabled={analyzing} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold hover:bg-violet-400 disabled:opacity-50">{analyzing?<Loader2 className="animate-spin" size={16}/>:<Sparkles size={16}/>} Generate Scenes & Auto-Extract References</button></div>
            </div>
            <textarea value={activeChapter.story} onChange={(event)=>updateActiveChapter((chapter)=>({...chapter,story:event.target.value,updatedAt:new Date().toISOString()}))} placeholder="Paste Chapter 1, Chapter 2, or any story text here…" className="mt-6 min-h-[340px] w-full resize-y rounded-2xl border border-white/10 bg-black/25 p-5 text-sm leading-7 outline-none focus:border-violet-500/50"/>
            {activeChapter.summary&&<div className="mt-4 rounded-2xl border border-white/8 bg-white/[.025] p-4"><div className="text-xs font-bold uppercase tracking-wider text-zinc-500">AI Chapter Summary · {activeChapter.analysisProvider}</div><p className="mt-2 text-sm leading-6 text-zinc-300">{activeChapter.summary}</p></div>}
          </section>

          {activeChapter.scenes.length>0&&<div className="mt-7 flex items-center justify-between"><div><h2 className="text-2xl font-black">Scene Continuity Board</h2><p className="mt-1 text-sm text-zinc-500">Every prompt below has the exact current project reference tokens appended.</p></div><button onClick={generateAllImages} disabled={generatingAll} className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2.5 text-sm font-bold text-violet-200 hover:bg-violet-400/20 disabled:opacity-50">{generatingAll?<Loader2 className="animate-spin" size={16}/>:<ImageIcon size={16}/>} Generate All Images</button></div>}

          <div className="my-6 space-y-6">
            {activeChapter.scenes.map((scene)=><article key={scene.id} className="overflow-hidden rounded-3xl border border-white/10 bg-[#10131b] shadow-xl">
              <div className="grid gap-0 xl:grid-cols-[1.15fr_.85fr]">
                <div className="p-5 md:p-6">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-300">SCENE {scene.sceneNumber}</span><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-400">{scene.cameraShot}</span><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-400">Seed #{scene.seed}</span>{scene.imageModel&&<span className="rounded-full bg-violet-400/10 px-3 py-1 text-xs text-violet-300">{scene.imageModel}</span>}</div>
                  <h3 className="mt-4 text-xl font-black md:text-2xl">{scene.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-500">{scene.description}</p>
                  <div className="mt-5 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/30">{scene.imageDataUrl?<img src={scene.imageDataUrl} alt={scene.title} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-zinc-600">{scene.status==="generating"?<Loader2 className="animate-spin" size={34}/>:<ImageIcon size={34}/>}</div>}</div>
                  {scene.error&&<div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-200">{scene.error}</div>}
                  <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void generateSceneImage(scene.id,Boolean(scene.imageDataUrl))} disabled={scene.status==="generating"} className="inline-flex items-center gap-2 rounded-xl bg-white/8 px-4 py-2.5 text-sm font-semibold hover:bg-white/12 disabled:opacity-50"><RefreshCw size={15}/>{scene.imageDataUrl?"Regenerate with New Seed":"Generate Image"}</button>{scene.imageDataUrl&&<button onClick={()=>downloadDataUrl(scene.imageDataUrl!,`scene-${String(scene.sceneNumber).padStart(3,"0")}.png`)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2.5 text-sm font-semibold text-cyan-300"><Download size={15}/> Download</button>}</div>
                </div>
                <div className="border-t border-white/10 bg-[#090b11] p-5 md:p-6 xl:border-l xl:border-t-0">
                  <div className="flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-[.15em] text-cyan-400">AI Image Prompt · Flux</div><button onClick={()=>copyText(scene.imagePrompt)} className="inline-flex items-center gap-2 rounded-lg bg-white/8 px-3 py-2 text-xs"><Copy size={13}/> Copy Prompt</button></div>
                  <textarea value={scene.imagePrompt} onChange={(event)=>updateActiveChapter((chapter)=>({...chapter,scenes:chapter.scenes.map((item)=>item.id===scene.id?{...item,imagePrompt:event.target.value,status:"idle",imageDataUrl:undefined}:item)}))} className="mt-3 min-h-[260px] w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-xs leading-6 text-zinc-300 outline-none"/>
                  <div className="mt-5 flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-[.15em] text-amber-400">Narration Script</div><button onClick={()=>copyText(scene.narrationScript)} className="inline-flex items-center gap-2 rounded-lg bg-white/8 px-3 py-2 text-xs"><Copy size={13}/> Copy Script</button></div>
                  <textarea value={scene.narrationScript} onChange={(event)=>updateActiveChapter((chapter)=>({...chapter,scenes:chapter.scenes.map((item)=>item.id===scene.id?{...item,narrationScript:event.target.value}:item)}))} className="mt-3 min-h-[150px] w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-zinc-300 outline-none"/>
                </div>
              </div>
            </article>)}
          </div>
        </>:<>
          <section className="rounded-3xl border border-white/10 bg-[#10131b] p-5 md:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-bold uppercase tracking-[.2em] text-violet-400">Global Project Reference Library</div><h1 className="mt-2 text-3xl font-black">Continuity Knowledge Base</h1><p className="mt-2 text-sm text-zinc-500">These references are reused across every chapter in {activeProject.name}.</p></div><div className="flex gap-2"><button onClick={()=>setLibraryTab("characters")} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${libraryTab==="characters"?"bg-violet-500":"bg-white/8"}`}>Characters ({activeProject.characters.length})</button><button onClick={()=>setLibraryTab("locations")} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${libraryTab==="locations"?"bg-violet-500":"bg-white/8"}`}>Places ({activeProject.locations.length})</button></div></div>
          </section>

          {libraryTab==="characters"?<div className="my-6 grid gap-5 xl:grid-cols-2">{activeProject.characters.map((character)=><article key={character.id} className="rounded-3xl border border-white/10 bg-[#10131b] p-5 md:p-6"><div className="flex gap-4"><div className="h-28 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30">{character.manualReferenceImage?<img src={character.manualReferenceImage} alt="" className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-zinc-600"><Users size={28}/></div>}</div><div className="min-w-0 flex-1"><input value={character.name} onChange={(event)=>updateCharacter(character.id,{name:event.target.value})} className="w-full bg-transparent text-xl font-black outline-none"/><div className="mt-2 text-xs text-zinc-500">Seed base #{character.seedBase}</div><label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white/8 px-3 py-2 text-xs"><Upload size={13}/> Upload Reference Image<input type="file" accept="image/*" className="hidden" onChange={(event)=>uploadCharacterImage(character.id,event.target.files?.[0])}/></label></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Eyes" value={character.eyeColor} onChange={(value)=>updateCharacter(character.id,{eyeColor:value})}/><Field label="Hair" value={character.hairColor} onChange={(value)=>updateCharacter(character.id,{hairColor:value})}/><Field label="Outfit" value={character.outfit} onChange={(value)=>updateCharacter(character.id,{outfit:value})}/><Field label="Key Features" value={character.keyFeatures.join(", ")} onChange={(value)=>updateCharacter(character.id,{keyFeatures:value.split(",").map((item)=>item.trim()).filter(Boolean)})}/></div>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-zinc-500">Visual Description</label><textarea value={character.visualDescription} onChange={(event)=>updateCharacter(character.id,{visualDescription:event.target.value})} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm outline-none"/>
            <div className="mt-4 flex items-center justify-between"><label className="text-xs font-bold uppercase tracking-wider text-violet-400">Locked Reference Token</label><button onClick={()=>copyText(character.referencePrompt)} className="inline-flex items-center gap-1 text-xs text-zinc-400"><Copy size={12}/> Copy</button></div><textarea value={character.referencePrompt} onChange={(event)=>updateCharacter(character.id,{referencePrompt:event.target.value,seedBase:hashString(`${character.name}|${event.target.value}`)})} className="mt-2 min-h-28 w-full rounded-xl border border-violet-400/20 bg-violet-400/5 p-3 text-sm leading-6 outline-none"/>
          </article>)}</div>:<div className="my-6 grid gap-5 xl:grid-cols-2">{activeProject.locations.map((location)=><article key={location.id} className="rounded-3xl border border-white/10 bg-[#10131b] p-5 md:p-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><MapPinned size={19}/></div><input value={location.name} onChange={(event)=>updateLocation(location.id,{name:event.target.value})} className="min-w-0 flex-1 bg-transparent text-xl font-black outline-none"/></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Architecture" value={location.architectureStyle} onChange={(value)=>updateLocation(location.id,{architectureStyle:value})}/><Field label="Lighting" value={location.lighting} onChange={(value)=>updateLocation(location.id,{lighting:value})}/><Field label="Color Palette" value={location.colorPalette} onChange={(value)=>updateLocation(location.id,{colorPalette:value})}/></div><div className="mt-4 flex items-center justify-between"><label className="text-xs font-bold uppercase tracking-wider text-cyan-400">Locked Environment Token</label><button onClick={()=>copyText(location.referencePrompt)} className="inline-flex items-center gap-1 text-xs text-zinc-400"><Copy size={12}/> Copy</button></div><textarea value={location.referencePrompt} onChange={(event)=>updateLocation(location.id,{referencePrompt:event.target.value})} className="mt-2 min-h-32 w-full rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-sm leading-6 outline-none"/></article>)}</div>}
        </>}
      </div>
    </main>

    {createOpen&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#11141b] p-6 shadow-2xl"><div className="text-xs font-bold uppercase tracking-[.2em] text-violet-400">Create Project</div><h2 className="mt-2 text-2xl font-black">New Manga / Webtoon Project</h2><input autoFocus value={newProjectName} onChange={(event)=>setNewProjectName(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter")createNewProject()}} placeholder="e.g. Manhwa Season 1" className="mt-5 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 outline-none"/><div className="mt-5 flex justify-end gap-2"><button onClick={()=>setCreateOpen(false)} className="rounded-xl px-4 py-2.5 text-sm text-zinc-400 hover:bg-white/5">Cancel</button><button onClick={createNewProject} className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold hover:bg-violet-400">Create Project</button></div></div></div>}
  </div>;
}

function Field({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
  return <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span><input value={value} onChange={(event)=>onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none"/></label>;
}
