import * as DocumentPicker from "expo-document-picker";
import { buildHeaders, failure } from "./api/client";
import { config } from "./config";

export type PickedDocument = { name: string; size: number; mimeType: string; blob: Blob };

export const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Browser preview: the picker returns a real File object. */
export async function pickDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ACCEPTED_TYPES, base64: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  return { name: asset.name, size: asset.size ?? blob.size, mimeType: asset.mimeType ?? blob.type, blob };
}

/** Browser preview: downloads through an object URL, like the dashboard. */
export async function downloadAndShare(path: string, filename: string): Promise<void> {
  const headers = await buildHeaders(path);
  const response = await fetch(`${config.apiPrefix}${path}`, { headers });
  if (!response.ok) throw await failure(response, path);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
