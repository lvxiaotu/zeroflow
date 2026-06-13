"use client";

import {
  canvasDocumentSchema,
  compileCanvasToAstroVideoSpec,
  defaultScriptPromptProfileId,
  scriptPromptProfiles,
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
  getNodeImageStyle,
  getSceneImageModel,
  getSceneImageStyle,
  imageModelOptions,
  imageStyleOptions
} from "../canvas/aiModels";
import {
  getAiPromptDataKey,
  getAiPromptLabel,
  getAiPromptPlaceholder,
  getAiPromptRows,
  getAiPromptValue
} from "../canvas/aiNodeInputs";
import {
  getDefaultChapterCount,
  getDefaultChapterSceneCount,
  getDefaultSceneCount,
  getTargetDurationSec,
  storyboardStructureThresholdSec,
  targetDurationOptions
} from "../canvas/videoDurationOptions";
import {
  getCreateExportJobRequest,
  getCreateProjectExportJobRequest,
  getCreatePreviewFlowJobRequest,
  getCreatePreviewJobRequest
} from "../canvas/productionFlowJobs";
import {
  ChartHighlightChildrenEditor,
  ChartHighlightNodeEditor
} from "../canvas/ChartHighlightChildrenEditor";
import {
  createChartHighlightChild,
  getChartHighlightNodes,
  getChartHighlightSourceChart,
  removeChartHighlightChild,
  updateChartHighlightChild,
  type ChartHighlightDataPatch
} from "../canvas/chartHighlightNodes";
import {
  canvasFromTldraw,
  getSelectedZeroFlowNodeIds,
  isZeroFlowNodeShape,
  loadCanvasIntoTldraw,
  syncTldrawEdges,
  updateTldrawNodeShapes
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
  timezone: "Asia/Shanghai",
  latitude: 39.9042,
  longitude: 116.4074,
  placeName: "Beijing",
  houseSystem: "equal",
  zodiacMode: "tropical",
  siderealAyanamsa: "lahiri",
  planetSet: "modern",
  nodeType: "mean",
  chartType: "natal",
  highlight: "ascendant"
};

const chartHouseSystemOptions = [
  { value: "placidus", label: "Placidus" },
  { value: "whole-sign", label: "Whole Sign" },
  { value: "equal", label: "Equal" },
  { value: "koch", label: "Koch" },
  { value: "porphyry", label: "Porphyry" },
  { value: "regiomontanus", label: "Regiomontanus" },
  { value: "campanus", label: "Campanus" },
  { value: "alcabitus", label: "Alcabitus" },
  { value: "sripati", label: "Sripati" },
  { value: "morinus", label: "Morinus" }
];

const chartAyanamsaOptions = [
  { value: "lahiri", label: "Lahiri" },
  { value: "raman", label: "Raman" },
  { value: "fagan-bradley", label: "Fagan-Bradley" },
  { value: "krishnamurti", label: "Krishnamurti" },
  { value: "yukteshwar", label: "Yukteshwar" },
  { value: "true-citra", label: "True Citra" },
  { value: "true-revati", label: "True Revati" },
  { value: "lahiri-icrc", label: "Lahiri ICRC" }
];

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
  const saveCanvasPromiseRef = useRef<Promise<CanvasDocument | null> | null>(null);
  const [canvas, setCanvas] = useState<CanvasDocument | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [statusText, setStatusText] = useState("Loading project");
  const [runningNodeIds, setRunningNodeIds] = useState<Set<string>>(() => new Set());
  const [providerHealth, setProviderHealth] = useState<ClientProviderHealth[]>([]);

  canvasRef.current = canvas;

  const spec = useMemo(() => (canvas ? compileCanvasToAstroVideoSpec(canvas) : null), [canvas]);
  const selectedNode = useMemo(() => {
    if (!canvas || selectedNodeIds.length !== 1) {
      return null;
    }

    return canvas.nodes.find((node) => node.id === selectedNodeIds[0]) ?? null;
  }, [canvas, selectedNodeIds]);
  const selectedChartHighlightNodes = useMemo(
    () =>
      canvas && selectedNode?.kind === "chart"
        ? getChartHighlightNodes(canvas, selectedNode)
        : [],
    [canvas, selectedNode]
  );
  const selectedChartHighlightSourceNode = useMemo(
    () =>
      canvas && selectedNode?.kind === "chart-highlight"
        ? getChartHighlightSourceChart(canvas, selectedNode)
        : undefined,
    [canvas, selectedNode]
  );

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
    if (saveCanvasPromiseRef.current) {
      return saveCanvasPromiseRef.current;
    }

    const editor = editorRef.current;
    const currentCanvas = canvasRef.current;

    if (!editor || !currentCanvas) {
      return currentCanvas;
    }

    const nextCanvas = canvasFromTldraw(editor, currentCanvas);

    const savePromise = (async () => {
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
      } catch (error) {
        if (isAbortError(error)) {
          setSaveState("unsaved");
          setStatusText("Canvas sync was cancelled; using local canvas");
          return canvasRef.current;
        }

        setSaveState("error");
        setStatusText("Canvas sync failed");
        return null;
      }
    })();

    saveCanvasPromiseRef.current = savePromise;

    try {
      return await savePromise;
    } finally {
      if (saveCanvasPromiseRef.current === savePromise) {
        saveCanvasPromiseRef.current = null;
      }
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

      const savedCanvas = await saveTldrawCanvas();
      const currentCanvas = savedCanvas ?? canvasRef.current;
      const node = currentCanvas?.nodes.find((item) => item.id === nodeId);

      if (!node) {
        setStatusText("This node has no runnable job yet");
        return;
      }

      setSaveState("saving");
      setRunningNodeIds((current) => new Set(current).add(node.id));
      setStatusText(`Running ${draftJobRequest.type}`);

      try {
        const created = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            type: draftJobRequest.type,
            canvasNodeId: node.id,
            input: draftJobRequest.input
          })
        });

        if (!created.ok) {
          throw new Error("job creation failed");
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
        if (isAbortError(error)) {
          setSaveState("unsaved");
          setStatusText(`${draftJobRequest.type} request was cancelled; please retry`);
          return;
        }

        setSaveState("error");
        setStatusText(error instanceof Error ? error.message : `${draftJobRequest.type} failed`);
      } finally {
        setRunningNodeIds((current) => {
          const next = new Set(current);
          next.delete(node.id);
          return next;
        });
      }
    },
    [loadProjectCanvas, projectId, saveTldrawCanvas]
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
        updateTldrawNodeShapes(editor, nextCanvas);
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
    (nodeId: string, cueId: string, key: CaptionCueChangeKey, value: string | number) =>
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

  const addChartHighlightNode = useCallback(
    (chartNode: CanvasNode) => {
      const currentCanvas = canvasRef.current;

      if (!currentCanvas) {
        return;
      }

      const editor = editorRef.current;
      const baseCanvas = editor ? canvasFromTldraw(editor, currentCanvas) : currentCanvas;
      const result = createChartHighlightChild(baseCanvas, chartNode);

      applyCanvas(result.canvas, true);
      setSaveState("unsaved");
      setStatusText("Chart highlight child added");

      if (editor && selectZeroFlowNode(editor, chartNode.id)) {
        setSelectedNodeIds([chartNode.id]);
      }
    },
    [applyCanvas]
  );

  const updateChartHighlightNode = useCallback(
    (nodeId: string, patch: ChartHighlightDataPatch) => {
      const currentCanvas = canvasRef.current;

      if (!currentCanvas) {
        return;
      }

      const editor = editorRef.current;
      const baseCanvas = editor ? canvasFromTldraw(editor, currentCanvas) : currentCanvas;
      const nextCanvas = updateChartHighlightChild(baseCanvas, nodeId, patch);

      applyCanvas(nextCanvas);
      setSaveState("unsaved");
      setStatusText("Chart highlight child updated");

      if (editor) {
        updateTldrawNodeShapes(editor, nextCanvas);
        syncTldrawEdges(editor, nextCanvas);
      }
    },
    [applyCanvas]
  );

  const deleteChartHighlightNode = useCallback(
    (nodeId: string) => {
      const currentCanvas = canvasRef.current;

      if (!currentCanvas) {
        return;
      }

      const node = currentCanvas.nodes.find((item) => item.id === nodeId);
      if (!node) {
        setStatusText("Chart highlight child does not exist");
        return;
      }

      const confirmed = window.confirm(`删除星盘高亮“${getString(node.data.title, node.id)}”？`);
      if (!confirmed) {
        setStatusText("Delete cancelled");
        return;
      }

      const editor = editorRef.current;
      const baseCanvas = editor ? canvasFromTldraw(editor, currentCanvas) : currentCanvas;
      const nextCanvas = removeChartHighlightChild(baseCanvas, nodeId);

      applyCanvas(nextCanvas, true);
      setSaveState("unsaved");
      setStatusText("Chart highlight child deleted");
    },
    [applyCanvas]
  );

  const selectChartHighlightNode = useCallback((nodeId: string) => {
    const editor = editorRef.current;

    if (editor && !selectZeroFlowNode(editor, nodeId)) {
      return;
    }

    setSelectedNodeIds([nodeId]);
  }, []);

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

  function createProjectExport() {
    const anchorNodeId = selectedNodeIds[0] ?? canvasRef.current?.nodes[0]?.id;

    if (!anchorNodeId) {
      setStatusText("No node available for project export");
      return;
    }

    void runNodeJobRequest(anchorNodeId, getCreateProjectExportJobRequest());
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
          <Link
            href={`/studio/${encodeURIComponent(projectId)}?projectId=${encodeURIComponent(projectId)}`}
          >
            Back to Studio
          </Link>
          <Link href="/providers">Providers</Link>
          <button type="button" onClick={fitView}>
            Fit
          </button>
          <button type="button" onClick={createProjectExport}>
            全片导出
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
            chartHighlightNodes={selectedChartHighlightNodes}
            chartHighlightSourceNode={selectedChartHighlightSourceNode}
            running={selectedNode ? runningNodeIds.has(selectedNode.id) : false}
            selectedCount={selectedNodeIds.length}
            onDataChange={updateNodeData}
            onDataPatch={updateNodeDataPatch}
            onCueAdd={addCaptionCue}
            onCueChange={updateCaptionCue}
            onCueRemove={removeCaptionCue}
            onRunNode={runNodeAction}
            onRunNodeJob={runNodeJobRequest}
            onChartHighlightAdd={addChartHighlightNode}
            onChartHighlightChange={updateChartHighlightNode}
            onChartHighlightDelete={deleteChartHighlightNode}
            onChartHighlightSelect={selectChartHighlightNode}
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
  chartHighlightNodes,
  chartHighlightSourceNode,
  running,
  selectedCount,
  onDataChange,
  onDataPatch,
  onCueAdd,
  onCueChange,
  onCueRemove,
  onRunNode,
  onRunNodeJob,
  onChartHighlightAdd,
  onChartHighlightChange,
  onChartHighlightDelete,
  onChartHighlightSelect,
  onSizeChange
}: {
  node: CanvasNode | null;
  chartHighlightNodes: CanvasNode[];
  chartHighlightSourceNode?: CanvasNode;
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
  onChartHighlightAdd: (chartNode: CanvasNode) => void;
  onChartHighlightChange: (nodeId: string, patch: ChartHighlightDataPatch) => void;
  onChartHighlightDelete: (nodeId: string) => void;
  onChartHighlightSelect: (nodeId: string) => void;
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
  const assetPath = getString(node.data.assetPath, "");
  const visualRenderMode = getString(node.data.renderMode, assetUrl ? "asset" : "contract");
  const nodeJobRequest = getNodeJobRequest(node);
  const runnable = nodeJobRequest !== null;
  const aiModelTarget = getAiModelTarget(node.kind);
  const aiPromptDataKey = getAiPromptDataKey(node.kind);
  const d3Diagram = getString(node.data.diagram, "timeline");
  const d3Preset = getD3VisualPreset(getString(node.data.visualPreset, d3Diagram));
  const d3JsonStatus = d3DataJsonStatus(d3Diagram, getString(node.data.dataJson, ""));
  const threeScene = getString(node.data.threeScene, "orbit");
  const threePreset = getThreeVisualPreset(getString(node.data.visualPreset, threeScene));
  const threeJsonStatus = threeDataJsonStatus(threeScene, getString(node.data.dataJson, ""));
  const chartPipeline = node.kind === "chart" ? getChartPipelineSummary(node) : null;
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
            data-risk="local-or-mock"
            disabled={running}
            type="button"
            onClick={() => void onRunNode(node.id)}
          >
            {running ? "Running..." : getNodeRunLabel(node)}
          </button>
          {node.kind === "topic" ? (
            <button
              className="tldraw-inspector-run"
              data-risk="local-or-mock"
              disabled={running}
              type="button"
              onClick={() => void onRunNodeJob(node.id, getCreateManualScriptJobRequest(node))}
            >
              {running ? "Running..." : "手写文案"}
            </button>
          ) : null}
          {node.kind === "d3" ? (
            <button
              className="tldraw-inspector-run"
              data-risk="local-or-mock"
              disabled={running}
              type="button"
              onClick={() => void onRunNodeJob(node.id, { type: "export-visual-asset", input: {} })}
            >
              {running ? "Running..." : "导出视觉素材"}
            </button>
          ) : null}
          <section className="tldraw-provider-guard" data-risk="local-or-mock">
            <strong>Ready to run</strong>
            <span>Jobs run immediately with the configured provider.</span>
          </section>
        </>
      ) : null}

      {node.kind === "scene" ? (
        <section className="tldraw-resource-actions">
          <strong>Resources</strong>
          <div className="tldraw-resource-grid">
            {sceneResourceJobIds.map((resourceId) => {
              const request = getSceneResourceJobRequest(node, resourceId);

              return (
                <button
                  className="tldraw-inspector-run"
                  data-risk="local-or-mock"
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
          <button
            className="tldraw-inspector-run"
            data-risk="local-or-mock"
            disabled={running}
            type="button"
            onClick={() => void onRunNodeJob(node.id, getCreatePreviewFlowJobRequest(node))}
          >
            {running ? "Running..." : "创建当前分镜预览"}
          </button>
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

      {!aiPromptDataKey ? (
        <>
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
        </>
      ) : null}

      {aiPromptDataKey ? (
        <label>
          {getAiPromptLabel(node.kind)}
          <textarea
            name={aiPromptDataKey}
            placeholder={getAiPromptPlaceholder(node.kind)}
            rows={getAiPromptRows(node.kind)}
            value={getAiPromptValue(node)}
            onChange={(event) => onDataChange(node.id, aiPromptDataKey, event.currentTarget.value)}
          />
        </label>
      ) : null}

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

      {node.kind === "image" ? (
        <>
          <label>
            风格
            <select
              name="imageStyle"
              value={getNodeImageStyle(node)}
              onChange={(event) => onDataChange(node.id, "imageStyle", event.currentTarget.value)}
            >
              {imageStyleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            类型
          </label>
        </>
      ) : null}

      {node.kind === "topic" ? (
        <label>
          文案风格
          <select
            name="scriptProfileId"
            value={getString(node.data.scriptProfileId, defaultScriptPromptProfileId)}
            onChange={(event) =>
              onDataChange(node.id, "scriptProfileId", event.currentTarget.value)
            }
          >
            {scriptPromptProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {node.kind === "topic" ||
      node.kind === "script" ||
      node.kind === "structure" ||
      node.kind === "storyboard" ||
      node.kind === "chapter" ? (
        <label>
          目标时长
          <select
            name="targetDurationSec"
            value={getTargetDurationSec(node.data.targetDurationSec)}
            onChange={(event) =>
              onDataChange(node.id, "targetDurationSec", Number(event.currentTarget.value))
            }
          >
            {targetDurationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {node.kind === "script" || node.kind === "structure" ? (
        <label>
          章节数量
          <input
            max={24}
            min={1}
            name="chapterCount"
            type="number"
            value={getNumber(
              node.data.chapterCount,
              getDefaultChapterCount(getTargetDurationSec(node.data.targetDurationSec))
            )}
            onChange={(event) =>
              onDataChange(
                node.id,
                "chapterCount",
                clampNumber(Number(event.currentTarget.value), 1, 24)
              )
            }
          />
        </label>
      ) : null}

      {node.kind === "script" || node.kind === "storyboard" ? (
        <label>
          Scene count
          <input
            max={60}
            min={1}
            name="sceneCount"
            type="number"
            value={getNumber(
              node.data.sceneCount,
              getDefaultSceneCount(getTargetDurationSec(node.data.targetDurationSec))
            )}
            onChange={(event) =>
              onDataChange(
                node.id,
                "sceneCount",
                clampNumber(Number(event.currentTarget.value), 1, 60)
              )
            }
          />
        </label>
      ) : null}

      {node.kind === "chapter" ? (
        <label>
          本章分镜数量
          <input
            max={24}
            min={1}
            name="sceneCount"
            type="number"
            value={getNumber(
              node.data.sceneCount,
              getDefaultChapterSceneCount(getTargetDurationSec(node.data.targetDurationSec))
            )}
            onChange={(event) =>
              onDataChange(
                node.id,
                "sceneCount",
                clampNumber(Number(event.currentTarget.value), 1, 24)
              )
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
                onDataChange(
                  node.id,
                  "durationSec",
                  clampNumber(Number(event.currentTarget.value), 1, 30)
                )
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
            AI 模型
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
          <label>
            风格
            <select
              name="imageStyle"
              value={getSceneImageStyle(node)}
              onChange={(event) => onDataChange(node.id, "imageStyle", event.currentTarget.value)}
            >
              {imageStyleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            类型
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
                onChange={(event) =>
                  onDataChange(node.id, "primaryVisualKind", event.currentTarget.value)
                }
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
              Secondary visual
              <select
                name="secondaryVisualKind"
                value={getString(node.data.secondaryVisualKind, "none")}
                onChange={(event) =>
                  onDataChange(node.id, "secondaryVisualKind", event.currentTarget.value)
                }
              >
                <option value="none">None</option>
                <option value="chart">Chart</option>
                <option value="image">Image</option>
              </select>
            </label>
            <label>
              Layout
              <select
                name="layoutPreset"
                value={getString(node.data.layoutPreset, "single")}
                onChange={(event) =>
                  onDataChange(node.id, "layoutPreset", event.currentTarget.value)
                }
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
                  onDataChange(
                    node.id,
                    "durationSec",
                    clampNumber(Number(event.currentTarget.value), 1, 30)
                  )
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
                onChange={(event) =>
                  onDataChange(node.id, "includeCaption", event.currentTarget.checked)
                }
              />
              Caption
            </label>
            <label className="tldraw-checkbox-row">
              <input
                checked={getBoolean(node.data.includeVoice, true)}
                name="includeVoice"
                type="checkbox"
                onChange={(event) =>
                  onDataChange(node.id, "includeVoice", event.currentTarget.checked)
                }
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
                onDataChange(
                  node.id,
                  "yPercent",
                  clampNumber(Number(event.currentTarget.value), 0, 100)
                )
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
                  onDataChange(
                    node.id,
                    "fontSize",
                    clampNumber(Number(event.currentTarget.value), 20, 96)
                  )
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
                onDataChange(
                  node.id,
                  "speed",
                  clampNumber(Number(event.currentTarget.value), 0.5, 1.8)
                )
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
                onDataChange(
                  node.id,
                  "volume",
                  clampNumber(Number(event.currentTarget.value), 0, 2)
                )
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

      {node.kind === "d3" ? (
        <>
          <label>
            Preset
            <select
              name="d3Preset"
              value={d3Preset.id}
              onChange={(event) =>
                onDataPatch(node.id, d3VisualPresetPatch(event.currentTarget.value))
              }
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
                  onDataChange(
                    node.id,
                    "durationSec",
                    clampNumber(Number(event.currentTarget.value), 1, 30)
                  )
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
                  onDataChange(
                    node.id,
                    "durationSec",
                    clampNumber(Number(event.currentTarget.value), 1, 30)
                  )
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
                  onDataChange(
                    node.id,
                    "speed",
                    clampNumber(Number(event.currentTarget.value), 0.1, 2)
                  )
                }
              />
            </label>
            <label>
              Accent
              <input
                name="threeAccentColor"
                value={getString(node.data.accentColor, "#e8c164")}
                onChange={(event) =>
                  onDataChange(node.id, "accentColor", event.currentTarget.value)
                }
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
          <section className="tldraw-asset-summary">
            <strong>Chart pipeline</strong>
            <span>Display: {chartPipeline?.renderer ?? "AstroChart SVG"}</span>
            <span>Calculation: {chartPipeline?.calculator ?? "Swiss Ephemeris"}</span>
            {chartPipeline?.ephemeris ? <span>Ephemeris: {chartPipeline.ephemeris}</span> : null}
            {chartPipeline?.zodiac ? <span>Zodiac: {chartPipeline.zodiac}</span> : null}
            {chartPipeline?.houses ? <span>Houses: {chartPipeline.houses}</span> : null}
            {chartPipeline?.timezone ? <span>Timezone: {chartPipeline.timezone}</span> : null}
            {chartPipeline?.source ? <span>Data: {chartPipeline.source}</span> : null}
          </section>
          <ChartHighlightChildrenEditor
            chartNode={node}
            highlights={chartHighlightNodes}
            onAdd={onChartHighlightAdd}
            onDelete={onChartHighlightDelete}
            onSelect={onChartHighlightSelect}
          />
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
              IANA zone
              <input
                name="timezone"
                value={getString(node.data.timezone, defaultChartBirthData.timezone)}
                onChange={(event) => onDataChange(node.id, "timezone", event.currentTarget.value)}
              />
            </label>
          </div>
          <div className="tldraw-inspector-grid">
            <label>
              House
              <select
                name="houseSystem"
                value={getString(node.data.houseSystem, defaultChartBirthData.houseSystem)}
                onChange={(event) =>
                  onDataChange(node.id, "houseSystem", event.currentTarget.value)
                }
              >
                {chartHouseSystemOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Zodiac
              <select
                name="zodiacMode"
                value={getString(node.data.zodiacMode, defaultChartBirthData.zodiacMode)}
                onChange={(event) =>
                  onDataChange(node.id, "zodiacMode", event.currentTarget.value)
                }
              >
                <option value="tropical">Tropical</option>
                <option value="sidereal">Sidereal</option>
              </select>
            </label>
          </div>
          <div className="tldraw-inspector-grid">
            <label>
              Ayanamsa
              <select
                name="siderealAyanamsa"
                value={getString(node.data.siderealAyanamsa, defaultChartBirthData.siderealAyanamsa)}
                onChange={(event) =>
                  onDataChange(node.id, "siderealAyanamsa", event.currentTarget.value)
                }
              >
                {chartAyanamsaOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Planet set
              <select
                name="planetSet"
                value={getString(node.data.planetSet, defaultChartBirthData.planetSet)}
                onChange={(event) => onDataChange(node.id, "planetSet", event.currentTarget.value)}
              >
                <option value="classical">Classical</option>
                <option value="modern">Modern</option>
                <option value="extended">Extended</option>
              </select>
            </label>
          </div>
          <label>
            Lunar node
            <select
              name="nodeType"
              value={getString(node.data.nodeType, defaultChartBirthData.nodeType)}
              onChange={(event) => onDataChange(node.id, "nodeType", event.currentTarget.value)}
            >
              <option value="mean">Mean Node</option>
              <option value="true">True Node</option>
              <option value="both">Both</option>
            </select>
          </label>
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
                onChange={(event) =>
                  onDataChange(node.id, "latitude", Number(event.currentTarget.value))
                }
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
                onChange={(event) =>
                  onDataChange(node.id, "longitude", Number(event.currentTarget.value))
                }
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

      {node.kind === "chart-highlight" ? (
        <ChartHighlightNodeEditor
          chartNode={chartHighlightSourceNode ?? node}
          highlight={node}
          onChange={onChartHighlightChange}
        />
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
                onDataChange(
                  node.id,
                  "previewFrame",
                  Math.max(0, Number(event.currentTarget.value))
                )
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
        node.kind === "export" ? (
          <section className="tldraw-asset-summary">
            <strong>导出视频</strong>
            <div className="export-video-preview">
              <video controls preload="metadata" src={assetUrl} />
            </div>
            <div className="export-asset-actions">
              <a href={assetUrl} download>
                下载视频
              </a>
              <a href={assetUrl} rel="noreferrer" target="_blank">
                新窗口打开
              </a>
            </div>
            {assetPath ? (
              <div className="export-asset-path">
                <strong>本地文件位置</strong>
                <code>{assetPath}</code>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="tldraw-asset-summary">
            <strong>Asset</strong>
            <span>{assetUrl}</span>
          </section>
        )
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

function getCreateManualScriptJobRequest(node: CanvasNode): NodeJobRequest {
  return {
    type: "create-manual-script",
    input: {
      topic: getAiPromptValue(node) || "Astrology teaching short",
      targetDurationSec: getTargetDurationSec(node.data.targetDurationSec),
      scriptProfileId: getString(node.data.scriptProfileId, defaultScriptPromptProfileId)
    }
  };
}

function getNodeJobRequest(node: CanvasNode): NodeJobRequest | null {
  if (node.kind === "topic") {
    return {
      type: "generate-script",
      input: {
        topic: getAiPromptValue(node) || "Astrology teaching short",
        model: getNodeAiModel(node),
        scriptProfileId: getString(node.data.scriptProfileId, defaultScriptPromptProfileId),
        targetDurationSec: getTargetDurationSec(node.data.targetDurationSec)
      }
    };
  }

  if (node.kind === "script" || node.kind === "storyboard") {
    const targetDurationSec = getTargetDurationSec(node.data.targetDurationSec);

    if (node.kind === "script" && targetDurationSec > storyboardStructureThresholdSec) {
      return {
        type: "create-structure-node",
        input: {
          scriptText: getAiPromptValue(node),
          targetDurationSec,
          chapterCount: getNumber(
            node.data.chapterCount,
            getDefaultChapterCount(targetDurationSec)
          ),
          model: getNodeAiModel(node)
        }
      };
    }

    return {
      type: "generate-storyboard",
      input: {
        scriptText: getAiPromptValue(node),
        sceneCount: getNumber(node.data.sceneCount, getDefaultSceneCount(targetDurationSec)),
        model: getNodeAiModel(node),
        targetDurationSec
      }
    };
  }

  if (node.kind === "structure") {
    const targetDurationSec = getTargetDurationSec(node.data.targetDurationSec);

    return {
      type: "generate-chapters",
      input: {
        scriptText: getString(node.data.scriptText, ""),
        targetDurationSec,
        chapterCount: getNumber(node.data.chapterCount, getDefaultChapterCount(targetDurationSec)),
        model: getNodeAiModel(node)
      }
    };
  }

  if (node.kind === "chapter") {
    const targetDurationSec = getTargetDurationSec(node.data.targetDurationSec);

    return {
      type: "expand-chapter-scenes",
      input: {
        scriptText: getAiPromptValue(node),
        targetDurationSec,
        sceneCount: getNumber(node.data.sceneCount, getDefaultChapterSceneCount(targetDurationSec)),
        model: getNodeAiModel(node)
      }
    };
  }

  if (node.kind === "image") {
    const imageModel = getNodeAiModel(node);
    const imageStyle = getNodeImageStyle(node);

    return {
      type: "generate-image",
      input: {
        prompt: getAiPromptValue(node) || "简洁的占星教学插画，清晰表达核心概念，适合短视频画面",
        model: imageModel,
        imageStyle
      }
    };
  }

  if (node.kind === "voice") {
    return { type: "generate-tts", input: {} };
  }

  if (node.kind === "chart") {
    return { type: "generate-chart", input: getChartJobInput(node) };
  }

  if (node.kind === "d3") {
    const title = getString(node.data.title, "D3 Diagram");
    const description = getString(node.data.description, title);

    return {
      type: "generate-d3",
      input: {
        prompt: getAiPromptValue(node) || description,
        title,
        description,
        narration: getString(node.data.narration, description),
        diagram: getString(node.data.diagram, "timeline"),
        durationSec: getNumber(node.data.durationSec, 8),
        model: getNodeAiModel(node)
      }
    };
  }

  if (node.kind === "three") {
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
    timezone: getString(node.data.timezone, defaultChartBirthData.timezone),
    latitude: getNumber(node.data.latitude, defaultChartBirthData.latitude),
    longitude: getNumber(node.data.longitude, defaultChartBirthData.longitude),
    placeName: getString(node.data.placeName, defaultChartBirthData.placeName),
    houseSystem: getString(node.data.houseSystem, defaultChartBirthData.houseSystem),
    zodiacMode: getString(node.data.zodiacMode, defaultChartBirthData.zodiacMode),
    siderealAyanamsa: getString(
      node.data.siderealAyanamsa,
      defaultChartBirthData.siderealAyanamsa
    ),
    planetSet: getString(node.data.planetSet, defaultChartBirthData.planetSet),
    nodeType: getString(node.data.nodeType, defaultChartBirthData.nodeType),
    chartType: getString(node.data.chartType, defaultChartBirthData.chartType),
    highlight: getString(node.data.highlight, defaultChartBirthData.highlight)
  };
}

function getChartPipelineSummary(node: CanvasNode) {
  const calculation = recordData(node.data.calculation);
  const renderer = getString(node.data.renderer, "AstroChart SVG");
  const calculator = getString(
    node.data.calculator,
    getString(calculation?.engine, "Swiss Ephemeris")
  );
  const ephemeris = getChartEphemerisLabel(getString(calculation?.ephemeris, ""));
  const zodiac = getChartZodiacLabel(calculation);
  const houses = getString(calculation?.houseSystem, "");
  const timezone = getString(calculation?.timezone, "");
  const source = getChartSourceLabel(getString(node.data.source, ""));

  return {
    renderer,
    calculator,
    ephemeris,
    zodiac,
    houses,
    timezone,
    source
  };
}

function getChartZodiacLabel(calculation: Record<string, unknown> | undefined) {
  const zodiacMode = getString(calculation?.zodiacMode, "");
  const siderealAyanamsa = getString(calculation?.siderealAyanamsa, "");

  if (zodiacMode === "sidereal") {
    return siderealAyanamsa ? `Sidereal / ${siderealAyanamsa}` : "Sidereal";
  }

  return zodiacMode === "tropical" ? "Tropical" : "";
}

function getChartEphemerisLabel(ephemeris: string) {
  const labels: Record<string, string> = {
    "swiss-files": "Swiss Ephemeris files",
    moshier: "Moshier fallback"
  };

  return labels[ephemeris] ?? ephemeris;
}

function getChartSourceLabel(source: string) {
  const labels: Record<string, string> = {
    "provided-data": "provided chart data",
    "calculated-birth": "birth input",
    sample: "sample data"
  };

  return labels[source] ?? source;
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
    "structureNodeId",
    "chapterNodeId",
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

  const chapterNodeIds = output?.chapterNodeIds;
  if (Array.isArray(chapterNodeIds) && typeof chapterNodeIds[0] === "string") {
    return chapterNodeIds[0];
  }

  return undefined;
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
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

function getNodeRunLabel(node: CanvasNode) {
  switch (node.kind) {
    case "topic":
      return "Generate script";
    case "script":
      return getTargetDurationSec(node.data.targetDurationSec) > 60
        ? "生成结构"
        : "Generate storyboard";
    case "structure":
      return "生成章节";
    case "chapter":
      return "展开本章分镜";
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
      return "生成 D3 图表";
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
