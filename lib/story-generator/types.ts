import type {StoryAnalysisModel} from "../story-analysis-models";

export type StoryOverview={
  title:string;
  overview:string;
  genre:string;
  tone:string;
  language:string;
  storyBible:string;
  majorArcs:string[];
  endingDirection:string;
  targetHours:number;
  chapterWordTarget:number;
  estimatedChapterCount:number;
  generationRules:string[];
  provider?:string;
};

export type GeneratedStoryChapter={
  id:string;
  number:number;
  title:string;
  story:string;
  summary:string;
  endingState:string;
  nextHook:string;
  continuityMemory:string;
  explainer:string;
  wordCount:number;
  storyComplete:boolean;
  mangaStatus:"not-started"|"queued"|"building"|"complete"|"error";
  mangaProjectId?:string;
  mangaChapterId?:string;
  error?:string;
  createdAt:string;
  updatedAt:string;
};

export type StoryGeneratorState={
  schemaVersion:1;
  prompt:string;
  targetHours:number;
  chapterWordTarget:number;
  explainerPrompt:string;
  analysisModel:StoryAnalysisModel;
  autoContinue:boolean;
  autoGenerateManga:boolean;
  overview?:StoryOverview;
  chapters:GeneratedStoryChapter[];
  mangaProjectId?:string;
  running:boolean;
  status:string;
  error:string;
  updatedAt:string;
};
