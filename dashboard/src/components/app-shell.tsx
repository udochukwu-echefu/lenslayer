"use client";

import * as Avatar from "@radix-ui/react-avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, CalendarDays, CheckSquare2, ChevronDown, Files, Inbox, LayoutDashboard, Menu, Plus, Search, Settings, ShieldCheck, Sparkles, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatRelativeDate, initials } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { WorkspaceGate } from "./workspace-gate";
import { useWorkspace } from "./workspace-provider";

const primaryNav = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contracts", label: "Contracts", icon: Files },
  { href: "/portfolio", label: "Portfolio", icon: Search },
  { href: "/tasks", label: "Tasks", icon: CheckSquare2 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/verify", label: "Verify", icon: ShieldCheck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/team", label: "Team", icon: UsersRound },
];

function Navigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="side-nav" aria-label="Workspace navigation">
      <div className="nav-group">
        {primaryNav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onNavigate={close}><Icon size={17} />{label}</Link>;
        })}
      </div>
      <div className="nav-bottom">
        <Link href="/settings" className={`nav-link ${pathname.startsWith("/settings") ? "active" : ""}`} onNavigate={close}><Settings size={17} />Settings</Link>
      </div>
    </nav>
  );
}

function WorkspaceAppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { activeOrganization, organizations, selectOrganization, user, canUpload } = useWorkspace();
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
  return (
    <WorkspaceGate>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand"><BrandMark /></div>
          <Navigation />
          <div className="sidebar-foot"><Sparkles size={15} /><p><strong>Evidence first.</strong><br />AI findings support — never replace — human judgment.</p></div>
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
            <button className="top-search" aria-label="Search contracts" onClick={() => document.getElementById("contract-search")?.focus()}><Search size={16} /><span>Search contracts</span><kbd>⌘ K</kbd></button>
            <div className="top-actions">
              {canUpload && <Link href="/contracts/new" className="button top-new"><Plus size={16} />New contract</Link>}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="icon-button notification-trigger" aria-label={`${unreadCount || "No"} unread notifications`}><Bell size={18} />{unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="dropdown notification-menu" align="end" sideOffset={8}>
                    <div className="notification-head"><div><strong>Notifications</strong><span>{unreadCount ? `${unreadCount} unread` : "You’re caught up"}</span></div>{unreadCount > 0 && <button onClick={() => readAllMutation.mutate()} disabled={readAllMutation.isPending}>Mark all read</button>}</div>
                    <DropdownMenu.Separator className="dropdown-separator" />
                    {notificationsQuery.isLoading ? <p className="notification-empty">Loading updates…</p> : notifications.length ? notifications.slice(0, 8).map((notification) => <DropdownMenu.Item key={notification.id} asChild className="notification-item" onSelect={() => { if (!notification.read_at) readMutation.mutate(notification.id); }}>
                      <Link href={notification.action_url || "/inbox"}><span className={`notification-dot ${notification.read_at ? "" : "unread"}`} /><span><strong>{notification.title}</strong><small>{notification.message}</small><time>{formatRelativeDate(notification.created_at)}</time></span></Link>
                    </DropdownMenu.Item>) : <p className="notification-empty">Processing updates and review alerts will appear here.</p>}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className="profile-trigger" aria-label="Open profile menu">
                  <Avatar.Root className="avatar"><Avatar.Fallback>{initials(user?.display_name ?? "Reviewer")}</Avatar.Fallback></Avatar.Root>
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
          <main id="main-content" className="main-content">{children}</main>
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
