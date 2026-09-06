"use client";
import {useMemo,useState} from "react";
import {FileText,Loader2,Sparkles} from "lucide-react";
import {useProject} from "@/components/project-provider";
import {sampleStory} from "@/lib/default-project";
import {parseJsonResponse} from "@/lib/fetch-json";
import type {Character,Location,Scene} from "@/lib/types";
import {Button,Card,PageHeading} from "@/components/ui";

type AnalyzeResponse={summary:string;characters:Character[];locations:Location[];scenes:Scene[];analysisProvider?:string;imageProvider?:string};

export default function Story(){
  const {project,updateProject,replaceAnalysis}=useProject();
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const words=useMemo(()=>project.story.trim()?project.story.trim().split(/\s+/).length:0,[project.story]);

  const analyze=async()=>{
    if(!project.story.trim()) return;
    setLoading(true);
    setError("");
    try{
      const response=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({story:project.story,visualStyle:project.visualStyle})});
      const data=await parseJsonResponse<AnalyzeResponse>(response);
      replaceAnalysis(data);
    }catch(error){
      setError(error instanceof Error?error.message:"Story analysis failed");
    }finally{
      setLoading(false);
    }
  };

  return <>
    <PageHeading eyebrow="Step 1" title="Paste your story" description="Paste a complete chapter or narration. StoryFrame tries Pollinations AI first and automatically falls back to fast local scene breakdown if the analysis request times out." action={<Button onClick={analyze} disabled={loading||!project.story.trim()}>{loading?<Loader2 className="animate-spin" size={16}/>:<Sparkles size={16}/>} Analyze story</Button>}/>
    {error&&<Card className="mb-5 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</Card>}
    <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
      <Card className="p-4"><textarea className="min-h-[560px] w-full resize-y rounded-xl border border-white/8 bg-black/25 p-5 text-sm leading-7 outline-none" placeholder="Paste your chapter here..." value={project.story} onChange={(event)=>updateProject({story:event.target.value})}/></Card>
      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex items-center gap-2 font-bold"><FileText size={17}/> Story stats</div>
          <div className="mt-5 grid gap-3 text-sm">
            <div className="flex justify-between"><span className="text-zinc-500">Words</span><span>{words}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Est. narration</span><span>{Math.max(1,Math.ceil(words/140))} min</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Est. scenes</span><span>{Math.max(0,Math.ceil(words/35))}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Analysis provider</span><span>{project.analysisProvider||"unknown"}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Current scenes</span><span>{project.scenes.length}</span></div>
          </div>
          <Button variant="secondary" className="mt-5 w-full" onClick={()=>updateProject({story:sampleStory})}>Load demo story</Button>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-bold">Visual preset</div>
          <select value={project.visualStyle} onChange={(event)=>updateProject({visualStyle:event.target.value})} className="mt-3 w-full rounded-xl border border-white/10 bg-[#0d0f14] px-3 py-2.5 text-sm">
            <option>Cinematic Film (Ultra-Photorealistic)</option>
            <option>Chinese Cultivation Fantasy</option>
            <option>Cinematic Anime Realism</option>
            <option>Dark Fantasy</option>
            <option>Manhwa</option>
            <option>Photorealistic</option>
          </select>
          <p className="mt-3 text-xs leading-5 text-zinc-500">Image prompts are generated in English for better image-model results even when the story is in Hindi.</p>
        </Card>
      </div>
    </div>
  </>;
}
