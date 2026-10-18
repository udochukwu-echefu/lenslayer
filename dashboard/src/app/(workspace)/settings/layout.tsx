import { SettingsWorkspace } from "@/components/settings/settings-workspace";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsWorkspace>{children}</SettingsWorkspace>;
}
