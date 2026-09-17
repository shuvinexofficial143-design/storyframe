import type {MangaProject} from "../continuity/project-types";
import type {MangaContinuityState,MangaPage,MangaStylePreset} from "./types";

export function getPreviousMangaChapter(project:MangaProject,chapterId:string){
  const index=project.chapters.findIndex((chapter)=>chapter.id===chapterId);
  return index>0?project.chapters[index-1]:undefined;
}

export function getPreviousRenderedMangaPage(project:MangaProject,chapterId:string):MangaPage|undefined{
  const previous=getPreviousMangaChapter(project,chapterId);
  if(!previous?.manga?.pages.length)return undefined;
  return [...previous.manga.pages].reverse().find((page)=>page.rawPageImageDataUrl||page.composedImageDataUrl)
    ||previous.manga.pages.at(-1);
}

export function getPreviousChapterContinuity(project:MangaProject,chapterId:string):MangaContinuityState|undefined{
  return getPreviousMangaChapter(project,chapterId)?.manga?.continuityState;
}

export function getInheritedMangaStyle(project:MangaProject,chapterId:string):MangaStylePreset|undefined{
  return getPreviousMangaChapter(project,chapterId)?.manga?.stylePreset;
}

export function continuationContextText(project:MangaProject,chapterId:string){
  const previous=getPreviousMangaChapter(project,chapterId);
  if(!previous?.manga)return "";
  const state=previous.manga.continuityState;
  return [
    `Previous chapter: ${previous.title}.`,
    `Previous chapter ending: ${state.previousPageEndState||previous.manga.pages.at(-1)?.endState||previous.manga.storySummary}.`,
    `Location at handoff: ${state.currentLocation||"unspecified"}.`,
    `Time at handoff: ${state.timeOfDay||"unspecified"}.`,
    `Character states at handoff: ${JSON.stringify(state.characters)}.`,
    `Active props at handoff: ${state.activeProps.join(", ")||"none"}.`,
    "Treat established character identities, costumes, recurring locations, props and visual palette as authoritative unless the new chapter explicitly changes them."
  ].join(" ");
}
