import { HostedTaskDetail } from "@/components/agents/hosted-task-detail";

export default async function AgentTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <HostedTaskDetail taskId={taskId} />;
}
