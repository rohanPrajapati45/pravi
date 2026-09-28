import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import { closeEmergency, declareEmergency, getEmergencyDetail, listEmergencies, reportDamage, restoreAsset, startEmergencyWork } from "../services/emergencies.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";

const router = Router();
const uuid = z.string().uuid();
const idParams = { params: z.object({ id: uuid }) };
const recordParams = { params: z.object({ id: uuid, recordId: uuid }) };
const opt = (schema) => z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

router.get(
  "/emergencies",
  validate({ query: z.object({ status: opt(z.enum(["ACTIVE", "CLOSED"])) }).passthrough() }),
  asyncHandler(async (request, response) => ok(response, await listEmergencies(request.user, request.valid.query)))
);
router.post(
  "/emergencies",
  requireRole("HQ", "EE"),
  validate({
    body: z.object({
      title: z.string().trim().min(5).max(200),
      kind: z.enum(["FLOOD", "HEAVY_RAIN", "CYCLONE", "EARTHQUAKE", "STRUCTURAL_FAILURE", "ACCIDENT", "OTHER"]),
      description: opt(z.string().trim().max(2000)),
      org_unit_id: uuid
    })
  }),
  asyncHandler(async (request, response) => created(response, await declareEmergency(request.user, request.valid.body, request.ip)))
);
router.get("/emergencies/:id", validate(idParams), asyncHandler(async (request, response) => ok(response, await getEmergencyDetail(request.user, request.valid.params.id))));
router.post(
  "/emergencies/:id/assets",
  requireRole("HQ", "EE", "AE"),
  validate({
    ...idParams,
    body: z.object({
      asset_id: uuid,
      damage: z.string().trim().min(5).max(1000),
      severity: z.enum(["MINOR", "MAJOR", "SEVERE"]),
      traffic_status: z.enum(["OPEN", "RESTRICTED", "CLOSED"]),
      photo_paths: z.array(z.string().max(300)).max(6).default([])
    })
  }),
  asyncHandler(async (request, response) => created(response, await reportDamage(request.user, request.valid.params.id, request.valid.body, request.ip)))
);
router.post(
  "/emergencies/:id/assets/:recordId/restore",
  requireRole("HQ", "EE", "AE"),
  validate({ ...recordParams, body: z.object({ remarks: z.string().trim().min(3, "Say what was done to make it safe").max(1000) }) }),
  asyncHandler(async (request, response) => ok(response, await restoreAsset(request.user, request.valid.params.id, request.valid.params.recordId, request.valid.body, request.ip)))
);
router.post(
  "/emergencies/:id/assets/:recordId/work",
  requireRole("HQ", "EE"),
  validate({ ...recordParams, body: z.object({ estimated_cost: z.coerce.number().positive().max(1e12) }) }),
  asyncHandler(async (request, response) => created(response, await startEmergencyWork(request.user, request.valid.params.id, request.valid.params.recordId, request.valid.body, request.ip)))
);
router.post(
  "/emergencies/:id/close",
  requireRole("HQ", "EE"),
  validate({ ...idParams, body: z.object({ remarks: opt(z.string().trim().max(1000)) }) }),
  asyncHandler(async (request, response) => ok(response, await closeEmergency(request.user, request.valid.params.id, request.valid.body, request.ip)))
);

export default router;
