import type {
  ApiKey,
  ApiKeyCreated,
  Contract,
  ContractCreated,
  IntakeAddress,
  IntegrationConnection,
  IntegrationImport,
  IntegrationProvider,
  IntegrationProviderDescriptor,
  Job,
  WebhookCreated,
  WebhookDelivery,
  WebhookSubscription,
} from "../types";
import { request, jsonRequest } from "./client";

export const integrationsApi = {
  integrations: (organizationId: string, provider?: IntegrationProvider) =>
    request<IntegrationConnection[]>(
      `/organizations/${organizationId}/integrations${provider ? `?provider=${provider}` : ""}`,
    ),
  integrationProviders: (organizationId: string) =>
    request<IntegrationProviderDescriptor[]>(
      `/organizations/${organizationId}/integrations/providers`,
    ),
  intakeEmailAddress: (organizationId: string) =>
    request<IntakeAddress>(
      `/organizations/${organizationId}/intake/email-address`,
    ),
  createIntegration: (
    organizationId: string,
    payload: {
      provider: IntegrationProvider;
      display_name: string;
      external_account_id?: string;
      capabilities?: string[];
      settings?: Record<string, unknown>;
    },
  ) =>
    jsonRequest<IntegrationConnection>(
      `/organizations/${organizationId}/integrations`,
      "POST",
      payload,
    ),
  revokeIntegration: (organizationId: string, connectionId: string) =>
    request<void>(
      `/organizations/${organizationId}/integrations/${connectionId}`,
      { method: "DELETE" },
    ),
  integrationImports: (
    organizationId: string,
    provider?: IntegrationProvider,
  ) =>
    request<IntegrationImport[]>(
      `/organizations/${organizationId}/integrations/imports${provider ? `?provider=${provider}` : ""}`,
    ),
  importProviderFile: (
    organizationId: string,
    provider: IntegrationProvider,
    body: FormData,
  ) =>
    request<{
      import_record: IntegrationImport;
      contract: Contract;
      asset: ContractCreated["asset"];
      job: Job;
    }>(`/organizations/${organizationId}/integrations/${provider}/imports`, {
      method: "POST",
      body,
    }),
  apiKeys: (organizationId: string) =>
    request<ApiKey[]>(`/organizations/${organizationId}/api-keys`),
  createApiKey: (
    organizationId: string,
    payload: {
      name: string;
      scopes: string[];
    },
  ) =>
    jsonRequest<ApiKeyCreated>(
      `/organizations/${organizationId}/api-keys`,
      "POST",
      payload,
    ),
  revokeApiKey: (organizationId: string, apiKeyId: string) =>
    request<void>(`/organizations/${organizationId}/api-keys/${apiKeyId}`, {
      method: "DELETE",
    }),
  webhooks: (organizationId: string) =>
    request<WebhookSubscription[]>(`/organizations/${organizationId}/webhooks`),
  createWebhook: (
    organizationId: string,
    payload: {
      target_url: string;
      description?: string;
      events: Array<
        "contract.created" | "contract.review_ready" | "contract.review_failed"
      >;
    },
  ) =>
    jsonRequest<WebhookCreated>(
      `/organizations/${organizationId}/webhooks`,
      "POST",
      payload,
    ),
  revokeWebhook: (organizationId: string, webhookId: string) =>
    request<void>(`/organizations/${organizationId}/webhooks/${webhookId}`, {
      method: "DELETE",
    }),
  webhookDeliveries: (organizationId: string) =>
    request<WebhookDelivery[]>(
      `/organizations/${organizationId}/webhook-deliveries`,
    ),
};
