// M5 API smoke test — full New Road journey: node --experimental-websocket scripts/smoke-m5.mjs (backend must be running)
import { call, check, login, summary } from "./_client.mjs";

const T = {
  meera: await login("hq@gujinfra.example"),
  suresh: await login("secretary@gujinfra.example"),
  rohit: await login("ee.ahmedabad@gujinfra.example"),
  kiran: await login("ae.daskroi@gujinfra.example"),
  nisha: await login("ae.sanand@gujinfra.example"),
  aarav: await login("contractor.aarav@gujinfra.example"),
  kaveri: await login("contractor.kaveri@gujinfra.example"),
  vikram: await login("ee.surat@gujinfra.example")
};
const users = Object.fromEntries((await call(T.meera, "/users?limit=100")).body.data.map((u) => [u.email.split("@")[0], u.id]));
const units = (await call(T.meera, "/org-units?limit=200")).body.data;
const unit = (code) => units.find((u) => u.code === code).id;
const programme = (await call(T.meera, "/programmes")).body.data.find((p) => p.code === "SHIP-2026-27");
const contractors = (await call(T.meera, "/contractors")).body.data;
const aaravFirm = contractors.find((c) => c.code === "CON-001").id;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let journey;
const reload = async (token = T.rohit) => (journey = (await call(token, `/works/${workId}`)).body.data);
const stage = (code) => journey.stages.find((s) => s.code === code);
const tasksOf = (code) => stage(code).tasks;

async function submit(token, task, extra = {}) {
  const photo_paths = [];
  if (task.required_deliverables.some((label) => /photo/i.test(label))) {
    const sign = await call(token, "/uploads/sign", { method: "POST", body: { purpose: "progress", owner_id: task.id, content_type: "image/png" } });
    await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/upload/sign/evidence/${sign.body.data.path}?token=${sign.body.data.token}`, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png });
    photo_paths.push(sign.body.data.path);
  }
  const deliverables = task.required_deliverables.filter((label) => !/photo/i.test(label)).map((label) => ({ label, reference: `DEMO/${label.slice(0, 12).toUpperCase().replace(/\W+/g, "-")}/01` }));
  return call(token, `/tasks/${task.id}/submit`, { method: "POST", body: { deliverables, photo_paths, note: "Submitted (smoke)", ...extra } });
}
const assign = (token, task, userId) => call(token, `/tasks/${task.id}/assign`, { method: "POST", body: { assigned_to: userId } });
const accept = (token, task) => call(token, `/tasks/${task.id}/accept`, { method: "POST", body: {} });
const evaluate = (token, code, body) => call(token, `/work-stages/${stage(code).id}/evaluate`, { method: "POST", body: { checklist: stage(code).gate_checklist.map((item) => ({ item, ok: true })), ...body } });

// ---- Stage 0: initiation by HQ from a programme ----
const stamp = Date.now().toString().slice(-5);
const created = await call(T.meera, "/works", {
  method: "POST",
  body: {
    template_code: "NEW_ROAD",
    title: `Smoke new road ${stamp} (Daskroi–Sanand link)`,
    objective: "Connect two taluka headquarters with an all-weather 2-lane road",
    org_unit_id: unit("DIV-AMD"),
    programme_id: programme.id,
    initiation_type: "PROGRAMME",
    initiation_ref: `GR/RB/SHIP/${stamp}`,
    priority: "HIGH",
    estimated_cost: 124000000,
    planned_asset: {
      name: `Smoke link road ${stamp}, km 0–8.4`,
      org_unit_id: unit("SUB-DAS"),
      road_code: `DMO-SMK-${stamp}`,
      start_chainage_km: 0,
      end_chainage_km: 8.4,
      lat: 22.97,
      lng: 72.52,
      criticality: 4,
      traffic_level: 4,
      attributes: { road_category: "Major District Road", carriageway: "Two lane", surface_type: "Bituminous", width_m: 7 }
    }
  }
});
const workId = created.body.data?.id;
check("HQ initiates a New Road work from a programme -> 201", created.status === 201, created.body.data?.work_code);
await reload();
check("Stages instantiated from template (8), stage 0 active", journey.stages.length === 8 && stage("INITIATION").status === "ACTIVE" && stage("SURVEY").status === "LOCKED");
check("Surat EE cannot see an Ahmedabad work -> 403", (await call(T.vikram, `/works/${workId}`)).status === 403);
check("Evaluating a locked stage -> 409", (await evaluate(T.rohit, "SURVEY", { outcome: "PASSED" })).status === 409);

const [mandate, divisionTask] = tasksOf("INITIATION");
const missing = await call(T.meera, `/tasks/${mandate.id}/submit`, { method: "POST", body: { deliverables: [] } });
check("Submitting without required deliverables -> 400", missing.status === 400, missing.body.error?.message);
await submit(T.meera, mandate);
await submit(T.meera, divisionTask);
check("Initiator cannot accept own submission -> 403", (await accept(T.meera, mandate)).status === 403);
await accept(T.rohit, mandate);
await accept(T.rohit, divisionTask);
await reload();
check("Initiator cannot pass the gate of a stage she worked on -> 403", (await evaluate(T.meera, "INITIATION", { outcome: "PASSED" })).status === 403);
check("EE cannot pass an HQ gate -> 403", (await evaluate(T.rohit, "INITIATION", { outcome: "PASSED" })).status === 403);
const gate0 = await evaluate(T.suresh, "INITIATION", { outcome: "PASSED", remarks: "Mandate verified" });
check("Independent HQ (Secretary) passes Stage 0", gate0.body.data?.next_stage === "Survey & investigation");

// ---- Stage 1: survey by two AEs; one task returned and reworked ----
await reload();
const survey = tasksOf("SURVEY");
check("Contractor cannot be assigned department tasks -> 400", (await assign(T.rohit, survey[0], users["contractor.aarav"])).status === 400);
await assign(T.rohit, survey[0], users["ae.daskroi"]);
await assign(T.rohit, survey[1], users["ae.daskroi"]);
await assign(T.rohit, survey[2], users["ae.sanand"]);
await assign(T.rohit, survey[3], users["ae.sanand"]);
await reload(T.kiran);
for (const task of tasksOf("SURVEY").filter((t) => t.assigned_to === users["ae.daskroi"])) await submit(T.kiran, task);
await reload(T.nisha);
for (const task of tasksOf("SURVEY").filter((t) => t.assigned_to === users["ae.sanand"])) await submit(T.nisha, task);
await reload();
const soil = tasksOf("SURVEY")[2];
const returned = await call(T.rohit, `/tasks/${soil.id}/return`, { method: "POST", body: { remarks: "Add CBR values for all 6 pits" } });
check("EE returns a task for rework", returned.body.data?.status === "RETURNED");
check("Gate blocked while a task is pending -> 409", (await evaluate(T.rohit, "SURVEY", { outcome: "PASSED" })).status === 409);
await reload(T.nisha);
await submit(T.nisha, tasksOf("SURVEY")[2]);
await reload();
for (const task of tasksOf("SURVEY")) if (task.status === "SUBMITTED") await accept(T.rohit, task);
await reload();
check("EE passes Survey gate", (await evaluate(T.rohit, "SURVEY", { outcome: "PASSED" })).status === 200);

// ---- Stage 2: design; gate RETURNED once, then passed -> PLANNED asset created ----
await reload();
for (const task of tasksOf("DESIGN")) await assign(T.rohit, task, users["ae.daskroi"]);
await reload(T.kiran);
for (const task of tasksOf("DESIGN")) await submit(T.kiran, task);
await reload();
for (const task of tasksOf("DESIGN")) await accept(T.rohit, task);
await reload();
const boq = tasksOf("DESIGN")[1];
const gateReturn = await evaluate(T.rohit, "DESIGN", { outcome: "RETURNED", remarks: "BoQ does not reconcile with drawings for drainage items", return_task_ids: [boq.id] });
check("Design gate RETURNED with remarks; BoQ task back to rework", gateReturn.status === 200);
await reload(T.kiran);
check("Returned task is RETURNED again for the AE", tasksOf("DESIGN")[1].status === "RETURNED");
await submit(T.kiran, tasksOf("DESIGN")[1]);
await reload();
await accept(T.rohit, tasksOf("DESIGN")[1]);
await reload();
const gate2 = await evaluate(T.rohit, "DESIGN", { outcome: "PASSED_WITH_OBSERVATIONS", remarks: "Revised BoQ reconciles" });
check("Design passed -> PLANNED asset placeholder created", !!gate2.body.data?.effects?.planned_asset, gate2.body.data?.effects?.planned_asset);

// ---- Stage 3: approvals with cost-based escalation ----
await reload();
const approvals = tasksOf("APPROVALS");
await assign(T.rohit, approvals[0], users["ae.daskroi"]);
await assign(T.rohit, approvals[1], users["ae.sanand"]);
await assign(T.meera, approvals[2], users.secretary);
await reload(T.kiran);
await submit(T.kiran, tasksOf("APPROVALS")[0]);
await reload(T.nisha);
await submit(T.nisha, tasksOf("APPROVALS")[1]);
await reload(T.suresh);
await submit(T.suresh, tasksOf("APPROVALS")[2]);
await reload();
await accept(T.rohit, tasksOf("APPROVALS")[0]);
await accept(T.rohit, tasksOf("APPROVALS")[1]);
await accept(T.meera, tasksOf("APPROVALS")[2]);
await reload();
const approvalData = { technical_sanction_amount: 124000000, sanctioned_amount: 121000000, ts_ref: `TS/${stamp}`, aa_ref: `AA/${stamp}` };
const eeApprove = await evaluate(T.rohit, "APPROVALS", { outcome: "PASSED", data: approvalData });
check("EE cannot approve ₹12.1 Cr (limit ₹2 Cr) -> 403 escalate", eeApprove.status === 403, eeApprove.body.error?.message);
const hqApprove = await evaluate(T.meera, "APPROVALS", { outcome: "PASSED", data: approvalData });
check("HQ approves within limit; TS + AA recorded", hqApprove.status === 200, hqApprove.body.data?.effects?.approval);

// ---- Stage 4: tender & award ----
await reload();
for (const task of tasksOf("TENDER_AWARD")) await assign(T.rohit, task, users["ee.ahmedabad"]);
await reload();
for (const task of tasksOf("TENDER_AWARD")) await submit(T.rohit, task);
await reload();
for (const task of tasksOf("TENDER_AWARD")) await accept(T.meera, task);
await reload();
const start = new Date().toISOString().slice(0, 10);
const end = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
const incomplete = await evaluate(T.suresh, "TENDER_AWARD", { outcome: "PASSED", data: { tender_ref: "x" } });
check("Award without contract details -> 400", incomplete.status === 400);
const award = await evaluate(T.suresh, "TENDER_AWARD", {
  outcome: "PASSED",
  data: { tender_ref: `NIT/${stamp}`, contractor_id: aaravFirm, contract_value: 118000000, start_date: start, planned_end: end, dlp_months: 24 }
});
check("Award recorded (contractor, value, DLP)", award.status === 200, award.body.data?.effects?.award);
await reload();
const assetId = journey.assets.find((a) => a.role === "CREATED").id;
check("Construction started -> asset UNDER_CONSTRUCTION, work IN_PROGRESS", journey.assets[0].lifecycle_status === "UNDER_CONSTRUCTION" && journey.status === "IN_PROGRESS");

// ---- Stage 5: contractor milestones with a quality rework ----
const milestones = tasksOf("CONSTRUCTION");
check("Other contractor cannot be assigned -> 400", (await assign(T.rohit, milestones[0], users["contractor.kaveri"])).status === 400);
for (const task of milestones) await assign(T.rohit, task, users["contractor.aarav"]);
check("Contractor sees milestone tasks in My tasks", (await call(T.aarav, "/tasks/mine")).body.data.assigned.filter((t) => t.work_id === workId).length === milestones.length);
await reload(T.aarav);
for (const task of tasksOf("CONSTRUCTION")) await submit(T.aarav, task, { progress_pct: 100 });
await reload();
await call(T.rohit, `/tasks/${tasksOf("CONSTRUCTION")[1].id}/return`, { method: "POST", body: { remarks: "Compaction test failed at km 3.2 — redo layer" } });
for (const task of tasksOf("CONSTRUCTION")) if (task.status === "SUBMITTED") await accept(T.rohit, task);
await reload();
check("Progress rolls up from accepted milestone weights (80%)", Number(journey.progress_pct) === 80, `${journey.progress_pct}%`);
await reload(T.aarav);
await submit(T.aarav, tasksOf("CONSTRUCTION")[1]);
await reload();
await accept(T.rohit, tasksOf("CONSTRUCTION")[1]);
await reload();
check("Progress 100% after rework accepted", Number(journey.progress_pct) === 100);
check("Who-has-file points at the gate", journey.who_has_file?.summary?.includes("gate"), journey.who_has_file?.holder);
check("EE passes construction gate", (await evaluate(T.rohit, "CONSTRUCTION", { outcome: "PASSED" })).status === 200);

// ---- Stage 6: completion & handover -> OPERATIONAL asset ----
await reload();
const handover = tasksOf("HANDOVER");
await assign(T.rohit, handover[0], users["contractor.aarav"]);
await assign(T.rohit, handover[1], users["ae.daskroi"]);
await assign(T.rohit, handover[2], users["contractor.aarav"]);
await assign(T.rohit, handover[3], users["ee.ahmedabad"]);
await reload(T.aarav);
for (const task of tasksOf("HANDOVER").filter((t) => t.assigned_to === users["contractor.aarav"])) await submit(T.aarav, task);
await reload(T.kiran);
await submit(T.kiran, tasksOf("HANDOVER")[1]);
await reload();
await submit(T.rohit, tasksOf("HANDOVER")[3]);
await reload();
for (const task of tasksOf("HANDOVER").slice(0, 3)) await accept(T.rohit, task);
await accept(T.meera, tasksOf("HANDOVER")[3]);
await reload();
const handed = await evaluate(T.suresh, "HANDOVER", { outcome: "PASSED", data: { completion_certificate_ref: `CC/${stamp}` } });
check("HQ passes handover gate", handed.status === 200, handed.body.data?.effects?.handover);

const asset = (await call(T.rohit, `/assets/${assetId}/360`)).body.data;
check("New OPERATIONAL asset with origin work + contractor", asset.lifecycle_status === "OPERATIONAL" && asset.origin_work?.contractor_name?.startsWith("Aarav"), `${asset.asset_code}`);
check("Asset carries cost and DLP end date (24 months)", asset.original_cost === 118000000 && asset.dlp.in_dlp && asset.dlp.days_remaining > 700, `DLP ${asset.dlp.days_remaining} days`);
const timeline = (await call(T.rohit, `/assets/${assetId}/timeline?limit=100`)).body.data.map((e) => e.event_type).reverse();
const needed = ["WORK_INITIATED", "STAGE_PASSED", "STAGE_RETURNED", "ASSET_REGISTERED", "CONSTRUCTION_STARTED", "MILESTONE_RETURNED", "HANDED_OVER"];
check("Asset timeline holds the whole journey (initiation → handover)", needed.every((e) => timeline.includes(e)), `${timeline.length} events`);
check("Timeline starts at initiation", timeline[0] === "WORK_INITIATED");

// DLP defect goes to the original contractor automatically.
const defect = await call(T.kiran, "/inspections", { method: "POST", body: { asset_id: assetId, condition_rating: 2, severity: "MEDIUM", defects: ["Edge breaking"] } });
const requestId = defect.body.data?.maintenance_request?.id;
const request = (await call(T.rohit, `/maintenance-requests/${requestId}`)).body.data;
check("Defect in DLP -> request DLP-liable, contractor prefilled", request.dlp_liable && request.contractor_name?.startsWith("Aarav"), request.request_code);
check("Contractor sees the liable defect", (await call(T.aarav, `/maintenance-requests/${requestId}`)).status === 200);

// ---- Stage 7: closure + contractor evaluation ----
await reload();
const closure = tasksOf("DLP_CLOSURE");
await assign(T.rohit, closure[0], users["ae.daskroi"]);
await assign(T.rohit, closure[1], users["ee.ahmedabad"]);
await reload(T.kiran);
await submit(T.kiran, tasksOf("DLP_CLOSURE")[0]);
await reload();
await submit(T.rohit, tasksOf("DLP_CLOSURE")[1]);
await reload();
await accept(T.rohit, tasksOf("DLP_CLOSURE")[0]);
await accept(T.meera, tasksOf("DLP_CLOSURE")[1]);
await reload();
const closed = await evaluate(T.suresh, "DLP_CLOSURE", { outcome: "PASSED", remarks: "Closure recorded; DLP continues on the asset" });
check("Closure gate computes contractor score", typeof closed.body.data?.effects?.contractor_score === "number", `score ${closed.body.data?.effects?.contractor_score}/100`);
await reload();
check("Work CLOSED with explainable evaluation", journey.status === "CLOSED" && journey.contractor_evaluation?.inputs?.quality?.includes("of 7"), journey.contractor_evaluation?.inputs?.quality);
check("Evaluating a passed stage again -> 409", (await evaluate(T.suresh, "DLP_CLOSURE", { outcome: "PASSED" })).status === 409);

const audit = (await call(T.meera, `/audit-logs?limit=100`)).body.data.filter((row) => row.diff?.work_id === workId || row.entity_id === workId);
check("Every step is in the audit log", audit.length >= 20, `${audit.length} entries`);

summary("M5");
