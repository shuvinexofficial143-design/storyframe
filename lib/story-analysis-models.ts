export const STORY_ANALYSIS_MODELS=[
  "mistralai/mistral-medium-3.5",
  "mistralai/mistral-large-2512"
] as const;

export type StoryAnalysisModel=(typeof STORY_ANALYSIS_MODELS)[number];

export const DEFAULT_STORY_ANALYSIS_MODEL:StoryAnalysisModel="mistralai/mistral-medium-3.5";

export const STORY_ANALYSIS_MODEL_OPTIONS:Array<{
  value:StoryAnalysisModel;
  label:string;
  description:string;
}>=[
  {
    value:"mistralai/mistral-medium-3.5",
    label:"Mistral Medium 3.5",
    description:"Fast and strong default for story analysis and prompt generation."
  },
  {
    value:"mistralai/mistral-large-2512",
    label:"Mistral Large 3",
    description:"Use for deeper story understanding and richer scene analysis."
  }
];

export function isStoryAnalysisModel(value:unknown):value is StoryAnalysisModel{
  return typeof value==="string"&&(STORY_ANALYSIS_MODELS as readonly string[]).includes(value);
}
