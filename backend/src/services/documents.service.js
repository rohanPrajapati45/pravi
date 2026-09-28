import { query, withTransaction } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { getScopedAsset } from "./assets.service.js";
import { audit, lifecycleEvent } from "./audit.service.js";
import { documentExists, signDocumentUpload, signedDocumentUrls } from "./storage.service.js";
import { getScopedWork } from "./works.service.js";

export const DOC_TYPES = ["DPR", "DRAWING", "AS_BUILT", "CONTRACT", "COMPLETION_CERTIFICATE", "INSPECTION_REPORT", "TEST_REPORT", "INVOICE", "WARRANTY", "PHOTO", "OTHER"];

// Owner must be visible to the caller (same jurisdiction rules as the asset / work itself).
async function scopedOwner(user, ownerType, ownerId) {
  if (ownerType === "asset") {
    const asset = await getScopedAsset(user, ownerId);
    if (user.role === "CONTRACTOR" && !asset.origin_work_id) throw AppError.forbidden("Contractors can only document assets they built");
    return { asset };
  }
  const work = await getScopedWork(user, ownerId);
  if (user.role === "CONTRACTOR" && work.contractor_id !== user.contractor_id) throw AppError.forbidden("Contractors can only document their own contracts");
  return { work };
}

async function assetIdsFor(client, ownerType, ownerId) {
  if (ownerType === "asset") return [ownerId];
  const { rows } = await client.query("select asset_id from work_assets where work_id = $1", [ownerId]);
  return rows.map((row) => row.asset_id);
}

export async function signUpload(user, input) {
  await scopedOwner(user, input.owner_type, input.owner_id);
  return signDocumentUpload({ ownerType: input.owner_type, ownerId: input.owner_id, fileName: input.file_name, contentType: input.content_type, sizeBytes: input.size_bytes });
}

export async function createDocument(user, input, ip) {
  await scopedOwner(user, input.owner_type, input.owner_id);
  const prefix = `${input.owner_type}/${input.owner_id}/`;
  if (!input.path.startsWith(prefix) || input.path.includes("..")) throw AppError.badRequest("Upload path does not belong to this record");
  if (!(await documentExists(input.path))) throw AppError.badRequest("File not found in storage — upload it first");

  return withTransaction(async (client) => {
    const { rows } = await client
      .query(
        `insert into documents (asset_id, work_id, doc_type, title, description, file_path, file_name, mime_type, size_bytes, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
        [
          input.owner_type === "asset" ? input.owner_id : null,
          input.owner_type === "work" ? input.owner_id : null,
          input.doc_type,
          input.title,
          input.description ?? null,
          input.path,
          input.file_name,
          input.mime_type,
          input.size_bytes,
          user.id
        ]
      )
      .catch((error) => {
        if (error.code === "23505") throw AppError.badRequest("This file is already registered");
        throw error;
      });
    const document = rows[0];
    for (const assetId of await assetIdsFor(client, input.owner_type, input.owner_id)) {
      await lifecycleEvent(
        { assetId, eventType: "DOCUMENT_ADDED", user, refType: "document", refId: document.id, remarks: `${input.doc_type.replaceAll("_", " ").toLowerCase()} added: ${input.title}` },
        client
      );
    }
    await audit({ user, action: "DOCUMENT_UPLOADED", entity: "document", entityId: document.id, diff: { owner: prefix, doc_type: input.doc_type, title: input.title, size_bytes: input.size_bytes, work_id: input.owner_type === "work" ? input.owner_id : undefined }, ip }, client);
    return document;
  });
}

function canDelete(user, document, ownerPathVisible) {
  if (document.uploaded_by === user.id) return true;
  return (user.role === "HQ" || user.role === "EE") && ownerPathVisible;
}

export async function listDocuments(user, { asset_id, work_id }) {
  let where;
  let params;
  if (asset_id) {
    const asset = await getScopedAsset(user, asset_id);
    // An asset's file = its own documents + those of the work that created it (DPR, drawings, completion certificate…).
    params = [asset_id, asset.origin_work_id];
    where = "(d.asset_id = $1 or ($2::uuid is not null and d.work_id = $2))";
  } else {
    await getScopedWork(user, work_id);
    params = [work_id];
    where = "d.work_id = $1";
  }
  const { rows } = await query(
    `select d.id, d.asset_id, d.work_id, d.doc_type, d.title, d.description, d.file_path, d.file_name, d.mime_type, d.size_bytes, d.created_at,
            d.uploaded_by, u.name as uploaded_by_name, u.role as uploaded_by_role, w.work_code
       from documents d left join users u on u.id = d.uploaded_by left join works w on w.id = d.work_id
      where ${where} and d.deleted_at is null
      order by d.created_at desc limit 200`,
    params
  );
  const urls = await signedDocumentUrls(rows.map((row) => row.file_path));
  return rows.map(({ file_path, ...row }) => ({
    ...row,
    url: urls[file_path] ?? null,
    source: row.asset_id ? "asset" : "work",
    can_delete: canDelete(user, row, true)
  }));
}

export async function deleteDocument(user, id, ip) {
  const { rows } = await query("select * from documents where id = $1 and deleted_at is null", [id]);
  const document = rows[0];
  if (!document) throw AppError.notFound("Document not found");
  const ownerType = document.asset_id ? "asset" : "work";
  const ownerId = document.asset_id ?? document.work_id;
  await scopedOwner(user, ownerType, ownerId);
  if (!canDelete(user, document, true)) throw AppError.forbidden("Only the uploader or the responsible EE/HQ can remove a document");

  return withTransaction(async (client) => {
    await client.query("update documents set deleted_at = now(), deleted_by = $2 where id = $1", [id, user.id]);
    for (const assetId of await assetIdsFor(client, ownerType, ownerId)) {
      await lifecycleEvent({ assetId, eventType: "DOCUMENT_REMOVED", user, refType: "document", refId: id, remarks: `Removed: ${document.title} (kept in the archive)` }, client);
    }
    await audit({ user, action: "DOCUMENT_REMOVED", entity: "document", entityId: id, diff: { title: document.title, doc_type: document.doc_type }, ip }, client);
    return { id, removed: true };
  });
}
