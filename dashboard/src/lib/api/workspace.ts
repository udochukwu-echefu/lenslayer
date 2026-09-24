import type {
  Invitation,
  InvitationAccepted,
  InvitationCreated,
  InvitationPreview,
  Membership,
  Organization,
  OrganizationSettings,
  Role,
  User,
} from "../types";
import { request, jsonRequest } from "./client";
import { PUBLIC_ACCESS_ENABLED } from "../workspace-mode";

export const workspaceApi = {
  me: (usePublicAccess = PUBLIC_ACCESS_ENABLED) =>
    request<User>("/me", undefined, usePublicAccess),
  organizations: (usePublicAccess = PUBLIC_ACCESS_ENABLED) =>
    request<Organization[]>("/organizations", undefined, usePublicAccess),
  createOrganization: (payload: { name: string; slug: string }) =>
    jsonRequest<Organization>("/organizations", "POST", payload, false),
  organizationSettings: (organizationId: string) =>
    request<OrganizationSettings>(`/organizations/${organizationId}/settings`),
  updateOrganizationSettings: (
    organizationId: string,
    payload: Partial<
      Pick<
        OrganizationSettings,
        | "name"
        | "default_retention_days"
        | "default_retain_document"
        | "default_retain_source_text"
        | "notification_review_ready"
        | "notification_review_failed"
      >
    >,
  ) =>
    jsonRequest<OrganizationSettings>(
      `/organizations/${organizationId}/settings`,
      "PATCH",
      payload,
    ),
  members: (organizationId: string) =>
    request<Membership[]>(`/organizations/${organizationId}/members`),
  updateMemberRole: (
    organizationId: string,
    membershipId: string,
    role: Role,
  ) =>
    jsonRequest<Membership>(
      `/organizations/${organizationId}/members/${membershipId}`,
      "PATCH",
      { role },
    ),
  removeMember: (organizationId: string, membershipId: string) =>
    request<void>(`/organizations/${organizationId}/members/${membershipId}`, {
      method: "DELETE",
    }),
  invitations: (organizationId: string) =>
    request<Invitation[]>(`/organizations/${organizationId}/invitations`),
  createInvitation: (
    organizationId: string,
    payload: {
      email: string;
      role: Exclude<Role, "owner">;
    },
  ) =>
    jsonRequest<InvitationCreated>(
      `/organizations/${organizationId}/invitations`,
      "POST",
      payload,
    ),
  revokeInvitation: (organizationId: string, invitationId: string) =>
    request<void>(
      `/organizations/${organizationId}/invitations/${invitationId}`,
      { method: "DELETE" },
    ),
  invitation: (token: string) =>
    request<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token: string) =>
    request<InvitationAccepted>(
      `/invitations/${encodeURIComponent(token)}/accept`,
      { method: "POST" },
    ),
};
