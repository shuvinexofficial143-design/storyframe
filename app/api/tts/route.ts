import {NextResponse} from "next/server";
import {z} from "zod";
import {storeMedia,readMedia} from "@/lib/media-store";
import {synthesizeLongNarration} from "@/lib/tts";
import {DEFAULT_TTS_STYLE,DEFAULT_TTS_VOICE,STORYFRAME_TTS_VOICES,type StoryframeTtsVoice} from "@/lib/tts-voices";

export const maxDuration=300;

const voiceValues=STORYFRAME_TTS_VOICES.map((item)=>item.id) as [StoryframeTtsVoice,...StoryframeTtsVoice[]];
const Generate=z.object({
  action:z.literal("generate"),
  text:z.string().min(20).max(120000),
  voice:z.enum(voiceValues).default(DEFAULT_TTS_VOICE),
  stylePrompt:z.string().min(5).max(3000).default(DEFAULT_TTS_STYLE),
  chapterNumber:z.number().int().min(1).max(999),
  chapterTitle:z.string().min(1).max(300),
  projectName:z.string().max(300).default("StoryFrame")
});
const Combine=z.object({
  action:z.literal("combine"),
  mediaIds:z.array(z.string().min(1)).min(1).max(500),
  projectName:z.string().max(300).default("StoryFrame")
});
const Input=z.discriminatedUnion("action",[Generate,Combine]);

function slug(value:string){return value.replace(/[^a-zA-Z0-9\u0900-\u097F_-]+/g,"-").replace(/-+/g,"-").slice(0,80)||"storyframe"}

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid TTS request",details:parsed.error.flatten()},{status:400});
    const data=parsed.data;

    if(data.action==="combine"){
      const buffers:Buffer[]=[];
      for(const id of data.mediaIds)buffers.push(await readMedia(id));
      const bytes=Buffer.concat(buffers);
      const stored=await storeMedia({kind:"audio",bytes,contentType:"audio/mpeg",filename:`${slug(data.projectName)}-all-chapters.mp3`,metadata:{type:"combined-explainer-audio",chapterCount:data.mediaIds.length}});
      return NextResponse.json({kind:"combined",mediaId:stored.id,audioUrl:stored.url,downloadUrl:`${stored.url}?download=1`,bytes:stored.length});
    }

    const generated=await synthesizeLongNarration({text:data.text,voice:data.voice,prompt:data.stylePrompt});
    const stored=await storeMedia({
      kind:"audio",
      bytes:generated.bytes,
      contentType:"audio/mpeg",
      filename:`chapter-${String(data.chapterNumber).padStart(3,"0")}-${slug(data.chapterTitle)}.mp3`,
      metadata:{type:"chapter-explainer-audio",chapterNumber:data.chapterNumber,chapterTitle:data.chapterTitle,projectName:data.projectName,voice:data.voice,chunks:generated.chunks}
    });
    return NextResponse.json({kind:"chapter",mediaId:stored.id,audioUrl:stored.url,downloadUrl:`${stored.url}?download=1`,voice:data.voice,chunks:generated.chunks,bytes:stored.length});
  }catch(error){
    console.error("StoryFrame TTS failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"TTS generation failed"},{status:502});
  }
}
