import { computeContractorEvaluation } from "../../backend/src/services/works.service.js";

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

// Illustrative stage durations (days) for historical works; construction dominates.
const DURATIONS = { INITIATION: 10, SURVEY: 40, DESIGN: 50, APPROVALS: 35, TENDER_AWARD: 50, CONSTRUCTION: 360, HANDOVER: 25, DLP_CLOSURE: 730,
  NEED_ESTIMATE: 10, IMMEDIATE: 2, CONSTRUCTION_SHORT: 45 };

async function loadTemplates(client) {
  const { rows } = await client.query(
    `select t.code as template_code, t.id as template_id, t.work_type, t.asset_type_code, s.id as stage_template_id, s.seq, s.code, s.name, s.kind,
            s.planned_days, s.gate_role, s.gate_checklist, s.work_status_on_enter, s.work_status_on_pass,
            coalesce((select json_agg(tt order by tt.seq) from task_templates tt where tt.stage_template_id = s.id), '[]') as tasks
       from work_templates t join stage_templates s on s.template_id = t.id order by t.code, s.seq`
  );
  const templates = {};
  for (const row of rows) {
    templates[row.template_code] ??= { id: row.template_id, work_type: row.work_type, asset_type_code: row.asset_type_code, stages: [] };
    templates[row.template_code].stages.push(row);
  }
  return templates;
}

export const workHistoryStep = {
  name: "work journeys (hero works, pipeline, origin works for DLP assets)",
  async run(client, context) {
    const { rows: existing } = await client.query("select 1 from works where work_code like 'WK-%-S%' limit 1");
    if (existing.length) return;

    const templates = await loadTemplates(client);
    const u = (email) => context.userIds[email];
    const people = {
      "DIV-AMD": { ee: u("ee.ahmedabad@gujinfra.example"), aes: [u("ae.daskroi@gujinfra.example"), u("ae.sanand@gujinfra.example")], contractorUser: u("contractor.aarav@gujinfra.example"), contractor: context.contractorIds["CON-001"] },
      "DIV-SUR": { ee: u("ee.surat@gujinfra.example"), aes: [u("ae.olpad@gujinfra.example")], contractorUser: u("contractor.kaveri@gujinfra.example"), contractor: context.contractorIds["CON-002"] }
    };
    const meera = u("hq@gujinfra.example");
    const suresh = u("secretary@gujinfra.example");
    const { rows: orgRows } = await client.query("select id, code, name, district from org_units");
    const org = Object.fromEntries(orgRows.map((row) => [row.code, row]));
    const { rows: typeRows } = await client.query("select id, code, code_prefix, design_life_years from asset_types");
    const assetTypes = Object.fromEntries(typeRows.map((row) => [row.code, row]));
    let serial = 0;
    const deferredEvaluations = [];

    async function event(assetIds, eventType, at, actor, remarks, extra = {}) {
      for (const assetId of assetIds) {
        await client.query(
          `insert into lifecycle_events (asset_id, event_type, from_status, to_status, actor_id, actor_role, at, ref_type, ref_id, remarks)
           values ($1, $2, $3, $4, $5, $6, $7, 'work', $8, $9)`,
          [assetId, eventType, extra.from ?? null, extra.to ?? null, actor?.id ?? null, actor?.role ?? "SYSTEM", iso(at), extra.workId, remarks]
        );
      }
    }

    // Writes one work with its stages, tasks, evaluations and asset history as if it had run through the engine.
    async function simulate(spec) {
      const template = templates[spec.template];
      const team = people[spec.division];
      const stages = template.stages;
      const activeIndex = spec.activeStage === "DONE" ? stages.length : stages.findIndex((stage) => stage.code === spec.activeStage);
      const duration = (stage) => spec.durations?.[stage.code] ?? (stage.kind === "CONSTRUCTION" && template.work_type !== "NEW" ? DURATIONS.CONSTRUCTION_SHORT : DURATIONS[stage.code] ?? stage.planned_days);
      serial += 1;
      const startAt = spec.startAt;
      const workCode = `WK-${new Date(startAt).getFullYear()}-S${String(serial).padStart(3, "0")}`;
      const actorFor = (role, index = 0) =>
        role === "HQ" ? { id: suresh, role: "HQ" } : role === "EE" ? { id: team.ee, role: "EE" } : role === "AE" ? { id: team.aes[index % team.aes.length], role: "AE" } : { id: team.contractorUser, role: "CONTRACTOR" };
      const reviewerFor = (role) => (role === "EE" || role === "HQ" ? { id: meera, role: "HQ" } : { id: team.ee, role: "EE" });

      const { rows: workRows } = await client.query(
        `insert into works (work_code, title, objective, work_type, status, org_unit_id, programme_id, template_id, initiation_type, initiated_by,
                            initiation_ref, initiation_date, priority, source_type, estimated_cost, planned_asset, created_by, created_at)
         values ($1, $2, $3, $4, 'PROPOSED', $5, $6, $7, $8, $9, $10, $11, $12, $8, $13, $14, $9, $15) returning id`,
        [workCode, spec.title, spec.objective ?? null, template.work_type, org[spec.division].id, spec.programme ? context.programmeIds[spec.programme] : null, template.id,
          spec.initiation ?? "PROGRAMME", spec.initiatedBy ?? meera, spec.ref ?? `GR/RB/${serial}/${new Date(startAt).getFullYear()}`, isoDate(startAt), spec.priority ?? "MEDIUM",
          spec.estimated, spec.plannedAsset ? JSON.stringify(spec.plannedAsset) : null, iso(startAt)]
      );
      const workId = workRows[0].id;
      let assetIds = spec.targetAssetId ? [spec.targetAssetId] : spec.existingAssetId ? [spec.existingAssetId] : [];
      if (spec.targetAssetId) await client.query("insert into work_assets (work_id, asset_id, role) values ($1, $2, 'TARGET')", [workId, spec.targetAssetId]);
      if (spec.existingAssetId) await client.query("insert into work_assets (work_id, asset_id, role) values ($1, $2, 'CREATED')", [workId, spec.existingAssetId]);
      await event(assetIds, "WORK_INITIATED", startAt, { id: spec.initiatedBy ?? meera, role: "HQ" }, `${workCode} initiated: ${spec.title}`, { workId });

      let t = startAt;
      let status = stages[0].work_status_on_enter ?? "PROPOSED";
      let currentStageId = null;
      let award = null;

      for (const [index, stage] of stages.entries()) {
        const state = index < activeIndex ? "PASSED" : index === activeIndex ? "ACTIVE" : "LOCKED";
        const days = duration(stage);
        const started = state === "LOCKED" ? null : t;
        const returnedHere = spec.returnedGate === stage.code;
        const { rows: stageRows } = await client.query(
          `insert into work_stages (work_id, stage_template_id, seq, code, name, kind, status, gate_role, gate_checklist, planned_days,
                                    work_status_on_enter, work_status_on_pass, return_count, started_at, due_at, completed_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning id`,
          [workId, stage.stage_template_id, stage.seq, stage.code, stage.name, stage.kind, state, stage.gate_role, JSON.stringify(stage.gate_checklist), stage.planned_days,
            stage.work_status_on_enter, stage.work_status_on_pass, returnedHere ? 1 : 0, started ? iso(started) : null, started ? iso(started + stage.planned_days * DAY) : null,
            state === "PASSED" ? iso(t + days * DAY) : null]
        );
        const stageId = stageRows[0].id;
        if (state === "ACTIVE") currentStageId = stageId;
        if (state !== "LOCKED" && stage.work_status_on_enter) status = stage.work_status_on_enter;

        const pattern = state === "ACTIVE" ? spec.activeTasks ?? [] : [];
        for (const [taskIndex, item] of stage.tasks.entries()) {
          const initiationTask = stage.code === "INITIATION";
          const doer = initiationTask ? { id: spec.initiatedBy ?? meera, role: "HQ" } : stage.code === "APPROVALS" && item.default_assignee_role === "HQ" ? { id: suresh, role: "HQ" } : actorFor(item.default_assignee_role, taskIndex);
          const reviewer = initiationTask ? { id: team.ee, role: "EE" } : doer.id === suresh ? { id: meera, role: "HQ" } : reviewerFor(item.default_assignee_role);
          const contractorTask = item.default_assignee_role === "CONTRACTOR";
          let taskStatus = "PENDING";
          if (state === "PASSED") taskStatus = "ACCEPTED";
          if (state === "ACTIVE") taskStatus = pattern[taskIndex] ?? "PENDING";
          const assigned = state !== "LOCKED" && (!contractorTask || award) ? doer : null;
          const submittedAt = t + days * DAY * (0.35 + (0.4 * (taskIndex + 1)) / (stage.tasks.length + 1));
          const reworked = (spec.reworkMilestone === taskIndex && stage.kind === "CONSTRUCTION") || (returnedHere && taskIndex === Math.min(1, stage.tasks.length - 1));
          const done = ["SUBMITTED", "ACCEPTED"].includes(taskStatus);
          const deliverables = done ? item.required_deliverables.filter((label) => !/photo/i.test(label)).map((label) => ({ label, reference: `${workCode}/${label.slice(0, 10).toUpperCase().replace(/\W+/g, "-")}` })) : [];
          await client.query(
            `insert into work_tasks (work_id, work_stage_id, task_template_id, seq, title, default_assignee_role, assigned_to, assigned_by, assigned_at, due_date, status,
                                     required_deliverables, deliverables, submission_note, progress_pct, submitted_by, submitted_at, reviewed_by, reviewed_at, review_remarks,
                                     return_count, is_mandatory, is_milestone, weight)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
            [workId, stageId, item.id, item.seq, item.title, item.default_assignee_role, assigned?.id ?? null, assigned ? team.ee : null, assigned ? iso(started) : null,
              started ? isoDate(started + item.planned_days * DAY * (state === "ACTIVE" ? 3 : 1)) : null, taskStatus, JSON.stringify(item.required_deliverables), JSON.stringify(deliverables),
              done ? "Submitted with references (demo)." : null, item.is_milestone && done ? 100 : null, done ? doer.id : null, done ? iso(submittedAt) : null,
              taskStatus === "ACCEPTED" ? reviewer.id : null, taskStatus === "ACCEPTED" ? iso(submittedAt + 2 * DAY) : null,
              reworked ? (stage.kind === "CONSTRUCTION" ? "Compaction test failed — layer redone (demo)" : "Figures did not reconcile — revised (demo)") : null,
              reworked ? 1 : 0, item.is_mandatory, item.is_milestone, item.weight]
          );
          if (reworked && item.is_milestone && state !== "LOCKED") {
            await event(assetIds, "MILESTONE_RETURNED", submittedAt - 5 * DAY, { id: team.ee, role: "EE" }, `${workCode} · ${item.title} returned for rework: compaction test failed (demo)`, { workId });
          }
        }

        const gateBy = stage.gate_role === "HQ" ? { id: suresh, role: "HQ" } : stage.gate_role === "COST_LIMIT" ? (spec.sanctioned > 20000000 ? { id: meera, role: "HQ" } : { id: team.ee, role: "EE" }) : { id: team.ee, role: "EE" };
        if (returnedHere) {
          const at = t + days * DAY * 0.55;
          await client.query(
            `insert into stage_evaluations (work_stage_id, work_id, evaluator_id, evaluator_role, outcome, checklist, remarks, evaluated_at)
             values ($1, $2, $3, $4, 'RETURNED', '[]', $5, $6)`,
            [stageId, workId, gateBy.id, gateBy.role, spec.returnRemark ?? "Returned for rework — see remarks on the task (demo)", iso(at)]
          );
          await event(assetIds, "STAGE_RETURNED", at, gateBy, `${workCode} · ${stage.name}: returned — ${spec.returnRemark ?? "rework needed (demo)"}`, { workId });
        }

        if (state === "PASSED") {
          const at = t + days * DAY;
          const data = {};
          if (stage.kind === "APPROVAL") {
            Object.assign(data, { technical_sanction_amount: spec.estimated, sanctioned_amount: spec.sanctioned, ts_ref: `TS/${workCode}`, aa_ref: `AA/${workCode}` });
            for (const [kind, amount, reference] of [["TECHNICAL_SANCTION", spec.estimated, data.ts_ref], ["ADMIN_APPROVAL", spec.sanctioned, data.aa_ref]]) {
              await client.query(
                `insert into work_approvals (work_id, work_stage_id, stage, approver_id, approver_role, decision, amount, reference, decided_at)
                 values ($1, $2, $3, $4, $5, 'APPROVED', $6, $7, $8)`,
                [workId, stageId, kind, gateBy.id, gateBy.role, amount, reference, iso(at)]
              );
            }
            await client.query("update works set sanctioned_amount = $2 where id = $1", [workId, spec.sanctioned]);
          }
          if (stage.kind === "AWARD") {
            const constructionDays = duration(stages.find((candidate) => candidate.kind === "CONSTRUCTION"));
            award = { contractor_id: team.contractor, contract_value: spec.contract, start_date: isoDate(at), planned_end: isoDate(at + (constructionDays - (spec.delayDays ?? 0)) * DAY), dlp_months: 24, tender_ref: `NIT/${workCode}` };
            Object.assign(data, award);
            await client.query(
              "update works set tender_ref = $2, contractor_id = $3, contract_value = $4, start_date = $5, planned_end = $6, dlp_months = $7 where id = $1",
              [workId, award.tender_ref, award.contractor_id, award.contract_value, award.start_date, award.planned_end, award.dlp_months]
            );
            // Contractor tasks in later stages can now be assigned.
            await client.query(
              `update work_tasks set assigned_to = $2, assigned_by = $3, assigned_at = $4 where work_id = $1 and default_assignee_role = 'CONTRACTOR' and assigned_to is null`,
              [workId, team.contractorUser, team.ee, iso(at)]
            );
          }
          if (stage.kind === "DESIGN" && spec.plannedAsset) {
            const type = assetTypes[template.asset_type_code];
            const sub = org[spec.plannedAsset.sub];
            const { rows } = await client.query(
              `insert into assets (asset_code, type_id, name, org_unit_id, district, taluka, road_code, start_chainage_km, end_chainage_km, lat, lng, attributes,
                                   lifecycle_status, criticality, traffic_level, design_life_years, origin_work_id, created_at)
               values ('RDB-' || $1 || '-' || lpad(nextval('asset_code_seq')::text, 6, '0'), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PLANNED', 4, 4, $13, $14, $15)
               returning id`,
              [type.code_prefix, type.id, spec.plannedAsset.name, sub.id, sub.district, sub.name.replace(/ Sub-division$/, ""), spec.plannedAsset.road_code ?? null,
                spec.plannedAsset.start ?? null, spec.plannedAsset.end ?? null, spec.plannedAsset.lat, spec.plannedAsset.lng, JSON.stringify(spec.plannedAsset.attributes ?? {}),
                type.design_life_years, workId, iso(at)]
            );
            assetIds = [rows[0].id];
            await client.query("insert into work_assets (work_id, asset_id, role) values ($1, $2, 'CREATED')", [workId, rows[0].id]);
            // Back-fill the pre-asset history onto the new identity.
            await event(assetIds, "WORK_INITIATED", startAt, { id: spec.initiatedBy ?? meera, role: "HQ" }, `${workCode} initiated: ${spec.title}`, { workId });
            const { rows: previous } = await client.query(
              `select s.name, e.outcome, e.evaluated_at, e.evaluator_id, e.evaluator_role, e.remarks from stage_evaluations e join work_stages s on s.id = e.work_stage_id where e.work_id = $1 order by e.evaluated_at`,
              [workId]
            );
            for (const row of previous) {
              await event(assetIds, row.outcome === "RETURNED" ? "STAGE_RETURNED" : "STAGE_PASSED", new Date(row.evaluated_at).getTime(), { id: row.evaluator_id, role: row.evaluator_role }, `${workCode} · ${row.name}: ${row.outcome.toLowerCase().replaceAll("_", " ")}${row.remarks ? ` — ${row.remarks}` : ""}`, { workId });
            }
            await event(assetIds, "ASSET_REGISTERED", at, gateBy, `Planned asset registered from DPR of ${workCode}`, { workId, to: "PLANNED" });
          }
          if (stage.kind === "HANDOVER") {
            if (spec.existingAssetId) {
              assetIds = [spec.existingAssetId];
              await client.query("insert into work_assets (work_id, asset_id, role) values ($1, $2, 'CREATED') on conflict do nothing", [workId, spec.existingAssetId]);
              await client.query("update assets set origin_work_id = $2, original_cost = coalesce($3, original_cost) where id = $1", [spec.existingAssetId, workId, spec.contract]);
            } else if (spec.targetAssetId) {
              await client.query("update assets set lifecycle_status = 'OPERATIONAL' where id = $1", [spec.targetAssetId]);
            }
            await client.query("update works set actual_end = $2 where id = $1", [workId, isoDate(at)]);
            Object.assign(data, { completion_certificate_ref: `CC/${workCode}` });
          }

          await client.query(
            `insert into stage_evaluations (work_stage_id, work_id, evaluator_id, evaluator_role, outcome, checklist, data, remarks, evaluated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [stageId, workId, gateBy.id, gateBy.role, returnedHere ? "PASSED_WITH_OBSERVATIONS" : "PASSED", JSON.stringify(stage.gate_checklist.map((item) => ({ item, ok: true }))),
              JSON.stringify(data), returnedHere ? "Rework verified" : null, iso(at)]
          );
          if (stage.kind === "DESIGN" && spec.existingAssetId) {
            await event(assetIds, "STAGE_PASSED", at, gateBy, `${workCode} · ${stage.name}: ${returnedHere ? "passed with observations — rework verified" : "passed"}`, { workId });
            await event(assetIds, "ASSET_REGISTERED", at + 60_000, gateBy, `Planned asset registered from DPR of ${workCode}`, { workId, to: "PLANNED" });
          } else if (stage.kind !== "DESIGN" || !spec.plannedAsset) {
            await event(assetIds, stage.kind === "HANDOVER" && template.work_type === "NEW" ? "HANDED_OVER" : "STAGE_PASSED", at, gateBy,
              stage.kind === "HANDOVER" && template.work_type === "NEW"
                ? `Handed over under ${workCode}; completion certificate CC/${workCode}; DLP ${award?.dlp_months ?? 24} months`
                : `${workCode} · ${stage.name}: passed${stage.kind === "AWARD" && award ? ` · awarded for ₹${(award.contract_value / 1e7).toFixed(2)} Cr, DLP 24 months` : ""}`,
              { workId, ...(stage.kind === "HANDOVER" && template.work_type === "NEW" ? { from: "UNDER_CONSTRUCTION", to: "OPERATIONAL" } : {}) });
          }
          if (stage.work_status_on_pass) status = stage.work_status_on_pass;
          if (stage.kind === "CLOSURE" || index === stages.length - 1) deferredEvaluations.push({ workId, at, contractor: award?.contractor_id });

          const next = stages[index + 1];
          if (next?.kind === "CONSTRUCTION") {
            const newStatus = template.work_type === "NEW" ? "UNDER_CONSTRUCTION" : "UNDER_REHABILITATION";
            const fromStatus = template.work_type === "NEW" ? "PLANNED" : "OPERATIONAL";
            if (assetIds.length && (!spec.existingAssetId || spec.targetAssetId)) await client.query("update assets set lifecycle_status = $2 where id = any($1)", [assetIds, newStatus]);
            await event(assetIds, template.work_type === "NEW" ? "CONSTRUCTION_STARTED" : "REHABILITATION_STARTED", at, { id: null, role: "SYSTEM" }, `${workCode} execution started`, { workId, from: fromStatus, to: newStatus });
          }
          t = at;
        } else if (state === "ACTIVE") {
          t = t + (spec.activeElapsed ?? 10) * DAY;
        }
      }

      if (activeIndex >= stages.length) status = stages[stages.length - 1].work_status_on_pass ?? "CLOSED";
      await client.query(
        `update works set status = $2, current_stage_id = $3, closed_at = case when $2 = 'CLOSED' then now() else null end,
                progress_pct = coalesce((select round(100 * sum(weight) filter (where status = 'ACCEPTED') / nullif(sum(weight), 0), 2) from work_tasks where work_id = $1 and is_milestone), 0)
          where id = $1`,
        [workId, status, currentStageId]
      );
      return { workId, workCode, assetIds };
    }

    const now = Date.now();
    const sum = (template, until) => {
      let total = 0;
      for (const stage of templates[template].stages) {
        if (stage.code === until) break;
        total += DURATIONS[stage.code] ?? stage.planned_days;
      }
      return total;
    };

    // 1. Hero bridge: full journey ending in handover on its commissioning date; now inside DLP.
    const { rows: hero } = await client.query("select id, commissioned_on from assets where asset_code = 'RDB-BR-000001'");
    const heroHandover = new Date(hero[0].commissioned_on).getTime();
    const heroWork = await simulate({
      template: "NEW_BRIDGE", division: "DIV-AMD", programme: "RCB-2026-27", title: "Daskroi River Bridge — new 6-span PSC bridge (Demo)",
      objective: "Replace a low-level causeway that overtops every monsoon", estimated: 192000000, sanctioned: 188000000, contract: 184500000,
      existingAssetId: hero[0].id, activeStage: "DLP_CLOSURE", activeElapsed: Math.round((now - heroHandover) / DAY), returnedGate: "DESIGN",
      returnRemark: "Scour depth assumption not supported by soil report", reworkMilestone: 2, priority: "HIGH", initiation: "DIRECTIVE",
      startAt: heroHandover - (sum("NEW_BRIDGE", "DLP_CLOSURE") + DURATIONS.HANDOVER) * DAY + DURATIONS.HANDOVER * DAY
    });
    context.heroWorkId = heroWork.workId;

    // 2. Hero new road: mid-construction — stages 0–4 done, milestones partly accepted, one awaiting review.
    const heroRoad = await simulate({
      template: "NEW_ROAD", division: "DIV-AMD", programme: "SHIP-2026-27", title: "Sanand–Dholka link road, new 2-lane (Demo)",
      objective: "All-weather connectivity between two taluka headquarters", estimated: 248000000, sanctioned: 241000000, contract: 236500000,
      plannedAsset: { name: "DMO-AMD-21 Sanand–Dholka link road, km 0–14.2", sub: "SUB-SAN", road_code: "DMO-AMD-21", start: 0, end: 14.2, lat: 22.9, lng: 72.38, attributes: { road_category: "Major District Road", carriageway: "Two lane", surface_type: "Bituminous", width_m: 7 } },
      activeStage: "CONSTRUCTION", activeTasks: ["ACCEPTED", "ACCEPTED", "ACCEPTED", "SUBMITTED", "PENDING", "PENDING", "PENDING"], activeElapsed: 95, returnedGate: "DESIGN",
      returnRemark: "BoQ drainage quantities do not match drawings", reworkMilestone: 1, priority: "HIGH",
      startAt: now - (sum("NEW_ROAD", "CONSTRUCTION") + 95) * DAY
    });
    context.heroRoadWorkId = heroRoad.workId;

    // 3. Ready for handover: every handover task accepted, awaiting the HQ gate (live demo step).
    await simulate({
      template: "NEW_BRIDGE", division: "DIV-AMD", programme: "RCB-2026-27", title: "Sanand minor bridge on branch canal (Demo)",
      estimated: 46000000, sanctioned: 45000000, contract: 43800000,
      plannedAsset: { name: "Sanand Canal Minor Bridge (Demo)", sub: "SUB-SAN", lat: 22.99, lng: 72.37, attributes: { structure_type: "RCC Girder", span_count: 3, total_length_m: 48, load_class: "IRC Class AA", crossing: "Canal (demo)" } },
      activeStage: "HANDOVER", activeTasks: ["ACCEPTED", "ACCEPTED", "ACCEPTED", "ACCEPTED"], activeElapsed: 12,
      startAt: now - (sum("NEW_BRIDGE", "HANDOVER") + 12) * DAY
    });

    // 4. Approved, awaiting award (×3) — one with every task accepted, awaiting HQ's award gate.
    for (const [division, template, title, estimated, pattern, sub] of [
      ["DIV-AMD", "NEW_ROAD", "Dholka bypass, 4.8 km (Demo)", 96000000, ["SUBMITTED", "PENDING", "PENDING"], "SUB-DHO"],
      ["DIV-SUR", "NEW_BUILDING", "Olpad Taluka Seva Sadan (Demo)", 38000000, ["ACCEPTED", "SUBMITTED", "PENDING"], "SUB-OLP"],
      ["DIV-SUR", "NEW_ROAD", "Kamrej–Olpad link road (Demo)", 132000000, ["ACCEPTED", "ACCEPTED", "ACCEPTED"], "SUB-KAM"]
    ]) {
      const road = template === "NEW_ROAD";
      await simulate({
        template, division, programme: road ? "SHIP-2026-27" : "RCB-2026-27", title, estimated, sanctioned: Math.round(estimated * 0.97), contract: null,
        plannedAsset: road
          ? { name: title.replace(" (Demo)", ""), sub, road_code: `DMO-${division.slice(4)}-3${title.length % 9}`, start: 0, end: 6, lat: division === "DIV-AMD" ? 22.81 : 21.33, lng: division === "DIV-AMD" ? 72.44 : 72.87, attributes: { road_category: "Other District Road", carriageway: "Two lane", surface_type: "Bituminous" } }
          : { name: title, sub, lat: 21.34, lng: 72.75, attributes: { building_use: "Office", floors: 2, plinth_area_sqm: 1800 } },
        activeStage: "TENDER_AWARD", activeTasks: pattern, activeElapsed: 20, startAt: now - (sum(template, "TENDER_AWARD") + 20) * DAY
      });
    }

    // 5. Early-stage works: survey running late; design returned once.
    await simulate({
      template: "NEW_ROAD", division: "DIV-AMD", programme: "SHIP-2026-27", title: "Daskroi ring road phase 1 (Demo)", estimated: 310000000,
      activeStage: "SURVEY", activeTasks: ["ACCEPTED", "SUBMITTED", "PENDING", "PENDING"], activeElapsed: 52, startAt: now - (10 + 52) * DAY
    });
    await simulate({
      template: "NEW_BRIDGE", division: "DIV-SUR", programme: "RCB-2026-27", title: "Bardoli minor bridge replacement (Demo)", estimated: 27000000,
      activeStage: "DESIGN", activeTasks: ["ACCEPTED", "RETURNED", "SUBMITTED"], returnedGate: "DESIGN", activeElapsed: 34, startAt: now - (10 + 40 + 34) * DAY
    });

    // 6. Within the EE's ₹2 Cr limit: approvals stage waiting for Rohit's gate.
    await simulate({
      template: "NEW_BUILDING", division: "DIV-AMD", programme: "RCB-2026-27", title: "Sanand Sub-division Office building (Demo)", estimated: 16000000, sanctioned: 15500000,
      plannedAsset: { name: "Sanand Sub-division Office (Demo)", sub: "SUB-SAN", lat: 22.99, lng: 72.38, attributes: { building_use: "Office", floors: 2, plinth_area_sqm: 950 } },
      activeStage: "APPROVALS", activeTasks: ["ACCEPTED", "ACCEPTED", "ACCEPTED"], activeElapsed: 9, startAt: now - (sum("NEW_BUILDING", "APPROVALS") + 9) * DAY
    });

    // 7. Fresh initiation from a deposit request, awaiting review.
    await simulate({
      template: "NEW_ROAD", division: "DIV-AMD", title: "Approach road to industrial estate — deposit work (Demo)", estimated: 58000000, initiation: "DEPOSIT_REQUEST",
      activeStage: "INITIATION", activeTasks: ["SUBMITTED", "PENDING"], activeElapsed: 3, startAt: now - 3 * DAY
    });

    // 8. Repair works on existing assets.
    const { rows: poorBridge } = await client.query(
      `select a.id from assets a join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id join org_units d on d.id = o.parent_id
        where d.code = 'DIV-AMD' and t.code = 'BRIDGE' and a.lifecycle_status = 'OPERATIONAL' and a.asset_code <> 'RDB-BR-000001' and a.asset_code ~ '-000[0-9]{3}$'
        order by a.condition_rating, a.asset_code limit 1`
    );
    if (poorBridge[0]) {
      await simulate({
        template: "REPAIR_REHAB", division: "DIV-AMD", title: "Bearing replacement and deck re-surfacing (Demo)", estimated: 8500000, sanctioned: 8200000, contract: 7900000,
        targetAssetId: poorBridge[0].id, initiation: "FIELD_NEED", activeStage: "CONSTRUCTION", activeTasks: ["SUBMITTED"], activeElapsed: 20,
        durations: { NEED_ESTIMATE: 10, APPROVALS: 14, TENDER_AWARD: 21 }, startAt: now - (10 + 14 + 21 + 20) * DAY
      });
    }
    const { rows: suratCulvert } = await client.query(
      `select a.id from assets a join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id join org_units d on d.id = o.parent_id
        where d.code = 'DIV-SUR' and t.code = 'CULVERT' and a.lifecycle_status = 'OPERATIONAL' and a.asset_code ~ '-000[0-9]{3}$' order by a.asset_code limit 1`
    );
    if (suratCulvert[0]) {
      await simulate({
        template: "EMERGENCY", division: "DIV-SUR", title: "Monsoon washout — culvert reconstruction (Demo)", estimated: 4200000, sanctioned: 4100000, contract: 3950000,
        targetAssetId: suratCulvert[0].id, initiation: "EMERGENCY", priority: "CRITICAL", activeStage: "DONE", delayDays: 6,
        durations: { IMMEDIATE: 2, APPROVALS: 7, TENDER_AWARD: 7, CONSTRUCTION: 45, HANDOVER: 7 }, startAt: now - 95 * DAY
      });
    }

    // 9. Origin works for in-DLP roads/bridges/buildings in Ahmedabad and Surat (handover = commissioning date).
    const { rows: dlpAssets } = await client.query(
      `select a.id, a.name, a.commissioned_on, a.original_cost, t.code as type_code, d.code as division
         from assets a join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id join org_units d on d.id = o.parent_id
        where a.dlp_end_date >= current_date and a.origin_work_id is null and a.asset_code <> 'RDB-BR-000001'
          and d.code in ('DIV-AMD', 'DIV-SUR') and t.code in ('ROAD_SEGMENT', 'BRIDGE', 'BUILDING')`
    );
    const templateFor = { ROAD_SEGMENT: "NEW_ROAD", BRIDGE: "NEW_BRIDGE", BUILDING: "NEW_BUILDING" };
    for (const asset of dlpAssets) {
      const template = templateFor[asset.type_code];
      const handover = new Date(asset.commissioned_on).getTime();
      const cost = Number(asset.original_cost ?? 50000000);
      await simulate({
        template, division: asset.division, programme: template === "NEW_ROAD" ? "SHIP-2026-27" : "RCB-2026-27", title: `Construction of ${asset.name.replace(" (Demo)", "")} (Demo)`,
        estimated: Math.round(cost * 1.06), sanctioned: Math.round(cost * 1.03), contract: cost, existingAssetId: asset.id, activeStage: "DLP_CLOSURE",
        activeElapsed: Math.round((now - handover) / DAY), startAt: handover - (sum(template, "DLP_CLOSURE") - DURATIONS.HANDOVER) * DAY - DURATIONS.HANDOVER * DAY
      });
    }

    // 10. One fully closed new work with a contractor evaluation (DLP over).
    const { rows: oldRoad } = await client.query(
      `select a.id, a.name, a.commissioned_on, a.original_cost from assets a join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id join org_units d on d.id = o.parent_id
        where d.code = 'DIV-AMD' and t.code = 'ROAD_SEGMENT' and a.origin_work_id is null and a.lifecycle_status = 'OPERATIONAL'
          and a.commissioned_on between current_date - interval '5 years' and current_date - interval '3 years' order by a.asset_code limit 1`
    );
    if (oldRoad[0]) {
      const handover = new Date(oldRoad[0].commissioned_on).getTime();
      await simulate({
        template: "NEW_ROAD", division: "DIV-AMD", programme: "SHIP-2026-27", title: `Construction of ${oldRoad[0].name} (Demo)`, estimated: 62000000, sanctioned: 60000000, contract: 57500000,
        existingAssetId: oldRoad[0].id, activeStage: "DONE", reworkMilestone: 4, delayDays: 21,
        startAt: handover - (sum("NEW_ROAD", "DLP_CLOSURE") - DURATIONS.HANDOVER) * DAY - DURATIONS.HANDOVER * DAY
      });
    }

    for (const item of deferredEvaluations) {
      if (!item.contractor) continue;
      const score = await computeContractorEvaluation(client, item.workId);
      await client.query(
        `insert into contractor_evaluations (work_id, contractor_id, evaluator_id, schedule_score, quality_score, rework_score, dlp_score, documentation_score, total_score, inputs, remarks, evaluated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Recorded at closure (demo)', $11) on conflict (work_id) do nothing`,
        [item.workId, item.contractor, suresh, score.schedule, score.quality, score.rework, score.dlp, score.documentation, score.total, JSON.stringify(score.inputs), iso(item.at)]
      );
    }

    // Assets that now have an origin work no longer need the "imported from legacy register" line (seed-only data shaping).
    await client.query("alter table lifecycle_events disable trigger lifecycle_events_append_only");
    await client.query(
      `delete from lifecycle_events e using assets a
        where e.asset_id = a.id and a.origin_work_id is not null and e.event_type = 'ASSET_REGISTERED' and e.actor_role = 'SYSTEM'
          and e.remarks like 'Imported from the legacy asset register%'`
    );
    await client.query("alter table lifecycle_events enable trigger lifecycle_events_append_only");
  }
};
