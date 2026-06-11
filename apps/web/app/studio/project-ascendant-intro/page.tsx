import { CanvasStudioClient } from "@/features/canvas/CanvasStudioClient";

type DefaultStudioProjectPageProps = {
  searchParams?: Promise<{
    nodeId?: string;
    projectId?: string;
  }>;
};

export default async function DefaultStudioProjectPage({
  searchParams
}: DefaultStudioProjectPageProps) {
  const params = await searchParams;

  return (
    <CanvasStudioClient
      initialNodeId={params?.nodeId}
      projectId={params?.projectId ?? "project-ascendant-intro"}
    />
  );
}
