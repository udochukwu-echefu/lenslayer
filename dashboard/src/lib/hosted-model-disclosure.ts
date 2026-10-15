import type { HostedAgentCapabilities } from "./hosted-agent-types";

export function hostedModelDisclosure(capabilities: HostedAgentCapabilities): string | null {
  const { model_provider: provider, model_id: id } = capabilities;
  if (!capabilities.planner_modes.includes("model") || capabilities.model_reasoning_effort !== "high" ||
      capabilities.model_excerpt_max_chars !== 1000 || !capabilities.model_disclosure ||
      !((provider === "deepseek" && id === "deepseek-flash") || (provider === "openai" && id === "gpt-6.1-sol"))) return null;
  return capabilities.model_disclosure;
}
