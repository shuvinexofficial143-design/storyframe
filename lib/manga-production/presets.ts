import type {MangaStylePreset} from "./types";

export const MANGA_STYLE_PROMPTS:Record<MangaStylePreset,string>={
  "Classic Black & White Manga":"professional black-and-white manga, clean ink linework, screentone shading, cross-hatching, strong black shadows, clean white negative space, expressive manga faces, detailed manga backgrounds, professional serialized manga quality",
  "Full Color Manga":"professional full-color manga page, rich but controlled anime color palette, consistent skin tones and costume colors, cinematic lighting, detailed colored backgrounds, crisp linework, polished serialized manga quality",
  "Shonen Manga":"professional full-color shonen manga, energetic clean linework, dynamic anatomy, bold impact framing, vivid controlled colors, consistent character palette, expressive reactions, readable action staging, premium serialized manga quality",
  "Dark Seinen Manga":"professional full-color seinen manga, mature realistic anatomy, deep cinematic shadows, restrained sophisticated color palette, realistic skin and material colors, detailed environments, grounded facial acting, premium graphic-novel quality",
  "Shojo Manga":"professional full-color shojo manga, elegant clean linework, expressive eyes, soft luminous color palette, emotional close-ups, graceful composition, selective floral or light motifs only when story-appropriate, polished serialized manga quality",
  "Horror Manga":"professional full-color horror manga, precise linework, ominous low-key color palette, unsettling colored lighting, oppressive shadows, disturbing but story-faithful framing, detailed environments, tense close-ups, premium horror manga quality",
  "Cinematic Realistic Manga":"professional full-color realistic manga, highly detailed drawing, realistic anatomy and perspective, natural material colors, film-like color grading and composition, believable environments, premium cinematic graphic-novel quality"
};

const COMMON_NEGATIVE="no anime screenshot, no 3D render, no game art, no cartoon poster, no random redesign, no face change, no hairstyle change, no age change, no outfit change unless story-authorized, no location-layout change, no duplicate main character, no random props, no skipped action, no unrelated scene, no rendered text, no captions, no speech bubbles, no letters, no logos, no watermark, no malformed anatomy, no extra limbs";
export const MANGA_NEGATIVE_PROMPT=COMMON_NEGATIVE;

export function isBlackAndWhiteMangaStyle(style:MangaStylePreset){
  return style==="Classic Black & White Manga";
}

export function getMangaNegativePrompt(style:MangaStylePreset){
  return isBlackAndWhiteMangaStyle(style)
    ?`${COMMON_NEGATIVE}, no colored artwork, no full-color rendering, no painterly color illustration`
    :`${COMMON_NEGATIVE}, no monochrome-only page, no grayscale-only rendering, no black-and-white-only screentone page, no washed-out desaturated palette`;
}

export function mangaColorInstruction(style:MangaStylePreset){
  return isBlackAndWhiteMangaStyle(style)
    ?"COLOR MODE: BLACK AND WHITE ONLY. Use ink, screentone, grayscale and black shadows; do not introduce color."
    :"COLOR MODE: FULL COLOR. Preserve stable character skin tones, hair colors, eye colors, costume colors, prop colors and recurring environment palette across every panel and page. Do not convert the artwork to grayscale.";
}

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
