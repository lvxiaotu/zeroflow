"use client";

import {
  canvasDocumentSchema,
  compileCanvasToAstroVideoSpec,
  type CanvasDocument,
  type CanvasNode
} from "@zeroflow/core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import {
  CaptionCueTimeline,
  captionTimelineDurationSec,
  normalizeEditableCaptionCues,
  roundCaptionCueNumber,
  toCaptionEnergyBars,
  toEditableCaptionCues,
  type CaptionCueChangeKey,
  type EditableCaptionCue
} from "../captions/CaptionCueTimeline";
import {
  fetchProviderHealth,
  getLiveProviderRunGuard,
  liveProviderConfirmationMessage,
  markLiveProviderConfirmed,
  summarizeProviderHealth,
  type ClientProviderHealth
} from "../jobs/providerGuard";
import {
  defaultExportFrameRange,
  defaultPreviewFrame,
  getExportScope,
  getRenderJobRequest
} from "../render/renderJob";
import {
  d3DataJsonStatus,
  d3VisualPresetPatch,
  d3VisualPresets,
  formatVisualDataJson,
  getD3VisualPreset,
  getThreeVisualPreset,
  threeDataJsonStatus,
  threeVisualPresetPatch,
  threeVisualPresets,
  type VisualPresetPatch
} from "../visuals/visualPresets";
import { D3VisualPreview, ThreeVisualPreview } from "../visuals/VisualPreview";
import {
  getSceneResourceJobRequest,
  sceneResourceJobIds,
  type NodeJobRequest,
  type SceneResourceJobId
} from "../canvas/sceneResourceJobs";
import {
  getAiModelOptionsForKind,
  getAiModelTarget,
  getNodeAiModel,
  getSceneImageModel,
  imageModelOptions
} from "../canvas/aiModels";
import {
  getCreateExportJobRequest,
  getCreatePreviewJobRequest
} from "../canvas/productionFlowJobs";
import {
  canvasFromTldraw,
  getSelectedZeroFlowNodeIds,
  isZeroFlowNodeShape,
  loadCanvasIntoTldraw,
  syncTldrawEdges,
  updateTldrawNodeShape
} from "./adapter";
import { ZeroFlowNodeShapeUtil, zeroFlowNodeShapeType } from "./ZeroFlowNodeShape";

type LoadState = "loading" | "ready" | "error";
type SaveState = "saved" | "saving" | "unsaved" | "error";
type NodeActionDetail = { nodeId?: string };

const zeroFlowShapeUtils = [ZeroFlowNodeShapeUtil];

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

declare global {
  interface Window {
    __zeroflowTldraw?: {
      moveNode: (nodeId: string, dx: number, dy: number) => boolean;
      selectNode: (nodeId: string) => boolean;
      runNode: (nodeId: string) => Promise<void>;
      save: () => Promise<CanvasDocument | null>;
      updateNodeData: (nodeId: string, key: string, value: string | number | boolean) => boolean;
      updateNodeDataPatch: (nodeId: string, patch: VisualPresetPatch) => boolean;
      updateCue: (
        nodeId: string,
        cueId: string,
        key: CaptionCueChangeKey,
        value: string | number
      ) => boolean;
      stats: () => { nodeShapes: number; selectedNodeIds: string[] };
    };
  }
}

export function TldrawCanvasClient({
  initialNodeId,
  projectId
}: {
  initialNodeId?: string;
  projectId: string;
}) {
  const editorRef = useRef<Editor | null>(null);
  const canvasRef = useRef<CanvasDocument | null>(null);
  const edgeSyncTimerRef = useRef<number | null>(null);
  const [canvas, setCanvas] = useState<CanvasDocument | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [statusText, setStatusText] = useState("Loading project");
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [providerHealth, setProviderHealth] = useState<ClientProviderHealth[]>([]);

  canvasRef.current = canvas;

  const spec = useMemo(
    () => (canvas ? compileCanvasToAstroVideoSpec(canvas) : null),
    [canvas]
  );
  const selectedNode = useMemo(() => {
    if (!canvas || selectedNodeIds.length !== 1) {
      return null;
    }

    return canvas.nodes.find((node) => node.id === selectedNodeIds[0]) ?? null;
  }, [canvas, selectedNodeIds]);

  const applyCanvas = useCallback((nextCanvas: CanvasDocument, reloadEditor = false) => {
    setCanvas(nextCanvas);
    canvasRef.current = nextCanvas;

    if (reloadEditor && editorRef.current) {
      loadCanvasIntoTldraw(editorRef.current, nextCanvas);
    }
  }, []);

  const loadProjectCanvas = useCallback(
    async (reloadEditor = false) => {
      const response = await fetch(`/api/project?projectId=${encodeURIComponent(projectId)}`);

      if (!response.ok) {
        throw new Error("project request failed");
      }

      const payload = (await response.json()) as { project?: { canvas?: unknown } };
      const parsed = canvasDocumentSchema.safeParse(payload.project?.canvas);

      if (!parsed.success) {
        throw new Error("project canvas is invalid");
      }

      applyCanvas(parsed.data, reloadEditor);
      return parsed.data;
    },
    [applyCanvas, projectId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      setLoadState("loading");
      setStatusText("Loading project");

      try {
        const loadedCanvas = await loadProjectCanvas();

        if (!cancelled) {
          applyCanvas(loadedCanvas);
          setLoadState("ready");
          setSaveState("saved");
          setStatusText("Project loaded");
        }
      } catch {
        if (!cancelled) {
          setLoadState("error");
          setStatusText("Project load failed");
        }
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [applyCanvas, loadProjectCanvas]);

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

  useEffect(() => {
    return () => {
      if (edgeSyncTimerRef.current !== null) {
        window.clearTimeout(edgeSyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || !canvas || !initialNodeId) {
      return;
    }

    if (selectZeroFlowNode(editor, initialNodeId)) {
      setSelectedNodeIds(getSelectedZeroFlowNodeIds(editor));
    }
  }, [canvas, initialNodeId]);

  const scheduleEdgeSync = useCallback((editor: Editor) => {
    if (edgeSyncTimerRef.current !== null) {
      window.clearTimeout(edgeSyncTimerRef.current);
    }

    edgeSyncTimerRef.current = window.setTimeout(() => {
      const currentCanvas = canvasRef.current;

      if (currentCanvas) {
        syncTldrawEdges(editor, currentCanvas);
      }
    }, 140);
  }, []);

  const saveTldrawCanvas = useCallback(async () => {
    const editor = editorRef.current;
    const currentCanvas = canvasRef.current;

    if (!editor || !currentCanvas) {
      return currentCanvas;
    }

    const nextCanvas = canvasFromTldraw(editor, currentCanvas);
    setSaveState("saving");
    setStatusText("Syncing canvas");

    try {
      const response = await fetch("/api/project/canvas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, canvas: nextCanvas })
      });

      if (!response.ok) {
        throw new Error("canvas save failed");
      }

      const payload = (await response.json()) as { project?: { canvas?: unknown } };
      const parsed = canvasDocumentSchema.safeParse(payload.project?.canvas);
      const savedCanvas = parsed.success ? parsed.data : nextCanvas;

      applyCanvas(savedCanvas);
      setSaveState("saved");
      setStatusText("Canvas synced");
      return savedCanvas;
    } catch {
      setSaveState("error");
      setStatusText("Canvas sync failed");
      return null;
    }
  }, [applyCanvas, projectId]);

  const runNodeJobRequest = useCallback(
    async (nodeId: string, draftJobRequest: NodeJobRequest) => {
      const draftCanvas = canvasRef.current;
      const draftNode = draftCanvas?.nodes.find((item) => item.id === nodeId);

      if (!draftNode) {
        setStatusText("This node has no runnable job yet");
        return;
      }

      const liveProviderGuard = getLiveProviderRunGuard(
        draftJobRequest.type,
        providerHealth,
        draftJobRequest.input
      );

      if (
        liveProviderGuard &&
        !window.confirm(liveProviderConfirmationMessage(liveProviderGuard))
      ) {
        setStatusText(`${liveProviderGuard.providerLabel} run cancelled`);
        return;
      }

      const savedCanvas = await saveTldrawCanvas();
      const currentCanvas = savedCanvas ?? canvasRef.current;
      const node = currentCanvas?.nodes.find((item) => item.id === nodeId);

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
        const nextCanvas = await loadProjectCanvas(true);
        const nextSelectedNodeId = getGeneratedNodeSelection(completedPayload.job?.output);
        const editor = editorRef.current;

        if (
          nextSelectedNodeId &&
          nextCanvas.nodes.some((nextNode) => nextNode.id === nextSelectedNodeId) &&
          editor &&
          selectZeroFlowNode(editor, nextSelectedNodeId)
        ) {
          setSelectedNodeIds([nextSelectedNodeId]);
        }
        setSaveState("saved");
        setStatusText(`${draftJobRequest.type} completed`);
      } catch (error) {
        setSaveState("error");
        setStatusText(
          error instanceof Error ? error.message : `${draftJobRequest.type} failed`
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [loadProjectCanvas, projectId, providerHealth, saveTldrawCanvas]
  );

  const runNodeAction = useCallback(
    async (nodeId: string) => {
      const draftCanvas = canvasRef.current;
      const draftNode = draftCanvas?.nodes.find((item) => item.id === nodeId);
      const draftJobRequest = draftNode ? getNodeJobRequest(draftNode) : null;

      if (!draftNode || !draftJobRequest) {
        setStatusText("This node has no runnable job yet");
        return;
      }

      await runNodeJobRequest(nodeId, draftJobRequest);
    },
    [runNodeJobRequest]
  );

  const updateCanvasNode = useCallback(
    (nodeId: string, updater: (node: CanvasNode) => CanvasNode) => {
      const currentCanvas = canvasRef.current;

      if (!currentCanvas) {
        return null;
      }

      const editor = editorRef.current;
      const baseCanvas = editor ? canvasFromTldraw(editor, currentCanvas) : currentCanvas;
      let nextNode: CanvasNode | null = null;
      const nextCanvas: CanvasDocument = {
        ...baseCanvas,
        nodes: baseCanvas.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }

          nextNode = updater(node);
          return nextNode;
        })
      };

      applyCanvas(nextCanvas);
      setSaveState("unsaved");
      setStatusText("Inspector changed");

      if (editor && nextNode) {
        updateTldrawNodeShape(editor, nextNode);
        syncTldrawEdges(editor, nextCanvas);
      }

      return nextNode;
    },
    [applyCanvas]
  );

  const updateNodeData = useCallback(
    (nodeId: string, key: string, value: string | number | boolean) =>
      Boolean(
        updateCanvasNode(nodeId, (node) => ({
          ...node,
          data: {
            ...node.data,
            [key]: value
          }
        }))
      ),
    [updateCanvasNode]
  );

  const updateNodeDataPatch = useCallback(
    (nodeId: string, patch: VisualPresetPatch) =>
      Boolean(
        updateCanvasNode(nodeId, (node) => ({
          ...node,
          data: {
            ...node.data,
            ...patch
          }
        }))
      ),
    [updateCanvasNode]
  );

  const updateNodeSize = useCallback(
    (nodeId: string, size: CanvasNode["size"]) =>
      updateCanvasNode(nodeId, (node) => ({
        ...node,
        size
      })),
    [updateCanvasNode]
  );
  const updateCaptionCues = useCallback(
    (nodeId: string, updater: (cues: EditableCaptionCue[]) => EditableCaptionCue[]) =>
      Boolean(
        updateCanvasNode(nodeId, (node) => {
          const nextCues = normalizeEditableCaptionCues(updater(getEditableCueRowsFromNode(node)));
          const data = { ...node.data };
          const caption = recordData(data.caption);

          if (Array.isArray(data.cues) || !caption) {
            data.cues = nextCues;
          } else {
            data.caption = {
              ...caption,
              cues: nextCues
            };
          }

          return {
            ...node,
            data
          };
        })
      ),
    [updateCanvasNode]
  );
  const updateCaptionCue = useCallback(
    (
      nodeId: string,
      cueId: string,
      key: CaptionCueChangeKey,
      value: string | number
    ) =>
      updateCaptionCues(nodeId, (cues) =>
        cues.map((cue) =>
          cue.id === cueId
            ? {
                ...cue,
                [key]:
                  key === "text"
                    ? String(value)
                    : clampNumber(Number(value), 0, key === "durationSec" ? 60 : 3600)
              }
            : cue
        )
      ),
    [updateCaptionCues]
  );
  const addCaptionCue = useCallback(
    (nodeId: string) =>
      updateCaptionCues(nodeId, (cues) => {
        const lastCue = cues.at(-1);
        const startSec = lastCue ? lastCue.startSec + lastCue.durationSec : 0;

        return cues.concat({
          id: `cue-${Date.now()}`,
          text: "New caption cue",
          startSec: roundCaptionCueNumber(startSec),
          durationSec: 1.5
        });
      }),
    [updateCaptionCues]
  );
  const removeCaptionCue = useCallback(
    (nodeId: string, cueId: string) =>
      updateCaptionCues(nodeId, (cues) => cues.filter((cue) => cue.id !== cueId)),
    [updateCaptionCues]
  );

  useEffect(() => {
    const handleNodeAction = (event: Event) => {
      const detail = (event as CustomEvent<NodeActionDetail>).detail;

      if (detail?.nodeId) {
        void runNodeAction(detail.nodeId);
      }
    };

    window.addEventListener("zeroflow:tldraw-node-action", handleNodeAction);

    return () => {
      window.removeEventListener("zeroflow:tldraw-node-action", handleNodeAction);
    };
  }, [runNodeAction]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      const currentCanvas = canvasRef.current;

      if (currentCanvas) {
        loadCanvasIntoTldraw(editor, currentCanvas);
      }

      if (initialNodeId && selectZeroFlowNode(editor, initialNodeId)) {
        setSelectedNodeIds(getSelectedZeroFlowNodeIds(editor));
      }

      if (process.env.NODE_ENV !== "production") {
        window.__zeroflowTldraw = {
          moveNode: (nodeId, dx, dy) => {
            const shape = editor
              .getCurrentPageShapes()
              .find((item) => isZeroFlowNodeShape(item) && item.props.nodeId === nodeId);

            if (!shape) {
              return false;
            }

            editor.updateShape({
              id: shape.id,
              type: zeroFlowNodeShapeType,
              x: shape.x + dx,
              y: shape.y + dy
            });
            return true;
          },
          selectNode: (nodeId) => {
            if (!selectZeroFlowNode(editor, nodeId)) {
              return false;
            }

            setSelectedNodeIds(getSelectedZeroFlowNodeIds(editor));
            return true;
          },
          runNode: async (nodeId) => {
            await runNodeAction(nodeId);
          },
          save: () => saveTldrawCanvas(),
          updateNodeData,
          updateNodeDataPatch,
          updateCue: updateCaptionCue,
          stats: () => ({
            nodeShapes: editor.getCurrentPageShapes().filter(isZeroFlowNodeShape).length,
            selectedNodeIds: getSelectedZeroFlowNodeIds(editor)
          })
        };
      }

      const stopDocumentListening = editor.store.listen(
        () => {
          setSaveState("unsaved");
          setSelectedNodeIds(getSelectedZeroFlowNodeIds(editor));
          scheduleEdgeSync(editor);
        },
        { source: "user", scope: "document" }
      );
      const stopSelectionListening = editor.store.listen(
        () => {
          setSelectedNodeIds(getSelectedZeroFlowNodeIds(editor));
        },
        { source: "user", scope: "all" }
      );

      return () => {
        stopDocumentListening();
        stopSelectionListening();
        if (window.__zeroflowTldraw) {
          delete window.__zeroflowTldraw;
        }
        editorRef.current = null;
      };
    },
    [
      initialNodeId,
      runNodeAction,
      saveTldrawCanvas,
      scheduleEdgeSync,
      updateCaptionCue,
      updateNodeData,
      updateNodeDataPatch
    ]
  );

  function fitView() {
    editorRef.current?.zoomToFit();
  }

  return (
    <main className="tldraw-shell">
      <header className="tldraw-topbar">
        <div>
          <span className="eyeline">tldraw workspace</span>
          <h1>Astrology video canvas</h1>
        </div>
        <div className="tldraw-actions">
          <span className="save-state" data-state={saveState}>
            {statusText}
          </span>
          <Link href={`/studio/${encodeURIComponent(projectId)}?projectId=${encodeURIComponent(projectId)}`}>
            Back to Studio
          </Link>
          <Link href="/providers">Providers</Link>
          <button type="button" onClick={fitView}>
            Fit
          </button>
          <button className="primary-action" type="button" onClick={() => void saveTldrawCanvas()}>
            Sync
          </button>
        </div>
      </header>

      <section className="tldraw-body">
        <aside className="tldraw-sidepanel">
          <strong>Project</strong>
          <span>{projectId}</span>
          <strong>Scenes</strong>
          <span>{spec?.scenes.length ?? 0}</span>
          <strong>Nodes</strong>
          <span>{canvas?.nodes.length ?? 0}</span>
          <strong>Selected</strong>
          <span>{selectedNodeIds.length > 0 ? selectedNodeIds.join(", ") : "none"}</span>
          <strong>Providers</strong>
          <span>{summarizeProviderHealth(providerHealth)}</span>
          <TldrawNodeInspector
            node={selectedNode}
            providerHealth={providerHealth}
            running={runningNodeId === selectedNode?.id}
            selectedCount={selectedNodeIds.length}
            onDataChange={updateNodeData}
            onDataPatch={updateNodeDataPatch}
            onCueAdd={addCaptionCue}
            onCueChange={updateCaptionCue}
            onCueRemove={removeCaptionCue}
            onRunNode={runNodeAction}
            onRunNodeJob={runNodeJobRequest}
            onSizeChange={updateNodeSize}
          />
        </aside>

        <div className="tldraw-editor-frame">
          {loadState === "ready" && canvas ? (
            <Tldraw key={projectId} onMount={handleMount} shapeUtils={zeroFlowShapeUtils} />
          ) : (
            <div className="tldraw-loading">
              <strong>{loadState === "error" ? "Load failed" : "Loading"}</strong>
              <span>{statusText}</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function TldrawNodeInspector({
  node,
  providerHealth,
  running,
  selectedCount,
  onDataChange,
  onDataPatch,
  onCueAdd,
  onCueChange,
  onCueRemove,
  onRunNode,
  onRunNodeJob,
  onSizeChange
}: {
  node: CanvasNode | null;
  providerHealth: ClientProviderHealth[];
  running: boolean;
  selectedCount: number;
  onDataChange: (nodeId: string, key: string, value: string | number | boolean) => boolean;
  onDataPatch: (nodeId: string, patch: VisualPresetPatch) => boolean;
  onCueAdd: (nodeId: string) => boolean;
  onCueChange: (
    nodeId: string,
    cueId: string,
    key: CaptionCueChangeKey,
    value: string | number
  ) => boolean;
  onCueRemove: (nodeId: string, cueId: string) => boolean;
  onRunNode: (nodeId: string) => Promise<void>;
  onRunNodeJob: (nodeId: string, request: NodeJobRequest) => Promise<void>;
  onSizeChange: (nodeId: string, size: CanvasNode["size"]) => void;
}) {
  if (!node) {
    return (
      <section className="tldraw-inspector">
        <header>
          <span>Inspector</span>
          <strong>{selectedCount > 1 ? "Multiple nodes" : "No node selected"}</strong>
        </header>
      </section>
    );
  }

  const cues = getEditableCueRowsFromNode(node);
  const assetUrl = getNodeAssetUrl(node);
  const visualRenderMode = getString(node.data.renderMode, assetUrl ? "asset" : "contract");
  const nodeJobRequest = getNodeJobRequest(node);
  const runnable = nodeJobRequest !== null;
  const liveProviderGuard = nodeJobRequest
    ? getLiveProviderRunGuard(nodeJobRequest.type, providerHealth, nodeJobRequest.input)
    : null;
  const aiModelTarget = getAiModelTarget(node.kind);
  const d3Diagram = getString(node.data.diagram, "timeline");
  const d3Preset = getD3VisualPreset(getString(node.data.visualPreset, d3Diagram));
  const d3JsonStatus = d3DataJsonStatus(d3Diagram, getString(node.data.dataJson, ""));
  const threeScene = getString(node.data.threeScene, "orbit");
  const threePreset = getThreeVisualPreset(getString(node.data.visualPreset, threeScene));
  const threeJsonStatus = threeDataJsonStatus(threeScene, getString(node.data.dataJson, ""));
  const cueTimelineDurationSec = captionTimelineDurationSec(
    cues,
    getNumber(node.data.durationSec, 0)
  );
  const captionEnergyBars = toCaptionEnergyBars(node.data.audioEnergy);

  return (
    <section className="tldraw-inspector" data-kind={node.kind}>
      <header>
        <span>Inspector</span>
        <strong>{getString(node.data.title, node.kind)}</strong>
        <small>{node.id}</small>
      </header>

      {runnable ? (
        <>
          <button
            className="tldraw-inspector-run"
            data-risk={liveProviderGuard ? "live-provider" : "local-or-mock"}
            disabled={running}
            type="button"
            onClick={() => void onRunNode(node.id)}
          >
            {running ? "Running..." : getNodeRunLabel(node)}
          </button>
          <section
            className="tldraw-provider-guard"
            data-risk={liveProviderGuard ? "live-provider" : "local-or-mock"}
          >
            <strong>{liveProviderGuard ? "Live provider" : "Local or mock"}</strong>
            <span>
              {liveProviderGuard
                ? `${liveProviderGuard.providerLabel} requires confirmation before this job runs.`
                : "This job does not need live provider confirmation."}
            </span>
          </section>
        </>
      ) : null}

      {node.kind === "scene" ? (
        <section className="tldraw-resource-actions">
          <strong>Resources</strong>
          <div className="tldraw-resource-grid">
            {sceneResourceJobIds.map((resourceId) => {
              const request = getSceneResourceJobRequest(node, resourceId);
              const liveProviderGuard = getLiveProviderRunGuard(
                request.type,
                providerHealth,
                request.input
              );

              return (
                <button
                  className="tldraw-inspector-run"
                  data-risk={liveProviderGuard ? "live-provider" : "local-or-mock"}
                  disabled={running}
                  key={resourceId}
                  type="button"
                  onClick={() => void onRunNodeJob(node.id, request)}
                >
                  {running ? "Running..." : tldrawSceneResourceLabels[resourceId]}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {node.kind === "preview" ? (
        <section className="tldraw-resource-actions">
          <strong>Next</strong>
          <button
            className="tldraw-inspector-run"
            data-risk="local-or-mock"
            disabled={running}
            type="button"
            onClick={() => void onRunNodeJob(node.id, getCreateExportJobRequest(node))}
          >
            {running ? "Running..." : "Create export"}
          </button>
        </section>
      ) : null}

      <label>
        Title
        <input
          name="title"
          value={getString(node.data.title, "")}
          onChange={(event) => onDataChange(node.id, "title", event.currentTarget.value)}
        />
      </label>

      <label>
        Description
        <textarea
          name="description"
          rows={3}
          value={getString(node.data.description, "")}
          onChange={(event) => onDataChange(node.id, "description", event.currentTarget.value)}
        />
      </label>

      {aiModelTarget ? (
        <label>
          AI 模型
          <select
            name="aiModel"
            value={getNodeAiModel(node)}
            onChange={(event) => onDataChange(node.id, "aiModel", event.currentTarget.value)}
          >
            {getAiModelOptionsForKind(node.kind).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {node.kind === "script" ? (
        <label>
          Script text
          <textarea
            name="scriptText"
            rows={7}
            value={getString(node.data.scriptText, "")}
            onChange={(event) => onDataChange(node.id, "scriptText", event.currentTarget.value)}
          />
        </label>
      ) : null}

      {node.kind === "script" || node.kind === "storyboard" ? (
        <label>
          Scene count
          <input
            max={12}
            min={1}
            name="sceneCount"
            type="number"
            value={getNumber(node.data.sceneCount, 5)}
            onChange={(event) =>
              onDataChange(node.id, "sceneCount", clampNumber(Number(event.currentTarget.value), 1, 12))
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
              name="durationSec"
              type="number"
              value={getNumber(node.data.durationSec, 6)}
              onChange={(event) =>
                onDataChange(node.id, "durationSec", clampNumber(Number(event.currentTarget.value), 1, 30))
              }
            />
          </label>
          <label>
            Narration
            <textarea
              name="narration"
              rows={4}
              value={getString(node.data.narration, "")}
              onChange={(event) => onDataChange(node.id, "narration", event.currentTarget.value)}
            />
          </label>
          <label>
            Visual prompt
            <textarea
              name="visualPrompt"
              rows={4}
              value={getString(node.data.visualPrompt, "")}
              onChange={(event) => onDataChange(node.id, "visualPrompt", event.currentTarget.value)}
            />
          </label>
          <label>
            插画模型
            <select
              name="imageModel"
              value={getSceneImageModel(node)}
              onChange={(event) => onDataChange(node.id, "imageModel", event.currentTarget.value)}
            >
              {imageModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {node.kind === "composition" ? (
        <>
          <div className="tldraw-inspector-grid">
            <label>
              Primary visual
              <select
                name="primaryVisualKind"
                value={getString(node.data.primaryVisualKind, "auto")}
                onChange={(event) => onDataChange(node.id, "primaryVisualKind", event.currentTarget.value)}
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
                name="layoutPreset"
                value={getString(node.data.layoutPreset, "single")}
                onChange={(event) => onDataChange(node.id, "layoutPreset", event.currentTarget.value)}
              >
                <option value="single">Single</option>
                <option value="split">Split</option>
                <option value="overlay">Overlay</option>
              </select>
            </label>
            <label>
              Transition
              <select
                name="transition"
                value={getString(node.data.transition, "fade")}
                onChange={(event) => onDataChange(node.id, "transition", event.currentTarget.value)}
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
                name="compositionDurationSec"
                type="number"
                value={getNumber(node.data.durationSec, 6)}
                onChange={(event) =>
                  onDataChange(node.id, "durationSec", clampNumber(Number(event.currentTarget.value), 1, 30))
                }
              />
            </label>
          </div>
          <div className="tldraw-checkbox-grid">
            <label className="tldraw-checkbox-row">
              <input
                checked={getBoolean(node.data.includeCaption, true)}
                name="includeCaption"
                type="checkbox"
                onChange={(event) => onDataChange(node.id, "includeCaption", event.currentTarget.checked)}
              />
              Caption
            </label>
            <label className="tldraw-checkbox-row">
              <input
                checked={getBoolean(node.data.includeVoice, true)}
                name="includeVoice"
                type="checkbox"
                onChange={(event) => onDataChange(node.id, "includeVoice", event.currentTarget.checked)}
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
              name="yPercent"
              type="range"
              value={getNumber(node.data.yPercent, 78)}
              onChange={(event) =>
                onDataChange(node.id, "yPercent", clampNumber(Number(event.currentTarget.value), 0, 100))
              }
            />
            <output>{getNumber(node.data.yPercent, 78)}%</output>
          </label>
          <div className="tldraw-inspector-grid">
            <label>
              Font size
              <input
                max={96}
                min={20}
                name="fontSize"
                type="number"
                value={getNumber(node.data.fontSize, 48)}
                onChange={(event) =>
                  onDataChange(node.id, "fontSize", clampNumber(Number(event.currentTarget.value), 20, 96))
                }
              />
            </label>
            <label>
              Color
              <input
                name="captionColor"
                value={getString(node.data.color, "#ffffff")}
                onChange={(event) => onDataChange(node.id, "color", event.currentTarget.value)}
              />
            </label>
          </div>
          <CaptionCueTimeline
            cues={cues}
            durationSec={cueTimelineDurationSec}
            energyBars={captionEnergyBars}
            onCueAdd={() => onCueAdd(node.id)}
            onCueChange={(cueId, key, value) => onCueChange(node.id, cueId, key, value)}
            onCueRemove={(cueId) => onCueRemove(node.id, cueId)}
            onDurationChange={(durationSec) => onDataChange(node.id, "durationSec", durationSec)}
          />
        </>
      ) : null}

      {node.kind === "voice" ? (
        <>
          <label>
            Speed
            <input
              max={1.8}
              min={0.5}
              name="speed"
              step={0.05}
              type="range"
              value={getNumber(node.data.speed, 1)}
              onChange={(event) =>
                onDataChange(node.id, "speed", clampNumber(Number(event.currentTarget.value), 0.5, 1.8))
              }
            />
            <output>{getNumber(node.data.speed, 1).toFixed(2)}x</output>
          </label>
          <label>
            Volume
            <input
              max={2}
              min={0}
              name="volume"
              step={0.05}
              type="range"
              value={getNumber(node.data.volume, 1)}
              onChange={(event) =>
                onDataChange(node.id, "volume", clampNumber(Number(event.currentTarget.value), 0, 2))
              }
            />
            <output>{Math.round(getNumber(node.data.volume, 1) * 100)}%</output>
          </label>
          <label>
            Voice profile
            <input
              name="voiceProfile"
              value={getString(node.data.voiceProfile, getString(node.data.referenceAudioName, ""))}
              onChange={(event) => onDataChange(node.id, "voiceProfile", event.currentTarget.value)}
            />
          </label>
        </>
      ) : null}

      {node.kind === "image" ? (
        <label>
          Image prompt
          <textarea
            name="prompt"
            rows={5}
            value={getString(node.data.prompt, "")}
            onChange={(event) => onDataChange(node.id, "prompt", event.currentTarget.value)}
          />
        </label>
      ) : null}

      {node.kind === "d3" ? (
        <>
          <label>
            Preset
            <select
              name="d3Preset"
              value={d3Preset.id}
              onChange={(event) => onDataPatch(node.id, d3VisualPresetPatch(event.currentTarget.value))}
            >
              {d3VisualPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <div className="tldraw-inspector-grid">
            <label>
              Diagram
              <select
                name="diagram"
                value={d3Diagram}
                onChange={(event) => onDataChange(node.id, "diagram", event.currentTarget.value)}
              >
                <option value="timeline">Timeline</option>
                <option value="relationship">Relationship</option>
                <option value="tree">Tree</option>
                <option value="distribution">Distribution</option>
              </select>
            </label>
            <label>
              Render mode
              <select
                name="d3RenderMode"
                value={visualRenderMode}
                onChange={(event) => onDataChange(node.id, "renderMode", event.currentTarget.value)}
              >
                <option value="contract">Contract</option>
                <option value="asset">Asset</option>
              </select>
            </label>
            <label>
              Duration
              <input
                max={30}
                min={1}
                name="d3DurationSec"
                type="number"
                value={getNumber(node.data.durationSec, 8)}
                onChange={(event) =>
                  onDataChange(node.id, "durationSec", clampNumber(Number(event.currentTarget.value), 1, 30))
                }
              />
            </label>
          </div>
          <label>
            Narration
            <textarea
              name="d3Narration"
              rows={3}
              value={getString(node.data.narration, "")}
              onChange={(event) => onDataChange(node.id, "narration", event.currentTarget.value)}
            />
          </label>
          <label>
            Data JSON
            <textarea
              name="d3DataJson"
              rows={6}
              value={getString(node.data.dataJson, "")}
              onChange={(event) => onDataChange(node.id, "dataJson", event.currentTarget.value)}
            />
          </label>
          <div className="visual-json-tools">
            <span className="visual-json-status" data-state={d3JsonStatus.state}>
              {d3JsonStatus.label}
            </span>
            <button
              disabled={!d3JsonStatus.canFormat}
              type="button"
              onClick={() => {
                const formatted = formatVisualDataJson(getString(node.data.dataJson, ""));

                if (formatted.ok) {
                  onDataChange(node.id, "dataJson", formatted.value);
                }
              }}
            >
              Format
            </button>
          </div>
          <D3VisualPreview
            dataJson={getString(node.data.dataJson, "")}
            diagram={d3Diagram}
            title={getString(node.data.title, d3Preset.title)}
          />
        </>
      ) : null}

      {node.kind === "three" ? (
        <>
          <label>
            Preset
            <select
              name="threePreset"
              value={threePreset.id}
              onChange={(event) =>
                onDataPatch(node.id, threeVisualPresetPatch(event.currentTarget.value))
              }
            >
              {threeVisualPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <div className="tldraw-inspector-grid">
            <label>
              Scene
              <select
                name="threeScene"
                value={threeScene}
                onChange={(event) => onDataChange(node.id, "threeScene", event.currentTarget.value)}
              >
                <option value="orbit">Orbit</option>
                <option value="zodiac-space">Zodiac space</option>
                <option value="planet-focus">Planet focus</option>
              </select>
            </label>
            <label>
              Render mode
              <select
                name="threeRenderMode"
                value={visualRenderMode}
                onChange={(event) => onDataChange(node.id, "renderMode", event.currentTarget.value)}
              >
                <option value="contract">Contract</option>
                <option value="asset">Asset</option>
              </select>
            </label>
            <label>
              Duration
              <input
                max={30}
                min={1}
                name="threeDurationSec"
                type="number"
                value={getNumber(node.data.durationSec, 8)}
                onChange={(event) =>
                  onDataChange(node.id, "durationSec", clampNumber(Number(event.currentTarget.value), 1, 30))
                }
              />
            </label>
          </div>
          <div className="tldraw-inspector-grid">
            <label>
              Speed
              <input
                max={2}
                min={0.1}
                name="threeSpeed"
                step={0.05}
                type="number"
                value={getNumber(node.data.speed, 0.72)}
                onChange={(event) =>
                  onDataChange(node.id, "speed", clampNumber(Number(event.currentTarget.value), 0.1, 2))
                }
              />
            </label>
            <label>
              Accent
              <input
                name="threeAccentColor"
                value={getString(node.data.accentColor, "#e8c164")}
                onChange={(event) => onDataChange(node.id, "accentColor", event.currentTarget.value)}
              />
            </label>
          </div>
          <label>
            Narration
            <textarea
              name="threeNarration"
              rows={3}
              value={getString(node.data.narration, "")}
              onChange={(event) => onDataChange(node.id, "narration", event.currentTarget.value)}
            />
          </label>
          <label>
            Data JSON
            <textarea
              name="threeDataJson"
              rows={6}
              value={getString(node.data.dataJson, "")}
              onChange={(event) => onDataChange(node.id, "dataJson", event.currentTarget.value)}
            />
          </label>
          <div className="visual-json-tools">
            <span className="visual-json-status" data-state={threeJsonStatus.state}>
              {threeJsonStatus.label}
            </span>
            <button
              disabled={!threeJsonStatus.canFormat}
              type="button"
              onClick={() => {
                const formatted = formatVisualDataJson(getString(node.data.dataJson, ""));

                if (formatted.ok) {
                  onDataChange(node.id, "dataJson", formatted.value);
                }
              }}
            >
              Format
            </button>
          </div>
          <ThreeVisualPreview
            accentColor={getString(node.data.accentColor, threePreset.accentColor)}
            dataJson={getString(node.data.dataJson, "")}
            scene={threeScene}
            speed={getNumber(node.data.speed, threePreset.speed)}
            title={getString(node.data.title, threePreset.title)}
          />
        </>
      ) : null}

      {node.kind === "chart" ? (
        <>
          <div className="tldraw-inspector-grid">
            <label>
              Birth date
              <input
                type="date"
                name="birthDate"
                value={getString(node.data.birthDate, defaultChartBirthData.birthDate)}
                onChange={(event) => onDataChange(node.id, "birthDate", event.currentTarget.value)}
              />
            </label>
            <label>
              Birth time
              <input
                type="time"
                name="birthTime"
                value={getString(node.data.birthTime, defaultChartBirthData.birthTime)}
                onChange={(event) => onDataChange(node.id, "birthTime", event.currentTarget.value)}
              />
            </label>
          </div>
          <div className="tldraw-inspector-grid">
            <label>
              Timezone
              <input
                name="timezoneOffsetMinutes"
                type="number"
                value={getNumber(
                  node.data.timezoneOffsetMinutes,
                  defaultChartBirthData.timezoneOffsetMinutes
                )}
                onChange={(event) =>
                  onDataChange(node.id, "timezoneOffsetMinutes", Number(event.currentTarget.value))
                }
              />
            </label>
            <label>
              House
              <select
                name="houseSystem"
                value={getString(node.data.houseSystem, defaultChartBirthData.houseSystem)}
                onChange={(event) => onDataChange(node.id, "houseSystem", event.currentTarget.value)}
              >
                <option value="equal">Equal</option>
              </select>
            </label>
          </div>
          <label>
            Place
            <input
              name="placeName"
              value={getString(node.data.placeName, defaultChartBirthData.placeName)}
              onChange={(event) => onDataChange(node.id, "placeName", event.currentTarget.value)}
            />
          </label>
          <div className="tldraw-inspector-grid">
            <label>
              Latitude
              <input
                max={89.999}
                min={-89.999}
                name="latitude"
                step={0.0001}
                type="number"
                value={getNumber(node.data.latitude, defaultChartBirthData.latitude)}
                onChange={(event) => onDataChange(node.id, "latitude", Number(event.currentTarget.value))}
              />
            </label>
            <label>
              Longitude
              <input
                max={180}
                min={-180}
                name="longitude"
                step={0.0001}
                type="number"
                value={getNumber(node.data.longitude, defaultChartBirthData.longitude)}
                onChange={(event) => onDataChange(node.id, "longitude", Number(event.currentTarget.value))}
              />
            </label>
          </div>
          <label>
            Highlight
            <input
              name="highlight"
              value={getString(node.data.highlight, defaultChartBirthData.highlight)}
              onChange={(event) => onDataChange(node.id, "highlight", event.currentTarget.value)}
            />
          </label>
        </>
      ) : null}

      {node.kind === "preview" ? (
        <div className="tldraw-inspector-grid">
          <label>
            Still frame
            <input
              min={0}
              name="previewFrame"
              type="number"
              value={getNumber(node.data.previewFrame, defaultPreviewFrame)}
              onChange={(event) =>
                onDataChange(node.id, "previewFrame", Math.max(0, Number(event.currentTarget.value)))
              }
            />
          </label>
        </div>
      ) : null}

      {node.kind === "export" ? (
        <>
          <label>
            Export scope
            <select
              name="exportScope"
              value={getExportScope(node)}
              onChange={(event) => onDataChange(node.id, "exportScope", event.currentTarget.value)}
            >
              <option value="clip">Clip</option>
              <option value="full">Full video</option>
            </select>
          </label>
          {getExportScope(node) === "clip" ? (
            <label>
              Frame range
              <input
                name="frameRange"
                value={getString(node.data.frameRange, defaultExportFrameRange)}
                onChange={(event) => onDataChange(node.id, "frameRange", event.currentTarget.value)}
              />
            </label>
          ) : null}
        </>
      ) : null}

      {assetUrl ? (
        <section className="tldraw-asset-summary">
          <strong>Asset</strong>
          <span>{assetUrl}</span>
        </section>
      ) : null}

      <div className="tldraw-inspector-grid">
        <label>
          Width
          <input
            max={620}
            min={120}
            name="nodeWidth"
            type="number"
            value={node.size.width}
            onChange={(event) =>
              onSizeChange(node.id, {
                ...node.size,
                width: clampNumber(Number(event.currentTarget.value), 120, 620)
              })
            }
          />
        </label>
        <label>
          Height
          <input
            max={460}
            min={88}
            name="nodeHeight"
            type="number"
            value={node.size.height}
            onChange={(event) =>
              onSizeChange(node.id, {
                ...node.size,
                height: clampNumber(Number(event.currentTarget.value), 88, 460)
              })
            }
          />
        </label>
      </div>
    </section>
  );
}

const tldrawSceneResourceLabels: Record<SceneResourceJobId, string> = {
  caption: "Caption",
  voice: "Voice",
  chart: "Chart",
  image: "Image",
  d3: "D3",
  three: "Three",
  composition: "Composition"
};

function getNodeJobRequest(node: CanvasNode): NodeJobRequest | null {
  if (node.kind === "topic") {
    return {
      type: "generate-script",
      input: {
        topic: getString(node.data.topic, getString(node.data.description, "Astrology teaching short")),
        model: getNodeAiModel(node)
      }
    };
  }

  if (node.kind === "script" || node.kind === "storyboard") {
    return {
      type: "generate-storyboard",
      input: {
        scriptText: getString(node.data.scriptText, ""),
        sceneCount: getNumber(node.data.sceneCount, 5),
        model: getNodeAiModel(node)
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
        ),
        model: getNodeAiModel(node)
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

  if (node.kind === "preview") {
    return getRenderJobRequest(node);
  }

  if (node.kind === "export") {
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

function selectZeroFlowNode(editor: Editor, nodeId: string) {
  const shape = editor
    .getCurrentPageShapes()
    .find((item) => isZeroFlowNodeShape(item) && item.props.nodeId === nodeId);

  if (!shape) {
    return false;
  }

  editor.select(shape.id);
  return true;
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

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function getNodeRunLabel(node: CanvasNode) {
  switch (node.kind) {
    case "topic":
      return "Generate script";
    case "script":
      return "Generate storyboard";
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

function getNodeAssetUrl(node: CanvasNode) {
  const caption = recordData(node.data.caption);
  return (
    getString(node.data.assetUrl, "") ||
    getString(node.data.chartAssetUrl, "") ||
    getString(node.data.imageAssetUrl, "") ||
    getString(caption?.assetUrl, "")
  );
}

function getEditableCueRowsFromNode(node: CanvasNode) {
  if (Array.isArray(node.data.cues)) {
    return toEditableCaptionCues(node.data.cues);
  }

  return toEditableCaptionCues(recordData(node.data.caption)?.cues);
}

function recordData(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
