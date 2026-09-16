export const MANGA_PACING_PRESETS=["Fast","Balanced","Cinematic"] as const;
export type MangaPacingPreset=(typeof MANGA_PACING_PRESETS)[number];

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

type PacingConfig={wordsPerBeat:number;momentMultiplier:number;minimumBeats:number;averagePanelsPerPage:number;minFactor:number;maxFactor:number};

const CONFIG:Record<MangaPacingPreset,PacingConfig>={
  Fast:{wordsPerBeat:14,momentMultiplier:1.1,minimumBeats:6,averagePanelsPerPage:4.2,minFactor:.8,maxFactor:1.25},
  Balanced:{wordsPerBeat:8,momentMultiplier:1.65,minimumBeats:10,averagePanelsPerPage:3.4,minFactor:.85,maxFactor:1.25},
  Cinematic:{wordsPerBeat:4,momentMultiplier:2.8,minimumBeats:14,averagePanelsPerPage:3.5,minFactor:.8,maxFactor:1.2}
};

function visualMomentCount(story:string){
  const normalized=story.replace(/\r/g,"").trim();
  if(!normalized)return 1;
  const sentenceMoments=normalized.split(/(?<=[.!?।…])\s+|\n+/).map((item)=>item.trim()).filter(Boolean).length;
  const dialogueMoments=(normalized.match(/["“][^"”\n]{2,}["”]/g)||[]).length;
  const explicitEffects=(normalized.match(/\b(?:BOOM|BAM|CRASH|SCREECH|THUD|BANG|FLASH)\b/gi)||[]).length;
  return Math.max(1,sentenceMoments+Math.ceil(dialogueMoments*.5)+explicitEffects);
}

export function estimateAdaptivePacing(story:string,preset:MangaPacingPreset="Balanced"){
  const config=CONFIG[preset];
  const words=story.trim().split(/\s+/).filter(Boolean).length;
  const moments=visualMomentCount(story);
  const wordTarget=Math.ceil(words/config.wordsPerBeat);
  const momentTarget=Math.ceil(moments*config.momentMultiplier);
  const targetBeats=clamp(Math.max(config.minimumBeats,wordTarget,momentTarget),4,300);
  const minBeats=clamp(Math.floor(targetBeats*config.minFactor),4,300);
  const maxBeats=clamp(Math.ceil(targetBeats*config.maxFactor),minBeats,300);
  const targetPages=clamp(Math.round(targetBeats/config.averagePanelsPerPage),1,100);
  const minPages=Math.max(1,Math.ceil(minBeats/5));
  const maxPages=Math.max(minPages,Math.ceil(maxBeats/3));
  return {preset,words,moments,targetBeats,minBeats,maxBeats,targetPages,minPages,maxPages,averagePanelsPerPage:config.averagePanelsPerPage};
}

export function pacingPrompt(preset:MangaPacingPreset,story:string){
  const estimate=estimateAdaptivePacing(story,preset);
  const detail=preset==="Cinematic"
    ?"HIGHEST beat detail. Separate establishing details, setup, action, reaction, impact, aftermath, reveals, object inserts and explicit transitions whenever the source supports them. Do not create filler or alternate camera-only duplicates of the same unchanged moment."
    :preset==="Balanced"
      ?"STANDARD beat detail. Keep meaningful actions, reactions, reveals and state changes separate, while combining tiny camera-only or atmospheric micro-moments that can naturally share one manga panel."
      :"LOW beat detail. Preserve the full chronology, important actions, reactions, dialogue turns and transitions, but combine minor atmosphere, repeated motion and small inserts when no important story state is lost.";
  return `PACING: ${preset}. Adaptive guidance for this chapter is roughly ${estimate.minBeats}-${estimate.maxBeats} visual beats (center ${estimate.targetBeats}), which is approximately ${estimate.minPages}-${estimate.maxPages} pages depending on panel rhythm. This is NOT a fixed quota: shorter/simple chapters may need fewer and longer/denser chapters may need more, up to the chapter safety limit. Never invent filler just to hit a number. ${detail}`;
}

export function partitionPagePanelCounts(totalBeats:number,preset:MangaPacingPreset="Balanced"){
  if(totalBeats<=0)return [];
  if(totalBeats<3)return [totalBeats];
  const average=CONFIG[preset].averagePanelsPerPage;
  const minPages=Math.ceil(totalBeats/5);
  const maxPages=Math.floor(totalBeats/3);
  const pageCount=clamp(Math.round(totalBeats/average),minPages,Math.max(minPages,maxPages));
  const base=Math.floor(totalBeats/pageCount);
  let remainder=totalBeats-(base*pageCount);
  const counts=Array.from({length:pageCount},()=>base);
  for(let index=0;index<counts.length&&remainder>0;index+=1,remainder-=1)counts[index]+=1;
  return counts;
}

export function partitionPlanningChunkCounts(totalBeats:number,preset:MangaPacingPreset="Balanced"){
  const pages=partitionPagePanelCounts(totalBeats,preset);
  const chunks:number[]=[];
  for(let index=0;index<pages.length;index+=2)chunks.push(pages[index]+(pages[index+1]||0));
  return chunks;
}
