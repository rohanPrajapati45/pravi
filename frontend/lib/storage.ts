import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

// Phone photos are often 4–8 MB; shrink to ≤1600px JPEG before upload to save field data.
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Only images can be attached");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process photo"))), "image/jpeg", 0.8));
}

export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx";
const DOCUMENT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

// Documents are uploaded as-is (no compression) to the private documents bucket; returns what the API needs to register it.
export async function uploadDocument(file: File, { ownerType, ownerId, token }: { ownerType: "asset" | "work"; ownerId: string; token: string | null }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type && Object.values(DOCUMENT_MIME).includes(file.type) ? file.type : DOCUMENT_MIME[extension];
  if (!mime) throw new Error("Allowed: PDF, JPEG/PNG/WebP, Word (.docx), Excel (.xlsx)");
  if (file.size > 20 * 1024 * 1024) throw new Error("Files up to 20 MB");
  const { data } = await api<{ path: string; token: string; bucket: string }>("/documents/sign", {
    method: "POST",
    token,
    body: { owner_type: ownerType, owner_id: ownerId, file_name: file.name, content_type: mime, size_bytes: file.size }
  });
  const { error } = await supabase.storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, file, { contentType: mime });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path: data.path, file_name: file.name, mime_type: mime, size_bytes: file.size };
}

// Backend issues a one-time signed upload token; the file goes straight to storage.
export async function uploadEvidence(file: File, { purpose, ownerId, token }: { purpose: "inspection" | "maintenance" | "progress" | "emergency"; ownerId: string; token: string | null }) {
  const blob = await compress(file);
  const { data } = await api<{ path: string; token: string; bucket: string }>("/uploads/sign", {
    method: "POST",
    token,
    body: { purpose, owner_id: ownerId, content_type: "image/jpeg" }
  });
  const { error } = await supabase.storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return data.path;
}

// Citizens have no login: the API hands out a one-time slot (rate-limited) and the photo goes straight to private storage.
export async function uploadComplaintPhoto(file: File) {
  const blob = await compress(file);
  const { data } = await api<{ path: string; token: string; bucket: string }>("/public/complaints/photo", { method: "POST", body: { content_type: "image/jpeg" } });
  const { error } = await supabase.storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return data.path;
}
