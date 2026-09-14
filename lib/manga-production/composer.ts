import {getMangaLayout} from "./presets";
import type {MangaDialogue,MangaPage,MangaPanel} from "./types";

const PAGE_WIDTH=1200;
const PAGE_HEIGHT=1800;
const MARGIN=54;
const GUTTER=20;

function selectedImage(panel:MangaPanel){return panel.versions.find((version)=>version.id===panel.selectedVersionId)?.imageDataUrl||panel.versions.at(-1)?.imageDataUrl}

function loadImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Panel image could not be loaded for page composition."));image.src=src})}

function drawCover(ctx:CanvasRenderingContext2D,image:HTMLImageElement,x:number,y:number,w:number,h:number){
  const scale=Math.max(w/image.width,h/image.height);const sw=w/scale;const sh=h/scale;const sx=(image.width-sw)/2;const sy=(image.height-sh)/2;
  ctx.drawImage(image,sx,sy,sw,sh,x,y,w,h);
}

function wrap(ctx:CanvasRenderingContext2D,text:string,maxWidth:number){
  const tokens=text.split(/\s+/).filter(Boolean);const lines:string[]=[];let line="";
  for(const token of tokens){const test=line?`${line} ${token}`:token;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=token}else line=test}
  if(line)lines.push(line);return lines;
}

function drawDialogue(ctx:CanvasRenderingContext2D,dialogue:MangaDialogue,index:number,x:number,y:number,w:number,h:number){
  if(!dialogue.text.trim())return;
  const bubbleW=Math.min(w*.64,380);const bubbleH=Math.min(170,Math.max(92,70+dialogue.text.length*.8));
  const bx=index%2===0?x+w-bubbleW-22:x+22;const by=y+22+(index%3)*34;
  ctx.save();ctx.lineWidth=4;ctx.strokeStyle="#111";ctx.fillStyle="#fff";
  if(dialogue.bubbleType==="narration"){
    ctx.beginPath();ctx.rect(bx,by,bubbleW,bubbleH);ctx.fill();ctx.stroke();
  }else{
    ctx.beginPath();ctx.ellipse(bx+bubbleW/2,by+bubbleH/2,bubbleW/2,bubbleH/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(dialogue.bubbleType!=="thought"){
      ctx.beginPath();const tailX=index%2===0?bx+bubbleW*.2:bx+bubbleW*.8;ctx.moveTo(tailX,by+bubbleH*.78);ctx.lineTo(tailX+(index%2===0?-22:22),by+bubbleH+34);ctx.lineTo(tailX+28,by+bubbleH*.82);ctx.closePath();ctx.fill();ctx.stroke();
    }
  }
  ctx.fillStyle="#111";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=dialogue.bubbleType==="shout"?"700 30px sans-serif":"600 27px sans-serif";
  const lines=wrap(ctx,dialogue.text,bubbleW-44).slice(0,5);const lineHeight=32;const start=by+bubbleH/2-((lines.length-1)*lineHeight)/2;
  lines.forEach((line,lineIndex)=>ctx.fillText(line,bx+bubbleW/2,start+lineIndex*lineHeight));
  ctx.restore();
}

export async function composeMangaPage(page:MangaPage){
  if(typeof document==="undefined")throw new Error("Manga page composition requires a browser.");
  const canvas=document.createElement("canvas");canvas.width=PAGE_WIDTH;canvas.height=PAGE_HEIGHT;const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas is unavailable.");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,PAGE_WIDTH,PAGE_HEIGHT);
  const layout=getMangaLayout(page.panelLayout,page.panels.length);const contentW=PAGE_WIDTH-MARGIN*2;const contentH=PAGE_HEIGHT-MARGIN*2-50;
  for(let i=0;i<page.panels.length;i+=1){
    const panel=page.panels[i];const slot=layout.slots[i]||layout.slots.at(-1)!;
    const x=MARGIN+slot.x*contentW;const y=MARGIN+slot.y*contentH;const w=Math.max(40,slot.width*contentW-(slot.x>0?GUTTER/2:0));const h=Math.max(40,slot.height*contentH-(slot.y>0?GUTTER/2:0));
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle="#f4f4f4";ctx.fillRect(x,y,w,h);
    const src=selectedImage(panel);if(src){try{const image=await loadImage(src);drawCover(ctx,image,x,y,w,h)}catch{ctx.fillStyle="#ddd";ctx.fillRect(x,y,w,h)}}
    else{ctx.fillStyle="#d9d9d9";ctx.fillRect(x,y,w,h);ctx.fillStyle="#555";ctx.font="600 24px sans-serif";ctx.textAlign="center";ctx.fillText(`Panel ${panel.panelNumber}`,x+w/2,y+h/2)}
    ctx.restore();ctx.strokeStyle="#050505";ctx.lineWidth=6;ctx.strokeRect(x,y,w,h);
    panel.dialogue.slice(0,3).forEach((dialogue,index)=>drawDialogue(ctx,dialogue,index,x,y,w,h));
    if(panel.soundEffects.length){ctx.save();ctx.font="900 38px sans-serif";ctx.textAlign="left";ctx.lineWidth=7;ctx.strokeStyle="#fff";ctx.fillStyle="#111";const sfx=panel.soundEffects[0];ctx.strokeText(sfx,x+24,y+h-34);ctx.fillText(sfx,x+24,y+h-34);ctx.restore()}
  }
  ctx.fillStyle="#111";ctx.font="600 25px sans-serif";ctx.textAlign="center";ctx.fillText(String(page.pageNumber),PAGE_WIDTH/2,PAGE_HEIGHT-20);
  return canvas.toDataURL("image/jpeg",.94);
}

export function downloadDataUrl(dataUrl:string,fileName:string){const a=document.createElement("a");a.href=dataUrl;a.download=fileName;a.click()}
