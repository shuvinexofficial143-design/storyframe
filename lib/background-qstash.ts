function qstashToken(){return process.env.QSTASH_TOKEN?.trim()||""}
function qstashBase(){return (process.env.QSTASH_URL?.trim()||"https://qstash-us-east-1.upstash.io").replace(/\/$/,"")}

export function backgroundQStashConfigured(){return Boolean(qstashToken())}

export async function publishBackgroundStep(input:{destination:string;runId:string;delaySeconds?:number}){
  const token=qstashToken();
  if(!token)throw new Error("QStash is not configured. Add QSTASH_TOKEN in Vercel.");
  const url=`${qstashBase()}/v2/publish/${encodeURIComponent(input.destination)}`;
  const headers:Record<string,string>={
    Authorization:`Bearer ${token}`,
    "Content-Type":"application/json",
    "Upstash-Retries":"3",
    "Upstash-Forward-Authorization":`Bearer ${token}`
  };
  if(input.delaySeconds&&input.delaySeconds>0)headers["Upstash-Delay"]=`${Math.ceil(input.delaySeconds)}s`;
  const response=await fetch(url,{method:"POST",headers,body:JSON.stringify({runId:input.runId}),cache:"no-store"});
  const text=await response.text();
  if(!response.ok)throw new Error(`QStash publish failed (${response.status}): ${text.replace(/\s+/g," ").slice(0,400)}`);
}

export function verifyBackgroundWorker(request:Request){
  const token=qstashToken();
  if(!token)return false;
  return request.headers.get("authorization")===`Bearer ${token}`;
}
