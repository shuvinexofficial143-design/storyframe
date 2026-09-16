export const MANGA_PACING_PRESETS=["Fast","Balanced","Cinematic"] as const;
export type MangaPacingPreset=(typeof MANGA_PACING_PRESETS)[number];

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

const CONFIG:Record<MangaPacingPreset,{wordsPerBeat:number;momentMultiplier:number;minimumBeats:number;averagePanelsPerPage:number}>={
  Fast:{wordsPerBeat:17,momentMultiplier:1.15,minimumBeats:6,averagePanelsPerPage:4.65},
  Balanced:{wordsPerBeat:12,momentMultiplier:1.45,minimumBeats:8,averagePanelsPerPage:4},
  Cinematic:{wordsPerBeat:8,momentMultiplier:1.8,minimumBeats:10,averagePanelsPerPage:3.4}
};

function visualMomentCount(story:string){
  const normalized=story.replace(/\r/g,"").trim();
  if(!normalized)return 1;
  const sentenceMoments=normalized.split(/(?<=[.!?।…])\s+|\n+/).map((item)=>item.trim()).filter(Boolean).length;
  const dialogueMoments=(normalized.match(/["“][^"”\n]{2,}["”]/g)||[]).length;
  const explicitEffects=(normalized.match(/\b(?:BOOM|BAM|CRASH|SCREECH|THUD|BANG|FLASH)\b/gi)||[]).length;
  return Math.max(1,sentenceMoments+Math.ceil(dialogueMoments*.5)+explicitEffects);
}

export function estimateAdaptivePacing(story:string,preset:MangaPacingPreset="Cinematic"){
  const config=CONFIG[preset];
  const words=story.trim().split(/\s+/).filter(Boolean).length;
  const moments=visualMomentCount(story);
  const wordTarget=Math.ceil(words/config.wordsPerBeat);
  const momentTarget=Math.ceil(moments*config.momentMultiplier);
  const targetBeats=clamp(Math.max(config.minimumBeats,wordTarget,momentTarget),4,300);
  const minBeats=clamp(Math.floor(targetBeats*.88),4,300);
  const maxBeats=clamp(Math.ceil(targetBeats*1.14),minBeats,300);
  const targetPages=clamp(Math.round(targetBeats/config.averagePanelsPerPage),1,100);
  const minPages=Math.max(1,Math.ceil(minBeats/5));
  const maxPages=Math.max(minPages,Math.ceil(maxBeats/3));
  return {preset,words,moments,targetBeats,minBeats,maxBeats,targetPages,minPages,maxPages,averagePanelsPerPage:config.averagePanelsPerPage};
}

export function pacingPrompt(preset:MangaPacingPreset,story:string){
  const estimate=estimateAdaptivePacing(story,preset);
  const detail=preset==="Cinematic"
    ?"Preserve setup, action, reaction, impact and aftermath as separate visual beats whenever the source supports them. Give reveals, emotional reactions, object inserts and explicit transitions room to breathe."
    :preset==="Balanced"
      ?"Keep all meaningful actions and reactions separate, but combine only minor atmospheric moments when doing so does not hide a visible state change."
      :"Keep the full chronology and important reactions, while combining minor atmosphere or repeated motion when that does not remove story information.";
  return `PACING: ${preset}. Adaptive guidance for this chapter is roughly ${estimate.minBeats}-${estimate.maxBeats} visual beats (center ${estimate.targetBeats}), which is approximately ${estimate.minPages}-${estimate.maxPages} pages depending on panel rhythm. This is NOT a fixed quota: shorter/simple chapters may need fewer and longer/denser chapters may need more, up to the chapter safety limit. Never invent filler just to hit a number. ${detail}`;
}

export function partitionPagePanelCounts(totalBeats:number,preset:MangaPacingPreset="Cinematic"){
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

export function partitionPlanningChunkCounts(totalBeats:number,preset:MangaPacingPreset="Cinematic"){
  const pages=partitionPagePanelCounts(totalBeats,preset);
  const chunks:number[]=[];
  for(let index=0;index<pages.length;index+=2)chunks.push(pages[index]+(pages[index+1]||0));
  return chunks;
}
