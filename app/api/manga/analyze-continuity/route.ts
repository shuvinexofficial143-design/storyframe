import {NextResponse} from "next/server";
import {analyzeContinuityChapter} from "@/lib/continuity/analyzer";
import {tryGeminiContinuityAnalysis} from "@/lib/continuity/gemini-analysis";

export async function POST(request:Request){
  try{
    const body=await request.json();

    const gemini=await tryGeminiContinuityAnalysis(body);
    if(gemini?.ok)return NextResponse.json(gemini.data);
    if(gemini&&!gemini.ok&&gemini.status===400)return NextResponse.json({error:gemini.error,details:gemini.details},{status:400});

    const result=await analyzeContinuityChapter(body);
    if(!result.ok)return NextResponse.json({error:result.error,details:result.details},{status:result.status});

    if(gemini&&!gemini.ok){
      return NextResponse.json({
        ...result.data,
        warning:[`Gemini free-tier story analysis was unavailable (${gemini.error}).`,result.data.warning].filter(Boolean).join(" ")
      });
    }

    return NextResponse.json(result.data);
  }catch(error){
    console.error("Cinematic continuity analysis failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Chapter analysis failed"},{status:502});
  }
}
