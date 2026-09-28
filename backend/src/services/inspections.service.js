import { query, withTransaction } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { assetScope, getScopedAsset, recomputeRisk } from "./assets.service.js";
import { audit, lifecycleEvent } from "./audit.service.js";
import { createRequestRecord } from "./maintenance.service.js";
import { assertOwnedPaths, signedUrls } from "./storage.service.js";

const OPEN_REQUEST_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];

function distanceMetres(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((value) => value == null)) return null;
  const rad = (degrees) => (Number(degrees) * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

// PRD 7.3: a poor inspection raises a maintenance request with zero manual steps.
export function needsMaintenance({ condition_rating, severity }) {
  return condition_rating <= 2 || severity === "HIGH";
}

export async function submitInspection(user, input, ip) {
  await getScopedAsset(user, input.asset_id);
  assertOwnedPaths(input.photo_paths ?? [], `inspection/${input.asset_id}/`);

  return withTransaction(async (client) => {
    const { rows: assetRows } = await client.query(
      `select a.*, t.inspection_interval_days, t.name as type_name, w.contractor_id as origin_contractor_id
         from assets a
         join asset_types t on t.id = a.type_id
         left join works w on w.id = a.origin_work_id
        where a.id = $1 for update of a`,
      [input.asset_id]
    );
    const asset = assetRows[0];
    if (["RETIRED", "PLANNED"].includes(asset.lifecycle_status)) {
      throw AppError.invalidTransition(`A ${asset.lifecycle_status.toLowerCase()} asset cannot be inspected`);
    }

    const distance = distanceMetres(input.lat, input.lng, asset.lat, asset.lng);
    const { rows: inspectionRows } = await client.query(
      `insert into inspections (inspection_code, asset_id, type, inspector_id, inspector_name, condition_rating, previous_condition,
                                severity, defects, remarks, recommendation, lat, lng, gps_accuracy_m, distance_from_asset_m, photo_paths)
       values ('INS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('inspection_code_seq')::text, 6, '0'),
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       returning *`,
      [
        asset.id,
        input.type,
        user.id,
        user.name,
        input.condition_rating,
        asset.condition_rating,
        input.severity,
        JSON.stringify(input.defects ?? []),
        input.remarks ?? null,
        input.recommendation ?? null,
        input.lat ?? null,
        input.lng ?? null,
        input.gps_accuracy_m ?? null,
        distance,
        input.photo_paths ?? []
      ]
    );
    const inspection = inspectionRows[0];

    await client.query(
      `update assets set condition_rating = $2, last_inspected_at = $3,
              next_inspection_due = ($3::timestamptz)::date + $4::int
        where id = $1`,
      [asset.id, input.condition_rating, inspection.inspected_at, asset.inspection_interval_days]
    );

    await lifecycleEvent(
      {
        assetId: asset.id,
        eventType: "INSPECTION_RECORDED",
        user,
        lat: input.lat,
        lng: input.lng,
        refType: "inspection",
        refId: inspection.id,
        before: { condition_rating: asset.condition_rating },
        after: { condition_rating: input.condition_rating, severity: input.severity, defects: input.defects ?? [] },
        remarks: `${inspection.inspection_code}: condition ${asset.condition_rating ?? "unrated"} → ${input.condition_rating}${
          input.defects?.length ? ` · ${input.defects.join(", ")}` : ""
        }`
      },
      client
    );

    let request = null;
    let linkedExisting = false;
    if (needsMaintenance(input)) {
      const { rows: openRows } = await client.query(
        `select id, request_code, status from maintenance_requests where asset_id = $1 and status = any($2) order by created_at desc limit 1`,
        [asset.id, OPEN_REQUEST_STATUSES]
      );
      if (openRows[0]) {
        request = openRows[0];
        linkedExisting = true;
      } else {
        const severity = input.severity === "HIGH" || input.condition_rating === 1 ? "HIGH" : "MEDIUM";
        const defectsText = input.defects?.length ? input.defects.join(", ") : `Condition rated ${input.condition_rating}/5`;
        request = await createRequestRecord(client, {
          asset,
          user,
          source: "INSPECTION",
          sourceId: inspection.id,
          title: `${defectsText} — ${asset.name}`,
          description: [input.remarks, input.recommendation && `Recommended: ${input.recommendation}`].filter(Boolean).join("\n") || null,
          severity
        });
      }
    }

    const risk = await recomputeRisk(client, asset.id);
    if (request && !linkedExisting) {
      await client.query("update maintenance_requests set priority_score = $2 where id = $1", [request.id, risk.score]);
    }
    await audit(
      {
        user,
        action: "INSPECTION_SUBMITTED",
        entity: "inspection",
        entityId: inspection.id,
        diff: { asset_id: asset.id, before: { condition_rating: asset.condition_rating, risk_score: asset.risk_score }, after: { condition_rating: input.condition_rating, risk_score: risk.score } },
        ip
      },
      client
    );

    return {
      inspection,
      asset: {
        id: asset.id,
        asset_code: asset.asset_code,
        name: asset.name,
        previous_condition: asset.condition_rating,
        condition_rating: input.condition_rating,
        previous_risk: { score: Number(asset.risk_score), band: asset.risk_band },
        risk: { score: risk.score, band: risk.band }
      },
      maintenance_request: request ? { id: request.id, request_code: request.request_code, dlp_liable: request.dlp_liable ?? false, linked_existing: linkedExisting } : null,
      location_warning: distance != null && distance > 2000 ? `Captured ${(distance / 1000).toFixed(1)} km from the asset's registered location` : null
    };
  });
}

export async function listInspections(user, filters, { limit, offset }) {
  const params = [];
  const where = [assetScope(user, params)];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (filters.asset_id) add("i.asset_id = ?", filters.asset_id);
  if (filters.mine) add("i.inspector_id = ?", user.id);
  if (filters.severity) add("i.severity = ?", filters.severity);
  const whereSql = where.join(" and ");
  const from = `from inspections i join assets a on a.id = i.asset_id join org_units o on o.id = a.org_unit_id`;

  const [{ rows }, count] = await Promise.all([
    query(
      `select i.id, i.inspection_code, i.type, i.inspected_at, i.condition_rating, i.previous_condition, i.severity, i.defects,
              i.remarks, i.recommendation, i.status, i.photo_paths, i.distance_from_asset_m,
              coalesce(u.name, i.inspector_name) as inspector_name,
              a.id as asset_id, a.asset_code, a.name as asset_name,
              (select m.request_code from maintenance_requests m where m.source_id = i.id limit 1) as request_code
         ${from} left join users u on u.id = i.inspector_id
        where ${whereSql}
        order by i.inspected_at desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`select count(*)::int as total ${from} where ${whereSql}`, params)
  ]);

  // Sign photo URLs for the page being returned only.
  const withPhotos = await Promise.all(rows.map(async (row) => ({ ...row, photos: await signedUrls(row.photo_paths) })));
  return { rows: withPhotos, total: count.rows[0].total };
}

export async function getInspection(user, id) {
  const { rows } = await query(
    `select i.*, coalesce(u.name, i.inspector_name) as inspector_name, r.name as reviewer_name
       from inspections i left join users u on u.id = i.inspector_id left join users r on r.id = i.reviewed_by
      where i.id = $1`,
    [id]
  );
  if (!rows[0]) throw AppError.notFound("Inspection not found");
  const asset = await getScopedAsset(user, rows[0].asset_id);
  return { ...rows[0], asset: { id: asset.id, asset_code: asset.asset_code, name: asset.name }, photos: await signedUrls(rows[0].photo_paths) };
}

export async function reviewInspection(user, id, { remarks }, ip) {
  const inspection = await getInspection(user, id);
  if (inspection.status === "REVIEWED") throw AppError.invalidTransition("Inspection is already reviewed");
  if (inspection.inspector_id === user.id) throw AppError.forbidden("You cannot review your own inspection");
  await withTransaction(async (client) => {
    await client.query("update inspections set status = 'REVIEWED', reviewed_by = $2, reviewed_at = now(), review_remarks = $3 where id = $1", [id, user.id, remarks ?? null]);
    await audit({ user, action: "INSPECTION_REVIEWED", entity: "inspection", entityId: id, diff: { remarks }, ip }, client);
  });
  return getInspection(user, id);
}

export async function conditionHistory(user, assetId) {
  await getScopedAsset(user, assetId);
  const { rows } = await query(
    `select inspected_at, condition_rating, severity, type from (
        select inspected_at, condition_rating, severity, type from inspections where asset_id = $1 order by inspected_at desc limit 24
      ) recent order by inspected_at`,
    [assetId]
  );
  return rows;
}

export async function listAssetRequests(user, assetId) {
  await getScopedAsset(user, assetId);
  const { rows } = await query(
    `select m.id, m.request_code, m.title, m.severity, m.status, m.dlp_liable, m.due_date, m.created_at, m.source,
            u.name as assigned_to_name, c.name as contractor_name,
            (m.due_date < current_date and m.status = any($2)) as is_overdue
       from maintenance_requests m
       left join users u on u.id = m.assigned_to
       left join contractors c on c.id = m.contractor_id
      where m.asset_id = $1
      order by m.created_at desc limit 50`,
    [assetId, OPEN_REQUEST_STATUSES]
  );
  return rows;
}
