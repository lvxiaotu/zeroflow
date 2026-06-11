"use client";

/* eslint-disable @next/next/no-img-element */

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  resizeBox,
  type TLResizeInfo,
  type TLShape
} from "tldraw";
import type { MouseEvent, PointerEvent } from "react";

export const zeroFlowNodeShapeType = "zeroflow-node" as const;

export type ZeroFlowNodeShapeProps = {
  w: number;
  h: number;
  nodeId: string;
  kind: string;
  status: string;
  title: string;
  description: string;
  refId: string;
  assetUrl: string;
  assetKind: string;
  provider: string;
  cueCount: number;
  durationSec: number;
  actionLabel: string;
  hasAction: boolean;
};

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    [zeroFlowNodeShapeType]: ZeroFlowNodeShapeProps;
  }
}

export type ZeroFlowNodeShape = TLShape<typeof zeroFlowNodeShapeType>;

export class ZeroFlowNodeShapeUtil extends BaseBoxShapeUtil<ZeroFlowNodeShape> {
  static override type = zeroFlowNodeShapeType;
  static override props = {
    w: T.number,
    h: T.number,
    nodeId: T.string,
    kind: T.string,
    status: T.string,
    title: T.string,
    description: T.string,
    refId: T.string,
    assetUrl: T.string,
    assetKind: T.string,
    provider: T.string,
    cueCount: T.number,
    durationSec: T.number,
    actionLabel: T.string,
    hasAction: T.boolean
  };

  override canResize() {
    return true;
  }

  override isAspectRatioLocked() {
    return false;
  }

  override getDefaultProps(): ZeroFlowNodeShape["props"] {
    return {
      w: 260,
      h: 150,
      nodeId: "",
      kind: "scene",
      status: "idle",
      title: "Node",
      description: "",
      refId: "",
      assetUrl: "",
      assetKind: "",
      provider: "",
      cueCount: 0,
      durationSec: 0,
      actionLabel: "",
      hasAction: false
    };
  }

  override component(shape: ZeroFlowNodeShape) {
    const props = shape.props;
    const hasPreview = props.assetUrl.length > 0 && isVisualAsset(props.assetKind);
    const hasMeta =
      props.provider.length > 0 || props.cueCount > 0 || props.durationSec > 0 || props.refId.length > 0;

    return (
      <HTMLContainer
        className="zeroflow-tl-node"
        data-kind={props.kind}
        data-status={props.status}
        id={shape.id}
        style={{ width: props.w, height: props.h }}
      >
        <div className="zeroflow-tl-node-head">
          <span className="zeroflow-tl-kind">{props.kind}</span>
          <span className="zeroflow-tl-status">{props.status}</span>
        </div>

        <strong className="zeroflow-tl-title">{props.title}</strong>
        {props.description ? <span className="zeroflow-tl-description">{props.description}</span> : null}

        {hasPreview ? (
          <div className="zeroflow-tl-preview">
            <img alt="" draggable={false} src={props.assetUrl} />
          </div>
        ) : null}

        {hasMeta ? (
          <div className="zeroflow-tl-meta">
            {props.provider ? <span>{props.provider}</span> : null}
            {props.cueCount > 0 ? <span>{props.cueCount} cues</span> : null}
            {props.durationSec > 0 ? <span>{Math.round(props.durationSec)}s</span> : null}
            {props.refId ? <span>{props.refId}</span> : null}
          </div>
        ) : null}

        {props.hasAction ? (
          <button
            className="zeroflow-tl-action"
            type="button"
            onClick={(event) => dispatchNodeAction(event, props.nodeId)}
            onPointerDown={stopTldrawPointerEvent}
          >
            {props.actionLabel}
          </button>
        ) : null}
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: ZeroFlowNodeShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  override onResize(shape: ZeroFlowNodeShape, info: TLResizeInfo<ZeroFlowNodeShape>) {
    return resizeBox(shape, info);
  }
}

function dispatchNodeAction(event: MouseEvent<HTMLButtonElement>, nodeId: string) {
  event.preventDefault();
  event.stopPropagation();
  window.dispatchEvent(
    new CustomEvent("zeroflow:tldraw-node-action", {
      detail: { nodeId }
    })
  );
}

function stopTldrawPointerEvent(event: PointerEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

function isVisualAsset(assetKind: string) {
  return assetKind === "image" || assetKind === "chart" || assetKind === "visual";
}
