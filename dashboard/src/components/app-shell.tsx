"use client";

import * as Avatar from "@radix-ui/react-avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, CalendarDays, CheckSquare2, ChevronDown, Files, Inbox, LayoutDashboard, Menu, Plus, Search, Settings, ShieldCheck, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatRelativeDate, initials } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { WorkspaceGate } from "./workspace-gate";
import { useWorkspace } from "./workspace-provider";

const navigationGroups = [
  { label: "Work", items: [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/tasks", label: "Tasks", icon: CheckSquare2 },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
  ] },
  { label: "Agreements", items: [
    { href: "/contracts", label: "Contracts", icon: Files },
    { href: "/portfolio", label: "Portfolio", icon: Search },
  ] },
  { label: "Governance", items: [
    { href: "/verify", label: "Identity verification", icon: ShieldCheck },
    { href: "/reports", label: "Reports", icon: BarChart3 },
  ] },
  { label: "Administration", items: [
    { href: "/team", label: "Team", icon: UsersRound },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

function Navigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="side-nav" aria-label="Workspace navigation">
      {navigationGroups.map((group) => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onNavigate={close}><Icon size={17} />{label}</Link>;
      })}</div>)}
    </nav>
  );
}

function WorkspaceAppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const pathname = usePathname();
  const { activeOrganization, organizations, selectOrganization, user, canUpload, isDemo } = useWorkspace();
  const queryClient = useQueryClient();
  const organizationId = activeOrganization?.id ?? "";
  const notificationsQuery = useQuery({
    queryKey: ["notifications", organizationId],
    queryFn: () => api.notifications(organizationId),
    enabled: Boolean(organizationId) && !pathname.startsWith("/invite/") && pathname !== "/signin",
    refetchInterval: 30000,
  });
  const readMutation = useMutation({
    mutationFn: (notificationId: string) => api.markNotificationRead(organizationId, notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", organizationId] }),
  });
  const readAllMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(organizationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", organizationId] }),
  });
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const contractsQuery = useQuery({ queryKey: ["contracts", organizationId], queryFn: () => api.contracts(organizationId), enabled: Boolean(organizationId) });
  const tasksQuery = useQuery({ queryKey: ["tasks", organizationId], queryFn: () => api.tasks(organizationId), enabled: Boolean(organizationId) });
  const searchResults = useMemo(() => {
    const term = globalSearch.trim().toLowerCase();
    if (term.length < 2) return [];
    const contracts = (contractsQuery.data ?? []).filter((item) => `${item.title} ${item.counterparty} ${item.contract_type} ${item.status}`.toLowerCase().includes(term)).slice(0, 4).map((item) => ({ id: item.id, href: `/contracts/${item.id}`, title: item.title, meta: `${item.counterparty} · ${item.status}` }));
    const tasks = (tasksQuery.data ?? []).filter((item) => `${item.title} ${item.contract_title} ${item.assigned_to_name} ${item.due_at}`.toLowerCase().includes(term)).slice(0, 3).map((item) => ({ id: item.id, href: "/tasks", title: item.title, meta: `${item.contract_title ?? "Workspace action"} · task` }));
    return [...contracts, ...tasks];
  }, [contractsQuery.data, globalSearch, tasksQuery.data]);
  const hasSearchableRecords = Boolean(contractsQuery.data?.length || tasksQuery.data?.length);
  return (
    <WorkspaceGate>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand"><BrandMark /></div>
          <Navigation />
        </aside>

        <div className="app-frame">
          <header className="topbar">
            <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="workspace-switcher"><span>{activeOrganization?.name ?? "Workspace"}</span><ChevronDown size={15} /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dropdown" align="start" sideOffset={8}>
                  <DropdownMenu.Label className="dropdown-label">Switch workspace</DropdownMenu.Label>
                  {organizations.map((organization) => <DropdownMenu.Item key={organization.id} className="dropdown-item" onSelect={() => selectOrganization(organization.id)}>{organization.name}{organization.id === activeOrganization?.id && <span>Current</span>}</DropdownMenu.Item>)}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {hasSearchableRecords && <div className="global-search"><label><Search size={16} /><span className="sr-only">Global search</span><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search contracts, tasks, parties, or dates" /></label>{globalSearch.trim().length >= 2 && <div className="global-results">{searchResults.length ? searchResults.map((result) => <Link href={result.href} key={`${result.href}-${result.id}`} onClick={() => setGlobalSearch("")}><strong>{result.title}</strong><span>{result.meta}</span></Link>) : <p>No workspace records match this search.</p>}</div>}</div>}
            <div className="top-actions">
              {canUpload && <Link href="/contracts/new" className="button top-new"><Plus size={16} />New contract</Link>}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="icon-button notification-trigger" aria-label={`${unreadCount || "No"} unread notifications`}><Bell size={18} />{unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="dropdown notification-menu" align="end" sideOffset={8}>
                    <div className="notification-head"><div><strong>Notifications</strong><span>{unreadCount ? `${unreadCount} unread` : "You’re caught up"}</span></div>{unreadCount > 0 && !isDemo && <button onClick={() => readAllMutation.mutate()} disabled={readAllMutation.isPending}>Mark all read</button>}</div>
                    <DropdownMenu.Separator className="dropdown-separator" />
                    {notificationsQuery.isLoading ? <p className="notification-empty">Loading updates…</p> : notifications.length ? notifications.slice(0, 8).map((notification) => <DropdownMenu.Item key={notification.id} asChild className="notification-item" onSelect={() => { if (!notification.read_at && !isDemo) readMutation.mutate(notification.id); }}>
                      <Link href={notification.action_url || "/inbox"}><span className={`notification-dot ${notification.read_at ? "" : "unread"}`} /><span><strong>{notification.title}</strong><small>{notification.message}</small><time>{formatRelativeDate(notification.created_at)}</time></span></Link>
                    </DropdownMenu.Item>) : <p className="notification-empty">Processing updates and review alerts will appear here.</p>}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className="profile-trigger" aria-label="Open profile menu">
                  <Avatar.Root className="avatar"><Avatar.Fallback>{isDemo ? "DV" : initials(user?.display_name ?? "Reviewer")}</Avatar.Fallback></Avatar.Root>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="dropdown profile-menu" align="end" sideOffset={8}>
                    <DropdownMenu.Label className="profile-label"><strong>{user?.display_name ?? "Reviewer"}</strong><span>{user?.email}</span></DropdownMenu.Label>
                    <DropdownMenu.Separator className="dropdown-separator" />
                    <DropdownMenu.Item asChild className="dropdown-item"><Link href="/settings">Workspace settings</Link></DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </header>
          <main id="main-content" className="main-content">{isDemo && <div className="demo-banner"><strong>Synthetic demo</strong><span>Read-only sample records, isolated from private customer workspaces.</span></div>}{children}</main>
        </div>

        {mobileOpen && <div className="mobile-overlay" role="presentation" onMouseDown={() => setMobileOpen(false)}>
          <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mobile-drawer-head"><BrandMark /><button className="icon-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={19} /></button></div>
            <Navigation close={() => setMobileOpen(false)} />
          </aside>
        </div>}
      </div>
    </WorkspaceGate>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/invite/") || pathname.startsWith("/shared/") || pathname.startsWith("/intake/") || pathname.startsWith("/auth/") || pathname === "/signin" || pathname === "/sample") return <>{children}</>;
  return <WorkspaceAppShell>{children}</WorkspaceAppShell>;
}
