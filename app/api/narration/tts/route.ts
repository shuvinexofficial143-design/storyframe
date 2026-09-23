import {NextResponse} from "next/server";
import {z} from "zod";
import {synthesizeNarrationSegment,DEFAULT_NARRATION_STYLE,DEFAULT_NARRATION_VOICE} from "@/lib/narration-tts";

export const maxDuration=300;

const Input=z.object({
  text:z.string().min(20).max(12000),
  voice:z.string().min(1).max(100).default(DEFAULT_NARRATION_VOICE),
  stylePrompt:z.string().min(5).max(3000).default(DEFAULT_NARRATION_STYLE)
});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid narration TTS request",details:parsed.error.flatten()},{status:400});
    const data=await synthesizeNarrationSegment(parsed.data);
    return NextResponse.json({kind:"narration-audio",...data});
  }catch(error){
    console.error("Narration TTS failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Narration TTS failed"},{status:502});
  }
}
