"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

export type EditableCaptionCue = {
  id: string;
  text: string;
  startSec: number;
  durationSec: number;
};

export type CaptionCueChangeKey = "text" | "startSec" | "durationSec";

export type CaptionEnergyBar = {
  startSec: number;
  durationSec: number;
  amplitude: number;
};

type CaptionCueTimelineProps = {
  cues: EditableCaptionCue[];
  durationSec: number;
  energyBars?: CaptionEnergyBar[];
  onCueAdd?: () => void;
  onCueChange: (cueId: string, key: CaptionCueChangeKey, value: string | number) => void;
  onCueRemove?: (cueId: string) => void;
  onDurationChange?: (durationSec: number) => void;
};

type CueDragMode = "move" | "resize-start" | "resize-end";

type CueDragState = {
  cue: EditableCaptionCue;
  mode: CueDragMode;
  offsetSec: number;
  pointerId: number;
};

const minCueDurationSec = 0.1;
const keyboardStepSec = 0.1;
const cueSnapThresholdSec = 0.15;
const overlapEpsilonSec = 0.01;

export function CaptionCueTimeline({
  cues,
  durationSec,
  energyBars,
  onCueAdd,
  onCueChange,
  onCueRemove,
  onDurationChange
}: CaptionCueTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<CueDragState | null>(null);
  const timelineDurationSec = captionTimelineDurationSec(cues, durationSec);
  const markerStep = timelineDurationSec <= 12 ? 3 : timelineDurationSec <= 45 ? 5 : 15;
  const markers = timelineMarkers(timelineDurationSec, markerStep);
  const overlappingCueIds = overlappingCaptionCueIds(cues);
  const resolvedEnergyBars =
    energyBars && energyBars.length > 0
      ? normalizeCaptionEnergyBars(energyBars, timelineDurationSec)
      : deriveCaptionEnergyBars(cues, timelineDurationSec);

  function changeCueStart(cue: EditableCaptionCue, value: number) {
    const nextStartSec = roundCaptionCueNumber(
      clampCaptionCueNumber(value, 0, Math.max(0, timelineDurationSec - minCueDurationSec))
    );
    const nextDurationSec = roundCaptionCueNumber(
      clampCaptionCueNumber(
        cue.durationSec,
        minCueDurationSec,
        Math.max(minCueDurationSec, timelineDurationSec - nextStartSec)
      )
    );

    changeCueBounds(cue, nextStartSec, nextDurationSec);
  }

  function changeCueDuration(cue: EditableCaptionCue, value: number) {
    changeCueBounds(
      cue,
      cue.startSec,
      roundCaptionCueNumber(
        clampCaptionCueNumber(
          value,
          minCueDurationSec,
          Math.max(minCueDurationSec, timelineDurationSec - cue.startSec)
        )
      )
    );
  }

  function changeCueBounds(cue: EditableCaptionCue, startSec: number, durationSec: number) {
    const nextStartSec = roundCaptionCueNumber(
      clampCaptionCueNumber(startSec, 0, Math.max(0, timelineDurationSec - minCueDurationSec))
    );
    const nextDurationSec = roundCaptionCueNumber(
      clampCaptionCueNumber(
        durationSec,
        minCueDurationSec,
        Math.max(minCueDurationSec, timelineDurationSec - nextStartSec)
      )
    );

    if (nextStartSec !== cue.startSec) {
      onCueChange(cue.id, "startSec", nextStartSec);
    }

    if (nextDurationSec !== cue.durationSec) {
      onCueChange(cue.id, "durationSec", nextDurationSec);
    }
  }

  function secFromPointer(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();

    if (!rect || rect.width <= 0) {
      return 0;
    }

    return clampCaptionCueNumber(
      ((clientX - rect.left) / rect.width) * timelineDurationSec,
      0,
      timelineDurationSec
    );
  }

  function beginCueDrag(
    event: PointerEvent<HTMLElement>,
    cue: EditableCaptionCue,
    mode: CueDragMode
  ) {
    const pointerSec = secFromPointer(event.clientX);
    dragRef.current = {
      cue,
      mode,
      offsetSec: mode === "move" ? pointerSec - cue.startSec : 0,
      pointerId: event.pointerId
    };
    try {
      trackRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic test events do not always have an active browser pointer.
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function updateCueDrag(clientX: number) {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const pointerSec = secFromPointer(clientX);
    const cueEndSec = drag.cue.startSec + drag.cue.durationSec;

    if (drag.mode === "move") {
      const nextStartSec = clampCaptionCueNumber(
        snapCaptionCueMoveStart(pointerSec - drag.offsetSec, drag.cue, cues, timelineDurationSec),
        0,
        Math.max(0, timelineDurationSec - drag.cue.durationSec)
      );
      changeCueBounds(drag.cue, nextStartSec, drag.cue.durationSec);
      return;
    }

    if (drag.mode === "resize-start") {
      const snappedStartSec = snapCaptionCueBoundary(
        pointerSec,
        drag.cue,
        cues,
        timelineDurationSec
      );
      const nextStartSec = clampCaptionCueNumber(
        snappedStartSec,
        0,
        Math.max(0, cueEndSec - minCueDurationSec)
      );
      changeCueBounds(drag.cue, nextStartSec, cueEndSec - nextStartSec);
      return;
    }

    const snappedEndSec = snapCaptionCueBoundary(pointerSec, drag.cue, cues, timelineDurationSec);
    const nextEndSec = clampCaptionCueNumber(
      snappedEndSec,
      drag.cue.startSec + minCueDurationSec,
      timelineDurationSec
    );
    changeCueBounds(drag.cue, drag.cue.startSec, nextEndSec - drag.cue.startSec);
  }

  function endCueDrag() {
    const drag = dragRef.current;

    if (drag && trackRef.current?.hasPointerCapture(drag.pointerId)) {
      try {
        trackRef.current.releasePointerCapture(drag.pointerId);
      } catch {
        // The pointer may already be released if the browser cancelled the gesture.
      }
    }

    dragRef.current = null;
  }

  function handleCueKeyDown(event: KeyboardEvent<HTMLElement>, cue: EditableCaptionCue) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    const direction = event.key === "ArrowRight" ? 1 : -1;
    const deltaSec = direction * (event.shiftKey ? keyboardStepSec * 5 : keyboardStepSec);

    event.preventDefault();

    if (event.altKey) {
      changeCueDuration(cue, cue.durationSec + deltaSec);
      return;
    }

    changeCueStart(cue, cue.startSec + deltaSec);
  }

  return (
    <section className="caption-timeline">
      <header className="caption-timeline-head">
        <div>
          <strong>Cue timeline</strong>
          <span>
            {cues.length} cues / {formatSec(timelineDurationSec)}
          </span>
        </div>
        {onCueAdd ? (
          <button type="button" onClick={onCueAdd}>
            Add cue
          </button>
        ) : null}
      </header>

      <label className="caption-timeline-duration">
        Timeline duration
        <input
          max={3600}
          min={0.5}
          name="captionTimelineDurationSec"
          step={0.1}
          type="number"
          value={timelineDurationSec}
          onChange={(event) =>
            onDurationChange?.(
              roundCaptionCueNumber(clampCaptionCueNumber(Number(event.currentTarget.value), 0.5, 3600))
            )
          }
        />
      </label>

      <div
        aria-label="Caption cue timeline"
        className="caption-timeline-track"
        onPointerCancel={endCueDrag}
        onPointerMove={(event) => updateCueDrag(event.clientX)}
        onPointerUp={endCueDrag}
        ref={trackRef}
        role="list"
      >
        <div className="caption-timeline-energy" aria-hidden="true">
          {resolvedEnergyBars.map((bar, index) => {
            const left = percentage(bar.startSec, timelineDurationSec);
            const width = Math.max(0.7, percentage(bar.durationSec, timelineDurationSec));

            return (
              <span
                key={`${bar.startSec}-${bar.durationSec}-${index}`}
                style={{
                  height: `${Math.round(22 + bar.amplitude * 62)}%`,
                  left: `${left}%`,
                  width: `${Math.min(100 - left, width)}%`
                }}
              />
            );
          })}
        </div>
        {cues.map((cue, index) => {
          const startPercent = percentage(cue.startSec, timelineDurationSec);
          const widthPercent = Math.max(2.4, percentage(cue.durationSec, timelineDurationSec));
          const isOverlapping = overlappingCueIds.has(cue.id);
          const cueTitle = `${formatSec(cue.startSec)} - ${formatSec(
            cue.startSec + cue.durationSec
          )}${isOverlapping ? " · overlaps another cue" : ""}`;

          return (
            <span
              aria-label={`${cue.text || `Cue ${index + 1}`} from ${formatSec(cue.startSec)} to ${formatSec(
                cue.startSec + cue.durationSec
              )}`}
              className={`caption-timeline-segment${
                isOverlapping ? " caption-timeline-segment-overlap" : ""
              }`}
              key={cue.id}
              onKeyDown={(event) => handleCueKeyDown(event, cue)}
              onPointerDown={(event) => beginCueDrag(event, cue, "move")}
              role="listitem"
              style={{
                left: `${startPercent}%`,
                width: `${Math.min(100 - startPercent, widthPercent)}%`
              }}
              tabIndex={0}
              title={cueTitle}
            >
              <button
                aria-label={`Resize cue ${index + 1} start`}
                className="caption-timeline-handle caption-timeline-handle-start"
                type="button"
                onPointerDown={(event) => beginCueDrag(event, cue, "resize-start")}
              />
              <span className="caption-timeline-segment-label">{index + 1}</span>
              <button
                aria-label={`Resize cue ${index + 1} end`}
                className="caption-timeline-handle caption-timeline-handle-end"
                type="button"
                onPointerDown={(event) => beginCueDrag(event, cue, "resize-end")}
              />
            </span>
          );
        })}
      </div>
      <div className="caption-timeline-ruler" aria-hidden="true">
        {markers.map((marker) => (
          <span key={marker.value} style={{ left: `${marker.percent}%` }}>
            {formatSec(marker.value)}
          </span>
        ))}
      </div>

      {cues.length > 0 ? (
        <ol className="caption-timeline-cues">
          {cues.map((cue, index) => {
            const endSec = cue.startSec + cue.durationSec;
            const maxDurationSec = Math.max(0.1, timelineDurationSec - cue.startSec);
            const isOverlapping = overlappingCueIds.has(cue.id);

            return (
              <li
                className={isOverlapping ? "caption-timeline-cue-overlap" : undefined}
                key={cue.id}
              >
                <header>
                  <strong>
                    {index + 1}. {formatSec(cue.startSec)} - {formatSec(endSec)}
                  </strong>
                  {isOverlapping ? (
                    <span className="caption-timeline-warning">Overlap</span>
                  ) : null}
                  {onCueRemove ? (
                    <button type="button" onClick={() => onCueRemove(cue.id)}>
                      Remove
                    </button>
                  ) : null}
                </header>
                <label>
                  Text
                  <textarea
                    name={`cue-${cue.id}-text`}
                    rows={2}
                    value={cue.text}
                    onChange={(event) => onCueChange(cue.id, "text", event.currentTarget.value)}
                  />
                </label>
                <div className="caption-timeline-ranges">
                  <label>
                    Start
                    <input
                      max={Math.max(0, timelineDurationSec - minCueDurationSec)}
                      min={0}
                      name={`cue-${cue.id}-start-range`}
                      step={0.01}
                      type="range"
                      value={cue.startSec}
                      onChange={(event) => changeCueStart(cue, Number(event.currentTarget.value))}
                    />
                  </label>
                  <label>
                    Length
                    <input
                      max={maxDurationSec}
                      min={minCueDurationSec}
                      name={`cue-${cue.id}-duration-range`}
                      step={0.01}
                      type="range"
                      value={cue.durationSec}
                      onChange={(event) => changeCueDuration(cue, Number(event.currentTarget.value))}
                    />
                  </label>
                </div>
                <div className="caption-timeline-fields">
                  <label>
                    Start sec
                    <input
                      max={Math.max(0, timelineDurationSec - 0.1)}
                      min={0}
                      name={`cue-${cue.id}-start`}
                      step={0.01}
                      type="number"
                      value={cue.startSec}
                      onChange={(event) => changeCueStart(cue, Number(event.currentTarget.value))}
                    />
                  </label>
                  <label>
                    Duration
                    <input
                      max={maxDurationSec}
                      min={minCueDurationSec}
                      name={`cue-${cue.id}-duration`}
                      step={0.01}
                      type="number"
                      value={cue.durationSec}
                      onChange={(event) => changeCueDuration(cue, Number(event.currentTarget.value))}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <span className="caption-timeline-empty">No cues yet</span>
      )}
    </section>
  );
}

export function captionTimelineDurationSec(
  cues: EditableCaptionCue[],
  requestedDurationSec: number,
  fallbackDurationSec = 12
) {
  const cueEndSec = cues.reduce((max, cue) => Math.max(max, cue.startSec + cue.durationSec), 0);
  const requested =
    Number.isFinite(requestedDurationSec) && requestedDurationSec > 0 ? requestedDurationSec : 0;
  const fallback = cueEndSec > 0 || requested > 0 ? 0 : fallbackDurationSec;
  return roundCaptionCueNumber(Math.max(0.5, fallback, cueEndSec, requested));
}

export function toEditableCaptionCues(value: unknown): EditableCaptionCue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return undefined;
      }

      const cue = item as Record<string, unknown>;
      const text = typeof cue.text === "string" ? cue.text : "";
      const startSec =
        typeof cue.startSec === "number" && Number.isFinite(cue.startSec) ? cue.startSec : 0;
      const durationSec =
        typeof cue.durationSec === "number" && Number.isFinite(cue.durationSec)
          ? cue.durationSec
          : 1.5;

      return {
        id: typeof cue.id === "string" && cue.id.length > 0 ? cue.id : `cue-${index + 1}`,
        text,
        startSec: roundCaptionCueNumber(clampCaptionCueNumber(startSec, 0, 3600)),
        durationSec: roundCaptionCueNumber(clampCaptionCueNumber(durationSec, 0.1, 60))
      };
    })
    .filter((cue): cue is EditableCaptionCue => Boolean(cue));
}

export function normalizeEditableCaptionCues(cues: EditableCaptionCue[]) {
  const seenIds = new Set<string>();

  return cues.map((cue, index) => {
    const baseId = cue.id.trim().length > 0 ? cue.id.trim() : `cue-${index + 1}`;
    let id = baseId;
    let duplicateIndex = 2;

    while (seenIds.has(id)) {
      id = `${baseId}-${duplicateIndex}`;
      duplicateIndex += 1;
    }

    seenIds.add(id);

    return {
      id,
      text: cue.text,
      startSec: roundCaptionCueNumber(clampCaptionCueNumber(cue.startSec, 0, 3600)),
      durationSec: roundCaptionCueNumber(clampCaptionCueNumber(cue.durationSec, 0.1, 60))
    };
  });
}

export function overlappingCaptionCueIds(cues: EditableCaptionCue[]) {
  const overlappingIds = new Set<string>();

  for (let outerIndex = 0; outerIndex < cues.length; outerIndex += 1) {
    const cue = cues[outerIndex];

    if (!cue) {
      continue;
    }

    for (let innerIndex = outerIndex + 1; innerIndex < cues.length; innerIndex += 1) {
      const otherCue = cues[innerIndex];

      if (!otherCue) {
        continue;
      }

      if (captionCuesOverlap(cue, otherCue)) {
        overlappingIds.add(cue.id);
        overlappingIds.add(otherCue.id);
      }
    }
  }

  return overlappingIds;
}

export function toCaptionEnergyBars(value: unknown): CaptionEnergyBar[] {
  const maybeBars = recordData(value)?.bars ?? value;

  if (!Array.isArray(maybeBars)) {
    return [];
  }

  return maybeBars
    .map((item) => {
      const record = recordData(item);

      if (!record) {
        return undefined;
      }

      const startSec = finiteNumber(record.startSec) ?? finiteNumber(record.start) ?? 0;
      const durationSec = finiteNumber(record.durationSec) ?? finiteNumber(record.duration) ?? 0;
      const amplitude = finiteNumber(record.amplitude) ?? finiteNumber(record.value) ?? 0;

      if (durationSec <= 0) {
        return undefined;
      }

      return {
        startSec: roundCaptionCueNumber(clampCaptionCueNumber(startSec, 0, 3600)),
        durationSec: roundCaptionCueNumber(clampCaptionCueNumber(durationSec, 0.01, 3600)),
        amplitude: roundCaptionCueNumber(clampCaptionCueNumber(amplitude, 0.05, 1))
      };
    })
    .filter((bar): bar is CaptionEnergyBar => Boolean(bar));
}

export function deriveCaptionEnergyBars(
  cues: EditableCaptionCue[],
  durationSec: number
): CaptionEnergyBar[] {
  const timelineDurationSec = captionTimelineDurationSec(cues, durationSec);

  if (cues.length === 0) {
    return Array.from({ length: 24 }, (_, index) => {
      const duration = timelineDurationSec / 24;
      return {
        startSec: roundCaptionCueNumber(index * duration),
        durationSec: roundCaptionCueNumber(duration),
        amplitude: roundCaptionCueNumber(0.22 + ((index * 7) % 9) / 24)
      };
    });
  }

  const longestCue = cues.reduce((max, cue) => Math.max(max, cue.text.trim().length), 1);

  return cues.map((cue, index) => {
    const textWeight = cue.text.trim().length / longestCue;
    const cadence = ((index * 5) % 7) / 20;

    return {
      startSec: cue.startSec,
      durationSec: cue.durationSec,
      amplitude: roundCaptionCueNumber(clampCaptionCueNumber(0.28 + textWeight * 0.52 + cadence, 0.12, 1))
    };
  });
}

function normalizeCaptionEnergyBars(bars: CaptionEnergyBar[], durationSec: number) {
  return bars
    .map((bar) => {
      const startSec = clampCaptionCueNumber(bar.startSec, 0, Math.max(0, durationSec - 0.01));
      const maxDurationSec = Math.max(0.01, durationSec - startSec);

      return {
        startSec: roundCaptionCueNumber(startSec),
        durationSec: roundCaptionCueNumber(clampCaptionCueNumber(bar.durationSec, 0.01, maxDurationSec)),
        amplitude: roundCaptionCueNumber(clampCaptionCueNumber(bar.amplitude, 0.05, 1))
      };
    })
    .filter((bar) => bar.durationSec > 0);
}

export function snapCaptionCueMoveStart(
  startSec: number,
  cue: EditableCaptionCue,
  cues: EditableCaptionCue[],
  durationSec: number
) {
  const maxStartSec = Math.max(0, durationSec - cue.durationSec);
  const points = captionCueBoundaryPoints(cues, cue, durationSec);
  let snappedStartSec = clampCaptionCueNumber(startSec, 0, maxStartSec);
  let bestDistanceSec = cueSnapThresholdSec;

  for (const point of points) {
    const candidates = [point, point - cue.durationSec];

    for (const candidate of candidates) {
      const clampedCandidate = clampCaptionCueNumber(candidate, 0, maxStartSec);
      const distanceSec = Math.abs(clampedCandidate - startSec);

      if (distanceSec <= bestDistanceSec) {
        snappedStartSec = clampedCandidate;
        bestDistanceSec = distanceSec;
      }
    }
  }

  return roundCaptionCueNumber(snappedStartSec);
}

export function snapCaptionCueBoundary(
  value: number,
  cue: EditableCaptionCue,
  cues: EditableCaptionCue[],
  durationSec: number
) {
  const points = captionCueBoundaryPoints(cues, cue, durationSec);
  return snapCaptionCuePoint(value, points);
}

function captionCueBoundaryPoints(
  cues: EditableCaptionCue[],
  activeCue: EditableCaptionCue,
  durationSec: number
) {
  const points = [0, durationSec];

  for (const cue of cues) {
    if (cue.id === activeCue.id) {
      continue;
    }

    points.push(cue.startSec, cue.startSec + cue.durationSec);
  }

  return points.map(roundCaptionCueNumber);
}

function snapCaptionCuePoint(value: number, points: number[]) {
  let snappedValue = value;
  let bestDistanceSec = cueSnapThresholdSec;

  for (const point of points) {
    const distanceSec = Math.abs(point - value);

    if (distanceSec <= bestDistanceSec) {
      snappedValue = point;
      bestDistanceSec = distanceSec;
    }
  }

  return roundCaptionCueNumber(snappedValue);
}

function captionCuesOverlap(cue: EditableCaptionCue, otherCue: EditableCaptionCue) {
  const cueStartSec = cue.startSec;
  const cueEndSec = cue.startSec + cue.durationSec;
  const otherStartSec = otherCue.startSec;
  const otherEndSec = otherCue.startSec + otherCue.durationSec;

  return cueStartSec < otherEndSec - overlapEpsilonSec && cueEndSec > otherStartSec + overlapEpsilonSec;
}

export function roundCaptionCueNumber(value: number) {
  return Math.round(value * 100) / 100;
}

export function clampCaptionCueNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function timelineMarkers(durationSec: number, stepSec: number) {
  const markers = [];

  for (let value = 0; value < durationSec; value += stepSec) {
    markers.push({
      value: roundCaptionCueNumber(value),
      percent: percentage(value, durationSec)
    });
  }

  const endMarker = {
    value: durationSec,
    percent: 100
  };
  const previousMarker = markers.at(-1);

  if (previousMarker && durationSec - previousMarker.value < stepSec * 0.75) {
    markers[markers.length - 1] = endMarker;
  } else {
    markers.push(endMarker);
  }

  return markers;
}

function percentage(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function formatSec(value: number) {
  return `${roundCaptionCueNumber(value).toFixed(2)}s`;
}

function recordData(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
