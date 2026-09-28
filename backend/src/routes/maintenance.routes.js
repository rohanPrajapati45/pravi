import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import {
  assignRequest,
  cancelRequest,
  closeRequest,
  completeRequest,
  createManualRequest,
  getRequestDetail,
  listAssignees,
  listRequests,
  rejectVerification,
  requestSummary,
  startRequest,
  verifyRequest
} from "../services/maintenance.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { created, ok, pageMeta, parsePagination } from "../utils/response.js";

const router = Router();
const uuid = z.string().uuid();
const idParams = { params: z.object({ id: uuid }) };
const opt = (schema) => z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());
const flag = opt(z.enum(["true", "false"]).transform((value) => value === "true"));
const remarks = z.string().trim().max(2000);
const statuses = ["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "VERIFIED", "CLOSED", "CANCELLED"];
const base = "/maintenance-requests";

router.get(
  base,
  validate({
    query: z
      .object({
        status: opt(z.string().transform((value) => value.split(",")).pipe(z.array(z.enum(statuses)))),
        severity: opt(z.enum(["LOW", "MEDIUM", "HIGH"])),
        asset_id: opt(uuid),
        mine: flag,
        overdue: flag,
        dlp_liable: flag,
        awaiting_me: flag,
        q: opt(z.string().trim().max(100))
      })
      .passthrough()
  }),
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query);
    const { rows, total } = await listRequests(request.user, request.valid.query, pagination);
    ok(response, rows, pageMeta(pagination, total));
  })
);

router.get(`${base}/summary`, asyncHandler(async (request, response) => ok(response, await requestSummary(request.user))));

router.post(
  base,
  requireRole("HQ", "EE", "AE"),
  validate({
    body: z.object({
      asset_id: uuid,
      title: z.string().trim().min(5).max(200),
      description: opt(z.string().trim().max(2000)),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"])
    })
  }),
  asyncHandler(async (request, response) => created(response, await createManualRequest(request.user, request.valid.body, request.ip)))
);

router.get(`${base}/:id`, validate(idParams), asyncHandler(async (request, response) => ok(response, await getRequestDetail(request.user, request.valid.params.id))));
router.get(`${base}/:id/assignees`, requireRole("HQ", "EE"), validate(idParams), asyncHandler(async (request, response) => ok(response, await listAssignees(request.user, request.valid.params.id))));

const action = (path, roles, body, handler) =>
  router.post(
    `${base}/:id/${path}`,
    requireRole(...roles),
    validate({ ...idParams, body }),
    asyncHandler(async (request, response) => ok(response, await handler(request.user, request.valid.params.id, request.valid.body, request.ip)))
  );

action(
  "assign",
  ["HQ", "EE"],
  z.object({ assigned_to: uuid, due_date: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)), estimated_cost: opt(z.coerce.number().nonnegative()) }),
  assignRequest
);
action("start", ["AE", "EE", "CONTRACTOR"], z.object({}).passthrough(), (user, id, _body, ip) => startRequest(user, id, ip));
action(
  "complete",
  ["AE", "EE", "CONTRACTOR"],
  z.object({ remarks: remarks.min(3), after_photo_paths: z.array(z.string().max(300)).min(1, "An after-photo is required").max(6) }),
  completeRequest
);
action("verify", ["AE", "EE"], z.object({ verified_condition: z.coerce.number().int().min(1).max(5), remarks: opt(remarks) }), verifyRequest);
action("reject", ["AE", "EE"], z.object({ remarks: remarks.min(3) }), rejectVerification);
action("close", ["HQ", "EE"], z.object({ actual_cost: z.coerce.number().nonnegative(), remarks: opt(remarks) }), closeRequest);
action("cancel", ["HQ", "EE"], z.object({ remarks: remarks.min(3) }), cancelRequest);

export default router;
