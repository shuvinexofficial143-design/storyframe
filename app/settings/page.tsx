"use client";
import {Download,ShieldCheck,Sparkles} from "lucide-react";
import {useProject} from "@/components/project-provider";
import {Button,Card,PageHeading} from "@/components/ui";

export default function Settings(){
  const {project}=useProject();
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
    <PageHeading eyebrow="Configuration" title="Settings & Export" description="Gemini 3.1 Flash Lite Image is the preferred image-only provider. Story analysis remains on the existing StoryFrame pipeline. If Gemini image generation is unavailable, StoryFrame can fall back to Pollinations flux-anime."/>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck size={17}/> Provider configuration</div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Keep the Gemini API key server-side in Vercel Environment Variables. Never commit the real key to GitHub.</p>
        <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4 font-mono text-xs leading-6 text-zinc-400">STORYFRAME_DEFAULT_IMAGE_PROVIDER=gemini<br/>GEMINI_API_KEY=<br/>GEMINI_IMAGE_MODEL=gemini-3.1-flash-lite-image<br/><br/>POLLINATIONS_IMAGE_MODEL=flux-anime</div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><Sparkles size={17}/> Generation behavior</div>
        <div className="mt-4 space-y-3 text-sm text-zinc-400"><p><strong className="text-zinc-200">Gemini 3.1 Flash Lite Image:</strong> cheapest Gemini image model, used only for StoryFrame image generation.</p><p><strong className="text-zinc-200">Resolution:</strong> 1K output with StoryFrame requesting the scene aspect ratio such as 16:9.</p><p><strong className="text-zinc-200">Continuity:</strong> canonical character/world/location prompts and previous-scene text memory remain active.</p><p><strong className="text-zinc-200">Seed note:</strong> Gemini does not expose a deterministic image seed parameter, so StoryFrame keeps the scene seed as metadata/prompt anchor; Regenerate Same may not be pixel-identical.</p><p><strong className="text-zinc-200">Fallback:</strong> Pollinations flux-anime remains available if Gemini is not configured or a Gemini request fails.</p></div>
      </Card>
      <Card className="p-6">
        <div className="font-bold">Project export</div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Export story, cast, locations, prompts, seeds, providers, model names and timeline metadata.</p>
        <Button className="mt-5" onClick={download}><Download size={16}/> Export project JSON</Button>
      </Card>
      <Card className="p-6"><div className="text-sm font-bold">Content rights notice</div><p className="mt-2 text-sm leading-6 text-zinc-500">Only upload or generate from stories you own, are licensed to use, or are otherwise legally permitted to transform.</p></Card>
    </div>
  </>;
}
