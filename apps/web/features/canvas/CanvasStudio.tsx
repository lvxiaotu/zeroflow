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
import { Player } from "@remotion/player";
import { AstroVideoComposition, getCompositionSize } from "@zeroflow/remotion-video";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import {
  fetchProviderHealth,
  getLiveProviderRunGuard,
  liveProviderConfirmationMessage,
  markLiveProviderConfirmed,
  type ClientProviderHealth
} from "../jobs/providerGuard";
import {
  defaultPreviewFrame,
  getExportFrameRange,
  getExportScope,
  getRenderJobRequest
} from "../render/renderJob";
import { getCreateExportJobRequest, getCreatePreviewJobRequest } from "./productionFlowJobs";
import {
  getSceneResourceJobRequest,
  sceneResourceJobIds,
  type NodeJobRequest,
  type SceneResourceJobId
} from "./sceneResourceJobs";
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
const defaultChartBirthData = {
  birthDate: "1990-01-01",
  birthTime: "12:00",
  timezoneOffsetMinutes: 480,
  latitude: 39.9042,
  longitude: 116.4074,
  placeName: "Beijing",
  houseSystem: "equal",
  chartType: "natal",
  highlight: "ascendant"
};

const sceneResourceLabels: Record<SceneResourceJobId, string> = {
  caption: "Caption",
  voice: "Voice",
  chart: "Chart",
  image: "Image",
  d3: "D3",
  three: "Three",
  composition: "Composition"
};

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
  const [expandedNodeId, setExpandedNodeId] = useState<string | undefined>();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [statusText, setStatusText] = useState("Canvas ready");
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [providerHealth, setProviderHealth] = useState<ClientProviderHealth[]>([]);
  const canvasRef = useRef<CanvasDocument>(defaultCanvasDocument);
  const dragStateRef = useRef<CanvasDragState | null>(null);
  canvasRef.current = canvasDoc;

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
            setStatusText("Project restored");
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
          setStatusText("Local draft restored");
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

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      const health = await fetchProviderHealth();

      if (!cancelled) {
        setProviderHealth(health);
      }
    }

    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function saveCanvasAsync() {
    const currentCanvas = canvasRef.current;
    setSaveState("saving");
    setStatusText("Saving canvas");
    localStorage.setItem(storageKey, JSON.stringify(currentCanvas));

    try {
      const response = await fetch("/api/project/canvas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, canvas: currentCanvas })
      });

      if (!response.ok) {
        throw new Error("canvas save failed");
      }

      const payload = (await response.json()) as { project?: { canvas?: unknown } };
      const parsed = canvasDocumentSchema.safeParse(payload.project?.canvas);
      const savedCanvas = parsed.success ? parsed.data : currentCanvas;

      setCanvasDoc(savedCanvas);
      canvasRef.current = savedCanvas;
      localStorage.setItem(storageKey, JSON.stringify(savedCanvas));
      setSaveState("saved");
      setStatusText("Canvas saved");
      return savedCanvas;
    } catch {
      setSaveState("error");
      setStatusText("Canvas save failed");
      return null;
    }
  }

  function saveCanvas() {
    void saveCanvasAsync();
  }

  function resetCanvas() {
    setCanvasDoc(defaultCanvasDocument);
    setSelectedNodeId(resolveInitialCanvasNodeId(defaultCanvasDocument.nodes));
    setExpandedNodeId(undefined);
    setSaveState("unsaved");
    setStatusText("Canvas reset");
  }

  async function loadProjectCanvas(selectNodeId?: string) {
    const response = await fetch(`/api/project?projectId=${encodeURIComponent(projectId)}`);

    if (!response.ok) {
      throw new Error("project request failed");
    }

    const payload = (await response.json()) as { project?: { canvas?: unknown } };
    const parsed = canvasDocumentSchema.safeParse(payload.project?.canvas);

    if (!parsed.success) {
      throw new Error("project canvas is invalid");
    }

    setCanvasDoc(parsed.data);
    canvasRef.current = parsed.data;
    localStorage.setItem(storageKey, JSON.stringify(parsed.data));
    setSelectedNodeId(resolveInitialCanvasNodeId(parsed.data.nodes, selectNodeId ?? selectedNodeId));
    setExpandedNodeId(undefined);
    return parsed.data;
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

  async function runNodeJobRequest(nodeId: string, draftJobRequest: NodeJobRequest) {
    const draftNode = canvasRef.current.nodes.find((node) => node.id === nodeId);

    if (!draftNode) {
      setStatusText("This node has no runnable job yet");
      return;
    }

    const liveProviderGuard = getLiveProviderRunGuard(
      draftJobRequest.type,
      providerHealth,
      draftJobRequest.input
    );

    if (liveProviderGuard && !window.confirm(liveProviderConfirmationMessage(liveProviderGuard))) {
      setStatusText(`${liveProviderGuard.providerLabel} run cancelled`);
      return;
    }

    const savedCanvas = await saveCanvasAsync();
    const currentCanvas = savedCanvas ?? canvasRef.current;
    const node = currentCanvas.nodes.find((item) => item.id === nodeId);

    if (!node) {
      setStatusText("This node has no runnable job yet");
      return;
    }

    setSaveState("saving");
    setRunningNodeId(node.id);
    setStatusText(`Running ${draftJobRequest.type}`);

    try {
      const jobInput = markLiveProviderConfirmed(
        draftJobRequest.type,
        draftJobRequest.input,
        providerHealth
      );
      const created = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          type: draftJobRequest.type,
          canvasNodeId: node.id,
          input: jobInput
        })
      });

      if (!created.ok) {
        const payload = (await created.json().catch(() => ({}))) as {
          providerRisk?: { providerLabel?: string };
        };
        throw new Error(
          payload.providerRisk?.providerLabel
            ? `${payload.providerRisk.providerLabel} confirmation required`
            : "job creation failed"
        );
      }

      const createdPayload = (await created.json()) as { job: { id: string } };
      const completed = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: createdPayload.job.id })
      });

      if (!completed.ok) {
        throw new Error("job run failed");
      }

      const completedPayload = (await completed.json()) as {
        job?: { output?: Record<string, unknown> };
      };
      const nextSelectedNodeId = getGeneratedNodeSelection(completedPayload.job?.output);

      await loadProjectCanvas(nextSelectedNodeId);
      setSaveState("saved");
      setStatusText(`${draftJobRequest.type} completed`);
    } catch (error) {
      setSaveState("error");
      setStatusText(error instanceof Error ? error.message : `${draftJobRequest.type} failed`);
    } finally {
      setRunningNodeId(null);
    }
  }

  async function runNodeAction(nodeId: string) {
    const node = canvasRef.current.nodes.find((item) => item.id === nodeId);
    const draftJobRequest = node ? getNodeJobRequest(node) : null;

    if (!node || !draftJobRequest) {
      setStatusText("This node has no runnable job yet");
      return;
    }

    await runNodeJobRequest(nodeId, draftJobRequest);
  }

  function handleNodePointerDown(event: PointerEvent<HTMLElement>, node: CanvasNode) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (node.id !== selectedNodeId) {
      setExpandedNodeId(undefined);
    }
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

  function handleNodeDoubleClick(event: MouseEvent<HTMLElement>, node: CanvasNode) {
    if (isInlineEditorTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = null;
    setSelectedNodeId(node.id);
    setExpandedNodeId((current) => (current === node.id ? undefined : node.id));
  }

  function handleStudioPointerDownCapture(event: PointerEvent<HTMLElement>) {
    if (isWorkflowNodeTarget(event.target)) {
      return;
    }

    setExpandedNodeId(undefined);
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
    setSelectedNodeId(undefined);
    setExpandedNodeId(undefined);
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
    <main className="studio-shell" onPointerDownCapture={handleStudioPointerDownCapture}>
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
          <p>{statusText}</p>
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
                const fromNode = getDisplayNodeForEdge(
                  canvasDoc.nodes.find((node) => node.id === edge.fromNodeId),
                  expandedNodeId
                );
                const toNode = getDisplayNodeForEdge(
                  canvasDoc.nodes.find((node) => node.id === edge.toNodeId),
                  expandedNodeId
                );

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
            {canvasDoc.nodes.map((node) => {
              const isExpanded = node.id === expandedNodeId;
              const displaySize = getDisplayNodeSize(node, isExpanded);

              return (
                <article
                  key={node.id}
                  className="workflow-node"
                  data-expanded={isExpanded}
                  data-kind={node.kind}
                  data-selected={node.id === selectedNodeId}
                  onDoubleClick={(event) => handleNodeDoubleClick(event, node)}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={handleNodePointerUp}
                  onPointerCancel={handleNodePointerUp}
                  style={{
                    left: `${node.position.x}px`,
                    top: `${node.position.y}px`,
                    width: `${displaySize.width}px`,
                    minHeight: `${displaySize.height}px`
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
                  {isExpanded ? (
                    <InspectorPanel
                      node={node}
                      previewSpec={previewSpec}
                      providerHealth={providerHealth}
                      running={runningNodeId === node.id}
                      statusText={statusText}
                      variant="inline"
                      onNodeChange={(key, value) => {
                        updateNode(node.id, (currentNode) => ({ ...currentNode, [key]: value }));
                      }}
                      onDataChange={(key, value) => {
                        updateNode(node.id, (currentNode) => ({
                          ...currentNode,
                          data: { ...currentNode.data, [key]: value }
                        }));
                      }}
                      onDataReplace={(value) => {
                        updateNode(node.id, (currentNode) => ({
                          ...currentNode,
                          data: value
                        }));
                      }}
                      onRunNode={(nodeId) => void runNodeAction(nodeId)}
                      onRunNodeJob={(nodeId, request) => void runNodeJobRequest(nodeId, request)}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <InspectorPanel
        node={selectedNode}
        previewSpec={previewSpec}
        providerHealth={providerHealth}
        running={runningNodeId === selectedNode?.id}
        statusText={statusText}
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
        onDataReplace={(value) => {
          if (!selectedNode) return;
          updateNode(selectedNode.id, (node) => ({
            ...node,
            data: value
          }));
        }}
        onRunNode={(nodeId) => void runNodeAction(nodeId)}
        onRunNodeJob={(nodeId, request) => void runNodeJobRequest(nodeId, request)}
      />
    </main>
  );
}

function InspectorPanel({
  node,
  previewSpec,
  providerHealth,
  running,
  statusText,
  onNodeChange,
  onDataChange,
  onDataReplace,
  onRunNode,
  onRunNodeJob,
  variant = "side"
}: {
  node: CanvasNode | null;
  previewSpec: AstroVideoSpec;
  providerHealth: ClientProviderHealth[];
  running: boolean;
  statusText: string;
  variant?: "side" | "inline";
  onNodeChange: <TKey extends keyof CanvasNode>(key: TKey, value: CanvasNode[TKey]) => void;
  onDataChange: (key: string, value: unknown) => void;
  onDataReplace: (value: CanvasNode["data"]) => void;
  onRunNode: (nodeId: string) => void;
  onRunNodeJob: (nodeId: string, request: NodeJobRequest) => void;
}) {
  const [rawData, setRawData] = useState(node ? JSON.stringify(node.data, null, 2) : "{}");
  const isInline = variant === "inline";

  useEffect(() => {
    setRawData(node ? JSON.stringify(node.data, null, 2) : "{}");
  }, [node?.id]);

  if (!node) {
    if (isInline) {
      return null;
    }

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

  const nodeJobRequest = getNodeJobRequest(node);
  const liveProviderGuard = nodeJobRequest
    ? getLiveProviderRunGuard(nodeJobRequest.type, providerHealth, nodeJobRequest.input)
    : null;
  const assetUrl = getNodeAssetUrl(node);
  const content = (
    <>
      <header>
        <span>{isInline ? "Inline editor" : "Inspector"}</span>
        <strong>{nodeKindLabels[node.kind]}</strong>
        <p>{isInline ? "Editing this card" : node.id}</p>
      </header>

      {nodeJobRequest ? (
        <section className="job-actions">
          <button
            data-risk={liveProviderGuard ? "live-provider" : "local-or-mock"}
            disabled={running}
            type="button"
            onClick={() => onRunNode(node.id)}
          >
            {running ? "Running..." : getNodeRunLabel(node)}
          </button>
          <div
            className="job-provider-notice"
            data-risk={liveProviderGuard ? "live-provider" : "local-or-mock"}
          >
            {liveProviderGuard
              ? `${liveProviderGuard.providerLabel} requires confirmation before this job runs.`
              : statusText}
          </div>
        </section>
      ) : null}

      {node.kind === "scene" ? (
        <section className="job-actions">
          <strong>Generate resources</strong>
          <div className="scene-resource-grid">
            {sceneResourceJobIds.map((resourceId) => {
              const request = getSceneResourceJobRequest(node, resourceId);

              return (
                <button
                  disabled={running}
                  key={resourceId}
                  type="button"
                  onClick={() => onRunNodeJob(node.id, request)}
                >
                  {running ? "Running..." : sceneResourceLabels[resourceId]}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {node.kind === "preview" ? (
        <section className="job-actions">
          <strong>Next</strong>
          <button
            disabled={running}
            type="button"
            onClick={() => onRunNodeJob(node.id, getCreateExportJobRequest(node))}
          >
            {running ? "Running..." : "Create export"}
          </button>
        </section>
      ) : null}

      <label>
        Title
        <input
          value={getString(node.data.title, nodeKindLabels[node.kind])}
          onChange={(event) => onDataChange("title", event.currentTarget.value)}
        />
      </label>

      <label>
        Description
        <textarea
          rows={3}
          value={getString(node.data.description, nodeKindDescriptions[node.kind])}
          onChange={(event) => onDataChange("description", event.currentTarget.value)}
        />
      </label>

      {node.kind === "topic" ? (
        <label>
          Topic
          <textarea
            rows={3}
            value={getString(node.data.topic, getString(node.data.description, ""))}
            onChange={(event) => onDataChange("topic", event.currentTarget.value)}
          />
        </label>
      ) : null}

      {node.kind === "script" ? (
        <label>
          Script text
          <textarea
            rows={7}
            value={getString(node.data.scriptText, "")}
            onChange={(event) => onDataChange("scriptText", event.currentTarget.value)}
          />
        </label>
      ) : null}

      {node.kind === "script" || node.kind === "storyboard" ? (
        <label>
          Scene count
          <input
            max={12}
            min={1}
            type="number"
            value={getNumber(node.data.sceneCount, 5)}
            onChange={(event) =>
              onDataChange("sceneCount", clampNumber(Number(event.currentTarget.value), 1, 12))
            }
          />
        </label>
      ) : null}

      {node.kind === "scene" ? (
        <>
          <label>
            Duration
            <input
              max={30}
              min={1}
              type="number"
              value={getNumber(node.data.durationSec, 6)}
              onChange={(event) =>
                onDataChange("durationSec", clampNumber(Number(event.currentTarget.value), 1, 30))
              }
            />
          </label>
          <label>
            Narration
            <textarea
              rows={4}
              value={getString(node.data.narration, "")}
              onChange={(event) => onDataChange("narration", event.currentTarget.value)}
            />
          </label>
          <label>
            Visual prompt
            <textarea
              rows={4}
              value={getString(node.data.visualPrompt, "")}
              onChange={(event) => onDataChange("visualPrompt", event.currentTarget.value)}
            />
          </label>
        </>
      ) : null}

      {node.kind === "composition" ? (
        <>
          <div className="inspector-grid">
            <label>
              Primary visual
              <select
                value={getString(node.data.primaryVisualKind, "auto")}
                onChange={(event) => onDataChange("primaryVisualKind", event.currentTarget.value)}
              >
                <option value="auto">Auto</option>
                <option value="text">Text</option>
                <option value="chart">Chart</option>
                <option value="image">Image</option>
                <option value="d3">D3</option>
                <option value="three">Three</option>
              </select>
            </label>
            <label>
              Layout
              <select
                value={getString(node.data.layoutPreset, "single")}
                onChange={(event) => onDataChange("layoutPreset", event.currentTarget.value)}
              >
                <option value="single">Single</option>
                <option value="split">Split</option>
                <option value="overlay">Overlay</option>
              </select>
            </label>
            <label>
              Transition
              <select
                value={getString(node.data.transition, "fade")}
                onChange={(event) => onDataChange("transition", event.currentTarget.value)}
              >
                <option value="cut">Cut</option>
                <option value="fade">Fade</option>
                <option value="wipe">Wipe</option>
                <option value="zoom">Zoom</option>
              </select>
            </label>
            <label>
              Duration
              <input
                max={30}
                min={1}
                type="number"
                value={getNumber(node.data.durationSec, 6)}
                onChange={(event) =>
                  onDataChange("durationSec", clampNumber(Number(event.currentTarget.value), 1, 30))
                }
              />
            </label>
          </div>
          <div className="inspector-checkbox-grid">
            <label className="inspector-checkbox-row">
              <input
                checked={getBoolean(node.data.includeCaption, true)}
                type="checkbox"
                onChange={(event) => onDataChange("includeCaption", event.currentTarget.checked)}
              />
              Caption
            </label>
            <label className="inspector-checkbox-row">
              <input
                checked={getBoolean(node.data.includeVoice, true)}
                type="checkbox"
                onChange={(event) => onDataChange("includeVoice", event.currentTarget.checked)}
              />
              Voice
            </label>
          </div>
        </>
      ) : null}

      {node.kind === "caption" ? (
        <>
          <label>
            Caption Y
            <input
              max={100}
              min={0}
              type="range"
              value={getNumber(node.data.yPercent, 78)}
              onChange={(event) =>
                onDataChange("yPercent", clampNumber(Number(event.currentTarget.value), 0, 100))
              }
            />
            <output>{getNumber(node.data.yPercent, 78)}%</output>
          </label>
          <div className="inspector-grid">
            <label>
              Font size
              <input
                max={96}
                min={20}
                type="number"
                value={getNumber(node.data.fontSize, 48)}
                onChange={(event) =>
                  onDataChange("fontSize", clampNumber(Number(event.currentTarget.value), 20, 96))
                }
              />
            </label>
            <label>
              Color
              <input
                value={getString(node.data.color, "#ffffff")}
                onChange={(event) => onDataChange("color", event.currentTarget.value)}
              />
            </label>
          </div>
        </>
      ) : null}

      {node.kind === "voice" ? (
        <>
          <label>
            Speed
            <input
              max={1.8}
              min={0.5}
              step={0.05}
              type="range"
              value={getNumber(node.data.speed, 1)}
              onChange={(event) =>
                onDataChange("speed", clampNumber(Number(event.currentTarget.value), 0.5, 1.8))
              }
            />
            <output>{getNumber(node.data.speed, 1).toFixed(2)}x</output>
          </label>
          <label>
            Volume
            <input
              max={2}
              min={0}
              step={0.05}
              type="range"
              value={getNumber(node.data.volume, 1)}
              onChange={(event) =>
                onDataChange("volume", clampNumber(Number(event.currentTarget.value), 0, 2))
              }
            />
            <output>{Math.round(getNumber(node.data.volume, 1) * 100)}%</output>
          </label>
          <label>
            Voice profile
            <input
              value={getString(node.data.voiceProfile, getString(node.data.referenceAudioName, ""))}
              onChange={(event) => onDataChange("voiceProfile", event.currentTarget.value)}
            />
          </label>
        </>
      ) : null}

      {node.kind === "image" ? (
        <label>
          Image prompt
          <textarea
            rows={5}
            value={getString(node.data.prompt, getString(node.data.visualPrompt, ""))}
            onChange={(event) => onDataChange("prompt", event.currentTarget.value)}
          />
        </label>
      ) : null}

      {node.kind === "chart" ? (
        <div className="inspector-grid">
          <label>
            Birth date
            <input
              type="date"
              value={getString(node.data.birthDate, defaultChartBirthData.birthDate)}
              onChange={(event) => onDataChange("birthDate", event.currentTarget.value)}
            />
          </label>
          <label>
            Birth time
            <input
              type="time"
              value={getString(node.data.birthTime, defaultChartBirthData.birthTime)}
              onChange={(event) => onDataChange("birthTime", event.currentTarget.value)}
            />
          </label>
          <label>
            Place
            <input
              value={getString(node.data.placeName, defaultChartBirthData.placeName)}
              onChange={(event) => onDataChange("placeName", event.currentTarget.value)}
            />
          </label>
          <label>
            Highlight
            <input
              value={getString(node.data.highlight, defaultChartBirthData.highlight)}
              onChange={(event) => onDataChange("highlight", event.currentTarget.value)}
            />
          </label>
        </div>
      ) : null}

      {node.kind === "preview" ? (
        <label>
          Still frame
          <input
            min={0}
            type="number"
            value={getNumber(node.data.previewFrame, defaultPreviewFrame)}
            onChange={(event) =>
              onDataChange("previewFrame", clampNumber(Number(event.currentTarget.value), 0, 10000))
            }
          />
        </label>
      ) : null}

      {node.kind === "export" ? (
        <div className="inspector-grid">
          <label>
            Export scope
            <select
              value={getExportScope(node)}
              onChange={(event) => onDataChange("exportScope", event.currentTarget.value)}
            >
              <option value="clip">Clip</option>
              <option value="full">Full video</option>
            </select>
          </label>
          <label>
            Frame range
            <input
              value={getExportFrameRange(node)}
              onChange={(event) => onDataChange("frameRange", event.currentTarget.value)}
            />
          </label>
        </div>
      ) : null}

      {!isInline ? (
        <div className="inspector-grid">
          <label>
            X
            <input
              type="number"
              value={node.position.x}
              onChange={(event) =>
                onNodeChange("position", { ...node.position, x: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            Y
            <input
              type="number"
              value={node.position.y}
              onChange={(event) =>
                onNodeChange("position", { ...node.position, y: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            Width
            <input
              min={120}
              type="number"
              value={node.size.width}
              onChange={(event) =>
                onNodeChange("size", { ...node.size, width: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            Height
            <input
              min={88}
              type="number"
              value={node.size.height}
              onChange={(event) =>
                onNodeChange("size", { ...node.size, height: Number(event.currentTarget.value) })
              }
            />
          </label>
        </div>
      ) : null}

      {assetUrl ? (
        <section className="chart-result">
          <strong>Asset</strong>
          <span>{assetUrl}</span>
        </section>
      ) : null}

      {!isInline ? (
        <>
          <label>
            Raw data
            <textarea rows={10} value={rawData} onChange={(event) => setRawData(event.target.value)} />
          </label>
          <button
            type="button"
            onClick={() => {
              try {
                const parsed = JSON.parse(rawData) as unknown;
                const parsedData = recordData(parsed);

                if (parsedData) {
                  onDataReplace(parsedData);
                }
              } catch {
                // ignore parse errors for now
              }
            }}
          >
            Apply JSON
          </button>

          <VideoPreviewPanel previewSpec={previewSpec} />
        </>
      ) : null}
    </>
  );

  if (isInline) {
    return (
      <section
        className="inspector node-inline-editor"
        aria-label="Inline node editor"
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {content}
      </section>
    );
  }

  return (
    <aside className="inspector" aria-label="Inspector">
      {content}
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
        {durationInFrames > 0 ? (
          <Player
            acknowledgeRemotionLicense
            component={AstroVideoComposition}
            compositionHeight={size.height}
            compositionWidth={size.width}
            controls
            durationInFrames={durationInFrames}
            fps={previewSpec.fps}
            inputProps={{ spec: previewSpec }}
            style={{ height: "100%", width: "100%" }}
          />
        ) : (
          <div className="preview-loading">No scenes to preview</div>
        )}
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

function getDisplayNodeSize(node: CanvasNode, expanded: boolean): CanvasNode["size"] {
  if (!expanded) {
    return node.size;
  }

  return {
    width: Math.max(node.size.width, 420),
    height: Math.max(node.size.height, 560)
  };
}

function getDisplayNodeForEdge(node: CanvasNode | undefined, expandedNodeId: string | undefined) {
  if (!node) {
    return null;
  }

  return {
    ...node,
    size: getDisplayNodeSize(node, node.id === expandedNodeId)
  };
}

function isWorkflowNodeTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(".workflow-node"));
}

function isInlineEditorTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest(".node-inline-editor, input, textarea, select, button, a"))
  );
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function getNodeTitle(node: CanvasNode) {
  return getString(node.data.title, nodeKindLabels[node.kind]);
}

function getNodeDescription(node: CanvasNode) {
  return getString(node.data.description, nodeKindDescriptions[node.kind]);
}

function getNodeJobRequest(node: CanvasNode): NodeJobRequest | null {
  if (node.kind === "topic") {
    return {
      type: "generate-script",
      input: {
        topic: getString(node.data.topic, getString(node.data.description, "Astrology teaching short"))
      }
    };
  }

  if (node.kind === "script" || node.kind === "storyboard") {
    return {
      type: "generate-storyboard",
      input: {
        scriptText: getString(node.data.scriptText, ""),
        sceneCount: getNumber(node.data.sceneCount, 5)
      }
    };
  }

  if (node.kind === "image") {
    return {
      type: "generate-image",
      input: {
        prompt: getString(
          node.data.prompt,
          getString(node.data.description, "simple educational astrology line drawing")
        )
      }
    };
  }

  if (node.kind === "voice") {
    return { type: "generate-tts", input: {} };
  }

  if (node.kind === "chart") {
    return { type: "generate-chart", input: getChartJobInput(node) };
  }

  if (node.kind === "d3" || node.kind === "three") {
    return { type: "export-visual-asset", input: {} };
  }

  if (node.kind === "caption") {
    return { type: "align-captions", input: {} };
  }

  if (node.kind === "composition") {
    return getCreatePreviewJobRequest(node);
  }

  if (node.kind === "preview" || node.kind === "export") {
    return getRenderJobRequest(node);
  }

  return null;
}

function getChartJobInput(node: CanvasNode) {
  return {
    birthDate: getString(node.data.birthDate, defaultChartBirthData.birthDate),
    birthTime: getString(node.data.birthTime, defaultChartBirthData.birthTime),
    timezoneOffsetMinutes: getNumber(
      node.data.timezoneOffsetMinutes,
      defaultChartBirthData.timezoneOffsetMinutes
    ),
    latitude: getNumber(node.data.latitude, defaultChartBirthData.latitude),
    longitude: getNumber(node.data.longitude, defaultChartBirthData.longitude),
    placeName: getString(node.data.placeName, defaultChartBirthData.placeName),
    houseSystem: getString(node.data.houseSystem, defaultChartBirthData.houseSystem),
    chartType: getString(node.data.chartType, defaultChartBirthData.chartType),
    highlight: getString(node.data.highlight, defaultChartBirthData.highlight)
  };
}

function getNodeRunLabel(node: CanvasNode) {
  switch (node.kind) {
    case "topic":
      return "Generate script";
    case "script":
    case "storyboard":
      return "Generate storyboard";
    case "caption":
      return "Align captions";
    case "voice":
      return "Generate TTS";
    case "chart":
      return "Generate chart";
    case "image":
      return "Generate image";
    case "d3":
    case "three":
      return "Export visual";
    case "composition":
      return "Create preview";
    case "preview":
      return "Render still";
    case "export":
      return getExportScope(node) === "full" ? "Render full video" : "Render clip";
    default:
      return "Run job";
  }
}

function getGeneratedNodeSelection(output: Record<string, unknown> | undefined) {
  const resourceKeys = [
    "exportNodeId",
    "previewNodeId",
    "compositionNodeId",
    "captionNodeId",
    "voiceNodeId",
    "chartNodeId",
    "imageNodeId",
    "d3NodeId",
    "threeNodeId",
    "visualNodeId",
    "nodeId"
  ];

  for (const key of resourceKeys) {
    const nodeId = output?.[key];

    if (typeof nodeId === "string") {
      return nodeId;
    }
  }

  const scriptNodeId = output?.scriptNodeId;

  if (typeof scriptNodeId === "string") {
    return scriptNodeId;
  }

  const sceneNodeIds = output?.sceneNodeIds;

  if (Array.isArray(sceneNodeIds) && typeof sceneNodeIds[0] === "string") {
    return sceneNodeIds[0];
  }

  return undefined;
}

function getNodeAssetUrl(node: CanvasNode) {
  const caption = recordData(node.data.caption);

  return (
    getString(node.data.assetUrl, "") ||
    getString(node.data.chartAssetUrl, "") ||
    getString(node.data.imageAssetUrl, "") ||
    getString(caption?.assetUrl, "")
  );
}

function recordData(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
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





