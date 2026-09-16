export const STORY_ANALYSIS_MODELS=[
  "google/gemini-3.1-pro-preview",
  "mistralai/mistral-medium-3.5",
  "mistralai/mistral-large-2512"
] as const;

export type StoryAnalysisModel=(typeof STORY_ANALYSIS_MODELS)[number];

export const DEFAULT_STORY_ANALYSIS_MODEL:StoryAnalysisModel="google/gemini-3.1-pro-preview";

export const STORY_ANALYSIS_MODEL_OPTIONS:Array<{
  value:StoryAnalysisModel;
  label:string;
  description:string;
}>=[
  {
    value:"google/gemini-3.1-pro-preview",
    label:"Gemini 3.1 Pro",
    description:"Google Cloud Vertex AI · deep story reasoning, continuity and richer manga prompts."
  },
  {
    value:"mistralai/mistral-medium-3.5",
    label:"Mistral Medium 3.5",
    description:"Fast xKiro option for story analysis and prompt generation."
  },
  {
    value:"mistralai/mistral-large-2512",
    label:"Mistral Large 3",
    description:"Deeper xKiro story understanding and richer scene analysis."
  }
];

export function isStoryAnalysisModel(value:unknown):value is StoryAnalysisModel{
  return typeof value==="string"&&(STORY_ANALYSIS_MODELS as readonly string[]).includes(value);
}

export function isVertexStoryAnalysisModel(value:unknown):value is StoryAnalysisModel{
  return value==="google/gemini-3.1-pro-preview";
}

export function vertexStoryModelId(model:StoryAnalysisModel){
  if(model==="google/gemini-3.1-pro-preview")return process.env.GEMINI_STORY_MODEL?.trim()||"gemini-3.1-pro-preview";
  throw new Error("This story model is not a Vertex AI model.");
}

export function storyAnalysisProviderLabel(model:StoryAnalysisModel){
  return isVertexStoryAnalysisModel(model)?"Google Cloud Vertex AI · Gemini 3.1 Pro":`xKiro · ${model}`;
}
