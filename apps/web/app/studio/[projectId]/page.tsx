import { CanvasStudioClient } from "@/features/canvas/CanvasStudioClient";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

type StudioProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
  searchParams?: Promise<{
    nodeId?: string;
  }>;
};

export default async function StudioProjectPage({ params, searchParams }: StudioProjectPageProps) {
  const { projectId } = await params;
  const query = await searchParams;

  return <CanvasStudioClient initialNodeId={query?.nodeId} projectId={projectId} />;
}
