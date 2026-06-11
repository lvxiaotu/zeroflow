import type { AstroVideoSpec } from "@zeroflow/core";
import { Audio } from "@remotion/media";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export function AudioPlaceholder({ spec }: { spec: AstroVideoSpec }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!spec.audio?.tracks.length) {
    return null;
  }

  const audioTracks = spec.audio.tracks.filter((track) => track.assetUrl);
  const bars = Array.from({ length: 18 }, (_, index) => {
    const pulse = Math.sin(frame / (fps * 0.16) + index * 0.72);
    const height = interpolate(pulse, [-1, 1], [8, 38]);

    return (
      <span
        key={index}
        style={{
          width: 6,
          height,
          borderRadius: 8,
          background: "rgba(232, 193, 100, 0.52)"
        }}
      />
    );
  });

  return (
    <>
      {audioTracks.map((track) => {
        const durationInFrames = track.durationSec
          ? Math.max(1, Math.round(track.durationSec * fps))
          : undefined;

        return (
          <Audio
            durationInFrames={durationInFrames}
            from={Math.round(track.startSec * fps)}
            key={track.id}
            name={track.kind}
            playbackRate={track.playbackRate ?? 1}
            src={track.assetUrl as string}
            volume={track.volume}
          />
        );
      })}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: 64,
          bottom: 58,
          zIndex: 5,
          display: "flex",
          height: 46,
          alignItems: "center",
          gap: 8,
          opacity: 0.68
        }}
      >
        {bars}
      </div>
    </>
  );
}
