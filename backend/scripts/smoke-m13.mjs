// M13 citizen complaints & integrations smoke test: node --experimental-websocket scripts/smoke-m13.mjs
// Files "Smoke" complaints near an Olpad asset (Surat division) and one unroutable one, and closes them all.
import { call, check, login, summary } from "./_client.mjs";

const hq = await login("hq@gujinfra.example");
const vikram = await login("ee.surat@gujinfra.example");
const rohit = await login("ee.ahmedabad@gujinfra.example");
const pooja = await login("ae.olpad@gujinfra.example");
const kiran = await login("ae.daskroi@gujinfra.example");
const aarav = await login("contractor.aarav@gujinfra.example");

// A structure (point asset) in Olpad, so the nearest-asset match is deterministic.
const geo = (await call(pooja, "/assets/geo?status=OPERATIONAL")).body.data.features;
const target = geo.find((feature) => ["CULVERT", "BRIDGE"].includes(feature.properties.category) && !feature.properties.component);
const [lng, lat] = target.properties.anchor;
const category = target.properties.category === "BRIDGE" ? "BRIDGE_DAMAGE" : "DRAINAGE";
const file = (body) => call(null, "/public/complaints", { method: "POST", body });
const complaint = { category, description: "Smoke test: water flowing over the road, culvert looks blocked", lat: lat + 0.0005, lng, citizen_name: "Smoke Tester", citizen_phone: "98765 43210" };

const photo = await call(null, "/public/complaints/photo", { method: "POST", body: { content_type: "image/jpeg" } });
check("Citizen gets a one-time photo upload slot (no login)", photo.status === 201 && photo.body.data.path.startsWith("complaint/"));
check("A path that is not a complaint photo -> 400", (await file({ ...complaint, photo_paths: ["inspection/x/y.jpg"] })).status === 400);
check("No location at all -> 400", (await file({ category: "POTHOLE", description: "Smoke test without any location given" })).status === 400);

const filed = await file(complaint);
const code = filed.body.data?.complaint_code;
check("Public complaint filed and routed to an office", filed.status === 201 && filed.body.data.routed === true && filed.body.data.status === "RECEIVED", code);
const dup = await file(complaint);
check("Same problem again within 14 days -> marked duplicate of the first", dup.body.data?.status === "DUPLICATE" && dup.body.data.duplicate_of === code, dup.body.data?.complaint_code);

const tracked = await call(null, `/public/complaints/${code}?phone=3210`);
check("Citizen tracks with the last 4 phone digits", tracked.status === 200 && tracked.body.data.steps[0].key === "RECEIVED" && tracked.body.data.office);
check("Wrong digits -> 404 (no data leaked)", (await call(null, `/public/complaints/${code}?phone=0000`)).status === 404);
check("Tracking response has no phone or name", !JSON.stringify(tracked.body.data).includes("Smoke Tester") && !JSON.stringify(tracked.body.data).includes("98765"));

const list = await call(pooja, "/complaints?status=RECEIVED");
const row = list.body.data.find((item) => item.complaint_code === code);
check("Olpad AE sees it, matched to the asset, phone masked", row?.asset_code === target.properties.code && row.match_method === "NEAREST" && row.citizen_phone.startsWith("••••"), `${row?.match_distance_m} m`);
check("Daskroi AE -> 403", (await call(kiran, `/complaints/${row.id}`)).status === 403);
check("Contractor -> 403", (await call(aarav, "/complaints")).status === 403);
const detail = (await call(pooja, `/complaints/${row.id}`)).body.data;
check("Detail lists nearby assets for re-matching and the duplicate", detail.candidates.length > 0 && detail.duplicates_list.length === 1);
check("Asset 360 complaints tab lists it", (await call(pooja, `/assets/${target.properties.id}/complaints`)).body.data.some((item) => item.id === row.id));

check("Acknowledge", (await call(pooja, `/complaints/${row.id}/acknowledge`, { method: "POST", body: {} })).body.data?.status === "ACKNOWLEDGED");
check("Acknowledging twice -> 409", (await call(pooja, `/complaints/${row.id}/acknowledge`, { method: "POST", body: {} })).status === 409);
const raised = await call(pooja, `/complaints/${row.id}/raise-request`, { method: "POST", body: { severity: "HIGH" } });
check("Raise a repair request from it -> IN_PROGRESS", raised.body.data?.status === "IN_PROGRESS");
const request = (await call(vikram, `/maintenance-requests/${raised.body.data.maintenance_request_id}`)).body.data;
check("Repair request shows its source complaint", request.source === "COMPLAINT" && request.complaints.some((item) => item.complaint_code === code), request.request_code);
check("Citizen sees 'Repair scheduled' with the request code", (await call(null, `/public/complaints/${code}?phone=3210`)).body.data.steps[2].note?.includes(request.request_code));
await call(vikram, `/maintenance-requests/${request.id}/cancel`, { method: "POST", body: { remarks: "Smoke test: cancelled" } });
check("Cancelling the repair hands the complaint back (ACKNOWLEDGED)", (await call(pooja, `/complaints/${row.id}`)).body.data.status === "ACKNOWLEDGED");
check("Resolve needs a note -> 400", (await call(pooja, `/complaints/${row.id}/resolve`, { method: "POST", body: {} })).status === 400);
check("Resolve with a note for the citizen", (await call(pooja, `/complaints/${row.id}/resolve`, { method: "POST", body: { note: "Culvert cleaned by the sub-division gang" } })).body.data?.status === "RESOLVED");
const final = (await call(null, `/public/complaints/${code}?phone=3210`)).body.data;
check("Citizen sees it resolved with the note", final.status === "RESOLVED" && final.steps[3].note === "Culvert cleaned by the sub-division gang");

// Nothing nearby and no asset code: HQ routes or rejects it.
const lost = await file({ category: "STREETLIGHT", description: "Smoke test: lights off on a road nobody can place", location_text: "Somewhere near the old toll plaza" });
check("Unmatched complaint goes to the HQ queue", lost.status === 201 && lost.body.data.routed === false);
const queue = (await call(hq, "/complaints?unrouted=true")).body.data;
const lostRow = queue.find((item) => item.complaint_code === lost.body.data.complaint_code);
check("HQ sees it in the unrouted queue; the EE does not", Boolean(lostRow) && !(await call(rohit, "/complaints?unrouted=true")).body.data.some((item) => item.id === lostRow?.id));
check("HQ closes it as not actionable", (await call(hq, `/complaints/${lostRow.id}/reject`, { method: "POST", body: { note: "Smoke test: municipal street lighting, not R&B" } })).body.data?.status === "REJECTED");

// ---- integration adapters ----
const payload = { reference: `SMK-${Date.now()}`, category: "Road / Pothole", description: "Smoke test grievance from the portal", location: "Olpad", lat: lat + 0.0005, lng };
if (process.env.INTEGRATION_API_KEY) {
  check("Portal with a wrong key -> 401", (await call(null, "/integrations/swagat/complaints", { method: "POST", body: payload, headers: { "x-integration-key": "wrong" } })).status === 401);
  const pushed = await call(null, "/integrations/swagat/complaints", { method: "POST", body: payload, headers: { "x-integration-key": process.env.INTEGRATION_API_KEY } });
  check("SWAGAT grievance imported as a complaint", pushed.status === 201 && pushed.body.data.complaint_code.startsWith("CMP-"));
  const retry = await call(null, "/integrations/swagat/complaints", { method: "POST", body: payload, headers: { "x-integration-key": process.env.INTEGRATION_API_KEY } });
  check("Portal retry is idempotent (same complaint, 200)", retry.status === 200 && retry.body.data.complaint_code === pushed.body.data.complaint_code);
} else {
  check("Inbound adapters disabled without INTEGRATION_API_KEY -> 503", (await call(null, "/integrations/swagat/complaints", { method: "POST", body: payload })).status === 503);
}
check("Unknown adapter -> 404 or 503", [404, 503].includes((await call(null, "/integrations/nope/complaints", { method: "POST", body: payload })).status));
const gis = await call(pooja, "/integrations/gis/assets.geojson");
check("GIS export is a scoped FeatureCollection", gis.body.data?.type === "FeatureCollection" && gis.body.data.features.length > 0 && gis.body.data.meta.crs === "EPSG:4326");
const status = await call(hq, "/admin/integrations");
check("Admin sees all four adapters with call logs", status.body.data?.adapters.length === 4 && status.body.data.logs.length > 0);
check("Integration status is HQ-only -> EE 403", (await call(vikram, "/admin/integrations")).status === 403);

summary("M13");
