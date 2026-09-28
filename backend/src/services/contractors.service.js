import { query } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { assetScope } from "./assets.service.js";
import { workScope } from "./works.service.js";

const ACTIVE_MR = "('OPEN','ASSIGNED','IN_PROGRESS','COMPLETED')";

// ---------- DLP tracker ----------

const DLP_BUCKETS = {
  active: "a.dlp_end_date >= current_date",
  expiring: "a.dlp_end_date between current_date and current_date + $DAYS::int",
  expired: "a.dlp_end_date < current_date and a.dlp_end_date >= current_date - 90"
};

export async function dlpAssets(user, { bucket = "active", days = 30, q, contractor_id }, { limit, offset }) {
  const params = [];
  const where = [assetScope(user, params), "a.dlp_end_date is not null"];
  if (bucket === "expiring") params.push(days);
  where.push(DLP_BUCKETS[bucket].replace("$DAYS", `$${params.length}`));
  if (q) {
    params.push(`%${q}%`);
    where.push(`(a.name ilike $${params.length} or a.asset_code ilike $${params.length} or w.work_code ilike $${params.length})`);
  }
  if (contractor_id) {
    params.push(contractor_id);
    where.push(`w.contractor_id = $${params.length}`);
  }
  const from = `from assets a
    join asset_types t on t.id = a.type_id
    join org_units o on o.id = a.org_unit_id
    left join works w on w.id = a.origin_work_id
    left join contractors c on c.id = w.contractor_id`;
  const whereSql = where.join(" and ");
  const [{ rows }, count] = await Promise.all([
    query(
      `select a.id, a.asset_code, a.name, a.district, a.condition_rating, a.risk_band, a.risk_score, a.lifecycle_status,
              a.commissioned_on, a.dlp_end_date, a.last_inspected_at, t.name as type_name, o.name as org_unit_name,
              (a.dlp_end_date - current_date) as days_remaining,
              (a.dlp_end_date - coalesce(a.commissioned_on, a.dlp_end_date - 730)) as dlp_total_days,
              w.id as work_id, w.work_code, w.title as work_title, c.id as contractor_id, c.name as contractor_name,
              (select count(*)::int from maintenance_requests m where m.asset_id = a.id and m.dlp_liable) as defects_total,
              (select count(*)::int from maintenance_requests m where m.asset_id = a.id and m.dlp_liable and m.status in ${ACTIVE_MR}) as defects_open
         ${from}
        where ${whereSql}
        order by a.dlp_end_date ${bucket === "expired" ? "desc" : "asc"}
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`select count(*)::int as total ${from} where ${whereSql}`, params)
  ]);
  return { rows, total: count.rows[0].total };
}

export async function dlpSummary(user) {
  const params = [];
  const scope = assetScope(user, params);
  const mrParams = [];
  const mrScope = assetScope(user, mrParams);
  const [assets, defects] = await Promise.all([
    query(
      `select count(*) filter (where a.dlp_end_date >= current_date)::int as in_dlp,
              count(*) filter (where a.dlp_end_date between current_date and current_date + 30)::int as expiring_30,
              count(*) filter (where a.dlp_end_date < current_date and a.dlp_end_date >= current_date - 90)::int as expired_90
         from assets a join org_units o on o.id = a.org_unit_id where ${scope}`,
      params
    ),
    query(
      `select count(*) filter (where m.status in ${ACTIVE_MR})::int as liable_open,
              count(*) filter (where m.status in ('OPEN','ASSIGNED','IN_PROGRESS') and m.due_date < current_date)::int as liable_overdue,
              count(*) filter (where m.status in ('VERIFIED','CLOSED'))::int as liable_fixed,
              round(avg(extract(epoch from (m.verified_at - m.created_at)) / 86400) filter (where m.verified_at is not null), 1) as avg_fix_days
         from maintenance_requests m join assets a on a.id = m.asset_id join org_units o on o.id = a.org_unit_id
        where m.dlp_liable and ${mrScope}`,
      mrParams
    )
  ]);
  return { ...assets.rows[0], ...defects.rows[0], avg_fix_days: defects.rows[0].avg_fix_days == null ? null : Number(defects.rows[0].avg_fix_days) };
}

// ---------- contractor performance ----------

// Metrics per firm, computed only over works and defects inside the caller's jurisdiction.
function performanceSql(user, params, firmFilter) {
  const workWhere = workScope(user, params);
  const defectWhere = assetScope(user, params);
  return `
    select c.id, c.code, c.name, c.class, c.contact_name, c.contact_phone, c.contact_email, c.is_active,
           coalesce(wk.active_works, 0) as active_works, coalesce(wk.completed_works, 0) as completed_works,
           coalesce(wk.active_value, 0) as active_value, coalesce(wk.total_value, 0) as total_value,
           wk.on_time_pct, wk.avg_delay_days, coalesce(wk.running_late, 0) as running_late,
           ms.first_pass_pct, coalesce(ms.milestones_reviewed, 0) as milestones_reviewed,
           ev.avg_score, coalesce(ev.evaluations, 0) as evaluations,
           coalesce(df.dlp_defects, 0) as dlp_defects, coalesce(df.dlp_open, 0) as dlp_open, df.dlp_avg_fix_days
      from contractors c
      left join lateral (
        select count(*) filter (where w.status not in ('HANDED_OVER','CLOSED','REJECTED','CANCELLED'))::int as active_works,
               count(*) filter (where w.status in ('HANDED_OVER','CLOSED'))::int as completed_works,
               sum(w.contract_value) filter (where w.status not in ('HANDED_OVER','CLOSED','REJECTED','CANCELLED')) as active_value,
               sum(w.contract_value) as total_value,
               round(100.0 * count(*) filter (where w.actual_end <= w.planned_end) / nullif(count(*) filter (where w.actual_end is not null), 0)) as on_time_pct,
               round(avg(greatest(w.actual_end - w.planned_end, 0)) filter (where w.actual_end is not null), 1) as avg_delay_days,
               count(*) filter (where w.actual_end is null and w.planned_end < current_date and w.status in ('AWARDED','IN_PROGRESS','COMPLETED'))::int as running_late
          from works w join org_units o on o.id = w.org_unit_id
         where w.contractor_id = c.id and ${workWhere}
      ) wk on true
      left join lateral (
        select round(100.0 * count(*) filter (where t.return_count = 0) / nullif(count(*), 0)) as first_pass_pct, count(*)::int as milestones_reviewed
          from work_tasks t join works w on w.id = t.work_id join org_units o on o.id = w.org_unit_id
         where w.contractor_id = c.id and t.is_milestone and t.status = 'ACCEPTED' and ${workWhere}
      ) ms on true
      left join lateral (
        select round(avg(e.total_score), 1) as avg_score, count(*)::int as evaluations
          from contractor_evaluations e join works w on w.id = e.work_id join org_units o on o.id = w.org_unit_id
         where e.contractor_id = c.id and ${workWhere}
      ) ev on true
      left join lateral (
        select count(*)::int as dlp_defects,
               count(*) filter (where m.status in ${ACTIVE_MR})::int as dlp_open,
               round(avg(extract(epoch from (m.verified_at - m.created_at)) / 86400) filter (where m.verified_at is not null), 1) as dlp_avg_fix_days
          from maintenance_requests m join assets a on a.id = m.asset_id join org_units o on o.id = a.org_unit_id
         where m.contractor_id = c.id and m.dlp_liable and ${defectWhere}
      ) df on true
     where ${firmFilter}`;
}

const numeric = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, ["on_time_pct", "avg_delay_days", "first_pass_pct", "avg_score", "dlp_avg_fix_days"].includes(key) && value != null ? Number(value) : value])
  );

export async function listContractorPerformance(user) {
  const params = [];
  let firmFilter = "c.is_active";
  if (user.role === "CONTRACTOR") {
    params.push(user.contractor_id);
    firmFilter = `c.id = $${params.length}`;
  }
  const sql = performanceSql(user, params, firmFilter);
  const { rows } = await query(`${sql} order by coalesce(wk.active_works, 0) + coalesce(wk.completed_works, 0) desc, c.name`, params);
  return rows.map(numeric);
}

export async function contractorDetail(user, id) {
  if (user.role === "CONTRACTOR" && user.contractor_id !== id) throw AppError.forbidden("You can only view your own firm's performance");
  const params = [];
  params.push(id);
  const sql = performanceSql(user, params, "c.id = $1");
  const { rows } = await query(sql, params);
  if (!rows[0]) throw AppError.notFound("Contractor not found");

  const workParams = [id];
  const workWhere = workScope(user, workParams);
  const defectParams = [id];
  const defectWhere = assetScope(user, defectParams);
  const [works, evaluations, defects] = await Promise.all([
    query(
      `select w.id, w.work_code, w.title, w.status, w.contract_value, w.start_date, w.planned_end, w.actual_end, w.progress_pct, w.dlp_months,
              (w.actual_end - w.planned_end) as delay_days,
              (w.actual_end is null and w.planned_end < current_date and w.status in ('AWARDED','IN_PROGRESS','COMPLETED')) as running_late,
              cs.name as current_stage_name, o.name as org_unit_name
         from works w join org_units o on o.id = w.org_unit_id left join work_stages cs on cs.id = w.current_stage_id
        where w.contractor_id = $1 and ${workWhere}
        order by w.created_at desc limit 100`,
      workParams
    ),
    query(
      `select e.*, w.work_code, w.title as work_title, u.name as evaluator_name
         from contractor_evaluations e join works w on w.id = e.work_id join org_units o on o.id = w.org_unit_id left join users u on u.id = e.evaluator_id
        where e.contractor_id = $1 and ${workWhere}
        order by e.evaluated_at desc`,
      workParams
    ),
    query(
      `select m.id, m.request_code, m.title, m.status, m.severity, m.created_at, m.due_date, m.verified_at,
              (m.due_date < current_date and m.status in ('OPEN','ASSIGNED','IN_PROGRESS')) as is_overdue,
              a.id as asset_id, a.asset_code, a.name as asset_name, a.dlp_end_date
         from maintenance_requests m join assets a on a.id = m.asset_id join org_units o on o.id = a.org_unit_id
        where m.contractor_id = $1 and m.dlp_liable and ${defectWhere}
        order by (m.status in ${ACTIVE_MR}) desc, m.created_at desc limit 50`,
      defectParams
    )
  ]);
  return { ...numeric(rows[0]), works: works.rows, evaluations: evaluations.rows, dlp_defects: defects.rows };
}
