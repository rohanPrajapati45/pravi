import { query, withTransaction } from "../config/db.js";
import supabaseAdmin from "../config/supabase.js";
import AppError from "../utils/AppError.js";
import { audit } from "./audit.service.js";
import { applyJurisdictionScope, assertOrgUnitInScope } from "./jurisdiction.service.js";

export function toProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    designation: user.designation,
    orgUnit: { id: user.org_unit_id, name: user.org_unit_name, type: user.org_unit_type, path: user.org_path },
    contractor: user.contractor_id ? { id: user.contractor_id, name: user.contractor_name } : null
  };
}

export async function listUsers(user, { page, limit, offset, role, org_unit_id, q }) {
  const params = [];
  const where = [applyJurisdictionScope(user, params)];
  if (role) {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }
  if (org_unit_id) {
    params.push(org_unit_id);
    where.push(`u.org_unit_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(u.name ilike $${params.length} or u.email ilike $${params.length})`);
  }
  const whereSql = where.join(" and ");

  const [{ rows }, count] = await Promise.all([
    query(
      `select u.id, u.name, u.email, u.role, u.designation, u.is_active, u.org_unit_id,
              o.name as org_unit_name, o.type as org_unit_type, c.name as contractor_name
         from users u
         join org_units o on o.id = u.org_unit_id
         left join contractors c on c.id = u.contractor_id
        where ${whereSql}
        order by u.role, u.name
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`select count(*)::int as total from users u join org_units o on o.id = u.org_unit_id where ${whereSql}`, params)
  ]);
  return { rows, total: count.rows[0].total };
}

export async function createUser(actor, input, ip) {
  await assertOrgUnitInScope(actor, input.org_unit_id);

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name }
  });
  if (error) throw AppError.badRequest(`Could not create login: ${error.message}`);

  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        `insert into users (auth_id, name, email, phone, role, designation, org_unit_id, contractor_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id, name, email, role, designation, org_unit_id, contractor_id`,
        [
          data.user.id,
          input.name,
          input.email,
          input.phone ?? null,
          input.role,
          input.designation ?? null,
          input.org_unit_id,
          input.contractor_id ?? null
        ]
      );
      const { password: _omit, ...safeInput } = input;
      await audit({ user: actor, action: "USER_CREATED", entity: "user", entityId: rows[0].id, diff: { after: safeInput }, ip }, client);
      return rows[0];
    });
  } catch (dbError) {
    // Keep auth and profile in sync: drop the login if the profile row failed.
    await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => {});
    throw dbError;
  }
}
