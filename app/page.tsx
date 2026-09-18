import {AnalysisModelSelector} from "@/components/analysis-model-selector";
import {StoryFrameWorkspace} from "@/components/storyframe-workspace";

export const dynamic="force-dynamic";

export default function HomePage(){
  return <>
    <AnalysisModelSelector/>
    <StoryFrameWorkspace/>
  </>;
}
