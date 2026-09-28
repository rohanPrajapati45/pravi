import { query } from "../config/db.js";

// Per-user activity trail built from the audit log: who did what, to whom, when.
const FROM = `from audit_logs a
  left join users u on u.id = a.user_id
  left join org_units uo on uo.id = u.org_unit_id
  left join users tu on tu.id = a.target_user_id
  left join work_tasks t on a.entity = 'work_task' and t.id::text = a.entity_id
  left join works w on w.id = coalesce(t.work_id, case when a.entity = 'work' then a.entity_id::uuid end, (a.diff ->> 'work_id')::uuid)
  left join maintenance_requests m on a.entity = 'maintenance_request' and m.id::text = a.entity_id
  left join assets ma on ma.id = m.asset_id
  left join inspections i on a.entity = 'inspection' and i.id::text = a.entity_id
  left join assets ia on ia.id = i.asset_id
  left join assets aa on a.entity = 'asset' and aa.id::text = a.entity_id`;

function scopeFor(user, scope, params) {
  params.push(user.id);
  const me = `$${params.length}`;
  if (scope === "for_me") return `a.target_user_id = ${me}`;
  if (scope === "by_me") return `a.user_id = ${me}`;
  // "all": anything involving me, plus (for officers) actions by people in my jurisdiction.
  if (user.role === "HQ") return "true";
  if (user.role === "EE") {
    params.push(`${user.org_path}%`);
    return `(a.target_user_id = ${me} or a.user_id = ${me} or uo.path like $${params.length})`;
  }
  return `(a.target_user_id = ${me} or a.user_id = ${me})`;
}

const verbs = {
  WORK_INITIATED: "initiated work",
  TASK_ASSIGNED: "assigned a task",
  TASK_SUBMITTED: "submitted a task",
  TASK_ACCEPTED: "accepted a task",
  TASK_RETURNED: "returned a task for rework",
  STAGE_PASSED: "passed a stage gate",
  STAGE_PASSED_WITH_OBSERVATIONS: "passed a stage gate with observations",
  STAGE_RETURNED: "returned a stage",
  STAGE_REJECTED: "rejected a work",
  INSPECTION_SUBMITTED: "recorded an inspection",
  INSPECTION_REVIEWED: "reviewed an inspection",
  MAINTENANCE_AUTO_RAISED: "raised a maintenance request (auto, from inspection)",
  MAINTENANCE_RAISED: "raised a maintenance request",
  MAINTENANCE_ASSIGNED: "assigned a repair",
  MAINTENANCE_STARTED: "started repair work",
  MAINTENANCE_COMPLETED: "marked a repair complete",
  MAINTENANCE_VERIFIED: "verified a repair",
  MAINTENANCE_REJECTED: "rejected a repair — rework needed",
  MAINTENANCE_CLOSED: "closed a repair request",
  MAINTENANCE_CANCELLED: "cancelled a repair request",
  ASSET_CREATED: "registered an asset",
  ASSET_UPDATED: "updated an asset",
  ASSET_STATUS_CHANGED: "changed an asset's status",
  USER_CREATED: "created a user",
  PROGRAMME_CREATED: "created a programme",
  RISK_RECOMPUTED: "recomputed risk for all assets",
  DOCUMENT_UPLOADED: "uploaded a document",
  DOCUMENT_REMOVED: "removed a document",
  BOQ_ITEM_ADDED: "added a BoQ item",
  BOQ_ITEM_UPDATED: "updated a BoQ item",
  BOQ_ITEM_DELETED: "deleted a BoQ item",
  MEASUREMENT_RECORDED: "recorded a measurement",
  MEASUREMENT_CHECKED: "checked a measurement",
  MEASUREMENT_REJECTED: "rejected a measurement",
  BILL_SUBMITTED: "prepared a running bill",
  BILL_APPROVED: "approved a running bill",
  BILL_RETURNED: "returned a running bill",
  BILL_PAID: "recorded payment of a running bill",
  EMERGENCY_DECLARED: "declared an emergency",
  EMERGENCY_DAMAGE_REPORTED: "reported emergency damage",
  EMERGENCY_ASSET_RESTORED: "restored an asset after an emergency",
  EMERGENCY_CLOSED: "closed an emergency",
  COMPLAINT_RECEIVED: "filed a complaint",
  COMPLAINT_ACKNOWLEDGED: "acknowledged a complaint",
  COMPLAINT_ROUTED: "routed a complaint to an asset",
  COMPLAINT_IN_PROGRESS: "took up a complaint for repair",
  COMPLAINT_RESOLVED: "resolved a complaint",
  COMPLAINT_REJECTED: "closed a complaint as not actionable"
};

// Measurement book and bill actions open the work's measurement book.
const MB_ACTIONS = new Set(["BOQ_ITEM_ADDED", "BOQ_ITEM_UPDATED", "BOQ_ITEM_DELETED", "MEASUREMENT_RECORDED", "MEASUREMENT_CHECKED", "MEASUREMENT_REJECTED", "BILL_SUBMITTED", "BILL_APPROVED", "BILL_RETURNED", "BILL_PAID"]);

function describe(row) {
  const diff = row.diff ?? {};
  let subject = null;
  let link = null;
  if (row.task_title) subject = `“${row.task_title}”`;
  if (row.entity === "work_stage") subject = `${diff.stage} gate`;
  if (row.work_id) {
    subject = subject ? `${subject} on ${row.work_code}` : `${row.work_code} · ${row.work_title}`;
    link = `/works/${row.work_id}`;
  }
  if (row.request_code) {
    subject = `${row.request_code} · ${row.request_title}`;
    link = `/maintenance/${row.request_id}`;
  }
  if (row.inspection_code) {
    subject = `${row.inspection_code} on ${row.inspection_asset_code}`;
    link = `/assets/${row.inspection_asset_id}`;
  }
  if (row.entity === "asset" && row.asset_code) {
    subject = `${row.asset_code} · ${row.asset_name}`;
    link = `/assets/${row.entity_id}`;
  }
  if (row.work_id && MB_ACTIONS.has(row.action)) link = `/works/${row.work_id}/mb`;
  if (row.entity === "complaint") link = `/complaints/${row.entity_id}`;
  if (row.entity === "emergency") link = `/emergencies/${row.entity_id}`;
  const details = [];
  if (typeof diff.remarks === "string" && diff.remarks) details.push(diff.remarks);
  if (row.action === "INSPECTION_SUBMITTED" && diff.after) details.push(`condition ${diff.before?.condition_rating ?? "—"} → ${diff.after.condition_rating}`);
  if (diff.effects?.award) details.push(diff.effects.award);
  if (diff.effects?.approval) details.push(diff.effects.approval);
  if (diff.effects?.handover) details.push(diff.effects.handover);
  if (diff.effects?.contractor_score) details.push(`contractor score ${diff.effects.contractor_score}/100`);
  if (diff.due_date) details.push(`due ${diff.due_date}`);
  if (diff.after?.dlp_liable) details.push("contractor liable (DLP)");
  if (diff.verified_condition) details.push(`condition after repair ${diff.verified_condition}`);
  if (diff.actual_cost != null) details.push(`actual cost ₹${Number(diff.actual_cost).toLocaleString("en-IN")}`);
  if (row.action === "RISK_RECOMPUTED") details.push(`${diff.assets} assets, ${diff.changed} changed`);

  return {
    id: row.id,
    at: row.at,
    action: row.action,
    verb: verbs[row.action] ?? row.action.toLowerCase().replaceAll("_", " "),
    actor: { id: row.user_id, name: row.actor_name ?? "System", role: row.actor_role },
    target: row.target_user_id ? { id: row.target_user_id, name: row.target_name } : null,
    subject,
    details,
    link
  };
}

export async function listActivity(user, { scope = "all", since, limit, offset }) {
  const params = [];
  const where = [scopeFor(user, scope, params)];
  if (since) {
    params.push(since);
    where.push(`a.at > $${params.length}`);
  }
  const whereSql = where.join(" and ");
  const [{ rows }, count] = await Promise.all([
    query(
      `select a.id, a.action, a.entity, a.entity_id, a.diff, a.at, a.actor_role, a.user_id, a.target_user_id,
              u.name as actor_name, tu.name as target_name, t.title as task_title,
              w.id as work_id, w.work_code, w.title as work_title,
              m.id as request_id, m.request_code, m.title as request_title,
              i.inspection_code, ia.asset_code as inspection_asset_code, ia.id as inspection_asset_id,
              aa.asset_code, aa.name as asset_name
         ${FROM} where ${whereSql}
        order by a.at desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`select count(*)::int as total ${FROM} where ${whereSql}`, params)
  ]);
  return { rows: rows.map(describe), total: count.rows[0].total };
}

export async function unreadCount(user, since) {
  const { rows } = await query(
    `select count(*)::int as unread from audit_logs where target_user_id = $1 and ($2::timestamptz is null or at > $2)`,
    [user.id, since ?? null]
  );
  return rows[0];
}
