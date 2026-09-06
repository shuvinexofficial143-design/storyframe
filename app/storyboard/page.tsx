"use client";
import {useProject} from "@/components/project-provider";
import {Badge,Card,PageHeading} from "@/components/ui";

export default function Storyboard(){
  const {project}=useProject();
  const completed=project.scenes.filter((scene)=>scene.generationStatus==="completed").length;
  return <>
    <PageHeading eyebrow="Step 5" title="Storyboard" description={`Review the whole chapter visually. ${completed}/${project.scenes.length} scenes currently have generated images.`}/>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {project.scenes.map((scene)=><Card key={scene.id} className="overflow-hidden">
        <div className="relative aspect-video bg-black/30">
          {scene.generatedImage?<img src={scene.generatedImage} alt={`Scene ${scene.sceneNumber}`} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-2xl font-black text-zinc-700">{String(scene.sceneNumber).padStart(2,"0")}</div>}
          {scene.generationModel&&<div className="absolute right-2 top-2"><Badge>{scene.generationModel}</Badge></div>}
        </div>
        <div className="p-3"><div className="text-xs font-bold">Scene {scene.sceneNumber}</div><div className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500">{scene.description}</div><div className="mt-2 text-[10px] text-zinc-600">{scene.duration}s · {scene.referenceCount||0} reference images</div></div>
      </Card>)}
    </div>
  </>;
}
