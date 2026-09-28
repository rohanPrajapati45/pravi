import { query, withTransaction } from "../config/db.js";
import { assetScope } from "./assets.service.js";
import { audit } from "./audit.service.js";
import { computeRisk, recommend } from "./risk.engine.js";
import { workScope } from "./works.service.js";

const ACTIVE_MR = "('OPEN','ASSIGNED','IN_PROGRESS')";

// One round-trip per widget group; every count is scoped exactly like the list endpoints.
export async function dashboardSummary(user) {
  const assetParams = [];
  const assetWhere = assetScope(user, assetParams);
  const workParams = [];
  const workWhere = workScope(user, workParams);
  const mrParams = [];
  let mrWhere;
  if (user.role === "HQ") mrWhere = "true";
  else if (user.role === "CONTRACTOR") {
    mrParams.push(user.contractor_id, user.id);
    mrWhere = "(m.contractor_id = $1 or m.assigned_to = $2)";
  } else {
    mrParams.push(`${user.org_path}%`);
    mrWhere = "o.path like $1";
  }

  const [assets, maintenance, works, mine] = await Promise.all([
    query(
      `select count(*)::int as total,
              count(*) filter (where a.risk_band = 'CRITICAL')::int as critical,
              count(*) filter (where a.risk_band = 'HIGH')::int as high,
              count(*) filter (where a.risk_band = 'MEDIUM')::int as medium,
              count(*) filter (where a.risk_band = 'LOW')::int as low,
              count(*) filter (where a.next_inspection_due < current_date)::int as overdue_inspections,
              count(*) filter (where a.dlp_end_date >= current_date)::int as in_dlp,
              count(*) filter (where a.lifecycle_status = 'UNDER_MAINTENANCE')::int as under_maintenance,
              count(*) filter (where a.lifecycle_status in ('PLANNED', 'UNDER_CONSTRUCTION'))::int as in_pipeline,
              count(*) filter (where a.condition_rating <= 2)::int as poor_or_worse
         from assets a join org_units o on o.id = a.org_unit_id
        where ${assetWhere} and a.lifecycle_status <> 'RETIRED'`,
      assetParams
    ),
    query(
      `select count(*) filter (where m.status in ${ACTIVE_MR})::int as active,
              count(*) filter (where m.status = 'OPEN' and m.assigned_to is null)::int as unassigned,
              count(*) filter (where m.status = 'COMPLETED')::int as awaiting_verification,
              count(*) filter (where m.due_date < current_date and m.status in ${ACTIVE_MR})::int as overdue,
              count(*) filter (where m.dlp_liable and m.status in ${ACTIVE_MR})::int as dlp_liable_open,
              count(*) filter (where m.assigned_to = $${mrParams.length + 1} and m.status in ('ASSIGNED', 'IN_PROGRESS'))::int as assigned_to_me,
              coalesce(sum(m.actual_cost) filter (where m.status = 'CLOSED' and m.closed_at > now() - interval '1 year'), 0) as spent_last_year
         from maintenance_requests m join assets a on a.id = m.asset_id join org_units o on o.id = a.org_unit_id
        where ${mrWhere}`,
      [...mrParams, user.id]
    ),
    query(
      `select count(*) filter (where w.status not in ('CLOSED', 'REJECTED', 'CANCELLED'))::int as active,
              count(*) filter (where cs.status = 'ACTIVE' and cs.due_at < now())::int as delayed,
              count(*) filter (where w.status in ('IN_PROGRESS', 'COMPLETED'))::int as in_construction,
              count(*) filter (where w.status = 'CLOSED')::int as closed,
              coalesce(sum(w.sanctioned_amount) filter (where w.status not in ('REJECTED', 'CANCELLED')), 0) as sanctioned,
              coalesce(sum(w.contract_value) filter (where w.status not in ('REJECTED', 'CANCELLED')), 0) as contracted
         from works w join org_units o on o.id = w.org_unit_id left join work_stages cs on cs.id = w.current_stage_id
        where ${workWhere}`,
      workParams
    ),
    query(
      `select count(*) filter (where t.status in ('PENDING', 'RETURNED') and s.status = 'ACTIVE')::int as tasks_to_do,
              count(*) filter (where t.status = 'RETURNED')::int as returned
         from work_tasks t join work_stages s on s.id = t.work_stage_id where t.assigned_to = $1`,
      [user.id]
    )
  ]);

  const result = { assets: assets.rows[0], maintenance: maintenance.rows[0], works: works.rows[0], my_work: mine.rows[0] };
  if (user.role === "CONTRACTOR") {
    const { rows } = await query(
      `select ce.total_score, ce.schedule_score, ce.quality_score, ce.rework_score, ce.dlp_score, ce.documentation_score, ce.evaluated_at, w.id as work_id, w.work_code, w.title
         from contractor_evaluations ce join works w on w.id = ce.work_id where ce.contractor_id = $1 order by ce.evaluated_at desc`,
      [user.contractor_id]
    );
    result.evaluations = rows;
  }
  return result;
}

export async function priorityAssets(user, limit = 10) {
  const params = [];
  const where = assetScope(user, params);
  const { rows } = await query(
    `select a.id, a.asset_code, a.name, a.lifecycle_status, a.condition_rating, a.risk_score, a.risk_band, a.risk_factors, a.district,
            a.next_inspection_due, a.dlp_end_date, a.road_code, a.start_chainage_km, a.end_chainage_km, t.name as type_name, o.name as org_unit_name,
            (select count(*)::int from maintenance_requests m where m.asset_id = a.id and m.status in ${ACTIVE_MR}) as open_requests
       from assets a join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id
      where ${where} and a.lifecycle_status not in ('RETIRED', 'PLANNED')
      order by a.risk_score desc, a.condition_rating asc nulls last, a.asset_code
      limit $${params.length + 1}`,
    [...params, limit]
  );
  return rows.map((row, index) => ({ rank: index + 1, ...row, recommendation: recommend(row) }));
}

// HQ groups by district; everyone else by sub-division inside their jurisdiction.
export async function conditionDistribution(user) {
  const params = [];
  const where = assetScope(user, params);
  const groupBy = user.role === "HQ" ? "a.district" : "o.name";
  const { rows } = await query(
    `select ${groupBy} as name,
            count(*) filter (where a.condition_rating = 5)::int as excellent,
            count(*) filter (where a.condition_rating = 4)::int as good,
            count(*) filter (where a.condition_rating = 3)::int as moderate,
            count(*) filter (where a.condition_rating = 2)::int as poor,
            count(*) filter (where a.condition_rating = 1)::int as critical,
            count(*) filter (where a.condition_rating is null)::int as unrated,
            count(*)::int as total,
            round(avg(a.risk_score), 1) as avg_risk
       from assets a join org_units o on o.id = a.org_unit_id
      where ${where} and a.lifecycle_status <> 'RETIRED'
      group by ${groupBy} order by avg(a.risk_score) desc`,
    params
  );
  return { group: user.role === "HQ" ? "district" : "sub-division", rows };
}

// Set-based bulk recompute: one read, scoring in memory, one write. At state scale this runs as a nightly worker job.
export async function recomputeAllRisk(user, ip) {
  const started = Date.now();
  const { rows } = await query(
    `select a.id, a.condition_rating, a.criticality, a.traffic_level, a.commissioned_on, a.design_life_years, a.next_inspection_due,
            a.risk_score, t.inspection_interval_days,
            coalesce(h.repairs, 0) as repairs, coalesce(h.open_high, 0) as open_high
       from assets a join asset_types t on t.id = a.type_id
       left join (
         select asset_id,
                count(*) filter (where status in ('VERIFIED', 'CLOSED') and created_at > now() - interval '5 years')::int as repairs,
                count(*) filter (where severity = 'HIGH' and status not in ('VERIFIED', 'CLOSED', 'CANCELLED'))::int as open_high
           from maintenance_requests group by asset_id
       ) h on h.asset_id = a.id
      where a.lifecycle_status <> 'RETIRED'`
  );
  const updates = rows.map((asset) => {
    const risk = computeRisk(asset, { repairsLast5y: asset.repairs, openHighDefects: asset.open_high });
    return { id: asset.id, score: risk.score, band: risk.band, factors: risk.factors, changed: Number(asset.risk_score) !== risk.score };
  });
  const changed = updates.filter((update) => update.changed);
  await withTransaction(async (client) => {
    if (changed.length) {
      await client.query(
        `update assets a set risk_score = x.score, risk_band = x.band, risk_factors = x.factors
           from jsonb_to_recordset($1::jsonb) as x(id uuid, score numeric, band text, factors jsonb)
          where a.id = x.id`,
        [JSON.stringify(changed)]
      );
    }
    await audit({ user, action: "RISK_RECOMPUTED", entity: "asset", entityId: null, diff: { assets: rows.length, changed: changed.length }, ip }, client);
  });
  return { assets: rows.length, changed: changed.length, ms: Date.now() - started };
}
