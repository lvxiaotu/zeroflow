"use client";

import {
  canvasDocumentSchema,
  compileCanvasToAstroVideoSpec,
  getSpecDurationFrames,
  phaseSummary,
  type AstroVideoSpec,
  type CanvasDocument,
  type CanvasNode,
  type CanvasNodeKind
} from "@zeroflow/core";
import { getCompositionSize } from "@zeroflow/remotion-video";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { defaultCanvasDocument, defaultProjectId, nodeKindDescriptions, nodeKindLabels } from "./seed";

type SaveState = "saved" | "saving" | "unsaved" | "restored" | "error";
type CanvasDragState =
  | {
      kind: "node";
      nodeId: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startPosition: CanvasNode["position"];
      zoom: number;
    }
  | {
      kind: "viewport";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startViewport: CanvasDocument["viewport"];
    };

const storagePrefix = "zeroflow:canvas:";

export function CanvasStudio({
  initialNodeId,
  projectId = defaultProjectId
}: {
  initialNodeId?: string;
  projectId?: string;
}) {
  const storageKey = `${storagePrefix}${projectId}`;
  const [canvasDoc, setCanvasDoc] = useState<CanvasDocument>(defaultCanvasDocument);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(initialNodeId);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const dragStateRef = useRef<CanvasDragState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCanvas() {
      try {
        const response = await fetch(`/api/project?projectId=${encodeURIComponent(projectId)}`);
        if (response.ok) {
          const payload = (await response.json()) as { project?: { canvas?: CanvasDocument } };
          const parsed = canvasDocumentSchema.safeParse(payload.project?.canvas);
          if (!cancelled && parsed.success) {
            setCanvasDoc(parsed.data);
            setSelectedNodeId(resolveInitialCanvasNodeId(parsed.data.nodes, initialNodeId));
            localStorage.setItem(storageKey, JSON.stringify(parsed.data));
            setSaveState("restored");
            return;
          }
        }
      } catch {
        // fall through to local draft
      }

      const raw = localStorage.getItem(storageKey);
      if (!raw || cancelled) {
        return;
      }

      try {
        const parsed = canvasDocumentSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          setCanvasDoc(parsed.data);
          setSelectedNodeId(resolveInitialCanvasNodeId(parsed.data.nodes, initialNodeId));
          setSaveState("restored");
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    void loadCanvas();
    return () => {
      cancelled = true;
    };
  }, [initialNodeId, projectId, storageKey]);

  const selectedNode = useMemo(
    () => canvasDoc.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [canvasDoc.nodes, selectedNodeId]
  );
  const previewSpec = useMemo(() => compileCanvasToAstroVideoSpec(canvasDoc), [canvasDoc]);

  function commitCanvas(updater: (current: CanvasDocument) => CanvasDocument) {
    setCanvasDoc((current) => {
      const next = updater(current);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveState("unsaved");
      return next;
    });
  }

  function saveCanvas() {
    setSaveState("saving");
    localStorage.setItem(storageKey, JSON.stringify(canvasDoc));
    fetch("/api/project/canvas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, canvas: canvasDoc })
    })
      .then((response) => {
        setSaveState(response.ok ? "saved" : "error");
      })
      .catch(() => setSaveState("error"));
  }

  function resetCanvas() {
    setCanvasDoc(defaultCanvasDocument);
    setSelectedNodeId(resolveInitialCanvasNodeId(defaultCanvasDocument.nodes));
    setSaveState("unsaved");
  }

  function addNode(kind: CanvasNodeKind) {
    commitCanvas((current) => {
      const count = current.nodes.length;
      return {
        ...current,
        nodes: [
          ...current.nodes,
          {
            id: `node-${Date.now()}`,
            kind,
            position: { x: 80 + count * 24, y: 80 + count * 18 },
            size: { width: 260, height: 160 },
            status: "idle",
            data: {
              title: nodeKindLabels[kind],
              description: nodeKindDescriptions[kind]
            }
          }
        ]
      };
    });
  }

  function updateNode(nodeId: string, updater: (node: CanvasNode) => CanvasNode) {
    commitCanvas((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? updater(node) : node))
    }));
  }

  function updateCanvasDuringDrag(updater: (current: CanvasDocument) => CanvasDocument) {
    setCanvasDoc((current) => {
      const next = updater(current);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
    setSaveState("unsaved");
  }

  function handleNodePointerDown(event: PointerEvent<HTMLElement>, node: CanvasNode) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeId(node.id);
    dragStateRef.current = {
      kind: "node",
      nodeId: node.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: node.position,
      zoom: canvasDoc.viewport.zoom
    };
  }

  function handleNodePointerMove(event: PointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.kind !== "node" || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const dx = (event.clientX - dragState.startClientX) / dragState.zoom;
    const dy = (event.clientY - dragState.startClientY) / dragState.zoom;

    updateCanvasDuringDrag((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === dragState.nodeId
          ? {
              ...node,
              position: {
                x: Math.round(dragState.startPosition.x + dx),
                y: Math.round(dragState.startPosition.y + dy)
              }
            }
          : node
      )
    }));
  }

  function handleNodePointerUp(event: PointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;

    if (dragState?.kind === "node" && dragState.pointerId === event.pointerId) {
      dragStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }

  function handleBoardPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(".workflow-node")) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      kind: "viewport",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: canvasDoc.viewport
    };
  }

  function handleBoardPointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.kind !== "viewport" || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const dx = event.clientX - dragState.startClientX;
    const dy = event.clientY - dragState.startClientY;

    updateCanvasDuringDrag((current) => ({
      ...current,
      viewport: {
        ...current.viewport,
        x: Math.round(dragState.startViewport.x + dx),
        y: Math.round(dragState.startViewport.y + dy)
      }
    }));
  }

  function handleBoardPointerUp(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;

    if (dragState?.kind === "viewport" && dragState.pointerId === event.pointerId) {
      dragStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }

  return (
    <main className="studio-shell">
      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>ZeroFlow</strong>
            <span>Astro Video Studio</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          <Link aria-current="page" href={`/studio/project-ascendant-intro?projectId=${encodeURIComponent(projectId)}`}>
            Studio
          </Link>
          <Link href={`/tldraw?projectId=${encodeURIComponent(projectId)}`}>tldraw</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/library">Library</Link>
          <Link href="/providers">Providers</Link>
        </nav>

        <section className="phase-card" aria-label="Current phase">
          <span>{phaseSummary.phase}</span>
          <strong>{phaseSummary.title}</strong>
          <p>{phaseSummary.goal}</p>
        </section>

        <section className="node-palette" aria-label="Node palette">
          <strong>Node palette</strong>
          <div>
            {((Object.keys(nodeKindLabels) as CanvasNodeKind[]).filter((kind) => kind !== "preview" && kind !== "export")).map((kind) => (
              <button key={kind} type="button" onClick={() => addNode(kind)}>
                {nodeKindLabels[kind]}
              </button>
            ))}
          </div>
        </section>

        <section className="job-panel" aria-label="Status">
          <header>
            <strong>Canvas</strong>
            <span>{saveState}</span>
          </header>
          <div className="job-panel-actions">
            <button type="button" onClick={saveCanvas}>Save</button>
            <button type="button" onClick={resetCanvas}>Reset</button>
          </div>
        </section>
      </aside>

      <section className="canvas-region" aria-label="Canvas region">
        <header className="topbar">
          <div>
            <span className="eyeline">Canvas-first workflow</span>
            <h1>Video studio</h1>
          </div>
          <div className="topbar-actions">
            <span className="save-state" data-state={saveState}>{saveState}</span>
          </div>
        </header>

        <div
          className="canvas-board"
          onPointerDown={handleBoardPointerDown}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={handleBoardPointerUp}
          onPointerCancel={handleBoardPointerUp}
        >
          <div
            className="canvas-stage"
            style={{
              transform: `translate(${canvasDoc.viewport.x}px, ${canvasDoc.viewport.y}px) scale(${canvasDoc.viewport.zoom})`
            }}
          >
            <svg className="edge-layer" viewBox="0 0 2400 1600" aria-hidden="true">
              {canvasDoc.edges.map((edge) => {
                const fromNode = canvasDoc.nodes.find((node) => node.id === edge.fromNodeId);
                const toNode = canvasDoc.nodes.find((node) => node.id === edge.toNodeId);

                if (!fromNode || !toNode) {
                  return null;
                }

                const label = getEdgeLabelPoint(fromNode, toNode);

                return (
                  <g key={edge.id}>
                    <path
                      className="edge-path"
                      data-relation={edge.relation}
                      d={getEdgePath(fromNode, toNode)}
                    />
                    <text className="edge-label" x={label.x} y={label.y}>
                      {edge.relation}
                    </text>
                  </g>
                );
              })}
            </svg>
            {canvasDoc.nodes.map((node) => (
              <article
                key={node.id}
                className="workflow-node"
                data-kind={node.kind}
                data-selected={node.id === selectedNodeId}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
                onPointerCancel={handleNodePointerUp}
                style={{
                  left: `${node.position.x}px`,
                  top: `${node.position.y}px`,
                  width: `${node.size.width}px`,
                  minHeight: `${node.size.height}px`
                }}
              >
                <span className="node-step">{nodeKindLabels[node.kind].slice(0, 2)}</span>
                <h2>{getNodeTitle(node)}</h2>
                <p>{getNodeDescription(node)}</p>
                {node.kind === "script" && node.data.scriptText ? (
                  <pre className="node-content-preview">{String(node.data.scriptText).replace(/<[^>]+>/g, "")}</pre>
                ) : null}
                {node.kind === "scene" && node.data.narration ? (
                  <pre className="node-content-preview">{String(node.data.narration).replace(/<[^>]+>/g, "")}</pre>
                ) : null}
                {node.kind === "topic" && node.data.topic ? (
                  <p className="node-topic-line">{String(node.data.topic)}</p>
                ) : null}
                <footer>
                  <small>{node.kind}</small>
                  <span data-status={node.status}>{node.status}</span>
                </footer>
              </article>
            ))}
          </div>
        </div>
      </section>

      <InspectorPanel
        node={selectedNode}
        previewSpec={previewSpec}
        onNodeChange={(key, value) => {
          if (!selectedNode) return;
          updateNode(selectedNode.id, (node) => ({ ...node, [key]: value }));
        }}
        onDataChange={(key, value) => {
          if (!selectedNode) return;
          updateNode(selectedNode.id, (node) => ({
            ...node,
            data: { ...node.data, [key]: value }
          }));
        }}
      />
    </main>
  );
}

function InspectorPanel({
  node,
  previewSpec,
  onNodeChange,
  onDataChange
}: {
  node: CanvasNode | null;
  previewSpec: AstroVideoSpec;
  onNodeChange: <TKey extends keyof CanvasNode>(key: TKey, value: CanvasNode[TKey]) => void;
  onDataChange: (key: string, value: unknown) => void;
}) {
  const [rawData, setRawData] = useState(node ? JSON.stringify(node.data, null, 2) : "{}");

  useEffect(() => {
    setRawData(node ? JSON.stringify(node.data, null, 2) : "{}");
  }, [node?.id]);

  if (!node) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <header>
          <span>Inspector</span>
          <strong>No node selected</strong>
        </header>
        <VideoPreviewPanel previewSpec={previewSpec} />
      </aside>
    );
  }

  return (
    <aside className="inspector" aria-label="Inspector">
      <header>
        <span>Inspector</span>
        <strong>{nodeKindLabels[node.kind]}</strong>
        <p>{node.id}</p>
      </header>

      <label>
        Title
        <input value={getString(node.data.title, nodeKindLabels[node.kind])} onChange={(event) => onDataChange("title", event.target.value)} />
      </label>

      <label>
        Description
        <textarea rows={3} value={getString(node.data.description, nodeKindDescriptions[node.kind])} onChange={(event) => onDataChange("description", event.target.value)} />
      </label>

      <div className="inspector-grid">
        <label>
          X
          <input type="number" value={node.position.x} onChange={(event) => onNodeChange("position", { ...node.position, x: Number(event.target.value) })} />
        </label>
        <label>
          Y
          <input type="number" value={node.position.y} onChange={(event) => onNodeChange("position", { ...node.position, y: Number(event.target.value) })} />
        </label>
        <label>
          Width
          <input type="number" value={node.size.width} onChange={(event) => onNodeChange("size", { ...node.size, width: Number(event.target.value) })} />
        </label>
        <label>
          Height
          <input type="number" value={node.size.height} onChange={(event) => onNodeChange("size", { ...node.size, height: Number(event.target.value) })} />
        </label>
      </div>

      <label>
        Raw data
        <textarea rows={10} value={rawData} onChange={(event) => setRawData(event.target.value)} />
      </label>
      <button
        type="button"
        onClick={() => {
          try {
            onDataChange("data", JSON.parse(rawData));
          } catch {
            // ignore parse errors for now
          }
        }}
      >
        Apply JSON
      </button>

      <VideoPreviewPanel previewSpec={previewSpec} />
    </aside>
  );
}

function VideoPreviewPanel({ previewSpec }: { previewSpec: AstroVideoSpec }) {
  const size = getCompositionSize(previewSpec.format);
  const durationInFrames = getSpecDurationFrames(previewSpec);

  return (
    <section className="video-preview-panel">
      <header>
        <strong>Preview</strong>
        <span>{previewSpec.title}</span>
      </header>
      <div className="video-preview-frame" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
      <div className="video-preview-frame" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <div className="preview-loading">
          Preview: {previewSpec.title} ({size.width}×{size.height}, {durationInFrames}f)
        </div>
      </div>
      </div>
    </section>
  );
}

function resolveInitialCanvasNodeId(nodes: CanvasNode[], nodeId?: string) {
  if (nodeId && nodes.some((node) => node.id === nodeId)) {
    return nodeId;
  }

  return nodes[0]?.id;
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getNodeTitle(node: CanvasNode) {
  return getString(node.data.title, nodeKindLabels[node.kind]);
}

function getNodeDescription(node: CanvasNode) {
  return getString(node.data.description, nodeKindDescriptions[node.kind]);
}

function getEdgePath(fromNode: CanvasNode, toNode: CanvasNode) {
  const from = getEdgeStartPoint(fromNode);
  const to = getEdgeEndPoint(toNode);
  const distance = Math.max(96, Math.abs(to.x - from.x) * 0.42);

  return `M ${from.x} ${from.y} C ${from.x + distance} ${from.y}, ${to.x - distance} ${to.y}, ${to.x} ${to.y}`;
}

function getEdgeLabelPoint(fromNode: CanvasNode, toNode: CanvasNode) {
  const from = getEdgeStartPoint(fromNode);
  const to = getEdgeEndPoint(toNode);

  return {
    x: Math.round((from.x + to.x) / 2),
    y: Math.round((from.y + to.y) / 2 - 10)
  };
}

function getEdgeStartPoint(node: CanvasNode) {
  return {
    x: node.position.x + node.size.width,
    y: node.position.y + node.size.height / 2
  };
}

function getEdgeEndPoint(node: CanvasNode) {
  return {
    x: node.position.x,
    y: node.position.y + node.size.height / 2
  };
}





