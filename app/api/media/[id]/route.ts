import {NextResponse} from "next/server";
import {mediaBucket,objectId} from "@/lib/mongodb";
import {mediaFile} from "@/lib/media-store";

export const dynamic="force-dynamic";

function nodeToWeb(stream:NodeJS.ReadableStream){
  return new ReadableStream<Uint8Array>({
    start(controller){
      stream.on("data",(chunk)=>controller.enqueue(new Uint8Array(Buffer.from(chunk))));
      stream.once("end",()=>controller.close());
      stream.once("error",(error)=>controller.error(error));
    },
    cancel(){(stream as {destroy?:()=>void}).destroy?.()}
  });
}

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const file=await mediaFile(id);
    if(!file)return NextResponse.json({error:"Media not found"},{status:404});
    const length=Number(file.length||0);
    const contentType=typeof file.contentType==="string"?file.contentType:"application/octet-stream";
    const download=new URL(request.url).searchParams.get("download")==="1";
    const disposition=download?"attachment":"inline";
    const range=request.headers.get("range");
    const bucket=await mediaBucket();

    if(range&&length>0){
      const match=range.match(/bytes=(\d*)-(\d*)/);
      if(match){
        const start=match[1]?Number(match[1]):0;
        const requestedEnd=match[2]?Number(match[2]):length-1;
        const end=Math.min(Math.max(start,requestedEnd),length-1);
        if(start>=0&&start<length&&end>=start){
          const stream=bucket.openDownloadStream(objectId(id),{start,end:end+1});
          return new Response(nodeToWeb(stream),{status:206,headers:{
            "Content-Type":contentType,
            "Content-Length":String(end-start+1),
            "Content-Range":`bytes ${start}-${end}/${length}`,
            "Accept-Ranges":"bytes",
            "Cache-Control":"private, max-age=31536000, immutable"
          }});
        }
      }
    }

    const stream=bucket.openDownloadStream(objectId(id));
    return new Response(nodeToWeb(stream),{headers:{
      "Content-Type":contentType,
      "Content-Length":String(length),
      "Accept-Ranges":"bytes",
      "Cache-Control":"private, max-age=31536000, immutable",
      "Content-Disposition":`${disposition}; filename="${String(file.filename||"media").replace(/"/g,"")}"`
    }});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Media request failed"},{status:400});
  }
}
