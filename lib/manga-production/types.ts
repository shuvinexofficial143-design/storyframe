export const MANGA_STYLE_PRESETS=[
  "Classic Black & White Manga",
  "Shonen Manga",
  "Dark Seinen Manga",
  "Shojo Manga",
  "Horror Manga",
  "Cinematic Realistic Manga"
] as const;

export type MangaStylePreset=(typeof MANGA_STYLE_PRESETS)[number];
export type MangaBubbleType="speech"|"thought"|"shout"|"whisper"|"narration";
export type MangaBeatType="action"|"reaction"|"reveal"|"dialogue"|"transition"|"environment"|"object"|"emotion";
export type PanelStatus="idle"|"generating"|"complete"|"needs-regeneration"|"error";
export type PanelQaStatus="unchecked"|"passed"|"warning"|"failed";

export type MangaDialogue={speaker:string;text:string;emotion:string;bubbleType:MangaBubbleType};

export type MangaCharacterState={
  characterId:string;
  currentLocation:string;
  position:string;
  bodyDirection:string;
  pose:string;
  expression:string;
  currentOutfit:string;
  heldObjects:string[];
  injuries:string[];
  dirtyClothes:boolean;
  wetClothes:boolean;
};

export type MangaLocationProfile={id:string;name:string;architecture:string;layout:Record<string,string>;importantProps:string[];lighting:string;timeOfDay:string;continuityNotes:string};
export type MangaPropState={id:string;name:string;appearance:string;currentOwner:string;currentLocation:string;condition:string;continuityNotes:string};
export type MangaTimelineEvent={id:string;sourceText:string;event:string;timeOfDay:string;location:string;characterNames:string[];propNames:string[]};
export type MangaStoryBeat={id:string;sourceText:string;storyBeat:string;type:MangaBeatType;characterNames:string[];locationName:string;action:string;reaction:string;dialogue:MangaDialogue[];importantProps:string[];stateAfter:string};

export type PanelImageVersion={id:string;imageDataUrl:string;sourceUrl?:string;provider:string;model:string;seed:number;prompt:string;createdAt:string;qaStatus:PanelQaStatus;qaNotes:string[]};

export type MangaPanel={
  id:string;
  panelNumber:number;
  beatId:string;
  sourceText:string;
  storyBeat:string;
  characters:string[];
  characterStates:Record<string,MangaCharacterState>;
  location:string;
  action:string;
  expression:string;
  pose:string;
  bodyDirection:string;
  characterPositions:string;
  cameraShot:string;
  cameraAngle:string;
  cameraDirection:string;
  foreground:string;
  midground:string;
  background:string;
  composition:string;
  lighting:string;
  mood:string;
  importantProps:string[];
  dialogue:MangaDialogue[];
  soundEffects:string[];
  continuityFromPreviousPanel:string;
  continuityToNextPanel:string;
  imagePrompt:string;
  negativePrompt:string;
  validationIssues:string[];
  seed:number;
  versions:PanelImageVersion[];
  selectedVersionId?:string;
  status:PanelStatus;
  error?:string;
};

export type MangaPage={id:string;pageNumber:number;pagePurpose:string;startState:string;panelLayout:string;panels:MangaPanel[];endState:string;continuityToNextPage:string;composedImageDataUrl?:string;status:"planned"|"generating"|"generated"|"composed"|"needs-review"};

export type MangaContinuityState={currentPage:number;timeline:string;timeOfDay:string;currentLocation:string;characters:Record<string,MangaCharacterState>;activeProps:string[];previousPageEndState:string};
export type StoryCoverageReport={percent:number;coveredBeatIds:string[];missingBeats:Array<{beatId:string;storyBeat:string;sourceText:string}>};

export type MangaChapterProduction={schemaVersion:1;stylePreset:MangaStylePreset;storySummary:string;timeline:MangaTimelineEvent[];beats:MangaStoryBeat[];locationProfiles:MangaLocationProfile[];propStates:MangaPropState[];initialCharacterStates:Record<string,MangaCharacterState>;pages:MangaPage[];nextBeatIndex:number;continuityState:MangaContinuityState;coverage:StoryCoverageReport;analysisProvider?:string;updatedAt:string};

export type MangaMasterCharacter={name:string;role:string;gender:string;approximateAge:string;face:{shape:string;eyes:string;eyebrows:string;nose:string;mouth:string;specialFeatures:string};hair:{color:string;style:string;length:string};body:{build:string;height:string;proportions:string};defaultOutfit:string;currentOutfit:string;accessories:string[];importantObjects:string[];consistencyNotes:string};
export type MangaMasterAnalysis={storySummary:string;characters:MangaMasterCharacter[];locations:MangaLocationProfile[];props:MangaPropState[];timeline:MangaTimelineEvent[];beats:MangaStoryBeat[];initialCharacterStates:Record<string,MangaCharacterState>;provider:string};
export type MangaPagePlan={pages:MangaPage[];nextBeatIndex:number;continuityState:MangaContinuityState;provider:string};
