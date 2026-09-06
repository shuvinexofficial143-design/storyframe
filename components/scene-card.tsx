"use client";
import {ImageIcon,Loader2,RefreshCw} from "lucide-react";
import type {Scene} from "@/lib/types";
import {useProject} from "./project-provider";
import {Badge,Button,Card} from "./ui";

export function SceneCard({scene}:{scene:Scene}){
  const {project,updateScene}=useProject();

  const generate=async()=>{
    updateScene(scene.id,{generationStatus:"generating"});
    try{
      const characters=project.characters.filter((character)=>scene.characterIds.includes(character.id));
      const location=project.locations.find((value)=>value.id===scene.locationId);
      const response=await fetch('/api/generate',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({scene,characters,location,visualStyle:project.visualStyle,aspectRatio:project.aspectRatio})
      });
      if(!response.ok) throw new Error();
      const data=await response.json();
      updateScene(scene.id,{generationStatus:"completed",generatedImage:data.image,generationSeed:data.seed,provider:data.provider,imagePrompt:data.prompt});
    }catch(error){
      console.error(error);
      updateScene(scene.id,{generationStatus:"failed"});
    }
  };

  return <Card className="overflow-hidden">
    <div className="relative aspect-video border-b border-white/8 bg-black/30">
      {scene.generatedImage?
        <img src={scene.generatedImage} alt={`Scene ${scene.sceneNumber}`} className="h-full w-full object-cover"/>:
        <div className="grid h-full place-items-center text-zinc-600"><ImageIcon size={34}/></div>
      }
      <div className="absolute left-3 top-3"><Badge>Scene {String(scene.sceneNumber).padStart(3,'0')}</Badge></div>
      {scene.provider&&<div className="absolute right-3 top-3"><Badge>{scene.provider}</Badge></div>}
    </div>

    <div className="p-5">
      <div className="flex flex-wrap gap-2">
        <Badge>{scene.cameraShot}</Badge>
        <Badge>{scene.cameraAngle}</Badge>
        <Badge>{scene.duration}s</Badge>
        {scene.generationSeed&&<Badge>Seed {scene.generationSeed}</Badge>}
      </div>

      <h3 className="mt-4 font-bold leading-6">{scene.description}</h3>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{scene.sourceText}</p>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-semibold text-violet-300">Final image prompt</summary>
        <textarea value={scene.imagePrompt} onChange={e=>updateScene(scene.id,{imagePrompt:e.target.value})} className="mt-3 min-h-32 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 outline-none"/>
      </details>

      <Button variant="secondary" className="mt-4 w-full" disabled={scene.generationStatus==="generating"} onClick={generate}>
        {scene.generationStatus==="generating"?<Loader2 className="animate-spin" size={15}/>:<RefreshCw size={15}/>} {scene.generatedImage?"Regenerate scene":"Generate scene"}
      </Button>
    </div>
  </Card>;
}
