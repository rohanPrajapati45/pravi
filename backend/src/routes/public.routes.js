import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "../middleware/rateLimiter.js";
import validate from "../middleware/validate.js";
import { CATEGORIES, intakeComplaint, trackComplaint } from "../services/complaints.service.js";
import { receiveGrievance } from "../services/integrations.service.js";
import { signUpload } from "../services/storage.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";

// No login here: citizens and external portals. Every route is rate-limited and returns only what the caller needs.
const router = Router();
const opt = (schema) => z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());
const phone = z.string().trim().regex(/^[+\d][\d\s-]{7,15}$/, "Enter a valid phone number");

router.post(
  "/public/complaints/photo",
  rateLimit({ name: "complaint-photo", windowMs: 10 * 60_000, max: 12 }),
  validate({ body: z.object({ content_type: z.enum(["image/jpeg", "image/png", "image/webp"]) }) }),
  asyncHandler(async (request, response) => created(response, await signUpload({ purpose: "complaint", ownerId: randomUUID(), contentType: request.valid.body.content_type })))
);

router.post(
  "/public/complaints",
  rateLimit({ name: "complaint", windowMs: 10 * 60_000, max: 10 }),
  validate({
    body: z
      .object({
        category: z.enum(CATEGORIES),
        description: z.string().trim().min(10, "Describe the problem in a sentence or two").max(2000),
        location_text: opt(z.string().trim().max(300)),
        lat: opt(z.coerce.number().min(20).max(25)),
        lng: opt(z.coerce.number().min(68).max(75)),
        asset_code: opt(z.string().trim().max(40)),
        citizen_name: opt(z.string().trim().max(120)),
        citizen_phone: opt(phone),
        photo_paths: z.array(z.string().max(300)).max(3).default([])
      })
      .refine((body) => (body.lat != null && body.lng != null) || body.location_text || body.asset_code, {
        message: "Share your location, describe where it is, or enter the asset code on the board",
        path: ["location_text"]
      })
  }),
  asyncHandler(async (request, response) => {
    const complaint = await intakeComplaint(request.valid.body);
    created(response, {
      complaint_code: complaint.complaint_code,
      status: complaint.status,
      routed: Boolean(complaint.org_unit_id),
      duplicate_of: complaint.duplicate_of_code
    });
  })
);

router.get(
  "/public/complaints/:code",
  rateLimit({ name: "complaint-track", windowMs: 60_000, max: 30 }),
  validate({
    params: z.object({ code: z.string().trim().max(30) }),
    query: z.object({ phone: opt(z.string().trim().regex(/^\d{4}$/, "Last 4 digits")) }).passthrough()
  }),
  asyncHandler(async (request, response) => ok(response, await trackComplaint(request.valid.params.code, request.valid.query.phone)))
);

// Grievance portals push complaints here, authenticated by a shared key (INTEGRATION_API_KEY).
router.post(
  "/integrations/:adapter/complaints",
  rateLimit({ name: "integration", windowMs: 60_000, max: 60 }),
  validate({
    params: z.object({ adapter: z.string().max(20) }),
    body: z.object({
      reference: z.string().trim().min(3).max(60),
      category: opt(z.string().trim().max(80)),
      description: z.string().trim().min(5).max(2000),
      location: opt(z.string().trim().max(300)),
      lat: opt(z.coerce.number().min(20).max(25)),
      lng: opt(z.coerce.number().min(68).max(75)),
      name: opt(z.string().trim().max(120)),
      phone: opt(z.string().trim().max(20)),
      asset_code: opt(z.string().trim().max(40))
    })
  }),
  asyncHandler(async (request, response) => {
    const result = await receiveGrievance(request.valid.params.adapter, request.get("x-integration-key"), request.valid.body);
    if (result.duplicate) ok(response, result);
    else created(response, result);
  })
);

export default router;
