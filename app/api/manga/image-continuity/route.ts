import {NextResponse} from "next/server";
import {z} from "zod";
import {getImageProvider} from "@/lib/image-providers";

const Input=z.object({prompt:z.string().min(10).max(24000),seed:z.number().int().min(1).max(99_999_999),width:z.number().int().min(512).max(1536).default(1024),height:z.number().int().min(512).max(1536).default(576),negativePrompt:z.string().optional(),referenceImages:z.array(z.string()).max(3).default([]),provider:z.string().default("pollinations")});

export async function POST(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid image request",details:parsed.error.flatten()},{status:400});
    const {prompt,seed,width,height,negativePrompt,referenceImages,provider:providerId}=parsed.data;const provider=getImageProvider(providerId);const model=provider.defaultModel;const spec=provider.buildRequest({prompt,seed,width,height,model,negativePrompt,referenceImages});
    const response=await fetch(spec.url,{method:spec.method,headers:spec.headers,body:spec.body,cache:"no-store"});if(!response.ok){const message=await response.text().catch(()=>"");throw new Error(`${provider.name} image request failed (${response.status})${message?`: ${message.slice(0,400)}`:""}`)}
    const contentType=response.headers.get("content-type")||"image/jpeg";const bytes=Buffer.from(await response.arrayBuffer());const warning=referenceImages.length&&!provider.capabilities.imageReference?`${provider.name} is text-to-image only. Stored references were not sent; StoryFrame used canonical prompt locks + deterministic seed.`:undefined;
    return NextResponse.json({imageDataUrl:`data:${contentType};base64,${bytes.toString("base64")}`,sourceUrl:spec.url,model,provider:provider.id,seed,width,height,referenceCount:provider.capabilities.imageReference?referenceImages.length:0,referenceMode:provider.capabilities.imageReference?"reference":"text-only",capabilities:provider.capabilities,warning});
  }catch(error){console.error("Continuity image generation failed",error);return NextResponse.json({error:error instanceof Error?error.message:"Image generation failed"},{status:502})}
}
