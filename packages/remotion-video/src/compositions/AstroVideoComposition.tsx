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
import { RemoteVisualAsset } from "../components/RemoteVisualAsset";

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
  return (
    <SceneLayoutFrame scene={scene} supplementary={<SupplementaryVisualLayers scene={scene} />}>
      {sceneContent(scene)}
    </SceneLayoutFrame>
  );
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

function SceneLayoutFrame({
  children,
  scene,
  supplementary
}: {
  children: ReactNode;
  scene: SceneSpec;
  supplementary: ReactNode;
}) {
  const layoutPreset = scene.layoutPreset ?? "single";

  if (layoutPreset === "single") {
    return (
      <>
        {children}
        {supplementary}
      </>
    );
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
        {supplementary}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {children}
      {supplementary}
    </AbsoluteFill>
  );
}

function SupplementaryVisualLayers({ scene }: { scene: SceneSpec }) {
  const layers = scene.visualLayers ?? [];

  if (layers.length === 0) {
    return null;
  }

  return (
    <>
      {layers.map((layer, index) => {
        const layout = supplementaryLayerLayout(scene.layoutPreset ?? "single", index);

        return (
          <div key={`${layer.kind}-${index}`} style={layout}>
            {layer.kind === "image" ? (
              <SupplementaryImageLayer title={layer.title ?? scene.title} url={layer.assetUrl} />
            ) : (
              <SupplementaryChartLayer title={layer.title ?? scene.title} url={layer.assetUrl} />
            )}
          </div>
        );
      })}
    </>
  );
}

function supplementaryLayerLayout(layoutPreset: string, index: number) {
  if (layoutPreset === "split") {
    return {
      position: "absolute" as const,
      left: 58,
      bottom: 160 + index * 290,
      zIndex: 6,
      width: 360,
      height: 250,
      overflow: "hidden",
      border: "2px solid rgba(251,250,244,0.34)",
      borderRadius: 8,
      boxShadow: "0 24px 76px rgba(0,0,0,0.28)"
    };
  }

  return {
    position: "absolute" as const,
    right: 64,
    top: 210 + index * 280,
    zIndex: 6,
    width: 328,
    height: 328,
    overflow: "hidden",
    border: "2px solid rgba(251,250,244,0.34)",
    borderRadius: 8,
    boxShadow: "0 24px 76px rgba(0,0,0,0.28)"
  };
}

function SupplementaryImageLayer({ title, url }: { title: string; url?: string }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#fbfaf4"
      }}
    >
      {url ? (
        <RemoteVisualAsset
          alt={title}
          src={url}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            color: "#17352f",
            fontSize: 28,
            fontWeight: 900
          }}
        >
          {title}
        </div>
      )}
    </div>
  );
}

function SupplementaryChartLayer({ title, url }: { title: string; url?: string }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "linear-gradient(180deg, #f7f1df 0%, #d7e5d8 100%)"
      }}
    >
      {url ? (
        <RemoteVisualAsset
          alt={title}
          src={url}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <svg viewBox="0 0 360 360" style={{ width: "100%", height: "100%" }}>
          <circle cx="180" cy="180" r="138" fill="#fbfaf4" stroke="#c89437" strokeWidth="8" />
          <circle cx="180" cy="180" r="108" fill="none" stroke="#24443e" strokeWidth="4" />
          <circle cx="180" cy="180" r="58" fill="none" stroke="#24443e" strokeOpacity="0.45" strokeWidth="3" />
          {Array.from({ length: 12 }, (_, tick) => {
            const angle = (tick * 30 - 90) * (Math.PI / 180);
            const outerX = 180 + Math.cos(angle) * 138;
            const outerY = 180 + Math.sin(angle) * 138;
            const innerX = 180 + Math.cos(angle) * 58;
            const innerY = 180 + Math.sin(angle) * 58;

            return (
              <line
                key={tick}
                x1={outerX}
                x2={innerX}
                y1={outerY}
                y2={innerY}
                stroke="#24443e"
                strokeOpacity="0.36"
                strokeWidth="2"
              />
            );
          })}
          <line x1="42" x2="318" y1="180" y2="180" stroke="#e05f45" strokeLinecap="round" strokeWidth="7" />
          <text x="180" y="324" fill="#24443e" fontSize="22" fontWeight="900" textAnchor="middle">
            {title}
          </text>
        </svg>
      )}
    </div>
  );
}
