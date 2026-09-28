import { pool, query, withTransaction } from "../config/db.js";
import supabaseAdmin from "../config/supabase.js";
import { invalidateUserCache } from "../middleware/auth.js";
import AppError from "../utils/AppError.js";
import { audit } from "./audit.service.js";

// Which office level each role sits at (merged-role model, PRD 5.2).
export const ROLE_LEVELS = { HQ: ["STATE", "CIRCLE"], EE: ["DIVISION"], AE: ["SUBDIVISION"], CONTRACTOR: ["STATE", "CIRCLE", "DIVISION", "SUBDIVISION"] };
const PARENT_TYPE = { CIRCLE: "STATE", DIVISION: "CIRCLE", SUBDIVISION: "DIVISION" };

export async function assertRoleFitsOffice(role, orgUnitId, contractorId) {
  const { rows } = await query("select type, name from org_units where id = $1", [orgUnitId]);
  if (!rows[0]) throw AppError.badRequest("Office not found");
  if (!ROLE_LEVELS[role].includes(rows[0].type)) {
    throw AppError.badRequest(`${role} users belong to a ${ROLE_LEVELS[role].join(" or ").toLowerCase()} office, not a ${rows[0].type.toLowerCase()}`);
  }
  if ((role === "CONTRACTOR") !== Boolean(contractorId)) {
    throw AppError.badRequest(role === "CONTRACTOR" ? "Pick the contractor firm this login belongs to" : "Only contractor logins are linked to a firm");
  }
}

// ---------- users ----------

export async function adminListUsers({ q, role, org_unit_id, active }, { limit, offset }) {
  const params = [];
  const where = ["true"];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (q) add("(u.name ilike ? or u.email ilike ? or u.designation ilike ?)", `%${q}%`);
  if (role) add("u.role = ?", role);
  if (org_unit_id) add("o.path like (select path from org_units where id = ?) || '%'", org_unit_id);
  if (active !== undefined) add("u.is_active = ?", active);
  const whereSql = where.join(" and ");
  const [{ rows }, count] = await Promise.all([
    query(
      `select u.id, u.name, u.email, u.phone, u.role, u.designation, u.is_active, u.org_unit_id, u.contractor_id, u.created_at,
              o.name as org_unit_name, o.type as org_unit_type, c.name as contractor_name,
              (select max(a.at) from audit_logs a where a.user_id = u.id) as last_action_at,
              (select count(*)::int from work_tasks t where t.assigned_to = u.id and t.status in ('PENDING', 'SUBMITTED', 'RETURNED')) as open_tasks
         from users u join org_units o on o.id = u.org_unit_id left join contractors c on c.id = u.contractor_id
        where ${whereSql}
        order by u.is_active desc, case u.role when 'HQ' then 1 when 'EE' then 2 when 'AE' then 3 else 4 end, u.name
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`select count(*)::int as total from users u join org_units o on o.id = u.org_unit_id where ${whereSql}`, params)
  ]);
  return { rows, total: count.rows[0].total };
}

export async function adminUpdateUser(actor, id, input, ip) {
  const { rows } = await query("select * from users where id = $1", [id]);
  const current = rows[0];
  if (!current) throw AppError.notFound("User not found");
  if (id === actor.id && (input.is_active === false || (input.role && input.role !== current.role))) {
    throw AppError.forbidden("You cannot deactivate or change the role of your own account — ask another administrator");
  }
  const next = { ...current, ...input };
  if (input.role === "CONTRACTOR" && input.contractor_id === undefined) next.contractor_id = current.contractor_id;
  if (input.role && input.role !== "CONTRACTOR" && input.contractor_id === undefined) next.contractor_id = null;
  if (input.role || input.org_unit_id || input.contractor_id !== undefined) await assertRoleFitsOffice(next.role, next.org_unit_id, next.contractor_id);

  if (current.role === "HQ" && (input.is_active === false || (input.role && input.role !== "HQ"))) {
    const { rows: admins } = await query("select count(*)::int as n from users where role = 'HQ' and is_active and id <> $1", [id]);
    if (!admins[0].n) throw AppError.invalidTransition("This is the last active HQ administrator — create another before removing this one");
  }

  const fields = ["name", "phone", "designation", "role", "org_unit_id", "contractor_id", "is_active"];
  const before = {};
  const after = {};
  for (const key of fields) {
    if (next[key] !== current[key] && (input[key] !== undefined || key === "contractor_id")) {
      before[key] = current[key];
      after[key] = next[key];
    }
  }
  if (!Object.keys(after).length) return current;

  // Block or restore sign-in at the identity provider as well as in our own table.
  if ("is_active" in after && current.auth_id) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(current.auth_id, { ban_duration: after.is_active ? "none" : "876000h" });
    if (error) throw new AppError(502, "AUTH_PROVIDER_ERROR", `Could not update sign-in: ${error.message}`);
  }

  const updated = await withTransaction(async (client) => {
    const keys = Object.keys(after);
    const { rows: saved } = await client.query(
      `update users set ${keys.map((key, index) => `${key} = $${index + 2}`).join(", ")} where id = $1 returning *`,
      [id, ...keys.map((key) => after[key])]
    );
    const action = "is_active" in after ? (after.is_active ? "USER_REACTIVATED" : "USER_DEACTIVATED") : "USER_UPDATED";
    await audit({ user: actor, action, entity: "user", entityId: id, diff: { before, after }, ip, targetUserId: id }, client);
    return saved[0];
  });
  invalidateUserCache(id);
  return updated;
}

export async function adminResetPassword(actor, id, password, ip) {
  const { rows } = await query("select auth_id, name from users where id = $1", [id]);
  if (!rows[0]?.auth_id) throw AppError.notFound("User has no login");
  const { error } = await supabaseAdmin.auth.admin.updateUserById(rows[0].auth_id, { password });
  if (error) throw AppError.badRequest(`Could not reset password: ${error.message}`);
  await audit({ user: actor, action: "USER_PASSWORD_RESET", entity: "user", entityId: id, diff: { user: rows[0].name }, ip, targetUserId: id });
  return { id, reset: true };
}

// ---------- offices ----------

export async function adminOrgTree() {
  const { rows } = await query(
    `select o.id, o.code, o.type, o.name, o.parent_id, o.path, o.district,
            (select count(*)::int from users u where u.org_unit_id = o.id and u.is_active) as users,
            (select count(*)::int from assets a join org_units s on s.id = a.org_unit_id where s.path like o.path || '%') as assets
       from org_units o order by o.path`
  );
  return rows;
}

export async function adminCreateOrgUnit(actor, input, ip) {
  const { rows: parents } = await query("select id, type, district from org_units where id = $1", [input.parent_id]);
  const parent = parents[0];
  if (!parent) throw AppError.badRequest("Parent office not found");
  if (PARENT_TYPE[input.type] !== parent.type) throw AppError.badRequest(`A ${input.type.toLowerCase()} must sit under a ${PARENT_TYPE[input.type].toLowerCase()}`);
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into org_units (code, type, name, parent_id, district) values (upper($1), $2, $3, $4, $5) returning *`,
      [input.code, input.type, input.name, parent.id, input.district ?? parent.district ?? null]
    ).catch((error) => {
      if (error.code === "23505") throw AppError.badRequest("That office code is already in use");
      throw error;
    });
    await audit({ user: actor, action: "ORG_UNIT_CREATED", entity: "org_unit", entityId: rows[0].id, diff: { after: input }, ip }, client);
    return rows[0];
  });
}

export async function adminUpdateOrgUnit(actor, id, input, ip) {
  return withTransaction(async (client) => {
    const { rows: before } = await client.query("select name, district from org_units where id = $1", [id]);
    if (!before[0]) throw AppError.notFound("Office not found");
    const { rows } = await client.query("update org_units set name = coalesce($2, name), district = coalesce($3, district) where id = $1 returning *", [id, input.name ?? null, input.district ?? null]);
    await audit({ user: actor, action: "ORG_UNIT_UPDATED", entity: "org_unit", entityId: id, diff: { before: before[0], after: input }, ip }, client);
    return rows[0];
  });
}

// ---------- asset types ----------

export async function adminListAssetTypes() {
  const { rows } = await query(
    `select t.*, (select count(*)::int from assets a where a.type_id = t.id) as asset_count from asset_types t order by t.is_active desc, t.category, t.name`
  );
  return rows;
}

export async function adminCreateAssetType(actor, input, ip) {
  return withTransaction(async (client) => {
    const { rows } = await client
      .query(
        `insert into asset_types (code, name, category, code_prefix, attribute_schema, inspection_interval_days, design_life_years)
         values (upper($1), $2, $3, upper($4), $5, $6, $7) returning *`,
        [input.code, input.name, input.category, input.code_prefix, JSON.stringify(input.attribute_schema), input.inspection_interval_days, input.design_life_years]
      )
      .catch((error) => {
        if (error.code === "23505") throw AppError.badRequest("That asset type code already exists");
        throw error;
      });
    await audit({ user: actor, action: "ASSET_TYPE_CREATED", entity: "asset_type", entityId: rows[0].id, diff: { after: input }, ip }, client);
    return rows[0];
  });
}

export async function adminUpdateAssetType(actor, id, input, ip) {
  return withTransaction(async (client) => {
    const { rows: current } = await client.query("select * from asset_types where id = $1 for update", [id]);
    if (!current[0]) throw AppError.notFound("Asset type not found");
    const keys = Object.keys(input);
    if (!keys.length) return current[0];
    const values = keys.map((key) => (key === "attribute_schema" ? JSON.stringify(input[key]) : input[key]));
    const { rows } = await client.query(`update asset_types set ${keys.map((key, index) => `${key} = $${index + 2}`).join(", ")} where id = $1 returning *`, [id, ...values]);
    const before = Object.fromEntries(keys.map((key) => [key, current[0][key]]));
    await audit({ user: actor, action: "ASSET_TYPE_UPDATED", entity: "asset_type", entityId: id, diff: { before, after: input }, ip }, client);
    return rows[0];
  });
}

// ---------- approval limits ----------

export async function adminSetApprovalLimit(actor, { role, max_amount }, ip) {
  if (role === "HQ") throw AppError.badRequest("HQ is the top of the delegation and stays unlimited");
  return withTransaction(async (client) => {
    const { rows: before } = await client.query("select max_amount from approval_limits where role = $1 and work_type is null", [role]);
    const label = `${role === "EE" ? "Executive Engineer" : role} — up to ₹${(max_amount / 1e7).toFixed(2)} Cr (configured)`;
    const { rows } = await client.query(
      `insert into approval_limits (role, work_type, max_amount, label) values ($1, null, $2, $3)
       on conflict (role, work_type) do update set max_amount = excluded.max_amount, label = excluded.label returning *`,
      [role, max_amount, label]
    );
    await audit({ user: actor, action: "APPROVAL_LIMIT_CHANGED", entity: "approval_limit", entityId: rows[0].id, diff: { role, before: before[0]?.max_amount ?? null, after: max_amount }, ip }, client);
    return rows[0];
  });
}

// ---------- contractors ----------

export async function adminListContractors() {
  const { rows } = await query(
    `select c.*,
            (select count(*)::int from users u where u.contractor_id = c.id and u.is_active) as logins,
            (select count(*)::int from works w where w.contractor_id = c.id and w.status not in ('CLOSED', 'REJECTED', 'CANCELLED')) as active_works,
            (select count(*)::int from works w where w.contractor_id = c.id) as total_works,
            (select round(avg(e.total_score), 1) from contractor_evaluations e where e.contractor_id = c.id) as avg_score,
            (select count(*)::int from maintenance_requests m where m.contractor_id = c.id and m.dlp_liable and m.status in ('OPEN', 'ASSIGNED', 'IN_PROGRESS')) as open_dlp_defects
       from contractors c order by c.is_active desc, c.name`
  );
  return rows;
}

export async function adminSaveContractor(actor, id, input, ip) {
  return withTransaction(async (client) => {
    let rows;
    if (id) {
      const keys = Object.keys(input);
      ({ rows } = await client.query(`update contractors set ${keys.map((key, index) => `${key} = $${index + 2}`).join(", ")} where id = $1 returning *`, [id, ...keys.map((key) => input[key])]));
      if (!rows[0]) throw AppError.notFound("Contractor not found");
    } else {
      ({ rows } = await client
        .query(
          `insert into contractors (code, name, class, contact_name, contact_phone, contact_email) values (upper($1), $2, $3, $4, $5, $6) returning *`,
          [input.code, input.name, input.class ?? null, input.contact_name ?? null, input.contact_phone ?? null, input.contact_email ?? null]
        )
        .catch((error) => {
          if (error.code === "23505") throw AppError.badRequest("That contractor code already exists");
          throw error;
        }));
    }
    await audit({ user: actor, action: id ? "CONTRACTOR_UPDATED" : "CONTRACTOR_CREATED", entity: "contractor", entityId: rows[0].id, diff: { after: input }, ip }, client);
    return rows[0];
  });
}

// ---------- templates & system ----------

export async function adminTemplateDetail(code) {
  const { rows } = await query(
    `select t.code, t.name, t.work_type, t.asset_type_code, t.description,
            coalesce(json_agg(json_build_object(
              'seq', s.seq, 'code', s.code, 'name', s.name, 'kind', s.kind, 'gate_role', s.gate_role, 'planned_days', s.planned_days,
              'checklist', s.gate_checklist,
              'tasks', (select coalesce(json_agg(json_build_object('title', tt.title, 'role', tt.default_assignee_role, 'deliverables', tt.required_deliverables,
                                  'milestone', tt.is_milestone, 'weight', tt.weight, 'planned_days', tt.planned_days) order by tt.seq), '[]')
                          from task_templates tt where tt.stage_template_id = s.id)) order by s.seq), '[]') as stages
       from work_templates t left join stage_templates s on s.template_id = t.id where t.code = $1 group by t.id`,
    [code]
  );
  if (!rows[0]) throw AppError.notFound("Template not found");
  return rows[0];
}

export async function adminSystem() {
  const started = Date.now();
  const [counts, migrations, today, db] = await Promise.all([
    query(
      `select (select count(*) from users)::int as users, (select count(*) from users where is_active)::int as active_users,
              (select count(*) from org_units)::int as offices, (select count(*) from assets)::int as assets,
              (select count(*) from inspections)::int as inspections, (select count(*) from maintenance_requests)::int as maintenance_requests,
              (select count(*) from works)::int as works, (select count(*) from lifecycle_events)::int as timeline_events,
              (select count(*) from audit_logs)::int as audit_entries`
    ),
    query("select id, applied_at from schema_migrations order by id"),
    query("select count(*)::int as actions, count(distinct user_id)::int as people from audit_logs where at > now() - interval '24 hours'"),
    query("select version() as version, pg_size_pretty(pg_database_size(current_database())) as size")
  ]);
  return {
    api: { status: "ok", node: process.version, uptime_s: Math.round(process.uptime()), environment: process.env.NODE_ENV ?? "development" },
    database: { status: "ok", latency_ms: Date.now() - started, version: db.rows[0].version.split(" ").slice(0, 2).join(" "), size: db.rows[0].size, pool: { total: pool.totalCount, idle: pool.idleCount } },
    counts: counts.rows[0],
    last_24h: today.rows[0],
    migrations: migrations.rows
  };
}
