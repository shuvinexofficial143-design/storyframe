import type {MangaProject} from "../continuity/project-types";
import {normalizeName} from "../continuity/project-defaults";
import {getMangaLayout,MANGA_NEGATIVE_PROMPT,MANGA_STYLE_PROMPTS} from "./presets";
import type {MangaChapterProduction,MangaPage} from "./types";

const MAX_INLINE_REFERENCE_CHARS=420_000;

function requestSafeImage(value?:string){
  return value&&(!value.startsWith("data:image/")||value.length<=MAX_INLINE_REFERENCE_CHARS)?value:undefined;
}

function characterReferencePriority(character:MangaProject["characters"][number]){
  const byType=(type:MangaProject["characters"][number]["referenceImages"][number]["type"])=>character.referenceImages.find((item)=>item.type===type)?.url;
  return [character.manualReferenceImage,byType("primary"),byType("sheet"),byType("three-quarter"),byType("side"),byType("full-body")]
    .map((value)=>requestSafeImage(value))
    .filter((value):value is string=>Boolean(value));
}

function selectedPageImage(page?:MangaPage){
  if(!page)return undefined;
  return requestSafeImage(page.rawPageImageDataUrl||page.composedImageDataUrl);
}

export function compileMangaPagePrompt(input:{
  project:MangaProject;
  production:MangaChapterProduction;
  page:MangaPage;
  previousPage?:MangaPage;
  stronger?:boolean;
}){
  const {project,production,page,previousPage}=input;
  const layout=getMangaLayout(page.panelLayout,page.panels.length);
  const pageCharacterNames=[...new Set(page.panels.flatMap((panel)=>panel.characters))];
  const characterBlocks:string[]=[];
  const referenceImages:string[]=[];

  for(const name of pageCharacterNames){
    const character=project.characters.find((item)=>normalizeName(item.name)===normalizeName(name));
    if(!character)continue;
    const identity=character.identityLock;
    characterBlocks.push([
      `${character.name} [${character.id}] — LOCKED RECURRING CHARACTER.`,
      `Face: ${identity.faceShape}; eyes ${identity.eyeShape}, ${identity.eyeColor}; skin ${identity.skinTone}.`,
      `Hair: ${identity.hairColor}, ${identity.hairLength}, ${identity.hairstyle}.`,
      `Body: ${identity.bodyBuild}, ${identity.heightClass}; apparent age ${identity.apparentAge}.`,
      `Default costume: ${character.costumeLock.primaryOutfit||character.outfit}. Accessories: ${character.costumeLock.accessories}.`,
      `Never redesign: ${character.negativeChanges.join("; ")}.`
    ].join(" "));
    const ref=characterReferencePriority(character)[0];
    if(ref&&referenceImages.length<3)referenceImages.push(ref);
  }

  const uniqueLocations=[...new Set(page.panels.map((panel)=>panel.location).filter(Boolean))];
  const locationBlocks=uniqueLocations.map((name)=>{
    const profile=production.locationProfiles.find((item)=>normalizeName(item.name)===normalizeName(name));
    const canonical=project.locations.find((item)=>normalizeName(item.name)===normalizeName(name));
    if(profile){
      const layoutFacts=Object.entries(profile.layout).map(([key,value])=>`${key}: ${value}`).join("; ");
      return `${profile.name}: ${profile.architecture}. Fixed layout: ${layoutFacts||"preserve established geometry"}. Fixed props: ${profile.importantProps.join(", ")||"none"}. Lighting: ${profile.lighting}. ${profile.continuityNotes}`;
    }
    if(canonical)return `${canonical.name}: ${canonical.referencePrompt}. Geometry identity: ${canonical.geometryIdentity}. Important features: ${canonical.importantFeatures.join(", ")}.`;
    return name;
  });

  for(const locationName of uniqueLocations){
    if(referenceImages.length>=3)break;
    const canonical=project.locations.find((item)=>normalizeName(item.name)===normalizeName(locationName));
    const ref=requestSafeImage(canonical?.referenceImages[0]?.url);
    if(ref)referenceImages.push(ref);
  }

  const panelBlocks=page.panels.map((panel,index)=>{
    const slot=layout.slots[index]||layout.slots.at(-1)!;
    const box=`left ${Math.round(slot.x*100)}%, top ${Math.round(slot.y*100)}%, width ${Math.round(slot.width*100)}%, height ${Math.round(slot.height*100)}%`;
    const stateLines=Object.entries(panel.characterStates).map(([name,state])=>`${name}: location ${state.currentLocation}; position ${state.position}; direction ${state.bodyDirection}; pose ${state.pose}; expression ${state.expression}; outfit ${state.currentOutfit}; held ${state.heldObjects.join(", ")||"nothing"}; injuries ${state.injuries.join(", ")||"none"}; wet=${state.wetClothes}; dirty=${state.dirtyClothes}`).join(" | ");
    return [
      `PANEL ${panel.panelNumber} — EXACT SLOT ${box}.`,
      `Beat: ${panel.storyBeat}.`,
      `Source context: ${panel.sourceText}.`,
      `Visible characters: ${panel.characters.join(", ")||"none"}.`,
      stateLines?`Exact character state: ${stateLines}.`:"",
      `Action: ${panel.action}. Pose: ${panel.pose}. Expression: ${panel.expression}. Body direction: ${panel.bodyDirection}. Positions: ${panel.characterPositions}.`,
      `Camera: ${panel.cameraShot}; ${panel.cameraAngle}; screen direction ${panel.cameraDirection}.`,
      `Scene layers: foreground ${panel.foreground}; midground ${panel.midground}; background ${panel.background}.`,
      `Composition: ${panel.composition}. Lighting: ${panel.lighting}. Mood: ${panel.mood}.`,
      `Important props: ${panel.importantProps.join(", ")||"none"}.`,
      `Continuity entering panel: ${panel.continuityFromPreviousPanel||page.startState}.`,
      `Continuity leaving panel: ${panel.continuityToNextPanel||page.endState}.`,
      panel.imagePrompt?`Planner visual note: ${panel.imagePrompt}.`:"",
      "Leave usable clean negative space near an upper corner for StoryFrame to add dialogue later. Do NOT draw speech balloons or any readable text."
    ].filter(Boolean).join("\n");
  });

  const previousImage=selectedPageImage(previousPage);
  if(previousImage){
    const withoutPrevious=[...new Set(referenceImages)].slice(0,3);
    referenceImages.length=0;
    referenceImages.push(...withoutPrevious,previousImage);
  }

  const strict=input.stronger||project.visualBible.continuityStrength==="strict";
  const prompt=[
    "Create EXACTLY ONE complete vertical professional manga PAGE, not an isolated panel and not a collage of unrelated images.",
    `PAGE FORMAT: portrait 2:3. Page ${page.pageNumber}. EXACTLY ${page.panels.length} panels. Layout preset: ${layout.label} (${page.panelLayout}). Use clean white gutters and strong black panel borders. Do not add, remove, merge, split or reorder panels. Reading order follows panel numbers 1 through ${page.panels.length}.`,
    `MANGA STYLE: ${MANGA_STYLE_PROMPTS[production.stylePreset]}. Keep the entire page visually unified, print-ready and professionally inked.`,
    `PAGE PURPOSE: ${page.pagePurpose}. START STATE: ${page.startState}. END STATE: ${page.endState}. NEXT-PAGE CONTINUITY: ${page.continuityToNextPage}.`,
    characterBlocks.length?`LOCKED CHARACTER BIBLE:\n${characterBlocks.join("\n")}`:"No recurring character bible is required for this page.",
    locationBlocks.length?`LOCKED LOCATION BIBLE:\n${locationBlocks.join("\n")}`:"",
    `PANEL BLUEPRINT — obey every numbered panel and its exact slot:\n\n${panelBlocks.join("\n\n")}`,
    strict?"STRICT CONTINUITY ACROSS THE WHOLE PAGE: the same recurring person must have the same face, hair, age, proportions and costume in every panel. Continue physical positions, held objects, injuries, wet/dirty clothing, architecture and screen direction from one panel to the next. Do not teleport or redesign anything unless the supplied story beat explicitly changes it.":"Maintain clear character, prop, location and screen-direction continuity across all panels.",
    previousPage?`PREVIOUS PAGE CONTINUITY: ${previousPage.endState}. The supplied previous-page image, when present, is continuity reference only; do not copy its exact composition.`:"This is the first page; establish identities clearly.",
    "TEXT-FREE ART ONLY: absolutely no dialogue lettering, captions, narration text, speech balloons, thought balloons, readable signs, page title, panel numbers, logos, watermarks or UI. StoryFrame will add dialogue, narration, SFX and the page number after image generation."
  ].filter(Boolean).join("\n\n");

  const negative=[
    MANGA_NEGATIVE_PROMPT,
    "wrong panel count, extra panels, missing panels, merged panels, duplicated scenes, repeated character clones, inconsistent face between panels, inconsistent costume between panels, panel order change, comic text, gibberish lettering, speech bubbles"
  ].join(", ");

  return {prompt,negativePrompt:negative,referenceImages:[...new Set(referenceImages)].slice(0,4)};
}
