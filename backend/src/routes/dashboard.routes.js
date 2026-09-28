import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import { conditionDistribution, dashboardSummary, priorityAssets, recomputeAllRisk } from "../services/dashboard.service.js";
import { listActivity, unreadCount } from "../services/activity.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ok, pageMeta, parsePagination } from "../utils/response.js";

const router = Router();

router.get("/dashboard/summary", asyncHandler(async (request, response) => ok(response, await dashboardSummary(request.user))));
router.get(
  "/dashboard/priority-assets",
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).passthrough() }),
  asyncHandler(async (request, response) => ok(response, await priorityAssets(request.user, request.valid.query.limit)))
);
router.get("/dashboard/condition-distribution", asyncHandler(async (request, response) => ok(response, await conditionDistribution(request.user))));
router.post("/risk/recompute", requireRole("HQ"), asyncHandler(async (request, response) => ok(response, await recomputeAllRisk(request.user, request.ip))));

const since = z.preprocess((value) => (value === "" ? undefined : value), z.string().datetime({ offset: true }).optional());
router.get(
  "/activity",
  validate({ query: z.object({ scope: z.enum(["all", "for_me", "by_me"]).default("all"), since }).passthrough() }),
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query, { defaultLimit: 30 });
    const { rows, total } = await listActivity(request.user, { ...request.valid.query, ...pagination });
    ok(response, rows, pageMeta(pagination, total));
  })
);
router.get(
  "/activity/unread",
  validate({ query: z.object({ since }).passthrough() }),
  asyncHandler(async (request, response) => ok(response, await unreadCount(request.user, request.valid.query.since)))
);

export default router;
