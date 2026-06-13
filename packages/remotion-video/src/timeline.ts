import type { AstroVideoSpec, SceneSpec } from "@zeroflow/core";

export type SceneTimelineItem = {
  index: number;
  scene: SceneSpec;
  startFrame: number;
  durationFrames: number;
  endFrame: number;
};

export function secondsToFrames(seconds: number, fps: number) {
  return Math.max(1, Math.ceil(seconds * fps));
}

export function buildSceneTimeline(spec: AstroVideoSpec): SceneTimelineItem[] {
  let cursor = 0;

  return spec.scenes.map((scene, index) => {
    const durationFrames = secondsToFrames(scene.durationSec, spec.fps);
    const item: SceneTimelineItem = {
      index,
      scene,
      startFrame: cursor,
      durationFrames,
      endFrame: cursor + durationFrames
    };

    cursor += durationFrames;
    return item;
  });
}
