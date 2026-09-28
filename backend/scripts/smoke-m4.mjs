// M4 API smoke test: node --experimental-websocket scripts/smoke-m4.mjs (backend must be running)
import { call, check, login, summary } from "./_client.mjs";

const ee = await login("ee.ahmedabad@gujinfra.example");
const kiran = await login("ae.daskroi@gujinfra.example");
const nisha = await login("ae.sanand@gujinfra.example");
const aarav = await login("contractor.aarav@gujinfra.example");
const kaveri = await login("contractor.kaveri@gujinfra.example");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
async function afterPhoto(token, requestId) {
  const sign = await call(token, "/uploads/sign", { method: "POST", body: { purpose: "maintenance", owner_id: requestId, content_type: "image/png" } });
  await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/upload/sign/evidence/${sign.body.data.path}?token=${sign.body.data.token}`, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: png
  });
  return sign.body.data.path;
}
const act = (token, id, action, body = {}) => call(token, `/maintenance-requests/${id}/${action}`, { method: "POST", body });

const users = (await call(ee, "/users?limit=50")).body.data;
const kiranId = users.find((u) => u.email === "ae.daskroi@gujinfra.example").id;
const aaravId = users.find((u) => u.email === "contractor.aarav@gujinfra.example").id;
const types = Object.fromEntries((await call(ee, "/asset-types")).body.data.map((type) => [type.code, type.id]));
const das = (await call(ee, "/org-units?type=SUBDIVISION")).body.data.find((unit) => unit.code === "SUB-DAS");
const stamp = Date.now().toString().slice(-5);

const asset = (
  await call(ee, "/assets", {
    method: "POST",
    body: { type_id: types.CULVERT, org_unit_id: das.id, name: `M4 Smoke Culvert ${stamp}`, condition_rating: 4, attributes: { culvert_type: "Pipe" } }
  })
).body.data;
const raised = await call(kiran, "/inspections", { method: "POST", body: { asset_id: asset.id, condition_rating: 2, severity: "MEDIUM", defects: ["Silting"] } });
const requestId = raised.body.data.maintenance_request.id;
check("Inspection raised request (OPEN)", !!requestId, raised.body.data.maintenance_request.request_code);

check("AE cannot assign -> 403", (await act(kiran, requestId, "assign", { assigned_to: kiranId })).status === 403);
check("Verify while OPEN -> 409", (await act(ee, requestId, "verify", { verified_condition: 4 })).status === 409);

const assigned = await act(ee, requestId, "assign", { assigned_to: kiranId, due_date: "2026-10-05" });
check("EE assigns to AE Daskroi -> ASSIGNED", assigned.body.data?.status === "ASSIGNED");

check("Another AE cannot start it (not assignee / out of scope)", (await act(nisha, requestId, "start")).status === 403);
const started = await act(kiran, requestId, "start");
check("Assignee starts -> IN_PROGRESS", started.body.data?.status === "IN_PROGRESS");
check("Asset automatically UNDER_MAINTENANCE", (await call(ee, `/assets/${asset.id}`)).body.data.lifecycle_status === "UNDER_MAINTENANCE");

check("Complete without after-photo -> 400", (await act(kiran, requestId, "complete", { remarks: "Done", after_photo_paths: [] })).status === 400);
const photo1 = await afterPhoto(kiran, requestId);
const done1 = await act(kiran, requestId, "complete", { remarks: "Silt cleared", after_photo_paths: [photo1] });
check("Assignee completes with photo -> COMPLETED", done1.body.data?.status === "COMPLETED");

const selfVerify = await act(kiran, requestId, "verify", { verified_condition: 5 });
check("Doer cannot verify own work -> 403", selfVerify.status === 403, selfVerify.body.error?.message);

const rejected = await act(ee, requestId, "reject", { remarks: "Outlet still blocked" });
check("EE rejects verification -> back to IN_PROGRESS", rejected.body.data?.status === "IN_PROGRESS");
const photo2 = await afterPhoto(kiran, requestId);
await act(kiran, requestId, "complete", { remarks: "Outlet cleared too", after_photo_paths: [photo2] });

const before = (await call(ee, `/assets/${asset.id}/360`)).body.data;
const verified = await act(ee, requestId, "verify", { verified_condition: 4, remarks: "Checked on site" });
check("Independent EE verifies -> VERIFIED", verified.body.data?.status === "VERIFIED");
const after = (await call(ee, `/assets/${asset.id}/360`)).body.data;
check("Asset back to OPERATIONAL with new condition 4", after.lifecycle_status === "OPERATIONAL" && after.condition_rating === 4);
check("Risk recomputed down", after.risk_score < before.risk_score, `${before.risk_score} → ${after.risk_score}`);

check("AE cannot close -> 403", (await act(kiran, requestId, "close", { actual_cost: 45000 })).status === 403);
const closed = await act(ee, requestId, "close", { actual_cost: 45000 });
check("EE closes with actual cost -> CLOSED", closed.body.data?.status === "CLOSED");
check("Close again -> 409", (await act(ee, requestId, "close", { actual_cost: 1 })).status === 409);

const detail = (await call(ee, `/maintenance-requests/${requestId}`)).body.data;
const actions = detail.history.map((h) => h.action);
check("Request history has every step", ["MAINTENANCE_ASSIGNED", "MAINTENANCE_STARTED", "MAINTENANCE_COMPLETED", "MAINTENANCE_REJECTED", "MAINTENANCE_VERIFIED", "MAINTENANCE_CLOSED"].every((a) => actions.includes(a)), actions.join(" → "));
check("After-photos returned as signed URLs", detail.after_photos.length === 1 && !!detail.after_photos[0].url);
const events = (await call(ee, `/assets/${asset.id}/timeline`)).body.data.map((e) => e.event_type);
check("Asset 360 timeline shows the whole chain", ["MAINTENANCE_RAISED", "MAINTENANCE_STARTED", "STATUS_CHANGED", "MAINTENANCE_VERIFIED", "MAINTENANCE_CLOSED"].every((e) => events.includes(e)));

// Contractor path + scoping.
const manual = await call(ee, "/maintenance-requests", { method: "POST", body: { asset_id: asset.id, title: "Repaint headwall (smoke)", severity: "LOW" } });
const manualId = manual.body.data.id;
check("Manual request created -> 201", manual.status === 201);
await act(ee, manualId, "assign", { assigned_to: aaravId });
const aaravList = (await call(aarav, "/maintenance-requests?mine=true")).body.data;
check("Contractor sees the job assigned to them", aaravList.some((r) => r.id === manualId));
check("Other contractor cannot open it -> 403", (await call(kaveri, `/maintenance-requests/${manualId}`)).status === 403);
await act(aarav, manualId, "start");
check("Cancel IN_PROGRESS -> 409", (await act(ee, manualId, "cancel", { remarks: "no longer needed" })).status === 409);
const cPhoto = await afterPhoto(aarav, manualId);
const cDone = await act(aarav, manualId, "complete", { remarks: "Painted", after_photo_paths: [cPhoto] });
check("Contractor completes with photo", cDone.body.data?.status === "COMPLETED");
const aeVerify = await act(kiran, manualId, "verify", { verified_condition: 4 });
check("AE (not the doer) verifies contractor work", aeVerify.body.data?.status === "VERIFIED");

const summaryData = (await call(ee, "/maintenance-requests/summary")).body.data;
check("Summary counts by status", typeof summaryData.by_status === "object", JSON.stringify(summaryData));

summary("M4");
