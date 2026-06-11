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
import {
  getAiModelOptionsForKind,
  getAiModelTarget,
  getNodeAiModel,
  getSceneImageModel,
  imageModelOptions
} from "./aiModels";
import {
  getAiPromptDataKey,
  getAiPromptRows,
  getAiPromptValue
} from "./aiNodeInputs";

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
  caption: "字幕",
  voice: "配音",
  chart: "星盘",
  image: "简笔画",
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
    const currentCanvas = canvasToSave;
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
    } catch {
      setSaveState("error");
      setStatusText(messages.failed ?? "画布保存失败");
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

    const liveProviderGuard = getLiveProviderRunGuard(
      draftJobRequest.type,
      providerHealth,
      draftJobRequest.input
    );

    if (liveProviderGuard && !window.confirm(liveProviderConfirmationMessage(liveProviderGuard))) {
      setStatusText(`${liveProviderGuard.providerLabel} 运行已取消`);
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
    setRunningNodeId(node.id);
    setStatusText(`正在运行：${getJobTypeLabel(draftJobRequest.type)}`);

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
            ? `${payload.providerRisk.providerLabel} 需要确认`
            : "任务创建失败"
        );
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

      await loadProjectCanvas(nextSelectedNodeId);
      setSaveState("saved");
      setStatusText(`${getJobTypeLabel(draftJobRequest.type)} 已完成`);
    } catch (error) {
      setSaveState("error");
      setStatusText(error instanceof Error ? error.message : `${getJobTypeLabel(draftJobRequest.type)} 失败`);
    } finally {
      setRunningNodeId(null);
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
          <Link aria-current="page" href={`/studio/project-ascendant-intro?projectId=${encodeURIComponent(projectId)}`}>
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
            {((Object.keys(nodeKindLabels) as CanvasNodeKind[]).filter((kind) => kind !== "preview" && kind !== "export")).map((kind) => (
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
            <button type="button" onClick={saveCanvas}>保存</button>
            <button type="button" onClick={resetCanvas}>重置</button>
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
            <span className="save-state" data-state={saveState}>{saveStateLabels[saveState]}</span>
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
                    <small>{nodeKindLabels[node.kind]}</small>
                    <span data-status={node.status}>{getNodeStatusLabel(node.status)}</span>
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
                      onDeleteNode={deleteNode}
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
        onDeleteNode={deleteNode}
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
  onDeleteNode,
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
  onDeleteNode: (nodeId: string) => void;
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
  const liveProviderGuard = nodeJobRequest
    ? getLiveProviderRunGuard(nodeJobRequest.type, providerHealth, nodeJobRequest.input)
    : null;
  const assetUrl = getNodeAssetUrl(node);
  const aiModelTarget = getAiModelTarget(node.kind);
  const aiPromptDataKey = getAiPromptDataKey(node.kind);
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
            data-risk={liveProviderGuard ? "live-provider" : "local-or-mock"}
            disabled={running}
            type="button"
            onClick={() => onRunNode(node.id)}
          >
            {running ? "运行中..." : getNodeRunLabel(node)}
          </button>
          <div
            className="job-provider-notice"
            data-risk={liveProviderGuard ? "live-provider" : "local-or-mock"}
          >
            {liveProviderGuard
              ? `${liveProviderGuard.providerLabel} 运行前需要确认。`
              : statusText}
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
          提示词
          <textarea
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

      {node.kind === "script" || node.kind === "storyboard" ? (
        <label>
          分镜数量
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
            插画模型
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
                <option value="image">简笔画</option>
                <option value="d3">D3 图表</option>
                <option value="three">三维场景</option>
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
            地点
            <input
              value={getString(node.data.placeName, defaultChartBirthData.placeName)}
              onChange={(event) => onDataChange("placeName", event.currentTarget.value)}
            />
          </label>
          <label>
            高亮目标
            <input
              value={getString(node.data.highlight, defaultChartBirthData.highlight)}
              onChange={(event) => onDataChange("highlight", event.currentTarget.value)}
            />
          </label>
        </div>
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
                应用 JSON
              </button>
            </>
          ) : null}

          <VideoPreviewPanel previewSpec={previewSpec} />
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

function VideoPreviewPanel({ previewSpec }: { previewSpec: AstroVideoSpec }) {
  const size = getCompositionSize(previewSpec.format);
  const durationInFrames = getSpecDurationFrames(previewSpec);

  return (
    <section className="video-preview-panel">
      <header>
        <strong>预览</strong>
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
          <div className="preview-loading">暂无可预览分镜</div>
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

function getNodeJobRequest(node: CanvasNode): NodeJobRequest | null {
  if (node.kind === "topic") {
    return {
      type: "generate-script",
      input: {
        topic: getAiPromptValue(node) || "Astrology teaching short",
        model: getNodeAiModel(node)
      }
    };
  }

  if (node.kind === "script" || node.kind === "storyboard") {
    return {
      type: "generate-storyboard",
      input: {
        scriptText: getAiPromptValue(node),
        sceneCount: getNumber(node.data.sceneCount, 5),
        model: getNodeAiModel(node)
      }
    };
  }

  if (node.kind === "image") {
    return {
      type: "generate-image",
      input: {
        prompt: getAiPromptValue(node) || "simple educational astrology line drawing",
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
      return "生成文案";
    case "script":
    case "storyboard":
      return "生成分镜";
    case "caption":
      return "对齐字幕";
    case "voice":
      return "生成配音";
    case "chart":
      return "生成星盘";
    case "image":
      return "生成简笔画";
    case "d3":
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
    "generate-storyboard": "生成分镜",
    "generate-image": "生成简笔画",
    "generate-tts": "生成配音",
    "generate-chart": "生成星盘",
    "export-visual-asset": "导出视觉素材",
    "align-captions": "对齐字幕",
    "render-preview": "渲染预览",
    "render-video": "渲染视频",
    "create-preview-node": "创建预览",
    "create-export-node": "创建导出"
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
    Storyboard: "分镜计划",
    Scene: "分镜",
    Opening: "开场问题",
    Caption: "字幕",
    Voice: "配音",
    Chart: "星盘",
    Image: "简笔画",
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
    "Split the script into editable scenes": "把文案拆成可编辑的分镜",
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





