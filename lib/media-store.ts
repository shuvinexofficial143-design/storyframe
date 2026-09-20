import {ObjectId} from "mongodb";
import {mediaBucket,mongoConfigured,mongoDb,objectId} from "./mongodb";

export type MediaKind="image"|"audio";

export async function storeMedia(input:{
  bytes:Buffer;
  contentType:string;
  kind:MediaKind;
  filename?:string;
  metadata?:Record<string,unknown>;
}){
  if(!mongoConfigured())throw new Error("MongoDB media storage is not configured.");
  const bucket=await mediaBucket();
  const id=new ObjectId();
  const filename=input.filename||`${input.kind}-${id.toHexString()}.bin`;
  const upload=bucket.openUploadStreamWithId(id,filename,{
    contentType:input.contentType,
    metadata:{kind:input.kind,...(input.metadata||{}),createdAt:new Date()}
  });
  await new Promise<void>((resolve,reject)=>{
    upload.once("error",reject);
    upload.once("finish",()=>resolve());
    upload.end(input.bytes);
  });
  return {id:id.toHexString(),url:`/api/media/${id.toHexString()}`,filename,contentType:input.contentType,length:input.bytes.length};
}

export async function storeDataUrl(value:string,input:{
  kind:MediaKind;
  filename?:string;
  metadata?:Record<string,unknown>;
}){
  const match=value.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if(!match)throw new Error("Expected embedded base64 media.");
  return storeMedia({...input,contentType:match[1],bytes:Buffer.from(match[2],"base64")});
}

export async function mediaFile(id:string){
  return (await mongoDb()).collection("media.files").findOne({_id:objectId(id)});
}

export async function readMedia(id:string){
  const chunks:Buffer[]=[];
  const stream=(await mediaBucket()).openDownloadStream(objectId(id));
  await new Promise<void>((resolve,reject)=>{
    stream.on("data",(chunk)=>chunks.push(Buffer.from(chunk)));
    stream.once("error",reject);
    stream.once("end",resolve);
  });
  return Buffer.concat(chunks);
}

export async function persistGeneratedImage(input:{imageDataUrl:string;filename?:string;metadata?:Record<string,unknown>}){
  if(!mongoConfigured())return {id:undefined,url:input.imageDataUrl,imageUrl:input.imageDataUrl,filename:input.filename||"generated-image",contentType:input.imageDataUrl.match(/^data:([^;,]+)/)?.[1]||"image/webp",length:0};
  const stored=await storeDataUrl(input.imageDataUrl,{kind:"image",filename:input.filename,metadata:input.metadata});
  return {...stored,imageUrl:stored.url};
}
