"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { settingsSections, type SettingsPatch } from "./sections";
import "./settings.css";

type DraftContextValue = {
  drafts: Record<string, SettingsPatch>;
  edit: (organizationId: string, patch: SettingsPatch) => void;
  saved: (organizationId: string, submitted: SettingsPatch) => void;
};
const DraftContext = createContext<DraftContextValue | null>(null);

export function useSettingsDrafts() {
  const context = useContext(DraftContext);
  if (!context) throw new Error("Settings sections need their persistent layout");
  return context;
}

function DraftProvider({ children }: { children: React.ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, SettingsPatch>>({});
  const edit: DraftContextValue["edit"] = (id, patch) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const saved: DraftContextValue["saved"] = (id, submitted) => setDrafts((current) => {
    const next = { ...current[id] };
    for (const field of Object.keys(submitted) as (keyof SettingsPatch)[]) {
      // A newer edit made while saving must not be overwritten by the response.
      if (next[field] === submitted[field]) delete next[field];
    }
    return { ...current, [id]: next };
  });
  return <DraftContext.Provider value={{ drafts, edit, saved }}>{children}</DraftContext.Provider>;
}

export function SettingsWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isDemo } = useWorkspace();
  return <DraftProvider key={`${user?.id ?? "signed-out"}:${isDemo}`}>
    <div className="page workspace-settings">
      <div className="page-heading"><div><h1 className="page-title">Settings</h1><p className="page-description">One workspace. Clear defaults and explicit access.</p></div></div>
      {isDemo && <p className="settings-access-note" role="status">Read-only demo. These synthetic settings cannot change a private workspace.</p>}
      <div className="settings-sections-layout">
        <nav className="settings-section-nav" aria-label="Settings sections">
          {settingsSections.map((item) => <Link key={item.id} href={`/settings/${item.id}`} aria-current={pathname === `/settings/${item.id}` ? "page" : undefined}>{item.label}</Link>)}
        </nav>
        <div className="settings-selected-content">{children}</div>
      </div>
    </div>
  </DraftProvider>;
}
