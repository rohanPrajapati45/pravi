import { query } from "../config/db.js";
import { applyJurisdictionScope } from "../services/jurisdiction.service.js";
import { ok, pageMeta, parsePagination } from "../utils/response.js";

// EE sees actions performed by users inside their jurisdiction; HQ sees all.
export async function getAuditLogs(request, response) {
  const pagination = parsePagination(request.query, { defaultLimit: 25 });
  const { entity, entity_id, action } = request.valid.query;
  const params = [];
  const where = [request.user.role === "HQ" ? "true" : applyJurisdictionScope(request.user, params)];
  if (entity) {
    params.push(entity);
    where.push(`a.entity = $${params.length}`);
  }
  if (entity_id) {
    params.push(entity_id);
    where.push(`a.entity_id = $${params.length}`);
  }
  if (action) {
    params.push(action);
    where.push(`a.action = $${params.length}`);
  }
  const whereSql = where.join(" and ");
  const from = `from audit_logs a
                left join users u on u.id = a.user_id
                left join org_units o on o.id = u.org_unit_id`;

  const [{ rows }, count] = await Promise.all([
    query(
      `select a.id, a.action, a.entity, a.entity_id, a.diff, a.at, a.actor_role,
              u.name as user_name, o.name as org_unit_name
         ${from} where ${whereSql}
        order by a.at desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pagination.limit, pagination.offset]
    ),
    query(`select count(*)::int as total ${from} where ${whereSql}`, params)
  ]);
  ok(response, rows, pageMeta(pagination, count.rows[0].total));
}
