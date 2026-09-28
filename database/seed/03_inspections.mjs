import { createClient } from "@supabase/supabase-js";

const defectsByCategory = {
  ROAD: ["Potholes", "Alligator cracking", "Rutting", "Edge breaking", "Shoulder erosion", "Drain blocked"],
  BRIDGE: ["Deck cracking", "Expansion joint damage", "Bearing distress", "Scour at foundation", "Spalling / exposed rebar", "Railing damage"],
  CULVERT: ["Silting", "Wing wall cracks", "Scour at outlet", "Headwall damage"],
  BUILDING: ["Roof leakage", "Wall cracks", "Dampness", "Plaster damage", "Electrical faults"],
  EQUIPMENT: ["Not working", "Abnormal noise", "Safety device fault", "AMC lapsed"],
  ELECTRICAL: ["Lamps not working", "Pole damage", "Cable exposed"]
};

const fieldUsers = { "SUB-DAS": "ae.daskroi@gujinfra.example", "SUB-SAN": "ae.sanand@gujinfra.example", "SUB-OLP": "ae.olpad@gujinfra.example" };

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function ensureBucket() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { error } = await supabase.storage.createBucket("evidence", {
    public: false,
    fileSizeLimit: "5MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  });
  if (error && !/already exists/i.test(error.message)) throw new Error(`Storage bucket: ${error.message}`);
}

export const inspectionsStep = {
  name: "inspection history + evidence bucket",
  async run(client, context) {
    await ensureBucket();

    const { rows: assets } = await client.query(
      `select a.id, a.asset_code, a.condition_rating, a.last_inspected_at, a.commissioned_on, a.lat, a.lng,
              t.category, t.inspection_interval_days as interval, o.code as org_code
         from assets a join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id
        where a.asset_code ~ '-000[0-9]{3}$'
          and a.condition_rating is not null and a.last_inspected_at is not null
          and not exists (select 1 from inspections i where i.asset_id = a.id)
        order by a.asset_code`
    );
    if (!assets.length) return;

    const rand = mulberry32(7);
    const DAY = 86_400_000;
    const records = [];
    let serial = 0;

    for (const asset of assets) {
      const hero = asset.asset_code === "RDB-BR-000001";
      const count = hero ? 5 : 2 + Math.floor(rand() * 4);
      const pool = defectsByCategory[asset.category] ?? defectsByCategory.BUILDING;
      const commissioned = asset.commissioned_on ? new Date(asset.commissioned_on).getTime() : 0;
      const email = fieldUsers[asset.org_code];

      // Walk back in time: older inspections were in the same or better condition.
      const ratings = [asset.condition_rating];
      for (let k = 1; k < count; k += 1) ratings.push(Math.min(5, ratings[k - 1] + (rand() < 0.45 ? 1 : 0)));

      for (let k = count - 1; k >= 0; k -= 1) {
        const at = new Date(new Date(asset.last_inspected_at).getTime() - k * asset.interval * (0.9 + rand() * 0.2) * DAY);
        if (at.getTime() < commissioned) continue;
        const rating = ratings[k];
        const defects = rating <= 3 ? pool.filter(() => rand() < 0.35).slice(0, 3) : [];
        if (rating <= 3 && !defects.length) defects.push(pool[Math.floor(rand() * pool.length)]);
        serial += 1;
        records.push({
          inspection_code: `INS-${at.getFullYear()}-S${String(serial).padStart(5, "0")}`,
          asset_id: asset.id,
          type: at.getMonth() === 4 ? "PRE_MONSOON" : at.getMonth() === 9 ? "POST_MONSOON" : "ROUTINE",
          inspector_id: email ? context.userIds?.[email] ?? null : null,
          inspector_name: email ? null : "Field staff (legacy record)",
          inspected_at: at.toISOString(),
          condition_rating: rating,
          previous_condition: k + 1 < count ? ratings[k + 1] : null,
          severity: rating === 1 ? "HIGH" : rating === 2 ? "MEDIUM" : "LOW",
          defects,
          remarks: defects.length ? `Observed: ${defects.join(", ").toLowerCase()}.` : "No significant defects observed.",
          lat: asset.lat,
          lng: asset.lng,
          status: "REVIEWED"
        });
      }
    }

    const { rows: inserted } = await client.query(
      `insert into inspections (inspection_code, asset_id, type, inspector_id, inspector_name, inspected_at, condition_rating,
                                previous_condition, severity, defects, remarks, lat, lng, status)
       select inspection_code, asset_id, type, inspector_id, inspector_name, inspected_at, condition_rating,
              previous_condition, severity, defects, remarks, lat, lng, status
         from jsonb_to_recordset($1::jsonb) as x(inspection_code text, asset_id uuid, type text, inspector_id uuid, inspector_name text,
              inspected_at timestamptz, condition_rating smallint, previous_condition smallint, severity text, defects jsonb,
              remarks text, lat numeric, lng numeric, status text)
       on conflict (inspection_code) do nothing
       returning id`,
      [JSON.stringify(records)]
    );

    await client.query(
      `insert into lifecycle_events (asset_id, event_type, actor_id, actor_role, at, lat, lng, ref_type, ref_id, before, after, remarks)
       select i.asset_id, 'INSPECTION_RECORDED', i.inspector_id, 'AE', i.inspected_at, i.lat, i.lng, 'inspection', i.id::text,
              jsonb_build_object('condition_rating', i.previous_condition),
              jsonb_build_object('condition_rating', i.condition_rating, 'severity', i.severity, 'defects', i.defects),
              i.inspection_code || ': condition ' || coalesce(i.previous_condition::text, 'unrated') || ' → ' || i.condition_rating
         from inspections i where i.id = any($1)`,
      [inserted.map((row) => row.id)]
    );
    context.insertedInspections = inserted.length;
  }
};
