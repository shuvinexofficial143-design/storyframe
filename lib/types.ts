export type Character={
  id:string;
  name:string;
  role:string;
  appearance:string;
  outfit:string;
  locked:boolean;
  referencePrompt?:string;
  consistencyNotes?:string;
  referenceImage?:string;
  referenceImageSourceUrl?:string;
  referenceSeed?:number;
};

export type Location={
  id:string;
  name:string;
  architecture:string;
  lighting:string;
  continuity:string;
  locked:boolean;
};

export type Scene={
  id:string;
  sceneNumber:number;
  sourceText:string;
  description:string;
  characterIds:string[];
  locationId?:string;
  cameraShot:string;
  cameraAngle:string;
  duration:number;
  imagePrompt:string;
  negativePrompt:string;
  continuityNotes:string;
  generatedImage?:string;
  generationSeed?:number;
  provider?:string;
  generationStatus:"idle"|"queued"|"generating"|"completed"|"failed";
};

export type ProjectState={
  id:string;
  name:string;
  storyTitle:string;
  chapter:string;
  visualStyle:string;
  aspectRatio:string;
  story:string;
  summary:string;
  analysisProvider?:string;
  imageProvider?:string;
  characters:Character[];
  locations:Location[];
  scenes:Scene[];
};
