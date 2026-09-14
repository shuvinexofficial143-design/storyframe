import {z} from "zod";
import {xkiroJsonCompletion} from "../xkiro";
import {isStoryAnalysisModel,type StoryAnalysisModel} from "../story-analysis-models";
import {chooseMangaLayout,MANGA_NEGATIVE_PROMPT,MANGA_STYLE_PROMPTS} from "./presets";
import {
  MANGA_STYLE_PRESETS,
  type MangaChapterProduction,
  type MangaCharacterState,
  type MangaContinuityState,
  type MangaMasterAnalysis,
  type MangaPagePlan,
  type MangaStylePreset
} from "./types";

const Dialogue=z.object({
  speaker:z.string().default(""),
  text:z.string().default(""),
  emotion:z.string().default("neutral"),
  bubbleType:z.enum(["speech","thought","shout","whisper","narration"]).default("speech")
});

const Character=z.object({
  name:z.string().min(1),
  role:z.string().default("recurring character"),
  gender:z.string().default("unspecified"),
  approximateAge:z.string().default("young adult"),
  face:z.object({
    shape:z.string().default("consistent face"),
    eyes:z.string().default("expressive eyes"),
    eyebrows:z.string().default("consistent eyebrows"),
    nose:z.string().default("consistent nose"),
    mouth:z.string().default("consistent mouth"),
    specialFeatures:z.string().default("none unless established")
  }),
  hair:z.object({color:z.string().default("black"),style:z.string().default("consistent hairstyle"),length:z.string().default("medium")}),
  body:z.object({build:z.string().default("average"),height:z.string().default("average"),proportions:z.string().default("natural consistent proportions")}),
  defaultOutfit:z.string().default("story-appropriate consistent outfit"),
  currentOutfit:z.string().default("story-appropriate consistent outfit"),
  accessories:z.array(z.string()).default([]),
  importantObjects:z.array(z.string()).default([]),
  consistencyNotes:z.string().default("Keep face, hair, age, body build, outfit and accessories consistent until the story explicitly changes them.")
});

const Location=z.object({
  name:z.string().min(1),
  architecture:z.string().default("story-appropriate architecture"),
  layout:z.record(z.string(),z.string()).default({}),
  importantProps:z.array(z.string()).default([]),
  lighting:z.string().default("story-appropriate motivated lighting"),
  timeOfDay:z.string().default("unspecified"),
  continuityNotes:z.string().default("Preserve the established layout and major fixed objects across recurring panels.")
});

const Prop=z.object({
  name:z.string().min(1),appearance:z.string().default("stable recurring appearance"),currentOwner:z.string().default(""),currentLocation:z.string().default(""),condition:z.string().default("normal"),continuityNotes:z.string().default("Preserve this object's appearance, owner/location and condition until the story changes them.")
});
const Timeline=z.object({sourceText:z.string().default(""),event:z.string().min(1),timeOfDay:z.string().default("unspecified"),location:z.string().default(""),characterNames:z.array(z.string()).default([]),propNames:z.array(z.string()).default([])});
const Beat=z.object({sourceText:z.string().default(""),storyBeat:z.string().min(1),type:z.enum(["action","reaction","reveal","dialogue","transition","environment","object","emotion"]).default("action"),characterNames:z.array(z.string()).default([]),locationName:z.string().default(""),action:z.string().default(""),reaction:z.string().default(""),dialogue:z.array(Dialogue).default([]),importantProps:z.array(z.string()).default([]),stateAfter:z.string().default("")});
const InitialState=z.object({characterName:z.string().min(1),currentLocation:z.string().default(""),position:z.string().default(""),bodyDirection:z.string().default(""),pose:z.string().default(""),expression:z.string().default("neutral"),currentOutfit:z.string().default(""),heldObjects:z.array(z.string()).default([]),injuries:z.array(z.string()).default([]),dirtyClothes:z.boolean().default(false),wetClothes:z.boolean().default(false)});
const MasterOutput=z.object({storySummary:z.string().min(1),characters:z.array(Character).default([]),locations:z.array(Location).default([]),props:z.array(Prop).default([]),timeline:z.array(Timeline).default([]),beats:z.array(Beat).min(4).max(300),initialCharacterStates:z.array(InitialState).default([])});

const PanelState=z.object({
  currentLocation:z.string().default(""),
  position:z.string().default(""),
  bodyDirection:z.string().default(""),
  pose:z.string().default(""),
  expression:z.string().default("neutral"),
  currentOutfit:z.string().default(""),
  heldObjects:z.array(z.string()).default([]),
  injuries:z.array(z.string()).default([]),
  dirtyClothes:z.boolean().default(false),
  wetClothes:z.boolean().default(false)
});

const Panel=z.object({
  beatId:z.string().min(1),
  sourceText:z.string().default(""),
  storyBeat:z.string().min(1),
  characters:z.array(z.string()).default([]),
  characterStates:z.record(z.string(),PanelState).default({}),
  location:z.string().default(""),
  action:z.string().default(""),expression:z.string().default(""),pose:z.string().default(""),bodyDirection:z.string().default(""),characterPositions:z.string().default(""),
  cameraShot:z.string().default("Medium Shot"),cameraAngle:z.string().default("eye-level"),cameraDirection:z.string().default("preserve screen direction"),
  foreground:z.string().default(""),midground:z.string().default(""),background:z.string().default(""),composition:z.string().default("clear readable manga composition"),lighting:z.string().default("manga-appropriate motivated lighting"),mood:z.string().default("story-appropriate"),
  importantProps:z.array(z.string()).default([]),dialogue:z.array(Dialogue).default([]),soundEffects:z.array(z.string()).default([]),
  continuityFromPreviousPanel:z.string().default(""),continuityToNextPanel:z.string().default(""),imagePrompt:z.string().default(""),negativePrompt:z.string().default(MANGA_NEGATIVE_PROMPT)
});
const Page=z.object({pagePurpose:z.string().min(1),startState:z.string().min(1),panelLayout:z.string().default(""),panels:z.array(Panel).min(3).max(5),endState:z.string().min(1),continuityToNextPage:z.string().default("")});
const PageOutput=z.object({pages:z.array(Page).min(1).max(10),consumedBeatCount:z.number().int().min(1).max(40),endState:z.object({timeline:z.string().default(""),timeOfDay:z.string().default("unspecified"),currentLocation:z.string().default(""),characters:z.record(z.string(),PanelState).default({}),activeProps:z.array(z.string()).default([]),previousPageEndState:z.string().default("")})});

const masterInputSchema=z.object({projectName:z.string().min(1),chapterTitle:z.string().min(1),story:z.string().min(20).max(120000),analysisModel:z.string(),stylePreset:z.enum(MANGA_STYLE_PRESETS),existingCharacters:z.array(z.unknown()).default([]),existingLocations:z.array(z.unknown()).default([]),existingProps:z.array(z.unknown()).default([])});
export type MangaMasterInput=z.infer<typeof masterInputSchema>;

function jsonRepairPrompt(base:string,raw:unknown,issues:string){return `${base}\n\nREPAIR RETRY: Your previous response was valid JSON but did not match the required schema. Problems: ${issues}. Return the COMPLETE corrected JSON object, not a patch. Preserve chronology and all extracted beats.\nPREVIOUS JSON:\n${JSON.stringify(raw).slice(0,45000)}`}
function issueSummary(error:z.ZodError){return error.issues.slice(0,14).map((issue)=>`${issue.path.map(String).join(".")||"root"}: ${issue.message}`).join("; ")}
async function requestValidated<T>(model:StoryAnalysisModel,systemPrompt:string,userPrompt:string,schema:z.ZodType<T>,maxTokens=14000){
  let completion=await xkiroJsonCompletion({model,systemPrompt,userPrompt,temperature:0.12,maxTokens});
  let parsed=schema.safeParse(completion.json);
  if(!parsed.success){
    completion=await xkiroJsonCompletion({model,systemPrompt,userPrompt:jsonRepairPrompt(userPrompt,completion.json,issueSummary(parsed.error)),temperature:0.05,maxTokens});
    parsed=schema.safeParse(completion.json);
  }
  if(!parsed.success)throw new Error(`Manga planner returned incomplete structured data: ${issueSummary(parsed.error)}`);
  return parsed.data;
}

function stateRecord(name:string,state:z.infer<typeof PanelState>):MangaCharacterState{return {characterId:name,...state}}

const MASTER_SYSTEM=`You are StoryFrame Manga Director, a professional manga script editor, continuity supervisor and storyboard architect. Return strict JSON only. Do not summarize away visible actions. Convert the complete story into extremely small sequential visual beats. Every beat must represent ONE visible action, ONE visible reaction, ONE reveal, ONE dialogue turn with visible acting, ONE object insert, or ONE explicit transition. Every beat must answer what happens immediately after the previous beat. Never compress a multi-step event such as opening a drawer, searching papers, finding a photo and reacting into one beat. Preserve chronology, dialogue, props, injuries, held objects, clothing changes, positions, time of day and locations. Extract reusable character/location/prop bibles from story facts; restrained non-plot-changing visual details may be chosen only when needed for repeatable identity. Do not invent major events. Source text stays in the original language. Return JSON only.`;

export async function analyzeMangaMaster(raw:unknown):Promise<MangaMasterAnalysis>{
  const input=masterInputSchema.parse(raw);
  if(!isStoryAnalysisModel(input.analysisModel))throw new Error("Unsupported xKiro manga analysis model.");
  const prompt=`PROJECT: ${input.projectName}\nCHAPTER: ${input.chapterTitle}\nMANGA STYLE: ${input.stylePreset} — ${MANGA_STYLE_PROMPTS[input.stylePreset]}\n\nEXISTING LOCKED CHARACTERS (authoritative; never redesign):\n${JSON.stringify(input.existingCharacters)}\n\nEXISTING LOCKED LOCATIONS (authoritative; preserve layout):\n${JSON.stringify(input.existingLocations)}\n\nEXISTING PROPS (authoritative):\n${JSON.stringify(input.existingProps)}\n\nFULL STORY:\n${input.story}\n\nReturn exactly this JSON shape:\n{\n "storySummary":"global story summary",\n "characters":[{"name":"","role":"","gender":"","approximateAge":"","face":{"shape":"","eyes":"","eyebrows":"","nose":"","mouth":"","specialFeatures":""},"hair":{"color":"","style":"","length":""},"body":{"build":"","height":"","proportions":""},"defaultOutfit":"","currentOutfit":"","accessories":[],"importantObjects":[],"consistencyNotes":""}],\n "locations":[{"name":"","architecture":"","layout":{"door":"","window":"","desk":""},"importantProps":[],"lighting":"","timeOfDay":"","continuityNotes":""}],\n "props":[{"name":"","appearance":"","currentOwner":"","currentLocation":"","condition":"","continuityNotes":""}],\n "timeline":[{"sourceText":"","event":"","timeOfDay":"","location":"","characterNames":[],"propNames":[]}],\n "beats":[{"sourceText":"exact source segment","storyBeat":"one immediately visible beat","type":"action|reaction|reveal|dialogue|transition|environment|object|emotion","characterNames":[],"locationName":"","action":"","reaction":"","dialogue":[{"speaker":"","text":"","emotion":"","bubbleType":"speech|thought|shout|whisper|narration"}],"importantProps":[],"stateAfter":"exact physical/story state after this beat"}],\n "initialCharacterStates":[{"characterName":"","currentLocation":"","position":"","bodyDirection":"","pose":"","expression":"","currentOutfit":"","heldObjects":[],"injuries":[],"dirtyClothes":false,"wetClothes":false}]\n}\n\nCRITICAL: create at least 4 beats even for a very short story. Beats must be fine-grained enough for panel-by-panel manga. Do not jump over intermediate visible actions. Aim for roughly one beat per visible action/reaction, not one beat per paragraph. Keep all important original story events covered.`;
  const data=await requestValidated(input.analysisModel,MASTER_SYSTEM,prompt,MasterOutput);
  const initialCharacterStates:Record<string,MangaCharacterState>={};
  for(const item of data.initialCharacterStates)initialCharacterStates[item.characterName]={characterId:item.characterName,currentLocation:item.currentLocation,position:item.position,bodyDirection:item.bodyDirection,pose:item.pose,expression:item.expression,currentOutfit:item.currentOutfit,heldObjects:item.heldObjects,injuries:item.injuries,dirtyClothes:item.dirtyClothes,wetClothes:item.wetClothes};
  return {
    storySummary:data.storySummary,
    characters:data.characters,
    locations:data.locations.map((item,index)=>({id:`manga-loc-${index+1}`,name:item.name,architecture:item.architecture,layout:item.layout,importantProps:item.importantProps,lighting:item.lighting,timeOfDay:item.timeOfDay,continuityNotes:item.continuityNotes})),
    props:data.props.map((item,index)=>({id:`manga-prop-${index+1}`,name:item.name,appearance:item.appearance,currentOwner:item.currentOwner,currentLocation:item.currentLocation,condition:item.condition,continuityNotes:item.continuityNotes})),
    timeline:data.timeline.map((item,index)=>({id:`timeline-${index+1}`,...item})),
    beats:data.beats.map((item,index)=>({id:`beat-${index+1}`,...item})),
    initialCharacterStates,
    provider:`xKiro · ${input.analysisModel}`
  };
}

const PAGE_SYSTEM=`You are StoryFrame Manga Page Planner. Return strict JSON only. Turn already-extracted tiny beats into readable manga pages. Each panel must depict exactly ONE supplied beat and must answer what happens immediately after the previous panel. Never compress multiple sequential beats into one panel. Never reorder, skip or duplicate beat IDs. Use 3–5 panels per page, normally 4; use 3 for slow dramatic sequences and 5 for fast action/dialogue/reaction chains. Preserve exact character positions, body direction, held objects, injuries, outfit, screen direction, location layout and previous-page end state. For EACH panel output characterStates for every visible recurring character at that exact panel moment. Dialogue stays structured and MUST NOT be rendered inside imagePrompt. Image prompts must be English and explicitly request professional black-and-white manga, text-free art.`;

export async function planMangaPages(input:{analysisModel:StoryAnalysisModel;stylePreset:MangaStylePreset;storySummary:string;beats:MangaChapterProduction["beats"];startBeatIndex:number;pageStartNumber:number;previousState:MangaContinuityState;characters:unknown[];locations:unknown[];props:unknown[]}):Promise<MangaPagePlan>{
  if(!isStoryAnalysisModel(input.analysisModel))throw new Error("Unsupported xKiro manga analysis model.");
  const remaining=input.beats.length-input.startBeatIndex;
  const take=Math.min(32,remaining);
  const chunk=input.beats.slice(input.startBeatIndex,input.startBeatIndex+take);
  if(chunk.length<3)throw new Error("Fewer than three unplanned manga beats remain. Rebuild the master analysis so the final event is not compressed.");
  const prompt=`MANGA STYLE: ${input.stylePreset}\nSTYLE DESCRIPTION: ${MANGA_STYLE_PROMPTS[input.stylePreset]}\nGLOBAL STORY SUMMARY: ${input.storySummary}\nSTART PAGE NUMBER: ${input.pageStartNumber}\nPREVIOUS CONTINUITY STATE:\n${JSON.stringify(input.previousState)}\n\nLOCKED CHARACTERS:\n${JSON.stringify(input.characters)}\n\nLOCKED LOCATIONS:\n${JSON.stringify(input.locations)}\n\nACTIVE PROPS:\n${JSON.stringify(input.props)}\n\nSEQUENTIAL BEATS TO CONVERT (consume a contiguous prefix only):\n${JSON.stringify(chunk)}\n\nReturn exactly:\n{\n "pages":[{"pagePurpose":"","startState":"","panelLayout":"3-large-top|3-large-bottom|4-grid|4-dramatic|4-vertical-focus|5-action","panels":[{"beatId":"beat-N","sourceText":"","storyBeat":"","characters":[],"characterStates":{"Character Name":{"currentLocation":"","position":"","bodyDirection":"","pose":"","expression":"","currentOutfit":"","heldObjects":[],"injuries":[],"dirtyClothes":false,"wetClothes":false}},"location":"","action":"","expression":"","pose":"","bodyDirection":"","characterPositions":"","cameraShot":"Wide Shot|Medium Shot|Medium Close-Up|Close-Up|Extreme Close-Up|Over-the-Shoulder|POV|Low Angle|High Angle|Object Insert Shot|Reaction Shot|Establishing Shot","cameraAngle":"","cameraDirection":"","foreground":"","midground":"","background":"","composition":"","lighting":"","mood":"","importantProps":[],"dialogue":[{"speaker":"","text":"","emotion":"","bubbleType":"speech|thought|shout|whisper|narration"}],"soundEffects":[],"continuityFromPreviousPanel":"","continuityToNextPanel":"","imagePrompt":"English text-free professional manga prompt","negativePrompt":""}],"endState":"","continuityToNextPage":""}],\n "consumedBeatCount":NUMBER,\n "endState":{"timeline":"","timeOfDay":"","currentLocation":"","characters":{"Character Name":{"currentLocation":"","position":"","bodyDirection":"","pose":"","expression":"","currentOutfit":"","heldObjects":[],"injuries":[],"dirtyClothes":false,"wetClothes":false}},"activeProps":[],"previousPageEndState":""}\n}\n\nRules: Use each consumed beat ID exactly once and in supplied order. Do not create panels for unsupplied events. Every panel must begin from the previous panel's physical state. Preserve left/right screen direction during conversations unless an explicit movement justifies crossing the axis. Large reveal/reaction may use a large panel layout. imagePrompt must say professional black-and-white manga and no rendered text, speech bubbles, logos or watermarks.`;
  const data=await requestValidated(input.analysisModel,PAGE_SYSTEM,prompt,PageOutput);

  const usedIds=data.pages.flatMap((page)=>page.panels.map((panel)=>panel.beatId));
  if(new Set(usedIds).size!==usedIds.length)throw new Error("Manga page planner duplicated a story beat. Please retry page planning.");
  const expectedIds=chunk.map((beat)=>beat.id);
  if(usedIds.some((id)=>!expectedIds.includes(id)))throw new Error("Manga page planner returned an unknown beat ID.");
  let contiguous=0;
  while(contiguous<expectedIds.length&&usedIds[contiguous]===expectedIds[contiguous])contiguous+=1;
  if(contiguous!==usedIds.length||contiguous<3)throw new Error("Manga page planner skipped or reordered beats. Please retry page planning.");

  const pages=data.pages.map((rawPage,pageIndex)=>{
    const pageNumber=input.pageStartNumber+pageIndex;
    const layout=rawPage.panelLayout||chooseMangaLayout(rawPage.panels.length,rawPage.pagePurpose);
    return {
      id:`manga-page-${pageNumber}`,
      pageNumber,
      pagePurpose:rawPage.pagePurpose,
      startState:rawPage.startState,
      panelLayout:layout,
      panels:rawPage.panels.map((panel,panelIndex)=>{
        const characterStates:Record<string,MangaCharacterState>={};
        for(const [name,state] of Object.entries(panel.characterStates))characterStates[name]=stateRecord(name,state);
        return {id:`manga-page-${pageNumber}-panel-${panelIndex+1}`,panelNumber:panelIndex+1,beatId:panel.beatId,sourceText:panel.sourceText,storyBeat:panel.storyBeat,characters:panel.characters,characterStates,location:panel.location,action:panel.action,expression:panel.expression,pose:panel.pose,bodyDirection:panel.bodyDirection,characterPositions:panel.characterPositions,cameraShot:panel.cameraShot,cameraAngle:panel.cameraAngle,cameraDirection:panel.cameraDirection,foreground:panel.foreground,midground:panel.midground,background:panel.background,composition:panel.composition,lighting:panel.lighting,mood:panel.mood,importantProps:panel.importantProps,dialogue:panel.dialogue,soundEffects:panel.soundEffects,continuityFromPreviousPanel:panel.continuityFromPreviousPanel,continuityToNextPanel:panel.continuityToNextPanel,imagePrompt:panel.imagePrompt,negativePrompt:panel.negativePrompt||MANGA_NEGATIVE_PROMPT,validationIssues:[],seed:0,versions:[],status:"idle" as const};
      }),
      endState:rawPage.endState,
      continuityToNextPage:rawPage.continuityToNextPage,
      status:"planned" as const
    };
  });

  const endCharacters:Record<string,MangaCharacterState>={};
  for(const [name,state] of Object.entries(data.endState.characters))endCharacters[name]=stateRecord(name,state);
  const continuityState:MangaContinuityState={currentPage:pages.at(-1)?.pageNumber||input.pageStartNumber,timeline:data.endState.timeline,timeOfDay:data.endState.timeOfDay,currentLocation:data.endState.currentLocation,characters:endCharacters,activeProps:data.endState.activeProps,previousPageEndState:data.endState.previousPageEndState||pages.at(-1)?.endState||""};
  return {pages,nextBeatIndex:Math.min(input.beats.length,input.startBeatIndex+contiguous),continuityState,provider:`xKiro · ${input.analysisModel}`};
}
