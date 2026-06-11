import { Composition } from "remotion";
import { getSpecDurationFrames, type AstroVideoSpec } from "@zeroflow/core";
import { AstroVideoComposition } from "./compositions/AstroVideoComposition";
import { REMOTION_COMP_ID, getCompositionSize } from "./constants";
import { samplePreviewSpec } from "./sampleSpec";

const size = getCompositionSize(samplePreviewSpec.format);
type AstroVideoProps = { spec: AstroVideoSpec };

export function RemotionRoot() {
  return (
    <Composition
      component={AstroVideoComposition}
      defaultProps={{ spec: samplePreviewSpec }}
      calculateMetadata={({ props }: { props: AstroVideoProps }) => {
        const dynamicSize = getCompositionSize(props.spec.format);

        return {
          durationInFrames: getSpecDurationFrames(props.spec),
          fps: props.spec.fps,
          height: dynamicSize.height,
          width: dynamicSize.width
        };
      }}
      durationInFrames={getSpecDurationFrames(samplePreviewSpec)}
      fps={samplePreviewSpec.fps}
      height={size.height}
      id={REMOTION_COMP_ID}
      width={size.width}
    />
  );
}
