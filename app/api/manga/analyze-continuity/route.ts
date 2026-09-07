import {NextResponse} from "next/server";
import {analyzeContinuityChapter} from "@/lib/continuity/analyzer";

export async function POST(request:Request){
  try{
    const result=await analyzeContinuityChapter(await request.json());
    if(!result.ok)return NextResponse.json({error:result.error,details:result.details},{status:result.status});
    return NextResponse.json(result.data);
  }catch(error){
    console.error("Cinematic continuity analysis failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Chapter analysis failed"},{status:502});
  }
}
