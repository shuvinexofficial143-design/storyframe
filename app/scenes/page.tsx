"use client";
import {useState} from "react";
import {Images,Loader2,Lock} from "lucide-react";
import {useProject} from "@/components/project-provider";
import {SceneCard} from "@/components/scene-card";
import {parseJsonResponse} from "@/lib/fetch-json";
import {Button,Card,PageHeading} from "@/components/ui";

type GenerateResponse={image:string;sourceUrl?:string;provider:string;seed:number;prompt:string;model?:string;referenceCount?:number};

export default function Scenes(){
  const {project,updateScene}=useProject();
  const [busy,setBusy]=useState(false);
  const lockedReferences=project.characters.filter((character)=>character.locked&&character.referenceImageSourceUrl).length;

  const generateAll=async()=>{
    setBusy(true);
    try{
      for(const scene of project.scenes){
        updateScene(scene.id,{generationStatus:"generating",errorMessage:""});
        try{
          const characters=project.characters.filter((character)=>scene.characterIds.includes(character.id));
          const location=project.locations.find((value)=>value.id===scene.locationId);
          const sceneForRequest=scene.generatedImage?{...scene,generationSeed:Math.floor(Math.random()*8000000)+1000}:scene;
          const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scene:sceneForRequest,characters,location,visualStyle:project.visualStyle,aspectRatio:project.aspectRatio})});
          const data=await parseJsonResponse<GenerateResponse>(response);
          updateScene(scene.id,{generationStatus:"completed",generatedImage:data.image,generatedImageSourceUrl:data.sourceUrl,generationSeed:data.seed,generationModel:data.model,referenceCount:data.referenceCount,provider:data.provider,imagePrompt:data.prompt,errorMessage:""});
        }catch(error){
          updateScene(scene.id,{generationStatus:"failed",errorMessage:error instanceof Error?error.message:"Scene generation failed"});
        }
      }
    }finally{
      setBusy(false);
    }
  };

  return <>
    <PageHeading eyebrow="Step 4" title="Scene Generator" description="Flux generates normal scenes. When a scene contains characters with locked reference images, StoryFrame first tries the reference-capable consistency model and falls back to Flux only if that reference request fails." action={<Button onClick={generateAll} disabled={busy||!project.scenes.length}>{busy?<Loader2 className="animate-spin" size={16}/>:<Images size={16}/>} Generate all scenes</Button>}/>
    <Card className="mb-5 p-4"><div className="flex flex-wrap items-center gap-3 text-sm"><span className="flex items-center gap-2 text-zinc-300"><Lock size={15}/> Locked references: <strong>{lockedReferences}</strong></span><span className="text-zinc-500">For best consistency, generate and lock recurring characters before running the full batch.</span></div></Card>
    <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">{project.scenes.map((scene)=><SceneCard key={scene.id} scene={scene}/>)}{!project.scenes.length&&<Card className="p-8 text-sm text-zinc-500">No scenes yet. Analyze a story first.</Card>}</div>
  </>;
}
