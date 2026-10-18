"use client";

import * as Avatar from "@radix-ui/react-avatar";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, BookOpen, Bot, CalendarDays, CheckSquare2, ChevronDown, FileOutput, Files, Inbox, LayoutDashboard, LogIn, Menu, Plus, Search, Settings, UsersRound, X } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { initials } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { WorkspaceGate } from "./workspace-gate";
import { useWorkspace } from "./workspace-provider";
import { NotificationRow } from "./notification-row";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceSearch } from "./workspace-search";

const AiAssistant = dynamic(() => import("./ai-assistant").then((module) => module.AiAssistant), { ssr: false });

const navigationGroups = [
  { label: "Work", items: [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/tasks", label: "Tasks", icon: CheckSquare2 },
    { href: "/context", label: "Workspace context", icon: BookOpen },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/agent-tasks", label: "Agent tasks", icon: Bot },
  ] },
  { label: "Agreements", items: [
    { href: "/contracts", label: "Contracts", icon: Files },
    { href: "/portfolio", label: "Portfolio", icon: Search },
    { href: "/convert", label: "Document converter", icon: FileOutput },
  ] },
  { label: "Governance", items: [
    { href: "/reports", label: "Reports", icon: BarChart3 },
  ] },
  { label: "Administration", items: [
    { href: "/agents", label: "Agents", icon: Bot },
    { href: "/team", label: "Team", icon: UsersRound },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

function Navigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="side-nav" aria-label="Workspace navigation">
      {navigationGroups.map((group) => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/agents" && pathname.startsWith("/runs"));
        return <Link key={href} href={href} prefetch={false} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onNavigate={close}><Icon size={17} />{label}</Link>;
      })}</div>)}
    </nav>
  );
}

function WorkspaceAppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
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
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  return (
    <WorkspaceGate>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="app-shell" data-workspace-area={pathname.split("/")[1] || "overview"}>
        <aside className="sidebar">
          <div className="sidebar-brand"><BrandMark /></div>
          <Navigation />
        </aside>

        <div className="app-frame">
          <header className="topbar">
            <button ref={mobileTriggerRef} className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="workspace-switcher"><span>{activeOrganization?.name ?? "Workspace"}</span><ChevronDown size={15} /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dropdown" align="start" sideOffset={8}>
                  <DropdownMenu.Label className="dropdown-label">Switch workspace</DropdownMenu.Label>
                  {organizations.map((organization) => <DropdownMenu.Item key={organization.id} className="dropdown-item" onSelect={() => selectOrganization(organization.id)}>{organization.name}{organization.id === activeOrganization?.id && <span>Current</span>}</DropdownMenu.Item>)}
                  {isDemo && <><DropdownMenu.Separator className="dropdown-separator" /><DropdownMenu.Item asChild className="dropdown-item"><Link href="/signin"><LogIn size={16} />Sign in to a workspace</Link></DropdownMenu.Item></>}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <WorkspaceSearch organizationId={organizationId} />
            <div className="top-actions">
              {canUpload && <Link href="/contracts/new" prefetch={false} className="button top-new"><Plus size={16} />New contract</Link>}
              <ThemeToggle />
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="icon-button notification-trigger" aria-label={`${unreadCount || "No"} unread notifications`}><Bell size={18} />{unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="dropdown notification-menu" align="end" sideOffset={8}>
                    <div className="notification-head"><strong>Notifications</strong><span>{unreadCount} New</span></div>
                    <div className="notification-scroll">{notificationsQuery.isLoading ? <p className="notification-empty">Loading updates…</p> : notifications.length ? notifications.slice(0, 5).map((notification) => <DropdownMenu.Item key={notification.id} asChild className="notification-item" onSelect={() => { if (!notification.read_at && !isDemo) readMutation.mutate(notification.id); }}><NotificationRow notification={notification} /></DropdownMenu.Item>) : <p className="notification-empty">Processing updates and review alerts will appear here.</p>}</div>
                    <DropdownMenu.Item asChild className="notification-footer-item"><Link href="/notifications">See All Notifications</Link></DropdownMenu.Item>
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
                    {!isDemo && <DropdownMenu.Item asChild className="dropdown-item"><Link href="/auth/signout">Sign out</Link></DropdownMenu.Item>}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </header>
          <main id="main-content" className="main-content">{isDemo && <div className="demo-banner"><strong>Demo workspace</strong><span>Fictional companies and documents. Read-only, separate from your own workspace.</span></div>}{children}</main>
        </div>

        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="mobile-overlay" />
            <Dialog.Content className="mobile-drawer" aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); mobileTriggerRef.current?.focus(); }}>
              <div className="mobile-drawer-head"><Dialog.Title className="sr-only">Workspace navigation</Dialog.Title><BrandMark /><Dialog.Close asChild><button className="icon-button" aria-label="Close navigation"><X size={19} /></button></Dialog.Close></div>
              <Navigation close={() => setMobileOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <AiAssistant />
      </div>
    </WorkspaceGate>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/invite/") || pathname.startsWith("/shared/") || pathname.startsWith("/auth/") || pathname === "/calendar/oauth-return" || pathname === "/signin" || pathname === "/login" || pathname === "/signup" || pathname === "/sample") return <>{children}</>;
  return <WorkspaceAppShell>{children}</WorkspaceAppShell>;
}
