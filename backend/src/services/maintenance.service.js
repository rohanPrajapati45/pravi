import { query, withTransaction } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { getScopedAsset, recomputeRisk, transitionAssetStatus } from "./assets.service.js";
import { audit, lifecycleEvent } from "./audit.service.js";
import { isPathInScope } from "./jurisdiction.service.js";
import { assertOwnedPaths, signedUrls } from "./storage.service.js";
import { assertTransition, createMachine } from "./workflow.service.js";

export const ACTIVE_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS"];
const DUE_DAYS = { HIGH: 7, MEDIUM: 15, LOW: 30 };

// PRD 7.4 — who may move a request between statuses. Person-level rules (assignee, verifier ≠ doer) are checked below.
export const maintenanceMachine = createMachine("Maintenance request", {
  OPEN: { ASSIGNED: { roles: ["HQ", "EE"] }, CANCELLED: { roles: ["HQ", "EE"], requires: ["remarks"] } },
  ASSIGNED: {
    ASSIGNED: { roles: ["HQ", "EE"] },
    IN_PROGRESS: { roles: ["AE", "EE", "CONTRACTOR"] },
    CANCELLED: { roles: ["HQ", "EE"], requires: ["remarks"] }
  },
  IN_PROGRESS: { COMPLETED: { roles: ["AE", "EE", "CONTRACTOR"], requires: ["remarks", "photo"] } },
  COMPLETED: { VERIFIED: { roles: ["AE", "EE"] }, IN_PROGRESS: { roles: ["AE", "EE"], requires: ["remarks"] } },
  VERIFIED: { CLOSED: { roles: ["HQ", "EE"] } },
  CLOSED: {},
  CANCELLED: {}
});

// Shared by inspections (auto-raise) and manual requests.
export async function createRequestRecord(client, { asset, user, source, sourceId, title, description, severity, dueDays }) {
  const inDlp = asset.dlp_end_date && new Date(asset.dlp_end_date) >= new Date(new Date().toDateString());
  let contractorId = null;
  if (inDlp && asset.origin_work_id) {
    const { rows } = await client.query("select contractor_id from works where id = $1", [asset.origin_work_id]);
    contractorId = rows[0]?.contractor_id ?? null;
  }
  const { rows } = await client.query(
    `insert into maintenance_requests (request_code, asset_id, source, source_id, title, description, severity, due_date,
                                       dlp_liable, contractor_id, priority_score, created_by)
     values ('MR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('request_code_seq')::text, 5, '0'),
             $1, $2, $3, $4, $5, $6, current_date + $7::int, $8, $9, $10, $11)
     returning *`,
    [asset.id, source, sourceId ?? null, title.slice(0, 200), description ?? null, severity, dueDays ?? DUE_DAYS[severity], Boolean(inDlp), contractorId, asset.risk_score ?? null, user.id]
  );
  const request = rows[0];
  await lifecycleEvent(
    {
      assetId: asset.id,
      eventType: "MAINTENANCE_RAISED",
      user,
      refType: "maintenance_request",
      refId: request.id,
      after: { request_code: request.request_code, severity, dlp_liable: request.dlp_liable, source },
      remarks: `${request.request_code} raised${source === "INSPECTION" ? " automatically from inspection" : ""}: ${title}${request.dlp_liable ? " · contractor liable (in DLP)" : ""}`
    },
    client
  );
  await audit(
    { user, action: source === "INSPECTION" ? "MAINTENANCE_AUTO_RAISED" : "MAINTENANCE_RAISED", entity: "maintenance_request", entityId: request.id, diff: { after: { request_code: request.request_code, source, severity, dlp_liable: request.dlp_liable } } },
    client
  );
  return request;
}

export async function createManualRequest(user, input, ip) {
  const scoped = await getScopedAsset(user, input.asset_id);
  if (scoped.lifecycle_status === "RETIRED") throw AppError.invalidTransition("Retired assets cannot receive maintenance requests");
  return withTransaction(async (client) => {
    const { rows } = await client.query("select * from assets where id = $1 for update", [input.asset_id]);
    const request = await createRequestRecord(client, { asset: rows[0], user, source: "MANUAL", title: input.title, description: input.description, severity: input.severity });
    await recomputeRisk(client, input.asset_id);
    await audit({ user, action: "MAINTENANCE_RAISED_MANUAL", entity: "maintenance_request", entityId: request.id, ip }, client);
    return request;
  });
}

const SELECT = `select m.*, a.asset_code, a.name as asset_name, a.lifecycle_status as asset_status, a.org_unit_id as asset_org_unit_id,
       o.path as org_path, o.name as org_unit_name, t.name as asset_type,
       u.name as assigned_to_name, u.role as assigned_to_role, c.name as contractor_name,
       cb.name as completed_by_name, vb.name as verified_by_name,
       (m.due_date < current_date and m.status = any('{OPEN,ASSIGNED,IN_PROGRESS}')) as is_overdue
  from maintenance_requests m
  join assets a on a.id = m.asset_id
  join asset_types t on t.id = a.type_id
  join org_units o on o.id = a.org_unit_id
  left join users u on u.id = m.assigned_to
  left join contractors c on c.id = m.contractor_id
  left join users cb on cb.id = m.completed_by
  left join users vb on vb.id = m.verified_by`;

function requestScope(user, params) {
  if (user.role === "HQ") return "true";
  if (user.role === "CONTRACTOR") {
    params.push(user.contractor_id, user.id);
    return `(m.contractor_id = $${params.length - 1} or m.assigned_to = $${params.length})`;
  }
  params.push(`${user.org_path}%`);
  return `o.path like $${params.length}`;
}

function canSeeRequest(user, request) {
  if (user.role === "HQ") return true;
  if (user.role === "CONTRACTOR") return request.contractor_id === user.contractor_id || request.assigned_to === user.id;
  return isPathInScope(user, request.org_path);
}

export async function getScopedRequest(user, id) {
  const { rows } = await query(`${SELECT} where m.id = $1`, [id]);
  if (!rows[0]) throw AppError.notFound("Maintenance request not found");
  if (!canSeeRequest(user, rows[0])) throw AppError.forbidden("This request is outside your jurisdiction");
  return rows[0];
}

export function allowedActions(user, request) {
  const officer = user.role === "HQ" || user.role === "EE";
  const isAssignee = request.assigned_to === user.id;
  const didTheWork = request.completed_by === user.id || request.assigned_to === user.id;
  const actions = [];
  if (officer && ["OPEN", "ASSIGNED"].includes(request.status)) actions.push("assign", "cancel");
  if (request.status === "ASSIGNED" && isAssignee) actions.push("start");
  if (request.status === "IN_PROGRESS" && isAssignee) actions.push("complete");
  if (request.status === "COMPLETED" && ["EE", "AE"].includes(user.role) && !didTheWork) actions.push("verify", "reject");
  if (request.status === "VERIFIED" && officer) actions.push("close");
  return actions;
}

export async function listRequests(user, filters, { limit, offset }) {
  const params = [];
  const where = [requestScope(user, params)];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (filters.status?.length) add("m.status = any(?)", filters.status);
  if (filters.severity) add("m.severity = ?", filters.severity);
  if (filters.asset_id) add("m.asset_id = ?", filters.asset_id);
  if (filters.mine) add("m.assigned_to = ?", user.id);
  if (filters.dlp_liable) where.push("m.dlp_liable");
  if (filters.overdue) where.push("m.due_date < current_date and m.status = any('{OPEN,ASSIGNED,IN_PROGRESS}')");
  if (filters.awaiting_me) {
    params.push(user.id);
    where.push(`m.status = 'COMPLETED' and coalesce(m.completed_by, m.assigned_to) <> $${params.length}`);
  }
  if (filters.q) add("(m.request_code ilike ? or m.title ilike ? or a.asset_code ilike ?)", `%${filters.q}%`);
  const whereSql = where.join(" and ");

  const [{ rows }, count] = await Promise.all([
    query(
      `${SELECT} where ${whereSql}
       order by (m.due_date < current_date and m.status = any('{OPEN,ASSIGNED,IN_PROGRESS}')) desc,
                case m.severity when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end, m.due_date nulls last, m.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`select count(*)::int as total from maintenance_requests m join assets a on a.id = m.asset_id join org_units o on o.id = a.org_unit_id where ${whereSql}`, params)
  ]);
  return { rows: rows.map(({ org_path, ...row }) => row), total: count.rows[0].total };
}

export async function requestSummary(user) {
  const params = [];
  const scope = requestScope(user, params);
  const { rows } = await query(
    `select m.status, count(*)::int as count,
            count(*) filter (where m.due_date < current_date and m.status = any('{OPEN,ASSIGNED,IN_PROGRESS}'))::int as overdue,
            count(*) filter (where m.dlp_liable)::int as dlp
       from maintenance_requests m join assets a on a.id = m.asset_id join org_units o on o.id = a.org_unit_id
      where ${scope} group by m.status`,
    params
  );
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.count]));
  return {
    by_status: byStatus,
    overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
    dlp_liable_active: rows.filter((row) => ACTIVE_STATUSES.includes(row.status) || row.status === "COMPLETED").reduce((sum, row) => sum + row.dlp, 0)
  };
}

export async function getRequestDetail(user, id) {
  const request = await getScopedRequest(user, id);
  const [history, inspection] = await Promise.all([
    query(
      `select l.action, l.at, l.diff, l.actor_role, u.name as actor_name
         from audit_logs l left join users u on u.id = l.user_id
        where l.entity = 'maintenance_request' and l.entity_id = $1 order by l.at`,
      [id]
    ),
    request.source === "INSPECTION" && request.source_id
      ? query("select inspection_code, inspected_at, condition_rating, defects, photo_paths from inspections where id = $1", [request.source_id])
      : { rows: [] }
  ]);
  const source = inspection.rows[0] ?? null;
  const { org_path, ...rest } = request;
  return {
    ...rest,
    source_inspection: source ? { ...source, photos: await signedUrls(source.photo_paths) } : null,
    after_photos: await signedUrls(request.after_photo_paths),
    history: history.rows,
    allowed_actions: allowedActions(user, request)
  };
}

// '/GJ/CIR-AMD/DIV-AMD/SUB-DAS/' -> '/GJ/CIR-AMD/DIV-AMD/'
const divisionPathOf = (path) => path.split("/").slice(0, 4).join("/") + "/";

export async function listAssignees(user, id) {
  const request = await getScopedRequest(user, id);
  const divisionPath = divisionPathOf(request.org_path);
  const { rows } = await query(
    `select u.id, u.name, u.role, u.designation, o.name as org_unit_name, c.name as contractor_name,
            (u.contractor_id is not null and u.contractor_id = $2) as is_liable_contractor
       from users u join org_units o on o.id = u.org_unit_id left join contractors c on c.id = u.contractor_id
      where u.is_active and ((u.role = 'AE' and o.path like $1) or u.role = 'CONTRACTOR')
      order by (u.contractor_id is not null and u.contractor_id = $2) desc, u.role, u.name`,
    [`${divisionPath}%`, request.contractor_id]
  );
  return rows;
}

// Runs one workflow step: re-reads the row under lock, checks the transition, applies `apply`, then logs.
async function step(user, id, { to, action, remarks, ip, check, apply, describe }) {
  await getScopedRequest(user, id);
  return withTransaction(async (client) => {
    const { rows } = await client.query("select * from maintenance_requests where id = $1 for update", [id]);
    const request = rows[0];
    const rule = assertTransition(maintenanceMachine, request.status, to, user.role);
    if (rule.requires?.includes("remarks") && !remarks?.trim()) throw AppError.badRequest("Remarks are required for this step");
    check?.(request);
    const changes = (await apply(client, request)) ?? {};
    const sets = ["status = $2", ...Object.keys(changes).map((key, index) => `${key} = $${index + 3}`)];
    await client.query(`update maintenance_requests set ${sets.join(", ")} where id = $1`, [id, to, ...Object.values(changes)]);
    await audit({ user, action, entity: "maintenance_request", entityId: id, diff: { from: request.status, to, remarks: remarks ?? null, ...describe }, ip }, client);
    await lifecycleEvent(
      {
        assetId: request.asset_id,
        eventType: action,
        user,
        refType: "maintenance_request",
        refId: id,
        fromStatus: null,
        remarks: `${request.request_code}: ${request.status} → ${to}${remarks ? ` · ${remarks}` : ""}`
      },
      client
    );
    return { id, request_code: request.request_code, from: request.status, status: to };
  });
}

export async function assignRequest(user, id, { assigned_to, due_date, estimated_cost }, ip) {
  const { rows } = await query(
    `select u.id, u.role, u.name, u.contractor_id, o.path from users u join org_units o on o.id = u.org_unit_id where u.id = $1 and u.is_active`,
    [assigned_to]
  );
  const assignee = rows[0];
  if (!assignee || !["AE", "CONTRACTOR"].includes(assignee.role)) throw AppError.badRequest("Assign to an active Assistant Engineer or contractor");
  const current = await getScopedRequest(user, id);
  const divisionPath = divisionPathOf(current.org_path);
  if (assignee.role === "AE" && !assignee.path.startsWith(divisionPath)) throw AppError.badRequest("That engineer works outside this asset's division");

  return step(user, id, {
    to: "ASSIGNED",
    action: "MAINTENANCE_ASSIGNED",
    ip,
    describe: { assigned_to: assignee.name, due_date },
    apply: (_client, request) => ({
      assigned_to: assignee.id,
      assigned_by: user.id,
      assigned_at: new Date(),
      due_date: due_date ?? request.due_date,
      estimated_cost: estimated_cost ?? request.estimated_cost,
      contractor_id: assignee.role === "CONTRACTOR" ? assignee.contractor_id : request.contractor_id
    })
  });
}

export async function startRequest(user, id, ip) {
  return step(user, id, {
    to: "IN_PROGRESS",
    action: "MAINTENANCE_STARTED",
    ip,
    check: (request) => {
      if (request.assigned_to !== user.id) throw AppError.forbidden("Only the assignee can start this work");
    },
    apply: async (client, request) => {
      const { rows } = await client.query("select lifecycle_status from assets where id = $1", [request.asset_id]);
      if (rows[0].lifecycle_status === "OPERATIONAL") {
        await transitionAssetStatus(client, request.asset_id, "UNDER_MAINTENANCE", user, {
          role: "SYSTEM",
          refType: "maintenance_request",
          refId: request.id,
          remarks: `Work started on ${request.request_code}`
        });
      }
      return { started_at: new Date() };
    }
  });
}

export async function completeRequest(user, id, { remarks, after_photo_paths }, ip) {
  if (!after_photo_paths?.length) throw AppError.badRequest("An after-photo is required to mark work complete");
  assertOwnedPaths(after_photo_paths, `maintenance/${id}/`);
  return step(user, id, {
    to: "COMPLETED",
    action: "MAINTENANCE_COMPLETED",
    remarks,
    ip,
    check: (request) => {
      if (request.assigned_to !== user.id) throw AppError.forbidden("Only the assignee can mark this work complete");
    },
    apply: () => ({ completed_at: new Date(), completed_by: user.id, completion_remarks: remarks, after_photo_paths })
  });
}

function assertIndependentVerifier(user, request) {
  if (request.completed_by === user.id || request.assigned_to === user.id) {
    throw AppError.forbidden("The person who did the work cannot verify it");
  }
}

export async function verifyRequest(user, id, { verified_condition, remarks }, ip) {
  return step(user, id, {
    to: "VERIFIED",
    action: "MAINTENANCE_VERIFIED",
    remarks,
    ip,
    describe: { verified_condition },
    check: (request) => assertIndependentVerifier(user, request),
    apply: async (client, request) => {
      const { rows } = await client.query("select condition_rating, lifecycle_status from assets where id = $1 for update", [request.asset_id]);
      await client.query("update assets set condition_rating = $2, last_inspected_at = now() where id = $1", [request.asset_id, verified_condition]);
      if (rows[0].lifecycle_status === "UNDER_MAINTENANCE") {
        const { rows: others } = await client.query(
          "select 1 from maintenance_requests where asset_id = $1 and id <> $2 and status = 'IN_PROGRESS' limit 1",
          [request.asset_id, request.id]
        );
        if (!others.length) {
          await transitionAssetStatus(client, request.asset_id, "OPERATIONAL", user, {
            role: "SYSTEM",
            refType: "maintenance_request",
            refId: request.id,
            remarks: `Repair verified on ${request.request_code}; condition ${rows[0].condition_rating ?? "—"} → ${verified_condition}`
          });
        }
      }
      return { verified_by: user.id, verified_at: new Date(), verified_condition, verification_remarks: remarks ?? null };
    }
  }).then(async (result) => {
    const request = await getScopedRequest(user, id);
    await withTransaction((client) => recomputeRisk(client, request.asset_id));
    return result;
  });
}

export async function rejectVerification(user, id, { remarks }, ip) {
  return step(user, id, {
    to: "IN_PROGRESS",
    action: "MAINTENANCE_REJECTED",
    remarks,
    ip,
    check: (request) => assertIndependentVerifier(user, request),
    apply: (_client, request) => ({ rejection_count: request.rejection_count + 1, verification_remarks: remarks, completed_at: null })
  });
}

export async function closeRequest(user, id, { actual_cost, remarks }, ip) {
  return step(user, id, {
    to: "CLOSED",
    action: "MAINTENANCE_CLOSED",
    remarks,
    ip,
    describe: { actual_cost },
    apply: () => ({ actual_cost, closed_at: new Date() })
  });
}

export async function cancelRequest(user, id, { remarks }, ip) {
  return step(user, id, {
    to: "CANCELLED",
    action: "MAINTENANCE_CANCELLED",
    remarks,
    ip,
    apply: () => ({ cancel_reason: remarks })
  }).then(async (result) => {
    const request = await getScopedRequest(user, id);
    await withTransaction((client) => recomputeRisk(client, request.asset_id));
    return result;
  });
}
