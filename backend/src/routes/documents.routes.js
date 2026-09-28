import { Router } from "express";
import { z } from "zod";
import validate from "../middleware/validate.js";
import { createDocument, deleteDocument, DOC_TYPES, listDocuments, signUpload } from "../services/documents.service.js";
import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPES } from "../services/storage.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";

const router = Router();
const uuid = z.string().uuid();
const owner = { owner_type: z.enum(["asset", "work"]), owner_id: uuid };
const file = {
  file_name: z.string().trim().min(1).max(200),
  content_type: z.enum(Object.keys(DOCUMENT_TYPES)),
  size_bytes: z.coerce.number().int().positive().max(DOCUMENT_MAX_BYTES, "Files up to 20 MB")
};

router.post(
  "/documents/sign",
  validate({ body: z.object({ ...owner, ...file }) }),
  asyncHandler(async (request, response) => created(response, await signUpload(request.user, request.valid.body)))
);

router.post(
  "/documents",
  validate({
    body: z.object({
      ...owner,
      doc_type: z.enum(DOC_TYPES),
      title: z.string().trim().min(3).max(160),
      description: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().max(1000).optional()),
      path: z.string().max(400),
      file_name: file.file_name,
      mime_type: file.content_type,
      size_bytes: file.size_bytes
    })
  }),
  asyncHandler(async (request, response) => created(response, await createDocument(request.user, request.valid.body, request.ip)))
);

router.get(
  "/documents",
  validate({ query: z.object({ asset_id: uuid.optional(), work_id: uuid.optional() }).passthrough().refine((value) => Boolean(value.asset_id) !== Boolean(value.work_id), "Pass exactly one of asset_id or work_id") }),
  asyncHandler(async (request, response) => ok(response, await listDocuments(request.user, request.valid.query)))
);

router.delete("/documents/:id", validate({ params: z.object({ id: uuid }) }), asyncHandler(async (request, response) => ok(response, await deleteDocument(request.user, request.valid.params.id, request.ip))));

export default router;
