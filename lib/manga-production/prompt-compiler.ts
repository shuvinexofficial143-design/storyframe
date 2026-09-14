import type {MangaProject} from "../continuity/project-types";
import {normalizeName} from "../continuity/project-defaults";
import {MANGA_NEGATIVE_PROMPT,MANGA_STYLE_PROMPTS} from "./presets";
import type {MangaChapterProduction,MangaPage,MangaPanel} from "./types";

function selectedImage(panel?:MangaPanel){
  if(!panel)return undefined;
  return panel.versions.find((version)=>version.id===panel.selectedVersionId)?.imageDataUrl||panel.versions.at(-1)?.imageDataUrl;
}

function characterReferencePriority(character:MangaProject["characters"][number]){
  const byType=(type:MangaProject["characters"][number]["referenceImages"][number]["type"])=>character.referenceImages.find((item)=>item.type===type)?.url;
  return [
    character.manualReferenceImage,
    byType("primary"),
    byType("sheet"),
    byType("three-quarter"),
    byType("side"),
    byType("full-body")
  ].filter((value):value is string=>Boolean(value));
}

export function compileMangaPanelPrompt(input:{project:MangaProject;production:MangaChapterProduction;page:MangaPage;panel:MangaPanel;previousPanel?:MangaPanel;stronger?:boolean}){
  const {project,production,page,panel,previousPanel}=input;
  const characterBlocks:string[]=[];
  const referenceImages:string[]=[];

  for(const name of panel.characters){
    const character=project.characters.find((item)=>normalizeName(item.name)===normalizeName(name));
    const state=panel.characterStates[name]||production.initialCharacterStates[name]||production.continuityState.characters[name];
    if(character){
      const identity=character.identityLock;
      const costume=state?.currentOutfit||character.costumeLock.primaryOutfit||character.outfit;
      characterBlocks.push([
        `${character.name} [${character.id}] — LOCKED CHARACTER IDENTITY.`,
        `Face: ${identity.faceShape}; eyes ${identity.eyeShape}, ${identity.eyeColor}; skin ${identity.skinTone}.`,
        `Hair: ${identity.hairColor}, ${identity.hairLength}, ${identity.hairstyle}.`,
        `Body: ${identity.bodyBuild}, ${identity.heightClass}; apparent age ${identity.apparentAge}.`,
        `Outfit: ${costume}. Accessories: ${character.costumeLock.accessories}. Weapons: ${character.costumeLock.weapons.join(", ")||"none"}.`,
        state?`CURRENT PANEL STATE: location ${state.currentLocation}; position ${state.position}; direction ${state.bodyDirection}; pose ${state.pose}; expression ${state.expression}; held objects ${state.heldObjects.join(", ")||"none"}; injuries ${state.injuries.join(", ")||"none"}; dirty clothes ${state.dirtyClothes}; wet clothes ${state.wetClothes}.`:"",
        `Consistency: ${character.negativeChanges.join("; ")}.`
      ].filter(Boolean).join(" "));

      // Prefer a canonical portrait plus one alternate identity view/sheet when available.
      // The final provider request remains capped at four total references, so two-character
      // panels naturally prioritize identity evidence before location/previous-panel imagery.
      const identityRefs=[...new Set(characterReferencePriority(character))].slice(0,2);
      referenceImages.push(...identityRefs);
    }else{
      characterBlocks.push(`${name}: preserve the exact established face, hairstyle, age, body proportions, outfit and accessories from earlier manga panels.`);
    }
  }

  const locationProfile=production.locationProfiles.find((item)=>normalizeName(item.name)===normalizeName(panel.location));
  const projectLocation=project.locations.find((item)=>normalizeName(item.name)===normalizeName(panel.location));
  const locationBlock=locationProfile
    ?`${locationProfile.name}: ${locationProfile.architecture}. FIXED LAYOUT: ${Object.entries(locationProfile.layout).map(([key,value])=>`${key}: ${value}`).join("; ")}. Important fixed props: ${locationProfile.importantProps.join(", ")||"none"}. Lighting: ${locationProfile.lighting}. Continuity: ${locationProfile.continuityNotes}.`
    :projectLocation?`${projectLocation.name}: ${projectLocation.referencePrompt}. Layout identity: ${projectLocation.geometryIdentity}. Important features: ${projectLocation.importantFeatures.join(", ")}.`:panel.location;
  if(projectLocation?.referenceImages[0]?.url)referenceImages.push(projectLocation.referenceImages[0].url);

  const propBlocks=panel.importantProps.map((name)=>{
    const tracked=production.propStates.find((item)=>normalizeName(item.name)===normalizeName(name));
    const canonical=project.props.find((item)=>normalizeName(item.name)===normalizeName(name));
    if(tracked)return `${tracked.name}: ${tracked.appearance}; owner ${tracked.currentOwner||"unchanged"}; location ${tracked.currentLocation||"unchanged"}; condition ${tracked.condition}; ${tracked.continuityNotes}`;
    if(canonical)return `${canonical.name}: ${canonical.canonicalPrompt}; preserve exact recurring design.`;
    return `${name}: preserve its established appearance and current story state.`;
  });

  const previousImage=selectedImage(previousPanel);
  if(previousImage)referenceImages.push(previousImage);

  const strict=input.stronger||project.visualBible.continuityStrength==="strict";
  const prompt=[
    "Create exactly ONE professional black-and-white manga panel. This is a single panel image, not a full comic page.",
    `MANGA STYLE: ${MANGA_STYLE_PROMPTS[production.stylePreset]}.`,
    `PANEL STORY MOMENT: ${panel.storyBeat}.`,
    `SOURCE CONTEXT: ${panel.sourceText}.`,
    characterBlocks.length?`CHARACTERS: ${characterBlocks.join("\n")}`:"CHARACTERS: no recurring character is visible in this panel.",
    `CURRENT PANEL ACTION: ${panel.action}. Expression: ${panel.expression}. Pose: ${panel.pose}. Body direction: ${panel.bodyDirection}. Character positions: ${panel.characterPositions}.`,
    `LOCATION: ${locationBlock}.`,
    propBlocks.length?`PROPS / OBJECT STATE: ${propBlocks.join(" ")}`:"",
    `CAMERA: ${panel.cameraShot}; angle ${panel.cameraAngle}; screen/camera direction ${panel.cameraDirection}. Composition: ${panel.composition}. Foreground: ${panel.foreground}. Midground: ${panel.midground}. Background: ${panel.background}.`,
    `LIGHTING / MOOD: ${panel.lighting}. ${panel.mood}.`,
    `PREVIOUS PANEL CONTINUITY: ${panel.continuityFromPreviousPanel||page.startState}.`,
    `NEXT PANEL PREPARATION: ${panel.continuityToNextPanel||page.endState}.`,
    strict?"STRICT CONTINUITY: continue from the immediately previous physical state. Do not teleport characters, flip established screen direction without story reason, change held objects, change injuries, change outfit, redesign faces, or move fixed room architecture. Every visible action must be the immediate next action in the sequence.":"Maintain clear character and environment continuity.",
    panel.imagePrompt?`PLANNER VISUAL NOTES: ${panel.imagePrompt}.`:"",
    "TEXT-FREE ART ONLY: do not render dialogue, captions, narration, speech balloons, letters, readable signs, logos, UI or watermarks. StoryFrame will overlay dialogue after image generation."
  ].filter(Boolean).join("\n\n");

  const negative=[MANGA_NEGATIVE_PROMPT,panel.negativePrompt,project.visualBible.negativeStylePrompt].filter(Boolean).join(", ");
  return {prompt,negativePrompt:negative,referenceImages:[...new Set(referenceImages)].slice(0,4)};
}
