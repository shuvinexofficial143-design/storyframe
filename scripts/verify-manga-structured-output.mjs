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
  const vertexStory=transpile("lib/vertex-story.ts").replace('"./story-analysis-models"','"./story-analysis-models.mjs"');
  fs.writeFileSync(path.join(tempDir,"vertex-story.mjs"),vertexStory);
  const xkiro=transpile("lib/xkiro.ts")
    .replace('"./story-analysis-models"','"./story-analysis-models.mjs"')
    .replace('"./vertex-story"','"./vertex-story.mjs"');
  fs.writeFileSync(path.join(tempDir,"xkiro.mjs"),xkiro);

  const {normalizeMangaStructuredData}=await import(pathToFileURL(path.join(tempDir,"structured-normalize.mjs")).href);
  const {extractFirstJsonObject}=await import(pathToFileURL(path.join(tempDir,"xkiro.mjs")).href);

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

  console.log("Manga structured-output regression checks passed.");
}finally{
  fs.rmSync(tempDir,{recursive:true,force:true});
}
