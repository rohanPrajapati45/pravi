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

// Backend issues a one-time signed upload token; the file goes straight to storage.
export async function uploadEvidence(file: File, { purpose, ownerId, token }: { purpose: "inspection" | "maintenance" | "progress"; ownerId: string; token: string | null }) {
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
