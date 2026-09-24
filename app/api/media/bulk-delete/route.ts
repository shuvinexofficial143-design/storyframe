import {NextResponse} from "next/server";
import {z} from "zod";
import {mediaBucket,objectId} from "@/lib/mongodb";

export const runtime="nodejs";
export const maxDuration=300;

const Input=z.object({ids:z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(1000)});

export async function DELETE(request:Request){
  try{
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid media deletion request"},{status:400});
    const ids=[...new Set(parsed.data.ids)];
    if(!ids.length)return NextResponse.json({deleted:0});
    const bucket=await mediaBucket();
    let deleted=0;
    const failed:string[]=[];
    for(const id of ids){
      try{
        await bucket.delete(objectId(id));
        deleted+=1;
      }catch(error){
        const message=error instanceof Error?error.message:"";
        if(/FileNotFound|not found/i.test(message)){deleted+=1;continue}
        failed.push(id);
      }
    }
    if(failed.length)return NextResponse.json({error:"Some stored media could not be deleted.",deleted,failedCount:failed.length},{status:502});
    return NextResponse.json({deleted});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Media deletion failed"},{status:502});
  }
}
