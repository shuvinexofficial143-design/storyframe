import {NextResponse} from "next/server";
import {analyzeContinuityChapter} from "@/lib/continuity/analyzer";
import {tryXKiroContinuityAnalysis} from "@/lib/continuity/xkiro-analysis";
import {DEFAULT_STORY_ANALYSIS_MODEL,isStoryAnalysisModel} from "@/lib/story-analysis-models";

function selectedModelFromCookie(request:Request){
  const header=request.headers.get("cookie")||"";
  const match=header.match(/(?:^|;\s*)storyframe-analysis-model=([^;]+)/);
  if(!match)return undefined;
  try{
    const value=decodeURIComponent(match[1]);
    return isStoryAnalysisModel(value)?value:undefined;
  }catch{
    return undefined;
  }
}

export async function POST(request:Request){
  try{
    const raw=await request.json();
    const body=raw&&typeof raw==="object"?{...(raw as Record<string,unknown>)}:{};

    if(body.analysisModel!==undefined&&!isStoryAnalysisModel(body.analysisModel)){
      return NextResponse.json({error:"Invalid AI story model selection."},{status:400});
    }
    if(body.analysisModel===undefined){
      body.analysisModel=selectedModelFromCookie(request)||DEFAULT_STORY_ANALYSIS_MODEL;
    }

    const xkiro=await tryXKiroContinuityAnalysis(body);
    if(xkiro.ok)return NextResponse.json(xkiro.data);
    if(xkiro.status===400)return NextResponse.json({error:xkiro.error,"details" in xkiro?xkiro.details:undefined},{status:400});

    const result=await analyzeContinuityChapter(body);
    if(!result.ok)return NextResponse.json({error:result.error,details:result.details},{status:result.status});

    const fallbackWarning="warning" in result.data&&typeof result.data.warning==="string"?result.data.warning:"";
    return NextResponse.json({
      ...result.data,
      warning:[`xKiro selected analysis was unavailable (${xkiro.error}).`,fallbackWarning].filter(Boolean).join(" ")
    });
  }catch(error){
    console.error("Cinematic continuity analysis failed",error);
    return NextResponse.json({error:"Story analysis failed. Please try again."},{status:502});
  }
}
