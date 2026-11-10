// Product-focus flags. Off by default: the launch product is contract review
// and renewal follow-through. Setting a flag restores that area's navigation
// and routes; no code or data is removed when a flag is off.
// NEXT_PUBLIC_* values are inlined at build time, so a change needs a rebuild.
const enabled = (value: string | undefined) => value === "1" || value === "true";

export const features = {
  /** Agents, runs, hosted agent tasks and workspace context. */
  agentPlatform: enabled(process.env.NEXT_PUBLIC_LENSLAYER_AGENT_PLATFORM),
  /** Browser-local bank statement converter. */
  documentConverter: enabled(process.env.NEXT_PUBLIC_LENSLAYER_DOCUMENT_CONVERTER),
} as const;

const frozenAreas: Array<{ prefixes: string[]; enabled: boolean }> = [
  { prefixes: ["/agents", "/agent-tasks", "/runs", "/context"], enabled: features.agentPlatform },
  { prefixes: ["/convert"], enabled: features.documentConverter },
];

/** True when the path belongs to a product area whose flag is off. */
export function isFrozenPath(pathname: string) {
  return frozenAreas.some((area) => !area.enabled && area.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)));
}
