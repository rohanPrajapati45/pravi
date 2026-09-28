import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import {
  CATEGORIES,
  acknowledgeComplaint,
  assetComplaints,
  getComplaintDetail,
  linkComplaintAsset,
  listComplaints,
  raiseComplaintRequest,
  rejectComplaint,
  resolveComplaint
} from "../services/complaints.service.js";
import { exportBillToPfms, exportGis, integrationStatus } from "../services/integrations.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ok, pageMeta, parsePagination } from "../utils/response.js";

const router = Router();
const uuid = z.string().uuid();
const idParams = { params: z.object({ id: uuid }) };
const opt = (schema) => z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());
const statuses = ["RECEIVED", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "REJECTED", "DUPLICATE"];
const officers = requireRole("HQ", "EE", "AE");

router.get(
  "/complaints",
  officers,
  validate({
    query: z
      .object({
        status: opt(z.string().transform((value) => value.split(",")).pipe(z.array(z.enum(statuses)))),
        category: opt(z.enum(CATEGORIES)),
        channel: opt(z.enum(["WEB", "CPGRAMS", "SWAGAT", "HELPLINE"])),
        asset_id: opt(uuid),
        unrouted: opt(z.enum(["true", "false"]).transform((value) => value === "true")),
        q: opt(z.string().trim().max(100))
      })
      .passthrough()
  }),
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query);
    const { rows, total, by_status } = await listComplaints(request.user, request.valid.query, pagination);
    ok(response, rows, { ...pageMeta(pagination, total), by_status });
  })
);
router.get("/complaints/:id", officers, validate(idParams), asyncHandler(async (request, response) => ok(response, await getComplaintDetail(request.user, request.valid.params.id))));
router.get("/assets/:id/complaints", validate(idParams), asyncHandler(async (request, response) => ok(response, await assetComplaints(request.user, request.valid.params.id))));

const action = (path, body, handler) =>
  router.post(
    `/complaints/:id/${path}`,
    officers,
    validate({ ...idParams, body }),
    asyncHandler(async (request, response) => ok(response, await handler(request.user, request.valid.params.id, request.valid.body, request.ip)))
  );
const note = z.string().trim().min(5, "Add a short note for the citizen").max(1000);
action("acknowledge", z.object({}).passthrough(), acknowledgeComplaint);
action("link-asset", z.object({ asset_id: uuid }), linkComplaintAsset);
action(
  "raise-request",
  z.object({ severity: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"), title: opt(z.string().trim().min(5).max(200)), request_id: opt(uuid) }),
  raiseComplaintRequest
);
action("resolve", z.object({ note }), resolveComplaint);
action("reject", z.object({ note }), rejectComplaint);

// Outbound adapters and their status.
router.get("/integrations/pfms/bills/:id", requireRole("HQ", "EE"), validate(idParams), asyncHandler(async (request, response) => ok(response, await exportBillToPfms(request.user, request.valid.params.id))));
router.get("/integrations/gis/assets.geojson", asyncHandler(async (request, response) => ok(response, await exportGis(request.user))));
router.get("/admin/integrations", requireRole("HQ"), asyncHandler(async (_request, response) => ok(response, await integrationStatus())));

export default router;
