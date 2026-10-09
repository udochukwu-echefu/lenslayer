/** One shared wire contract for the human dashboard and the server-side SDK. */
export type {
  Agent, AgentCreate, AgentCreated, RunCreate, RunStatus,
  AgentAction, ActionStatus, ApprovalDecision, TaskActionInput,
  TaskSuccessCondition, CalendarTarget, CalendarActionInput, CalendarSuccessCondition, CompositeSuccessCondition, SuccessCondition,
  InputRequest, InputSupply, RunEvent, EvidenceReceipt, ToolName,
} from "../../../sdk/src/types";

/** Human dashboard extension; SDK stays compatible with its released surface. */
export type AgentRun = Omit<import("../../../sdk/src/types").AgentRun, "execution_owner"> & {
  execution_owner: "external_agent" | "lenslayer_hosted_agent";
};
