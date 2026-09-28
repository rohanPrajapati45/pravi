import { Router } from "express";
import { z } from "zod";
import { getAuditLogs } from "../controllers/audit.controller.js";
import { getOrgUnit, getOrgUnits } from "../controllers/orgUnits.controller.js";
import { getMe, getUsers, postUser } from "../controllers/users.controller.js";
import { requireRole } from "../middleware/rbac.js";
import validate from "../middleware/validate.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
const roles = ["HQ", "EE", "AE", "CONTRACTOR"];
const uuid = z.string().uuid();
const optional = (schema) => schema.optional().or(z.literal("").transform(() => undefined));

router.get("/me", asyncHandler(getMe));

router.get(
  "/org-units",
  validate({ query: z.object({ type: optional(z.enum(["STATE", "CIRCLE", "DIVISION", "SUBDIVISION"])), parent_id: optional(uuid) }).passthrough() }),
  asyncHandler(getOrgUnits)
);
router.get("/org-units/:id", validate({ params: z.object({ id: uuid }) }), asyncHandler(getOrgUnit));

router.get(
  "/users",
  requireRole("HQ", "EE"),
  validate({ query: z.object({ role: optional(z.enum(roles)), org_unit_id: optional(uuid), q: optional(z.string().max(100)) }).passthrough() }),
  asyncHandler(getUsers)
);
router.post(
  "/users",
  requireRole("HQ"),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(72),
      phone: z.string().trim().max(20).optional(),
      role: z.enum(roles),
      designation: z.string().trim().max(120).optional(),
      org_unit_id: uuid,
      contractor_id: uuid.optional()
    })
  }),
  asyncHandler(postUser)
);

router.get(
  "/audit-logs",
  requireRole("HQ", "EE"),
  validate({ query: z.object({ entity: optional(z.string().max(50)), entity_id: optional(z.string().max(64)), action: optional(z.string().max(50)) }).passthrough() }),
  asyncHandler(getAuditLogs)
);

export default router;
