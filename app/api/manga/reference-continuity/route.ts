import {NextResponse} from "next/server";
import {z} from "zod";
import {getImageProvider} from "@/lib/image-providers";

const Input=z.object({name:z.string().min(1).max(120),referencePrompt:z.string().min(10).max(8000),seed:z.number().int().min(1).max(99_999_999),view:z.enum(["primary","full-body"]).default("primary")});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid character reference request",details:parsed.error.flatten()},{status:400});
    const {name,referencePrompt,seed,view}=parsed.data;const provider=getImageProvider("pollinations");const model=provider.defaultModel;const prompt=[`Canonical character reference for ${name}.`,referencePrompt,view==="full-body"?"Full-body standing reference, entire costume and footwear visible, neutral pose, clean simple background.":"Front or three-quarter waist-up portrait, face clearly visible, neutral expression, full hairstyle visible, primary costume details readable.","This is a StoryFrame reference asset. Keep one distinctive repeatable identity. No text, labels, watermark or logo."].join(" ");const width=view==="full-body"?576:640;const height=960;const spec=provider.buildRequest({prompt,seed,width,height,model});
    const response=await fetch(spec.url,{method:spec.method,headers:spec.headers,cache:"no-store"});if(!response.ok){const message=await response.text().catch(()=>"");throw new Error(`${provider.name} reference request failed (${response.status})${message?`: ${message.slice(0,350)}`:""}`)}
    const contentType=response.headers.get("content-type")||"image/jpeg";const bytes=Buffer.from(await response.arrayBuffer());return NextResponse.json({imageDataUrl:`data:${contentType};base64,${bytes.toString("base64")}`,sourceUrl:spec.url,model,provider:provider.id,seed,capabilities:provider.capabilities});
  }catch(error){console.error("Continuity character reference generation failed",error);return NextResponse.json({error:error instanceof Error?error.message:"Character reference generation failed"},{status:502})}
}
