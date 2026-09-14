const DEFAULT_SINGLE_LIMIT=760_000;
const DEFAULT_TOTAL_LIMIT=2_900_000;
const MAX_EDGE=1024;

function isRemoteUrl(value:string){return /^https?:\/\//i.test(value)}
function isImageDataUrl(value:string){return /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value)}

function loadImage(source:string){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error("Stored reference image could not be prepared for upload."));
    image.src=source;
  });
}

async function compactDataUrl(value:string,maxChars=DEFAULT_SINGLE_LIMIT){
  if(!isImageDataUrl(value)||value.length<=maxChars)return value;
  const image=await loadImage(value);
  let scale=Math.min(1,MAX_EDGE/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height));
  let quality=.8;
  let best=value;

  for(let attempt=0;attempt<7;attempt+=1){
    const width=Math.max(320,Math.round((image.naturalWidth||image.width)*scale));
    const height=Math.max(320,Math.round((image.naturalHeight||image.height)*scale));
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d");
    if(!context)return best;
    context.drawImage(image,0,0,width,height);
    const candidate=canvas.toDataURL("image/webp",quality);
    if(candidate.length<best.length)best=candidate;
    if(candidate.length<=maxChars)return candidate;
    if(attempt<3)quality=Math.max(.5,quality-.1);else scale*=.82;
  }
  return best;
}

export async function prepareImagePayload(value:string,maxChars=DEFAULT_SINGLE_LIMIT){
  if(!value||isRemoteUrl(value))return value;
  return compactDataUrl(value,maxChars);
}

export async function prepareReferenceImagesForApi(values:string[],options?:{maxCount?:number;maxTotalChars?:number;maxSingleChars?:number}){
  const maxCount=options?.maxCount??3;
  const maxTotal=options?.maxTotalChars??DEFAULT_TOTAL_LIMIT;
  const maxSingle=options?.maxSingleChars??DEFAULT_SINGLE_LIMIT;
  const unique=[...new Set(values.filter(Boolean))].slice(0,maxCount);
  const prepared:string[]=[];
  let total=0;

  for(const value of unique){
    const candidate=await prepareImagePayload(value,maxSingle);
    const cost=isRemoteUrl(candidate)?candidate.length:Math.max(candidate.length,1);
    if(prepared.length&&total+cost>maxTotal)continue;
    if(!prepared.length&&cost>maxTotal){
      const smaller=await prepareImagePayload(candidate,Math.floor(maxTotal*.9));
      prepared.push(smaller);total+=smaller.length;continue;
    }
    prepared.push(candidate);total+=cost;
  }
  return prepared;
}
