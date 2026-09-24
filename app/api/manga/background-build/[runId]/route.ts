import {NextResponse} from "next/server";
import {deleteBackgroundJob,getBackgroundJob,putBackgroundJob} from "@/lib/background-job-store";

export const dynamic="force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{runId:string}>}){
  const {runId}=await params;
  try{
    const job=await getBackgroundJob(runId);
    if(!job)return NextResponse.json({error:"Background manga job was not found or expired."},{status:404});
    return NextResponse.json({
      runId:job.id,status:job.status,phase:job.phase,progress:job.progress,error:job.error,
      result:job.status==="completed"?job.result:undefined,updatedAt:job.updatedAt
    });
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not read background manga job"},{status:502});
  }
}

export async function DELETE(request:Request,{params}:{params:Promise<{runId:string}>}){
  const {runId}=await params;
  try{
    const cleanup=new URL(request.url).searchParams.get("cleanup")==="1";
    if(cleanup){
      await deleteBackgroundJob(runId);
      return NextResponse.json({ok:true,deleted:true});
    }
    const job=await getBackgroundJob(runId);
    if(!job)return NextResponse.json({ok:true,status:"cancelled"});
    job.status="cancelled";
    job.progress="Cancelled by user.";
    job.updatedAt=new Date().toISOString();
    await putBackgroundJob(job);
    return NextResponse.json({ok:true,status:"cancelled"});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not cancel background manga job"},{status:502});
  }
}
