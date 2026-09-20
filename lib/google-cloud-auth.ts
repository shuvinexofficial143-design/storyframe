import {createSign} from "node:crypto";

type ServiceAccount={project_id?:string;client_email:string;private_key:string;token_uri?:string};
const TOKEN_URL="https://oauth2.googleapis.com/token";
const SCOPE="https://www.googleapis.com/auth/cloud-platform";
let cache:{token:string;expiresAt:number}|null=null;

function base64url(value:string|Buffer){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,"utf8");
  return bytes.toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}

export function googleProjectId(){
  return process.env.VERTEX_AI_PROJECT_ID?.trim()||process.env.GOOGLE_CLOUD_PROJECT_ID?.trim()||process.env.GOOGLE_CLOUD_PROJECT?.trim()||parseServiceAccount()?.project_id?.trim()||"";
}

export function parseServiceAccount():ServiceAccount|null{
  const direct=process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON?.trim();
  const encoded=process.env.VERTEX_AI_SERVICE_ACCOUNT_BASE64?.trim();
  const raw=direct||(encoded?Buffer.from(encoded,"base64").toString("utf8"):"");
  if(!raw)return null;
  try{
    const value=JSON.parse(raw) as Partial<ServiceAccount>;
    return value.client_email&&value.private_key?value as ServiceAccount:null;
  }catch{return null}
}

export async function googleAccessToken(){
  const account=parseServiceAccount();
  if(!account)throw new Error("Google service-account credentials are required for TTS.");
  const now=Math.floor(Date.now()/1000);
  if(cache&&cache.expiresAt>now+90)return cache.token;
  const header=base64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const payload=base64url(JSON.stringify({iss:account.client_email,scope:SCOPE,aud:account.token_uri||TOKEN_URL,iat:now,exp:now+3600}));
  const unsigned=`${header}.${payload}`;
  const signer=createSign("RSA-SHA256");signer.update(unsigned);signer.end();
  const assertion=`${unsigned}.${base64url(signer.sign(account.private_key))}`;
  const response=await fetch(account.token_uri||TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth2:grant-type:jwt-bearer",assertion}),cache:"no-store"});
  const data=await response.json().catch(()=>null) as {access_token?:string;expires_in?:number;error_description?:string}|null;
  if(!response.ok||!data?.access_token)throw new Error(`Google authentication failed (${response.status})${data?.error_description?`: ${data.error_description}`:""}`);
  cache={token:data.access_token,expiresAt:now+(data.expires_in||3600)};
  return cache.token;
}
