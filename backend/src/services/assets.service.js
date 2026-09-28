import { query, withTransaction } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { audit, lifecycleEvent } from "./audit.service.js";
import { assertOrgUnitInScope, isPathInScope } from "./jurisdiction.service.js";
import { computeRisk, recommend } from "./risk.engine.js";
import { assertTransition, assetMachine, allowedTransitions } from "./workflow.service.js";

const BASE_FROM = `from assets a
  join asset_types t on t.id = a.type_id
  join org_units o on o.id = a.org_unit_id`;

// Jurisdiction for assets: org subtree for officers; contractors see only assets tied to their works.
export function assetScope(user, params) {
  if (user.role === "HQ") return "true";
  if (user.role === "CONTRACTOR") {
    params.push(user.contractor_id);
    const p = `$${params.length}`;
    return `(exists (select 1 from work_assets wa join works w on w.id = wa.work_id where wa.asset_id = a.id and w.contractor_id = ${p})
             or exists (select 1 from works w where w.id = a.origin_work_id and w.contractor_id = ${p}))`;
  }
  params.push(`${user.org_path}%`);
  return `o.path like $${params.length}`;
}

const SORTS = {
  risk: "a.risk_score desc, a.asset_code",
  code: "a.asset_code",
  name: "a.name",
  condition: "a.condition_rating asc nulls last, a.risk_score desc",
  due: "a.next_inspection_due asc nulls last",
  updated: "a.updated_at desc"
};

// Shared by the registry list and the map so both apply identical scope and filters.
function buildAssetWhere(user, filters) {
  const params = [];
  const where = [assetScope(user, params)];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };

  if (filters.q) add("(a.name ilike ? or a.asset_code ilike ? or a.road_code ilike ?)", `%${filters.q}%`);
  if (filters.type_id) add("a.type_id = ?", filters.type_id);
  if (filters.category) add("t.category = ?", filters.category);
  if (filters.district) add("a.district = ?", filters.district);
  if (filters.org_unit_id) add("o.path like (select path from org_units where id = ?) || '%'", filters.org_unit_id);
  if (filters.status) add("a.lifecycle_status = ?", filters.status);
  if (filters.condition) add("a.condition_rating = ?", filters.condition);
  if (filters.risk_band) add("a.risk_band = ?", filters.risk_band);
  if (filters.parent_id) add("a.parent_id = ?", filters.parent_id);
  if (filters.top_level) where.push("a.parent_id is null");
  if (filters.overdue) where.push("a.next_inspection_due < current_date");
  if (filters.in_dlp) where.push("a.dlp_end_date >= current_date");
  if (filters.bbox) {
    const [minLng, minLat, maxLng, maxLat] = filters.bbox;
    params.push(minLat, maxLat, minLng, maxLng);
    const n = params.length;
    where.push(`a.lat between $${n - 3} and $${n - 2} and a.lng between $${n - 1} and $${n}`);
  }
  return { params, whereSql: where.join(" and ") };
}

export async function listAssets(user, filters, { page, limit, offset }) {
  const { params, whereSql } = buildAssetWhere(user, filters);
  const [{ rows }, count] = await Promise.all([
    query(
      `select a.id, a.asset_code, a.name, a.lifecycle_status, a.condition_rating, a.risk_score, a.risk_band,
              a.district, a.road_code, a.start_chainage_km, a.end_chainage_km, a.next_inspection_due, a.dlp_end_date,
              a.parent_id, a.lat, a.lng, t.name as type_name, t.category, o.name as org_unit_name
         ${BASE_FROM}
        where ${whereSql}
        order by ${SORTS[filters.sort] ?? SORTS.risk}
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`select count(*)::int as total ${BASE_FROM} where ${whereSql}`, params)
  ]);
  return { rows, total: count.rows[0].total };
}

const GEO_CAP = 5000;

// GeoJSON for the map: road segments as lines (when geometry exists), everything else as points.
export async function listAssetsGeo(user, filters) {
  const { params, whereSql } = buildAssetWhere(user, filters);
  const { rows } = await query(
    `select a.id, a.asset_code, a.name, a.lat, a.lng, a.geometry, a.lifecycle_status, a.condition_rating, a.risk_score, a.risk_band,
            a.district, a.road_code, a.start_chainage_km, a.end_chainage_km, a.next_inspection_due, a.dlp_end_date, a.parent_id,
            t.name as type_name, t.category
       ${BASE_FROM}
      where ${whereSql} and a.lat is not null and a.lng is not null
      order by a.risk_score desc
      limit ${GEO_CAP + 1}`,
    params
  );
  const truncated = rows.length > GEO_CAP;
  const features = rows.slice(0, GEO_CAP).map((row) => ({
    type: "Feature",
    geometry: row.geometry?.type === "LineString" ? row.geometry : { type: "Point", coordinates: [Number(row.lng), Number(row.lat)] },
    properties: {
      id: row.id,
      code: row.asset_code,
      name: row.name,
      type: row.type_name,
      category: row.category,
      status: row.lifecycle_status,
      condition: row.condition_rating,
      risk: Number(row.risk_score),
      band: row.risk_band,
      district: row.district,
      road: row.road_code ? `${row.road_code} km ${Number(row.start_chainage_km).toFixed(1)}–${Number(row.end_chainage_km).toFixed(1)}` : null,
      overdue: Boolean(row.next_inspection_due && row.next_inspection_due < new Date().toISOString().slice(0, 10)),
      in_dlp: Boolean(row.dlp_end_date && row.dlp_end_date >= new Date().toISOString().slice(0, 10)),
      component: Boolean(row.parent_id),
      anchor: [Number(row.lng), Number(row.lat)]
    }
  }));
  return { type: "FeatureCollection", features, meta: { count: features.length, truncated } };
}

async function loadAsset(runner, id, { lock = false } = {}) {
  const { rows } = await runner(
    `select a.*, t.code as type_code, t.name as type_name, t.category, t.code_prefix, t.attribute_schema,
            t.inspection_interval_days, o.name as org_unit_name, o.path as org_path, o.type as org_unit_type
       ${BASE_FROM}
      where a.id = $1 ${lock ? "for update of a" : ""}`,
    [id]
  );
  return rows[0] ?? null;
}

async function canSee(user, asset) {
  if (user.role === "HQ") return true;
  if (user.role === "CONTRACTOR") {
    const { rows } = await query(
      `select 1 from works w
        where w.contractor_id = $2
          and (w.id = $3 or exists (select 1 from work_assets wa where wa.work_id = w.id and wa.asset_id = $1))
        limit 1`,
      [asset.id, user.contractor_id, asset.origin_work_id]
    );
    return rows.length > 0;
  }
  return isPathInScope(user, asset.org_path);
}

export async function getScopedAsset(user, id) {
  const asset = await loadAsset(query, id);
  if (!asset) throw AppError.notFound("Asset not found");
  if (!(await canSee(user, asset))) throw AppError.forbidden("This asset is outside your jurisdiction");
  return asset;
}

export async function lookupAsset(user, code) {
  const { rows } = await query("select id from assets where asset_code = upper($1) or qr_token = $1", [code.trim()]);
  if (!rows[0]) throw AppError.notFound(`No asset with code ${code}`);
  const asset = await getScopedAsset(user, rows[0].id);
  return { id: asset.id, asset_code: asset.asset_code, name: asset.name, type_name: asset.type_name };
}

function daysBetween(from, to) {
  return Math.round((new Date(to) - new Date(from)) / (24 * 60 * 60 * 1000));
}

export async function getAsset360(user, id) {
  const asset = await getScopedAsset(user, id);
  const pathCodes = asset.org_path.split("/").filter(Boolean);

  const [orgChain, parent, children, originWork, people, tabCounts] = await Promise.all([
    query("select code, type, name from org_units where code = any($1) order by length(path)", [pathCodes]),
    asset.parent_id ? query("select id, asset_code, name from assets where id = $1", [asset.parent_id]) : { rows: [] },
    query(
      `select a.id, a.asset_code, a.name, a.lifecycle_status, a.condition_rating, a.risk_band, t.name as type_name,
              (select count(*)::int from assets g where g.parent_id = a.id) as child_count
         from assets a join asset_types t on t.id = a.type_id
        where a.parent_id = $1 order by a.asset_code`,
      [id]
    ),
    asset.origin_work_id
      ? query(
          `select w.id, w.work_code, w.title, w.work_type, w.status, w.contract_value, w.sanctioned_amount, w.actual_end,
                  w.dlp_months, c.name as contractor_name
             from works w left join contractors c on c.id = w.contractor_id where w.id = $1`,
          [asset.origin_work_id]
        )
      : { rows: [] },
    query(
      `select u.name, u.role, u.designation, u.email from users u
        where u.is_active and (
          (u.role = 'AE' and u.org_unit_id = $1)
          or (u.role = 'EE' and u.org_unit_id = (select parent_id from org_units where id = $1))
          or u.id = $2)
        order by case u.role when 'EE' then 1 when 'AE' then 2 else 3 end`,
      [asset.org_unit_id, asset.custodian_id]
    ),
    query("select count(*)::int as events from lifecycle_events where asset_id = $1", [id])
  ]);

  const today = new Date();
  const inDlp = asset.dlp_end_date ? new Date(asset.dlp_end_date) >= new Date(today.toDateString()) : false;
  const { attribute_schema, org_path, code_prefix, ...rest } = asset;

  return {
    ...rest,
    attribute_schema,
    org_chain: orgChain.rows,
    parent: parent.rows[0] ?? null,
    children: children.rows,
    origin_work: originWork.rows[0] ?? null,
    people: people.rows,
    dlp: { in_dlp: inDlp, days_remaining: inDlp ? daysBetween(today, asset.dlp_end_date) : null, end_date: asset.dlp_end_date },
    recommendation: recommend(asset),
    allowed_transitions: allowedTransitions(assetMachine, asset.lifecycle_status, user.role),
    counts: { timeline: tabCounts.rows[0].events, components: children.rows.length }
  };
}

export async function getTimeline(user, id, { limit, offset }) {
  await getScopedAsset(user, id);
  const [{ rows }, count] = await Promise.all([
    query(
      `select e.id, e.event_type, e.from_status, e.to_status, e.at, e.remarks, e.ref_type, e.ref_id, e.before, e.after,
              e.actor_role, e.lat, e.lng, u.name as actor_name
         from lifecycle_events e left join users u on u.id = e.actor_id
        where e.asset_id = $1
        order by e.at desc
        limit $2 offset $3`,
      [id, limit, offset]
    ),
    query("select count(*)::int as total from lifecycle_events where asset_id = $1", [id])
  ]);
  return { rows, total: count.rows[0].total };
}

export function validateAttributes(schema, attributes = {}, { partial = false } = {}) {
  const clean = {};
  const errors = [];
  for (const field of schema) {
    const value = attributes[field.key];
    if (value === undefined || value === null || value === "") {
      if (field.required && !partial) errors.push({ field: `attributes.${field.key}`, message: `${field.label} is required` });
      continue;
    }
    if (field.type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) errors.push({ field: `attributes.${field.key}`, message: `${field.label} must be a positive number` });
      else clean[field.key] = number;
    } else if (field.type === "select") {
      if (!field.options.includes(value)) errors.push({ field: `attributes.${field.key}`, message: `${field.label} must be one of ${field.options.join(", ")}` });
      else clean[field.key] = value;
    } else if (field.type === "boolean") {
      clean[field.key] = value === true || value === "true";
    } else {
      clean[field.key] = String(value).trim().slice(0, 200);
    }
  }
  if (errors.length) throw AppError.badRequest("Invalid asset attributes", errors);
  return clean;
}

// Recompute and store the explainable risk score. History inputs are filled in once
// inspections/maintenance exist (M3/M4).
export async function recomputeRisk(client, assetId) {
  const { rows } = await client.query(
    `select a.*, t.inspection_interval_days from assets a join asset_types t on t.id = a.type_id where a.id = $1`,
    [assetId]
  );
  const asset = rows[0];
  const history = await riskHistory(client, assetId);
  const risk = computeRisk(asset, history);
  await client.query("update assets set risk_score = $2, risk_band = $3, risk_factors = $4 where id = $1", [
    assetId,
    risk.score,
    risk.band,
    JSON.stringify(risk.factors)
  ]);
  return risk;
}

async function riskHistory(client, assetId) {
  const { rows } = await client.query("select to_regclass('public.maintenance_requests') is not null as ready");
  if (!rows[0].ready) return {};
  const history = await client.query(
    `select count(*) filter (where status in ('VERIFIED', 'CLOSED') and created_at > now() - interval '5 years')::int as repairs,
            count(*) filter (where severity = 'HIGH' and status not in ('VERIFIED', 'CLOSED', 'CANCELLED'))::int as open_high
       from maintenance_requests where asset_id = $1`,
    [assetId]
  );
  return { repairsLast5y: history.rows[0].repairs, openHighDefects: history.rows[0].open_high };
}

export async function createAsset(user, input, ip) {
  await assertOrgUnitInScope(user, input.org_unit_id);
  const [{ rows: types }, { rows: units }] = await Promise.all([
    query("select * from asset_types where id = $1 and is_active", [input.type_id]),
    query("select id, type, name, district from org_units where id = $1", [input.org_unit_id])
  ]);
  const type = types[0];
  if (!type) throw AppError.badRequest("Unknown asset type");
  const unit = units[0];
  if (unit.type !== "SUBDIVISION") throw AppError.badRequest("Assets belong to a sub-division; pick a sub-division");

  if (type.category === "ROAD" && (!input.road_code || input.start_chainage_km == null || input.end_chainage_km == null)) {
    throw AppError.badRequest("Road segments need a road code and start/end chainage");
  }
  if (input.parent_id) {
    const parent = await getScopedAsset(user, input.parent_id);
    if (parent.lifecycle_status === "RETIRED") throw AppError.invalidTransition("Cannot add components to a retired asset");
  }
  const attributes = validateAttributes(type.attribute_schema, input.attributes);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into assets (asset_code, type_id, name, parent_id, org_unit_id, district, taluka, road_code,
                           start_chainage_km, end_chainage_km, lat, lng, attributes, lifecycle_status, condition_rating,
                           criticality, traffic_level, commissioned_on, original_cost, design_life_years,
                           next_inspection_due, created_by, custodian_id)
       values ('RDB-' || $1 || '-' || lpad(nextval('asset_code_seq')::text, 6, '0'), $2, $3, $4, $5, $6, $7, $8,
               $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
               current_date + $21::int, $22, $22)
       returning *`,
      [
        type.code_prefix,
        type.id,
        input.name,
        input.parent_id ?? null,
        unit.id,
        unit.district,
        input.taluka ?? unit.name.replace(/ Sub-division$/, ""),
        input.road_code ?? null,
        input.start_chainage_km ?? null,
        input.end_chainage_km ?? null,
        input.lat ?? null,
        input.lng ?? null,
        JSON.stringify(attributes),
        input.lifecycle_status ?? "OPERATIONAL",
        input.condition_rating ?? null,
        input.criticality ?? 3,
        input.traffic_level ?? 3,
        input.commissioned_on ?? null,
        input.original_cost ?? null,
        input.design_life_years ?? type.design_life_years,
        type.inspection_interval_days,
        user.id
      ]
    );
    const asset = rows[0];
    const risk = await recomputeRisk(client, asset.id);

    await lifecycleEvent(
      {
        assetId: asset.id,
        eventType: "ASSET_REGISTERED",
        toStatus: asset.lifecycle_status,
        user,
        lat: asset.lat,
        lng: asset.lng,
        after: { asset_code: asset.asset_code, name: asset.name, type: type.name, attributes },
        remarks: `Registered in ${unit.name}`
      },
      client
    );
    if (asset.parent_id) {
      await lifecycleEvent(
        {
          assetId: asset.parent_id,
          eventType: "COMPONENT_ADDED",
          user,
          refType: "asset",
          refId: asset.id,
          remarks: `${type.name} ${asset.asset_code} added as a component`
        },
        client
      );
    }
    await audit({ user, action: "ASSET_CREATED", entity: "asset", entityId: asset.id, diff: { after: { asset_code: asset.asset_code, name: asset.name } }, ip }, client);
    return { ...asset, risk_score: risk.score, risk_band: risk.band };
  });
}

const FIELD_RULES = {
  AE: ["name", "attributes", "lat", "lng"],
  EE: ["name", "attributes", "lat", "lng", "criticality", "traffic_level", "original_cost", "commissioned_on", "design_life_years", "road_code", "start_chainage_km", "end_chainage_km", "taluka"],
  HQ: ["name", "attributes", "lat", "lng", "criticality", "traffic_level", "original_cost", "commissioned_on", "design_life_years", "road_code", "start_chainage_km", "end_chainage_km", "taluka"]
};
const RISK_FIELDS = new Set(["criticality", "traffic_level", "commissioned_on", "design_life_years"]);

function sameValue(a, b) {
  if (a instanceof Date) a = a.toISOString().slice(0, 10);
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export async function updateAsset(user, id, input, ip) {
  const allowed = FIELD_RULES[user.role];
  if (!allowed) throw AppError.forbidden("Your role cannot edit assets");
  const blocked = Object.keys(input).filter((key) => !allowed.includes(key));
  if (blocked.length) throw AppError.forbidden(`Your role cannot change: ${blocked.join(", ")}`);

  await getScopedAsset(user, id);

  return withTransaction(async (client) => {
    const current = await loadAsset((text, params) => client.query(text, params), id, { lock: true });
    if (current.lifecycle_status === "RETIRED") throw AppError.invalidTransition("Retired assets are read-only");

    const next = { ...input };
    if (next.attributes) next.attributes = { ...current.attributes, ...validateAttributes(current.attribute_schema, next.attributes, { partial: true }) };

    const before = {};
    const after = {};
    for (const [key, value] of Object.entries(next)) {
      if (!sameValue(current[key], value)) {
        before[key] = current[key];
        after[key] = value;
      }
    }
    if (!Object.keys(after).length) return current;

    const keys = Object.keys(after);
    const sets = keys.map((key, index) => `${key} = $${index + 2}`);
    const values = keys.map((key) => (key === "attributes" ? JSON.stringify(after[key]) : after[key]));
    await client.query(`update assets set ${sets.join(", ")} where id = $1`, [id, ...values]);
    if (keys.some((key) => RISK_FIELDS.has(key))) await recomputeRisk(client, id);

    await lifecycleEvent({ assetId: id, eventType: "ASSET_UPDATED", user, before, after, remarks: `Updated ${keys.join(", ")}` }, client);
    await audit({ user, action: "ASSET_UPDATED", entity: "asset", entityId: id, diff: { before, after }, ip }, client);
    return loadAsset((text, params) => client.query(text, params), id);
  });
}

// Shared by manual status changes and by other modules (maintenance, works) via role "SYSTEM".
export async function transitionAssetStatus(client, assetId, to, actor, { role, remarks, eventType = "STATUS_CHANGED", refType, refId } = {}) {
  const { rows } = await client.query("select id, lifecycle_status from assets where id = $1 for update", [assetId]);
  const asset = rows[0];
  if (!asset) throw AppError.notFound("Asset not found");
  if (asset.lifecycle_status === to) return asset;
  const rule = assertTransition(assetMachine, asset.lifecycle_status, to, role ?? actor.role);
  if (rule.requires?.includes("remarks") && !remarks?.trim()) {
    throw AppError.badRequest(`Remarks are required to move an asset to ${to}`);
  }
  await client.query("update assets set lifecycle_status = $2 where id = $1", [assetId, to]);
  await lifecycleEvent({ assetId, eventType, fromStatus: asset.lifecycle_status, toStatus: to, user: actor, remarks, refType, refId }, client);
  return { ...asset, lifecycle_status: to, from: asset.lifecycle_status };
}

export async function changeAssetStatus(user, id, { to, remarks }, ip) {
  await getScopedAsset(user, id);
  return withTransaction(async (client) => {
    const result = await transitionAssetStatus(client, id, to, user, { remarks });
    await audit({ user, action: "ASSET_STATUS_CHANGED", entity: "asset", entityId: id, diff: { before: { lifecycle_status: result.from }, after: { lifecycle_status: to }, remarks }, ip }, client);
    return result;
  });
}
