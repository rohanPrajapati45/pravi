import { randomUUID } from "node:crypto";
import supabaseAdmin from "../config/supabase.js";
import AppError from "../utils/AppError.js";

export const EVIDENCE_BUCKET = "evidence";
const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
let bucketReady = null;

// Private bucket; files are reachable only through short-lived signed URLs.
export function ensureEvidenceBucket() {
  bucketReady ??= supabaseAdmin.storage
    .createBucket(EVIDENCE_BUCKET, { public: false, fileSizeLimit: "5MB", allowedMimeTypes: Object.keys(ALLOWED) })
    .then(({ error }) => {
      if (error && !/already exists/i.test(error.message)) {
        bucketReady = null;
        throw new AppError(500, "STORAGE_UNAVAILABLE", `Could not prepare photo storage: ${error.message}`);
      }
    });
  return bucketReady;
}

// The browser uploads straight to storage with this one-time token; the API never proxies file bytes.
export async function signUpload({ purpose, ownerId, contentType }) {
  const extension = ALLOWED[contentType];
  if (!extension) throw AppError.badRequest("Only JPEG, PNG or WebP photos are allowed");
  await ensureEvidenceBucket();
  const path = `${purpose}/${ownerId}/${randomUUID()}.${extension}`;
  const { data, error } = await supabaseAdmin.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path);
  if (error) throw new AppError(502, "STORAGE_ERROR", error.message);
  return { path, token: data.token, bucket: EVIDENCE_BUCKET };
}

export function assertOwnedPaths(paths, prefix) {
  for (const path of paths) {
    if (!path.startsWith(prefix) || path.includes("..")) throw AppError.badRequest("Photo does not belong to this record");
  }
}

export async function signedUrls(paths, expiresIn = 3600) {
  if (!paths?.length) return [];
  const { data, error } = await supabaseAdmin.storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, expiresIn);
  if (error) return paths.map((path) => ({ path, url: null }));
  return data.map((item) => ({ path: item.path, url: item.signedUrl }));
}
