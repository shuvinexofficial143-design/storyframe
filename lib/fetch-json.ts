export async function parseJsonResponse<T>(response:Response):Promise<T>{
  const text=await response.text();
  let data:unknown=null;

  try{
    data=text?JSON.parse(text):null;
  }catch{
    const preview=(text||`HTTP ${response.status}`).replace(/\s+/g," ").slice(0,240);
    throw new Error(`Server returned a non-JSON response: ${preview}`);
  }

  if(!response.ok){
    const payload=data as {error?:string;message?:string}|null;
    throw new Error(payload?.error||payload?.message||`Request failed with status ${response.status}`);
  }

  return data as T;
}
