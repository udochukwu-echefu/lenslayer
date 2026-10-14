import { WorkspaceContextPage } from "@/components/context/workspace-context";
export default async function ContextRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkspaceContextPage recordId={id} />;
}
