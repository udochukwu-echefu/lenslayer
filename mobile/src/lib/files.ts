import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { buildHeaders, failure } from "./api/client";
import { config } from "./config";

/** A document chosen for upload. `blob` is what goes into FormData. */
export type PickedDocument = { name: string; size: number; mimeType: string; blob: Blob };

export const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Opens the system document picker. The backend records the uploaded file's
 * name and content type, so the picked file is copied under its original name
 * into a fresh cache folder before upload; expo-file-system's File is a Blob.
 */
export async function pickDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ACCEPTED_TYPES, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const folder = new Directory(Paths.cache, `upload-${Date.now()}`);
  folder.create({ idempotent: true });
  const named = new File(folder, asset.name);
  new File(asset.uri).copy(named);
  return { name: asset.name, size: asset.size ?? named.size ?? 0, mimeType: asset.mimeType ?? named.type ?? "application/octet-stream", blob: named };
}

/** Downloads an authenticated API file and opens the Share sheet for it. */
export async function downloadAndShare(path: string, filename: string): Promise<void> {
  const headers = await buildHeaders(path);
  const response = await fetch(`${config.apiPrefix}${path}`, { headers });
  if (!response.ok) throw await failure(response, path);
  const folder = new Directory(Paths.cache, "exports");
  folder.create({ idempotent: true });
  const file = new File(folder, filename.replace(/[\\/:]/g, "-"));
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(await response.arrayBuffer()));
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
  await Sharing.shareAsync(file.uri, { mimeType: response.headers.get("content-type") ?? undefined, dialogTitle: filename });
}
