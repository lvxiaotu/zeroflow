import type { CanvasNode, JobType } from "@zeroflow/core";

export type ProductionFlowJobRequest = {
  type: JobType;
  input: Record<string, unknown>;
};

export function getCreateCompositionJobRequest(node: CanvasNode): ProductionFlowJobRequest {
  return {
    type: "create-composition-node",
    input: {
      sourceNodeKind: node.kind,
      sceneId: getString(node.data.sceneId, node.refId ?? node.id),
      sourceSceneNodeId: getString(node.data.sourceSceneNodeId, node.id)
    }
  };
}

export function getCreatePreviewFlowJobRequest(node: CanvasNode): ProductionFlowJobRequest {
  return {
    type: "create-preview-flow",
    input: {
      sourceNodeKind: node.kind,
      sceneId: getString(node.data.sceneId, node.refId ?? node.id),
      sourceSceneNodeId: getString(node.data.sourceSceneNodeId, node.id)
    }
  };
}

export function getCreateProjectExportJobRequest(): ProductionFlowJobRequest {
  return {
    type: "create-project-export-node",
    input: {}
  };
}

export function getCreatePreviewJobRequest(node: CanvasNode): ProductionFlowJobRequest {
  return {
    type: "create-preview-node",
    input: {
      sourceCompositionNodeId: node.id
    }
  };
}

export function getCreateExportJobRequest(node: CanvasNode): ProductionFlowJobRequest {
  return {
    type: "create-export-node",
    input: {
      sourcePreviewNodeId: node.id
    }
  };
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}
