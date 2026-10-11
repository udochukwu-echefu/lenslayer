/** Stable facade for the domain clients. Transport and authentication live in api/client. */
export {
  ApiError,
  resolveAuthenticatedSession,
  resolvePlatformApiPrefix,
} from "./api/client";
export { isDemoWorkspace, isPublicAccessEnabled } from "./workspace-mode";

import { workspaceApi } from "./api/workspace";
import { tasksApi } from "./api/tasks";
import { contractsApi } from "./api/contracts";
import { integrationsApi } from "./api/integrations";
import { negotiationApi } from "./api/negotiation";
import { collaborationApi } from "./api/collaboration";
import { lifecycleApi } from "./api/lifecycle";
import { governanceApi } from "./api/governance";
import { agentsApi } from "./api/agents";
import { calendarApi } from "./api/calendar";
import { hostedAgentsApi } from "./api/hosted-agents";

export const api = {
  ...workspaceApi,
  ...tasksApi,
  ...contractsApi,
  ...integrationsApi,
  ...negotiationApi,
  ...collaborationApi,
  ...lifecycleApi,
  ...governanceApi,
  ...agentsApi,
  ...calendarApi,
  ...hostedAgentsApi,
};
