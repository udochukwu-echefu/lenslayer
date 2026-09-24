import type {
  ContractVersion,
  CounterpartyResponse,
  NegotiationItem,
  NegotiationItemCategory,
  NegotiationItemStatus,
  NegotiationSummary,
} from "../types";
import { request, jsonRequest } from "./client";

export const negotiationApi = {
  versions: (organizationId: string, contractId: string) =>
    request<ContractVersion[]>(
      `/organizations/${organizationId}/contracts/${contractId}/versions`,
    ),
  uploadVersion: (organizationId: string, contractId: string, body: FormData) =>
    request<ContractVersion>(
      `/organizations/${organizationId}/contracts/${contractId}/versions`,
      { method: "POST", body },
    ),
  negotiationItems: (organizationId: string, contractId: string) =>
    request<NegotiationItem[]>(
      `/organizations/${organizationId}/contracts/${contractId}/negotiation-items`,
    ),
  createNegotiationItem: (
    organizationId: string,
    contractId: string,
    payload: {
      title: string;
      description?: string;
      category?: NegotiationItemCategory;
      priority?: "low" | "normal" | "high";
      status?: NegotiationItemStatus;
      our_position?: string;
      counterparty_position?: string;
      source_reference?: Record<string, unknown>;
    },
  ) =>
    jsonRequest<NegotiationItem>(
      `/organizations/${organizationId}/contracts/${contractId}/negotiation-items`,
      "POST",
      payload,
    ),
  updateNegotiationItem: (
    organizationId: string,
    contractId: string,
    itemId: string,
    payload: Partial<{
      title: string;
      description: string;
      category: NegotiationItemCategory;
      priority: "low" | "normal" | "high";
      status: NegotiationItemStatus;
      our_position: string;
      counterparty_position: string;
      source_reference: Record<string, unknown>;
    }>,
  ) =>
    jsonRequest<NegotiationItem>(
      `/organizations/${organizationId}/contracts/${contractId}/negotiation-items/${itemId}`,
      "PATCH",
      payload,
    ),
  counterpartyResponses: (organizationId: string, contractId: string) =>
    request<CounterpartyResponse[]>(
      `/organizations/${organizationId}/contracts/${contractId}/counterparty-responses`,
    ),
  createCounterpartyResponse: (
    organizationId: string,
    contractId: string,
    payload: {
      responder_name?: string;
      channel?: string;
      body: string;
      contract_version_id?: string | null;
      related_item_ids?: string[];
    },
  ) =>
    jsonRequest<CounterpartyResponse>(
      `/organizations/${organizationId}/contracts/${contractId}/counterparty-responses`,
      "POST",
      payload,
    ),
  negotiationSummary: (organizationId: string, contractId: string) =>
    request<NegotiationSummary>(
      `/organizations/${organizationId}/contracts/${contractId}/negotiation-summary`,
    ),
};
