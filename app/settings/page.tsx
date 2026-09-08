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
    <PageHeading eyebrow="Configuration" title="Settings & Export" description="Cloudflare Workers AI is the preferred image provider. If it is unavailable or not configured, StoryFrame automatically falls back to Pollinations public flux-anime generation."/>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck size={17}/> Provider configuration</div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Keep Cloudflare and Pollinations credentials server-side in Vercel Environment Variables. Never commit real API tokens to GitHub.</p>
        <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4 font-mono text-xs leading-6 text-zinc-400">STORYFRAME_DEFAULT_IMAGE_PROVIDER=cloudflare<br/>CLOUDFLARE_ACCOUNT_ID=<br/>CLOUDFLARE_API_TOKEN=<br/>CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-2-klein-9b<br/><br/>POLLINATIONS_BASE_URL=https://gen.pollinations.ai<br/>POLLINATIONS_API_KEY=<br/>POLLINATIONS_TEXT_MODEL=openai<br/>POLLINATIONS_IMAGE_MODEL=flux-anime</div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><Sparkles size={17}/> Generation behavior</div>
        <div className="mt-4 space-y-3 text-sm text-zinc-400"><p><strong className="text-zinc-200">Cloudflare FLUX.2 klein 9B:</strong> primary scene generation with deterministic seeds and up to four resized reference images.</p><p><strong className="text-zinc-200">Reference priority:</strong> recurring character references first, then environment references, then previous-scene continuity.</p><p><strong className="text-zinc-200">Pollinations flux-anime:</strong> automatic public text-to-image fallback when Cloudflare is unavailable.</p><p><strong className="text-zinc-200">Continuity:</strong> Visual Bible, canonical prompts, master seed and previous-scene memory remain active regardless of provider.</p></div>
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
