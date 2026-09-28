import { query, withTransaction } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { getScopedAsset, recomputeRisk } from "./assets.service.js";
import { audit, lifecycleEvent } from "./audit.service.js";
import { createRequestRecord } from "./maintenance.service.js";
import { notify, officersCovering } from "./notifications.service.js";
import { assertOwnedPaths, signedUrls } from "./storage.service.js";

export const CATEGORIES = ["POTHOLE", "ROAD_DAMAGE", "BRIDGE_DAMAGE", "DRAINAGE", "WATERLOGGING", "STREETLIGHT", "SIGNAGE", "BUILDING", "OTHER"];
export const CITIZEN = { id: null, role: "CITIZEN", name: "Citizen" };
const OPEN = ["RECEIVED", "ACKNOWLEDGED", "IN_PROGRESS"];

// Which asset categories a complaint most likely concerns — used to prefer the right asset when several are nearby.
const CATEGORY_ASSETS = {
  POTHOLE: ["ROAD"],
  ROAD_DAMAGE: ["ROAD"],
  BRIDGE_DAMAGE: ["BRIDGE", "CULVERT"],
  DRAINAGE: ["ROAD", "CULVERT"],
  WATERLOGGING: ["ROAD", "CULVERT"],
  STREETLIGHT: ["ELECTRICAL", "ROAD_FURNITURE"],
  SIGNAGE: ["ROAD_FURNITURE", "ROAD"],
  BUILDING: ["BUILDING", "ELECTRICAL", "EQUIPMENT"],
  OTHER: []
};
const PREFERRED_RADIUS_M = 500;
const ANY_RADIUS_M = 200;
const ROUTING_RADIUS_M = 10000;

// Metres between two points (equirectangular — accurate to well under 1% at these distances).
function metres([lng1, lat1], [lng2, lat2]) {
  const x = ((lng2 - lng1) * Math.PI) / 180 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const y = ((lat2 - lat1) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * 6371000;
}

// Distance from a point to a road's line (nearest segment), or to a structure's point.
function distanceTo(point, asset) {
  const line = asset.geometry?.type === "LineString" ? asset.geometry.coordinates : null;
  if (!line || line.length < 2) return metres(point, [Number(asset.lng), Number(asset.lat)]);
  let best = Infinity;
  for (let index = 1; index < line.length; index += 1) {
    const [a, b] = [line[index - 1], line[index]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = dx || dy ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, metres(point, [a[0] + t * dx, a[1] + t * dy]));
  }
  return best;
}

async function nearbyAssets(lat, lng, radiusDeg) {
  const { rows } = await query(
    `select a.id, a.asset_code, a.name, a.lat, a.lng, a.geometry, a.org_unit_id, t.category, t.name as type_name
       from assets a join asset_types t on t.id = a.type_id
      where a.lifecycle_status not in ('RETIRED', 'PLANNED') and a.parent_id is null and a.lat is not null
        and a.lat between $1::numeric - $3::numeric and $1::numeric + $3::numeric
        and a.lng between $2::numeric - $3::numeric and $2::numeric + $3::numeric`,
    [lat, lng, radiusDeg]
  );
  return rows.map((row) => ({ ...row, distance: Math.round(distanceTo([lng, lat], row)) })).sort((a, b) => a.distance - b.distance);
}

// Routing: an asset code wins; otherwise the nearest likely asset; otherwise the nearest office; otherwise the HQ queue.
export async function matchComplaint({ asset_code, lat, lng, category }) {
  if (asset_code) {
    const { rows } = await query("select id, org_unit_id from assets where asset_code = upper($1) and lifecycle_status <> 'RETIRED'", [asset_code.trim()]);
    if (rows[0]) return { asset_id: rows[0].id, org_unit_id: rows[0].org_unit_id, match_method: "CODE", match_distance_m: null };
  }
  if (lat == null || lng == null) return { asset_id: null, org_unit_id: null, match_method: null, match_distance_m: null };
  const candidates = await nearbyAssets(lat, lng, 0.06);
  const preferred = CATEGORY_ASSETS[category] ?? [];
  const best =
    candidates.find((asset) => preferred.includes(asset.category) && asset.distance <= PREFERRED_RADIUS_M) ??
    candidates.find((asset) => asset.distance <= ANY_RADIUS_M);
  if (best) return { asset_id: best.id, org_unit_id: best.org_unit_id, match_method: "NEAREST", match_distance_m: best.distance };
  const office = candidates[0]?.distance <= ROUTING_RADIUS_M ? candidates[0] : (await nearbyAssets(lat, lng, 0.1))[0];
  return { asset_id: null, org_unit_id: office && office.distance <= ROUTING_RADIUS_M ? office.org_unit_id : null, match_method: null, match_distance_m: null };
}

// Shared by the public form and the portal adapters (CPGRAMS / SWAGAT).
export async function intakeComplaint(input, { channel = "WEB", externalRef = null } = {}) {
  if (input.photo_paths?.length) assertOwnedPaths(input.photo_paths, "complaint/");
  const match = await matchComplaint(input);
  return withTransaction(async (client) => {
    // The same problem on the same asset reported again within 14 days is linked to the open complaint, not duplicated.
    let duplicate = null;
    if (match.asset_id) {
      const { rows } = await client.query(
        `select id, complaint_code from complaints where asset_id = $1 and category = $2 and status = any($3) and created_at > now() - interval '14 days'
          order by created_at limit 1`,
        [match.asset_id, input.category, OPEN]
      );
      duplicate = rows[0] ?? null;
    }
    const { rows } = await client.query(
      `insert into complaints (complaint_code, channel, external_ref, category, description, location_text, lat, lng, citizen_name, citizen_phone, photo_paths,
                               asset_id, match_method, match_distance_m, org_unit_id, status, duplicate_of)
       values ('CMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('complaint_code_seq')::text, 5, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       returning *`,
      [
        channel,
        externalRef,
        input.category,
        input.description,
        input.location_text ?? null,
        input.lat ?? null,
        input.lng ?? null,
        input.citizen_name ?? null,
        input.citizen_phone ?? null,
        input.photo_paths ?? [],
        match.asset_id,
        match.match_method,
        match.match_distance_m,
        match.org_unit_id,
        duplicate ? "DUPLICATE" : "RECEIVED",
        duplicate?.id ?? null
      ]
    );
    const complaint = rows[0];
    const actor = { ...CITIZEN, role: channel === "WEB" ? "CITIZEN" : channel };
    if (match.asset_id) {
      await lifecycleEvent(
        {
          assetId: match.asset_id,
          eventType: "COMPLAINT_RECEIVED",
          user: actor,
          refType: "complaint",
          refId: complaint.id,
          remarks: `${complaint.complaint_code} via ${channel}: ${input.description.slice(0, 160)}${duplicate ? ` (same issue as ${duplicate.complaint_code})` : ""}`
        },
        client
      );
    }
    await audit({ user: actor, action: "COMPLAINT_RECEIVED", entity: "complaint", entityId: complaint.id, diff: { remarks: `${complaint.complaint_code} · ${input.category} via ${channel}` } }, client);
    if (!duplicate) {
      const recipients = match.org_unit_id
        ? await officersCovering(client, match.org_unit_id, ["AE", "EE"])
        : (await client.query("select id from users where role = 'HQ' and is_active")).rows.map((row) => row.id);
      await notify(client, {
        userIds: recipients,
        kind: "COMPLAINT",
        severity: input.category === "BRIDGE_DAMAGE" ? "WARNING" : "INFO",
        title: `New citizen complaint ${complaint.complaint_code}`,
        body: `${input.category.replaceAll("_", " ").toLowerCase()} · ${input.description.slice(0, 120)}${match.org_unit_id ? "" : " · not routed — needs an office"}`,
        link: `/complaints/${complaint.id}`,
        dedupeKey: `complaint:${complaint.id}`
      });
    }
    return { ...complaint, duplicate_of_code: duplicate?.complaint_code ?? null };
  });
}

// Citizen-facing status: no other citizen's personal data, and the description only to the person who filed it.
export async function trackComplaint(code, phoneLast4) {
  const { rows } = await query(
    `select c.*, a.asset_code, a.name as asset_name, o.name as office_name, d.complaint_code as duplicate_of_code,
            m.request_code, m.status as request_status, m.due_date as request_due
       from complaints c left join assets a on a.id = c.asset_id left join org_units o on o.id = c.org_unit_id
       left join complaints d on d.id = c.duplicate_of left join maintenance_requests m on m.id = c.maintenance_request_id
      where c.complaint_code = upper($1)`,
    [code.trim()]
  );
  const complaint = rows[0];
  const phoneDigits = complaint?.citizen_phone?.replace(/\D/g, "") ?? "";
  if (!complaint || (phoneDigits && phoneDigits.slice(-4) !== (phoneLast4 ?? ""))) {
    throw AppError.notFound("No complaint matches that number and phone");
  }
  const steps = [
    { key: "RECEIVED", label: "Received", at: complaint.created_at, note: complaint.office_name ? `Routed to ${complaint.office_name}` : "Awaiting routing by HQ" },
    { key: "ACKNOWLEDGED", label: "Acknowledged by an engineer", at: complaint.acknowledged_at },
    {
      key: "IN_PROGRESS",
      label: "Repair scheduled",
      at: complaint.request_code ? complaint.updated_at : null,
      note: complaint.request_code ? `Repair ${complaint.request_code} · ${complaint.request_status.toLowerCase().replaceAll("_", " ")}${complaint.request_due ? ` · target ${complaint.request_due}` : ""}` : null
    },
    { key: "RESOLVED", label: complaint.status === "REJECTED" ? "Closed — not actionable by R&B" : "Resolved", at: complaint.resolved_at, note: complaint.resolution_note }
  ];
  return {
    complaint_code: complaint.complaint_code,
    category: complaint.category,
    status: complaint.status,
    channel: complaint.channel,
    created_at: complaint.created_at,
    description: complaint.description,
    location_text: complaint.location_text,
    asset: complaint.asset_code ? { code: complaint.asset_code, name: complaint.asset_name } : null,
    office: complaint.office_name,
    duplicate_of: complaint.duplicate_of_code,
    steps
  };
}

// ---------- officer side ----------

const SELECT = `select c.*, a.asset_code, a.name as asset_name, a.lifecycle_status as asset_status, o.name as office_name, o.path as org_path,
       m.request_code, m.status as request_status, d.complaint_code as duplicate_of_code,
       ak.name as acknowledged_by_name, rv.name as resolved_by_name,
       (select count(*)::int from complaints x where x.duplicate_of = c.id) as duplicates
  from complaints c left join assets a on a.id = c.asset_id left join org_units o on o.id = c.org_unit_id
  left join maintenance_requests m on m.id = c.maintenance_request_id left join complaints d on d.id = c.duplicate_of
  left join users ak on ak.id = c.acknowledged_by left join users rv on rv.id = c.resolved_by`;

function complaintScope(user, params) {
  if (user.role === "HQ") return "true";
  params.push(`${user.org_path}%`);
  return `o.path like $${params.length}`;
}

async function getScopedComplaint(user, id) {
  if (user.role === "CONTRACTOR") throw AppError.forbidden("Complaints are handled by the department");
  const { rows } = await query(`${SELECT} where c.id = $1`, [id]);
  const complaint = rows[0];
  if (!complaint) throw AppError.notFound("Complaint not found");
  if (user.role !== "HQ" && !(complaint.org_path ?? "").startsWith(user.org_path)) throw AppError.forbidden("This complaint is outside your jurisdiction");
  return complaint;
}

function complaintActions(user, complaint) {
  const actions = [];
  if (["RECEIVED", "ACKNOWLEDGED"].includes(complaint.status)) {
    if (complaint.status === "RECEIVED") actions.push("acknowledge");
    actions.push("link_asset");
    if (complaint.asset_id) actions.push("raise_request");
    actions.push("resolve", "reject");
  }
  return actions;
}

export async function listComplaints(user, filters, { limit, offset }) {
  if (user.role === "CONTRACTOR") return { rows: [], total: 0 };
  const params = [];
  const where = [complaintScope(user, params)];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (filters.status?.length) add("c.status = any(?)", filters.status);
  if (filters.category) add("c.category = ?", filters.category);
  if (filters.asset_id) add("c.asset_id = ?", filters.asset_id);
  if (filters.channel) add("c.channel = ?", filters.channel);
  if (filters.unrouted) where.push("c.org_unit_id is null");
  if (filters.q) add("(c.complaint_code ilike ? or c.description ilike ? or c.location_text ilike ?)", `%${filters.q}%`);
  const whereSql = where.join(" and ");
  const scopeParams = [];
  const scopeSql = complaintScope(user, scopeParams);
  const [{ rows }, count, summary] = await Promise.all([
    query(`${SELECT} where ${whereSql} order by (c.status = any('{RECEIVED,ACKNOWLEDGED}')) desc, c.created_at desc limit $${params.length + 1} offset $${params.length + 2}`, [...params, limit, offset]),
    query(`select count(*)::int as total from complaints c left join org_units o on o.id = c.org_unit_id where ${whereSql}`, params),
    query(`select c.status, count(*)::int as n from complaints c left join org_units o on o.id = c.org_unit_id where ${scopeSql} group by c.status`, scopeParams)
  ]);
  return {
    rows: rows.map(({ org_path, citizen_phone, ...row }) => ({ ...row, citizen_phone: citizen_phone ? `••••••${citizen_phone.replace(/\D/g, "").slice(-4)}` : null })),
    total: count.rows[0].total,
    by_status: Object.fromEntries(summary.rows.map((row) => [row.status, row.n]))
  };
}

export async function getComplaintDetail(user, id) {
  const complaint = await getScopedComplaint(user, id);
  const [history, duplicates, openRequests, candidates] = await Promise.all([
    query(
      `select l.action, l.at, l.diff, l.actor_role, u.name as actor_name from audit_logs l left join users u on u.id = l.user_id
        where l.entity = 'complaint' and l.entity_id = $1 order by l.at`,
      [id]
    ),
    query("select id, complaint_code, created_at, channel from complaints where duplicate_of = $1 order by created_at", [id]),
    complaint.asset_id
      ? query("select id, request_code, title, status, severity, due_date from maintenance_requests where asset_id = $1 and status in ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED') order by created_at desc", [complaint.asset_id])
      : { rows: [] },
    complaint.lat != null ? nearbyAssets(Number(complaint.lat), Number(complaint.lng), 0.03) : []
  ]);
  const { org_path, ...rest } = complaint;
  return {
    ...rest,
    photos: await signedUrls(complaint.photo_paths),
    history: history.rows,
    duplicates_list: duplicates.rows,
    open_requests: openRequests.rows,
    // Nearby assets the officer may be allowed to link, nearest first.
    candidates: candidates.slice(0, 6).map(({ geometry, ...asset }) => asset),
    allowed_actions: complaintActions(user, complaint)
  };
}

async function complaintStep(user, id, { action, allowed, apply, describe, ip }) {
  const complaint = await getScopedComplaint(user, id);
  if (!complaintActions(user, complaint).includes(allowed)) {
    throw AppError.invalidTransition(`${complaint.complaint_code} is ${complaint.status.toLowerCase().replaceAll("_", " ")}`);
  }
  return withTransaction(async (client) => {
    const { rows } = await client.query("select * from complaints where id = $1 for update", [id]);
    if (rows[0].status !== complaint.status) throw AppError.invalidTransition("This complaint was just updated by someone else");
    const changes = await apply(client, complaint);
    const keys = Object.keys(changes);
    await client.query(`update complaints set ${keys.map((key, index) => `${key} = $${index + 2}`).join(", ")} where id = $1`, [id, ...Object.values(changes)]);
    await audit({ user, action, entity: "complaint", entityId: id, diff: { remarks: `${complaint.complaint_code}${describe ? ` · ${describe}` : ""}` }, ip }, client);
    return { id, complaint_code: complaint.complaint_code, ...changes };
  });
}

export const acknowledgeComplaint = (user, id, _body, ip) =>
  complaintStep(user, id, { action: "COMPLAINT_ACKNOWLEDGED", allowed: "acknowledge", ip, apply: () => ({ status: "ACKNOWLEDGED", acknowledged_by: user.id, acknowledged_at: new Date() }) });

export async function linkComplaintAsset(user, id, { asset_id }, ip) {
  const asset = await getScopedAsset(user, asset_id);
  return complaintStep(user, id, {
    action: "COMPLAINT_ROUTED",
    allowed: "link_asset",
    ip,
    describe: `linked to ${asset.asset_code} (${asset.org_unit_name})`,
    apply: async (client, complaint) => {
      await lifecycleEvent({ assetId: asset.id, eventType: "COMPLAINT_LINKED", user, refType: "complaint", refId: id, remarks: `${complaint.complaint_code} linked by ${user.name}` }, client);
      await notify(client, {
        userIds: (await officersCovering(client, asset.org_unit_id, ["AE", "EE"])).filter((person) => person !== user.id),
        kind: "COMPLAINT",
        title: `Complaint ${complaint.complaint_code} routed to your office`,
        body: `${asset.asset_code} · ${complaint.description.slice(0, 120)}`,
        link: `/complaints/${id}`,
        dedupeKey: `complaint:${id}:routed:${asset.org_unit_id}`
      });
      return { asset_id: asset.id, org_unit_id: asset.org_unit_id, match_method: "MANUAL", match_distance_m: null };
    }
  });
}

export async function raiseComplaintRequest(user, id, { severity, title, request_id }, ip) {
  return complaintStep(user, id, {
    action: "COMPLAINT_IN_PROGRESS",
    allowed: "raise_request",
    ip,
    apply: async (client, complaint) => {
      let request;
      if (request_id) {
        // The problem is already being repaired under an open request — follow that one instead of raising another.
        const { rows } = await client.query("select id, request_code from maintenance_requests where id = $1 and asset_id = $2 and status in ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED')", [request_id, complaint.asset_id]);
        if (!rows[0]) throw AppError.badRequest("That request is not open on this asset");
        request = rows[0];
      } else {
        const { rows: asset } = await client.query("select * from assets where id = $1 for update", [complaint.asset_id]);
        request = await createRequestRecord(client, {
          asset: asset[0],
          user,
          source: "COMPLAINT",
          sourceId: id,
          title: title ?? `Citizen complaint ${complaint.complaint_code}: ${complaint.description}`.slice(0, 200),
          description: complaint.description,
          severity
        });
        await recomputeRisk(client, complaint.asset_id);
      }
      return {
        status: "IN_PROGRESS",
        maintenance_request_id: request.id,
        acknowledged_by: complaint.acknowledged_by ?? user.id,
        acknowledged_at: complaint.acknowledged_at ?? new Date()
      };
    }
  });
}

export const resolveComplaint = (user, id, { note }, ip) =>
  complaintStep(user, id, { action: "COMPLAINT_RESOLVED", allowed: "resolve", ip, describe: note, apply: () => ({ status: "RESOLVED", resolved_by: user.id, resolved_at: new Date(), resolution_note: note }) });

export const rejectComplaint = (user, id, { note }, ip) =>
  complaintStep(user, id, { action: "COMPLAINT_REJECTED", allowed: "reject", ip, describe: note, apply: () => ({ status: "REJECTED", resolved_by: user.id, resolved_at: new Date(), resolution_note: note }) });

export async function assetComplaints(user, assetId) {
  await getScopedAsset(user, assetId);
  const { rows } = await query(`${SELECT} where c.asset_id = $1 order by c.created_at desc limit 50`, [assetId]);
  return rows.map(({ org_path, citizen_phone, citizen_name, ...row }) => row);
}
