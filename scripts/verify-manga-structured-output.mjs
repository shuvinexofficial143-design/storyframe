import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";

const require=createRequire(import.meta.url);
const ts=require("typescript");
const root=process.cwd();
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),"storyframe-manga-json-"));
const transpile=(fileName)=>ts.transpileModule(fs.readFileSync(path.join(root,fileName),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;

try{
  fs.writeFileSync(path.join(tempDir,"structured-normalize.mjs"),transpile("lib/manga-production/structured-normalize.ts"));
  fs.writeFileSync(path.join(tempDir,"story-analysis-models.mjs"),transpile("lib/story-analysis-models.ts"));
  fs.writeFileSync(path.join(tempDir,"pacing-policy.mjs"),transpile("lib/manga-production/pacing-policy.ts"));
  const vertexStory=transpile("lib/vertex-story.ts").replace('"./story-analysis-models"','"./story-analysis-models.mjs"');
  fs.writeFileSync(path.join(tempDir,"vertex-story.mjs"),vertexStory);
  const xkiro=transpile("lib/xkiro.ts")
    .replace('"./story-analysis-models"','"./story-analysis-models.mjs"')
    .replace('"./vertex-story"','"./vertex-story.mjs"');
  fs.writeFileSync(path.join(tempDir,"xkiro.mjs"),xkiro);
  const fallback=transpile("lib/story-model-fallback.ts")
    .replace('"./story-analysis-models"','"./story-analysis-models.mjs"')
    .replace('"./xkiro"','"./xkiro.mjs"');
  fs.writeFileSync(path.join(tempDir,"story-model-fallback.mjs"),fallback);

  const {normalizeMangaStructuredData}=await import(pathToFileURL(path.join(tempDir,"structured-normalize.mjs")).href);
  const {estimateAdaptivePacing,partitionPagePanelCounts,partitionPlanningChunkCounts}=await import(pathToFileURL(path.join(tempDir,"pacing-policy.mjs")).href);
  const {parseVertexJsonObject}=await import(pathToFileURL(path.join(tempDir,"vertex-story.mjs")).href);
  const {extractFirstJsonObject}=await import(pathToFileURL(path.join(tempDir,"xkiro.mjs")).href);
  const {isRetryableVertexStoryFailure,withStoryModelFallback}=await import(pathToFileURL(path.join(tempDir,"story-model-fallback.mjs")).href);

  const master=normalizeMangaStructuredData({
    storySummary:"Test story",
    characters:{Hero:{role:"lead",face:"sharp",accessories:"scarf; ring"}},
    locations:'{"Hall":{"architecture":"stone","importantProps":"altar; door"}}',
    props:{Sword:"black blade"},
    timeline:"Hero enters; Hero notices sword",
    beats:"Hero enters hall; Hero sees sword; Hero reaches for sword; Hero reacts",
    initialCharacterStates:{Hero:{currentLocation:"Hall",heldObjects:"key; map"}}
  });
  assert.equal(Array.isArray(master.timeline),true);
  assert.equal(master.timeline.length,2);
  assert.equal(master.timeline[0].event,"Hero enters");
  assert.equal(Array.isArray(master.characters),true);
  assert.equal(master.characters[0].name,"Hero");
  assert.deepEqual(master.characters[0].face,{});
  assert.deepEqual(master.characters[0].accessories,["scarf","ring"]);
  assert.equal(Array.isArray(master.locations),true);
  assert.deepEqual(master.locations[0].importantProps,["altar","door"]);
  assert.equal(master.props[0].appearance,"black blade");
  assert.equal(master.beats.length,4);
  assert.deepEqual(master.initialCharacterStates[0].heldObjects,["key","map"]);

  const continuity=normalizeMangaStructuredData({
    timeline:["night begins","door opens"],
    timeOfDay:"night",
    currentLocation:"Hall",
    characters:[{characterName:"Hero",pose:"standing",heldObjects:"key"}]
  });
  assert.equal(typeof continuity.timeline,"string");
  assert.match(continuity.timeline,/night begins/);
  assert.equal(continuity.characters.Hero.pose,"standing");
  assert.deepEqual(continuity.characters.Hero.heldObjects,["key"]);

  const pageOutput=normalizeMangaStructuredData({
    pages:{page1:{
      pagePurpose:"intro",
      startState:"start",
      panels:{
        p1:{beatId:"beat-1",storyBeat:"one",characters:"Hero; Guide",dialogue:"Hello",importantProps:"key"},
        p2:{beatId:"beat-2",storyBeat:"two"},
        p3:{beatId:"beat-3",storyBeat:"three"}
      },
      endState:["door open","hero inside"]
    }},
    consumedBeatCount:"3",
    endState:"Hero is inside"
  });
  assert.equal(Array.isArray(pageOutput.pages),true);
  assert.equal(pageOutput.pages[0].panels.length,3);
  assert.deepEqual(pageOutput.pages[0].panels[0].characters,["Hero","Guide"]);
  assert.equal(pageOutput.pages[0].panels[0].dialogue[0].text,"Hello");
  assert.equal(pageOutput.pages[0].endState,"door open; hero inside");
  assert.equal(pageOutput.consumedBeatCount,3);
  assert.equal(typeof pageOutput.endState,"object");

  assert.deepEqual(extractFirstJsonObject('```json\n{"timeline":"night",}\n```'),{timeline:"night"});
  assert.deepEqual(extractFirstJsonObject('{"timeline":[{"event":"a"},{"event":"b"'),{timeline:[{event:"a"},{event:"b"}]});
  assert.deepEqual(extractFirstJsonObject('{"storySummary":"hello","timeline":'),{storySummary:"hello",timeline:null});
  assert.deepEqual(extractFirstJsonObject('{"text":"hello\nworld"}'),{text:"hello\nworld"});

  assert.deepEqual(parseVertexJsonObject('```json\n{"pages":[{"id":1,}],}\n```'),{pages:[{id:1}]});
  assert.deepEqual(parseVertexJsonObject('{"pages":[{"id":1},{"id":2}'),{pages:[{id:1},{id:2}]});
  assert.deepEqual(parseVertexJsonObject('{"text":"hello\nworld"}'),{text:"hello\nworld"});

  const syntheticStory=Array.from({length:320},(_,index)=>`word${index}`).join(" ");
  const fast=estimateAdaptivePacing(syntheticStory,"Fast");
  const balanced=estimateAdaptivePacing(syntheticStory,"Balanced");
  const cinematic=estimateAdaptivePacing(syntheticStory,"Cinematic");
  assert.equal(fast.targetBeats,23);
  assert.equal(balanced.targetBeats,40);
  assert.equal(cinematic.targetBeats,80);
  assert.ok(cinematic.targetBeats>balanced.targetBeats&&balanced.targetBeats>fast.targetBeats);
  assert.equal(balanced.maxBeats,50);
  const panelCounts=partitionPagePanelCounts(40,"Balanced");
  assert.equal(panelCounts.length,12);
  assert.equal(panelCounts.reduce((sum,value)=>sum+value,0),40);
  assert.ok(panelCounts.every((value)=>value>=3&&value<=5));
  const planningChunks=partitionPlanningChunkCounts(40,"Balanced");
  assert.deepEqual(planningChunks,panelCounts);
  assert.equal(planningChunks.length,12);
  assert.ok(planningChunks.every((value)=>value>=3&&value<=5));
  const highChunks=partitionPlanningChunkCounts(80,"Cinematic");
  assert.equal(highChunks.reduce((sum,value)=>sum+value,0),80);
  assert.ok(highChunks.every((value)=>value>=3&&value<=5));

  assert.equal(isRetryableVertexStoryFailure(new Error("Vertex Gemini story request failed (429): Resource exhausted.")),true);
  assert.equal(isRetryableVertexStoryFailure(new Error("Vertex Gemini story request failed (400): bad request")),false);
  const oldKey=process.env.XKIRO_API_KEY;
  process.env.XKIRO_API_KEY="regression-test-key";
  const attempted=[];
  const retryDelays=[];
  const fallbackResult=await withStoryModelFallback({
    model:"google/gemini-3.1-pro-preview",
    sleep:async(ms)=>{retryDelays.push(ms)},
    run:async(model)=>{
      attempted.push(model);
      if(model==="google/gemini-3.1-pro-preview")throw new Error("Vertex Gemini story request failed (429): Resource exhausted.");
      return "planned";
    }
  });
  assert.deepEqual(retryDelays,[2000,5000]);
  assert.deepEqual(attempted,["google/gemini-3.1-pro-preview","google/gemini-3.1-pro-preview","google/gemini-3.1-pro-preview","mistralai/mistral-large-2512"]);
  assert.equal(fallbackResult.data,"planned");
  assert.equal(fallbackResult.fallbackUsed,true);

  const recoveredAttempts=[];
  const recovered=await withStoryModelFallback({
    model:"google/gemini-3.1-pro-preview",
    sleep:async()=>{},
    run:async(model)=>{
      recoveredAttempts.push(model);
      if(recoveredAttempts.length===1)throw new Error("Vertex Gemini story request failed (429): Resource exhausted.");
      return "recovered-on-gemini";
    }
  });
  assert.deepEqual(recoveredAttempts,["google/gemini-3.1-pro-preview","google/gemini-3.1-pro-preview"]);
  assert.equal(recovered.data,"recovered-on-gemini");
  assert.equal(recovered.fallbackUsed,false);
  if(oldKey===undefined)delete process.env.XKIRO_API_KEY;else process.env.XKIRO_API_KEY=oldKey;

  const typeSource=fs.readFileSync(path.join(root,"lib/manga-production/types.ts"),"utf8");
  const presetSource=fs.readFileSync(path.join(root,"lib/manga-production/presets.ts"),"utf8");
  const composerSource=fs.readFileSync(path.join(root,"lib/manga-production/full-page-composer.ts"),"utf8");
  const studioSource=fs.readFileSync(path.join(root,"components/manga-page-production-studio.tsx"),"utf8");
  const queueSource=fs.readFileSync(path.join(root,"lib/manga-production/image-request-queue.ts"),"utf8");
  const chapterContinuitySource=fs.readFileSync(path.join(root,"lib/manga-production/chapter-continuity.ts"),"utf8");
  const workspaceSource=fs.readFileSync(path.join(root,"components/storyframe-workspace.tsx"),"utf8");
  const homePageSource=fs.readFileSync(path.join(root,"app/page.tsx"),"utf8");
  const appShellSource=fs.readFileSync(path.join(root,"components/app-shell.tsx"),"utf8");
  const homeSource=fs.readFileSync(path.join(root,"app/page.tsx"),"utf8");
  const storyGeneratorSource=fs.readFileSync(path.join(root,"components/story-generator-workspace.tsx"),"utf8");
  const storyGeneratorApiSource=fs.readFileSync(path.join(root,"app/api/story-generator/route.ts"),"utf8");
  assert.match(typeSource,/"Full Color Manga"/);
  assert.match(presetSource,/COLOR MODE: FULL COLOR/);
  assert.match(presetSource,/no monochrome-only page/);
  assert.match(composerSource,/isBlackAndWhiteMangaStyle\(stylePreset\)\?"grayscale\(1\) contrast\(1\.04\)":"none"/);
  assert.match(studioSource,/New Chapter/);
  assert.match(studioSource,/getPreviousRenderedMangaPage/);
  assert.match(studioSource,/requestQueuedMangaImage/);
  assert.match(studioSource,/filter\(\(page\)=>!page\.composedImageDataUrl\)/);
  assert.match(queueSource,/DEFAULT_IMAGE_REQUEST_INTERVAL_MS=12_000/);
  assert.match(queueSource,/20_000,40_000,60_000/);
  assert.match(chapterContinuitySource,/previous chapter ending/i);
  assert.match(studioSource,/fetch\("\/api\/manga\/production-plan"/);
  assert.match(studioSource,/storyframe-manga-background-run:/);
  assert.doesNotMatch(workspaceSource,/DurableMangaBuildShell/);
  assert.match(homePageSource,/force-dynamic/);
  assert.doesNotMatch(appShellSource,/if\(path===\"\/\\"\) return/);
  assert.match(appShellSource,/Continuity Studio/);
  assert.match(appShellSource,/Projects/);
  assert.match(appShellSource,/Settings/);
  assert.match(appShellSource,/StoryFrameWorkspace/);
  assert.match(appShellSource,/storyframe:manga-job-status/);
  assert.match(studioSource,/storyframe:manga-job-status/);
  assert.doesNotMatch(studioSource,/tabs\.map\(\(\[id,label\]\)=>\<button key=\{id\} disabled=\{!!busy\}/);
  assert.match(homeSource,/return null/);
  assert.match(appShellSource,/Story Generator/);
  assert.match(appShellSource,/StoryGeneratorWorkspace/);
  assert.match(storyGeneratorSource,/Generate Story Overview/);
  assert.match(storyGeneratorSource,/Explainer Prompt/);
  assert.match(storyGeneratorSource,/storyframe:story-generator-command/);
  assert.match(storyGeneratorApiSource,/Write exactly ONE next chapter/);
  assert.match(storyGeneratorApiSource,/Do not hard-cap chapter count/);
  assert.match(storyGeneratorApiSource,/readableStructuredText/);
  assert.match(storyGeneratorApiSource,/storyBible:FlexibleText\(20\)/);
  assert.match(storyGeneratorApiSource,/majorArcs:FlexibleTextArray/);
  assert.match(storyGeneratorApiSource,/compactExcerpt/);
  assert.match(storyGeneratorApiSource,/summary:value\.summary\.length>=20/);
  assert.match(storyGeneratorApiSource,/endingState:value\.endingState\.length>=10/);
  assert.match(storyGeneratorApiSource,/continuityMemory:value\.continuityMemory\.length>=20/);
  assert.doesNotMatch(storyGeneratorApiSource,/z\.coerce\.boolean/);
  assert.match(studioSource,/storyframe:story-generator-result/);

  console.log("Manga structured-output, one-page pacing, color-style, chapter-continuity and quota-queue regression checks passed.");
}finally{
  fs.rmSync(tempDir,{recursive:true,force:true});
}
