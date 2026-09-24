import {NextResponse} from "next/server";
import {generateImageWithFallback,isRetryableImageProviderFailure} from "@/lib/image-providers";
import {persistGeneratedImage} from "@/lib/media-store";
import {getBackgroundJob,putBackgroundJob,type BackgroundJob} from "@/lib/background-job-store";
import {publishBackgroundStep,verifyBackgroundWorker} from "@/lib/background-qstash";

export const maxDuration=120;

type Ref={name:string;referencePrompt:string;seed:number};
type Task={pageId:string;pageNumber:number;prompt:string;negativePrompt?:string;seed:number;referenceImages:string[];missingReferences:Ref[]};
type Payload={projectId:string;chapterId:string;pages:Task[]};
type ImageItem={pageId:string;pageNumber:number;imageDataUrl:string;sourceUrl:string;model:string;provider:string;seed:number};
type RefItem={name:string;imageDataUrl:string;sourceUrl:string;model:string;provider:string;seed:number};
type Result={pages:ImageItem[];references:RefItem[]};

const now=()=>new Date().toISOString();
const quotaDelay=(attempts:number)=>Math.min(900,Math.max(30,30*Math.pow(2,Math.min(attempts,5))));

async function again(request:Request,job:BackgroundJob<Payload,Result>,delaySeconds:number){
  job.status="waiting";job.updatedAt=now();await putBackgroundJob(job);
  await publishBackgroundStep({destination:`${new URL(request.url).origin}/api/manga/background-image-worker`,runId:job.id,delaySeconds});
}

export async function POST(request:Request){
  if(!verifyBackgroundWorker(request))return NextResponse.json({error:"Unauthorized background worker request"},{status:401});
  const body=await request.json().catch(()=>null) as {runId?:string}|null;
  if(!body?.runId)return NextResponse.json({error:"Invalid worker message"},{status:400});
  const job=await getBackgroundJob<Payload,Result>(body.runId);
  if(!job)return NextResponse.json({ok:true,expired:true});
  if(job.status==="cancelled"||job.status==="completed")return NextResponse.json({ok:true,status:job.status});
  job.result ||= {pages:[],references:[]};

  try{
    job.status="running";job.updatedAt=now();
    const done=new Set(job.result.pages.map(x=>x.pageId));
    const task=job.payload.pages.find(x=>!done.has(x.pageId));
    if(!task){
      job.status="completed";job.phase="complete";job.progress=`Complete: ${job.result.pages.length} manga page image(s) generated in background.`;job.updatedAt=now();await putBackgroundJob(job);
      return NextResponse.json({ok:true,status:"completed"});
    }

    const refs=[...task.referenceImages];
    const missing=task.missingReferences.find(ref=>!job.result!.references.some(saved=>saved.name.toLowerCase()===ref.name.toLowerCase()));
    if(missing){
      job.progress=`Background: generating ${missing.name} continuity reference for Page ${task.pageNumber}…`;await putBackgroundJob(job);
      const prompt=`Canonical character reference for ${missing.name}. ${missing.referencePrompt} Front portrait, face clearly visible, neutral expression, complete hairstyle and primary costume readable, clean simple background. Same exact recurring identity. No dialogue, captions, labels, watermark, logo or UI.`;
      const generated=await generateImageWithFallback({prompt,seed:missing.seed,width:512,height:512,referenceImages:[],allowFallback:false,retryProvider:false});
      const media=await persistGeneratedImage({imageDataUrl:generated.imageDataUrl,filename:`background-reference-${missing.seed}.webp`,metadata:{type:"character-reference",name:missing.name,seed:missing.seed,model:generated.model,provider:generated.provider}});
      job.result.references.push({name:missing.name,imageDataUrl:media.imageUrl,sourceUrl:media.imageUrl,model:generated.model,provider:generated.provider,seed:generated.seed});
      job.attempts=0;job.status="queued";job.progress=`Background: ${missing.name} reference saved. Continuing Page ${task.pageNumber}…`;job.updatedAt=now();await putBackgroundJob(job);
      await publishBackgroundStep({destination:`${new URL(request.url).origin}/api/manga/background-image-worker`,runId:job.id,delaySeconds:10});
      return NextResponse.json({ok:true,status:"queued"});
    }
    for(const saved of job.result.references)if(task.missingReferences.some(ref=>ref.name.toLowerCase()===saved.name.toLowerCase()))refs.push(saved.sourceUrl||saved.imageDataUrl);

    job.progress=`Background: generating Page ${task.pageNumber} · ${job.result.pages.length+1}/${job.payload.pages.length}…`;await putBackgroundJob(job);
    const generated=await generateImageWithFallback({prompt:task.prompt,seed:task.seed,width:1200,height:1800,negativePrompt:task.negativePrompt,referenceImages:refs.slice(0,4),model:process.env.GEMINI_PAGE_IMAGE_MODEL?.trim()||undefined,allowFallback:false,retryProvider:false});
    const media=await persistGeneratedImage({imageDataUrl:generated.imageDataUrl,filename:`manga-page-${task.seed}.webp`,metadata:{type:"manga-page",seed:task.seed,model:generated.model,provider:generated.provider}});
    job.result.pages.push({pageId:task.pageId,pageNumber:task.pageNumber,imageDataUrl:media.imageUrl,sourceUrl:media.imageUrl,model:generated.model,provider:generated.provider,seed:generated.seed});
    job.attempts=0;job.status="queued";job.progress=`Background: Page ${task.pageNumber} saved. Continuing with next unfinished page…`;job.updatedAt=now();await putBackgroundJob(job);
    await publishBackgroundStep({destination:`${new URL(request.url).origin}/api/manga/background-image-worker`,runId:job.id,delaySeconds:10});
    return NextResponse.json({ok:true,status:"queued"});
  }catch(error){
    const message=error instanceof Error?error.message:"Background image generation failed";
    if(isRetryableImageProviderFailure(error)){
      job.attempts=(job.attempts||0)+1;
      const delay=quotaDelay(job.attempts);
      job.error=message;job.progress=`Image provider quota is temporarily exhausted. Saved pages are safe; server retry in ${delay}s (attempt ${job.attempts}).`;
      if(job.attempts>=48){job.status="failed";job.progress="Image provider remained unavailable after extended background retries.";job.updatedAt=now();await putBackgroundJob(job);return NextResponse.json({ok:true,status:"failed"})}
      await again(request,job,delay);
      return NextResponse.json({ok:true,status:"waiting",retryInSeconds:delay});
    }
    job.status="failed";job.error=message;job.progress="Background image generation failed.";job.updatedAt=now();await putBackgroundJob(job);
    return NextResponse.json({ok:true,status:"failed"});
  }
}
