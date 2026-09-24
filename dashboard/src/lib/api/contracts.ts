import type {
  Contract,
  ContractCreated,
  ContractQuestionAnswer,
  DealPassport,
  Job,
  Review,
} from "../types";
import { request, jsonRequest, download, API_PREFIX } from "./client";

export const contractsApi = {
  contracts: (organizationId: string) =>
    request<Contract[]>(`/organizations/${organizationId}/contracts`),
  contract: (organizationId: string, contractId: string) =>
    request<Contract>(
      `/organizations/${organizationId}/contracts/${contractId}`,
    ),
  createContract: (organizationId: string, body: FormData) =>
    request<ContractCreated>(`/organizations/${organizationId}/contracts`, {
      method: "POST",
      body,
    }),
  deleteContract: (organizationId: string, contractId: string) =>
    request<void>(`/organizations/${organizationId}/contracts/${contractId}`, {
      method: "DELETE",
    }),
  jobs: (organizationId: string, contractId: string) =>
    request<Job[]>(
      `/organizations/${organizationId}/contracts/${contractId}/jobs`,
    ),
  review: (organizationId: string, contractId: string) =>
    request<Review>(
      `/organizations/${organizationId}/contracts/${contractId}/review`,
    ),
  dealPassport: (organizationId: string, contractId: string) =>
    request<DealPassport>(
      `/organizations/${organizationId}/contracts/${contractId}/deal-passport`,
    ),
  downloadRedline: (organizationId: string, contractId: string) =>
    download(
      `${API_PREFIX}/organizations/${organizationId}/contracts/${contractId}/redline.docx`,
      `${contractId}-redline.docx`,
    ),
  askContract: (organizationId: string, contractId: string, question: string) =>
    jsonRequest<ContractQuestionAnswer>(
      `/organizations/${organizationId}/contracts/${contractId}/questions`,
      "POST",
      { question },
    ),
  downloadContractExport: (
    organizationId: string,
    contractId: string,
    format: "pdf" | "docx" | "csv" | "md" | "json",
  ) =>
    download(
      `${API_PREFIX}/organizations/${organizationId}/contracts/${contractId}/exports/${format}`,
      `${contractId}-review.${format}`,
    ),
};
