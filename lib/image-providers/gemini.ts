import {createSign} from "node:crypto";
import sharp from "sharp";
import type {ImageGenerationInput,ImageProvider} from "./types";

const DEFAULT_MODEL="gemini-3.1-flash-image";
const MAX_REFERENCE_EDGE=896;
const GOOGLE_SCOPE="https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TOKEN_URL="https://oauth2.googleapis.com/token";

const ASPECTS=[
  {id:"1:1",value:1},
  {id:"3:2",value:3/2},
  {id:"2:3",value:2/3},
  {id:"3:4",value:3/4},
  {id:"4:3",value:4/3},
  {id:"4:5",value:4/5},
  {id:"5:4",value:5/4},
  {id:"9:16",value:9/16},
  {id:"16:9",value:16/9},
  {id:"21:9",value:21/9}
] as const;

type ServiceAccount={
  project_id?:string;
  client_email:string;
  private_key:string;
  token_uri?:string;
};

let tokenCache:{accessToken:string;expiresAt:number}|null=null;

function nearestAspect(width:number,height:number){
  const ratio=width/height;
  return ASPECTS.reduce((best,item)=>Math.abs(item.value-ratio)<Math.abs(best.value-ratio)?item:best).id;
}

function parseServiceAccount():ServiceAccount|null{
  const direct=process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON?.trim();
  const encoded=process.env.VERTEX_AI_SERVICE_ACCOUNT_BASE64?.trim();
  const raw=direct||(encoded?Buffer.from(encoded,"base64").toString("utf8"):"");
  if(!raw)return null;
  try{
    const parsed=JSON.parse(raw) as Partial<ServiceAccount>;
    if(!parsed.client_email||!parsed.private_key)return null;
    return parsed as ServiceAccount;
  }catch{
    return null;
  }
}

function projectId(){
  return process.env.VERTEX_AI_PROJECT_ID?.trim()
    ||process.env.GOOGLE_CLOUD_PROJECT_ID?.trim()
    ||process.env.GOOGLE_CLOUD_PROJECT?.trim()
    ||parseServiceAccount()?.project_id?.trim()
    ||"";
}

function apiKey(){
  // This must be a Google Cloud authorization key that is permitted to call
  // Vertex AI (aiplatform.googleapis.com), not an ordinary AI Studio key.
  return process.env.VERTEX_AI_API_KEY?.trim()
    ||process.env.GOOGLE_CLOUD_API_KEY?.trim()
    ||process.env.GEMINI_API_KEY?.trim()
    ||"";
}

function location(){
  return process.env.VERTEX_AI_LOCATION?.trim()
    ||process.env.GOOGLE_CLOUD_LOCATION?.trim()
    ||"global";
}

function base64url(value:string|Buffer){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,"utf8");
  return bytes.toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function serviceAccountAccessToken(account:ServiceAccount){
  const now=Math.floor(Date.now()/1000);
  if(tokenCache&&tokenCache.expiresAt>now+90)return tokenCache.accessToken;

  const header=base64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const payload=base64url(JSON.stringify({
    iss:account.client_email,
    scope:GOOGLE_SCOPE,
    aud:account.token_uri||GOOGLE_TOKEN_URL,
    iat:now,
    exp:now+3600
  }));
  const unsigned=`${header}.${payload}`;
  const signer=createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature=base64url(signer.sign(account.private_key));
  const assertion=`${unsigned}.${signature}`;

  const response=await fetch(account.token_uri||GOOGLE_TOKEN_URL,{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }),
    cache:"no-store"
  });
  const payloadJson=await response.json().catch(()=>null) as {access_token?:string;expires_in?:number;error_description?:string}|null;
  if(!response.ok||!payloadJson?.access_token){
    throw new Error(`Vertex AI service-account authentication failed (${response.status})${payloadJson?.error_description?`: ${payloadJson.error_description}`:""}`);
  }

  tokenCache={accessToken:payloadJson.access_token,expiresAt:now+(payloadJson.expires_in||3600)};
  return payloadJson.access_token;
}

function parseDataUrl(value:string){
  const match=value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if(!match)return null;
  return {mimeType:match[1],bytes:Buffer.from(match[2],"base64")};
}

async function loadReference(value:string,index:number){
  const inline=parseDataUrl(value);
  let bytes:Buffer;

  if(inline){
    bytes=inline.bytes;
  }else{
    const response=await fetch(value,{cache:"no-store"});
    if(!response.ok)throw new Error(`Vertex Gemini reference image ${index+1} could not be loaded (${response.status}).`);
    bytes=Buffer.from(await response.arrayBuffer());
  }

  const prepared=await sharp(bytes)
    .rotate()
    .resize({width:MAX_REFERENCE_EDGE,height:MAX_REFERENCE_EDGE,fit:"inside",withoutEnlargement:true})
    .jpeg({quality:88,mozjpeg:true})
    .toBuffer();

  return {
    inlineData:{
      mimeType:"image/jpeg",
      data:prepared.toString("base64")
    }
  };
}

function endpoint(model:string){
  const project=projectId();
  const region=location();
  const host=region==="global"?"aiplatform.googleapis.com":`${region}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

export const geminiImageProvider:ImageProvider={
  id:"gemini",
  name:"Google Cloud Vertex AI · Gemini 3.1 Flash Image",
  defaultModel:process.env.GEMINI_IMAGE_MODEL?.trim()||DEFAULT_MODEL,
  capabilities:{
    textToImage:true,
    imageReference:true,
    imageToImage:true,
    characterReference:true,
    negativePrompt:false,
    deterministicSeed:false
  },
  responseKind:"gemini-json",
  isConfigured(){
    return Boolean(projectId()&&(parseServiceAccount()||apiKey()));
  },
  async buildRequest(input:ImageGenerationInput){
    const project=projectId();
    const account=parseServiceAccount();
    const key=apiKey();
    if(!project)throw new Error("Vertex AI image generation is not configured. Add VERTEX_AI_PROJECT_ID (the Google Cloud project ID, not only the display name) in Vercel Environment Variables.");
    if(!account&&!key)throw new Error("Vertex AI image generation is not configured. Add VERTEX_AI_SERVICE_ACCOUNT_JSON (recommended) or VERTEX_AI_API_KEY (a Google Cloud authorization key permitted for Vertex AI) in Vercel Environment Variables.");

    const model=input.model||geminiImageProvider.defaultModel;
    const references=(input.referenceImages||[]).filter(Boolean).slice(0,4);
    const referenceInputs=await Promise.all(references.map((value,index)=>loadReference(value,index)));
    const avoidance=input.negativePrompt?.trim()?`AVOID / NEGATIVE CONTINUITY: ${input.negativePrompt.trim()}`:"";
    const seedAnchor=`StoryFrame continuity anchor: ${input.seed}. Gemini does not expose a deterministic image seed parameter, so use this number only as a stable creative continuity cue and never render it as text.`;
    const referenceInstruction=references.length
      ?"REFERENCE PRIORITY: preserve the exact identity and visual facts from the supplied reference images. StoryFrame orders references as recurring character references first, environment/location references second, and the previous scene last. Keep the same face, hairstyle, apparent age, body proportions, costume design and colors, recurring architecture, props and visual world. Change only the action, pose, camera, lighting, emotion or story-authorized state required by the current scene."
      :"";
    const prompt=[input.prompt,referenceInstruction,avoidance,seedAnchor,"Generate exactly one cinematic storyboard image. Return image and text modalities as required by Vertex Gemini image models. No captions, speech bubbles, watermark text, logo or UI."].filter(Boolean).join("\n\n");

    const url=new URL(endpoint(model));
    const headers:Record<string,string>={"Content-Type":"application/json; charset=utf-8"};
    if(account){
      headers.Authorization=`Bearer ${await serviceAccountAccessToken(account)}`;
    }else{
      // Google documents authorization-key use with Vertex AI via the key query parameter.
      url.searchParams.set("key",key);
    }

    return {
      url:url.toString(),
      method:"POST" as const,
      headers,
      body:JSON.stringify({
        contents:[{
          role:"user",
          parts:[{text:prompt},...referenceInputs]
        }],
        generationConfig:{
          responseModalities:["TEXT","IMAGE"],
          imageConfig:{
            aspectRatio:nearestAspect(input.width,input.height),
            imageSize:"1K"
          }
        }
      })
    };
  }
};
