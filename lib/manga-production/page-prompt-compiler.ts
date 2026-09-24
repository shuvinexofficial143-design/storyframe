import type {MangaProject} from "../continuity/project-types";
import {normalizeName} from "../continuity/project-defaults";
import {getMangaLayout,getMangaNegativePrompt,isBlackAndWhiteMangaStyle,mangaColorInstruction,MANGA_STYLE_PROMPTS} from "./presets";
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

function imageSafeStoryText(value:string){
  return value
    .replace(/\b(?:gore|gory|blood(?:y)?|bleeding|corpse|dead body|mutilat(?:e|ed|ion)|dismember(?:ed|ment)?|decapitat(?:e|ed|ion)|disembowel(?:ed|ment)?|tortur(?:e|ed|ing)|suicide|self[- ]harm|rape|sexual assault|explicit sex|nude|naked)\b/gi,"")
    .replace(/\b(?:kill|killed|killing|murder|murdered|die|dies|died|death)\b/gi,"defeat")
    .replace(/\b(?:stab|stabbed|stabbing|shoot|shot|shooting)\b/gi,"confront")
    .replace(/\s{2,}/g," ")
    .trim();
}

function imageSafeStoryText(value:string){
  return value
    .replace(/\b(?:gore|gory|blood(?:y|ied|shed)?|mutilat(?:e|ed|ion)|dismember(?:ed|ment)?|decapitat(?:e|ed|ion)|disembowel(?:ed|ment)?|corpse|dead body|suicide|self[- ]harm|tortur(?:e|ed|ing)|rape|sexual assault|explicit sex|nude|naked)\b/gi,"non-graphic obscured detail")
    .replace(/\b(?:stab(?:bed|bing)?|shoot(?:ing|s|shot)?|kill(?:ed|ing|s)?|murder(?:ed|ing|s)?)\b/gi,"off-screen dangerous confrontation")
    .replace(/\s{2,}/g," ")
    .trim();
}

function styleSafePlannerNote(note:string,blackAndWhite:boolean){
  if(!note)return "";
  if(blackAndWhite)return note;
  return note
    .replace(/professional\s+black[- ]and[- ]white\s+manga/gi,"professional full-color manga")
    .replace(/black[- ]and[- ]white\s+manga/gi,"full-color manga")
    .replace(/grayscale\s+(?:manga|rendering|art)/gi,"full-color manga art")
    .replace(/monochrome\s+(?:manga|rendering|art)/gi,"full-color manga art")
    .replace(/screentone-only/gi,"full-color shaded");
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
  const blackAndWhite=isBlackAndWhiteMangaStyle(production.stylePreset);
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
      character.costumeLock.primaryColors.length?`Locked costume colors: ${character.costumeLock.primaryColors.join(", ")}.`:"",
      `Never redesign: ${character.negativeChanges.join("; ")}.`
    ].filter(Boolean).join(" "));
    const ref=characterReferencePriority(character)[0];
    if(ref&&referenceImages.length<3)referenceImages.push(ref);
  }

  const uniqueLocations=[...new Set(page.panels.map((panel)=>panel.location).filter(Boolean))];
  const locationBlocks=uniqueLocations.map((name)=>{
    const profile=production.locationProfiles.find((item)=>normalizeName(item.name)===normalizeName(name));
    const canonical=project.locations.find((item)=>normalizeName(item.name)===normalizeName(name));
    if(profile){
      const layoutFacts=Object.entries(profile.layout).map(([key,value])=>`${key}: ${value}`).join("; ");
      const colorFacts=canonical?.colorPalette?` Locked recurring color palette: ${canonical.colorPalette}.`:"";
      return `${profile.name}: ${profile.architecture}. Fixed layout: ${layoutFacts||"preserve established geometry"}. Fixed props: ${profile.importantProps.join(", ")||"none"}. Lighting: ${profile.lighting}.${colorFacts} ${profile.continuityNotes}`;
    }
    if(canonical)return `${canonical.name}: ${canonical.referencePrompt}. Geometry identity: ${canonical.geometryIdentity}. Important features: ${canonical.importantFeatures.join(", ")}. Locked color palette: ${canonical.colorPalette}.`;
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
    const panelSafetySource=[panel.storyBeat,panel.sourceText,panel.action,panel.pose,panel.expression,panel.imagePrompt,Object.values(panel.characterStates).flatMap((state)=>state.injuries).join(" ")].join(" ");
    const sensitivePanel=/\b(?:gore|gory|blood(?:y|ied|shed)?|mutilat|dismember|decapitat|disembowel|corpse|dead body|suicide|self[- ]harm|tortur|rape|sexual assault|explicit sex|nude|naked|stab|shoot|kill|murder)\b/i.test(panelSafetySource);
    if(sensitivePanel){
      return [
        `PANEL ${panel.panelNumber} — EXACT SLOT ${box}.`,
        "SAFETY PLACEHOLDER PANEL. The original story content for this slot is intentionally omitted and MUST NOT be inferred or recreated.",
        `Location continuity only: ${imageSafeStoryText(panel.location||"same established location")}.`,
        "Render an abstract heavily blurred manga background / soft screentone gradient with no identifiable action, anatomy, injury, intimate detail, weapon use, or sensitive event.",
        "No people are required in this placeholder. No readable text, speech balloon, caption, system text, graphic detail, nudity, or explicit content."
      ].join("\n");
    }
    const stateLines=Object.entries(panel.characterStates).map(([name,state])=>`${name}: location ${state.currentLocation}; position ${state.position}; direction ${state.bodyDirection}; pose ${state.pose}; expression ${state.expression}; outfit ${state.currentOutfit}; held ${state.heldObjects.join(", ")||"nothing"}; injuries ${state.injuries.join(", ")||"none"}; wet=${state.wetClothes}; dirty=${state.dirtyClothes}`).join(" | ");
    const plannerNote=styleSafePlannerNote(panel.imagePrompt,blackAndWhite);
    return [
      `PANEL ${panel.panelNumber} — EXACT SLOT ${box}.`,
      `Beat: ${imageSafeStoryText(panel.storyBeat)}.`,
      `Source context: ${imageSafeStoryText(panel.sourceText)}.`,
      `Visible characters: ${panel.characters.join(", ")||"none"}.`,
      stateLines?`Exact character state: ${stateLines}.`:"",
      `Action: ${imageSafeStoryText(panel.action)}. Pose: ${imageSafeStoryText(panel.pose)}. Expression: ${imageSafeStoryText(panel.expression)}. Body direction: ${panel.bodyDirection}. Positions: ${panel.characterPositions}.`,
      `Camera: ${panel.cameraShot}; ${panel.cameraAngle}; screen direction ${panel.cameraDirection}.`,
      `Scene layers: foreground ${panel.foreground}; midground ${panel.midground}; background ${panel.background}.`,
      `Composition: ${panel.composition}. Lighting: ${panel.lighting}. Mood: ${panel.mood}.`,
      `Important props: ${panel.importantProps.join(", ")||"none"}.`,
      `Continuity entering panel: ${imageSafeStoryText(panel.continuityFromPreviousPanel||page.startState)}.`,
      `Continuity leaving panel: ${imageSafeStoryText(panel.continuityToNextPanel||page.endState)}.`,
      plannerNote?`Planner visual note: ${imageSafeStoryText(plannerNote)}.`:"",
      "Leave a small clean negative-space area near an upper corner ONLY when this panel contains essential visible dialogue or a critical system notification. Otherwise prioritize uncluttered artwork. Do NOT draw speech balloons, system text, captions or any readable text."
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
    `PAGE FORMAT: portrait 2:3. Page ${page.pageNumber}. EXACTLY ${page.panels.length} panels. Layout preset: ${layout.label} (${page.panelLayout}). Use clean gutters and strong readable panel borders. Do not add, remove, merge, split or reorder panels. Reading order follows panel numbers 1 through ${page.panels.length}.`,
    `MANGA STYLE: ${MANGA_STYLE_PROMPTS[production.stylePreset]}. Keep the entire page visually unified, print-ready and professionally finished.`,
    mangaColorInstruction(production.stylePreset),
    `PAGE PURPOSE: ${imageSafeStoryText(page.pagePurpose)}. START STATE: ${imageSafeStoryText(page.startState)}. END STATE: ${imageSafeStoryText(page.endState)}. NEXT-PAGE CONTINUITY: ${imageSafeStoryText(page.continuityToNextPage)}.`,
    characterBlocks.length?`LOCKED CHARACTER BIBLE:\n${characterBlocks.join("\n")}`:"No recurring character bible is required for this page.",
    locationBlocks.length?`LOCKED LOCATION BIBLE:\n${locationBlocks.join("\n")}`:"",
    `PANEL BLUEPRINT — obey every numbered panel and its exact slot:\n\n${panelBlocks.join("\n\n")}`,
    strict?"STRICT CONTINUITY ACROSS THE WHOLE PAGE: the same recurring person must have the same face, hair, age, proportions and costume in every panel. Continue physical positions, held objects, injuries, wet/dirty clothing, architecture, recurring colors and screen direction from one panel to the next. Do not teleport or redesign anything unless the supplied story beat explicitly changes it.":"Maintain clear character, prop, location, color and screen-direction continuity across all panels.",
    previousPage?`PREVIOUS PAGE/CHAPTER CONTINUITY: ${previousPage.endState}. The supplied previous-page image, when present, is an authoritative visual continuity reference for character identity, costume, environment design and palette; continue those facts without copying its exact composition.`:"This is the first page with no prior rendered page reference; establish identities clearly from the locked bibles.",
    "TEXT-FREE ART ONLY: absolutely no dialogue lettering, captions, narration text, speech balloons, thought balloons, readable signs, page title, panel numbers, logos, watermarks or UI. StoryFrame will overlay ONLY short essential dialogue, critical system notifications and rare action SFX after generation. Long explanations belong in narration audio, not on the manga art.",
    "SAFETY STAGING: keep all imagery non-graphic. If a story beat implies sensitive, violent, sexual, or disturbing detail, preserve only the narrative reaction and composition; conceal the sensitive area with foreground occlusion, shadow, depth-of-field blur, silhouette, cropped framing, or an off-screen implication. Never depict explicit detail."
  ].filter(Boolean).join("\n\n");

  const negative=[
    getMangaNegativePrompt(production.stylePreset),
    "wrong panel count, extra panels, missing panels, merged panels, duplicated scenes, repeated character clones, inconsistent face between panels, inconsistent costume between panels, inconsistent recurring colors, panel order change, comic text, gibberish lettering, speech bubbles"
  ].join(", ");

  return {prompt,negativePrompt:negative,referenceImages:[...new Set(referenceImages)].slice(0,4)};
}
