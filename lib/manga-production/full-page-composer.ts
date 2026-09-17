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

function drawDialogue(ctx:CanvasRenderingContext2D,dialogue:MangaDialogue,index:number,x:number,y:number,w:number,h:number){
  if(!dialogue.text.trim())return;
  const bubbleW=Math.min(w*.66,390);
  const bubbleH=Math.min(180,Math.max(94,74+dialogue.text.length*.82));
  const left=index%2!==0;
  const bx=left?x+18:x+w-bubbleW-18;
  const by=y+18+(index%3)*36;

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
  const lines=wrap(ctx,dialogue.text,bubbleW-44).slice(0,5);
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
    panel.dialogue.slice(0,3).forEach((dialogue,dialogueIndex)=>drawDialogue(ctx,dialogue,dialogueIndex,x,y,w,h));
    if(panel.soundEffects.length){
      const sfx=panel.soundEffects[0];
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
