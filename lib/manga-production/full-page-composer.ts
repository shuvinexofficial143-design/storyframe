import {getMangaLayout,isBlackAndWhiteMangaStyle} from "./presets";
import type {MangaDialogue,MangaPage,MangaStylePreset} from "./types";

const PAGE_WIDTH=1200;
const PAGE_HEIGHT=1800;
const MARGIN=44;

function loadImage(src:string){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error("Generated manga page could not be loaded for text composition."));
    image.src=src;
  });
}

function drawCover(ctx:CanvasRenderingContext2D,image:HTMLImageElement,stylePreset:MangaStylePreset){
  const scale=Math.max(PAGE_WIDTH/image.width,PAGE_HEIGHT/image.height);
  const sw=PAGE_WIDTH/scale;
  const sh=PAGE_HEIGHT/scale;
  const sx=(image.width-sw)/2;
  const sy=(image.height-sh)/2;
  ctx.save();
  ctx.filter=isBlackAndWhiteMangaStyle(stylePreset)?"grayscale(1) contrast(1.04)":"none";
  ctx.drawImage(image,sx,sy,sw,sh,0,0,PAGE_WIDTH,PAGE_HEIGHT);
  ctx.restore();
}

function wrap(ctx:CanvasRenderingContext2D,text:string,maxWidth:number){
  const tokens=text.split(/\s+/).filter(Boolean);
  const lines:string[]=[];
  let line="";
  for(const token of tokens){
    const test=line?`${line} ${token}`:token;
    if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=token}else line=test;
  }
  if(line)lines.push(line);
  return lines;
}


function compactSystemLines(value:string){
  const cleaned=value.replace(/\[?system\]?\s*[:\-]?/ig," ").replace(/\s+/g," ").trim();
  const pieces=cleaned.split(/\n+|(?<=[.!?।])\s+|\s*[|•]+\s*/).map((item)=>item.trim()).filter(Boolean);
  const priority=/\b(level|rank|quest|reward|skill|warning|penalty|target|hp|mp|gold|exp|experience|unlock|class|title|system)\b|लेवल|रैंक|क्वेस्ट|रिवॉर्ड|स्किल|चेतावनी|इनाम|लक्ष्य/i;
  const ordered=[...pieces.filter((item)=>priority.test(item)),...pieces.filter((item)=>!priority.test(item))];
  const unique=ordered.filter((item,index)=>ordered.indexOf(item)===index);
  return unique.slice(0,3).map((line)=>line.length>78?line.slice(0,75).trimEnd()+"…":line);
}

function isSystemDialogue(dialogue:MangaDialogue){
  return /^(system|status|quest|notification|alert)$/i.test(dialogue.speaker.trim())||
    /\b(system|level up|quest|reward|rank|skill unlocked|warning|penalty)\b|सिस्टम|लेवल अप|क्वेस्ट|रिवॉर्ड|रैंक|स्किल|चेतावनी/i.test(dialogue.text);
}

function dialoguePriority(dialogue:MangaDialogue){
  const text=dialogue.text.trim();
  if(!text)return -100;
  if(isSystemDialogue(dialogue))return 100;
  if(dialogue.bubbleType==="shout")return 80;
  if(dialogue.bubbleType==="speech"||dialogue.bubbleType==="whisper")return text.length<=115?70:30;
  if(dialogue.bubbleType==="thought")return text.length<=90?55:20;
  if(dialogue.bubbleType==="narration"){
    const essential=/\b(later|earlier|meanwhile|suddenly|that night|next day|years? later)\b|अगले दिन|कुछ देर बाद|उसी रात|अचानक|इस बीच/i.test(text);
    return essential&&text.length<=85?45:-20;
  }
  return 0;
}

function visibleDialogues(dialogues:MangaDialogue[]){
  return [...dialogues]
    .map((dialogue,index)=>({dialogue,index,score:dialoguePriority(dialogue)}))
    .filter((item)=>item.score>=40)
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .slice(0,2)
    .sort((a,b)=>a.index-b.index)
    .map((item)=>item.dialogue);
}

function drawSystemCard(ctx:CanvasRenderingContext2D,dialogue:MangaDialogue,index:number,x:number,y:number,w:number,h:number){
  const lines=compactSystemLines(dialogue.text);
  if(!lines.length)return;
  const cardW=Math.min(w*.72,430);
  const cardH=Math.min(h*.38,72+lines.length*34);
  const left=index%2!==0;
  const bx=left?x+18:x+w-cardW-18;
  const by=y+18;
  ctx.save();
  ctx.fillStyle="rgba(8,14,20,.92)";
  ctx.strokeStyle="#78e6ff";
  ctx.lineWidth=3;
  ctx.beginPath();ctx.roundRect(bx,by,cardW,cardH,14);ctx.fill();ctx.stroke();
  ctx.fillStyle="#78e6ff";
  ctx.font="800 20px sans-serif";
  ctx.textAlign="left";
  ctx.textBaseline="top";
  ctx.fillText("SYSTEM",bx+18,by+13);
  ctx.fillStyle="#f5fbff";
  ctx.font="600 22px sans-serif";
  lines.forEach((line,lineIndex)=>ctx.fillText(line,bx+18,by+43+lineIndex*31,cardW-36));
  ctx.restore();
}

function drawDialogue(ctx:CanvasRenderingContext2D,dialogue:MangaDialogue,index:number,x:number,y:number,w:number,h:number){
  if(!dialogue.text.trim())return;
  if(isSystemDialogue(dialogue)){drawSystemCard(ctx,dialogue,index,x,y,w,h);return}
  const bubbleW=Math.min(w*.58,340);
  const bubbleH=Math.min(152,Math.max(88,68+Math.min(dialogue.text.length,120)*.62));
  const left=index%2!==0;
  const bx=left?x+18:x+w-bubbleW-18;
  const by=y+16+(index%2)*28;

  ctx.save();
  ctx.lineWidth=4;
  ctx.strokeStyle="#0a0a0a";
  ctx.fillStyle="#fff";

  if(dialogue.bubbleType==="narration"){
    ctx.beginPath();
    ctx.rect(bx,by,bubbleW,bubbleH);
    ctx.fill();
    ctx.stroke();
  }else{
    ctx.beginPath();
    ctx.ellipse(bx+bubbleW/2,by+bubbleH/2,bubbleW/2,bubbleH/2,0,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();
    if(dialogue.bubbleType==="thought"){
      const side=left?1:-1;
      ctx.beginPath();ctx.arc(bx+bubbleW/2+side*bubbleW*.28,by+bubbleH*.86,12,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.arc(bx+bubbleW/2+side*bubbleW*.36,by+bubbleH+18,7,0,Math.PI*2);ctx.fill();ctx.stroke();
    }else{
      const tailX=left?bx+bubbleW*.78:bx+bubbleW*.22;
      ctx.beginPath();
      ctx.moveTo(tailX,by+bubbleH*.78);
      ctx.lineTo(tailX+(left?22:-22),by+bubbleH+34);
      ctx.lineTo(tailX+(left?-28:28),by+bubbleH*.82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.fillStyle="#111";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.font=dialogue.bubbleType==="shout"?"700 30px sans-serif":"600 27px sans-serif";
  const displayText=dialogue.text.length>120?dialogue.text.slice(0,117).trimEnd()+"…":dialogue.text;
  const lines=wrap(ctx,displayText,bubbleW-44).slice(0,4);
  const lineHeight=32;
  const start=by+bubbleH/2-((lines.length-1)*lineHeight)/2;
  lines.forEach((line,lineIndex)=>ctx.fillText(line,bx+bubbleW/2,start+lineIndex*lineHeight));
  ctx.restore();
}

export async function composeGeneratedMangaPage(baseImageDataUrl:string,page:MangaPage,stylePreset:MangaStylePreset="Classic Black & White Manga"){
  if(typeof document==="undefined")throw new Error("Manga page text composition requires a browser.");
  const canvas=document.createElement("canvas");
  canvas.width=PAGE_WIDTH;
  canvas.height=PAGE_HEIGHT;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Canvas is unavailable.");

  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,PAGE_WIDTH,PAGE_HEIGHT);
  const image=await loadImage(baseImageDataUrl);
  drawCover(ctx,image,stylePreset);

  const layout=getMangaLayout(page.panelLayout,page.panels.length);
  const contentW=PAGE_WIDTH-MARGIN*2;
  const contentH=PAGE_HEIGHT-MARGIN*2-28;

  for(let index=0;index<page.panels.length;index+=1){
    const panel=page.panels[index];
    const slot=layout.slots[index]||layout.slots.at(-1)!;
    const x=MARGIN+slot.x*contentW;
    const y=MARGIN+slot.y*contentH;
    const w=Math.max(80,slot.width*contentW);
    const h=Math.max(80,slot.height*contentH);
    visibleDialogues(panel.dialogue).forEach((dialogue,dialogueIndex)=>drawDialogue(ctx,dialogue,dialogueIndex,x,y,w,h));
    if(panel.soundEffects.length&&/action|impact|attack|hit|crash|boom|bang|slash|thud|explosion|fight/i.test(`${panel.action} ${panel.storyBeat} ${panel.mood}`)){
      const sfx=panel.soundEffects[0].slice(0,18);
      ctx.save();
      ctx.font="900 38px sans-serif";
      ctx.textAlign="left";
      ctx.lineWidth=7;
      ctx.strokeStyle="#fff";
      ctx.fillStyle="#111";
      ctx.strokeText(sfx,x+22,y+h-30);
      ctx.fillText(sfx,x+22,y+h-30);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.fillStyle="#fff";
  ctx.strokeStyle="#111";
  ctx.lineWidth=3;
  ctx.beginPath();
  ctx.roundRect(PAGE_WIDTH/2-32,PAGE_HEIGHT-50,64,34,12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle="#111";
  ctx.font="700 22px sans-serif";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText(String(page.pageNumber),PAGE_WIDTH/2,PAGE_HEIGHT-33);
  ctx.restore();

  return canvas.toDataURL("image/jpeg",.94);
}
