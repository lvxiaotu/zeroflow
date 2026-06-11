import type { SketchSceneSpec } from "@zeroflow/core";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CaptionLayer } from "../components/CaptionLayer";
import { RemoteVisualAsset } from "../components/RemoteVisualAsset";

export function SketchScene({ scene }: { scene: SketchSceneSpec }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const reveal = interpolate(frame, [0, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const dash = interpolate(frame, [0, Math.min(86, durationInFrames * 0.55)], [1200, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const glow = interpolate(frame, [0, durationInFrames], [0.18, 0.72], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "#fbfaf4",
        color: "#17352f"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 76,
          right: 76,
          top: 112,
          opacity: reveal,
          transform: `translateY(${(1 - reveal) * 24}px)`
        }}
      >
        <div
          style={{
            color: "#c07a3b",
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: 0
          }}
        >
          {scene.title}
        </div>
        <h2
          style={{
            margin: "18px 0 0",
            maxWidth: 780,
            fontSize: 78,
            lineHeight: 1.05,
            letterSpacing: 0
          }}
        >
          把抽象概念变成生活画面
        </h2>
      </div>

      {scene.assetUrl ? (
        <RemoteVisualAsset
          alt={scene.title}
          src={scene.assetUrl}
          style={{
            position: "absolute",
            left: 56,
            top: 360,
            width: 968,
            height: 1180,
            opacity: reveal,
            objectFit: "contain",
            transform: `translateY(${(1 - reveal) * 22}px) scale(${0.96 + reveal * 0.04})`
          }}
        />
      ) : (
        <FallbackSketchSvg dash={dash} glow={glow} />
      )}
      <CaptionLayer caption={scene.caption} />
    </AbsoluteFill>
  );
}

function FallbackSketchSvg({ dash, glow }: { dash: number; glow: number }) {
  return (
    <svg
      viewBox="0 0 1080 1260"
      style={{
        position: "absolute",
        left: 0,
        top: 370,
        width: 1080,
        height: 1260
      }}
    >
      <rect x="0" y="0" width="1080" height="1260" fill="#fbfaf4" />
      <path
        d="M 278 810 C 340 744 426 720 540 730 C 682 742 782 706 842 626"
        fill="none"
        stroke="#d9b15c"
        strokeLinecap="round"
        strokeWidth="28"
        opacity={glow}
      />
      <g
        fill="none"
        stroke="#17352f"
        strokeDasharray="1200"
        strokeDashoffset={dash}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="12"
      >
        <path d="M 342 936 L 342 330 L 742 242 L 742 852 L 342 936 Z" />
        <path d="M 448 906 L 448 414 L 742 242" />
        <path d="M 448 414 L 448 906" />
        <path d="M 518 624 C 548 610 582 610 616 628" />
        <path d="M 616 628 C 644 676 654 736 640 810" />
        <path d="M 564 672 L 538 752" />
        <path d="M 566 674 L 610 746" />
        <path d="M 508 814 L 462 892" />
        <path d="M 610 746 L 670 830" />
        <path d="M 792 306 L 824 366 L 890 376 L 842 422 L 852 488 L 792 456 L 734 488 L 744 422 L 696 376 L 762 366 Z" />
        <path d="M 844 602 L 870 650 M 898 596 L 850 626" />
        <path d="M 728 560 L 752 606 M 780 556 L 734 584" />
        <path d="M 842 744 L 862 784 M 888 740 L 848 762" />
      </g>
      <g fill="#c89437" opacity={0.52 + glow * 0.38}>
        <circle cx="822" cy="204" r="7" />
        <circle cx="914" cy="278" r="6" />
        <circle cx="866" cy="548" r="5" />
        <circle cx="706" cy="486" r="5" />
        <circle cx="808" cy="684" r="6" />
      </g>
    </svg>
  );
}
