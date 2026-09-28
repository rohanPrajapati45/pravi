import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import {
  adminCreateAssetType,
  adminCreateOrgUnit,
  adminListAssetTypes,
  adminListContractors,
  adminListUsers,
  adminOrgTree,
  adminResetPassword,
  adminSaveContractor,
  adminSetApprovalLimit,
  adminSystem,
  adminTemplateDetail,
  adminUpdateAssetType,
  adminUpdateOrgUnit,
  adminUpdateUser
} from "../services/admin.service.js";
import { listJobRuns, runDailyJobs } from "../services/jobs.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { created, ok, pageMeta, parsePagination } from "../utils/response.js";

const router = Router();
const uuid = z.string().uuid();
const idParams = { params: z.object({ id: uuid }) };
const opt = (schema) => z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
const roles = ["HQ", "EE", "AE", "CONTRACTOR"];
const code = z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only");

// Everything under /admin is for the HQ administrator only.
router.use("/admin", requireRole("HQ"));

router.get(
  "/admin/users",
  validate({
    query: z
      .object({
        q: opt(z.string().trim().max(100)),
        role: opt(z.enum(roles)),
        org_unit_id: opt(uuid),
        active: opt(z.enum(["true", "false"]).transform((value) => value === "true"))
      })
      .passthrough()
  }),
  asyncHandler(async (request, response) => {
    const pagination = parsePagination(request.query, { defaultLimit: 25 });
    const { rows, total } = await adminListUsers(request.valid.query, pagination);
    ok(response, rows, pageMeta(pagination, total));
  })
);
router.patch(
  "/admin/users/:id",
  validate({
    ...idParams,
    body: z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        phone: z.string().trim().max(20).nullable().optional(),
        designation: z.string().trim().max(120).nullable().optional(),
        role: z.enum(roles).optional(),
        org_unit_id: uuid.optional(),
        contractor_id: uuid.nullable().optional(),
        is_active: z.boolean().optional()
      })
      .strict()
  }),
  asyncHandler(async (request, response) => ok(response, await adminUpdateUser(request.user, request.valid.params.id, request.valid.body, request.ip)))
);
router.post(
  "/admin/users/:id/reset-password",
  validate({ ...idParams, body: z.object({ password: z.string().min(8, "At least 8 characters").max(72) }) }),
  asyncHandler(async (request, response) => ok(response, await adminResetPassword(request.user, request.valid.params.id, request.valid.body.password, request.ip)))
);

router.get("/admin/org-units", asyncHandler(async (_request, response) => ok(response, await adminOrgTree())));
router.post(
  "/admin/org-units",
  validate({
    body: z.object({
      type: z.enum(["CIRCLE", "DIVISION", "SUBDIVISION"]),
      name: z.string().trim().min(3).max(120),
      code: code.transform((value) => value.toUpperCase()),
      parent_id: uuid,
      district: opt(z.string().trim().max(60))
    })
  }),
  asyncHandler(async (request, response) => created(response, await adminCreateOrgUnit(request.user, request.valid.body, request.ip)))
);
router.patch(
  "/admin/org-units/:id",
  validate({ ...idParams, body: z.object({ name: z.string().trim().min(3).max(120).optional(), district: z.string().trim().max(60).optional() }).strict() }),
  asyncHandler(async (request, response) => ok(response, await adminUpdateOrgUnit(request.user, request.valid.params.id, request.valid.body, request.ip)))
);

const attributeField = z
  .object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Use snake_case keys"),
    label: z.string().trim().min(1).max(60),
    type: z.enum(["number", "text", "select", "boolean"]),
    unit: opt(z.string().trim().max(20)),
    options: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    required: z.boolean().optional()
  })
  .refine((field) => field.type !== "select" || (field.options?.length ?? 0) >= 2, "Select fields need at least two options");
const attributeSchema = z
  .array(attributeField)
  .max(20)
  .refine((fields) => new Set(fields.map((field) => field.key)).size === fields.length, "Field keys must be unique");
const categories = ["ROAD", "BRIDGE", "CULVERT", "BUILDING", "ELECTRICAL", "ROAD_FURNITURE", "EQUIPMENT", "OTHER"];

router.get("/admin/asset-types", asyncHandler(async (_request, response) => ok(response, await adminListAssetTypes())));
router.post(
  "/admin/asset-types",
  validate({
    body: z.object({
      code,
      name: z.string().trim().min(3).max(80),
      category: z.enum(categories),
      code_prefix: z.string().trim().regex(/^[A-Za-z]{2,3}$/, "2–3 letters"),
      attribute_schema: attributeSchema.default([]),
      inspection_interval_days: z.coerce.number().int().min(7).max(3650),
      design_life_years: z.coerce.number().int().min(1).max(200)
    })
  }),
  asyncHandler(async (request, response) => created(response, await adminCreateAssetType(request.user, request.valid.body, request.ip)))
);
router.patch(
  "/admin/asset-types/:id",
  validate({
    ...idParams,
    body: z
      .object({
        name: z.string().trim().min(3).max(80).optional(),
        attribute_schema: attributeSchema.optional(),
        inspection_interval_days: z.coerce.number().int().min(7).max(3650).optional(),
        design_life_years: z.coerce.number().int().min(1).max(200).optional(),
        is_active: z.boolean().optional()
      })
      .strict()
  }),
  asyncHandler(async (request, response) => ok(response, await adminUpdateAssetType(request.user, request.valid.params.id, request.valid.body, request.ip)))
);

router.put(
  "/admin/approval-limits",
  validate({ body: z.object({ role: z.enum(["EE", "HQ"]), max_amount: z.coerce.number().positive().max(1e12) }) }),
  asyncHandler(async (request, response) => ok(response, await adminSetApprovalLimit(request.user, request.valid.body, request.ip)))
);

const contractorBody = {
  name: z.string().trim().min(3).max(120),
  class: opt(z.string().trim().max(10)),
  contact_name: opt(z.string().trim().max(120)),
  contact_phone: opt(z.string().trim().max(20)),
  contact_email: opt(z.string().trim().email())
};
router.get("/admin/contractors", asyncHandler(async (_request, response) => ok(response, await adminListContractors())));
router.post(
  "/admin/contractors",
  validate({ body: z.object({ code, ...contractorBody }) }),
  asyncHandler(async (request, response) => created(response, await adminSaveContractor(request.user, null, request.valid.body, request.ip)))
);
router.patch(
  "/admin/contractors/:id",
  validate({
    ...idParams,
    body: z.object(Object.fromEntries(Object.entries({ ...contractorBody, is_active: z.boolean() }).map(([key, schema]) => [key, schema.optional()]))).strict()
  }),
  asyncHandler(async (request, response) => ok(response, await adminSaveContractor(request.user, request.valid.params.id, request.valid.body, request.ip)))
);

router.get("/admin/work-templates/:code", validate({ params: z.object({ code: z.string().max(40) }) }), asyncHandler(async (request, response) => ok(response, await adminTemplateDetail(request.valid.params.code))));
router.get("/admin/system", asyncHandler(async (_request, response) => ok(response, await adminSystem())));

router.get("/admin/jobs", asyncHandler(async (_request, response) => ok(response, await listJobRuns())));
router.post("/admin/jobs/daily/run", asyncHandler(async (request, response) => ok(response, await runDailyJobs({ trigger: "MANUAL", user: request.user }))));

export default router;
