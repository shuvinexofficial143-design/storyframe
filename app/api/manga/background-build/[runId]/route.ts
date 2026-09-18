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
    if(status==="failed"||status==="cancelled"){
      let detail="";
      try{await run.returnValue}catch(error){detail=error instanceof Error?error.message:String(error)}
      return NextResponse.json({status,error:detail||`Background manga workflow ${status} before completion.`});
    }
    return NextResponse.json({status});
  }catch(error){
    console.error("Could not read background manga workflow",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Could not read background manga workflow"},{status:500});
  }
}
