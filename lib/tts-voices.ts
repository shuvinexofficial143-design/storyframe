export const STORYFRAME_TTS_VOICES=[
  {id:"Kore",label:"Kore · Female"},
  {id:"Aoede",label:"Aoede · Female"},
  {id:"Leda",label:"Leda · Female"},
  {id:"Zephyr",label:"Zephyr · Female"},
  {id:"Charon",label:"Charon · Male"},
  {id:"Fenrir",label:"Fenrir · Male"},
  {id:"Orus",label:"Orus · Male"},
  {id:"Puck",label:"Puck · Male"},
  {id:"Iapetus",label:"Iapetus · Male"},
  {id:"Schedar",label:"Schedar · Male"}
] as const;

export type StoryframeTtsVoice=(typeof STORYFRAME_TTS_VOICES)[number]["id"];
export const DEFAULT_TTS_VOICE:StoryframeTtsVoice="Kore";
export const DEFAULT_TTS_STYLE="Narrate this Hindi story explainer naturally, clearly and cinematically. Keep pronunciation accurate, use expressive but controlled emotion, and use natural pauses.";
