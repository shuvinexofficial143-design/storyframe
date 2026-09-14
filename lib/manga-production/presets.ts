import type {MangaStylePreset} from "./types";

export const MANGA_STYLE_PROMPTS:Record<MangaStylePreset,string>={
  "Classic Black & White Manga":"professional black-and-white manga, clean ink linework, screentone shading, cross-hatching, strong black shadows, clean white negative space, expressive manga faces, detailed manga backgrounds, professional serialized manga quality",
  "Shonen Manga":"professional black-and-white shonen manga, energetic clean ink linework, dynamic anatomy, bold speed lines, strong impact frames, crisp screentones, expressive reactions, readable action staging, serialized weekly manga quality",
  "Dark Seinen Manga":"professional black-and-white seinen manga, mature realistic anatomy, dense cross-hatching, deep black shadows, restrained screentones, cinematic contrast, detailed environments, grounded facial acting, premium serialized manga quality",
  "Shojo Manga":"professional black-and-white shojo manga, elegant clean linework, expressive eyes, delicate screentone gradients, emotional close-ups, graceful composition, selective floral or light motifs only when story-appropriate, polished serialized manga quality",
  "Horror Manga":"professional black-and-white horror manga, precise ink linework, unsettling cross-hatching, harsh black shadows, oppressive negative space, disturbing but story-faithful framing, detailed environments, tense close-ups, serialized horror manga quality",
  "Cinematic Realistic Manga":"professional black-and-white realistic manga, highly detailed ink drawing, realistic anatomy and perspective, controlled screentone shading, film-like composition, strong blacks, subtle cross-hatching, believable environments, premium graphic-novel manga quality"
};

export const MANGA_NEGATIVE_PROMPT="no colored anime art, no anime screenshot, no 3D render, no game art, no cartoon poster, no painterly color illustration, no random redesign, no face change, no hairstyle change, no age change, no outfit change unless story-authorized, no location-layout change, no duplicate main character, no random props, no skipped action, no unrelated scene, no rendered text, no captions, no speech bubbles, no letters, no logos, no watermark, no malformed anatomy, no extra limbs";

export type LayoutSlot={x:number;y:number;width:number;height:number;emphasis:"normal"|"large"};
export type MangaPageLayout={id:string;label:string;panelCount:3|4|5;slots:LayoutSlot[]};

export const MANGA_PAGE_LAYOUTS:MangaPageLayout[]=[
  {id:"3-large-top",label:"3 · Large Top",panelCount:3,slots:[{x:0,y:0,width:1,height:.56,emphasis:"large"},{x:0,y:.58,width:.49,height:.42,emphasis:"normal"},{x:.51,y:.58,width:.49,height:.42,emphasis:"normal"}]},
  {id:"3-large-bottom",label:"3 · Large Bottom",panelCount:3,slots:[{x:0,y:0,width:.49,height:.42,emphasis:"normal"},{x:.51,y:0,width:.49,height:.42,emphasis:"normal"},{x:0,y:.44,width:1,height:.56,emphasis:"large"}]},
  {id:"4-grid",label:"4 · 2×2",panelCount:4,slots:[{x:0,y:0,width:.49,height:.49,emphasis:"normal"},{x:.51,y:0,width:.49,height:.49,emphasis:"normal"},{x:0,y:.51,width:.49,height:.49,emphasis:"normal"},{x:.51,y:.51,width:.49,height:.49,emphasis:"normal"}]},
  {id:"4-dramatic",label:"4 · Dramatic",panelCount:4,slots:[{x:0,y:0,width:1,height:.42,emphasis:"large"},{x:0,y:.44,width:.49,height:.27,emphasis:"normal"},{x:.51,y:.44,width:.49,height:.27,emphasis:"normal"},{x:0,y:.73,width:1,height:.27,emphasis:"large"}]},
  {id:"4-vertical-focus",label:"4 · Vertical Focus",panelCount:4,slots:[{x:0,y:0,width:.43,height:1,emphasis:"large"},{x:.45,y:0,width:.55,height:.32,emphasis:"normal"},{x:.45,y:.34,width:.55,height:.32,emphasis:"normal"},{x:.45,y:.68,width:.55,height:.32,emphasis:"normal"}]},
  {id:"5-action",label:"5 · Action",panelCount:5,slots:[{x:0,y:0,width:1,height:.36,emphasis:"large"},{x:0,y:.38,width:.49,height:.29,emphasis:"normal"},{x:.51,y:.38,width:.49,height:.29,emphasis:"normal"},{x:0,y:.69,width:.49,height:.31,emphasis:"normal"},{x:.51,y:.69,width:.49,height:.31,emphasis:"normal"}]}
];

export function getMangaLayout(id:string,panelCount?:number){
  return MANGA_PAGE_LAYOUTS.find((layout)=>layout.id===id)
    ||MANGA_PAGE_LAYOUTS.find((layout)=>layout.panelCount===panelCount)
    ||MANGA_PAGE_LAYOUTS.find((layout)=>layout.id==="4-grid")!;
}

export function chooseMangaLayout(panelCount:number,purpose:string){
  const lower=purpose.toLowerCase();
  if(panelCount<=3)return lower.includes("reveal")||lower.includes("dramatic")?"3-large-bottom":"3-large-top";
  if(panelCount>=5)return "5-action";
  if(lower.includes("reveal")||lower.includes("reaction")||lower.includes("dramatic"))return "4-dramatic";
  if(lower.includes("walk")||lower.includes("movement")||lower.includes("approach"))return "4-vertical-focus";
  return "4-grid";
}
