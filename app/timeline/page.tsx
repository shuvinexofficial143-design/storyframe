"use client";
import {useProject} from "@/components/project-provider";
import {Badge,Card,PageHeading} from "@/components/ui";

export default function Timeline(){
  const {project,updateScene}=useProject();
  const total=project.scenes.reduce((sum,scene)=>sum+scene.duration,0);
  return <>
    <PageHeading eyebrow="Step 6" title="Timeline" description={`Estimated visual runtime: ${total} seconds. Adjust how long each generated image stays on screen.`}/>
    <Card className="overflow-x-auto p-5">
      <div className="flex min-w-max gap-2">
        {project.scenes.map((scene)=><div key={scene.id} className="w-48 rounded-xl border border-white/10 bg-white/[.03] p-3">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-black/30">{scene.generatedImage&&<img src={scene.generatedImage} alt={`Scene ${scene.sceneNumber}`} className="h-full w-full object-cover"/>}{scene.generationModel&&<div className="absolute right-1 top-1"><Badge>{scene.generationModel}</Badge></div>}</div>
          <div className="mt-2 text-xs font-bold">Scene {scene.sceneNumber}</div>
          <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-500">{scene.description}</div>
          <input type="range" min="2" max="10" value={scene.duration} onChange={(event)=>updateScene(scene.id,{duration:Number(event.target.value)})} className="mt-3 w-full"/>
          <div className="text-[11px] text-zinc-500">{scene.duration} seconds</div>
        </div>)}
      </div>
    </Card>
  </>;
}
