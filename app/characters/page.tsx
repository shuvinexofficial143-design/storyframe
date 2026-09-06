"use client";
import {useState} from "react";
import {ImageIcon,Loader2,Lock,LockOpen,Sparkles,UserRound} from "lucide-react";
import {useProject} from "@/components/project-provider";
import {parseJsonResponse} from "@/lib/fetch-json";
import {Badge,Button,Card,PageHeading} from "@/components/ui";

type CharacterReferenceResponse={image:string;sourceUrl?:string;provider:string;seed:number;prompt:string;model?:string};

export default function Characters(){
  const {project,updateCharacter}=useProject();
  const [loading,setLoading]=useState<Record<string,boolean>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});

  const generateReference=async(characterId:string)=>{
    const character=project.characters.find((value)=>value.id===characterId);
    if(!character) return;
    setLoading((current)=>({...current,[characterId]:true}));
    setErrors((current)=>({...current,[characterId]:""}));
    try{
      const response=await fetch("/api/characters/reference",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({character,visualStyle:project.visualStyle})});
      const data=await parseJsonResponse<CharacterReferenceResponse>(response);
      updateCharacter(characterId,{referenceImage:data.image,referenceImageSourceUrl:data.sourceUrl,referenceSeed:data.seed,referencePrompt:data.prompt});
    }catch(error){
      setErrors((current)=>({...current,[characterId]:error instanceof Error?error.message:"Reference generation failed"}));
    }finally{
      setLoading((current)=>({...current,[characterId]:false}));
    }
  };

  return <>
    <PageHeading eyebrow="Step 2" title="Character Bible" description="Generate one clean Flux reference for each recurring character, then lock it. Locked reference URLs are reused by the consistency model in later scenes."/>
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {project.characters.map((character)=>{
        const isLoading=Boolean(loading[character.id]);
        const error=errors[character.id];
        return <Card key={character.id} className="overflow-hidden">
          <div className="relative grid h-56 place-items-center border-b border-white/8 bg-[radial-gradient(circle_at_center,rgba(139,92,246,.2),transparent_60%)]">
            {character.referenceImage?<img src={character.referenceImage} alt={`${character.name} reference`} className="h-full w-full object-cover"/>:<UserRound size={58} className="text-violet-300"/>}
            <div className="absolute left-3 top-3"><Badge>{character.referenceImage?"Reference ready":"No reference yet"}</Badge></div>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between gap-3"><div><div className="font-bold">{character.name}</div><div className="mt-1 text-xs text-zinc-500">{character.role}</div></div><Badge>{character.locked?"Locked":"Editable"}</Badge></div>
            <label className="mt-4 block text-xs text-zinc-500">Appearance</label>
            <textarea value={character.appearance} onChange={(event)=>updateCharacter(character.id,{appearance:event.target.value})} className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none"/>
            <label className="mt-3 block text-xs text-zinc-500">Outfit</label>
            <input value={character.outfit} onChange={(event)=>updateCharacter(character.id,{outfit:event.target.value})} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none"/>
            <label className="mt-3 block text-xs text-zinc-500">Consistency notes</label>
            <textarea value={character.consistencyNotes||""} onChange={(event)=>updateCharacter(character.id,{consistencyNotes:event.target.value})} placeholder="Example: long silver hair, jade eyes, narrow face, black robe; never change hair length or robe color." className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none"/>
            {error&&<div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-200">{error}</div>}
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" className="flex-1" disabled={isLoading} onClick={()=>generateReference(character.id)}>{isLoading?<Loader2 className="animate-spin" size={15}/>:<Sparkles size={15}/>} {character.referenceImage?"Regenerate reference":"Generate reference"}</Button>
              <Button variant={character.locked?"secondary":"primary"} className="flex-1" disabled={!character.referenceImage} onClick={()=>updateCharacter(character.id,{locked:!character.locked})}>{character.locked?<LockOpen size={15}/>:<Lock size={15}/>} {character.locked?"Unlock":"Lock"}</Button>
            </div>
            <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-6 text-zinc-400"><div className="flex items-center gap-2 font-semibold text-zinc-200"><ImageIcon size={14}/> Reference seed</div><div className="mt-1">{character.referenceSeed||"Generated with the first reference image."}</div></div>
          </div>
        </Card>;
      })}
      {project.characters.length===0&&<Card className="p-8 text-sm text-zinc-500">Analyze a story first. Extracted characters will appear here.</Card>}
    </div>
  </>;
}
