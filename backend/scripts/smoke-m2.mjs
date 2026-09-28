// M2 API smoke test: node --experimental-websocket scripts/smoke-m2.mjs (backend must be running)
import { call, check, login, summary } from "./_client.mjs";

const hq = await login("hq@gujinfra.example");
const ee = await login("ee.ahmedabad@gujinfra.example");
const ae = await login("ae.daskroi@gujinfra.example");
const aeSurat = await login("ae.olpad@gujinfra.example");

const types = (await call(ee, "/asset-types")).body.data;
const typeId = Object.fromEntries(types.map((type) => [type.code, type.id]));
check("Asset types are configuration rows", types.length >= 8, `${types.length} types`);

const subs = (await call(ee, "/org-units?type=SUBDIVISION")).body.data;
const das = subs.find((unit) => unit.code === "SUB-DAS");
const stamp = Date.now().toString().slice(-5);

const bridge = await call(ee, "/assets", {
  method: "POST",
  body: {
    type_id: typeId.BRIDGE, org_unit_id: das.id, name: `Smoke Bridge ${stamp}`, criticality: 5, traffic_level: 4, condition_rating: 4,
    commissioned_on: "2015-04-01", lat: 22.95, lng: 72.61,
    attributes: { structure_type: "RCC Girder", span_count: 3, total_length_m: 60 }
  }
});
check("Create a bridge -> 201", bridge.status === 201, `${bridge.body.data?.asset_code} risk ${bridge.body.data?.risk_score} ${bridge.body.data?.risk_band}`);

const road = await call(ee, "/assets", {
  method: "POST",
  body: {
    type_id: typeId.ROAD_SEGMENT, org_unit_id: das.id, name: `Smoke road km 10–12.5 ${stamp}`, road_code: "DMO-SMK-01",
    start_chainage_km: 10, end_chainage_km: 12.5, attributes: { road_category: "Major District Road", carriageway: "Two lane", surface_type: "Bituminous" }
  }
});
check("Create a road segment with chainage -> 201", road.status === 201, road.body.data?.asset_code);

const roadNoChainage = await call(ee, "/assets", {
  method: "POST",
  body: { type_id: typeId.ROAD_SEGMENT, org_unit_id: das.id, name: "Road without chainage", attributes: { road_category: "Village Road", carriageway: "Single lane", surface_type: "Gravel" } }
});
check("Road segment without chainage -> 400", roadNoChainage.status === 400);

const badAttrs = await call(ee, "/assets", {
  method: "POST",
  body: { type_id: typeId.BRIDGE, org_unit_id: das.id, name: "Bridge missing attrs", attributes: { structure_type: "Wooden" } }
});
check("Type-driven attribute validation -> 400", badAttrs.status === 400, badAttrs.body.error?.details?.map((d) => d.field).join(", "));

const building = await call(ee, "/assets", {
  method: "POST",
  body: { type_id: typeId.BUILDING, org_unit_id: das.id, name: `Smoke Office Block ${stamp}`, attributes: { building_use: "Office", floors: 3 } }
});
const lift = await call(ee, "/assets", {
  method: "POST",
  body: { type_id: typeId.LIFT, org_unit_id: das.id, parent_id: building.body.data?.id, name: `Lift – Smoke Office ${stamp}`, attributes: { capacity_persons: 8 } }
});
const ac = await call(ee, "/assets", {
  method: "POST",
  body: { type_id: typeId.AC_PLANT, org_unit_id: das.id, parent_id: building.body.data?.id, name: `AC – Smoke Office ${stamp}`, attributes: { tonnage: 5.5 } }
});
check("Create building + 2 child equipment", [building, lift, ac].every((r) => r.status === 201));

const children = await call(ee, `/assets/${building.body.data.id}/children`);
check("Building lists its 2 components", children.body.meta?.total === 2);

const edit = await call(ee, `/assets/${bridge.body.data.id}`, { method: "PATCH", body: { traffic_level: 5, attributes: { load_class: "IRC Class AA" } } });
check("EE edits the bridge -> 200", edit.status === 200 && edit.body.data.traffic_level === 5);

const aeEditLimited = await call(ae, `/assets/${bridge.body.data.id}`, { method: "PATCH", body: { criticality: 1 } });
check("AE cannot change criticality (limited edit) -> 403", aeEditLimited.status === 403);

const aeEditOk = await call(ae, `/assets/${bridge.body.data.id}`, { method: "PATCH", body: { lat: 22.9501 } });
check("AE can correct location -> 200", aeEditOk.status === 200);

const timeline = await call(ee, `/assets/${bridge.body.data.id}/timeline`);
const events = timeline.body.data.map((event) => event.event_type);
check("Timeline shows create + edits", events.includes("ASSET_REGISTERED") && events.filter((e) => e === "ASSET_UPDATED").length === 2, events.join(" → "));

const parentTimeline = await call(ee, `/assets/${building.body.data.id}/timeline`);
check("Parent timeline records components added", parentTimeline.body.data.filter((e) => e.event_type === "COMPONENT_ADDED").length === 2);

const view = await call(ee, `/assets/${bridge.body.data.id}/360`);
const v = view.body.data;
check("Asset 360 returns identity, org chain, people, risk factors, recommendation", view.status === 200 && v.org_chain.length === 4 && v.people.length > 0 && v.risk_factors.length === 6 && !!v.recommendation.action, `${v.org_chain.map((o) => o.type).join(">")} · ${v.people.length} people · "${v.recommendation.action}"`);

const noRemarks = await call(ee, `/assets/${bridge.body.data.id}/status`, { method: "POST", body: { to: "CLOSED_TEMPORARILY" } });
check("Close without remarks -> 400", noRemarks.status === 400);
const closed = await call(ee, `/assets/${bridge.body.data.id}/status`, { method: "POST", body: { to: "CLOSED_TEMPORARILY", remarks: "Smoke test: unsafe deck joint" } });
check("Close temporarily with remarks -> 200", closed.status === 200);
const invalid = await call(ee, `/assets/${bridge.body.data.id}/status`, { method: "POST", body: { to: "UNDER_CONSTRUCTION" } });
check("Invalid transition CLOSED_TEMPORARILY -> UNDER_CONSTRUCTION -> 409", invalid.status === 409, invalid.body.error?.message);
const aeStatus = await call(ae, `/assets/${bridge.body.data.id}/status`, { method: "POST", body: { to: "OPERATIONAL", remarks: "x" } });
check("AE cannot change lifecycle status -> 403", aeStatus.status === 403);
await call(ee, `/assets/${bridge.body.data.id}/status`, { method: "POST", body: { to: "OPERATIONAL", remarks: "Smoke test: joint repaired" } });

const lookup = await call(ae, `/assets/lookup?code=${bridge.body.data.asset_code.toLowerCase()}`);
check("Lookup by asset code (case-insensitive)", lookup.body.data?.id === bridge.body.data.id);
const qrLookup = await call(ae, `/assets/lookup?code=${bridge.body.data.qr_token}`);
check("Lookup by QR token", qrLookup.body.data?.id === bridge.body.data.id);

const suratView = await call(aeSurat, `/assets/${bridge.body.data.id}/360`);
check("AE in Surat cannot open a Daskroi asset -> 403", suratView.status === 403);

const hqList = await call(hq, "/assets?limit=20");
check("List is paginated (HQ sees all seeded assets)", hqList.body.data.length === 20 && hqList.body.meta.total >= 500, `total ${hqList.body.meta.total}, ${hqList.ms} ms`);
const sorted = hqList.body.data.every((row, i, all) => i === 0 || all[i - 1].risk_score >= row.risk_score);
check("Default sort is highest risk first", sorted);

const aeList = await call(ae, "/assets?limit=100");
check("AE list scoped to Daskroi only", aeList.body.data.every((row) => row.org_unit_name === "Daskroi Sub-division"), `total ${aeList.body.meta.total}`);

const filtered = await call(hq, `/assets?type_id=${typeId.BRIDGE}&risk_band=HIGH&district=Ahmedabad`);
check("Filters combine (type + risk band + district)", filtered.body.data.every((row) => row.category === "BRIDGE" && row.risk_band === "HIGH" && row.district === "Ahmedabad"), `${filtered.body.meta.total} match`);

const search = await call(hq, "/assets?q=Daskroi River");
check("Search finds the hero bridge", search.body.data.some((row) => row.asset_code === "RDB-BR-000001"));

const overdue = await call(hq, "/assets?overdue=true&limit=1");
check("Overdue filter returns >= 25 assets", overdue.body.meta.total >= 25, `${overdue.body.meta.total} overdue`);
const dlp = await call(hq, "/assets?in_dlp=true&limit=1");
check("DLP filter returns ~20 assets", dlp.body.meta.total >= 20, `${dlp.body.meta.total} in DLP`);

const heroView = await call(hq, `/assets/${search.body.data.find((row) => row.asset_code === "RDB-BR-000001").id}/360`);
check("Hero bridge is in DLP", heroView.body.data.dlp.in_dlp === true, `${heroView.body.data.dlp.days_remaining} days left`);

summary("M2");
