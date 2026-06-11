import type { AstroVideoSpec, SceneSpec } from "@zeroflow/core";
import type { ReactNode } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { AudioPlaceholder } from "../components/AudioPlaceholder";
import { AstroChartScene } from "../scenes/AstroChartScene";
import { D3DiagramScene } from "../scenes/D3DiagramScene";
import { SketchScene } from "../scenes/SketchScene";
import { TextScene } from "../scenes/TextScene";
import { ThreeScene } from "../scenes/ThreeScene";
import { buildSceneTimeline } from "../timeline";

export function AstroVideoComposition({ spec }: { spec: AstroVideoSpec }) {
  const timeline = buildSceneTimeline(spec);

  return (
    <AbsoluteFill style={{ background: "#102c2a" }}>
      {timeline.map((item) => (
        <Sequence
          durationInFrames={item.durationFrames}
          from={item.startFrame}
          key={item.scene.id}
        >
          <SceneRenderer scene={item.scene} />
        </Sequence>
      ))}
      <AudioPlaceholder spec={spec} />
    </AbsoluteFill>
  );
}

function SceneRenderer({ scene }: { scene: SceneSpec }) {
  return <SceneLayoutFrame scene={scene}>{sceneContent(scene)}</SceneLayoutFrame>;
}

function sceneContent(scene: SceneSpec) {
  switch (scene.type) {
    case "text":
      return <TextScene scene={scene} />;
    case "astro-chart":
      return <AstroChartScene scene={scene} />;
    case "sketch":
      return <SketchScene scene={scene} />;
    case "d3-diagram":
      return <D3DiagramScene scene={scene} />;
    case "three-scene":
      return <ThreeScene scene={scene} />;
  }
}

function SceneLayoutFrame({ children, scene }: { children: ReactNode; scene: SceneSpec }) {
  const layoutPreset = scene.layoutPreset ?? "single";

  if (layoutPreset === "single") {
    return <>{children}</>;
  }

  if (layoutPreset === "split") {
    return (
      <AbsoluteFill
        style={{
          overflow: "hidden",
          background: "linear-gradient(180deg, #102c2a 0%, #173f38 62%, #0e1918 100%)",
          color: "#fbfaf4"
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 56,
            top: 120,
            bottom: 150,
            zIndex: 2,
            display: "flex",
            width: 368,
            flexDirection: "column",
            justifyContent: "center"
          }}
        >
          <div
            style={{
              color: "#e8c164",
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: 0,
              lineHeight: 1.16,
              textTransform: "uppercase"
            }}
          >
            {scene.type}
          </div>
          <h2
            style={{
              margin: "24px 0 0",
              color: "#fbfaf4",
              fontSize: 58,
              fontWeight: 900,
              letterSpacing: 0,
              lineHeight: 1.04
            }}
          >
            {scene.title}
          </h2>
          <p
            style={{
              margin: "32px 0 0",
              color: "rgba(251,250,244,0.78)",
              fontSize: 29,
              fontWeight: 700,
              letterSpacing: 0,
              lineHeight: 1.34
            }}
          >
            {scene.narration}
          </p>
        </div>
        <div
          style={{
            position: "absolute",
            top: 82,
            right: -180,
            width: 1080,
            height: 1920,
            overflow: "hidden",
            border: "2px solid rgba(251,250,244,0.2)",
            borderRadius: 8,
            boxShadow: "0 34px 120px rgba(0,0,0,0.38)",
            transform: "scale(0.72)",
            transformOrigin: "top right"
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {children}
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 94,
          zIndex: 4,
          border: "1px solid rgba(255,255,255,0.22)",
          borderRadius: 8,
          padding: "28px 34px",
          background: "rgba(7, 20, 22, 0.64)",
          boxShadow: "0 26px 90px rgba(0,0,0,0.28)",
          color: "#fbfaf4"
        }}
      >
        <div
          style={{
            color: "#e8c164",
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: 0,
            lineHeight: 1.1
          }}
        >
          {scene.title}
        </div>
        <div
          style={{
            marginTop: 12,
            maxWidth: 820,
            color: "rgba(251,250,244,0.84)",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: 0,
            lineHeight: 1.24
          }}
        >
          {scene.narration}
        </div>
      </div>
    </AbsoluteFill>
  );
}
