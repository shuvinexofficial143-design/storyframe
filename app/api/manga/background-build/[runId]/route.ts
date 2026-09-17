import {NextResponse} from "next/server";
import {getRun} from "workflow/api";

export const dynamic="force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{runId:string}>}){
  try{
    const {runId}=await params;
    if(!runId)return NextResponse.json({error:"Missing workflow run id"},{status:400});
    const run=getRun(runId);
    const status=await run.status;
    if(status==="completed")return NextResponse.json({status,result:await run.returnValue});
    return NextResponse.json({status});
  }catch(error){
    console.error("Could not read background manga workflow",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Could not read background manga workflow"},{status:500});
  }
}
