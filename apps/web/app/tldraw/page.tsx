import { TldrawCanvasClient } from "@/features/tldraw/TldrawCanvasClient";

type TldrawPageProps = {
  searchParams?: Promise<{
    nodeId?: string;
    projectId?: string;
  }>;
};

export default async function TldrawPage({ searchParams }: TldrawPageProps) {
  const params = await searchParams;

  return (
    <TldrawCanvasClient
      initialNodeId={params?.nodeId}
      projectId={params?.projectId ?? "project-ascendant-intro"}
    />
  );
}
