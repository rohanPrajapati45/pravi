import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db.js";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import {
  assignTask,
  createProgramme,
  createWork,
  evaluateStage,
  getWorkJourney,
  listAssignees,
  listProgrammes,
  listTemplates,
  listWorks,
  myTasks,
  reviewTask,
  submitTask,
  whoHasFileList,
  worksPipeline
} from "../services/works.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { created, ok, pageMeta, parsePagination } from "../utils/response.js";

const router = Router();
const uuid = z.string().uuid();
const idParams = { params: z.object({ id: uuid }) };
const opt = (schema) => z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const money = z.coerce.number().positive().max(1e12);

router.get("/work-templates", asyncHandler(async (_request, response) => ok(response, await listTemplates())));
router.get("/approval-limits", asyncHandler(async (_request, response) => ok(response, (await query("select role, work_type, max_amount, label from approval_limits order by max_amount nulls last")).rows)));
router.get("/contractors", asyncHandler(async (_request, response) => ok(response, (await query("select id, code, name, class from contractors where is_active order by name")).rows)));

router.get("/programmes", asyncHandler(async (request, response) => ok(response, await listProgrammes(request.user))));
router.post(
  "/programmes",
  requireRole("HQ"),
  validate({
    body: z.object({
      code: z.string().trim().min(3).max(40),
      name: z.string().trim().min(5).max(200),
      description: opt(z.string().trim().max(2000)),
      financial_year: z.string().regex(/^\d{4}-\d{2}$/, "Use e.g. 2026-27"),
      budget_head: opt(z.string().trim().max(100)),
      allocated_amount: money
    })
  }),
  asyncHandler(async (request, response) => created(response, await createProgramme(request.user, request.valid.body, request.ip)))
);

router.get(
  "/works",
  validate({
    query: z
      .object({
        programme_id: opt(uuid),
        status: opt(z.string().max(30)),
        stage_code: opt(z.string().max(40)),
        template_code: opt(z.string().max(40)),
        q: opt(z.string().trim().max(100)),
        delayed: opt(z.enum(["true", "false"]).transform((value) => value === "true")),
        active: opt(z.enum(["true", "false"]).transform((value) => value === "true"))
      })
      .passthrough()
  }),
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query);
    const { rows, total } = await listWorks(request.user, request.valid.query, pagination);
    ok(response, rows, pageMeta(pagination, total));
  })
);
router.get("/works/pipeline", asyncHandler(async (request, response) => ok(response, await worksPipeline(request.user))));
router.get(
  "/works/who-has-file",
  asyncHandler(async (request, response) => ok(response, await whoHasFileList(request.user, parsePagination(request.query, { defaultLimit: 25, maxLimit: 50 }))))
);

router.post(
  "/works",
  requireRole("HQ", "EE"),
  validate({
    body: z.object({
      template_code: z.string().max(40),
      title: z.string().trim().min(5).max(200),
      description: opt(z.string().trim().max(2000)),
      objective: opt(z.string().trim().max(2000)),
      org_unit_id: uuid,
      programme_id: opt(uuid),
      initiation_type: z.enum(["PROGRAMME", "DIRECTIVE", "FIELD_NEED", "COMPLAINT", "EMERGENCY", "DEPOSIT_REQUEST"]),
      initiation_ref: opt(z.string().trim().max(120)),
      initiation_date: opt(isoDate),
      priority: opt(z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])),
      estimated_cost: money,
      target_start: opt(isoDate),
      target_end: opt(isoDate),
      target_asset_ids: z.array(uuid).max(20).optional(),
      planned_asset: z
        .object({
          name: z.string().trim().min(3).max(200),
          org_unit_id: uuid,
          road_code: opt(z.string().trim().max(40)),
          start_chainage_km: opt(z.coerce.number().nonnegative()),
          end_chainage_km: opt(z.coerce.number().nonnegative()),
          lat: opt(z.coerce.number().min(-90).max(90)),
          lng: opt(z.coerce.number().min(-180).max(180)),
          criticality: opt(z.coerce.number().int().min(1).max(5)),
          traffic_level: opt(z.coerce.number().int().min(1).max(5)),
          attributes: z.record(z.string(), z.unknown()).optional()
        })
        .optional()
    })
  }),
  asyncHandler(async (request, response) => created(response, await createWork(request.user, request.valid.body, request.ip)))
);

router.get("/works/:id", validate(idParams), asyncHandler(async (request, response) => ok(response, await getWorkJourney(request.user, request.valid.params.id))));
router.get("/works/:id/journey", validate(idParams), asyncHandler(async (request, response) => ok(response, await getWorkJourney(request.user, request.valid.params.id))));
router.get("/works/:id/assignees", requireRole("HQ", "EE"), validate(idParams), asyncHandler(async (request, response) => ok(response, await listAssignees(request.user, request.valid.params.id))));

router.get("/tasks/mine", asyncHandler(async (request, response) => ok(response, await myTasks(request.user))));
router.post(
  "/tasks/:id/assign",
  requireRole("HQ", "EE"),
  validate({ ...idParams, body: z.object({ assigned_to: uuid, due_date: opt(isoDate) }) }),
  asyncHandler(async (request, response) => ok(response, await assignTask(request.user, request.valid.params.id, request.valid.body, request.ip)))
);
router.post(
  "/tasks/:id/submit",
  validate({
    ...idParams,
    body: z.object({
      note: opt(z.string().trim().max(2000)),
      deliverables: z.array(z.object({ label: z.string().max(120), reference: z.string().trim().max(300) })).max(20).default([]),
      photo_paths: z.array(z.string().max(300)).max(6).default([]),
      progress_pct: opt(z.coerce.number().min(0).max(100))
    })
  }),
  asyncHandler(async (request, response) => ok(response, await submitTask(request.user, request.valid.params.id, request.valid.body, request.ip)))
);
router.post(
  "/tasks/:id/accept",
  requireRole("HQ", "EE"),
  validate({ ...idParams, body: z.object({ remarks: opt(z.string().trim().max(1000)) }) }),
  asyncHandler(async (request, response) => ok(response, await reviewTask(request.user, request.valid.params.id, "accept", request.valid.body, request.ip)))
);
router.post(
  "/tasks/:id/return",
  requireRole("HQ", "EE"),
  validate({ ...idParams, body: z.object({ remarks: z.string().trim().min(3).max(1000) }) }),
  asyncHandler(async (request, response) => ok(response, await reviewTask(request.user, request.valid.params.id, "return", request.valid.body, request.ip)))
);

router.post(
  "/work-stages/:id/evaluate",
  requireRole("HQ", "EE"),
  validate({
    ...idParams,
    body: z.object({
      outcome: z.enum(["PASSED", "PASSED_WITH_OBSERVATIONS", "RETURNED", "REJECTED"]),
      remarks: opt(z.string().trim().max(2000)),
      checklist: z.array(z.object({ item: z.string().max(200), ok: z.boolean() })).max(20).default([]),
      return_task_ids: z.array(uuid).max(20).default([]),
      data: z
        .object({
          technical_sanction_amount: opt(money),
          sanctioned_amount: opt(money),
          ts_ref: opt(z.string().trim().max(80)),
          aa_ref: opt(z.string().trim().max(80)),
          tender_ref: opt(z.string().trim().max(80)),
          contractor_id: opt(uuid),
          contract_value: opt(money),
          start_date: opt(isoDate),
          planned_end: opt(isoDate),
          dlp_months: opt(z.coerce.number().int().min(0).max(120)),
          completion_certificate_ref: opt(z.string().trim().max(80)),
          condition_after: opt(z.coerce.number().int().min(1).max(5))
        })
        .default({})
    })
  }),
  asyncHandler(async (request, response) => ok(response, await evaluateStage(request.user, request.valid.params.id, request.valid.body, request.ip)))
);

export default router;
