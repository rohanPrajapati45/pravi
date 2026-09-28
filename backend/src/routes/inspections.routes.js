import { Router } from "express";
import { z } from "zod";
import { getScopedAsset, listAssets } from "../services/assets.service.js";
import {
  conditionHistory,
  getInspection,
  listAssetRequests,
  listInspections,
  reviewInspection,
  submitInspection
} from "../services/inspections.service.js";
import { getScopedRequest } from "../services/maintenance.service.js";
import { signUpload } from "../services/storage.service.js";
import { getScopedTask } from "../services/works.service.js";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import asyncHandler from "../utils/asyncHandler.js";
import { created, ok, pageMeta, parsePagination } from "../utils/response.js";

const router = Router();
const uuid = z.string().uuid();
const idParams = { params: z.object({ id: uuid }) };
const opt = (schema) => z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

router.post(
  "/uploads/sign",
  requireRole("HQ", "EE", "AE", "CONTRACTOR"),
  validate({
    body: z.object({
      purpose: z.enum(["inspection", "maintenance", "progress"]),
      owner_id: uuid,
      content_type: z.enum(["image/jpeg", "image/png", "image/webp"])
    })
  }),
  asyncHandler(async (request, response) => {
    const { purpose, owner_id, content_type } = request.valid.body;
    // Owner = asset for inspections, request for maintenance; scope is checked before a token is issued.
    if (purpose === "inspection") await getScopedAsset(request.user, owner_id);
    if (purpose === "maintenance") await getScopedRequest(request.user, owner_id);
    if (purpose === "progress") await getScopedTask(request.user, owner_id);
    created(response, await signUpload({ purpose, ownerId: owner_id, contentType: content_type }));
  })
);

router.post(
  "/inspections",
  requireRole("EE", "AE"),
  validate({
    body: z.object({
      asset_id: uuid,
      type: z.enum(["ROUTINE", "PRE_MONSOON", "POST_MONSOON", "SPECIAL", "POST_EMERGENCY"]).default("ROUTINE"),
      condition_rating: z.coerce.number().int().min(1).max(5),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
      defects: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
      remarks: opt(z.string().trim().max(2000)),
      recommendation: opt(z.string().trim().max(1000)),
      lat: opt(z.coerce.number().min(-90).max(90)),
      lng: opt(z.coerce.number().min(-180).max(180)),
      gps_accuracy_m: opt(z.coerce.number().nonnegative()),
      photo_paths: z.array(z.string().max(300)).max(6).default([])
    })
  }),
  asyncHandler(async (request, response) => created(response, await submitInspection(request.user, request.valid.body, request.ip)))
);

router.get(
  "/inspections",
  validate({
    query: z
      .object({
        asset_id: opt(uuid),
        mine: opt(z.enum(["true", "false"]).transform((value) => value === "true")),
        severity: opt(z.enum(["LOW", "MEDIUM", "HIGH"]))
      })
      .passthrough()
  }),
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query);
    const { rows, total } = await listInspections(request.user, request.valid.query, pagination);
    ok(response, rows, pageMeta(pagination, total));
  })
);

router.get(
  "/inspections/overdue",
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query);
    const { rows, total } = await listAssets(request.user, { overdue: true, sort: "due" }, pagination);
    ok(response, rows, pageMeta(pagination, total));
  })
);

router.get("/inspections/:id", validate(idParams), asyncHandler(async (request, response) => ok(response, await getInspection(request.user, request.valid.params.id))));

router.post(
  "/inspections/:id/review",
  requireRole("HQ", "EE"),
  validate({ ...idParams, body: z.object({ remarks: opt(z.string().trim().max(1000)) }) }),
  asyncHandler(async (request, response) => ok(response, await reviewInspection(request.user, request.valid.params.id, request.valid.body, request.ip)))
);

router.get("/assets/:id/condition-history", validate(idParams), asyncHandler(async (request, response) => ok(response, await conditionHistory(request.user, request.valid.params.id))));
router.get("/assets/:id/maintenance", validate(idParams), asyncHandler(async (request, response) => ok(response, await listAssetRequests(request.user, request.valid.params.id))));

export default router;
