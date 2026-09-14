import type {MangaChapterProduction,MangaPage,MangaPanel,MangaStoryBeat,StoryCoverageReport} from "./types";

const norm=(value:string)=>value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
const words=(value:string)=>new Set(norm(value).split(" ").filter((item)=>item.length>1));

function overlapRatio(a:string,b:string){
  const left=words(a);const right=words(b);if(!left.size||!right.size)return 0;
  let hits=0;for(const word of left)if(right.has(word))hits+=1;
  return hits/left.size;
}

export function calculateStoryCoverage(story:string,beats:MangaStoryBeat[],plannedBeatIds?:Set<string>):StoryCoverageReport{
  const covered=new Set<string>();
  for(const beat of beats){
    if(plannedBeatIds?.has(beat.id)){covered.add(beat.id);continue}
    if(beat.sourceText&&story.includes(beat.sourceText)){covered.add(beat.id);continue}
    if(overlapRatio(beat.sourceText,story)>.72)covered.add(beat.id);
  }
  const missing=beats.filter((beat)=>!covered.has(beat.id)).map((beat)=>({beatId:beat.id,storyBeat:beat.storyBeat,sourceText:beat.sourceText}));
  const percent=beats.length?Math.round((covered.size/beats.length)*100):0;
  return {percent,coveredBeatIds:[...covered],missingBeats:missing};
}

export function calculatePlannedCoverage(beats:MangaStoryBeat[],pages:MangaPage[]):StoryCoverageReport{
  const planned=new Set(pages.flatMap((page)=>page.panels.map((panel)=>panel.beatId)).filter(Boolean));
  const covered=beats.filter((beat)=>planned.has(beat.id));
  const missing=beats.filter((beat)=>!planned.has(beat.id)).map((beat)=>({beatId:beat.id,storyBeat:beat.storyBeat,sourceText:beat.sourceText}));
  return {percent:beats.length?Math.round((covered.length/beats.length)*100):0,coveredBeatIds:covered.map((beat)=>beat.id),missingBeats:missing};
}

export function previousPanelFor(production:MangaChapterProduction,page:MangaPage,panel:MangaPanel){
  const panelIndex=page.panels.findIndex((item)=>item.id===panel.id);
  if(panelIndex>0)return page.panels[panelIndex-1];
  const pageIndex=production.pages.findIndex((item)=>item.id===page.id);
  if(pageIndex>0)return production.pages[pageIndex-1].panels.at(-1);
  return undefined;
}

export function validatePanelContinuity(production:MangaChapterProduction,page:MangaPage,panel:MangaPanel,previous?:MangaPanel){
  const issues:string[]=[];
  if(!panel.storyBeat.trim())issues.push("Panel has no visible story beat.");
  if(!panel.action.trim())issues.push("Panel has no concrete visible action/reaction.");
  if(!panel.location.trim())issues.push("Panel location is missing.");
  if(panel.characters.length===0&&panel.action&&!/object|environment|room|building|landscape|door|photo|sword|phone/i.test(panel.action))issues.push("Panel has no character despite a character-like action.");
  if(previous){
    if(panel.beatId&&panel.beatId===previous.beatId)issues.push("Same story beat is repeated in consecutive panels.");
    if(previous.location&&panel.location&&previous.location!==panel.location&&!/transition|arrive|enter|leave|outside|inside|cut to/i.test(`${panel.storyBeat} ${panel.action}`))issues.push("Location changes without an explicit transition.");
    if(previous.continuityToNextPanel&&panel.continuityFromPreviousPanel&&!norm(panel.continuityFromPreviousPanel).includes(norm(previous.continuityToNextPanel).slice(0,28)))issues.push("Previous-panel end state and current-panel start state may not align.");
  }
  const duplicate=page.panels.filter((item)=>item.id!==panel.id&&norm(item.storyBeat)===norm(panel.storyBeat));
  if(duplicate.length)issues.push("Page contains a duplicated visual beat.");
  if(panel.imagePrompt&&/speech bubble|caption|subtitle|watermark|logo/i.test(panel.imagePrompt)&&!/do not|without|no /i.test(panel.imagePrompt))issues.push("Image prompt appears to request rendered text instead of overlay text.");
  return issues;
}

export function validatePageContinuity(production:MangaChapterProduction,page:MangaPage){
  const issues:string[]=[];
  for(const panel of page.panels){issues.push(...validatePanelContinuity(production,page,panel,previousPanelFor(production,page,panel)).map((issue)=>`Panel ${panel.panelNumber}: ${issue}`));}
  if(page.panels.length<3||page.panels.length>5)issues.push("Manga page should normally contain 3–5 panels.");
  if(!page.startState.trim())issues.push("Page start state is missing.");
  if(!page.endState.trim())issues.push("Page end state is missing.");
  return issues;
}
