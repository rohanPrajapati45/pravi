// Demo data for M11 (measurement book & bills), M12 (a past emergency) and M13 (citizen complaints).
// Idempotent: skipped when measurements already exist.
const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo) => new Date(Date.now() - daysAgo * DAY);
const date = (daysAgo) => at(daysAgo).toISOString().slice(0, 10);

const boq = [
  ["1.01", "Site clearance, setting out and mobilisation", "LS", 1, 2400000],
  ["2.01", "Earthwork in embankment with approved borrow material, compacted to 97% MDD", "cum", 118000, 245],
  ["3.02", "Granular sub-base (GSB), grading II, 200 mm", "cum", 27500, 1650],
  ["4.01", "Wet mix macadam (WMM), 250 mm in two layers", "cum", 20400, 2150],
  ["5.03", "Dense bituminous macadam (DBM), 60 mm", "cum", 7900, 7400],
  ["5.05", "Bituminous concrete (BC), 40 mm", "cum", 3950, 8900],
  ["7.01", "NP4 pipe culvert, 1200 mm dia, including headwalls", "rm", 620, 14500],
  ["8.04", "Thermoplastic road marking, 2.5 mm", "sqm", 9800, 690]
];

export const operationsStep = {
  name: "measurement book, complaints and a past emergency (demo)",
  async run(client) {
    const { rows: done } = await client.query("select 1 from measurements limit 1");
    if (done.length) return;

    const { rows: people } = await client.query("select id, email from users");
    const user = Object.fromEntries(people.map((row) => [row.email, row.id]));
    const [meera, rohit, nisha, kiran, vikram, pooja] = [
      "hq@gujinfra.example",
      "ee.ahmedabad@gujinfra.example",
      "ae.sanand@gujinfra.example",
      "ae.daskroi@gujinfra.example",
      "ee.surat@gujinfra.example",
      "ae.olpad@gujinfra.example"
    ].map((email) => user[email]);

    // ---------- M11: Sanand–Dholka road, mid-construction ----------
    const { rows: works } = await client.query("select id, contractor_id from works where title like 'Sanand–Dholka link road%' limit 1");
    const work = works[0];
    if (work) {
      const { rows: firm } = await client.query("select id from users where contractor_id = $1 and is_active limit 1", [work.contractor_id]);
      const contractor = firm[0]?.id ?? nisha;
      const items = {};
      for (const [itemNo, description, unit, quantity, rate] of boq) {
        const { rows } = await client.query(
          `insert into boq_items (work_id, item_no, description, unit, quantity, rate, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
          [work.id, itemNo, description, unit, quantity, rate, rohit, at(150)]
        );
        items[itemNo] = { id: rows[0].id, rate };
      }
      // [item, measured days ago, location, nos, L, B, D, qty, recorded by, status, checked by, bill, remarks]
      const entries = [
        ["1.01", 88, "Whole stretch", 1, null, null, null, 1, contractor, "CHECKED", rohit, 1],
        ["2.01", 80, "km 0.0–4.0", 1, 4000, 12, 0.9, null, contractor, "CHECKED", nisha, 1],
        ["2.01", 66, "km 4.0–8.0", 1, 4000, 12, 0.9, null, contractor, "CHECKED", nisha, 1],
        ["2.01", 45, "km 8.0–11.0", 1, 3000, 12, 0.85, null, contractor, "CHECKED", rohit, 2],
        ["3.02", 38, "km 0.0–5.0", 1, 5000, 10.5, 0.2, null, contractor, "CHECKED", nisha, 2],
        ["3.02", 16, "km 5.0–8.0", 1, 3000, 10.5, 0.2, null, contractor, "CHECKED", rohit, null],
        ["2.01", 6, "km 11.0–12.4", 1, 1400, 12, 0.85, null, contractor, "RECORDED", null, null, "Embankment raised at km 11–12.4 for the revised HFL; deviation statement submitted"],
        ["3.02", 3, "km 8.0–10.0", 1, 2000, 10.5, 0.2, null, nisha, "RECORDED", null, null]
      ];
      const bills = {};
      let cumulative = 0;
      for (const [billNo, daysAgo, status, paymentRef] of [
        [1, 60, "PAID", "PFMS/GJ/2026/004127"],
        [2, 30, "APPROVED", null]
      ]) {
        const members = entries.filter((entry) => entry[11] === billNo);
        const amount = members.reduce((sum, entry) => {
          const [itemNo, , , nos, length, breadth, depth, qty] = entry;
          const quantity = qty ?? nos * length * breadth * depth;
          return sum + Math.round(quantity * items[itemNo].rate * 100) / 100;
        }, 0);
        cumulative += amount;
        const { rows } = await client.query(
          `insert into running_bills (work_id, bill_no, status, amount, cumulative_amount, entries, created_by, created_at, decided_by, decided_at, payment_ref, paid_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
          [work.id, billNo, status, amount, cumulative, members.length, rohit, at(daysAgo), meera, at(daysAgo - 4), paymentRef, paymentRef ? at(daysAgo - 12) : null]
        );
        bills[billNo] = rows[0].id;
      }
      let entryNo = 0;
      for (const [itemNo, daysAgo, location, nos, length, breadth, depth, qty, recordedBy, status, checkedBy, billNo, remarks] of entries) {
        entryNo += 1;
        const quantity = Math.round((qty ?? nos * length * breadth * depth) * 1000) / 1000;
        const excess = itemNo === "2.01" && entryNo === 7;
        await client.query(
          `insert into measurements (work_id, boq_item_id, entry_no, measured_on, location, nos, length, breadth, depth, quantity, amount, remarks, excess,
                                     recorded_by, recorded_at, status, checked_by, checked_at, bill_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            work.id, items[itemNo].id, entryNo, date(daysAgo), location, nos, length, breadth, depth, quantity,
            Math.round(quantity * items[itemNo].rate * 100) / 100, remarks ?? null, excess, recordedBy, at(daysAgo),
            status, checkedBy, checkedBy ? at(daysAgo - 3) : null, billNo ? bills[billNo] : null
          ]
        );
      }
    }

    // ---------- M13: citizen complaints across the lifecycle ----------
    const one = async (sql, params) => (await client.query(sql, params)).rows[0];
    const code = async () => (await one("select 'CMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('complaint_code_seq')::text, 5, '0') as code")).code;
    const insertComplaint = async (fields) => {
      const columns = Object.keys(fields);
      const row = await one(
        `insert into complaints (complaint_code, ${columns.join(", ")}) values ($1, ${columns.map((_, index) => `$${index + 2}`).join(", ")}) returning id, complaint_code, asset_id`,
        [await code(), ...Object.values(fields)]
      );
      if (row.asset_id) {
        await client.query(
          `insert into lifecycle_events (asset_id, event_type, actor_role, ref_type, ref_id, remarks, at) values ($1, 'COMPLAINT_RECEIVED', $2, 'complaint', $3, $4, $5)`,
          [row.asset_id, fields.channel === "WEB" || !fields.channel ? "CITIZEN" : fields.channel, row.id, `${row.complaint_code} via ${fields.channel ?? "WEB"}: ${fields.description.slice(0, 160)}`, fields.created_at]
        );
      }
      return row;
    };

    const hero = await one("select id, org_unit_id, lat, lng from assets where asset_code = 'RDB-BR-000001'");
    if (hero) {
      await insertComplaint({
        category: "BRIDGE_DAMAGE", description: "Railing is broken on the downstream side near the middle of the bridge. Two-wheelers pass very close to the edge at night.",
        location_text: "Daskroi river bridge, Ahmedabad side", lat: Number(hero.lat) + 0.0004, lng: Number(hero.lng) + 0.0003, citizen_name: "Ramesh Patel", citizen_phone: "9898012345",
        asset_id: hero.id, match_method: "NEAREST", match_distance_m: 48, org_unit_id: hero.org_unit_id, status: "ACKNOWLEDGED", acknowledged_by: kiran, acknowledged_at: at(1), created_at: at(2)
      });
    }

    // Linked to a repair already under way.
    const active = await one(
      `select m.id, m.request_code, a.id as asset_id, a.org_unit_id, a.lat, a.lng, t.category from maintenance_requests m join assets a on a.id = m.asset_id
         join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id
        where o.path like '/GJ/CIR-AMD/DIV-AMD/%' and m.status in ('ASSIGNED', 'IN_PROGRESS') and t.category = 'ROAD' order by m.created_at desc limit 1`
    );
    if (active) {
      await insertComplaint({
        category: "POTHOLE", description: "Several deep potholes after the rain; an auto-rickshaw overturned last week.", location_text: "Near the village approach",
        lat: active.lat, lng: active.lng, citizen_name: "Hetal Shah", citizen_phone: "9825098250", asset_id: active.asset_id, match_method: "NEAREST", match_distance_m: 35,
        org_unit_id: active.org_unit_id, status: "IN_PROGRESS", maintenance_request_id: active.id, acknowledged_by: kiran, acknowledged_at: at(4), created_at: at(5)
      });
    }

    // Received through SWAGAT and resolved when its repair closed.
    const closed = await one(
      `select m.id, m.request_code, m.closed_at, m.verified_condition, a.id as asset_id, a.org_unit_id, a.lat, a.lng from maintenance_requests m join assets a on a.id = m.asset_id
         join org_units o on o.id = a.org_unit_id where o.path like '/GJ/CIR-AMD/DIV-AMD/%' and m.status = 'CLOSED' order by m.closed_at desc limit 1`
    );
    if (closed) {
      await insertComplaint({
        channel: "SWAGAT", external_ref: "SWG/2026/08812", category: "ROAD_DAMAGE", description: "Road surface broken for about 200 metres near the canal crossing.",
        lat: closed.lat, lng: closed.lng, citizen_name: "Kanubhai Rathod", citizen_phone: "9427011122", asset_id: closed.asset_id, match_method: "NEAREST", match_distance_m: 120,
        org_unit_id: closed.org_unit_id, status: "RESOLVED", maintenance_request_id: closed.id, acknowledged_by: kiran, acknowledged_at: new Date(new Date(closed.closed_at) - 20 * DAY),
        resolved_by: rohit, resolved_at: closed.closed_at, resolution_note: `Repaired under ${closed.request_code}${closed.verified_condition ? ` — condition after repair ${closed.verified_condition}/5` : ""}`,
        created_at: new Date(new Date(closed.closed_at) - 22 * DAY)
      });
    }

    // New and waiting in the Sanand office's queue.
    const sanand = await one(
      `select a.id, a.org_unit_id, a.lat, a.lng, t.category from assets a join asset_types t on t.id = a.type_id join org_units o on o.id = a.org_unit_id
        where o.code = 'SUB-SAN' and t.category in ('CULVERT', 'ROAD') and a.lat is not null and a.parent_id is null and a.lifecycle_status = 'OPERATIONAL' order by t.category limit 1`
    );
    if (sanand) {
      await insertComplaint({
        category: sanand.category === "CULVERT" ? "DRAINAGE" : "WATERLOGGING", description: "Water stays on the road for days after rain; the culvert seems blocked with silt and plastic.",
        lat: Number(sanand.lat) + 0.0006, lng: Number(sanand.lng) - 0.0004, citizen_name: "Mehul Desai", citizen_phone: "9909001234", asset_id: sanand.id, match_method: "NEAREST",
        match_distance_m: 78, org_unit_id: sanand.org_unit_id, status: "RECEIVED", created_at: at(0.2)
      });
    }

    // Could not be matched to any asset: sits in the HQ routing queue.
    await insertComplaint({
      category: "STREETLIGHT", description: "Street lights on the highway service road have not worked for two weeks.", location_text: "Service road near Changodar bus stand",
      citizen_name: "Anonymous", status: "RECEIVED", created_at: at(0.5)
    });

    // ---------- M12: a past emergency, closed, for history ----------
    const { rows: olpad } = await client.query(
      `select a.id from assets a join org_units o on o.id = a.org_unit_id join asset_types t on t.id = a.type_id
        where o.code = 'SUB-OLP' and t.category in ('ROAD', 'CULVERT') and a.lifecycle_status = 'OPERATIONAL' and a.parent_id is null order by a.asset_code limit 2`
    );
    const division = await one("select id from org_units where code = 'DIV-SUR'");
    if (division && olpad.length) {
      const emergency = await one(
        `insert into emergencies (emergency_code, title, kind, description, org_unit_id, status, declared_by, declared_at, closed_by, closed_at, closure_remarks)
         values ('EMG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('emergency_code_seq')::text, 3, '0'), $1, 'HEAVY_RAIN', $2, $3, 'CLOSED', $4, $5, $6, $7, $8) returning id, emergency_code`,
        [
          "Heavy rain — Olpad taluka (Demo)", "240 mm rain in 24 hours; low-lying roads overtopped.", division.id, vikram, at(40), meera, at(33),
          "All affected assets restored; permanent repairs follow in the regular maintenance programme."
        ]
      );
      const damage = ["Road overtopped at the low stretch; shoulders washed out", "Culvert choked with debris; approach embankment scoured"];
      for (const [index, asset] of olpad.entries()) {
        await client.query(
          `insert into emergency_assets (emergency_id, asset_id, damage, severity, traffic_status, status, reported_by, reported_at, restored_by, restored_at, restore_remarks)
           values ($1, $2, $3, $4, 'OPEN', 'RESTORED', $5, $6, $5, $7, $8)`,
          [emergency.id, asset.id, damage[index], index ? "MAJOR" : "SEVERE", pooja, at(39.8), at(36 - index), "Debris cleared, temporary shoulder built, opened to traffic"]
        );
        await client.query(
          `insert into lifecycle_events (asset_id, event_type, actor_id, actor_role, ref_type, ref_id, remarks, at) values
             ($1, 'EMERGENCY_DAMAGE_REPORTED', $2, 'AE', 'emergency', $3, $4, $5), ($1, 'REOPENED_TO_TRAFFIC', $2, 'AE', 'emergency', $3, $6, $7)`,
          [asset.id, pooja, emergency.id, `${emergency.emergency_code} · ${damage[index]}`, at(39.8), `${emergency.emergency_code}: debris cleared, opened to traffic`, at(36 - index)]
        );
      }
    }
  }
};
