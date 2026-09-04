export type Character={id:string;name:string;role:string;appearance:string;outfit:string;locked:boolean};
export type Location={id:string;name:string;architecture:string;lighting:string;continuity:string;locked:boolean};
export type Scene={id:string;sceneNumber:number;sourceText:string;description:string;characterIds:string[];locationId?:string;cameraShot:string;cameraAngle:string;duration:number;imagePrompt:string;negativePrompt:string;continuityNotes:string;generatedImage?:string;generationStatus:"idle"|"queued"|"generating"|"completed"|"failed"};
export type ProjectState={id:string;name:string;storyTitle:string;chapter:string;visualStyle:string;aspectRatio:string;story:string;summary:string;characters:Character[];locations:Location[];scenes:Scene[]};
