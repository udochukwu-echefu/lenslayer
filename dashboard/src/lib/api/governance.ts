import type {
  AuditEvent,
  Notification,
  PortfolioAnswer,
  ReportOverview,
  ReportRange,
} from "../types";
import { request, jsonRequest, download, API_PREFIX } from "./client";

export const governanceApi = {
  askPortfolio: (organizationId: string, question: string) =>
    jsonRequest<PortfolioAnswer>(
      `/organizations/${organizationId}/portfolio/questions`,
      "POST",
      { question },
    ),
  notifications: (organizationId: string) =>
    request<Notification[]>(`/organizations/${organizationId}/notifications`),
  markNotificationRead: (organizationId: string, notificationId: string) =>
    request<Notification>(
      `/organizations/${organizationId}/notifications/${notificationId}/read`,
      { method: "PATCH" },
    ),
  markAllNotificationsRead: (organizationId: string) =>
    request<void>(`/organizations/${organizationId}/notifications/read-all`, {
      method: "POST",
    }),
  auditEvents: (organizationId: string) =>
    request<AuditEvent[]>(`/organizations/${organizationId}/audit-events`),
  reportOverview: (organizationId: string, range: ReportRange) =>
    request<ReportOverview>(
      `/organizations/${organizationId}/reports/overview?range=${range}`,
    ),
  downloadReportExport: (organizationId: string, range: ReportRange) =>
    download(
      `${API_PREFIX}/organizations/${organizationId}/reports/export?range=${range}`,
      `lenslayer-report-${range}.csv`,
    ),
};
