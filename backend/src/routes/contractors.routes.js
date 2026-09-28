import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import { contractorDetail, dlpAssets, dlpSummary, listContractorPerformance } from "../services/contractors.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ok, pageMeta, parsePagination } from "../utils/response.js";

const router = Router();
const uuid = z.string().uuid();
const opt = (schema) => z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const dlpQuery = z
  .object({
    bucket: z.enum(["active", "expiring", "expired"]).default("active"),
    days: z.coerce.number().int().min(1).max(365).default(30),
    q: opt(z.string().trim().max(100)),
    contractor_id: opt(uuid)
  })
  .passthrough();

router.get("/dlp/summary", asyncHandler(async (request, response) => ok(response, await dlpSummary(request.user))));
router.get(
  "/dlp/assets",
  validate({ query: dlpQuery }),
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query, { defaultLimit: 25 });
    const { rows, total } = await dlpAssets(request.user, request.valid.query, pagination);
    ok(response, rows, pageMeta(pagination, total));
  })
);
// PRD alias: assets whose DLP ends within `days` (default 30).
router.get(
  "/dlp/expiring",
  validate({ query: dlpQuery }),
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query, { defaultLimit: 25 });
    const { rows, total } = await dlpAssets(request.user, { ...request.valid.query, bucket: "expiring" }, pagination);
    ok(response, rows, pageMeta(pagination, total));
  })
);

router.get("/contractors/performance", requireRole("HQ", "EE", "CONTRACTOR"), asyncHandler(async (request, response) => ok(response, await listContractorPerformance(request.user))));
router.get(
  "/contractors/:id/performance",
  requireRole("HQ", "EE", "CONTRACTOR"),
  validate({ params: z.object({ id: uuid }) }),
  asyncHandler(async (request, response) => ok(response, await contractorDetail(request.user, request.valid.params.id)))
);

export default router;
