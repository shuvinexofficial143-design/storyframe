export function stableHash(value:string){
  let hash=2166136261;
  for(let i=0;i<value.length;i++){
    hash^=value.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return hash>>>0;
}

export function toSeed(value:number){
  return (Math.abs(value) % 99_000_000) + 100_000;
}

export function deriveSeed(masterSeed:number,key:string,variationIndex=0){
  return toSeed(stableHash(`${masterSeed}|${key}|variation:${variationIndex}`));
}

export function createMasterSeed(projectName:string,createdAt:string){
  return deriveSeed(7_314_159,`${projectName}|${createdAt}|storyframe-master`,0);
}

export function promptFingerprint(prompt:string){
  return stableHash(prompt).toString(16).padStart(8,"0");
}
