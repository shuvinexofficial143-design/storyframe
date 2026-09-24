"use client";
import {Download,Loader2,ShieldCheck,Sparkles,Trash2} from "lucide-react";
import {useEffect,useMemo,useState} from "react";
import {useProject} from "@/components/project-provider";
import {Button,Card,PageHeading} from "@/components/ui";
import {clearAllStudioProjects,clearProjectLocalKeys,deleteStudioProject,loadStudioState} from "@/lib/continuity/storage";
import type {MangaProject,MangaStudioState} from "@/lib/continuity/project-types";

function storedMediaIds(value:unknown){
  const ids=new Set<string>();
  const visit=(input:unknown)=>{
    if(typeof input==="string"){
      const matches=input.matchAll(/\/api\/media\/([a-f0-9]{24})/gi);
      for(const match of matches)ids.add(match[1]);
      return;
    }
    if(Array.isArray(input)){input.forEach(visit);return}
    if(input&&typeof input==="object")Object.values(input as Record<string,unknown>).forEach(visit);
  };
  visit(value);
  return [...ids];
}

function approximateProjectSize(project:MangaProject){
  try{
    const bytes=new Blob([JSON.stringify(project)]).size;
    if(bytes<1024)return bytes+" B";
    if(bytes<1024*1024)return (bytes/1024).toFixed(1)+" KB";
    return (bytes/1024/1024).toFixed(1)+" MB";
  }catch{return "Unknown"}
}

export default function Settings(){
  const {project}=useProject();
  const [studio,setStudio]=useState<MangaStudioState|null>(null);
  const [loading,setLoading]=useState(true);
  const [deleting,setDeleting]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const refresh=async()=>{
    setLoading(true);
    try{setStudio(await loadStudioState())}
    finally{setLoading(false)}
  };

  useEffect(()=>{void refresh()},[]);
  const mangaProjects=studio?.projects||[];
  const totalMedia=useMemo(()=>mangaProjects.reduce((sum,item)=>sum+storedMediaIds(item).length,0),[mangaProjects]);

  const deleteRemoteMedia=async(target:MangaProject|MangaProject[])=>{
    const ids=storedMediaIds(target);
    if(!ids.length)return 0;
    const response=await fetch("/api/media/bulk-delete",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids})});
    const data=await response.json().catch(()=>({})) as {deleted?:number;error?:string};
    if(!response.ok)throw new Error(data.error||"Stored image deletion failed.");
    return data.deleted||0;
  };

  const removeProject=async(target:MangaProject)=>{
    if(!confirm(`Delete "${target.name}" permanently? Its local project data and stored generated media will be removed.`))return;
    setDeleting(target.id);setError("");setNotice("");
    try{
      const mediaDeleted=await deleteRemoteMedia(target);
      clearProjectLocalKeys(target);
      const next=await deleteStudioProject(target.id);
      setStudio(next);
      window.dispatchEvent(new CustomEvent("storyframe:manga-projects-updated",{detail:{state:next}}));
      setNotice(`"${target.name}" deleted permanently. ${mediaDeleted} stored media file(s) removed.`);
    }catch(reason){setError(reason instanceof Error?reason.message:"Project deletion failed.")}
    finally{setDeleting("")}
  };

  const removeAll=async()=>{
    if(!mangaProjects.length)return;
    if(!confirm(`Delete ALL ${mangaProjects.length} Manga Studio projects permanently? This cannot be undone.`))return;
    setDeleting("all");setError("");setNotice("");
    try{
      const mediaDeleted=await deleteRemoteMedia(mangaProjects);
      mangaProjects.forEach(clearProjectLocalKeys);
      await clearAllStudioProjects();
      setStudio(null);
      window.dispatchEvent(new CustomEvent("storyframe:manga-projects-updated",{detail:{state:null}}));
      setNotice(`All Manga Studio projects deleted. ${mediaDeleted} stored media file(s) removed. A fresh empty project will be created when you return to Manga Studio.`);
    }catch(reason){setError(reason instanceof Error?reason.message:"Delete all failed.")}
    finally{setDeleting("")}
  };

  const download=()=>{
    const blob=new Blob([JSON.stringify(project,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;
    anchor.download="storyframe-project.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <>
    <PageHeading eyebrow="Configuration" title="Settings & Storage" description="Manage Manga Studio projects, local browser storage and generated media, plus provider configuration."/>
    {error&&<div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-200">{error}</div>}
    {notice&&<div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-200">{notice}</div>}

    <Card className="mb-5 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-black">Manga Studio Projects</div>
          <p className="mt-1 text-sm leading-6 text-zinc-400">Deleting a project removes it from this browser&apos;s IndexedDB and also deletes generated media referenced by that project from StoryFrame&apos;s MongoDB media storage.</p>
          <div className="mt-2 text-xs text-zinc-500">{mangaProjects.length} project(s) · {totalMedia} stored media reference(s)</div>
        </div>
        <button disabled={!!deleting||!mangaProjects.length} onClick={()=>void removeAll()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-200 disabled:opacity-40"><Trash2 size={15}/>{deleting==="all"?"Deleting…":"Delete All Projects"}</button>
      </div>

      <div className="mt-5 space-y-3">
        {loading?<div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="animate-spin" size={15}/> Loading projects…</div>:mangaProjects.length?mangaProjects.map((item)=>{
          const mediaCount=storedMediaIds(item).length;
          return <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-white/8 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="truncate font-bold">{item.name}</div><div className="mt-1 text-xs text-zinc-500">{item.chapters.length} chapter(s) · approx local JSON {approximateProjectSize(item)} · {mediaCount} remote media file(s)</div></div>
            <button disabled={!!deleting} onClick={()=>void removeProject(item)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-40">{deleting===item.id?<Loader2 className="animate-spin" size={13}/>:<Trash2 size={13}/>} Delete Permanently</button>
          </div>;
        }):<div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">No saved Manga Studio projects.</div>}
      </div>
      <p className="mt-4 text-xs leading-5 text-zinc-500">Note: browser cache created by Chrome itself is managed by Chrome. StoryFrame project records, project-specific local keys and MongoDB media references are removed here. A blank project may be created automatically when Manga Studio opens again.</p>
    </Card>

    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck size={17}/> Provider configuration</div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Image generation, story analysis and Narration TTS remain isolated. Keep credentials server-side and never commit them to GitHub.</p>
        <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4 font-mono text-xs leading-6 text-zinc-400">GEMINI_API_KEY=<br/>GEMINI_IMAGE_MODEL=<br/><br/>VERTEX_AI_PROJECT_ID=<br/>GEMINI_STORY_MODEL=<br/><br/>NARRATION_TTS_SERVICE_ACCOUNT_JSON=<br/>NARRATION_TTS_MODEL=gemini-3.1-flash-tts-preview</div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><Sparkles size={17}/> Generation behavior</div>
        <div className="mt-4 space-y-3 text-sm text-zinc-400"><p><strong className="text-zinc-200">Images:</strong> manga page generation remains independent from narration TTS.</p><p><strong className="text-zinc-200">Narration:</strong> explainer, audio and video sync use the dedicated narration flow.</p><p><strong className="text-zinc-200">Local storage:</strong> Manga Studio project state is stored in this browser&apos;s IndexedDB so deleting it here frees StoryFrame&apos;s local project data.</p></div>
      </Card>
      <Card className="p-6">
        <div className="font-bold">Legacy project export</div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Export the older legacy workspace project JSON.</p>
        <Button className="mt-5" onClick={download}><Download size={16}/> Export legacy project JSON</Button>
      </Card>
      <Card className="p-6"><div className="text-sm font-bold">Content rights notice</div><p className="mt-2 text-sm leading-6 text-zinc-500">Only upload or generate from stories you own, are licensed to use, or are otherwise legally permitted to transform.</p></Card>
    </div>
  </>;
}
