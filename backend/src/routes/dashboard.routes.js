import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import { conditionDistribution, dashboardSummary, priorityAssets, recomputeAllRisk } from "../services/dashboard.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";

const router = Router();

router.get("/dashboard/summary", asyncHandler(async (request, response) => ok(response, await dashboardSummary(request.user))));
router.get(
  "/dashboard/priority-assets",
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).passthrough() }),
  asyncHandler(async (request, response) => ok(response, await priorityAssets(request.user, request.valid.query.limit)))
);
router.get("/dashboard/condition-distribution", asyncHandler(async (request, response) => ok(response, await conditionDistribution(request.user))));
router.post("/risk/recompute", requireRole("HQ"), asyncHandler(async (request, response) => ok(response, await recomputeAllRisk(request.user, request.ip))));

export default router;
