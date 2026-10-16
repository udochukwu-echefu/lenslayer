import type { OrganizationSettings } from "@/lib/types";

export const settingsSections = [
  { id: "general", label: "General", description: "The name your workspace shares across LensLayer." },
  { id: "identity", label: "Identity", description: "Your profile and the active workspace for attributable actions." },
  { id: "security", label: "Security", description: "Workspace roles, access boundaries and public API keys." },
  { id: "data", label: "Data & retention", description: "Default handling for new contract uploads." },
  { id: "notifications", label: "Notifications", description: "Choose which review events notify workspace members." },
  { id: "integrations", label: "Integrations", description: "Calendar consent, intake connections, webhooks and delivery records." },
  { id: "developers", label: "Developer guide", description: "Delegate exact scope, inspect approvals and verify receipts." },
] as const;

export type SettingsSectionId = typeof settingsSections[number]["id"];
export const isSettingsSection = (value: string): value is SettingsSectionId => settingsSections.some((item) => item.id === value);
export type SettingsDraft = Pick<OrganizationSettings, "name" | "default_retention_days" | "default_retain_document" | "default_retain_source_text" | "notification_review_ready" | "notification_review_failed">;
export type SettingsPatch = Partial<SettingsDraft>;
export const policyFields = {
  general: ["name"],
  data: ["default_retention_days", "default_retain_document", "default_retain_source_text"],
  notifications: ["notification_review_ready", "notification_review_failed"],
} as const;
