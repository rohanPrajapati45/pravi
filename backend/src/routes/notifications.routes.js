import { Router } from "express";
import { z } from "zod";
import validate from "../middleware/validate.js";
import { listNotifications, markAllRead, markRead, unreadNotifications } from "../services/notifications.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ok, pageMeta, parsePagination } from "../utils/response.js";

const router = Router();

router.get(
  "/notifications",
  validate({ query: z.object({ unread: z.enum(["true", "false"]).optional() }).passthrough() }),
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query, { defaultLimit: 10, maxLimit: 50 });
    const { rows, total, unread } = await listNotifications(request.user, { unread: request.valid.query.unread === "true" }, pagination);
    ok(response, rows, { ...pageMeta(pagination, total), unread });
  })
);
router.get("/notifications/count", asyncHandler(async (request, response) => ok(response, await unreadNotifications(request.user))));
router.post("/notifications/read-all", asyncHandler(async (request, response) => ok(response, await markAllRead(request.user))));
router.post(
  "/notifications/:id/read",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (request, response) => ok(response, await markRead(request.user, request.valid.params.id)))
);

export default router;
