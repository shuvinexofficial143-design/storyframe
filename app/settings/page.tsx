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
    <PageHeading eyebrow="Configuration" title="Settings & Export" description="Pollinations runs server-side. Flux is the default text-to-image model; scenes with locked character references first try the reference-capable consistency model."/>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck size={17}/> Provider configuration</div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Keep keys on the server only. Anonymous/public generation is attempted when no key is configured, subject to Pollinations availability and model access.</p>
        <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4 font-mono text-xs leading-6 text-zinc-400">POLLINATIONS_BASE_URL=https://gen.pollinations.ai<br/>POLLINATIONS_API_KEY=<br/>POLLINATIONS_TEXT_MODEL=openai<br/>POLLINATIONS_IMAGE_MODEL=flux<br/>POLLINATIONS_CONSISTENCY_MODEL=kontext<br/>POLLINATIONS_ANALYZE_TIMEOUT_MS=10000<br/>POLLINATIONS_IMAGE_TIMEOUT_MS=45000</div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><Sparkles size={17}/> Generation behavior</div>
        <div className="mt-4 space-y-3 text-sm text-zinc-400"><p><strong className="text-zinc-200">Flux:</strong> default scene and character-reference generation.</p><p><strong className="text-zinc-200">Kontext:</strong> attempted when a scene has reusable character reference URLs.</p><p><strong className="text-zinc-200">Fallback:</strong> if the reference-model request fails, the server retries Flux without references instead of returning a fake mock image.</p></div>
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
