"use client";

import dynamic from "next/dynamic";
import { defaultProjectId } from "./seed";

const CanvasStudio = dynamic(() => import("./CanvasStudio").then((mod) => mod.CanvasStudio), {
  ssr: false,
  loading: () => (
    <main className="studio-loading" aria-label="Studio loading">
      <div>
        <strong>ZeroFlow</strong>
        <span>Loading studio...</span>
      </div>
    </main>
  )
});

export function CanvasStudioClient({
  initialNodeId,
  projectId = defaultProjectId
}: {
  initialNodeId?: string;
  projectId?: string;
}) {
  return <CanvasStudio initialNodeId={initialNodeId} projectId={projectId} />;
}
