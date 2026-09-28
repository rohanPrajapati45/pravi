// M12 emergency mode smoke test: node --experimental-websocket scripts/smoke-m12.mjs
// Declares a "Smoke" emergency in the Surat division (away from the Ahmedabad demo), then closes it and cancels its repair.
import { call, check, login, summary } from "./_client.mjs";

const hq = await login("hq@gujinfra.example");
const vikram = await login("ee.surat@gujinfra.example");
const rohit = await login("ee.ahmedabad@gujinfra.example");
const pooja = await login("ae.olpad@gujinfra.example");
const kiran = await login("ae.daskroi@gujinfra.example");
const aarav = await login("contractor.aarav@gujinfra.example");

const surat = (await call(vikram, "/me")).body.data.orgUnit;
const body = { title: "Smoke test — flash flood, Olpad", kind: "FLOOD", description: "Smoke test", org_unit_id: surat.id };
check("AE cannot declare -> 403", (await call(pooja, "/emergencies", { method: "POST", body })).status === 403);
check("EE of another division cannot declare here -> 403", (await call(rohit, "/emergencies", { method: "POST", body })).status === 403);
const declared = await call(vikram, "/emergencies", { method: "POST", body });
const id = declared.body.data?.id;
check("Surat EE declares an emergency for the division", declared.status === 201 && /^EMG-\d{4}-\d{3}$/.test(declared.body.data.emergency_code), declared.body.data?.emergency_code);
check("Everyone in the area is alerted", declared.body.data?.alerted >= 2, `${declared.body.data?.alerted} people`);
const alert = (await call(pooja, "/notifications?limit=5")).body.data.find((item) => item.link === `/emergencies/${id}`);
check("Olpad AE has a CRITICAL alert linking to it", alert?.severity === "CRITICAL" && alert.kind === "EMERGENCY");
check("Listed for the Surat AE and HQ", (await call(pooja, "/emergencies?status=ACTIVE")).body.data.some((item) => item.id === id) && (await call(hq, "/emergencies")).body.data.some((item) => item.id === id));
check("Daskroi AE (outside the area) -> 403", (await call(kiran, `/emergencies/${id}`)).status === 403);
check("Contractors do not see emergencies", (await call(aarav, "/emergencies")).body.data.length === 0);

// Pick an operational, top-level Olpad asset.
const assets = (await call(pooja, "/assets?limit=50&status=OPERATIONAL&top_level=true&sort=code")).body.data;
const asset = assets.find((row) => !row.parent_id);
const report = (token, extra = {}) =>
  call(token, `/emergencies/${id}/assets`, { method: "POST", body: { asset_id: asset.id, damage: "Approach washed out, deep scour at abutment", severity: "SEVERE", traffic_status: "CLOSED", ...extra } });
const reported = await report(pooja);
check("AE reports severe damage and closes the asset to traffic", reported.status === 201 && reported.body.data.closed_to_traffic === true, asset.asset_code);
const detail360 = (await call(pooja, `/assets/${asset.id}`)).body.data;
check("Asset is now CLOSED_TEMPORARILY", detail360.lifecycle_status === "CLOSED_TEMPORARILY");
const request = (await call(pooja, `/maintenance-requests/${reported.body.data.maintenance_request_id}`)).body.data;
check("High-severity repair raised, due tomorrow, source EMERGENCY", request.severity === "HIGH" && request.source === "EMERGENCY" && request.source_emergency?.id === id, request.request_code);
check("Same asset twice -> 400", (await report(pooja)).status === 400);
const daskroi = (await call(kiran, "/assets?limit=1&status=OPERATIONAL")).body.data[0];
check("Asset outside the area -> 400", (await call(hq, `/emergencies/${id}/assets`, { method: "POST", body: { asset_id: daskroi.id, damage: "Out of area", severity: "MINOR", traffic_status: "OPEN" } })).status === 400);

const detail = (await call(vikram, `/emergencies/${id}`)).body.data;
const record = detail.assets.find((row) => row.asset_id === asset.id);
check("EE can fast-track an emergency work; AE cannot", record.actions.includes("start_work") && !(await call(pooja, `/emergencies/${id}`)).body.data.assets[0].actions.includes("start_work"));
const work = await call(vikram, `/emergencies/${id}/assets/${record.id}/work`, { method: "POST", body: { estimated_cost: 1500000 } });
check("Emergency work created from the Emergency template", work.status === 201 && /^WK-/.test(work.body.data.work_code), work.body.data?.work_code);
const journey = (await call(vikram, `/works/${work.body.data.id}`)).body.data;
check("…starts at 'Immediate action' with CRITICAL priority", journey.stages?.[0]?.name === "Immediate action" && journey.priority === "CRITICAL");
check("Second work for the same asset -> 409", (await call(vikram, `/emergencies/${id}/assets/${record.id}/work`, { method: "POST", body: { estimated_cost: 1 } })).status === 409);

check("Close with an unrestored asset needs remarks -> 400", (await call(vikram, `/emergencies/${id}/close`, { method: "POST", body: {} })).status === 400);
check("Restore needs remarks -> 400", (await call(pooja, `/emergencies/${id}/assets/${record.id}/restore`, { method: "POST", body: {} })).status === 400);
const restored = await call(pooja, `/emergencies/${id}/assets/${record.id}/restore`, { method: "POST", body: { remarks: "Temporary diversion built, opened for light vehicles" } });
check("AE restores; asset reopened to traffic", restored.body.data?.asset_status === "OPERATIONAL");
check("Restoring twice -> 409", (await call(pooja, `/emergencies/${id}/assets/${record.id}/restore`, { method: "POST", body: { remarks: "again" } })).status === 409);
const events = (await call(pooja, `/assets/${asset.id}/timeline?limit=20`)).body.data.map((event) => event.event_type);
check("Timeline: damage reported, closed, reopened", ["EMERGENCY_DAMAGE_REPORTED", "CLOSED_TO_TRAFFIC", "REOPENED_TO_TRAFFIC"].every((type) => events.includes(type)));

check("Rohit (EE, not the declarer, other division) cannot close -> 403", (await call(rohit, `/emergencies/${id}/close`, { method: "POST", body: {} })).status === 403);
check("Declaring EE closes it", (await call(vikram, `/emergencies/${id}/close`, { method: "POST", body: { remarks: "Smoke test over" } })).body.data?.status === "CLOSED");
check("Reporting after closure -> 409", (await report(pooja, { asset_id: assets[1].id })).status === 409);

// Tidy: cancel the repair the smoke emergency raised.
await call(vikram, `/maintenance-requests/${request.id}/cancel`, { method: "POST", body: { remarks: "Smoke test clean-up" } });

summary("M12");
