export const STORY_ANALYSIS_MODELS=[
  "google/gemini-3.1-pro-preview",
  "google/gemini-3-pro-preview",
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "mistralai/mistral-medium-3.5",
  "mistralai/mistral-large-2512"
] as const;

export type StoryAnalysisModel=(typeof STORY_ANALYSIS_MODELS)[number];
export const DEFAULT_STORY_ANALYSIS_MODEL:StoryAnalysisModel="google/gemini-3.1-pro-preview";
export const STORY_ANALYSIS_MODEL_OPTIONS:Array<{value:StoryAnalysisModel;label:string;description:string}>=[
  {value:"google/gemini-3.1-pro-preview",label:"Gemini 3.1 Pro Preview",description:"Google Cloud Vertex AI · subject to project region, quota and billing eligibility."},
  {value:"google/gemini-3-pro-preview",label:"Gemini 3 Pro Preview",description:"Google Cloud Vertex AI · subject to project region, quota and billing eligibility."},
  {value:"google/gemini-3-flash-preview",label:"Gemini 3 Flash Preview",description:"Google Cloud Vertex AI · subject to project region, quota and billing eligibility."},
  {value:"google/gemini-2.5-pro",label:"Gemini 2.5 Pro",description:"Google Cloud Vertex AI · subject to project region, quota and billing eligibility."},
  {value:"google/gemini-2.5-flash",label:"Gemini 2.5 Flash",description:"Google Cloud Vertex AI · subject to project region, quota and billing eligibility."},
  {value:"google/gemini-2.5-flash-lite",label:"Gemini 2.5 Flash Lite",description:"Google Cloud Vertex AI · subject to project region, quota and billing eligibility."},
  {value:"mistralai/mistral-medium-3.5",label:"Mistral Medium 3.5",description:"xKiro story analysis."},
  {value:"mistralai/mistral-large-2512",label:"Mistral Large 3",description:"xKiro story analysis."}
];
export function isStoryAnalysisModel(value:unknown):value is StoryAnalysisModel{
  return typeof value==="string"&&(STORY_ANALYSIS_MODELS as readonly string[]).includes(value);
}
export function isVertexStoryAnalysisModel(value:unknown):value is StoryAnalysisModel{
  return typeof value==="string"&&value.startsWith("google/")&&isStoryAnalysisModel(value);
}
export function vertexStoryModelId(model:StoryAnalysisModel){
  if(!isVertexStoryAnalysisModel(model))throw new Error("This story model is not a Vertex AI model.");
  return model==="google/gemini-3.1-pro-preview"?(process.env.GEMINI_STORY_MODEL?.trim()||"gemini-3.1-pro-preview"):model.slice("google/".length);
}
export function storyAnalysisProviderLabel(model:StoryAnalysisModel){
  return isVertexStoryAnalysisModel(model)?`Google Cloud Vertex AI · ${vertexStoryModelId(model)}`:`xKiro · ${model}`;
}
