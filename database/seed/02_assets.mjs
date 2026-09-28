import { computeRisk } from "../../backend/src/services/risk.engine.js";

const select = (key, label, options, required = false) => ({ key, label, type: "select", options, required });
const number = (key, label, unit, required = false) => ({ key, label, type: "number", unit, required });
const text = (key, label, required = false) => ({ key, label, type: "text", required });

export const assetTypes = [
  {
    code: "ROAD_SEGMENT", name: "Road segment", category: "ROAD", code_prefix: "RD", interval: 365, life: 15,
    schema: [
      select("road_category", "Road category", ["State Highway", "Major District Road", "Other District Road", "Village Road"], true),
      select("carriageway", "Carriageway", ["Single lane", "Intermediate lane", "Two lane", "Four lane"], true),
      select("surface_type", "Surface", ["Bituminous", "Concrete", "WBM", "Gravel"], true),
      number("width_m", "Carriageway width", "m")
    ]
  },
  {
    code: "BRIDGE", name: "Bridge", category: "BRIDGE", code_prefix: "BR", interval: 180, life: 75,
    schema: [
      select("structure_type", "Structure type", ["RCC Girder", "PSC Box Girder", "Steel Truss", "Masonry Arch", "Slab"], true),
      number("span_count", "Number of spans", "", true),
      number("total_length_m", "Total length", "m", true),
      select("load_class", "Design load class", ["IRC Class AA", "IRC Class A", "IRC Class B"]),
      text("crossing", "Crossing (river / rail / road)")
    ]
  },
  {
    code: "CULVERT", name: "Culvert", category: "CULVERT", code_prefix: "CV", interval: 365, life: 50,
    schema: [select("culvert_type", "Culvert type", ["Box", "Pipe", "Slab"], true), number("vents", "Vents", ""), number("length_m", "Length", "m")]
  },
  {
    code: "BUILDING", name: "Government building", category: "BUILDING", code_prefix: "BL", interval: 365, life: 60,
    schema: [
      select("building_use", "Use", ["Office", "Residential quarters", "Rest house", "Health centre", "School"], true),
      number("floors", "Floors", "", true),
      number("plinth_area_sqm", "Plinth area", "m²")
    ]
  },
  {
    code: "LIFT", name: "Lift", category: "EQUIPMENT", code_prefix: "EQ", interval: 90, life: 20,
    schema: [number("capacity_persons", "Capacity", "persons", true), text("make", "Make"), text("amc_vendor", "AMC vendor")]
  },
  {
    code: "AC_PLANT", name: "Air-conditioning unit", category: "EQUIPMENT", code_prefix: "EQ", interval: 90, life: 12,
    schema: [number("tonnage", "Capacity", "TR", true), text("make", "Make")]
  },
  {
    code: "FIRE_SYSTEM", name: "Fire safety system", category: "EQUIPMENT", code_prefix: "EQ", interval: 180, life: 15,
    schema: [select("system_type", "System", ["Sprinkler", "Hydrant", "Alarm & detection"], true), text("certificate_no", "Fire NOC / certificate no.")]
  },
  {
    code: "STREETLIGHT", name: "Streetlight run", category: "ELECTRICAL", code_prefix: "SL", interval: 180, life: 15,
    schema: [number("pole_count", "Poles", "", true), select("fixture", "Fixture", ["LED", "Sodium vapour", "Solar LED"], true)]
  }
];

const divisionCentres = {
  "DIV-AMD": [23.02, 72.57], "DIV-GNR": [23.22, 72.65], "DIV-MEH": [23.6, 72.38], "DIV-VAD": [22.31, 73.18],
  "DIV-AND": [22.56, 72.95], "DIV-PAN": [22.77, 73.61], "DIV-SUR": [21.17, 72.83], "DIV-NAV": [20.95, 72.92],
  "DIV-BHR": [21.7, 72.98], "DIV-RAJ": [22.3, 70.8], "DIV-JMN": [22.47, 70.06], "DIV-BHV": [21.76, 72.15]
};

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;
const iso = (date) => date.toISOString().slice(0, 10);

export const assetsStep = {
  name: "asset types and 500 demo assets",
  async run(client, context) {
    const typeIds = {};
    for (const type of assetTypes) {
      const { rows } = await client.query(
        `insert into asset_types (code, name, category, code_prefix, attribute_schema, inspection_interval_days, design_life_years)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (code) do update set name = excluded.name, category = excluded.category, code_prefix = excluded.code_prefix,
           attribute_schema = excluded.attribute_schema, inspection_interval_days = excluded.inspection_interval_days,
           design_life_years = excluded.design_life_years
         returning id`,
        [type.code, type.name, type.category, type.code_prefix, JSON.stringify(type.schema), type.interval, type.life]
      );
      typeIds[type.code] = rows[0].id;
    }
    context.typeIds = typeIds;
    const typeByCode = Object.fromEntries(assetTypes.map((type) => [type.code, type]));

    const { rows: subs } = await client.query(
      `select s.id, s.code, s.name, s.district, d.code as division_code
         from org_units s join org_units d on d.id = s.parent_id
        where s.type = 'SUBDIVISION' order by s.code`
    );
    const ahmedabadSubs = subs.filter((sub) => sub.division_code === "DIV-AMD");

    const rand = mulberry32(20260928);
    const between = (min, max) => min + rand() * (max - min);
    const int = (min, max) => Math.floor(between(min, max + 1));
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const weighted = (pairs) => {
      const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = rand() * total;
      for (const [value, weight] of pairs) if ((roll -= weight) <= 0) return value;
      return pairs[pairs.length - 1][0];
    };

    const now = new Date();
    const roadCursor = {};
    const counters = {};
    const records = [];

    function base(index, typeCode, sub, overrides = {}) {
      const type = typeByCode[typeCode];
      const [clat, clng] = divisionCentres[sub.division_code];
      const commissionedYearsAgo = between(1, Math.min(type.life * 1.1, 40));
      const commissioned = new Date(now - commissionedYearsAgo * 365.25 * DAY);
      // Within the inspection interval, so only the deliberately overdue set below is overdue.
      const lastInspected = new Date(now - int(5, Math.floor(type.interval * 0.95)) * DAY);
      const nextDue = new Date(lastInspected.getTime() + type.interval * DAY);
      return {
        asset_code: `RDB-${type.code_prefix}-${String(index).padStart(6, "0")}`,
        type_code: typeCode,
        org_unit_id: sub.id,
        district: sub.district,
        taluka: sub.name.replace(/ Sub-division$/, ""),
        lat: Number((clat + between(-0.22, 0.22)).toFixed(6)),
        lng: Number((clng + between(-0.22, 0.22)).toFixed(6)),
        lifecycle_status: "OPERATIONAL",
        condition_rating: weighted([[5, 15], [4, 35], [3, 28], [2, 15], [1, 7]]),
        criticality: int(2, 4),
        traffic_level: int(2, 4),
        commissioned_on: iso(commissioned),
        design_life_years: type.life,
        last_inspected_at: lastInspected.toISOString(),
        next_inspection_due: iso(nextDue),
        dlp_end_date: null,
        parent_code: null,
        geometry: null,
        road_code: null,
        start_chainage_km: null,
        end_chainage_km: null,
        ...overrides
      };
    }

    const subFor = () => (rand() < 0.3 ? pick(ahmedabadSubs) : pick(subs));
    const das = subs.find((sub) => sub.code === "SUB-DAS");

    // Hero asset for the demo (PRD 17): Daskroi bridge inside its defect liability period.
    const heroDlpEnd = new Date(now.getTime() + 212 * DAY);
    records.push(
      base(1, "BRIDGE", das, {
        name: "Daskroi River Bridge (Demo)",
        attributes: { structure_type: "PSC Box Girder", span_count: 6, total_length_m: 186, load_class: "IRC Class AA", crossing: "River (demo)" },
        condition_rating: 3,
        criticality: 5,
        traffic_level: 4,
        commissioned_on: iso(new Date(heroDlpEnd.getTime() - 730 * DAY)),
        dlp_end_date: iso(heroDlpEnd),
        original_cost: 184500000,
        lat: 22.9412,
        lng: 72.6031
      })
    );

    let index = 2;
    const next = () => index++;

    for (let i = 0; i < 300; i += 1) {
      const sub = subFor();
      const roadNo = int(1, 6);
      const roadCode = `DMO-${sub.division_code.slice(4)}-${String(roadNo).padStart(2, "0")}`;
      const start = roadCursor[roadCode] ?? Number(between(0, 20).toFixed(1));
      const end = Number((start + between(1.5, 4)).toFixed(3));
      roadCursor[roadCode] = end;
      const record = base(next(), "ROAD_SEGMENT", sub, {
        name: `${roadCode} ${sub.district} road, km ${start.toFixed(1)}–${end.toFixed(1)}`,
        road_code: roadCode,
        start_chainage_km: start,
        end_chainage_km: end,
        criticality: int(2, 5),
        traffic_level: int(2, 5),
        original_cost: Math.round(between(50, 300)) * 100000,
        attributes: {
          road_category: pick(["State Highway", "Major District Road", "Other District Road", "Village Road"]),
          carriageway: pick(["Single lane", "Intermediate lane", "Two lane", "Four lane"]),
          surface_type: weighted([["Bituminous", 70], ["Concrete", 15], ["WBM", 10], ["Gravel", 5]]),
          width_m: pick([3.75, 5.5, 7, 7, 14])
        }
      });
      record.geometry = { type: "LineString", coordinates: [[record.lng, record.lat], [Number((record.lng + between(0.01, 0.03)).toFixed(6)), Number((record.lat + between(-0.02, 0.02)).toFixed(6))]] };
      records.push(record);
    }

    for (let i = 0; i < 30; i += 1) {
      const sub = subFor();
      counters.bridge = (counters.bridge ?? 0) + 1;
      records.push(
        base(next(), "BRIDGE", sub, {
          name: `${sub.name.replace(/ Sub-division$/, "")} ${rand() < 0.6 ? "Minor" : "Major"} Bridge ${counters.bridge} (Demo)`,
          criticality: int(4, 5),
          traffic_level: int(3, 5),
          original_cost: Math.round(between(2, 25) * 10) * 1000000,
          attributes: {
            structure_type: pick(["RCC Girder", "PSC Box Girder", "Steel Truss", "Masonry Arch", "Slab"]),
            span_count: int(1, 9),
            total_length_m: int(18, 320),
            load_class: pick(["IRC Class AA", "IRC Class A"]),
            crossing: pick(["River (demo)", "Canal (demo)", "Rail line (demo)", "Nallah (demo)"])
          }
        })
      );
    }

    for (let i = 0; i < 45; i += 1) {
      const sub = subFor();
      counters.culvert = (counters.culvert ?? 0) + 1;
      records.push(
        base(next(), "CULVERT", sub, {
          name: `${sub.name.replace(/ Sub-division$/, "")} Culvert ${counters.culvert}`,
          criticality: int(2, 4),
          original_cost: Math.round(between(10, 60)) * 100000,
          attributes: { culvert_type: pick(["Box", "Pipe", "Slab"]), vents: int(1, 4), length_m: int(6, 24) }
        })
      );
    }

    const buildingCodes = [];
    for (let i = 0; i < 40; i += 1) {
      const sub = subFor();
      const use = pick(["Office", "Residential quarters", "Rest house", "Health centre", "School"]);
      const label = { Office: "Sub-division Office", "Residential quarters": "Govt. Staff Quarters", "Rest house": "R&B Rest House", "Health centre": "Community Health Centre", School: "Govt. School Block" }[use];
      const record = base(next(), "BUILDING", sub, {
        name: `${label}, ${sub.name.replace(/ Sub-division$/, "")} (Demo)`,
        criticality: int(2, 4),
        traffic_level: int(2, 4),
        original_cost: Math.round(between(1, 8) * 10) * 1000000,
        attributes: { building_use: use, floors: int(1, 5), plinth_area_sqm: int(300, 4000) }
      });
      records.push(record);
      buildingCodes.push(record);
    }

    for (let i = 0; i < 35; i += 1) {
      const parent = buildingCodes[i % 15];
      const typeCode = ["LIFT", "AC_PLANT", "FIRE_SYSTEM"][i % 3];
      const type = typeByCode[typeCode];
      const attributes =
        typeCode === "LIFT" ? { capacity_persons: pick([6, 8, 13]), make: "Demo Elevators" }
        : typeCode === "AC_PLANT" ? { tonnage: pick([2, 5.5, 11, 22]), make: "Demo Cooling" }
        : { system_type: pick(["Sprinkler", "Hydrant", "Alarm & detection"]) };
      const sub = subs.find((candidate) => candidate.id === parent.org_unit_id);
      records.push(
        base(next(), typeCode, sub, {
          name: `${type.name} ${Math.floor(i / 15) + 1} – ${parent.name}`,
          parent_code: parent.asset_code,
          lat: parent.lat,
          lng: parent.lng,
          criticality: typeCode === "FIRE_SYSTEM" ? 4 : int(2, 3),
          original_cost: Math.round(between(5, 40)) * 100000,
          attributes
        })
      );
    }

    for (let i = 0; i < 49; i += 1) {
      const sub = subFor();
      counters.light = (counters.light ?? 0) + 1;
      records.push(
        base(next(), "STREETLIGHT", sub, {
          name: `Streetlight run ${counters.light}, ${sub.name.replace(/ Sub-division$/, "")}`,
          criticality: int(1, 2),
          traffic_level: int(2, 4),
          original_cost: Math.round(between(2, 10)) * 100000,
          attributes: { pole_count: int(12, 80), fixture: pick(["LED", "Sodium vapour", "Solar LED"]) }
        })
      );
    }

    // Lifecycle variety (hero asset at index 0 stays operational).
    const pool = records.slice(1).filter((record) => !record.parent_code);
    const takeFrom = (count, filter = () => true) => {
      const chosen = [];
      while (chosen.length < count) {
        const candidate = pick(pool);
        if (candidate.lifecycle_status === "OPERATIONAL" && !candidate.dlp_end_date && filter(candidate) && !chosen.includes(candidate)) chosen.push(candidate);
      }
      return chosen;
    };
    for (const record of takeFrom(3)) Object.assign(record, { lifecycle_status: "PLANNED", condition_rating: null, last_inspected_at: null, next_inspection_due: null, commissioned_on: null });
    for (const record of takeFrom(5)) Object.assign(record, { lifecycle_status: "UNDER_CONSTRUCTION", condition_rating: null, last_inspected_at: null, next_inspection_due: null, commissioned_on: null });
    for (const record of takeFrom(6)) Object.assign(record, { lifecycle_status: "UNDER_MAINTENANCE", condition_rating: 2 });
    for (const record of takeFrom(2)) Object.assign(record, { lifecycle_status: "CLOSED_TEMPORARILY", condition_rating: 1 });
    for (const record of takeFrom(1)) Object.assign(record, { lifecycle_status: "RETIRED" });

    // ~20 assets in DLP; 5 of them expiring within 30 days.
    takeFrom(20).forEach((record, position) => {
      const end = new Date(now.getTime() + (position < 5 ? int(3, 28) : int(40, 600)) * DAY);
      record.dlp_end_date = iso(end);
      record.commissioned_on = iso(new Date(end.getTime() - 730 * DAY));
      record.condition_rating = weighted([[5, 40], [4, 40], [3, 20]]);
    });

    // 25+ clearly overdue inspections for the demo.
    takeFrom(28, (record) => record.condition_rating).forEach((record) => {
      const interval = typeByCode[record.type_code].interval;
      const last = new Date(now - (interval + int(30, 400)) * DAY);
      record.last_inspected_at = last.toISOString();
      record.next_inspection_due = iso(new Date(last.getTime() + interval * DAY));
    });

    for (const record of records) {
      const type = typeByCode[record.type_code];
      const risk = computeRisk({ ...record, inspection_interval_days: type.interval });
      record.type_id = typeIds[record.type_code];
      record.risk_score = risk.score;
      record.risk_band = risk.band;
      record.risk_factors = risk.factors;
    }

    const columns = `asset_code text, type_id uuid, name text, org_unit_id uuid, district text, taluka text, road_code text,
      start_chainage_km numeric, end_chainage_km numeric, lat numeric, lng numeric, geometry jsonb, attributes jsonb,
      lifecycle_status text, condition_rating smallint, criticality smallint, traffic_level smallint, commissioned_on date,
      original_cost numeric, design_life_years int, dlp_end_date date, last_inspected_at timestamptz,
      next_inspection_due date, risk_score numeric, risk_band text, risk_factors jsonb, parent_id uuid`;
    const names = columns.split(",").map((column) => column.trim().split(" ")[0]).join(", ");

    async function insertBatch(batch) {
      const { rows } = await client.query(
        `insert into assets (${names})
         select ${names} from jsonb_to_recordset($1::jsonb) as x(${columns})
         on conflict (asset_code) do nothing
         returning id, asset_code, lifecycle_status, commissioned_on, lat, lng`,
        [JSON.stringify(batch)]
      );
      return rows;
    }

    const parents = records.filter((record) => !record.parent_code);
    const inserted = await insertBatch(parents);

    const { rows: codeRows } = await client.query("select id, asset_code from assets where asset_code = any($1)", [buildingCodes.map((record) => record.asset_code)]);
    const idByCode = Object.fromEntries(codeRows.map((row) => [row.asset_code, row.id]));
    const children = records.filter((record) => record.parent_code).map((record) => ({ ...record, parent_id: idByCode[record.parent_code] }));
    inserted.push(...(await insertBatch(children)));

    if (inserted.length) {
      await client.query(
        `insert into lifecycle_events (asset_id, event_type, to_status, actor_role, at, lat, lng, remarks)
         select id, 'ASSET_REGISTERED', lifecycle_status, 'SYSTEM', coalesce(commissioned_on::timestamptz, now() - interval '30 days'), lat, lng,
                'Imported from the legacy asset register (demo seed)'
           from assets where id = any($1)`,
        [inserted.map((row) => row.id)]
      );
    }

    const { rows: heroRows } = await client.query("select id from assets where asset_code = 'RDB-BR-000001'");
    context.heroAssetId = heroRows[0]?.id;
    context.insertedAssets = inserted.length;
  }
};
