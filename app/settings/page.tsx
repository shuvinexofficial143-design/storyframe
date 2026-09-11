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
    <PageHeading eyebrow="Configuration" title="Settings & Export" description="Google Cloud Vertex AI Gemini 3.1 Flash Image is the preferred image-only provider so eligible Google Cloud billing credits can be used. Story analysis remains on the existing StoryFrame pipeline. Pollinations flux-anime remains the image fallback."/>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck size={17}/> Vertex AI configuration</div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">For production, use a Google Cloud service account with Vertex AI permission. StoryFrame exchanges the service-account credential for a short-lived OAuth token on the server. A Google Cloud authorization key bound to a service account is also supported for testing. Never commit credentials to GitHub.</p>
        <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4 font-mono text-xs leading-6 text-zinc-400">STORYFRAME_DEFAULT_IMAGE_PROVIDER=gemini<br/>VERTEX_AI_PROJECT_ID=<br/>VERTEX_AI_LOCATION=global<br/>VERTEX_AI_SERVICE_ACCOUNT_JSON=<br/>GEMINI_IMAGE_MODEL=gemini-3.1-flash-image<br/><br/># optional instead of service account JSON<br/>VERTEX_AI_API_KEY=<br/><br/>POLLINATIONS_IMAGE_MODEL=flux-anime</div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-2 font-bold"><Sparkles size={17}/> Generation behavior</div>
        <div className="mt-4 space-y-3 text-sm text-zinc-400"><p><strong className="text-zinc-200">Vertex AI Gemini 3.1 Flash Image:</strong> used only for StoryFrame image generation; story analysis is unchanged.</p><p><strong className="text-zinc-200">Google Cloud billing:</strong> requests go to <code className="text-zinc-300">aiplatform.googleapis.com</code>, not the Google AI Studio Gemini endpoint, so billing belongs to the configured Google Cloud project.</p><p><strong className="text-zinc-200">Reference continuity:</strong> recurring character references are sent first, then location/environment references, then the previous scene when available.</p><p><strong className="text-zinc-200">Resolution:</strong> 1K output with the requested scene aspect ratio such as 16:9.</p><p><strong className="text-zinc-200">Seed note:</strong> Gemini does not expose a deterministic image seed parameter, so StoryFrame keeps the scene seed as metadata/prompt anchor; Regenerate Same may not be pixel-identical.</p><p><strong className="text-zinc-200">Fallback:</strong> Pollinations flux-anime remains available if Vertex AI is not configured or a Vertex request fails.</p></div>
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
