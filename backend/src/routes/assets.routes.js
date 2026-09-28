import { Router } from "express";
import { z } from "zod";
import {
  getAsset,
  getAssetChildren,
  getAssetDetail360,
  getAssets,
  getAssetTimeline,
  getAssetTypes,
  getLookup,
  patchAsset,
  postAsset,
  postAssetStatus
} from "../controllers/assets.controller.js";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

const uuid = z.string().uuid();
const blankToUndefined = (value) => (value === "" || value === null ? undefined : value);
const opt = (schema) => z.preprocess(blankToUndefined, schema.optional());
const statuses = ["PLANNED", "UNDER_CONSTRUCTION", "OPERATIONAL", "UNDER_MAINTENANCE", "UNDER_REHABILITATION", "CLOSED_TEMPORARILY", "RETIRED"];
const rating = z.coerce.number().int().min(1).max(5);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const idParams = { params: z.object({ id: uuid }) };

const listQuery = z
  .object({
    q: opt(z.string().trim().max(100)),
    type_id: opt(uuid),
    category: opt(z.string().max(30)),
    district: opt(z.string().max(60)),
    org_unit_id: opt(uuid),
    status: opt(z.enum(statuses)),
    condition: opt(rating),
    risk_band: opt(z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])),
    parent_id: opt(uuid),
    top_level: opt(z.enum(["true", "false"]).transform((value) => value === "true")),
    overdue: opt(z.enum(["true", "false"]).transform((value) => value === "true")),
    in_dlp: opt(z.enum(["true", "false"]).transform((value) => value === "true")),
    sort: opt(z.enum(["risk", "code", "name", "condition", "due", "updated"]))
  })
  .passthrough();

const editable = {
  name: z.string().trim().min(3).max(200),
  attributes: z.record(z.string(), z.unknown()),
  lat: z.coerce.number().min(-90).max(90).nullable(),
  lng: z.coerce.number().min(-180).max(180).nullable(),
  criticality: rating,
  traffic_level: rating,
  original_cost: z.coerce.number().nonnegative().nullable(),
  commissioned_on: isoDate.nullable(),
  design_life_years: z.coerce.number().int().min(1).max(200),
  road_code: z.string().trim().max(40).nullable(),
  start_chainage_km: z.coerce.number().nonnegative().nullable(),
  end_chainage_km: z.coerce.number().nonnegative().nullable(),
  taluka: z.string().trim().max(80)
};

const createBody = z.object({
  type_id: uuid,
  org_unit_id: uuid,
  parent_id: opt(uuid),
  lifecycle_status: opt(z.enum(["PLANNED", "UNDER_CONSTRUCTION", "OPERATIONAL"])),
  condition_rating: opt(rating),
  name: editable.name,
  attributes: editable.attributes.optional(),
  lat: opt(editable.lat),
  lng: opt(editable.lng),
  criticality: opt(rating),
  traffic_level: opt(rating),
  original_cost: opt(editable.original_cost),
  commissioned_on: opt(isoDate),
  design_life_years: opt(editable.design_life_years),
  road_code: opt(editable.road_code),
  start_chainage_km: opt(editable.start_chainage_km),
  end_chainage_km: opt(editable.end_chainage_km),
  taluka: opt(editable.taluka)
});

const updateBody = z
  .object(Object.fromEntries(Object.entries(editable).map(([key, schema]) => [key, schema.optional()])))
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update");

router.get("/asset-types", asyncHandler(getAssetTypes));
router.get("/assets", validate({ query: listQuery }), asyncHandler(getAssets));
router.get("/assets/lookup", validate({ query: z.object({ code: z.string().trim().min(3).max(64) }) }), asyncHandler(getLookup));
router.get("/assets/:id", validate(idParams), asyncHandler(getAsset));
router.get("/assets/:id/360", validate(idParams), asyncHandler(getAssetDetail360));
router.get("/assets/:id/timeline", validate(idParams), asyncHandler(getAssetTimeline));
router.get("/assets/:id/children", validate(idParams), asyncHandler(getAssetChildren));
router.post("/assets", requireRole("HQ", "EE", "AE"), validate({ body: createBody }), asyncHandler(postAsset));
router.patch("/assets/:id", requireRole("HQ", "EE", "AE"), validate({ ...idParams, body: updateBody }), asyncHandler(patchAsset));
router.post(
  "/assets/:id/status",
  requireRole("HQ", "EE"),
  validate({ ...idParams, body: z.object({ to: z.enum(statuses), remarks: opt(z.string().trim().max(1000)) }) }),
  asyncHandler(postAssetStatus)
);

export default router;
