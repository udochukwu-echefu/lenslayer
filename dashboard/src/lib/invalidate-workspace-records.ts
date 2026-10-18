import type { QueryClient } from "@tanstack/react-query";

export function invalidateWorkspaceRecords(client: QueryClient, organizationId: string, ...roots: Array<"contracts" | "tasks" | "lifecycle">) {
  return Promise.all([...new Set([...roots, "overview", "workspace-search"])].map((root) => client.invalidateQueries({ queryKey: [root, organizationId] })));
}
