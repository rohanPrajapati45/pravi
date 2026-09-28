import { Router } from "express";
import { z } from "zod";
import validate from "../middleware/validate.js";
import {
  addBoqItem,
  approveBill,
  checkMeasurement,
  createBill,
  deleteBoqItem,
  getMeasurementBook,
  payBill,
  recordMeasurement,
  returnBill,
  updateBoqItem
} from "../services/measurement.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";

const router = Router();
const uuid = z.string().uuid();
const idParams = { params: z.object({ id: uuid }) };
const opt = (schema) => z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());
const dimension = opt(z.coerce.number().positive().max(1e6));
const remarks = z.string().trim().max(1000);

router.get("/works/:id/mb", validate(idParams), asyncHandler(async (request, response) => ok(response, await getMeasurementBook(request.user, request.valid.params.id))));

const boqItem = {
  item_no: z.string().trim().min(1).max(20),
  description: z.string().trim().min(3).max(500),
  unit: z.string().trim().min(1).max(20),
  quantity: z.coerce.number().positive().max(1e9),
  rate: z.coerce.number().nonnegative().max(1e9)
};
router.post("/works/:id/boq", validate({ ...idParams, body: z.object(boqItem) }), asyncHandler(async (request, response) => created(response, await addBoqItem(request.user, request.valid.params.id, request.valid.body, request.ip))));
router.patch(
  "/boq-items/:id",
  validate({ ...idParams, body: z.object(Object.fromEntries(Object.entries(boqItem).map(([key, schema]) => [key, schema.optional()]))).strict() }),
  asyncHandler(async (request, response) => ok(response, await updateBoqItem(request.user, request.valid.params.id, request.valid.body, request.ip)))
);
router.delete("/boq-items/:id", validate(idParams), asyncHandler(async (request, response) => ok(response, await deleteBoqItem(request.user, request.valid.params.id, request.ip))));

router.post(
  "/works/:id/measurements",
  validate({
    ...idParams,
    body: z.object({
      boq_item_id: uuid,
      measured_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
      location: opt(z.string().trim().max(200)),
      nos: z.coerce.number().positive().max(1e6).default(1),
      length: dimension,
      breadth: dimension,
      depth: dimension,
      quantity: dimension,
      remarks: opt(remarks)
    })
  }),
  asyncHandler(async (request, response) => created(response, await recordMeasurement(request.user, request.valid.params.id, request.valid.body, request.ip)))
);
router.post(
  "/measurements/:id/check",
  validate({ ...idParams, body: z.object({ decision: z.enum(["check", "reject"]), remarks: opt(remarks) }) }),
  asyncHandler(async (request, response) => ok(response, await checkMeasurement(request.user, request.valid.params.id, request.valid.body, request.ip)))
);

router.post("/works/:id/bills", validate({ ...idParams, body: z.object({ remarks: opt(remarks) }) }), asyncHandler(async (request, response) => created(response, await createBill(request.user, request.valid.params.id, request.valid.body, request.ip))));
router.post("/bills/:id/approve", validate({ ...idParams, body: z.object({ remarks: opt(remarks) }) }), asyncHandler(async (request, response) => ok(response, await approveBill(request.user, request.valid.params.id, request.valid.body, request.ip))));
router.post("/bills/:id/return", validate({ ...idParams, body: z.object({ remarks: remarks.min(3, "Say what needs correcting") }) }), asyncHandler(async (request, response) => ok(response, await returnBill(request.user, request.valid.params.id, request.valid.body, request.ip))));
router.post(
  "/bills/:id/pay",
  validate({ ...idParams, body: z.object({ payment_ref: z.string().trim().min(3, "Enter the treasury / PFMS payment reference").max(60) }) }),
  asyncHandler(async (request, response) => ok(response, await payBill(request.user, request.valid.params.id, request.valid.body, request.ip)))
);

export default router;
