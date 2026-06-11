export * from "./schema";
export * from "./project";
export * from "./canvas";

export const phaseSummary = {
  phase: "P3",
  title: "Video preview workflow",
  goal: "Turn the canvas into AstroVideoSpec and drive Remotion previews and local export."
} as const;

export const workflowNodes = [
  {
    id: "topic",
    kind: "topic",
    title: "Topic",
    description: "Choose the topic for each video",
    position: { x: 72, y: 110 }
  },
  {
    id: "script",
    kind: "script",
    title: "Script",
    description: "Generate and edit narration and beats",
    position: { x: 292, y: 110 }
  },
  {
    id: "storyboard",
    kind: "storyboard",
    title: "Storyboard",
    description: "Split the script into editable scenes",
    position: { x: 512, y: 110 }
  },
  {
    id: "assets",
    kind: "assets",
    title: "Assets",
    description: "Reuse or generate captions, voice, charts, and images",
    position: { x: 182, y: 340 }
  },
  {
    id: "preview",
    kind: "preview",
    title: "Preview",
    description: "Combine scenes and assets into a Remotion preview",
    position: { x: 402, y: 340 }
  }
] as const;
