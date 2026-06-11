import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Img, cancelRender, continueRender, delayRender } from "remotion";

type LoadedVisualAsset =
  | {
      kind: "svg";
      svg: string;
    }
  | {
      kind: "image";
      objectUrl: string;
    };

export function RemoteVisualAsset({
  alt,
  src,
  style
}: {
  alt: string;
  src: string;
  style: CSSProperties;
}) {
  const [asset, setAsset] = useState<LoadedVisualAsset | null>(null);
  const [renderHandle] = useState(() => delayRender(`Loading visual asset: ${src}`));
  const renderReleasedRef = useRef(false);

  useEffect(() => {
    let active = true;
    let completed = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    const releaseRenderHandle = () => {
      if (!renderReleasedRef.current) {
        renderReleasedRef.current = true;
        continueRender(renderHandle);
      }
    };

    fetch(src, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Visual asset request failed: ${response.status}`);
        }

        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("svg")) {
          const svg = await response.text();

          if (!svg.trimStart().startsWith("<svg")) {
            throw new Error("Visual asset response is not an SVG document");
          }

          if (active) {
            setAsset({ kind: "svg", svg });
            completed = true;
            releaseRenderHandle();
          }
          return;
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (active) {
          setAsset({ kind: "image", objectUrl });
          completed = true;
          releaseRenderHandle();
        }
      })
      .catch((error: unknown) => {
        if (!active || isExpectedAbort(error, controller.signal)) {
          return;
        }

        completed = true;
        renderReleasedRef.current = true;
        cancelRender(error instanceof Error ? error : new Error("Visual asset request failed"));
      });

    return () => {
      active = false;

      if (!completed) {
        completed = true;
        controller.abort(createExpectedAbortReason());
        releaseRenderHandle();
      }

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [renderHandle, src]);

  if (!asset) {
    return null;
  }

  if (asset.kind === "svg") {
    return (
      <div
        aria-label={alt}
        data-visual-asset-url={src}
        dangerouslySetInnerHTML={{ __html: asset.svg }}
        role="img"
        style={{
          ...style,
          overflow: "hidden"
        }}
      />
    );
  }

  return (
    <Img
      alt={alt}
      data-visual-asset-url={src}
      src={asset.objectUrl}
      style={{
        ...style,
        objectFit: style.objectFit ?? "contain"
      }}
    />
  );
}

function createExpectedAbortReason() {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Remote visual asset request was disposed", "AbortError");
  }

  return new Error("Remote visual asset request was disposed");
}

function isExpectedAbort(error: unknown, signal: AbortSignal) {
  if (!signal.aborted) {
    return false;
  }

  if (error === signal.reason) {
    return true;
  }

  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError";
}
