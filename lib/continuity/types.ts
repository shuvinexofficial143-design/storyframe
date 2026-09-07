export type ContinuityStrength="loose"|"balanced"|"strict";

export type ReferenceImage={
  type:"primary"|"full-body"|"environment"|"previous-scene"|"custom";
  url:string;
  seed:number;
  provider:string;
  createdAt:string;
};

export type CharacterIdentityLock={
  gender:string;
  apparentAge:string;
  faceShape:string;
  skinTone:string;
  eyeColor:string;
  eyeShape:string;
  hairColor:string;
  hairLength:string;
  hairstyle:string;
  bodyBuild:string;
  heightClass:string;
};

export type CharacterCostumeLock={
  primaryOutfit:string;
  primaryColors:string[];
  belt:string;
  boots:string;
  accessories:string;
  weapons:string[];
};

export type CharacterStateVariant={
  id:string;
  name:string;
  description:string;
  outfitOverride?:string;
  visualEffects?:string[];
};

export type WorldBible={
  id:string;
  genre:string;
  environmentRules:string[];
  architecture:{
    materials:string[];
    roofStyle:string;
    ornamentStyle:string;
    energyTechnology:string;
  };
  palette:string[];
  canonicalPrompt:string;
  locked:boolean;
};

export type ProjectVisualStyle={
  genre:string;
  renderStyle:string;
  detailLevel:string;
  lightingStyle:string;
  colorPalette:string[];
  architectureStyle:string;
  environmentStyle:string;
  cameraLanguage:string;
  aspectRatio:string;
};

export type ProjectVisualBible={
  projectId:string;
  storyTitle:string;
  visualStyle:ProjectVisualStyle;
  masterSeed:number;
  masterStylePrompt:string;
  negativeStylePrompt:string;
  continuityStrength:ContinuityStrength;
  world:WorldBible;
  createdAt:string;
  updatedAt:string;
};

export type ObjectReference={
  id:string;
  kind:"prop"|"vehicle"|"artifact";
  name:string;
  owner?:string;
  shape:string;
  size:string;
  materials:string;
  colors:string[];
  ornamentation:string;
  magicalEffects:string;
  canonicalPrompt:string;
  locked:boolean;
  seedOffset:number;
  referenceImages:ReferenceImage[];
  createdInChapterId:string;
  updatedAt:string;
};

export type SceneContinuitySummary={
  charactersPresent:string[];
  characterStates:Record<string,string>;
  location:string;
  timeOfDay:string;
  weather:string;
  importantObjects:string[];
  cameraSide:string;
  lighting:string;
  storyState:string;
};

export type SceneContinuityRecord={
  sceneId:string;
  continuitySummary:SceneContinuitySummary;
  generatedImageUrl?:string;
  seed:number;
  promptFingerprint:string;
  updatedAt:string;
};

export type ShotDefinition={
  shotSize:string;
  cameraAngle:string;
  lensFeel:string;
  composition:string;
  cameraMovementSuggestion:string;
};

export type ContinuityValidationIssue={
  code:string;
  severity:"warning"|"error";
  message:string;
  autoResolved:boolean;
};
