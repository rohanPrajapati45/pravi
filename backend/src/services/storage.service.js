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

// ---------- documents bucket (PDF, images, Office files) ----------

export const DOCUMENTS_BUCKET = "documents";
export const DOCUMENT_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"
};
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
let documentsReady = null;

export function ensureDocumentsBucket() {
  documentsReady ??= supabaseAdmin.storage
    .createBucket(DOCUMENTS_BUCKET, { public: false, fileSizeLimit: "20MB", allowedMimeTypes: Object.keys(DOCUMENT_TYPES) })
    .then(({ error }) => {
      if (error && !/already exists/i.test(error.message)) {
        documentsReady = null;
        throw new AppError(500, "STORAGE_UNAVAILABLE", `Could not prepare document storage: ${error.message}`);
      }
    });
  return documentsReady;
}

export async function signDocumentUpload({ ownerType, ownerId, fileName, contentType, sizeBytes }) {
  if (!DOCUMENT_TYPES[contentType]) throw AppError.badRequest("Allowed: PDF, JPEG/PNG/WebP images, Word (.docx), Excel (.xlsx)");
  if (sizeBytes > DOCUMENT_MAX_BYTES) throw AppError.badRequest("Files up to 20 MB");
  await ensureDocumentsBucket();
  const safeName = fileName.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-80) || `file.${DOCUMENT_TYPES[contentType]}`;
  const path = `${ownerType}/${ownerId}/${randomUUID()}-${safeName}`;
  const { data, error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error) throw new AppError(502, "STORAGE_ERROR", error.message);
  return { path, token: data.token, bucket: DOCUMENTS_BUCKET };
}

export async function documentExists(path) {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).list(folder, { search: name, limit: 5 });
  if (error) return false;
  return data.some((item) => item.name === name);
}

export async function signedDocumentUrls(paths, expiresIn = 3600) {
  if (!paths.length) return {};
  const { data, error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).createSignedUrls(paths, expiresIn);
  if (error) return {};
  return Object.fromEntries(data.map((item) => [item.path, item.signedUrl]));
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
