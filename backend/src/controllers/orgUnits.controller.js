import { query } from "../config/db.js";
import { applyJurisdictionScope, assertOrgUnitInScope } from "../services/jurisdiction.service.js";
import AppError from "../utils/AppError.js";
import { ok, pageMeta, parsePagination } from "../utils/response.js";

export async function getOrgUnits(request, response) {
  const pagination = parsePagination(request.query, { defaultLimit: 100, maxLimit: 200 });
  const { type, parent_id } = request.valid.query;
  const params = [];
  const where = [applyJurisdictionScope(request.user, params)];
  if (type) {
    params.push(type);
    where.push(`o.type = $${params.length}`);
  }
  if (parent_id) {
    params.push(parent_id);
    where.push(`o.parent_id = $${params.length}`);
  }
  const whereSql = where.join(" and ");

  const [{ rows }, count] = await Promise.all([
    query(
      `select o.id, o.code, o.type, o.name, o.parent_id, o.path, o.district
         from org_units o where ${whereSql}
        order by o.path
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pagination.limit, pagination.offset]
    ),
    query(`select count(*)::int as total from org_units o where ${whereSql}`, params)
  ]);
  ok(response, rows, pageMeta(pagination, count.rows[0].total));
}

export async function getOrgUnit(request, response) {
  await assertOrgUnitInScope(request.user, request.valid.params.id);
  const { rows } = await query(
    `select o.id, o.code, o.type, o.name, o.parent_id, o.path, o.district,
            (select count(*)::int from org_units c where c.parent_id = o.id) as child_count,
            (select count(*)::int from users u where u.org_unit_id = o.id) as user_count
       from org_units o where o.id = $1`,
    [request.valid.params.id]
  );
  if (!rows[0]) throw AppError.notFound("Org unit not found");
  ok(response, rows[0]);
}
