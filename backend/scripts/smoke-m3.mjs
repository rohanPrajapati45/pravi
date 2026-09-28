// M3 API smoke test: node --experimental-websocket scripts/smoke-m3.mjs (backend must be running)
import { call, check, login, summary } from "./_client.mjs";

const ee = await login("ee.ahmedabad@gujinfra.example");
const ae = await login("ae.daskroi@gujinfra.example");
const aeSurat = await login("ae.olpad@gujinfra.example");
const hq = await login("hq@gujinfra.example");
const contractor = await login("contractor.aarav@gujinfra.example");

const types = Object.fromEntries((await call(ee, "/asset-types")).body.data.map((type) => [type.code, type.id]));
const das = (await call(ee, "/org-units?type=SUBDIVISION")).body.data.find((unit) => unit.code === "SUB-DAS");
const stamp = Date.now().toString().slice(-5);
const newCulvert = async (name) =>
  (
    await call(ee, "/assets", {
      method: "POST",
      body: { type_id: types.CULVERT, org_unit_id: das.id, name, condition_rating: 4, lat: 22.93, lng: 72.6, attributes: { culvert_type: "Box" } }
    })
  ).body.data;

const culvert = await newCulvert(`M3 Smoke Culvert ${stamp}`);

// Photo evidence via a signed upload URL (browser-style direct upload).
const sign = await call(ae, "/uploads/sign", { method: "POST", body: { purpose: "inspection", owner_id: culvert.id, content_type: "image/png" } });
check("Signed upload URL issued", sign.status === 201 && sign.body.data.path.startsWith(`inspection/${culvert.id}/`));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const upload = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/upload/sign/evidence/${sign.body.data.path}?token=${sign.body.data.token}`, {
  method: "PUT",
  headers: { "Content-Type": "image/png", "x-upsert": "false" },
  body: png
});
check("Photo uploaded directly to storage", upload.ok, `HTTP ${upload.status}`);

const good = await call(ae, "/inspections", {
  method: "POST",
  body: { asset_id: culvert.id, type: "ROUTINE", condition_rating: 4, severity: "LOW", lat: 22.9301, lng: 72.6002, photo_paths: [sign.body.data.path] }
});
check("Rating 4 inspection -> 201, NO maintenance request", good.status === 201 && good.body.data.maintenance_request === null, good.body.data?.inspection?.inspection_code);

const detail = await call(ee, `/inspections/${good.body.data.inspection.id}`);
const photoUrl = detail.body.data.photos?.[0]?.url;
const photoFetch = photoUrl ? await fetch(photoUrl) : null;
check("Inspection returns a working signed photo URL", photoFetch?.ok === true);

const before = (await call(ee, `/assets/${culvert.id}/360`)).body.data;
const poor = await call(ae, "/inspections", {
  method: "POST",
  body: { asset_id: culvert.id, type: "SPECIAL", condition_rating: 2, severity: "MEDIUM", defects: ["Silting", "Wing wall cracks"], remarks: "Smoke test", lat: 22.9301, lng: 72.6002 }
});
const mr = poor.body.data?.maintenance_request;
check("Rating 2 inspection -> maintenance request auto-created", poor.status === 201 && mr && !mr.linked_existing, mr?.request_code);
check("Not DLP-liable for a legacy asset", mr?.dlp_liable === false);

const after = (await call(ee, `/assets/${culvert.id}/360`)).body.data;
const today = new Date().toISOString().slice(0, 10);
check("Asset condition updated to 2", after.condition_rating === 2);
check("Last-inspected is today", after.last_inspected_at?.slice(0, 10) === today);
check("Next due = today + type interval (365d)", Math.round((new Date(after.next_inspection_due) - new Date(today)) / 86400000) === 365, after.next_inspection_due);
check("Risk recomputed upward", after.risk_score > before.risk_score, `${before.risk_score} → ${after.risk_score} (${after.risk_band})`);

const events = (await call(ee, `/assets/${culvert.id}/timeline`)).body.data.map((event) => event.event_type);
check("Timeline shows inspection + auto-raised request", events.includes("INSPECTION_RECORDED") && events.includes("MAINTENANCE_RAISED"), events.slice(0, 4).join(" → "));

const again = await call(ae, "/inspections", { method: "POST", body: { asset_id: culvert.id, condition_rating: 1, severity: "HIGH", defects: ["Scour at outlet"] } });
check("Second poor inspection links the open request (no duplicate)", again.body.data?.maintenance_request?.linked_existing === true);

const requests = (await call(ee, `/assets/${culvert.id}/maintenance`)).body.data;
check("Asset has exactly 1 maintenance request", requests.length === 1, requests[0]?.title);

const history = (await call(ee, `/assets/${culvert.id}/condition-history`)).body.data;
check("Condition history is chronological", history.length === 3 && history.map((h) => h.condition_rating).join(",") === "4,2,1");

// DLP: an asset inside its defect liability period flags the request as contractor-liable.
const dlpAsset = (await call(ee, "/assets?in_dlp=true&status=OPERATIONAL&limit=50")).body.data.find((row) => row.asset_code !== "RDB-BR-000001");
if (dlpAsset) {
  const dlpInspection = await call(ee, "/inspections", { method: "POST", body: { asset_id: dlpAsset.id, condition_rating: 2, severity: "HIGH", defects: ["Smoke test defect"] } });
  const dlpRequest = dlpInspection.body.data?.maintenance_request;
  check("Asset in DLP -> request marked DLP-liable", dlpRequest?.dlp_liable === true || dlpRequest?.linked_existing === true, `${dlpAsset.asset_code} ${dlpRequest?.request_code}`);
} else {
  check("An in-DLP asset exists in Ahmedabad for the DLP test", false);
}

const wrongPhoto = await call(ae, "/inspections", { method: "POST", body: { asset_id: culvert.id, condition_rating: 3, photo_paths: ["inspection/someone-else/x.png"] } });
check("Photo path from another record -> 400", wrongPhoto.status === 400);
const badRating = await call(ae, "/inspections", { method: "POST", body: { asset_id: culvert.id, condition_rating: 6 } });
check("Rating 6 -> 400", badRating.status === 400);
const outside = await call(aeSurat, "/inspections", { method: "POST", body: { asset_id: culvert.id, condition_rating: 3 } });
check("Surat AE cannot inspect a Daskroi asset -> 403", outside.status === 403);
const byContractor = await call(contractor, "/inspections", { method: "POST", body: { asset_id: culvert.id, condition_rating: 3 } });
check("Contractor cannot submit inspections -> 403", byContractor.status === 403);
const byHq = await call(hq, "/inspections", { method: "POST", body: { asset_id: culvert.id, condition_rating: 3 } });
check("HQ does not submit field inspections -> 403", byHq.status === 403);

const retiredAsset = await newCulvert(`M3 Retired Culvert ${stamp}`);
await call(ee, `/assets/${retiredAsset.id}/status`, { method: "POST", body: { to: "RETIRED", remarks: "Smoke test" } });
const retired = await call(ae, "/inspections", { method: "POST", body: { asset_id: retiredAsset.id, condition_rating: 3 } });
check("Inspecting a retired asset -> 409", retired.status === 409);

const selfReview = await call(ae, `/inspections/${good.body.data.inspection.id}/review`, { method: "POST", body: {} });
check("AE cannot review (role) -> 403", selfReview.status === 403);
const review = await call(ee, `/inspections/${good.body.data.inspection.id}/review`, { method: "POST", body: { remarks: "Checked" } });
check("EE reviews the inspection -> REVIEWED", review.body.data?.status === "REVIEWED");

const overdue = await call(ae, "/inspections/overdue");
check("Overdue list is scoped and sorted by due date", overdue.status === 200 && overdue.body.data.every((row) => row.org_unit_name === "Daskroi Sub-division"), `${overdue.body.meta.total} overdue in Daskroi`);

const heroHistory = (await call(hq, `/assets/${(await call(hq, "/assets/lookup?code=RDB-BR-000001")).body.data.id}/condition-history`)).body.data;
check("Hero bridge has seeded inspection history (only since commissioning)", heroHistory.length >= 3, heroHistory.map((h) => h.condition_rating).join(" → "));

summary("M3");
