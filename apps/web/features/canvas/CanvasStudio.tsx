"use client";

import {
  canvasDocumentSchema,
  compileCanvasToAstroVideoSpec,
  defaultScriptPromptProfileId,
  getSpecDurationFrames,
  phaseSummary,
  scriptPromptProfiles,
  type AstroVideoSpec,
  type CanvasDocument,
  type CanvasNode,
  type CanvasNodeKind
} from "@zeroflow/core";
import { Player } from "@remotion/player";
import { AstroVideoComposition, getCompositionSize } from "@zeroflow/remotion-video";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
/* eslint-disable @next/next/no-img-element */

import {
  defaultPreviewFrame,
  getExportFrameRange,
  getExportScope,
  getRenderJobRequest
} from "../render/renderJob";
import {
  getCreateExportJobRequest,
  getCreateProjectExportJobRequest,
  getCreatePreviewFlowJobRequest,
  getCreatePreviewJobRequest
} from "./productionFlowJobs";
import {
  getSceneResourceJobRequest,
  sceneResourceJobIds,
  type NodeJobRequest,
  type SceneResourceJobId
} from "./sceneResourceJobs";
import {
  defaultCanvasDocument,
  defaultProjectId,
  nodeKindDescriptions,
  nodeKindLabels
} from "./seed";
import {
  getAiModelOptionsForKind,
  getAiModelTarget,
  getNodeAiModel,
  getNodeImageStyle,
  getSceneImageModel,
  getSceneImageStyle,
  imageModelOptions,
  imageStyleOptions
} from "./aiModels";
import {
  getAiPromptDataKey,
  getAiPromptLabel,
  getAiPromptPlaceholder,
  getAiPromptRows,
  getAiPromptValue
} from "./aiNodeInputs";
import {
  getDefaultChapterCount,
  getDefaultChapterSceneCount,
  getDefaultSceneCount,
  getTargetDurationSec,
  storyboardStructureThresholdSec,
  targetDurationOptions
} from "./videoDurationOptions";
import {
  d3DataJsonStatus,
  d3VisualPresetPatch,
  d3VisualPresets,
  formatVisualDataJson,
  getD3VisualPreset,
  type VisualPresetPatch
} from "../visuals/visualPresets";
import { D3VisualPreview } from "../visuals/VisualPreview";
import {
  ChartHighlightChildrenEditor,
  ChartHighlightNodeEditor
} from "./ChartHighlightChildrenEditor";
import {
  createChartHighlightChild,
  getChartHighlightNodes,
  getChartHighlightSourceChart,
  removeChartHighlightChild,
  updateChartHighlightChild,
  type ChartHighlightDataPatch
} from "./chartHighlightNodes";

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

const sceneResourceLabels: Record<SceneResourceJobId, string> = {
  caption: "字幕",
  voice: "配音",
  chart: "星盘",
  image: "图像",
  d3: "D3 图表",
  three: "三维场景",
  composition: "画面合成"
};

const saveStateLabels: Record<SaveState, string> = {
  saved: "已保存",
  saving: "保存中",
  unsaved: "未保存",
  restored: "已恢复",
  error: "异常"
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
  const [statusText, setStatusText] = useState("画布已就绪");
  const [runningNodeIds, setRunningNodeIds] = useState<Set<string>>(() => new Set());
  const canvasRef = useRef<CanvasDocument>(defaultCanvasDocument);
  const saveCanvasPromiseRef = useRef<Promise<CanvasDocument | null> | null>(null);
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
            setStatusText("项目已恢复");
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
          setStatusText("本地草稿已恢复");
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
  const selectedChartHighlightNodes = useMemo(
    () =>
      selectedNode?.kind === "chart"
        ? getChartHighlightNodes(canvasDoc, selectedNode)
        : [],
    [canvasDoc, selectedNode]
  );
  const selectedChartHighlightSourceNode = useMemo(
    () =>
      selectedNode?.kind === "chart-highlight"
        ? getChartHighlightSourceChart(canvasDoc, selectedNode)
        : undefined,
    [canvasDoc, selectedNode]
  );
  const previewSpec = useMemo(() => compileCanvasToAstroVideoSpec(canvasDoc), [canvasDoc]);

  function commitCanvas(updater: (current: CanvasDocument) => CanvasDocument) {
    setCanvasDoc((current) => {
      const next = updater(current);
      canvasRef.current = next;
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveState("unsaved");
      return next;
    });
  }

  async function saveCanvasAsync(
    canvasToSave: CanvasDocument = canvasRef.current,
    messages: { saving?: string; saved?: string; failed?: string } = {}
  ) {
    const canReuseSave =
      canvasToSave === canvasRef.current &&
      !messages.saving &&
      !messages.saved &&
      !messages.failed;

    if (canReuseSave && saveCanvasPromiseRef.current) {
      return saveCanvasPromiseRef.current;
    }

    const currentCanvas = canvasToSave;

    const savePromise = (async () => {
      canvasRef.current = currentCanvas;
      setSaveState("saving");
      setStatusText(messages.saving ?? "正在保存画布");
      localStorage.setItem(storageKey, JSON.stringify(currentCanvas));

      try {
        const response = await fetch("/api/project/canvas", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, canvas: currentCanvas })
        });

        if (!response.ok) {
          throw new Error("画布保存失败");
        }

        const payload = (await response.json()) as { project?: { canvas?: unknown } };
        const parsed = canvasDocumentSchema.safeParse(payload.project?.canvas);
        const savedCanvas = parsed.success ? parsed.data : currentCanvas;

        setCanvasDoc(savedCanvas);
        canvasRef.current = savedCanvas;
        localStorage.setItem(storageKey, JSON.stringify(savedCanvas));
        setSaveState("saved");
        setStatusText(messages.saved ?? "画布已保存");
        return savedCanvas;
      } catch (error) {
        if (isAbortError(error)) {
          setSaveState("unsaved");
          setStatusText("画布同步被取消，继续使用本地画布");
          return canvasRef.current;
        }

        setSaveState("error");
        setStatusText(messages.failed ?? "画布保存失败");
        return null;
      }
    })();

    if (!canReuseSave) {
      return savePromise;
    }

    saveCanvasPromiseRef.current = savePromise;

    try {
      return await savePromise;
    } finally {
      if (saveCanvasPromiseRef.current === savePromise) {
        saveCanvasPromiseRef.current = null;
      }
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
    setStatusText("画布已重置");
  }

  async function loadProjectCanvas(selectNodeId?: string) {
    const response = await fetch(`/api/project?projectId=${encodeURIComponent(projectId)}`);

    if (!response.ok) {
      throw new Error("项目请求失败");
    }

    const payload = (await response.json()) as { project?: { canvas?: unknown } };
    const parsed = canvasDocumentSchema.safeParse(payload.project?.canvas);

    if (!parsed.success) {
      throw new Error("项目画布数据无效");
    }

    setCanvasDoc(parsed.data);
    canvasRef.current = parsed.data;
    localStorage.setItem(storageKey, JSON.stringify(parsed.data));
    setSelectedNodeId(
      resolveInitialCanvasNodeId(parsed.data.nodes, selectNodeId ?? selectedNodeId)
    );
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

  function addChartHighlightNode(chartNode: CanvasNode) {
    commitCanvas((current) => createChartHighlightChild(current, chartNode).canvas);
    setStatusText("已添加星盘高亮子节点");
  }

  function updateChartHighlightNode(nodeId: string, patch: ChartHighlightDataPatch) {
    commitCanvas((current) => updateChartHighlightChild(current, nodeId, patch));
    setStatusText("已更新星盘高亮子节点");
  }

  function deleteChartHighlightNode(nodeId: string) {
    const node = canvasRef.current.nodes.find((item) => item.id === nodeId);

    if (!node) {
      setStatusText("这个高亮子节点不存在");
      return;
    }

    const confirmed = window.confirm(`删除星盘高亮“${getNodeTitle(node)}”？`);
    if (!confirmed) {
      setStatusText("删除已取消");
      return;
    }

    commitCanvas((current) => removeChartHighlightChild(current, nodeId));
    setSelectedNodeId((current) => (current === nodeId ? undefined : current));
    setStatusText("已删除星盘高亮子节点");
  }

  function updateNode(nodeId: string, updater: (node: CanvasNode) => CanvasNode) {
    commitCanvas((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? updater(node) : node))
    }));
  }

  async function deleteNode(nodeId: string) {
    const node = canvasRef.current.nodes.find((item) => item.id === nodeId);

    if (!node) {
      setStatusText("这个节点不存在");
      return;
    }

    const confirmed = window.confirm(`删除节点“${getNodeTitle(node)}”？相关连线也会一起删除。`);

    if (!confirmed) {
      setStatusText("删除已取消");
      return;
    }

    const nextCanvas = {
      ...canvasRef.current,
      nodes: canvasRef.current.nodes.filter((item) => item.id !== nodeId),
      edges: canvasRef.current.edges.filter(
        (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId
      )
    };
    setCanvasDoc(nextCanvas);
    canvasRef.current = nextCanvas;
    localStorage.setItem(storageKey, JSON.stringify(nextCanvas));
    setSelectedNodeId((current) => (current === nodeId ? undefined : current));
    setExpandedNodeId((current) => (current === nodeId ? undefined : current));
    await saveCanvasAsync(nextCanvas, {
      saving: `正在删除并保存：${getNodeTitle(node)}`,
      saved: `已删除节点：${getNodeTitle(node)}`,
      failed: `已在本地删除节点，但保存失败：${getNodeTitle(node)}`
    });
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
      setStatusText("这个节点还没有可运行任务");
      return;
    }

    const savedCanvas = await saveCanvasAsync();
    const currentCanvas = savedCanvas ?? canvasRef.current;
    const node = currentCanvas.nodes.find((item) => item.id === nodeId);

    if (!node) {
      setStatusText("这个节点还没有可运行任务");
      return;
    }

    setSaveState("saving");
    setRunningNodeIds((current) => new Set(current).add(node.id));
    setStatusText(`正在运行：${getJobTypeLabel(draftJobRequest.type)}`);

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
        throw new Error("任务创建失败");
      }

      const createdPayload = (await created.json()) as { job: { id: string } };
      const completed = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: createdPayload.job.id })
      });

      if (!completed.ok) {
        throw new Error("任务运行失败");
      }

      const completedPayload = (await completed.json()) as {
        job?: { output?: Record<string, unknown> };
      };
      const nextSelectedNodeId = getGeneratedNodeSelection(completedPayload.job?.output);
      const completedStatus = getJobCompletionStatus(
        draftJobRequest.type,
        completedPayload.job?.output
      );

      await loadProjectCanvas(nextSelectedNodeId);
      setSaveState("saved");
      setStatusText(completedStatus);
    } catch (error) {
      if (isAbortError(error)) {
        setSaveState("unsaved");
        setStatusText(`${getJobTypeLabel(draftJobRequest.type)} 请求已取消，请重试`);
        return;
      }

      setSaveState("error");
      setStatusText(
        error instanceof Error ? error.message : `${getJobTypeLabel(draftJobRequest.type)} 失败`
      );
    } finally {
      setRunningNodeIds((current) => {
        const next = new Set(current);
        next.delete(node.id);
        return next;
      });
    }
  }

  async function runNodeAction(nodeId: string) {
    const node = canvasRef.current.nodes.find((item) => item.id === nodeId);
    const draftJobRequest = node ? getNodeJobRequest(node) : null;

    if (!node || !draftJobRequest) {
      setStatusText("这个节点还没有可运行任务");
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
            <span>占星视频工作台</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          <Link
            aria-current="page"
            href={`/studio/project-ascendant-intro?projectId=${encodeURIComponent(projectId)}`}
          >
            工作台
          </Link>
          <Link href={`/tldraw?projectId=${encodeURIComponent(projectId)}`}>tldraw</Link>
          <Link href="/projects">项目</Link>
          <Link href="/library">资源库</Link>
          <Link href="/providers">接口</Link>
        </nav>

        <section className="phase-card" aria-label="Current phase">
          <span>{phaseSummary.phase}</span>
          <strong>{phaseSummary.title}</strong>
          <p>{phaseSummary.goal}</p>
        </section>

        <section className="node-palette" aria-label="节点面板">
          <strong>节点面板</strong>
          <div>
            {(Object.keys(nodeKindLabels) as CanvasNodeKind[])
              .filter(
                (kind) => kind !== "preview" && kind !== "export" && kind !== "chart-highlight"
              )
              .map((kind) => (
                <button key={kind} type="button" onClick={() => addNode(kind)}>
                  {nodeKindLabels[kind]}
                </button>
              ))}
          </div>
        </section>

        <section className="job-panel" aria-label="状态">
          <header>
            <strong>画布</strong>
            <span>{saveStateLabels[saveState]}</span>
          </header>
          <p>{statusText}</p>
          <div className="job-panel-actions">
            <button type="button" onClick={saveCanvas}>
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                const anchorNodeId = selectedNodeId ?? canvasRef.current.nodes[0]?.id;

                if (!anchorNodeId) {
                  setStatusText("画布里还没有可用于创建导出的节点");
                  return;
                }

                void runNodeJobRequest(anchorNodeId, getCreateProjectExportJobRequest());
              }}
            >
              创建全片导出
            </button>
            <button type="button" onClick={resetCanvas}>
              重置
            </button>
          </div>
        </section>
      </aside>

      <section className="canvas-region" aria-label="画布区域">
        <header className="topbar">
          <div>
            <span className="eyeline">画布优先流程</span>
            <h1>视频工作台</h1>
          </div>
          <div className="topbar-actions">
            <span className="save-state" data-state={saveState}>
              {saveStateLabels[saveState]}
            </span>
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
                  expandedNodeId,
                  canvasDoc
                );
                const toNode = getDisplayNodeForEdge(
                  canvasDoc.nodes.find((node) => node.id === edge.toNodeId),
                  expandedNodeId,
                  canvasDoc
                );

                if (!fromNode || !toNode) {
                  return null;
                }

                const label = getEdgeLabelPoint(fromNode, toNode);

                return (
                  <g className="edge-link" key={edge.id}>
                    <path
                      className="edge-path"
                      data-relation={edge.relation}
                      d={getEdgePath(fromNode, toNode)}
                    />
                    <text className="edge-label" x={label.x} y={label.y}>
                      {getEdgeRelationLabel(edge.relation)}
                    </text>
                  </g>
                );
              })}
            </svg>
            {canvasDoc.nodes.map((node) => {
              const isExpanded = node.id === expandedNodeId;
              const displaySize = getDisplayNodeSize(node, isExpanded, canvasDoc);

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
                    <pre className="node-content-preview">
                      {compactPreviewText(node.data.scriptText, 180)}
                    </pre>
                  ) : null}
                  {node.kind === "scene" && node.data.narration ? (
                    <pre className="node-content-preview">
                      {compactPreviewText(node.data.narration, 180)}
                    </pre>
                  ) : null}
                  {node.kind === "chapter" && node.data.summary ? (
                    <pre className="node-content-preview">
                      {compactPreviewText(node.data.summary, 150)}
                    </pre>
                  ) : null}
                  {node.kind === "topic" && node.data.topic ? (
                    <p className="node-topic-line">{String(node.data.topic)}</p>
                  ) : null}
                  <NodeCardScenePreview canvas={canvasDoc} node={node} />
                  <NodeCardAssetPreview node={node} />
                  <footer>
                    <small>{nodeKindLabels[node.kind]}</small>
                    <span data-status={node.status}>{getNodeStatusLabel(node.status)}</span>
                  </footer>
                  {isExpanded ? (
                    <InspectorPanel
                      canvas={canvasDoc}
                      node={node}
                      chartHighlightNodes={
                        node.kind === "chart" ? getChartHighlightNodes(canvasDoc, node) : []
                      }
                      chartHighlightSourceNode={
                        node.kind === "chart-highlight"
                          ? getChartHighlightSourceChart(canvasDoc, node)
                          : undefined
                      }
                      previewSpec={previewSpec}
                      running={runningNodeIds.has(node.id)}
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
                      onDataPatch={(value) => {
                        updateNode(node.id, (currentNode) => ({
                          ...currentNode,
                          data: { ...currentNode.data, ...value }
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
                      onDeleteNode={deleteNode}
                      onChartHighlightAdd={addChartHighlightNode}
                      onChartHighlightChange={updateChartHighlightNode}
                      onChartHighlightDelete={deleteChartHighlightNode}
                      onChartHighlightSelect={(nodeId) => {
                        setSelectedNodeId(nodeId);
                        setExpandedNodeId(nodeId);
                      }}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <InspectorPanel
        canvas={canvasDoc}
        node={selectedNode}
        chartHighlightNodes={selectedChartHighlightNodes}
        chartHighlightSourceNode={selectedChartHighlightSourceNode}
        previewSpec={previewSpec}
        running={selectedNode ? runningNodeIds.has(selectedNode.id) : false}
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
        onDataPatch={(value) => {
          if (!selectedNode) return;
          updateNode(selectedNode.id, (node) => ({
            ...node,
            data: { ...node.data, ...value }
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
        onDeleteNode={deleteNode}
        onChartHighlightAdd={addChartHighlightNode}
        onChartHighlightChange={updateChartHighlightNode}
        onChartHighlightDelete={deleteChartHighlightNode}
        onChartHighlightSelect={(nodeId) => {
          setSelectedNodeId(nodeId);
          setExpandedNodeId(nodeId);
        }}
      />
    </main>
  );
}

function InspectorPanel({
  canvas,
  node,
  chartHighlightNodes,
  chartHighlightSourceNode,
  previewSpec,
  running,
  statusText,
  onNodeChange,
  onDataChange,
  onDataPatch,
  onDataReplace,
  onRunNode,
  onRunNodeJob,
  onDeleteNode,
  onChartHighlightAdd,
  onChartHighlightChange,
  onChartHighlightDelete,
  onChartHighlightSelect,
  variant = "side"
}: {
  canvas: CanvasDocument;
  node: CanvasNode | null;
  chartHighlightNodes: CanvasNode[];
  chartHighlightSourceNode?: CanvasNode;
  previewSpec: AstroVideoSpec;
  running: boolean;
  statusText: string;
  variant?: "side" | "inline";
  onNodeChange: <TKey extends keyof CanvasNode>(key: TKey, value: CanvasNode[TKey]) => void;
  onDataChange: (key: string, value: unknown) => void;
  onDataPatch: (value: VisualPresetPatch) => void;
  onDataReplace: (value: CanvasNode["data"]) => void;
  onRunNode: (nodeId: string) => void;
  onRunNodeJob: (nodeId: string, request: NodeJobRequest) => void;
  onDeleteNode: (nodeId: string) => void;
  onChartHighlightAdd: (chartNode: CanvasNode) => void;
  onChartHighlightChange: (nodeId: string, patch: ChartHighlightDataPatch) => void;
  onChartHighlightDelete: (nodeId: string) => void;
  onChartHighlightSelect: (nodeId: string) => void;
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
      <aside className="inspector" aria-label="检查器">
        <header>
          <span>检查器</span>
          <strong>未选择节点</strong>
        </header>
        <VideoPreviewPanel previewSpec={previewSpec} />
      </aside>
    );
  }

  const nodeJobRequest = getNodeJobRequest(node);
  const assetUrl = getNodeAssetUrl(node);
  const visualRenderMode = getString(node.data.renderMode, assetUrl ? "asset" : "contract");
  const aiModelTarget = getAiModelTarget(node.kind);
  const aiPromptDataKey = getAiPromptDataKey(node.kind);
  const d3Diagram = getString(node.data.diagram, "timeline");
  const d3Preset = getD3VisualPreset(getString(node.data.visualPreset, d3Diagram));
  const d3JsonStatus = d3DataJsonStatus(d3Diagram, getString(node.data.dataJson, ""));
  const chartPipeline = node.kind === "chart" ? getChartPipelineSummary(node) : null;
  const content = (
    <>
      <header>
        <span>{isInline ? "卡片编辑" : "检查器"}</span>
        <strong>{nodeKindLabels[node.kind]}</strong>
        <p>{isInline ? "正在编辑这张卡片" : node.id}</p>
      </header>

      <section className="node-danger-actions">
        <button disabled={running} type="button" onClick={() => onDeleteNode(node.id)}>
          删除节点
        </button>
      </section>

      {nodeJobRequest ? (
        <section className="job-actions">
          <button
            data-risk="local-or-mock"
            disabled={running}
            type="button"
            onClick={() => onRunNode(node.id)}
          >
            {running ? "运行中..." : getNodeRunLabel(node)}
          </button>
          {node.kind === "topic" ? (
            <button
              data-risk="local-or-mock"
              disabled={running}
              type="button"
              onClick={() => onRunNodeJob(node.id, getCreateManualScriptJobRequest(node))}
            >
              {running ? "运行中..." : "手写文案"}
            </button>
          ) : null}
          {node.kind === "d3" ? (
            <button
              data-risk="local-or-mock"
              disabled={running}
              type="button"
              onClick={() => onRunNodeJob(node.id, { type: "export-visual-asset", input: {} })}
            >
              {running ? "运行中..." : "导出视觉素材"}
            </button>
          ) : null}
          <div className="job-provider-notice" data-risk="local-or-mock">
            {statusText}
          </div>
        </section>
      ) : null}

      {node.kind === "scene" ? (
        <section className="job-actions">
          <strong>生成资源</strong>
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
                  {running ? "运行中..." : sceneResourceLabels[resourceId]}
                </button>
              );
            })}
          </div>
          <button
            data-risk="local-or-mock"
            disabled={running}
            type="button"
            onClick={() => onRunNodeJob(node.id, getCreatePreviewFlowJobRequest(node))}
          >
            {running ? "运行中..." : "创建当前分镜预览"}
          </button>
        </section>
      ) : null}

      {node.kind === "preview" ? (
        <section className="job-actions">
          <strong>下一步</strong>
          <button
            disabled={running}
            type="button"
            onClick={() => onRunNodeJob(node.id, getCreateExportJobRequest(node))}
          >
            {running ? "运行中..." : "创建导出"}
          </button>
        </section>
      ) : null}

      {!aiPromptDataKey ? (
        <>
          <label>
            标题
            <input
              value={getNodeTitle(node)}
              onChange={(event) => onDataChange("title", event.currentTarget.value)}
            />
          </label>

          <label>
            描述
            <textarea
              rows={3}
              value={getNodeDescription(node)}
              onChange={(event) => onDataChange("description", event.currentTarget.value)}
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
            onChange={(event) => onDataChange(aiPromptDataKey, event.currentTarget.value)}
          />
        </label>
      ) : null}

      {aiModelTarget ? (
        <label>
          AI 模型
          <select
            value={getNodeAiModel(node)}
            onChange={(event) => onDataChange("aiModel", event.currentTarget.value)}
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
              value={getNodeImageStyle(node)}
              onChange={(event) => onDataChange("imageStyle", event.currentTarget.value)}
            >
              {imageStyleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {node.kind === "topic" ? (
        <label>
          文案风格
          <select
            name="scriptProfileId"
            value={getString(node.data.scriptProfileId, defaultScriptPromptProfileId)}
            onChange={(event) => onDataChange("scriptProfileId", event.currentTarget.value)}
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
              onDataChange("targetDurationSec", Number(event.currentTarget.value))
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
            type="number"
            value={getNumber(
              node.data.chapterCount,
              getDefaultChapterCount(getTargetDurationSec(node.data.targetDurationSec))
            )}
            onChange={(event) =>
              onDataChange("chapterCount", clampNumber(Number(event.currentTarget.value), 1, 24))
            }
          />
        </label>
      ) : null}

      {node.kind === "script" || node.kind === "storyboard" ? (
        <label>
          分镜数量
          <input
            max={60}
            min={1}
            type="number"
            value={getNumber(
              node.data.sceneCount,
              getDefaultSceneCount(getTargetDurationSec(node.data.targetDurationSec))
            )}
            onChange={(event) =>
              onDataChange("sceneCount", clampNumber(Number(event.currentTarget.value), 1, 60))
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
            type="number"
            value={getNumber(
              node.data.sceneCount,
              getDefaultChapterSceneCount(getTargetDurationSec(node.data.targetDurationSec))
            )}
            onChange={(event) =>
              onDataChange("sceneCount", clampNumber(Number(event.currentTarget.value), 1, 24))
            }
          />
        </label>
      ) : null}

      {node.kind === "scene" ? (
        <>
          <label>
            时长
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
            旁白
            <textarea
              rows={4}
              value={getString(node.data.narration, "")}
              onChange={(event) => onDataChange("narration", event.currentTarget.value)}
            />
          </label>
          <label>
            画面提示词
            <textarea
              rows={4}
              value={getString(node.data.visualPrompt, "")}
              onChange={(event) => onDataChange("visualPrompt", event.currentTarget.value)}
            />
          </label>
          <label>
            AI 模型
            <select
              value={getSceneImageModel(node)}
              onChange={(event) => onDataChange("imageModel", event.currentTarget.value)}
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
              value={getSceneImageStyle(node)}
              onChange={(event) => onDataChange("imageStyle", event.currentTarget.value)}
            >
              {imageStyleOptions.map((option) => (
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
          <div className="inspector-grid">
            <label>
              主视觉
              <select
                value={getString(node.data.primaryVisualKind, "auto")}
                onChange={(event) => onDataChange("primaryVisualKind", event.currentTarget.value)}
              >
                <option value="auto">自动</option>
                <option value="text">文字</option>
                <option value="chart">星盘</option>
                <option value="image">图像</option>
                <option value="d3">D3 图表</option>
                <option value="three">三维场景</option>
              </select>
            </label>
            <label>
              附加视觉
              <select
                value={getString(node.data.secondaryVisualKind, "none")}
                onChange={(event) =>
                  onDataChange("secondaryVisualKind", event.currentTarget.value)
                }
              >
                <option value="none">无</option>
                <option value="chart">星盘</option>
                <option value="image">图像</option>
              </select>
            </label>
            <label>
              布局
              <select
                value={getString(node.data.layoutPreset, "single")}
                onChange={(event) => onDataChange("layoutPreset", event.currentTarget.value)}
              >
                <option value="single">单画面</option>
                <option value="split">左右分屏</option>
                <option value="overlay">叠加层</option>
              </select>
            </label>
            <label>
              转场
              <select
                value={getString(node.data.transition, "fade")}
                onChange={(event) => onDataChange("transition", event.currentTarget.value)}
              >
                <option value="cut">直接切</option>
                <option value="fade">淡入淡出</option>
                <option value="wipe">擦除</option>
                <option value="zoom">缩放</option>
              </select>
            </label>
            <label>
              时长
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
              字幕
            </label>
            <label className="inspector-checkbox-row">
              <input
                checked={getBoolean(node.data.includeVoice, true)}
                type="checkbox"
                onChange={(event) => onDataChange("includeVoice", event.currentTarget.checked)}
              />
              配音
            </label>
          </div>
        </>
      ) : null}

      {node.kind === "caption" ? (
        <>
          <label>
            字幕高度
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
              字号
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
              颜色
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
            语速
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
            音量
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
            音色
            <input
              value={getString(node.data.voiceProfile, getString(node.data.referenceAudioName, ""))}
              onChange={(event) => onDataChange("voiceProfile", event.currentTarget.value)}
            />
          </label>
        </>
      ) : null}

      {node.kind === "chart" ? (
        <>
          <section className="chart-result">
            <strong>生成线路</strong>
            <span>展示：{chartPipeline?.renderer ?? "AstroChart SVG"}</span>
            <span>计算：{chartPipeline?.calculator ?? "Swiss Ephemeris"}</span>
            {chartPipeline?.ephemeris ? <span>星历：{chartPipeline.ephemeris}</span> : null}
            {chartPipeline?.zodiac ? <span>黄道：{chartPipeline.zodiac}</span> : null}
            {chartPipeline?.houses ? <span>宫制：{chartPipeline.houses}</span> : null}
            {chartPipeline?.timezone ? <span>时区：{chartPipeline.timezone}</span> : null}
            {chartPipeline?.source ? <span>数据：{chartPipeline.source}</span> : null}
          </section>
          <ChartHighlightChildrenEditor
            chartNode={node}
            highlights={chartHighlightNodes}
            onAdd={onChartHighlightAdd}
            onDelete={onChartHighlightDelete}
            onSelect={onChartHighlightSelect}
          />
          <div className="inspector-grid">
            <label>
              出生日期
              <input
                type="date"
                value={getString(node.data.birthDate, defaultChartBirthData.birthDate)}
                onChange={(event) => onDataChange("birthDate", event.currentTarget.value)}
              />
            </label>
            <label>
              出生时间
              <input
                type="time"
                value={getString(node.data.birthTime, defaultChartBirthData.birthTime)}
                onChange={(event) => onDataChange("birthTime", event.currentTarget.value)}
              />
            </label>
            <label>
              IANA 时区
              <input
                value={getString(node.data.timezone, defaultChartBirthData.timezone)}
                onChange={(event) => onDataChange("timezone", event.currentTarget.value)}
              />
            </label>
            <label>
              UTC 偏移分钟
              <input
                type="number"
                value={getNumber(
                  node.data.timezoneOffsetMinutes,
                  defaultChartBirthData.timezoneOffsetMinutes
                )}
                onChange={(event) =>
                  onDataChange("timezoneOffsetMinutes", Number(event.currentTarget.value))
                }
              />
            </label>
            <label>
              地点
              <input
                value={getString(node.data.placeName, defaultChartBirthData.placeName)}
                onChange={(event) => onDataChange("placeName", event.currentTarget.value)}
              />
            </label>
            <label>
              纬度
              <input
                max={89.999}
                min={-89.999}
                step={0.0001}
                type="number"
                value={getNumber(node.data.latitude, defaultChartBirthData.latitude)}
                onChange={(event) => onDataChange("latitude", Number(event.currentTarget.value))}
              />
            </label>
            <label>
              经度
              <input
                max={180}
                min={-180}
                step={0.0001}
                type="number"
                value={getNumber(node.data.longitude, defaultChartBirthData.longitude)}
                onChange={(event) => onDataChange("longitude", Number(event.currentTarget.value))}
              />
            </label>
            <label>
              宫位系统
              <select
                value={getString(node.data.houseSystem, defaultChartBirthData.houseSystem)}
                onChange={(event) => onDataChange("houseSystem", event.currentTarget.value)}
              >
                {chartHouseSystemOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              黄道系统
              <select
                value={getString(node.data.zodiacMode, defaultChartBirthData.zodiacMode)}
                onChange={(event) => onDataChange("zodiacMode", event.currentTarget.value)}
              >
                <option value="tropical">Tropical</option>
                <option value="sidereal">Sidereal</option>
              </select>
            </label>
            <label>
              Ayanamsa
              <select
                value={getString(node.data.siderealAyanamsa, defaultChartBirthData.siderealAyanamsa)}
                onChange={(event) => onDataChange("siderealAyanamsa", event.currentTarget.value)}
              >
                {chartAyanamsaOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              行星集
              <select
                value={getString(node.data.planetSet, defaultChartBirthData.planetSet)}
                onChange={(event) => onDataChange("planetSet", event.currentTarget.value)}
              >
                <option value="classical">Classical</option>
                <option value="modern">Modern</option>
                <option value="extended">Extended</option>
              </select>
            </label>
            <label>
              月交点
              <select
                value={getString(node.data.nodeType, defaultChartBirthData.nodeType)}
                onChange={(event) => onDataChange("nodeType", event.currentTarget.value)}
              >
                <option value="mean">Mean Node</option>
                <option value="true">True Node</option>
                <option value="both">Both</option>
              </select>
            </label>
            <label>
              高亮目标
              <input
                value={getString(node.data.highlight, defaultChartBirthData.highlight)}
                onChange={(event) => onDataChange("highlight", event.currentTarget.value)}
              />
            </label>
          </div>
        </>
      ) : null}

      {node.kind === "chart-highlight" ? (
        <ChartHighlightNodeEditor
          chartNode={chartHighlightSourceNode ?? node}
          highlight={node}
          onChange={onChartHighlightChange}
        />
      ) : null}

      {node.kind === "d3" ? (
        <>
          <label>
            预设
            <select
              value={d3Preset.id}
              onChange={(event) => onDataPatch(d3VisualPresetPatch(event.currentTarget.value))}
            >
              {d3VisualPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <div className="inspector-grid">
            <label>
              图表类型
              <select
                value={d3Diagram}
                onChange={(event) => onDataChange("diagram", event.currentTarget.value)}
              >
                <option value="timeline">时间线</option>
                <option value="relationship">关系图</option>
                <option value="tree">树状图</option>
                <option value="distribution">分布条形图</option>
              </select>
            </label>
            <label>
              渲染模式
              <select
                value={visualRenderMode}
                onChange={(event) => onDataChange("renderMode", event.currentTarget.value)}
              >
                <option value="contract">动态合约</option>
                <option value="asset">导出素材</option>
              </select>
            </label>
            <label>
              时长
              <input
                max={30}
                min={1}
                type="number"
                value={getNumber(node.data.durationSec, d3Preset.durationSec)}
                onChange={(event) =>
                  onDataChange(
                    "durationSec",
                    clampNumber(Number(event.currentTarget.value), 1, 30)
                  )
                }
              />
            </label>
          </div>
          <label>
            旁白
            <textarea
              rows={3}
              value={getString(node.data.narration, "")}
              onChange={(event) => onDataChange("narration", event.currentTarget.value)}
            />
          </label>
          <label>
            数据 JSON
            <textarea
              rows={6}
              value={getString(node.data.dataJson, "")}
              onChange={(event) => onDataChange("dataJson", event.currentTarget.value)}
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
                  onDataChange("dataJson", formatted.value);
                }
              }}
            >
              格式化
            </button>
          </div>
          <D3VisualPreview
            dataJson={getString(node.data.dataJson, "")}
            diagram={d3Diagram}
            title={getString(node.data.title, d3Preset.title)}
          />
        </>
      ) : null}

      {node.kind === "preview" ? (
        <label>
          预览帧
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
            导出范围
            <select
              value={getExportScope(node)}
              onChange={(event) => onDataChange("exportScope", event.currentTarget.value)}
            >
              <option value="clip">片段</option>
              <option value="full">整条视频</option>
            </select>
          </label>
          <label>
            帧范围
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
            横向位置
            <input
              type="number"
              value={node.position.x}
              onChange={(event) =>
                onNodeChange("position", { ...node.position, x: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            纵向位置
            <input
              type="number"
              value={node.position.y}
              onChange={(event) =>
                onNodeChange("position", { ...node.position, y: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            宽度
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
            高度
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
          <strong>素材</strong>
          <span>{assetUrl}</span>
        </section>
      ) : null}

      {!isInline ? (
        <>
          {!aiPromptDataKey ? (
            <>
              <label>
                原始数据
                <textarea
                  rows={10}
                  value={rawData}
                  onChange={(event) => setRawData(event.target.value)}
                />
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
                应用 JSON
              </button>
            </>
          ) : null}

          <NodePreviewPanel canvas={canvas} node={node} previewSpec={previewSpec} />
        </>
      ) : null}
    </>
  );

  if (isInline) {
    return (
      <section
        className="inspector node-inline-editor"
        aria-label="卡片内编辑器"
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {content}
      </section>
    );
  }

  return (
    <aside className="inspector" aria-label="检查器">
      {content}
    </aside>
  );
}

function NodeCardAssetPreview({ node }: { node: CanvasNode }) {
  if (!isSingleAssetPreviewNode(node)) {
    return null;
  }

  const assetUrl = getNodeAssetUrl(node);
  const previewText = getAssetPreviewText(node);
  const isAudio = node.kind === "voice" || node.kind === "music";
  const isVisual =
    node.kind === "chart" || node.kind === "image" || node.kind === "d3" || node.kind === "three";

  if (node.kind === "caption") {
    return (
      <div className="node-card-asset-preview node-card-caption-preview" aria-label="字幕预览">
        <span
          style={{
            color: getString(node.data.color, "#ffffff")
          }}
        >
          {previewText || "字幕文本"}
        </span>
      </div>
    );
  }

  if (isVisual) {
    return (
      <div className="node-card-asset-preview node-card-visual-preview" aria-label="素材预览">
        {assetUrl ? (
          <img alt={getNodeTitle(node)} draggable={false} src={assetUrl} />
        ) : (
          <span>{previewText || "等待生成素材"}</span>
        )}
      </div>
    );
  }

  if (isAudio) {
    return <NodeCardAudioPreview assetUrl={assetUrl} previewText={previewText} />;
  }

  return null;
}

function NodeCardAudioPreview({
  assetUrl,
  previewText
}: {
  assetUrl: string;
  previewText: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState(assetUrl ? "准备播放" : previewText || "等待生成音频");

  useEffect(() => {
    setPlaying(false);
    setStatus(assetUrl ? "准备播放" : previewText || "等待生成音频");
  }, [assetUrl, previewText]);

  const updateStatusFromAudio = () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const current = formatDurationSec(audio.currentTime);
    const duration = Number.isFinite(audio.duration) && audio.duration > 0
      ? formatDurationSec(audio.duration)
      : "";

    setStatus(duration ? `${current} / ${duration}` : current);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio || !assetUrl) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
        updateStatusFromAudio();
      } catch {
        setPlaying(false);
        setStatus("浏览器阻止播放，请再点一次");
      }
      return;
    }

    audio.pause();
    setPlaying(false);
    updateStatusFromAudio();
  };

  return (
    <div
      className="node-card-asset-preview node-card-audio-preview"
      aria-label="音频预览"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="node-card-audio-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="node-card-audio-content">
        <strong>{assetUrl ? "音频已生成" : previewText || "等待生成音频"}</strong>
        {assetUrl ? (
          <div className="node-card-audio-controls">
            <button
              aria-label={playing ? "暂停音频" : "播放音频"}
              className="node-card-audio-play"
              type="button"
              onClick={() => void togglePlayback()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {playing ? "暂停" : "播放"}
            </button>
            <span className="node-card-audio-status">{status}</span>
            <audio
              ref={audioRef}
              preload="metadata"
              src={assetUrl}
              onEnded={() => {
                setPlaying(false);
                updateStatusFromAudio();
              }}
              onError={() => {
                setPlaying(false);
                setStatus("音频加载失败");
              }}
              onLoadedMetadata={updateStatusFromAudio}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onTimeUpdate={updateStatusFromAudio}
            />
          </div>
        ) : (
          <span className="node-card-audio-status">{previewText || "暂无音频文件"}</span>
        )}
      </div>
    </div>
  );
}

function NodeCardScenePreview({ canvas, node }: { canvas: CanvasDocument; node: CanvasNode }) {
  const preview = getSceneCardPreview(canvas, node);

  if (!preview) {
    return null;
  }

  return (
    <div className="node-card-scene-preview" aria-label="分镜预览">
      {preview.assetUrl ? (
        <img alt={getNodeTitle(node)} draggable={false} src={preview.assetUrl} />
      ) : (
        <span className="node-card-scene-preview-empty" />
      )}
      {preview.caption ? (
        <span
          className="node-card-scene-caption"
          style={{
            color: preview.captionColor
          }}
        >
          {preview.caption}
        </span>
      ) : null}
    </div>
  );
}

function NodePreviewPanel({
  canvas,
  node,
  previewSpec
}: {
  canvas: CanvasDocument;
  node: CanvasNode;
  previewSpec: AstroVideoSpec;
}) {
  const assetUrl = getNodeAssetUrl(node);

  if (node.kind === "export" && assetUrl) {
    return <ExportAssetPreviewPanel assetUrl={assetUrl} node={node} />;
  }

  if (isSingleAssetPreviewNode(node)) {
    return <AssetPreviewPanel assetUrl={assetUrl} node={node} />;
  }

  const scopedSpec = getScopedVideoPreviewSpec(canvas, node, previewSpec);

  if (scopedSpec) {
    return <VideoPreviewPanel label={getVideoPreviewLabel(node)} previewSpec={scopedSpec} />;
  }

  return (
    <section className="asset-preview-panel">
      <header>
        <strong>预览</strong>
        <span>当前节点没有画面预览</span>
      </header>
      <div className="asset-preview-empty">
        <strong>{nodeKindLabels[node.kind]}</strong>
        <span>选择分镜、画面合成、预览或导出节点查看视频预览。</span>
      </div>
    </section>
  );
}

function ExportAssetPreviewPanel({ assetUrl, node }: { assetUrl: string; node: CanvasNode }) {
  const assetPath = getString(node.data.assetPath, "");
  const renderedAt = getString(node.data.renderedAt, "");

  return (
    <section className="asset-preview-panel">
      <header>
        <strong>导出视频</strong>
        <span>{renderedAt ? `已渲染 · ${new Date(renderedAt).toLocaleString("zh-CN")}` : "MP4 成片"}</span>
      </header>
      <div className="export-video-preview">
        <video controls src={assetUrl} />
      </div>
      <div className="export-asset-actions">
        <a href={assetUrl} download>
          下载视频
        </a>
        <a href={assetUrl} target="_blank" rel="noreferrer">
          新窗口打开
        </a>
      </div>
      {assetPath ? (
        <div className="export-asset-path">
          <strong>本地位置</strong>
          <code>{assetPath}</code>
        </div>
      ) : null}
    </section>
  );
}

function AssetPreviewPanel({ assetUrl, node }: { assetUrl: string; node: CanvasNode }) {
  const previewText = getAssetPreviewText(node);
  const isAudio = node.kind === "voice" || node.kind === "music";
  const isVisual =
    node.kind === "chart" || node.kind === "image" || node.kind === "d3" || node.kind === "three";

  return (
    <section className="asset-preview-panel">
      <header>
        <strong>{nodeKindLabels[node.kind]}预览</strong>
        <span>单个素材</span>
      </header>

      {node.kind === "caption" ? (
        <div className="caption-asset-preview">
          <div
            className="caption-asset-preview-text"
            style={{
              bottom: `${100 - clampNumber(getNumber(node.data.yPercent, 78), 0, 100)}%`,
              color: getString(node.data.color, "#ffffff"),
              fontSize: `${Math.round(clampNumber(getNumber(node.data.fontSize, 48), 20, 96) * 0.42)}px`
            }}
          >
            {previewText || "字幕文本"}
          </div>
        </div>
      ) : null}

      {isAudio ? (
        <div className="audio-asset-preview">
          {assetUrl ? (
            <audio controls src={assetUrl} />
          ) : (
            <span>暂无音频文件，仅显示配音配置。</span>
          )}
        </div>
      ) : null}

      {isVisual ? (
        <div className="visual-asset-preview">
          {assetUrl ? (
            <img alt={getNodeTitle(node)} draggable={false} src={assetUrl} />
          ) : (
            <span>素材尚未生成。生成后这里会直接显示图片或视觉文件。</span>
          )}
        </div>
      ) : null}

      <p>{previewText}</p>
    </section>
  );
}

function VideoPreviewPanel({
  label = "视频预览",
  previewSpec
}: {
  label?: string;
  previewSpec: AstroVideoSpec;
}) {
  const size = getCompositionSize(previewSpec.format);
  const durationInFrames = getSpecDurationFrames(previewSpec);
  const durationSec = previewSpec.fps > 0 ? durationInFrames / previewSpec.fps : 0;

  return (
    <section className="video-preview-panel">
      <header>
        <strong>{label}</strong>
        <span>
          {previewSpec.title}
          {durationSec > 0 ? ` · ${formatDurationSec(durationSec)}` : ""}
        </span>
      </header>
      <div
        className="video-preview-frame"
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
      >
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
          <div className="preview-loading">暂无可预览分镜</div>
        )}
      </div>
    </section>
  );
}

function isSingleAssetPreviewNode(node: CanvasNode) {
  return ["caption", "voice", "music", "chart", "image", "d3", "three"].includes(node.kind);
}

function getScopedVideoPreviewSpec(
  canvas: CanvasDocument,
  node: CanvasNode,
  previewSpec: AstroVideoSpec
): AstroVideoSpec | null {
  if (node.kind === "storyboard") {
    return previewSpec;
  }

  if (node.kind === "export" && getString(node.data.exportScope, "") === "full") {
    return previewSpec;
  }

  const sceneId = getScopedPreviewSceneId(canvas, node);

  if (!sceneId) {
    return null;
  }

  const scene = previewSpec.scenes.find((item) => item.id === sceneId);

  if (!scene) {
    return null;
  }

  return {
    ...previewSpec,
    title: scene.title,
    scenes: [scene],
    audio: {
      tracks: getScopedAudioTracksForScene(previewSpec, sceneId)
    }
  };
}

function getScopedPreviewSceneId(canvas: CanvasDocument, node: CanvasNode): string | undefined {
  if (node.kind === "scene") {
    return node.refId ?? node.id;
  }

  if (node.kind === "composition") {
    return getSceneIdForComposition(canvas, node);
  }

  if (node.kind === "preview") {
    const compositionNode = findCanvasNodeById(
      canvas,
      getString(node.data.sourceCompositionNodeId, "")
    );

    return (
      getString(node.data.sceneId, "") ||
      getString(node.data.sourceSceneRefId, "") ||
      getSceneIdForComposition(canvas, compositionNode)
    );
  }

  if (node.kind === "export") {
    const previewNode = findCanvasNodeById(canvas, getString(node.data.sourcePreviewNodeId, ""));
    return previewNode ? getScopedPreviewSceneId(canvas, previewNode) : undefined;
  }

  return undefined;
}

function getSceneIdForComposition(
  canvas: CanvasDocument,
  node: CanvasNode | undefined
): string | undefined {
  if (!node) {
    return undefined;
  }

  const directSceneId = getString(node.data.sceneId, getString(node.data.sourceSceneRefId, ""));

  if (directSceneId) {
    return directSceneId;
  }

  const sceneNode = findCanvasNodeById(canvas, getString(node.data.sourceSceneNodeId, ""));
  return sceneNode?.kind === "scene" ? (sceneNode.refId ?? sceneNode.id) : undefined;
}

function findCanvasNodeById(canvas: CanvasDocument, nodeId: string) {
  return nodeId ? canvas.nodes.find((item) => item.id === nodeId) : undefined;
}

function getScopedAudioTracksForScene(previewSpec: AstroVideoSpec, sceneId: string) {
  let cursor = 0;
  let sceneStartSec: number | undefined;
  const scene = previewSpec.scenes.find((item) => {
    const matched = item.id === sceneId;

    if (matched) {
      sceneStartSec = cursor;
    }

    cursor += item.durationSec;
    return matched;
  });

  if (!scene || sceneStartSec === undefined) {
    return [];
  }

  const startSec = sceneStartSec;
  const sceneEndSec = startSec + scene.durationSec;

  return (previewSpec.audio?.tracks ?? [])
    .filter((track) => {
      const trackStartSec = track.startSec ?? 0;
      const trackEndSec = trackStartSec + (track.durationSec ?? scene.durationSec);

      return trackEndSec > startSec && trackStartSec < sceneEndSec;
    })
    .map((track) => {
      const trackStartSec = track.startSec ?? 0;
      const trackEndSec = trackStartSec + (track.durationSec ?? scene.durationSec);
      const overlapStartSec = Math.max(startSec, trackStartSec);
      const overlapEndSec = Math.min(sceneEndSec, trackEndSec);
      const scopedStartSec = Math.max(0, trackStartSec - startSec);
      const durationSec = Math.max(0.1, overlapEndSec - overlapStartSec);
      const trimBeforeSec = Math.max(0, startSec - trackStartSec);

      return {
        ...track,
        startSec: scopedStartSec,
        durationSec,
        trimBeforeSec
      };
    });
}

function getVideoPreviewLabel(node: CanvasNode) {
  if (node.kind === "scene") {
    return "分镜预览";
  }

  if (node.kind === "composition") {
    return "画面合成预览";
  }

  if (node.kind === "preview") {
    return "当前分镜预览";
  }

  if (node.kind === "export" && getString(node.data.exportScope, "") !== "full") {
    return "当前分镜导出预览";
  }

  return "整片预览";
}

function getAssetPreviewText(node: CanvasNode) {
  const caption = recordData(node.data.caption);
  const cues = Array.isArray(node.data.cues)
    ? node.data.cues
    : Array.isArray(caption?.cues)
      ? caption.cues
      : [];
  const firstCue = cues.find((cue) => recordData(cue));
  const cueText = firstCue ? getString(recordData(firstCue)?.text, "") : "";

  return (
    cueText ||
    getString(node.data.description, "") ||
    getString(caption?.text, "") ||
    getString(node.data.prompt, "") ||
    getString(node.data.visualPrompt, "") ||
    getString(node.data.dataJson, "") ||
    getString(node.data.assetUrl, "")
  );
}

function formatDurationSec(value: number) {
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  if (minutes <= 0) {
    return `${seconds}秒`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function resolveInitialCanvasNodeId(nodes: CanvasNode[], nodeId?: string) {
  if (nodeId && nodes.some((node) => node.id === nodeId)) {
    return nodeId;
  }

  return nodes[0]?.id;
}

function getDisplayNodeSize(
  node: CanvasNode,
  expanded: boolean,
  canvas?: CanvasDocument
): CanvasNode["size"] {
  const hasVisualAsset =
    Boolean(getNodeAssetUrl(node)) &&
    (node.kind === "chart" || node.kind === "image" || node.kind === "d3" || node.kind === "three");
  const hasScenePreview = Boolean(canvas && getSceneCardPreview(canvas, node));
  const previewSize = {
    width: hasScenePreview || hasVisualAsset ? Math.max(node.size.width, 420) : node.size.width,
    height: hasScenePreview
      ? Math.max(node.size.height, 380)
      : hasVisualAsset
        ? Math.max(node.size.height, 390)
        : node.size.height
  };

  if (!expanded) {
    return previewSize;
  }

  return {
    width: Math.max(previewSize.width, 420),
    height: Math.max(previewSize.height, 560)
  };
}

function getDisplayNodeForEdge(
  node: CanvasNode | undefined,
  expandedNodeId: string | undefined,
  canvas?: CanvasDocument
) {
  if (!node) {
    return null;
  }

  return {
    ...node,
    size: getDisplayNodeSize(node, node.id === expandedNodeId, canvas)
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
  return translateLegacyNodeTitle(getString(node.data.title, nodeKindLabels[node.kind]));
}

function getNodeDescription(node: CanvasNode) {
  if ((node.kind === "topic" || node.kind === "image") && getAiPromptValue(node)) {
    return translateLegacyNodeDescription(
      getAiPromptValue(node) || getString(node.data.description, nodeKindDescriptions[node.kind])
    );
  }

  return translateLegacyNodeDescription(
    getString(node.data.description, nodeKindDescriptions[node.kind])
  );
}

function compactPreviewText(value: unknown, limit: number) {
  const text = String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(0, limit - 1))}...`;
}

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
    return {
      type: "generate-d3",
      input: {
        prompt: getAiPromptValue(node) || getNodeDescription(node),
        title: getNodeTitle(node),
        description: getNodeDescription(node),
        narration: getString(node.data.narration, getNodeDescription(node)),
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
    "provided-data": "外部星盘数据",
    "calculated-birth": "出生资料计算",
    sample: "示例数据"
  };

  return labels[source] ?? source;
}

function getNodeRunLabel(node: CanvasNode) {
  switch (node.kind) {
    case "topic":
      return "生成文案";
    case "script":
      return getTargetDurationSec(node.data.targetDurationSec) > 60 ? "生成结构" : "生成分镜";
    case "structure":
      return "生成章节";
    case "chapter":
      return "展开本章分镜";
    case "storyboard":
      return "生成分镜";
    case "caption":
      return "对齐字幕";
    case "voice":
      return "生成配音";
    case "chart":
      return "生成星盘";
    case "image":
      return "生成图像";
    case "d3":
      return "生成 D3 图表";
    case "three":
      return "导出视觉素材";
    case "composition":
      return "创建预览";
    case "preview":
      return "渲染静帧";
    case "export":
      return getExportScope(node) === "full" ? "渲染整条视频" : "渲染片段";
    default:
      return "运行任务";
  }
}

function getJobTypeLabel(jobType: string) {
  const labels: Record<string, string> = {
    "generate-script": "生成文案",
    "create-manual-script": "创建手写文案",
    "create-structure-node": "创建结构",
    "generate-chapters": "生成章节",
    "expand-chapter-scenes": "展开章节分镜",
    "generate-storyboard": "生成分镜",
    "generate-image": "生成图像",
    "generate-d3": "生成 D3 图表",
    "generate-tts": "生成配音",
    "generate-chart": "生成星盘",
    "export-visual-asset": "导出视觉素材",
    "align-captions": "对齐字幕",
    "render-preview": "渲染预览",
    "render-video": "渲染视频",
    "create-preview-flow": "创建当前分镜预览",
    "create-preview-node": "创建预览",
    "create-export-node": "创建导出",
    "create-project-export-node": "创建全片导出"
  };

  return labels[jobType] ?? jobType;
}

function getNodeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    idle: "待处理",
    ready: "就绪",
    running: "运行中",
    failed: "失败"
  };

  return labels[status] ?? status;
}

function getEdgeRelationLabel(relation: string) {
  const labels: Record<string, string> = {
    produces: "生成",
    uses: "使用",
    renders: "渲染"
  };

  return labels[relation] ?? relation;
}

function translateLegacyNodeTitle(title: string) {
  const labels: Record<string, string> = {
    Topic: "主题",
    Script: "文案",
    Structure: "结构",
    Storyboard: "分镜计划",
    Chapter: "章节",
    Scene: "分镜",
    Opening: "开场问题",
    Caption: "字幕",
    Voice: "配音",
    Chart: "星盘",
    Image: "图像",
    "D3 Diagram": "D3 图表",
    "Three Scene": "三维场景",
    "Three 场景": "三维场景",
    Music: "音乐",
    Composition: "画面合成",
    Preview: "预览",
    Export: "导出"
  };

  return labels[title] ?? title;
}

function translateLegacyNodeDescription(description: string) {
  const labels: Record<string, string> = {
    "45-second intro for ascendant sign basics": "用 45 秒给占星小白解释上升星座",
    "Choose the topic for the video": "选择这条视频要讲的占星主题",
    "Generate and edit narration and beats": "生成并编辑口播文案和节奏",
    "Generate and refine narration and beats": "生成并优化口播文案和节奏",
    "Long-form chapter structure": "长视频章节结构",
    "Split the script into editable scenes": "把文案拆成可编辑的分镜",
    "A chapter in the long-form video": "长视频中的一个章节",
    "Break the script into editable visual beats": "把文案拆成可编辑的视觉段落",
    "A single visual scene": "单个视频画面",
    "Caption timing and styling": "字幕时间轴和样式",
    "Voice settings": "配音参数",
    "Warm teaching voice": "温和的教学配音",
    "Astrolabe and highlight targets": "星盘与高亮目标",
    "Ascendant highlight point": "高亮上升点",
    "Image prompt and assets": "图片提示词和素材",
    "A person walking through a doorway into a starry room": "一个人推开门走进星空房间",
    "Structured diagram data for animated teaching visuals": "用于动画教学图解的结构化数据",
    "Ascendant concept as a timeline diagram": "用时间线图解上升星座概念",
    "Spatial scene contract for Three.js visuals": "三维空间场景配置",
    "Spatial orbit scene for rising sign": "用于上升星座的空间轨道场景",
    "BGM and sound design": "BGM 和声音设计",
    "Composition result": "合成当前分镜画面",
    "Combine scenes, captions, voice, and assets": "整合分镜、字幕、配音和素材",
    "Full video preview": "整条视频预览",
    "MP4 export settings": "MP4 导出设置",
    "1080x1920 MP4": "1080x1920 MP4 导出"
  };

  return labels[description] ?? description;
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

function getJobCompletionStatus(jobType: string, output: Record<string, unknown> | undefined) {
  const label = getJobTypeLabel(jobType);
  const assetPath = getString(output?.assetPath, "");

  if (jobType === "render-video" && assetPath) {
    return `${label} 已完成：${assetPath}`;
  }

  return `${label} 已完成`;
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
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

type SceneCardResourceKind = Extract<
  CanvasNodeKind,
  "caption" | "chart" | "image" | "d3" | "three"
>;

const sceneCardVisualKinds: SceneCardResourceKind[] = ["image", "chart", "d3", "three"];

function getSceneCardPreview(canvas: CanvasDocument, node: CanvasNode) {
  if (node.kind !== "scene") {
    return null;
  }

  const visualNode = sceneCardVisualKinds
    .map((kind) => findSceneCardResourceNode(canvas, node, kind))
    .find((resourceNode): resourceNode is CanvasNode =>
      Boolean(resourceNode && getNodeAssetUrl(resourceNode))
    );
  const captionNode = findSceneCardResourceNode(canvas, node, "caption");
  const assetUrl = visualNode ? getNodeAssetUrl(visualNode) : "";
  const caption = captionNode ? getAssetPreviewText(captionNode) : "";

  if (!assetUrl && !caption) {
    return null;
  }

  return {
    assetUrl,
    caption: compactPreviewText(caption, 80),
    captionColor: captionNode ? getString(captionNode.data.color, "#ffffff") : "#ffffff"
  };
}

function findSceneCardResourceNode(
  canvas: CanvasDocument,
  sceneNode: CanvasNode,
  kind: SceneCardResourceKind
) {
  const sceneId = sceneNode.refId ?? sceneNode.id;
  const directRefId = `${kind}-${sceneId}`;
  const safeRefId = `${kind}-${safeId(sceneId)}`;

  return canvas.nodes.find(
    (node) =>
      node.kind === kind &&
      (getString(node.data.sourceSceneNodeId, "") === sceneNode.id ||
        getString(node.data.sceneNodeId, "") === sceneNode.id ||
        getString(node.data.sceneId, "") === sceneId ||
        node.refId === directRefId ||
        node.refId === safeRefId ||
        (kind === "caption" && node.refId === sceneId))
  );
}

function recordData(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
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
