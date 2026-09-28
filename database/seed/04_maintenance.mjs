import { computeRisk } from "../../backend/src/services/risk.engine.js";

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const titles = {
  ROAD: ["Pothole patching", "Edge repair and shoulder dressing", "Drain desilting", "Crack sealing"],
  BRIDGE: ["Expansion joint sealing", "Bearing cleaning and greasing", "Railing repair", "Deck wearing-coat patching"],
  CULVERT: ["Culvert desilting", "Wing wall repair", "Outlet apron repair"],
  BUILDING: ["Roof waterproofing", "Wall crack repair", "Electrical rewiring", "Plumbing leak repair"],
  EQUIPMENT: ["Lift safety device repair", "AC servicing", "Fire system refill and test"],
  ELECTRICAL: ["Replace failed lamps", "Pole straightening", "Cable insulation repair"]
};

// ~60 requests across every status for the demo; ~10 overdue, ~8 DLP-liable, 1 closed repair on the hero bridge.
export const maintenanceStep = {
  name: "maintenance requests",
  async run(client, context) {
    const { rows: existing } = await client.query("select 1 from maintenance_requests where request_code like 'MR-%-S%' limit 1");
    if (existing.length) return;

    const u = context.userIds;
    const byEmail = (email) => u[email];
    const { rows: assets } = await client.query(
      `select a.id, a.asset_code, a.name, a.lifecycle_status, a.condition_rating, a.dlp_end_date, t.category, o.code as org_code, d.code as division_code
         from assets a join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id join org_units d on d.id = o.parent_id
        where a.asset_code ~ '-000[0-9]{3}$' and a.lifecycle_status in ('OPERATIONAL', 'UNDER_MAINTENANCE', 'CLOSED_TEMPORARILY')
          and a.asset_code <> 'RDB-BR-000001'
        order by (a.lifecycle_status = 'UNDER_MAINTENANCE') desc, coalesce(a.dlp_end_date >= current_date, false) desc, a.condition_rating nulls last, a.asset_code`
    );

    const rand = mulberry32(99);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const now = Date.now();
    const iso = (ms) => new Date(ms).toISOString();

    const amd = assets.filter((asset) => asset.division_code === "DIV-AMD");
    const sur = assets.filter((asset) => asset.division_code === "DIV-SUR");
    const rest = assets.filter((asset) => !["DIV-AMD", "DIV-SUR"].includes(asset.division_code));
    const chosen = [...amd.slice(0, 40), ...sur.slice(0, 12), ...rest.filter((asset) => asset.condition_rating <= 2).slice(0, 8)];

    const fieldFor = (asset) =>
      asset.division_code === "DIV-SUR"
        ? { ae: byEmail("ae.olpad@gujinfra.example"), ee: byEmail("ee.surat@gujinfra.example"), contractorUser: byEmail("contractor.kaveri@gujinfra.example"), contractor: context.contractorIds["CON-002"] }
        : { ae: asset.org_code === "SUB-SAN" ? byEmail("ae.sanand@gujinfra.example") : byEmail("ae.daskroi@gujinfra.example"), ee: byEmail("ee.ahmedabad@gujinfra.example"), contractorUser: byEmail("contractor.aarav@gujinfra.example"), contractor: context.contractorIds["CON-001"] };

    const plan = [
      ...Array(15).fill("OPEN"),
      ...Array(12).fill("ASSIGNED"),
      ...Array(10).fill("IN_PROGRESS"),
      ...Array(6).fill("COMPLETED"),
      ...Array(5).fill("VERIFIED"),
      ...Array(10).fill("CLOSED"),
      ...Array(2).fill("CANCELLED")
    ];

    const records = [];
    let serial = 0;
    let overdueLeft = 10;
    chosen.forEach((asset, index) => {
      const inOtherDivision = !["DIV-AMD", "DIV-SUR"].includes(asset.division_code);
      let status = inOtherDivision ? "OPEN" : plan[index % plan.length];
      if (asset.lifecycle_status === "UNDER_MAINTENANCE" && !inOtherDivision) status = "IN_PROGRESS";
      const field = fieldFor(asset);
      const inDlp = asset.dlp_end_date && new Date(asset.dlp_end_date).getTime() >= now;
      const severity = asset.condition_rating === 1 ? "HIGH" : asset.condition_rating === 2 ? pick(["HIGH", "MEDIUM"]) : pick(["MEDIUM", "LOW"]);
      const createdAt = now - (5 + Math.floor(rand() * 80)) * DAY;
      const active = ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(status);
      const overdue = active && overdueLeft > 0 && rand() < 0.4;
      if (overdue) overdueLeft -= 1;
      const due = overdue ? now - (2 + Math.floor(rand() * 20)) * DAY : active ? now + (3 + Math.floor(rand() * 28)) * DAY : createdAt + 15 * DAY;
      const toContractor = inDlp || rand() < 0.25;
      const assignee = status === "OPEN" ? null : toContractor ? field.contractorUser : field.ae;
      const done = ["COMPLETED", "VERIFIED", "CLOSED"].includes(status);
      const verified = ["VERIFIED", "CLOSED"].includes(status);
      serial += 1;
      records.push({
        request_code: `MR-${new Date(createdAt).getFullYear()}-S${String(serial).padStart(4, "0")}`,
        asset_id: asset.id,
        source: rand() < 0.75 ? "INSPECTION" : "MANUAL",
        title: `${pick(titles[asset.category] ?? titles.BUILDING)} — ${asset.name}`.slice(0, 200),
        severity,
        status,
        priority_score: null,
        assigned_to: assignee,
        assigned_by: assignee ? field.ee : null,
        assigned_at: assignee ? iso(createdAt + DAY) : null,
        contractor_id: inDlp || (assignee && assignee === field.contractorUser) ? field.contractor : null,
        due_date: new Date(due).toISOString().slice(0, 10),
        dlp_liable: Boolean(inDlp),
        estimated_cost: Math.round(20 + rand() * 480) * 1000,
        actual_cost: status === "CLOSED" ? Math.round(20 + rand() * 480) * 1000 : null,
        started_at: ["IN_PROGRESS", "COMPLETED", "VERIFIED", "CLOSED"].includes(status) ? iso(createdAt + 3 * DAY) : null,
        completed_at: done ? iso(createdAt + 10 * DAY) : null,
        completed_by: done ? assignee : null,
        completion_remarks: done ? "Work completed as per site instruction (demo)." : null,
        verified_by: verified ? (assignee === field.ae ? field.ee : field.ae) : null,
        verified_at: verified ? iso(createdAt + 12 * DAY) : null,
        verified_condition: verified ? Math.min(5, (asset.condition_rating ?? 3) + 1) : null,
        verification_remarks: verified ? "Verified on site (demo)." : null,
        closed_at: status === "CLOSED" ? iso(createdAt + 15 * DAY) : null,
        cancel_reason: status === "CANCELLED" ? "Duplicate of an earlier request (demo)." : null,
        created_by: field.ee,
        created_at: iso(createdAt)
      });
    });

    // A completed repair in the hero bridge's history for the demo timeline.
    const { rows: hero } = await client.query("select id from assets where asset_code = 'RDB-BR-000001'");
    if (hero[0]) {
      const created = now - 240 * DAY;
      records.push({
        request_code: "MR-2026-S0999", asset_id: hero[0].id, source: "INSPECTION", title: "Expansion joint sealing — Daskroi River Bridge (Demo)",
        severity: "MEDIUM", status: "CLOSED", priority_score: null, assigned_to: byEmail("contractor.aarav@gujinfra.example"), assigned_by: byEmail("ee.ahmedabad@gujinfra.example"),
        assigned_at: iso(created + DAY), contractor_id: context.contractorIds["CON-001"], due_date: new Date(created + 15 * DAY).toISOString().slice(0, 10), dlp_liable: true,
        estimated_cost: 180000, actual_cost: 0, started_at: iso(created + 3 * DAY), completed_at: iso(created + 9 * DAY), completed_by: byEmail("contractor.aarav@gujinfra.example"),
        completion_remarks: "Joint resealed under DLP at contractor's cost.", verified_by: byEmail("ae.daskroi@gujinfra.example"), verified_at: iso(created + 11 * DAY), verified_condition: 4,
        verification_remarks: "Joint watertight after rain test.", closed_at: iso(created + 12 * DAY), cancel_reason: null, created_by: byEmail("ae.daskroi@gujinfra.example"), created_at: iso(created)
      });
    }

    const columns = `request_code text, asset_id uuid, source text, title text, severity text, status text, priority_score numeric, assigned_to uuid,
      assigned_by uuid, assigned_at timestamptz, contractor_id uuid, due_date date, dlp_liable boolean, estimated_cost numeric, actual_cost numeric,
      started_at timestamptz, completed_at timestamptz, completed_by uuid, completion_remarks text, verified_by uuid, verified_at timestamptz,
      verified_condition smallint, verification_remarks text, closed_at timestamptz, cancel_reason text, created_by uuid, created_at timestamptz`;
    const names = columns.split(",").map((column) => column.trim().split(" ")[0]).join(", ");
    const { rows: inserted } = await client.query(
      `insert into maintenance_requests (${names}) select ${names} from jsonb_to_recordset($1::jsonb) as x(${columns})
       on conflict (request_code) do nothing returning id, asset_id, request_code, status, created_at, verified_at, dlp_liable`,
      [JSON.stringify(records)]
    );

    await client.query(
      `insert into lifecycle_events (asset_id, event_type, actor_role, at, ref_type, ref_id, remarks)
       select m.asset_id, 'MAINTENANCE_RAISED', 'SYSTEM', m.created_at, 'maintenance_request', m.id::text,
              m.request_code || ' raised: ' || m.title || case when m.dlp_liable then ' · contractor liable (in DLP)' else '' end
         from maintenance_requests m where m.id = any($1)
       union all
       select m.asset_id, 'MAINTENANCE_VERIFIED', 'EE', m.verified_at, 'maintenance_request', m.id::text,
              m.request_code || ': repair verified, condition → ' || m.verified_condition
         from maintenance_requests m where m.id = any($1) and m.verified_at is not null`,
      [inserted.map((row) => row.id)]
    );

    // Assets with active work are under maintenance; refresh risk now that repair history exists.
    await client.query(
      `update assets set lifecycle_status = 'UNDER_MAINTENANCE'
        where lifecycle_status = 'OPERATIONAL' and id in (select asset_id from maintenance_requests where status = 'IN_PROGRESS')`
    );
    const touched = [...new Set(inserted.map((row) => row.asset_id))];
    const { rows: riskRows } = await client.query(
      `select a.*, t.inspection_interval_days,
              (select count(*) from maintenance_requests m where m.asset_id = a.id and m.status in ('VERIFIED','CLOSED') and m.created_at > now() - interval '5 years')::int as repairs,
              (select count(*) from maintenance_requests m where m.asset_id = a.id and m.severity = 'HIGH' and m.status not in ('VERIFIED','CLOSED','CANCELLED'))::int as open_high
         from assets a join asset_types t on t.id = a.type_id where a.id = any($1)`,
      [touched]
    );
    for (const asset of riskRows) {
      const risk = computeRisk(asset, { repairsLast5y: asset.repairs, openHighDefects: asset.open_high });
      await client.query("update assets set risk_score = $2, risk_band = $3, risk_factors = $4 where id = $1", [asset.id, risk.score, risk.band, JSON.stringify(risk.factors)]);
      await client.query("update maintenance_requests set priority_score = $2 where asset_id = $1 and priority_score is null", [asset.id, risk.score]);
    }
  }
};
