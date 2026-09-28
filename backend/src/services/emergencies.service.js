import { query, withTransaction } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { getScopedAsset, recomputeRisk, transitionAssetStatus } from "./assets.service.js";
import { audit, lifecycleEvent } from "./audit.service.js";
import { createRequestRecord } from "./maintenance.service.js";
import { notify, officersCovering } from "./notifications.service.js";
import { assertOwnedPaths, signedUrls } from "./storage.service.js";
import { createWork } from "./works.service.js";

const SELECT = `select e.*, o.name as area_name, o.type as area_type, o.path as area_path, d.name as declared_by_name, c.name as closed_by_name,
       (select count(*)::int from emergency_assets x where x.emergency_id = e.id) as assets_reported,
       (select count(*)::int from emergency_assets x where x.emergency_id = e.id and x.status = 'REPORTED') as assets_pending,
       (select count(*)::int from emergency_assets x where x.emergency_id = e.id and x.traffic_status = 'CLOSED' and x.status = 'REPORTED') as assets_closed
  from emergencies e join org_units o on o.id = e.org_unit_id
  join users d on d.id = e.declared_by left join users c on c.id = e.closed_by`;

// An emergency is visible to everyone whose jurisdiction overlaps its area (a state-wide flood reaches every office).
function overlapScope(user, params) {
  if (user.role === "HQ") return "true";
  params.push(user.org_path);
  const p = `$${params.length}`;
  return `(o.path like ${p} || '%' or ${p} like o.path || '%')`;
}

const overlaps = (user, path) => user.role === "HQ" || path.startsWith(user.org_path) || user.org_path.startsWith(path);
const canDeclareIn = (user, path) => user.role === "HQ" || (user.role === "EE" && path.startsWith(user.org_path));

export async function getScopedEmergency(user, id) {
  if (user.role === "CONTRACTOR") throw AppError.forbidden("Emergencies are managed by the department");
  const { rows } = await query(`${SELECT} where e.id = $1`, [id]);
  if (!rows[0]) throw AppError.notFound("Emergency not found");
  if (!overlaps(user, rows[0].area_path)) throw AppError.forbidden("This emergency is outside your jurisdiction");
  return rows[0];
}

export async function listEmergencies(user, { status }) {
  if (user.role === "CONTRACTOR") return [];
  const params = [];
  const where = [overlapScope(user, params)];
  if (status) {
    params.push(status);
    where.push(`e.status = $${params.length}`);
  }
  const { rows } = await query(`${SELECT} where ${where.join(" and ")} order by (e.status = 'ACTIVE') desc, e.declared_at desc limit 50`, params);
  return rows.map(({ area_path, ...row }) => row);
}

export async function declareEmergency(user, input, ip) {
  const { rows: units } = await query("select id, name, type, path from org_units where id = $1", [input.org_unit_id]);
  const area = units[0];
  if (!area) throw AppError.badRequest("Area not found");
  if (!canDeclareIn(user, area.path)) throw AppError.forbidden(user.role === "EE" ? "An EE declares emergencies within their own division; wider areas are declared by HQ" : "Only HQ or an EE declares an emergency");

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into emergencies (emergency_code, title, kind, description, org_unit_id, declared_by)
       values ('EMG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('emergency_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5)
       returning *`,
      [input.title, input.kind, input.description ?? null, area.id, user.id]
    );
    const emergency = rows[0];
    // Everyone in the department whose office overlaps the area is alerted at once.
    const { rows: people } = await client.query(
      `select u.id from users u join org_units o on o.id = u.org_unit_id
        where u.is_active and u.role in ('HQ', 'EE', 'AE') and u.id <> $2 and (o.path like $1 || '%' or $1 like o.path || '%')`,
      [area.path, user.id]
    );
    await notify(client, {
      userIds: people.map((person) => person.id),
      kind: "EMERGENCY",
      severity: "CRITICAL",
      title: `Emergency declared: ${input.title}`,
      body: `${emergency.emergency_code} · ${area.name} · report damaged assets and close unsafe ones to traffic`,
      link: `/emergencies/${emergency.id}`,
      dedupeKey: `emergency:${emergency.id}:declared`
    });
    await audit({ user, action: "EMERGENCY_DECLARED", entity: "emergency", entityId: emergency.id, diff: { remarks: `${emergency.emergency_code} · ${input.title} · ${area.name}` }, ip }, client);
    return { ...emergency, area_name: area.name, alerted: people.length };
  });
}

export async function getEmergencyDetail(user, id) {
  const emergency = await getScopedEmergency(user, id);
  const { rows } = await query(
    `select x.*, a.asset_code, a.name as asset_name, a.lifecycle_status, a.lat, a.lng, t.name as asset_type, o.name as org_unit_name,
            r.name as reported_by_name, rs.name as restored_by_name,
            m.request_code, m.status as request_status, w.work_code, w.status as work_status
       from emergency_assets x join assets a on a.id = x.asset_id join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id
       join users r on r.id = x.reported_by left join users rs on rs.id = x.restored_by
       left join maintenance_requests m on m.id = x.maintenance_request_id left join works w on w.id = x.work_id
      where x.emergency_id = $1
      order by (x.status = 'REPORTED') desc, case x.severity when 'SEVERE' then 1 when 'MAJOR' then 2 else 3 end, x.reported_at desc`,
    [id]
  );
  const officer = user.role === "HQ" || user.role === "EE";
  const active = emergency.status === "ACTIVE";
  const assets = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      photos: await signedUrls(row.photo_paths),
      actions: [
        ...(active && row.status === "REPORTED" ? ["restore"] : []),
        ...(active && officer && !row.work_id ? ["start_work"] : [])
      ]
    }))
  );
  const { area_path, ...rest } = emergency;
  return {
    ...rest,
    assets,
    permissions: {
      report: active && ["HQ", "EE", "AE"].includes(user.role),
      close: active && (user.role === "HQ" || (user.role === "EE" && emergency.declared_by === user.id))
    }
  };
}

export async function reportDamage(user, emergencyId, input, ip) {
  const emergency = await getScopedEmergency(user, emergencyId);
  if (emergency.status !== "ACTIVE") throw AppError.invalidTransition("This emergency is closed");
  const asset = await getScopedAsset(user, input.asset_id);
  if (!asset.org_path.startsWith(emergency.area_path)) throw AppError.badRequest(`${asset.asset_code} is outside the emergency area (${emergency.area_name})`);
  if (["RETIRED", "PLANNED"].includes(asset.lifecycle_status)) throw AppError.badRequest(`${asset.asset_code} is ${asset.lifecycle_status.toLowerCase()} — nothing to report`);
  if (input.photo_paths?.length) assertOwnedPaths(input.photo_paths, `emergency/${emergencyId}/`);

  const result = await withTransaction(async (client) => {
    let record;
    try {
      ({ rows: [record] } = await client.query(
        `insert into emergency_assets (emergency_id, asset_id, damage, severity, traffic_status, photo_paths, reported_by)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [emergencyId, asset.id, input.damage, input.severity, input.traffic_status, input.photo_paths ?? [], user.id]
      ));
    } catch (error) {
      if (error.code === "23505") throw AppError.badRequest(`${asset.asset_code} is already reported under ${emergency.emergency_code}`);
      throw error;
    }
    let closed = false;
    const { rows: current } = await client.query("select * from assets where id = $1 for update", [asset.id]);
    if (input.traffic_status === "CLOSED" && ["OPERATIONAL", "UNDER_MAINTENANCE"].includes(current[0].lifecycle_status)) {
      await transitionAssetStatus(client, asset.id, "CLOSED_TEMPORARILY", user, {
        role: "SYSTEM",
        eventType: "CLOSED_TO_TRAFFIC",
        refType: "emergency",
        refId: emergencyId,
        remarks: `Closed to traffic under ${emergency.emergency_code}: ${input.damage}`
      });
      closed = true;
    }
    await lifecycleEvent(
      {
        assetId: asset.id,
        eventType: "EMERGENCY_DAMAGE_REPORTED",
        user,
        refType: "emergency",
        refId: emergencyId,
        after: { severity: input.severity, traffic_status: input.traffic_status },
        remarks: `${emergency.emergency_code} · ${input.severity.toLowerCase()} damage: ${input.damage} · traffic ${input.traffic_status.toLowerCase()}`
      },
      client
    );
    // The repair enters the normal maintenance workflow, fast-tracked by severity.
    const request = await createRequestRecord(client, {
      asset: current[0],
      user,
      source: "EMERGENCY",
      sourceId: emergencyId,
      title: `Emergency damage (${emergency.emergency_code}): ${input.damage}`,
      description: input.damage,
      severity: input.severity === "MINOR" ? "MEDIUM" : "HIGH",
      dueDays: input.severity === "SEVERE" ? 1 : input.severity === "MAJOR" ? 3 : 7
    });
    await client.query("update emergency_assets set maintenance_request_id = $2 where id = $1", [record.id, request.id]);
    await recomputeRisk(client, asset.id);
    const [ee] = await officersCovering(client, asset.org_unit_id, ["EE"]);
    await audit(
      {
        user,
        action: "EMERGENCY_DAMAGE_REPORTED",
        entity: "asset",
        entityId: asset.id,
        diff: { remarks: `${emergency.emergency_code}: ${input.damage} (${input.severity.toLowerCase()}, traffic ${input.traffic_status.toLowerCase()}) → ${request.request_code}` },
        ip,
        targetUserId: ee && ee !== user.id ? ee : null
      },
      client
    );
    return { ...record, maintenance_request_id: request.id, request_code: request.request_code, closed_to_traffic: closed };
  });
  return result;
}

async function scopedRecord(user, emergencyId, recordId) {
  const emergency = await getScopedEmergency(user, emergencyId);
  const { rows } = await query("select * from emergency_assets where id = $1 and emergency_id = $2", [recordId, emergencyId]);
  if (!rows[0]) throw AppError.notFound("Damage report not found");
  const asset = await getScopedAsset(user, rows[0].asset_id);
  return { emergency, record: rows[0], asset };
}

export async function restoreAsset(user, emergencyId, recordId, { remarks }, ip) {
  const { emergency, record, asset } = await scopedRecord(user, emergencyId, recordId);
  if (emergency.status !== "ACTIVE") throw AppError.invalidTransition("This emergency is closed");
  if (record.status === "RESTORED") throw AppError.invalidTransition(`${asset.asset_code} is already restored`);
  return withTransaction(async (client) => {
    await client.query(
      "update emergency_assets set status = 'RESTORED', traffic_status = 'OPEN', restored_by = $2, restored_at = now(), restore_remarks = $3 where id = $1",
      [recordId, user.id, remarks]
    );
    const { rows } = await client.query("select lifecycle_status from assets where id = $1", [asset.id]);
    if (rows[0].lifecycle_status === "CLOSED_TEMPORARILY") {
      await transitionAssetStatus(client, asset.id, "OPERATIONAL", user, {
        role: "SYSTEM",
        eventType: "REOPENED_TO_TRAFFIC",
        refType: "emergency",
        refId: emergencyId,
        remarks: `Reopened under ${emergency.emergency_code}: ${remarks}`
      });
    }
    await audit({ user, action: "EMERGENCY_ASSET_RESTORED", entity: "asset", entityId: asset.id, diff: { remarks: `${emergency.emergency_code}: ${remarks}` }, ip }, client);
    return { id: recordId, status: "RESTORED", asset_status: rows[0].lifecycle_status === "CLOSED_TEMPORARILY" ? "OPERATIONAL" : rows[0].lifecycle_status };
  });
}

// Fast track: creates a work from the Emergency template (immediate action first, sanction recorded after the fact).
export async function startEmergencyWork(user, emergencyId, recordId, { estimated_cost }, ip) {
  const { emergency, record, asset } = await scopedRecord(user, emergencyId, recordId);
  if (emergency.status !== "ACTIVE") throw AppError.invalidTransition("This emergency is closed");
  if (record.work_id) throw AppError.invalidTransition("An emergency work already exists for this asset");
  const { rows: sub } = await query("select parent_id from org_units where id = $1", [asset.org_unit_id]);
  const work = await createWork(
    user,
    {
      template_code: "EMERGENCY",
      title: `Emergency restoration — ${asset.name}`.slice(0, 200),
      objective: record.damage,
      org_unit_id: sub[0].parent_id,
      initiation_type: "EMERGENCY",
      initiation_ref: emergency.emergency_code,
      priority: "CRITICAL",
      estimated_cost,
      target_asset_ids: [asset.id]
    },
    ip
  );
  await query("update emergency_assets set work_id = $2 where id = $1", [recordId, work.id]);
  return work;
}

export async function closeEmergency(user, id, { remarks }, ip) {
  const emergency = await getScopedEmergency(user, id);
  if (emergency.status !== "ACTIVE") throw AppError.invalidTransition("Already closed");
  if (!(user.role === "HQ" || (user.role === "EE" && emergency.declared_by === user.id))) {
    throw AppError.forbidden("HQ or the EE who declared it closes an emergency");
  }
  if (emergency.assets_pending && !remarks?.trim()) {
    throw AppError.badRequest(`${emergency.assets_pending} asset(s) are not restored yet — explain how they are being handled`);
  }
  await withTransaction(async (client) => {
    await client.query("update emergencies set status = 'CLOSED', closed_by = $2, closed_at = now(), closure_remarks = $3 where id = $1", [id, user.id, remarks ?? null]);
    await audit(
      { user, action: "EMERGENCY_CLOSED", entity: "emergency", entityId: id, diff: { remarks: `${emergency.emergency_code}${emergency.assets_pending ? ` · ${emergency.assets_pending} still pending` : ""}${remarks ? ` · ${remarks}` : ""}` }, ip },
      client
    );
  });
  return { id, status: "CLOSED" };
}
