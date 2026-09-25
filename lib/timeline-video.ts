export type TimelineVideoSegment={id:string;pageNumber:number;image:string;audio:string};

type Loaded={segment:TimelineVideoSegment;image:HTMLImageElement;buffer:AudioBuffer;start:number;duration:number};

function loadImage(src:string){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();image.decoding="async";
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error("A manga page could not be decoded for video export."));
    image.src=src;
  });
}
function ease(value:number){return .5-.5*Math.cos(Math.PI*Math.max(0,Math.min(1,value)))}
function drawNoCrop(ctx:CanvasRenderingContext2D,image:HTMLImageElement,width:number,height:number,progress:number,index:number){
  ctx.fillStyle="#000";ctx.fillRect(0,0,width,height);
  const p=ease(progress);
  const cover=Math.max(width/image.naturalWidth,height/image.naturalHeight)*1.04;
  const bgW=image.naturalWidth*cover,bgH=image.naturalHeight*cover;
  ctx.save();ctx.globalAlpha=.28;ctx.filter="blur(20px) brightness(.5)";
  ctx.drawImage(image,(width-bgW)/2,(height-bgH)/2,bgW,bgH);ctx.restore();

  // Foreground is always contain-fit. Motion is allowed only inside the spare canvas area.
  const contain=Math.min(width/image.naturalWidth,height/image.naturalHeight);
  const mode=index%6;
  const zoom=mode===4?1-.025*p:.97+.03*p;
  const scale=contain*zoom,w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  const spareX=Math.max(0,(width-w)/2),spareY=Math.max(0,(height-h)/2);
  const tx=Math.min(width*.022,spareX*.55),ty=Math.min(height*.022,spareY*.55);
  let x=0,y=0;
  if(mode===0)x=(p-.5)*2*tx;
  if(mode===1)x=(.5-p)*2*tx;
  if(mode===2)y=(p-.5)*2*ty;
  if(mode===3)y=(.5-p)*2*ty;
  if(mode===4){x=(p-.5)*tx;y=(.5-p)*ty}
  if(mode===5){x=(.5-p)*tx;y=(p-.5)*ty}
  ctx.drawImage(image,(width-w)/2+x,(height-h)/2+y,w,h);
}
function recorderType(){
  return ["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find((v)=>MediaRecorder.isTypeSupported(v))||"video/webm";
}

export async function buildTimelineVideo(segments:TimelineVideoSegment[],options:{width:number;height:number;fps:number;bitrate:number;onProgress?:(message:string)=>void}){
  if(!segments.length)throw new Error("No synchronized narration segments are ready.");
  const audioContext=new AudioContext();await audioContext.resume();
  const destination=audioContext.createMediaStreamDestination();
  try{
    options.onProgress?.("Preparing master audio timeline…");
    const buffers:AudioBuffer[]=[];
    for(let i=0;i<segments.length;i+=1){
      const response=await fetch(segments[i].audio);
      if(!response.ok)throw new Error(`Visual Page ${segments[i].pageNumber} audio could not be loaded.`);
      buffers.push(await audioContext.decodeAudioData(await response.arrayBuffer()));
      options.onProgress?.(`Preparing audio ${i+1}/${segments.length}…`);
    }
    let cursor=0;
    const timing=buffers.map((buffer,index)=>{const item={segment:segments[index],buffer,start:cursor,duration:buffer.duration};cursor+=buffer.duration;return item});
    const total=Math.max(.1,cursor);

    options.onProgress?.("Preloading manga pages before recording…");
    const images=await Promise.all(segments.map((segment)=>loadImage(segment.image)));
    const loaded:Loaded[]=timing.map((item,index)=>({...item,image:images[index]}));

    const canvas=document.createElement("canvas");canvas.width=options.width;canvas.height=options.height;
    const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("Canvas video export is unavailable.");
    const canvasStream=canvas.captureStream(options.fps);
    const stream=new MediaStream([...canvasStream.getVideoTracks(),...destination.stream.getAudioTracks()]);
    const type=recorderType();
    const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:options.bitrate});
    const chunks:Blob[]=[];recorder.ondataavailable=(e)=>{if(e.data.size)chunks.push(e.data)};
    const stopped=new Promise<void>((resolve)=>{recorder.onstop=()=>resolve()});

    // One immutable master clock drives every audio clip and every visual frame.
    const startAt=audioContext.currentTime+.25;
    loaded.forEach((item)=>{
      const source=audioContext.createBufferSource();source.buffer=item.buffer;source.connect(destination);source.start(startAt+item.start);
    });
    drawNoCrop(ctx,loaded[0].image,options.width,options.height,0,0);
    recorder.start(1000);

    await new Promise<void>((resolve)=>{
      let lastIndex=-1;
      const tick=()=>{
        const t=Math.max(0,audioContext.currentTime-startAt);
        if(t>=total){drawNoCrop(ctx,loaded.at(-1)!.image,options.width,options.height,1,loaded.length-1);resolve();return}
        let lo=0,hi=loaded.length-1;
        while(lo<hi){const mid=Math.floor((lo+hi+1)/2);if(loaded[mid].start<=t)lo=mid;else hi=mid-1}
        const item=loaded[lo];
        const local=Math.max(0,Math.min(1,(t-item.start)/Math.max(.05,item.duration)));
        drawNoCrop(ctx,item.image,options.width,options.height,local,lo);
        if(lo!==lastIndex){lastIndex=lo;options.onProgress?.(`Rendering timeline ${lo+1}/${loaded.length} · Page ${item.segment.pageNumber}`)}
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await new Promise<void>((resolve)=>setTimeout(resolve,Math.ceil(1000/options.fps)));
    recorder.requestData();recorder.stop();await stopped;
    stream.getTracks().forEach((track)=>track.stop());canvasStream.getTracks().forEach((track)=>track.stop());
    images.forEach((image)=>{image.src=""});
    return {blob:new Blob(chunks,{type}),totalSeconds:total,mimeType:type};
  }finally{await audioContext.close()}
}
