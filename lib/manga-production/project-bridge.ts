import type {AnalyzeChapterResponse,MangaProject} from "../continuity/project-types";
import {mergeCharacterReferences,mergeLocationReferences,mergeObjectReferences} from "../continuity/project-merge";
import {isBlackAndWhiteMangaStyle} from "./presets";
import type {MangaMasterAnalysis,MangaStylePreset} from "./types";

export function mergeMangaMasterIntoProject(project:MangaProject,chapterId:string,master:MangaMasterAnalysis,stylePreset:MangaStylePreset="Classic Black & White Manga"){
  const characters:AnalyzeChapterResponse["characters"]=master.characters.map((item)=>({
    name:item.name,
    role:item.role,
    visualDescription:[`${item.gender}, ${item.approximateAge}`,`face ${item.face.shape}`,`eyes ${item.face.eyes}`,`eyebrows ${item.face.eyebrows}`,`nose ${item.face.nose}`,`mouth ${item.face.mouth}`,item.face.specialFeatures,`${item.hair.color} ${item.hair.length} ${item.hair.style} hair`,`${item.body.build}, ${item.body.height}, ${item.body.proportions}`].filter(Boolean).join(", "),
    outfit:item.currentOutfit||item.defaultOutfit,
    eyeColor:item.face.eyes,
    hairColor:item.hair.color,
    keyFeatures:[item.face.specialFeatures,item.consistencyNotes].filter(Boolean),
    referencePrompt:`${item.name}, ${item.gender}, ${item.approximateAge}, ${item.face.shape} face, ${item.face.eyes}, ${item.face.eyebrows}, ${item.face.nose}, ${item.face.mouth}, ${item.face.specialFeatures}, ${item.hair.color} ${item.hair.length} ${item.hair.style} hair, ${item.body.build}, ${item.body.height}, ${item.body.proportions}, wearing ${item.currentOutfit||item.defaultOutfit}, accessories ${item.accessories.join(", ")||"none"}. ${item.consistencyNotes}`,
    identityLock:{gender:item.gender,apparentAge:item.approximateAge,faceShape:item.face.shape,eyeColor:item.face.eyes,eyeShape:item.face.eyes,hairColor:item.hair.color,hairLength:item.hair.length,hairstyle:item.hair.style,bodyBuild:item.body.build,heightClass:item.body.height},
    costumeLock:{primaryOutfit:item.defaultOutfit,accessories:item.accessories.join(", ")},
    personalityVisuals:item.consistencyNotes
  }));

  const locationPalette=isBlackAndWhiteMangaStyle(stylePreset)
    ?"black, white, grayscale screentones"
    :project.visualBible.visualStyle.colorPalette.join(", ")||"preserve the story-established full-color palette";

  const locations:AnalyzeChapterResponse["locations"]=master.locations.map((item)=>({
    name:item.name,
    architectureStyle:item.architecture,
    lighting:item.lighting,
    colorPalette:locationPalette,
    referencePrompt:`${item.name}, ${item.architecture}. Fixed layout: ${Object.entries(item.layout).map(([key,value])=>`${key}: ${value}`).join("; ")}. Important props: ${item.importantProps.join(", ")||"none"}. Palette: ${locationPalette}. ${item.continuityNotes}`,
    geometryIdentity:Object.entries(item.layout).map(([key,value])=>`${key}: ${value}`).join("; ")||item.continuityNotes,
    materials:"preserve story-established materials",
    importantFeatures:[...Object.entries(item.layout).map(([key,value])=>`${key}: ${value}`),...item.importantProps]
  }));

  const props:AnalyzeChapterResponse["props"]=master.props.map((item)=>({
    name:item.name,kind:"prop",owner:item.currentOwner||undefined,shape:item.appearance,size:"story-established scale",materials:"preserve visible story-established materials",colors:[],ornamentation:"preserve established details",magicalEffects:"none unless story explicitly establishes them",canonicalPrompt:`${item.name}: ${item.appearance}. Condition: ${item.condition}. ${item.continuityNotes}`
  }));

  return {
    characters:mergeCharacterReferences(project.characters,characters,chapterId,project.visualBible.masterSeed),
    locations:mergeLocationReferences(project.locations,locations,chapterId),
    props:mergeObjectReferences(project.props,props,chapterId,"prop")
  };
}
