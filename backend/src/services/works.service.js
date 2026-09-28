import { query, withTransaction } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { getScopedAsset, recomputeRisk, transitionAssetStatus, validateAttributes } from "./assets.service.js";
import { audit, lifecycleEvent } from "./audit.service.js";
import { assertOrgUnitInScope } from "./jurisdiction.service.js";
import { assertOwnedPaths, signedUrls } from "./storage.service.js";

const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => new Date(Date.now() + days * DAY);
const formatRupees = (value) => (value >= 1e7 ? `₹${(value / 1e7).toFixed(2)} Cr` : `₹${(value / 1e5).toFixed(2)} L`);

// ---------- scope ----------

// Works live at division level; officers see works in their subtree, AEs see works of their division,
// contractors see works they hold or have tasks on.
export function workScope(user, params) {
  if (user.role === "HQ") return "true";
  if (user.role === "CONTRACTOR") {
    params.push(user.contractor_id, user.id);
    return `(w.contractor_id = $${params.length - 1} or exists (select 1 from work_tasks st where st.work_id = w.id and st.assigned_to = $${params.length}))`;
  }
  params.push(user.org_path);
  const p = `$${params.length}`;
  return `(o.path like ${p} || '%' or ${p} like o.path || '%')`;
}

function canManage(user, work) {
  return user.role === "HQ" || (user.role === "EE" && work.org_path.startsWith(user.org_path));
}

const WORK_SELECT = `select w.*, o.path as org_path, o.name as org_unit_name, t.code as template_code, t.name as template_name,
       t.asset_type_code, p.name as programme_name, p.code as programme_code, c.name as contractor_name,
       cs.name as current_stage_name, cs.code as current_stage_code, cs.kind as current_stage_kind, cs.seq as current_stage_seq,
       cs.started_at as current_stage_started_at, cs.due_at as current_stage_due_at, cs.status as current_stage_status,
       iu.name as initiated_by_name
  from works w
  join org_units o on o.id = w.org_unit_id
  left join work_templates t on t.id = w.template_id
  left join programmes p on p.id = w.programme_id
  left join contractors c on c.id = w.contractor_id
  left join work_stages cs on cs.id = w.current_stage_id
  left join users iu on iu.id = w.initiated_by`;

export async function getScopedWork(user, id) {
  const { rows } = await query(`${WORK_SELECT} where w.id = $1`, [id]);
  const work = rows[0];
  if (!work) throw AppError.notFound("Work not found");
  if (user.role === "HQ") return work;
  if (user.role === "CONTRACTOR") {
    if (work.contractor_id === user.contractor_id) return work;
    const { rows: tasks } = await query("select 1 from work_tasks where work_id = $1 and assigned_to = $2 limit 1", [id, user.id]);
    if (tasks.length) return work;
    throw AppError.forbidden("This work is outside your contracts");
  }
  if (work.org_path.startsWith(user.org_path) || user.org_path.startsWith(work.org_path)) return work;
  throw AppError.forbidden("This work is outside your jurisdiction");
}

async function workAssets(runner, workId, role) {
  const { rows } = await runner(
    `select a.id, a.lifecycle_status from work_assets wa join assets a on a.id = wa.asset_id where wa.work_id = $1 ${role ? "and wa.role = $2" : ""}`,
    role ? [workId, role] : [workId]
  );
  return rows;
}

async function logOnAssets(client, workId, event) {
  for (const asset of await workAssets((text, params) => client.query(text, params), workId)) {
    await lifecycleEvent({ ...event, assetId: asset.id, refType: event.refType ?? "work", refId: event.refId ?? workId }, client);
  }
}

// ---------- templates & programmes ----------

export async function listTemplates() {
  const { rows } = await query(
    `select t.id, t.code, t.name, t.work_type, t.asset_type_code, t.description,
            coalesce(json_agg(json_build_object('seq', s.seq, 'code', s.code, 'name', s.name, 'kind', s.kind, 'gate_role', s.gate_role, 'planned_days', s.planned_days,
              'tasks', (select count(*) from task_templates tt where tt.stage_template_id = s.id)) order by s.seq), '[]') as stages
       from work_templates t left join stage_templates s on s.template_id = t.id
      where t.is_active group by t.id order by t.work_type, t.name`
  );
  return rows;
}

export async function listProgrammes(user) {
  const params = [];
  const scope = workScope(user, params);
  const { rows } = await query(
    `select p.*, ou.name as owner_org_unit_name,
            (select count(*)::int from works w join org_units o on o.id = w.org_unit_id where w.programme_id = p.id and ${scope}) as works_count,
            (select coalesce(sum(w.sanctioned_amount), 0) from works w where w.programme_id = p.id) as sanctioned_total,
            (select coalesce(sum(w.contract_value), 0) from works w where w.programme_id = p.id) as contracted_total,
            (select coalesce(sum(w.contract_value * w.progress_pct / 100), 0) from works w where w.programme_id = p.id) as value_of_work_done
       from programmes p join org_units ou on ou.id = p.owner_org_unit_id
      order by p.financial_year desc, p.name`,
    params
  );
  return rows;
}

export async function createProgramme(user, input, ip) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into programmes (code, name, description, financial_year, budget_head, allocated_amount, owner_org_unit_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [input.code, input.name, input.description ?? null, input.financial_year, input.budget_head ?? null, input.allocated_amount, user.org_unit_id, user.id]
    );
    await audit({ user, action: "PROGRAMME_CREATED", entity: "programme", entityId: rows[0].id, diff: { after: input }, ip }, client);
    return rows[0];
  });
}

// ---------- initiation ----------

export async function createWork(user, input, ip) {
  await assertOrgUnitInScope(user, input.org_unit_id);
  const [{ rows: templates }, { rows: units }] = await Promise.all([
    query("select * from work_templates where code = $1 and is_active", [input.template_code]),
    query("select id, type, path, name from org_units where id = $1", [input.org_unit_id])
  ]);
  const template = templates[0];
  if (!template) throw AppError.badRequest("Unknown work template");
  if (units[0].type !== "DIVISION") throw AppError.badRequest("Assign the work to a responsible division");
  if (input.programme_id) {
    const { rows } = await query("select 1 from programmes where id = $1 and status = 'ACTIVE'", [input.programme_id]);
    if (!rows.length) throw AppError.badRequest("Programme not found or closed");
  }

  let plannedAsset = null;
  const targets = [];
  if (template.asset_type_code) {
    const spec = input.planned_asset;
    if (!spec?.name || !spec?.org_unit_id) throw AppError.badRequest("Describe the asset this work will create (name and sub-division)");
    const { rows: subs } = await query("select id, type, path from org_units where id = $1", [spec.org_unit_id]);
    if (!subs[0] || subs[0].type !== "SUBDIVISION" || !subs[0].path.startsWith(units[0].path)) {
      throw AppError.badRequest("The asset's sub-division must be inside the responsible division");
    }
    const { rows: types } = await query("select category, attribute_schema from asset_types where code = $1", [template.asset_type_code]);
    if (types[0].category === "ROAD" && (!spec.road_code || spec.start_chainage_km == null || spec.end_chainage_km == null)) {
      throw AppError.badRequest("A new road needs a road code and start/end chainage");
    }
    plannedAsset = { ...spec, attributes: validateAttributes(types[0].attribute_schema, spec.attributes ?? {}, { partial: true }) };
  } else {
    if (!input.target_asset_ids?.length) throw AppError.badRequest("Pick the asset(s) this work will repair");
    for (const assetId of input.target_asset_ids) {
      const asset = await getScopedAsset(user, assetId);
      if (!asset.org_path.startsWith(units[0].path)) throw AppError.badRequest(`${asset.asset_code} is outside the responsible division`);
      targets.push(asset);
    }
  }

  // The responsible division's EE is notified that a work has landed on their desk.
  const { rows: eeRows } = await query("select u.id from users u where u.role = 'EE' and u.is_active and u.org_unit_id = $1 limit 1", [input.org_unit_id]);
  const divisionEE = eeRows[0]?.id && eeRows[0].id !== user.id ? eeRows[0].id : null;

  return withTransaction(async (client) => {
    const { rows: stages } = await client.query("select * from stage_templates where template_id = $1 order by seq", [template.id]);
    const { rows: taskTemplates } = await client.query(
      "select tt.* from task_templates tt join stage_templates st on st.id = tt.stage_template_id where st.template_id = $1 order by st.seq, tt.seq",
      [template.id]
    );

    const { rows: workRows } = await client.query(
      `insert into works (work_code, title, description, objective, work_type, status, org_unit_id, programme_id, template_id,
                          initiation_type, initiated_by, initiation_ref, initiation_date, priority, source_type, source_ref,
                          estimated_cost, target_start, target_end, planned_asset, created_by)
       values ('WK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('work_code_seq')::text, 4, '0'),
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $10)
       returning *`,
      [
        input.title,
        input.description ?? null,
        input.objective ?? null,
        template.work_type,
        stages[0].work_status_on_enter ?? "PROPOSED",
        input.org_unit_id,
        input.programme_id ?? null,
        template.id,
        input.initiation_type,
        user.id,
        input.initiation_ref ?? null,
        input.initiation_date ?? today(),
        input.priority ?? "MEDIUM",
        input.source_type ?? input.initiation_type,
        input.source_ref ?? null,
        input.estimated_cost,
        input.target_start ?? null,
        input.target_end ?? null,
        plannedAsset ? JSON.stringify(plannedAsset) : null
      ]
    );
    const work = workRows[0];

    let firstStageId = null;
    for (const stage of stages) {
      const active = stage.seq === 0;
      const { rows } = await client.query(
        `insert into work_stages (work_id, stage_template_id, seq, code, name, kind, status, gate_role, gate_checklist, planned_days,
                                  work_status_on_enter, work_status_on_pass, started_at, due_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
        [work.id, stage.id, stage.seq, stage.code, stage.name, stage.kind, active ? "ACTIVE" : "LOCKED", stage.gate_role, JSON.stringify(stage.gate_checklist),
          stage.planned_days, stage.work_status_on_enter, stage.work_status_on_pass, active ? new Date() : null, active ? addDays(stage.planned_days) : null]
      );
      if (active) firstStageId = rows[0].id;
      for (const item of taskTemplates.filter((candidate) => candidate.stage_template_id === stage.id)) {
        // Initiation tasks belong to the initiator; the rest are assigned by the responsible officer.
        const mine = active && item.default_assignee_role === user.role;
        await client.query(
          `insert into work_tasks (work_id, work_stage_id, task_template_id, seq, title, default_assignee_role, required_deliverables,
                                   is_mandatory, is_milestone, weight, assigned_to, assigned_by, assigned_at, due_date)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13)`,
          [work.id, rows[0].id, item.id, item.seq, item.title, item.default_assignee_role, JSON.stringify(item.required_deliverables), item.is_mandatory,
            item.is_milestone, item.weight, mine ? user.id : null, mine ? new Date() : null, active ? addDays(item.planned_days).toISOString().slice(0, 10) : null]
        );
      }
    }
    await client.query("update works set current_stage_id = $2 where id = $1", [work.id, firstStageId]);

    for (const asset of targets) {
      await client.query("insert into work_assets (work_id, asset_id, role) values ($1, $2, 'TARGET')", [work.id, asset.id]);
      await lifecycleEvent(
        { assetId: asset.id, eventType: "WORK_INITIATED", user, refType: "work", refId: work.id, remarks: `${work.work_code} initiated: ${work.title}` },
        client
      );
    }
    await audit(
      {
        user,
        action: "WORK_INITIATED",
        entity: "work",
        entityId: work.id,
        diff: { work_id: work.id, after: { work_code: work.work_code, template: template.code, estimated_cost: input.estimated_cost, initiation_ref: input.initiation_ref } },
        ip,
        targetUserId: divisionEE
      },
      client
    );
    return { id: work.id, work_code: work.work_code };
  });
}

// ---------- journey ----------

function taskActions(user, work, stage, task) {
  const actions = [];
  const manage = canManage(user, work);
  if (manage && ["LOCKED", "ACTIVE"].includes(stage.status) && !["ACCEPTED", "SKIPPED"].includes(task.status)) actions.push("assign");
  if (stage.status === "ACTIVE" && task.assigned_to === user.id && ["PENDING", "RETURNED"].includes(task.status)) actions.push("submit");
  if (manage && stage.status === "ACTIVE" && task.status === "SUBMITTED" && task.submitted_by !== user.id && task.assigned_to !== user.id) actions.push("accept", "return");
  return actions;
}

async function gateAuthority(user, work, stage, amount) {
  if (stage.gate_role === "HQ") {
    return user.role === "HQ" ? { ok: true } : { ok: false, reason: "This gate is evaluated at HQ" };
  }
  if (!canManage(user, work)) return { ok: false, reason: "Only the responsible EE or HQ evaluates this gate" };
  if (stage.gate_role === "EE") return { ok: true };
  const { rows } = await query(
    "select max_amount, label from approval_limits where role = $1 and (work_type = $2 or work_type is null) order by work_type nulls last limit 1",
    [user.role, work.work_type]
  );
  const limit = rows[0];
  if (!limit) return { ok: false, reason: `${user.role} has no delegated financial power` };
  if (limit.max_amount != null && amount > Number(limit.max_amount)) {
    return { ok: false, reason: `${formatRupees(amount)} exceeds your approval limit of ${formatRupees(Number(limit.max_amount))} — escalate to HQ`, limit: limit.label };
  }
  return { ok: true, limit: limit.label };
}

function whoHasFile(work, stages) {
  const current = stages.find((stage) => stage.status === "ACTIVE");
  if (!current) return null;
  const pending = current.tasks.filter((task) => task.is_mandatory && task.status !== "ACCEPTED" && task.status !== "SKIPPED");
  const daysInStage = Math.floor((Date.now() - new Date(current.started_at).getTime()) / DAY);
  const delayed = current.due_at && new Date(current.due_at) < new Date();
  if (pending.length) {
    const unassigned = pending.filter((task) => !task.assigned_to);
    const withPeople = [...new Set(pending.filter((task) => task.assigned_to).map((task) => `${task.assigned_to_name} (${task.status === "SUBMITTED" ? "awaiting review" : task.status.toLowerCase()})`))];
    return {
      stage: current.name,
      days_in_stage: daysInStage,
      delayed,
      holder: withPeople.length ? withPeople.join(", ") : "Responsible EE (tasks to assign)",
      summary: `${pending.length} task(s) pending${unassigned.length ? `, ${unassigned.length} unassigned` : ""}`,
      next_gate: current.gate_role === "COST_LIMIT" ? "Approver by cost limit" : current.gate_role === "HQ" ? "HQ" : "Responsible EE"
    };
  }
  return {
    stage: current.name,
    days_in_stage: daysInStage,
    delayed,
    holder: current.gate_role === "HQ" ? "HQ (gate evaluation)" : current.gate_role === "COST_LIMIT" ? `Approver for ${formatRupees(Number(work.estimated_cost ?? 0))}` : "Responsible EE (gate evaluation)",
    summary: "All tasks accepted — awaiting gate evaluation",
    next_gate: current.gate_role
  };
}

export async function getWorkJourney(user, id) {
  const work = await getScopedWork(user, id);
  const [stages, tasks, evaluations, approvals, assets, evaluation] = await Promise.all([
    query("select * from work_stages where work_id = $1 order by seq", [id]),
    query(
      `select t.*, a.name as assigned_to_name, a.role as assigned_to_role, s.name as submitted_by_name, r.name as reviewed_by_name, ab.name as assigned_by_name
         from work_tasks t left join users a on a.id = t.assigned_to left join users s on s.id = t.submitted_by left join users r on r.id = t.reviewed_by
         left join users ab on ab.id = t.assigned_by
        where t.work_id = $1 order by t.seq`,
      [id]
    ),
    query(
      `select e.*, u.name as evaluator_name from stage_evaluations e left join users u on u.id = e.evaluator_id where e.work_id = $1 order by e.evaluated_at`,
      [id]
    ),
    query(`select wa.*, u.name as approver_name from work_approvals wa left join users u on u.id = wa.approver_id where wa.work_id = $1 order by wa.decided_at`, [id]),
    query(
      `select wa.role, a.id, a.asset_code, a.name, a.lifecycle_status, a.condition_rating, a.dlp_end_date
         from work_assets wa join assets a on a.id = wa.asset_id where wa.work_id = $1`,
      [id]
    ),
    query(`select ce.*, u.name as evaluator_name from contractor_evaluations ce left join users u on u.id = ce.evaluator_id where ce.work_id = $1`, [id])
  ]);

  const allPaths = tasks.rows.flatMap((task) => task.photo_paths);
  const signed = Object.fromEntries((await signedUrls(allPaths)).map((item) => [item.path, item.url]));

  const journey = [];
  for (const stage of stages.rows) {
    const stageTasks = tasks.rows
      .filter((task) => task.work_stage_id === stage.id)
      .map((task) => ({
        ...task,
        photos: task.photo_paths.map((path) => ({ path, url: signed[path] ?? null })),
        is_overdue: task.due_date && task.due_date < today() && !["ACCEPTED", "SKIPPED"].includes(task.status),
        actions: taskActions(user, work, stage, task)
      }));
    let gate = null;
    if (stage.status === "ACTIVE") {
      const authority = await gateAuthority(user, work, stage, Number(work.sanctioned_amount ?? work.estimated_cost ?? 0));
      const involved = stageTasks.some((task) => task.assigned_to === user.id || task.submitted_by === user.id);
      const pending = stageTasks.filter((task) => task.is_mandatory && !["ACCEPTED", "SKIPPED"].includes(task.status)).length;
      gate = {
        can_evaluate: authority.ok && !involved,
        reason: !authority.ok ? authority.reason : involved ? "You worked on this stage's tasks — an independent officer must evaluate" : null,
        pending_tasks: pending,
        limit: authority.limit ?? null
      };
    }
    journey.push({
      ...stage,
      is_delayed: stage.status === "ACTIVE" && stage.due_at && new Date(stage.due_at) < new Date(),
      tasks: stageTasks,
      evaluations: evaluations.rows.filter((row) => row.work_stage_id === stage.id),
      gate
    });
  }

  const { org_path, ...rest } = work;
  return {
    ...rest,
    stages: journey,
    approvals: approvals.rows,
    assets: assets.rows,
    contractor_evaluation: evaluation.rows[0] ?? null,
    who_has_file: whoHasFile(work, journey),
    can_manage: canManage(user, work)
  };
}

// ---------- tasks ----------

async function loadTaskForUpdate(client, taskId) {
  const { rows } = await client.query(
    `select t.*, s.status as stage_status, s.name as stage_name, s.seq as stage_seq
       from work_tasks t join work_stages s on s.id = t.work_stage_id where t.id = $1 for update of t`,
    [taskId]
  );
  if (!rows[0]) throw AppError.notFound("Task not found");
  return rows[0];
}

export async function getScopedTask(user, taskId) {
  const { rows } = await query("select work_id from work_tasks where id = $1", [taskId]);
  if (!rows[0]) throw AppError.notFound("Task not found");
  const work = await getScopedWork(user, rows[0].work_id);
  return { work };
}

export async function assignTask(user, taskId, { assigned_to, due_date }, ip) {
  const { work } = await getScopedTask(user, taskId);
  if (!canManage(user, work)) throw AppError.forbidden("Only the responsible EE or HQ assigns tasks");
  const { rows: people } = await query(
    "select u.id, u.name, u.role, u.contractor_id, o.path from users u join org_units o on o.id = u.org_unit_id where u.id = $1 and u.is_active",
    [assigned_to]
  );
  const assignee = people[0];
  if (!assignee) throw AppError.badRequest("Assignee not found");

  return withTransaction(async (client) => {
    const task = await loadTaskForUpdate(client, taskId);
    if (!["LOCKED", "ACTIVE"].includes(task.stage_status)) throw AppError.invalidTransition(`Stage "${task.stage_name}" is closed`);
    if (["ACCEPTED", "SKIPPED"].includes(task.status)) throw AppError.invalidTransition("This task is already accepted");
    if (task.default_assignee_role === "CONTRACTOR") {
      if (assignee.role !== "CONTRACTOR") throw AppError.badRequest("This task is performed by the contractor");
      if (!work.contractor_id) throw AppError.invalidTransition("Award the work before assigning contractor tasks");
      if (assignee.contractor_id !== work.contractor_id) throw AppError.badRequest("Assign to the contractor holding this work");
    } else {
      if (assignee.role === "CONTRACTOR") throw AppError.badRequest("This task is performed by the department");
      const related = assignee.role === "HQ" || assignee.path.startsWith(work.org_path) || work.org_path.startsWith(assignee.path);
      if (!related) throw AppError.badRequest("Assignee works outside this work's division");
    }
    await client.query(
      "update work_tasks set assigned_to = $2, assigned_by = $3, assigned_at = now(), due_date = coalesce($4, due_date, current_date + 7) where id = $1",
      [taskId, assignee.id, user.id, due_date ?? null]
    );
    await audit({ user, action: "TASK_ASSIGNED", entity: "work_task", entityId: taskId, diff: { work_id: work.id, task: task.title, assigned_to: assignee.name, due_date }, ip, targetUserId: assignee.id }, client);
    return { id: taskId, assigned_to: assignee.id, assigned_to_name: assignee.name };
  });
}

export async function submitTask(user, taskId, { note, deliverables = [], photo_paths = [], progress_pct }, ip) {
  const { work } = await getScopedTask(user, taskId);
  assertOwnedPaths(photo_paths, `progress/${taskId}/`);
  return withTransaction(async (client) => {
    const task = await loadTaskForUpdate(client, taskId);
    if (task.assigned_to !== user.id) throw AppError.forbidden("Only the assignee can submit this task");
    if (task.stage_status !== "ACTIVE") throw AppError.invalidTransition(`Stage "${task.stage_name}" is not open yet — earlier stages must pass their gates first`);
    if (!["PENDING", "RETURNED"].includes(task.status)) throw AppError.invalidTransition(`Task is ${task.status.toLowerCase()}`);

    const provided = new Map(deliverables.filter((item) => item.reference?.trim()).map((item) => [item.label, item.reference.trim()]));
    const missing = task.required_deliverables.filter((label) => !provided.has(label) && !(/photo/i.test(label) && photo_paths.length));
    if (missing.length) throw AppError.badRequest(`Missing required deliverables: ${missing.join(", ")}`, missing.map((label) => ({ field: label, message: "Required" })));

    await client.query(
      `update work_tasks set status = 'SUBMITTED', submission_note = $2, deliverables = $3, photo_paths = $4, progress_pct = $5,
              submitted_by = $6, submitted_at = now() where id = $1`,
      [taskId, note ?? null, JSON.stringify([...provided].map(([label, reference]) => ({ label, reference }))), photo_paths, progress_pct ?? null, user.id]
    );
    await audit(
      { user, action: "TASK_SUBMITTED", entity: "work_task", entityId: taskId, diff: { work_id: work.id, task: task.title, deliverables: [...provided.keys()], resubmission: task.status === "RETURNED" }, ip, targetUserId: task.assigned_by },
      client
    );
    return { id: taskId, status: "SUBMITTED" };
  });
}

async function recomputeProgress(client, workId) {
  await client.query(
    `update works set progress_pct = coalesce((
        select round(100 * sum(weight) filter (where status = 'ACCEPTED') / nullif(sum(weight), 0), 2)
          from work_tasks where work_id = $1 and is_milestone), progress_pct)
      where id = $1`,
    [workId]
  );
}

export async function reviewTask(user, taskId, decision, { remarks }, ip) {
  const { work } = await getScopedTask(user, taskId);
  if (!canManage(user, work)) throw AppError.forbidden("Only the responsible EE or HQ reviews submissions");
  if (decision === "return" && !remarks?.trim()) throw AppError.badRequest("Say what needs rework");
  return withTransaction(async (client) => {
    const task = await loadTaskForUpdate(client, taskId);
    if (task.stage_status !== "ACTIVE") throw AppError.invalidTransition("Stage is not open");
    if (task.status !== "SUBMITTED") throw AppError.invalidTransition(`Task is ${task.status.toLowerCase()}, not awaiting review`);
    if (task.submitted_by === user.id || task.assigned_to === user.id) throw AppError.forbidden("You cannot review your own submission");

    const accepted = decision === "accept";
    await client.query(
      `update work_tasks set status = $2, reviewed_by = $3, reviewed_at = now(), review_remarks = $4, return_count = return_count + $5 where id = $1`,
      [taskId, accepted ? "ACCEPTED" : "RETURNED", user.id, remarks ?? null, accepted ? 0 : 1]
    );
    if (task.is_milestone) await recomputeProgress(client, work.id);
    await audit({ user, action: accepted ? "TASK_ACCEPTED" : "TASK_RETURNED", entity: "work_task", entityId: taskId, diff: { work_id: work.id, task: task.title, remarks }, ip, targetUserId: task.submitted_by }, client);
    await logOnAssets(client, work.id, {
      eventType: accepted ? (task.is_milestone ? "MILESTONE_ACCEPTED" : "TASK_ACCEPTED") : task.is_milestone ? "MILESTONE_RETURNED" : "TASK_RETURNED",
      user,
      remarks: `${work.work_code} · ${task.title}${accepted ? " accepted" : ` returned for rework: ${remarks}`}`
    });
    return { id: taskId, status: accepted ? "ACCEPTED" : "RETURNED" };
  });
}

// ---------- gates ----------

async function createPlaceholderAsset(client, work, user, evaluatedAt) {
  const spec = work.planned_asset;
  const { rows: types } = await client.query("select id, code_prefix, design_life_years, inspection_interval_days from asset_types where code = $1", [work.asset_type_code]);
  const { rows: subs } = await client.query("select id, name, district from org_units where id = $1", [spec.org_unit_id]);
  const { rows } = await client.query(
    `insert into assets (asset_code, type_id, name, org_unit_id, district, taluka, road_code, start_chainage_km, end_chainage_km, lat, lng,
                         attributes, lifecycle_status, criticality, traffic_level, design_life_years, origin_work_id, created_by)
     values ('RDB-' || $1 || '-' || lpad(nextval('asset_code_seq')::text, 6, '0'), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             'PLANNED', $13, $14, $15, $16, $17)
     returning id, asset_code`,
    [types[0].code_prefix, types[0].id, spec.name, subs[0].id, subs[0].district, subs[0].name.replace(/ Sub-division$/, ""), spec.road_code ?? null,
      spec.start_chainage_km ?? null, spec.end_chainage_km ?? null, spec.lat ?? null, spec.lng ?? null, JSON.stringify(spec.attributes ?? {}),
      spec.criticality ?? 3, spec.traffic_level ?? 3, types[0].design_life_years, work.id, user.id]
  );
  const asset = rows[0];
  await client.query("insert into work_assets (work_id, asset_id, role) values ($1, $2, 'CREATED')", [work.id, asset.id]);
  await recomputeRisk(client, asset.id);

  // Give the asset its pre-asset history: initiation and every gate decision so far, at their real times.
  await client.query(
    `insert into lifecycle_events (asset_id, event_type, actor_id, actor_role, at, ref_type, ref_id, remarks)
     select $1::uuid, 'WORK_INITIATED', w.initiated_by, iu.role, w.created_at, 'work', w.id::text,
            w.work_code || ' initiated: ' || w.title || coalesce(' · ref ' || w.initiation_ref, '')
       from works w left join users iu on iu.id = w.initiated_by where w.id = $2::uuid
     union all
     select $1::uuid, case e.outcome when 'RETURNED' then 'STAGE_RETURNED' else 'STAGE_PASSED' end, e.evaluator_id, e.evaluator_role, e.evaluated_at, 'work', e.work_id::text,
            s.name || ': ' || lower(replace(e.outcome, '_', ' ')) || coalesce(' — ' || e.remarks, '')
       from stage_evaluations e join work_stages s on s.id = e.work_stage_id where e.work_id = $2::uuid`,
    [asset.id, work.id]
  );
  await lifecycleEvent(
    { assetId: asset.id, eventType: "ASSET_REGISTERED", toStatus: "PLANNED", user, at: evaluatedAt, refType: "work", refId: work.id, remarks: `Planned asset ${asset.asset_code} registered from DPR of ${work.work_code}` },
    client
  );
  return asset;
}

export async function computeContractorEvaluation(client, workId) {
  const { rows: works } = await client.query("select * from works where id = $1", [workId]);
  const work = works[0];
  const { rows: tasks } = await client.query(
    `select t.*, s.kind from work_tasks t join work_stages s on s.id = t.work_stage_id where t.work_id = $1`,
    [workId]
  );
  const milestones = tasks.filter((task) => task.is_milestone);
  const execution = tasks.filter((task) => ["CONSTRUCTION", "HANDOVER", "CLOSURE"].includes(task.kind));

  const plannedDays = work.start_date && work.planned_end ? Math.max(1, (new Date(work.planned_end) - new Date(work.start_date)) / DAY) : null;
  const delayDays = work.planned_end ? Math.max(0, Math.round((new Date(work.actual_end ?? today()) - new Date(work.planned_end)) / DAY)) : 0;
  const schedule = plannedDays ? 30 * Math.max(0, 1 - delayDays / plannedDays) : 30;

  const firstPass = milestones.filter((task) => task.return_count === 0).length;
  const quality = milestones.length ? (30 * firstPass) / milestones.length : 30;

  const returns = execution.reduce((sum, task) => sum + task.return_count, 0);
  const rework = 15 * Math.max(0, 1 - returns / Math.max(milestones.length, 1));

  const { rows: dlpRows } = await client.query(
    `select count(*) filter (where m.status not in ('VERIFIED', 'CLOSED', 'CANCELLED'))::int as open,
            count(*) filter (where m.status in ('VERIFIED', 'CLOSED'))::int as closed
       from maintenance_requests m join work_assets wa on wa.asset_id = m.asset_id
      where wa.work_id = $1 and wa.role = 'CREATED' and m.dlp_liable`,
    [workId]
  );
  const dlp = Math.max(0, 15 - 5 * dlpRows[0].open - 2 * dlpRows[0].closed);

  const required = execution.reduce((sum, task) => sum + task.required_deliverables.length, 0);
  const provided = execution.reduce(
    (sum, task) => sum + Math.min(task.required_deliverables.length, task.deliverables.length + (task.photo_paths.length ? 1 : 0)),
    0
  );
  const documentation = required ? (10 * provided) / required : 10;

  const round = (value) => Math.round(value * 10) / 10;
  const scores = { schedule: round(schedule), quality: round(quality), rework: round(rework), dlp: round(dlp), documentation: round(documentation) };
  return {
    ...scores,
    total: round(Object.values(scores).reduce((sum, value) => sum + value, 0)),
    inputs: {
      schedule: `${delayDays} day(s) late against a ${plannedDays ? Math.round(plannedDays) : "?"}-day contract period`,
      quality: `${firstPass} of ${milestones.length} milestones passed quality check first time`,
      rework: `${returns} return(s) for rework during execution and handover`,
      dlp: `${dlpRows[0].open} open and ${dlpRows[0].closed} closed DLP defect(s)`,
      documentation: `${provided} of ${required} required execution deliverables provided`
    }
  };
}

export async function evaluateStage(user, stageId, input, ip) {
  const { rows: stageRows } = await query("select work_id from work_stages where id = $1", [stageId]);
  if (!stageRows[0]) throw AppError.notFound("Stage not found");
  const work = await getScopedWork(user, stageRows[0].work_id);
  const { outcome, remarks, checklist = [], data = {}, return_task_ids = [] } = input;

  return withTransaction(async (client) => {
    await client.query("select id from works where id = $1 for update", [work.id]);
    const { rows } = await client.query("select * from work_stages where id = $1 for update", [stageId]);
    const stage = rows[0];
    if (stage.status !== "ACTIVE") {
      throw AppError.invalidTransition(stage.status === "LOCKED" ? `"${stage.name}" is locked — earlier stages must pass first` : `"${stage.name}" is already ${stage.status.toLowerCase()}`);
    }

    const amount = Number(data.sanctioned_amount ?? work.sanctioned_amount ?? work.estimated_cost ?? 0);
    const authority = await gateAuthority(user, work, stage, amount);
    if (!authority.ok) throw AppError.forbidden(authority.reason);

    const { rows: tasks } = await client.query("select * from work_tasks where work_stage_id = $1", [stageId]);
    if (tasks.some((task) => task.assigned_to === user.id || task.submitted_by === user.id)) {
      throw AppError.forbidden("You worked on this stage's tasks — an independent officer must evaluate the gate");
    }
    if (outcome !== "PASSED" && !remarks?.trim()) throw AppError.badRequest("Remarks are required unless the stage passes cleanly");

    const passing = outcome === "PASSED" || outcome === "PASSED_WITH_OBSERVATIONS";
    const effects = {};
    if (passing) {
      const pending = tasks.filter((task) => task.is_mandatory && !["ACCEPTED", "SKIPPED"].includes(task.status));
      if (pending.length) throw AppError.invalidTransition(`${pending.length} mandatory task(s) not yet accepted: ${pending.map((task) => task.title).join("; ")}`);
      if (outcome === "PASSED" && checklist.length && checklist.some((item) => !item.ok)) {
        throw AppError.badRequest("Every checklist item must be satisfied to pass cleanly — use 'passed with observations' and explain");
      }

      if (stage.kind === "APPROVAL") {
        const required = ["technical_sanction_amount", "sanctioned_amount", "ts_ref", "aa_ref"];
        const missing = required.filter((key) => data[key] === undefined || data[key] === "");
        if (missing.length) throw AppError.badRequest(`Approval needs: ${missing.join(", ")}`);
        if (Number(data.sanctioned_amount) > Number(data.technical_sanction_amount)) throw AppError.badRequest("Administrative approval cannot exceed the technical sanction");
        for (const [kind, value, reference] of [["TECHNICAL_SANCTION", data.technical_sanction_amount, data.ts_ref], ["ADMIN_APPROVAL", data.sanctioned_amount, data.aa_ref]]) {
          await client.query(
            `insert into work_approvals (work_id, work_stage_id, stage, approver_id, approver_role, decision, amount, reference, remarks)
             values ($1, $2, $3, $4, $5, 'APPROVED', $6, $7, $8)`,
            [work.id, stageId, kind, user.id, user.role, value, reference, remarks ?? null]
          );
        }
        await client.query("update works set sanctioned_amount = $2 where id = $1", [work.id, data.sanctioned_amount]);
        effects.approval = `Sanctioned ${formatRupees(Number(data.sanctioned_amount))} (${authority.limit})`;
      }

      if (stage.kind === "AWARD") {
        const required = ["tender_ref", "contractor_id", "contract_value", "start_date", "planned_end", "dlp_months"];
        const missing = required.filter((key) => data[key] === undefined || data[key] === "");
        if (missing.length) throw AppError.badRequest(`Award needs: ${missing.join(", ")}`);
        const { rows: contractors } = await client.query("select name from contractors where id = $1 and is_active", [data.contractor_id]);
        if (!contractors[0]) throw AppError.badRequest("Contractor not found");
        if (data.planned_end <= data.start_date) throw AppError.badRequest("Planned end must be after the start date");
        await client.query(
          "update works set tender_ref = $2, contractor_id = $3, contract_value = $4, start_date = $5, planned_end = $6, dlp_months = $7 where id = $1",
          [work.id, data.tender_ref, data.contractor_id, data.contract_value, data.start_date, data.planned_end, data.dlp_months]
        );
        effects.award = `Awarded to ${contractors[0].name} for ${formatRupees(Number(data.contract_value))}, DLP ${data.dlp_months} months`;
      }

      if (stage.kind === "DESIGN" && work.planned_asset && work.asset_type_code) {
        const existing = await workAssets((text, params) => client.query(text, params), work.id, "CREATED");
        if (!existing.length) effects.planned_asset = await createPlaceholderAsset(client, work, user, null).then((asset) => asset.asset_code);
      }

      if (stage.kind === "HANDOVER") {
        const { rows: fresh } = await client.query("select * from works where id = $1", [work.id]);
        const current = fresh[0];
        if (work.asset_type_code && !data.completion_certificate_ref) throw AppError.badRequest("Handover needs the completion certificate reference");
        await client.query("update works set actual_end = current_date where id = $1", [work.id]);
        const dlpEnd = current.dlp_months ? `current_date + interval '${Number(current.dlp_months)} months'` : "null";
        for (const asset of await workAssets((text, params) => client.query(text, params), work.id)) {
          if (asset.lifecycle_status === "UNDER_CONSTRUCTION") {
            await client.query(
              `update assets set commissioned_on = current_date, original_cost = $2, dlp_end_date = (${dlpEnd})::date, condition_rating = 5,
                      last_inspected_at = now(), next_inspection_due = current_date + (select inspection_interval_days from asset_types t where t.id = assets.type_id)
                where id = $1`,
              [asset.id, current.contract_value ?? current.sanctioned_amount]
            );
            await transitionAssetStatus(client, asset.id, "OPERATIONAL", user, { role: "SYSTEM", eventType: "HANDED_OVER", refType: "work", refId: work.id, remarks: `Handed over under ${work.work_code}; completion certificate ${data.completion_certificate_ref ?? "—"}; DLP ${current.dlp_months ?? 0} months` });
          } else if (asset.lifecycle_status === "UNDER_REHABILITATION") {
            if (data.condition_after) await client.query("update assets set condition_rating = $2, last_inspected_at = now() where id = $1", [asset.id, data.condition_after]);
            await transitionAssetStatus(client, asset.id, "OPERATIONAL", user, { role: "SYSTEM", eventType: "REHABILITATION_COMPLETED", refType: "work", refId: work.id, remarks: `${work.work_code} completed and verified` });
          }
          await recomputeRisk(client, asset.id);
        }
        effects.handover = "Asset(s) activated and DLP started";
      }
    }

    await client.query(
      `insert into stage_evaluations (work_stage_id, work_id, evaluator_id, evaluator_role, outcome, checklist, data, remarks)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [stageId, work.id, user.id, user.role, outcome, JSON.stringify(checklist), JSON.stringify({ ...data, ...effects }), remarks ?? null]
    );

    let nextStage = null;
    if (passing) {
      await client.query("update work_stages set status = 'PASSED', completed_at = now() where id = $1", [stageId]);
      const { rows: nextRows } = await client.query("select * from work_stages where work_id = $1 and seq = $2", [work.id, stage.seq + 1]);
      nextStage = nextRows[0] ?? null;

      const isClosure = stage.kind === "CLOSURE" || !nextStage;
      if (isClosure && work.contractor_id) {
        const score = await computeContractorEvaluation(client, work.id);
        await client.query(
          `insert into contractor_evaluations (work_id, contractor_id, evaluator_id, schedule_score, quality_score, rework_score, dlp_score, documentation_score, total_score, inputs, remarks)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (work_id) do nothing`,
          [work.id, work.contractor_id, user.id, score.schedule, score.quality, score.rework, score.dlp, score.documentation, score.total, JSON.stringify(score.inputs), remarks ?? null]
        );
        effects.contractor_score = score.total;
      }

      if (nextStage) {
        await client.query("update work_stages set status = 'ACTIVE', started_at = now(), due_at = now() + make_interval(days => planned_days) where id = $1", [nextStage.id]);
        await client.query(
          `update work_tasks t set due_date = current_date + coalesce(tt.planned_days, 7)
             from task_templates tt where t.task_template_id = tt.id and t.work_stage_id = $1 and t.due_date is null`,
          [nextStage.id]
        );
        await client.query("update works set current_stage_id = $2, status = coalesce($3, $4, status) where id = $1", [
          work.id,
          nextStage.id,
          nextStage.work_status_on_enter,
          stage.work_status_on_pass
        ]);
        if (nextStage.kind === "CONSTRUCTION") {
          for (const asset of await workAssets((text, params) => client.query(text, params), work.id)) {
            if (asset.lifecycle_status === "PLANNED") {
              await transitionAssetStatus(client, asset.id, "UNDER_CONSTRUCTION", user, { role: "SYSTEM", eventType: "CONSTRUCTION_STARTED", refType: "work", refId: work.id, remarks: `${work.work_code} construction started` });
            } else if (asset.lifecycle_status === "OPERATIONAL" && ["REHAB", "REPAIR"].includes(work.work_type)) {
              await transitionAssetStatus(client, asset.id, "UNDER_REHABILITATION", user, { role: "SYSTEM", eventType: "REHABILITATION_STARTED", refType: "work", refId: work.id, remarks: `${work.work_code} execution started` });
            }
          }
        }
      } else {
        await client.query("update works set status = coalesce($2, 'CLOSED'), closed_at = now() where id = $1", [work.id, stage.work_status_on_pass]);
      }
      if (isClosure && stage.kind === "CLOSURE") await client.query("update works set status = 'CLOSED', closed_at = now() where id = $1", [work.id]);
    } else if (outcome === "RETURNED") {
      if (!return_task_ids.length) throw AppError.badRequest("Pick the task(s) that need rework");
      const { rowCount } = await client.query(
        "update work_tasks set status = 'RETURNED', return_count = return_count + 1, review_remarks = $3 where work_stage_id = $1 and id = any($2)",
        [stageId, return_task_ids, remarks]
      );
      if (!rowCount) throw AppError.badRequest("Returned tasks must belong to this stage");
      await client.query("update work_stages set return_count = return_count + 1 where id = $1", [stageId]);
    } else if (outcome === "REJECTED") {
      await client.query("update work_stages set status = 'REJECTED', completed_at = now() where id = $1", [stageId]);
      await client.query("update works set status = 'REJECTED', closed_at = now() where id = $1", [work.id]);
    }

    await audit({ user, action: `STAGE_${outcome}`, entity: "work_stage", entityId: stageId, diff: { work_id: work.id, stage: stage.name, remarks, data, effects }, ip, targetUserId: work.initiated_by }, client);
    await logOnAssets(client, work.id, {
      eventType: passing ? "STAGE_PASSED" : outcome === "RETURNED" ? "STAGE_RETURNED" : "WORK_REJECTED",
      user,
      remarks: `${work.work_code} · ${stage.name}: ${outcome.toLowerCase().replaceAll("_", " ")}${remarks ? ` — ${remarks}` : ""}${effects.award ? ` · ${effects.award}` : ""}${effects.approval ? ` · ${effects.approval}` : ""}`
    });
    return { stage_id: stageId, outcome, next_stage: nextStage?.name ?? null, effects };
  });
}

// ---------- lists ----------

export async function listWorks(user, filters, { limit, offset }) {
  const params = [];
  const where = [workScope(user, params)];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (filters.programme_id) add("w.programme_id = ?", filters.programme_id);
  if (filters.status) add("w.status = ?", filters.status);
  if (filters.stage_code) add("cs.code = ?", filters.stage_code);
  if (filters.template_code) add("t.code = ?", filters.template_code);
  if (filters.q) add("(w.work_code ilike ? or w.title ilike ?)", `%${filters.q}%`);
  if (filters.delayed) where.push("cs.status = 'ACTIVE' and cs.due_at < now()");
  if (filters.active) where.push("w.status not in ('CLOSED', 'REJECTED', 'CANCELLED')");
  const whereSql = where.join(" and ");

  const [{ rows }, count] = await Promise.all([
    query(
      `${WORK_SELECT} where ${whereSql}
       order by (cs.status = 'ACTIVE' and cs.due_at < now()) desc nulls last, w.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(
      `select count(*)::int as total from works w join org_units o on o.id = w.org_unit_id left join work_templates t on t.id = w.template_id
         left join work_stages cs on cs.id = w.current_stage_id where ${whereSql}`,
      params
    )
  ]);
  return {
    rows: rows.map(({ org_path, planned_asset, ...row }) => ({
      ...row,
      days_in_stage: row.current_stage_started_at ? Math.floor((Date.now() - new Date(row.current_stage_started_at)) / DAY) : null,
      is_delayed: row.current_stage_status === "ACTIVE" && row.current_stage_due_at && new Date(row.current_stage_due_at) < new Date()
    })),
    total: count.rows[0].total
  };
}

export async function worksPipeline(user) {
  const params = [];
  const scope = workScope(user, params);
  const { rows } = await query(
    `select cs.seq, cs.code, cs.name, count(*)::int as works,
            count(*) filter (where cs.due_at < now())::int as delayed
       from works w join org_units o on o.id = w.org_unit_id join work_stages cs on cs.id = w.current_stage_id
      where ${scope} and w.status not in ('CLOSED', 'REJECTED', 'CANCELLED') and cs.status = 'ACTIVE'
      group by cs.seq, cs.code, cs.name order by cs.seq, cs.name`,
    params
  );
  return rows;
}

export async function whoHasFileList(user, { limit, offset }) {
  const { rows } = await listWorks(user, { active: true }, { limit, offset });
  const result = [];
  for (const work of rows) {
    const { rows: pending } = await query(
      `select t.title, t.status, u.name as assignee from work_tasks t left join users u on u.id = t.assigned_to
        where t.work_stage_id = $1 and t.is_mandatory and t.status not in ('ACCEPTED', 'SKIPPED') order by t.seq`,
      [work.current_stage_id]
    );
    result.push({
      id: work.id,
      work_code: work.work_code,
      title: work.title,
      stage: work.current_stage_name,
      days_in_stage: work.days_in_stage,
      is_delayed: work.is_delayed,
      holder: pending.length
        ? [...new Set(pending.map((task) => task.assignee ?? "Unassigned"))].join(", ")
        : "Awaiting gate evaluation",
      pending: pending.map((task) => `${task.title} (${task.status.toLowerCase()})`)
    });
  }
  return result;
}

export async function myTasks(user) {
  const params = [];
  const scope = workScope(user, params);
  const [assigned, toReview, gates] = await Promise.all([
    query(
      `select t.id, t.title, t.status, t.due_date, t.is_milestone, t.review_remarks, t.required_deliverables, t.assigned_at, t.reviewed_at,
              s.name as stage_name, s.status as stage_status, w.id as work_id, w.work_code, w.title as work_title, ab.name as assigned_by_name
         from work_tasks t join work_stages s on s.id = t.work_stage_id join works w on w.id = t.work_id left join users ab on ab.id = t.assigned_by
        where t.assigned_to = $1 and t.status in ('PENDING', 'RETURNED', 'SUBMITTED') and s.status in ('ACTIVE', 'LOCKED')
        order by (s.status = 'ACTIVE') desc, (t.status = 'RETURNED') desc, t.due_date nulls last`,
      [user.id]
    ),
    ["HQ", "EE"].includes(user.role)
      ? query(
          `select t.id, t.title, t.submitted_at, t.is_milestone, s.name as stage_name, w.id as work_id, w.work_code, w.title as work_title, u.name as submitted_by_name
             from work_tasks t join work_stages s on s.id = t.work_stage_id join works w on w.id = t.work_id join org_units o on o.id = w.org_unit_id
             left join users u on u.id = t.submitted_by
            where t.status = 'SUBMITTED' and s.status = 'ACTIVE' and t.submitted_by <> $${params.length + 1} and ${scope}
              and (${user.role === "HQ" ? "true" : `o.path like $${params.length + 2} || '%'`})
            order by t.submitted_at`,
          user.role === "HQ" ? [...params, user.id] : [...params, user.id, user.org_path]
        )
      : { rows: [] },
    ["HQ", "EE"].includes(user.role)
      ? query(
          `select s.id as stage_id, s.name as stage_name, s.gate_role, s.due_at, w.id as work_id, w.work_code, w.title as work_title, w.estimated_cost, w.sanctioned_amount
             from work_stages s join works w on w.id = s.work_id join org_units o on o.id = w.org_unit_id
            where s.status = 'ACTIVE' and ${scope}
              and not exists (select 1 from work_tasks t where t.work_stage_id = s.id and t.is_mandatory and t.status not in ('ACCEPTED', 'SKIPPED'))
              and not exists (select 1 from work_tasks t where t.work_stage_id = s.id and (t.assigned_to = $${params.length + 1} or t.submitted_by = $${params.length + 1}))
              and (s.gate_role <> 'HQ' or $${params.length + 2} = 'HQ')
            order by s.due_at`,
          [...params, user.id, user.role]
        )
      : { rows: [] }
  ]);

  // Cost-limited gates only count if this approver's limit covers the amount.
  const eligibleGates = [];
  for (const gate of gates.rows) {
    if (gate.gate_role === "COST_LIMIT") {
      const authority = await gateAuthority(user, { ...gate, org_path: user.org_path, work_type: null }, { gate_role: "COST_LIMIT" }, Number(gate.sanctioned_amount ?? gate.estimated_cost ?? 0));
      if (!authority.ok) continue;
    }
    eligibleGates.push(gate);
  }
  return { assigned: assigned.rows, to_review: toReview.rows, gates: eligibleGates };
}

export async function listAssignees(user, workId) {
  const work = await getScopedWork(user, workId);
  const { rows } = await query(
    `select u.id, u.name, u.role, u.designation, o.name as org_unit_name, c.name as contractor_name
       from users u join org_units o on o.id = u.org_unit_id left join contractors c on c.id = u.contractor_id
      where u.is_active and (
        u.role = 'HQ'
        or (u.role in ('EE', 'AE') and (o.path like $1 || '%' or $1 like o.path || '%'))
        or (u.role = 'CONTRACTOR' and u.contractor_id = $2))
      order by case u.role when 'AE' then 1 when 'EE' then 2 when 'CONTRACTOR' then 3 else 4 end, u.name`,
    [work.org_path, work.contractor_id]
  );
  return rows;
}
