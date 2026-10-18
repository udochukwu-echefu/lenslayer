import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import WorkspaceLayout from "@/components/workspace-layout";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceLayout><SettingsWorkspace>{children}</SettingsWorkspace></WorkspaceLayout>;
}
