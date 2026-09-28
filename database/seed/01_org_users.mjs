import { createClient } from "@supabase/supabase-js";

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "GujInfra@2026";

// Circle -> Division (district) -> Sub-divisions (talukas). Names are for realism only.
const hierarchy = [
  ["AMD", "Ahmedabad Circle", [
    ["AMD", "Ahmedabad Division", "Ahmedabad", [["DAS", "Daskroi"], ["SAN", "Sanand"], ["DHO", "Dholka"]]],
    ["GNR", "Gandhinagar Division", "Gandhinagar", [["KAL", "Kalol"], ["DEH", "Dehgam"]]],
    ["MEH", "Mehsana Division", "Mehsana", [["VIS", "Visnagar"], ["KAD", "Kadi"], ["UNJ", "Unjha"]]]
  ]],
  ["VAD", "Vadodara Circle", [
    ["VAD", "Vadodara Division", "Vadodara", [["PAD", "Padra"], ["KAR", "Karjan"], ["SAV", "Savli"]]],
    ["AND", "Anand Division", "Anand", [["PET", "Petlad"], ["BOR", "Borsad"]]],
    ["PAN", "Panchmahal Division", "Panchmahal", [["GOD", "Godhra"], ["HAL", "Halol"], ["SHE", "Shehera"]]]
  ]],
  ["SUR", "Surat Circle", [
    ["SUR", "Surat Division", "Surat", [["OLP", "Olpad"], ["KAM", "Kamrej"], ["BAR", "Bardoli"]]],
    ["NAV", "Navsari Division", "Navsari", [["GAN", "Gandevi"], ["CHI", "Chikhli"]]],
    ["BHR", "Bharuch Division", "Bharuch", [["ANK", "Ankleshwar"], ["JAM", "Jambusar"], ["AMO", "Amod"]]]
  ]],
  ["RAJ", "Rajkot Circle", [
    ["RAJ", "Rajkot Division", "Rajkot", [["GON", "Gondal"], ["JET", "Jetpur"], ["DHR", "Dhoraji"]]],
    ["JMN", "Jamnagar Division", "Jamnagar", [["DRL", "Dhrol"], ["KLV", "Kalavad"]]],
    ["BHV", "Bhavnagar Division", "Bhavnagar", [["MAH", "Mahuva"], ["PAL", "Palitana"], ["SIH", "Sihor"]]]
  ]]
];

const contractors = [
  { code: "CON-001", name: "Aarav Infra Works (Demo)", class: "AA", contact_name: "Harsh Vora", contact_phone: "90000 00001" },
  { code: "CON-002", name: "Kaveri Constructions (Demo)", class: "A", contact_name: "Dev Shah", contact_phone: "90000 00002" }
];

export const demoUsers = [
  { email: "hq@gujinfra.example", name: "Meera Desai", role: "HQ", designation: "Chief Engineer (HQ)", org: "GJ" },
  { email: "secretary@gujinfra.example", name: "Suresh Joshi", role: "HQ", designation: "Secretary, R&B (HQ)", org: "GJ" },
  { email: "ee.ahmedabad@gujinfra.example", name: "Rohit Parmar", role: "EE", designation: "Executive Engineer", org: "DIV-AMD" },
  { email: "ae.daskroi@gujinfra.example", name: "Kiran Solanki", role: "AE", designation: "Assistant Engineer", org: "SUB-DAS" },
  { email: "ae.sanand@gujinfra.example", name: "Nisha Chauhan", role: "AE", designation: "Assistant Engineer", org: "SUB-SAN" },
  { email: "ee.surat@gujinfra.example", name: "Vikram Rana", role: "EE", designation: "Executive Engineer", org: "DIV-SUR" },
  { email: "ae.olpad@gujinfra.example", name: "Pooja Mehta", role: "AE", designation: "Assistant Engineer", org: "SUB-OLP" },
  { email: "contractor.aarav@gujinfra.example", name: "Harsh Vora", role: "CONTRACTOR", designation: "Contractor representative", org: "DIV-AMD", contractor: "CON-001" },
  { email: "contractor.kaveri@gujinfra.example", name: "Dev Shah", role: "CONTRACTOR", designation: "Contractor representative", org: "DIV-SUR", contractor: "CON-002" }
];

async function upsertOrg(client, { code, type, name, parentId, district }) {
  const { rows } = await client.query(
    `insert into org_units (code, type, name, parent_id, district)
     values ($1, $2, $3, $4, $5)
     on conflict (code) do update set name = excluded.name, type = excluded.type,
       parent_id = excluded.parent_id, district = excluded.district
     returning id`,
    [code, type, name, parentId, district]
  );
  return rows[0].id;
}

async function seedOrgUnits(client) {
  const ids = {};
  ids.GJ = await upsertOrg(client, { code: "GJ", type: "STATE", name: "Roads & Buildings Dept, Gujarat (HQ)", parentId: null, district: null });
  for (const [circleCode, circleName, divisions] of hierarchy) {
    const circleId = await upsertOrg(client, { code: `CIR-${circleCode}`, type: "CIRCLE", name: circleName, parentId: ids.GJ, district: null });
    ids[`CIR-${circleCode}`] = circleId;
    for (const [divCode, divName, district, subdivisions] of divisions) {
      const divId = await upsertOrg(client, { code: `DIV-${divCode}`, type: "DIVISION", name: divName, parentId: circleId, district });
      ids[`DIV-${divCode}`] = divId;
      for (const [subCode, subName] of subdivisions) {
        ids[`SUB-${subCode}`] = await upsertOrg(client, {
          code: `SUB-${subCode}`,
          type: "SUBDIVISION",
          name: `${subName} Sub-division`,
          parentId: divId,
          district
        });
      }
    }
  }
  return ids;
}

async function seedContractors(client) {
  const ids = {};
  for (const contractor of contractors) {
    const { rows } = await client.query(
      `insert into contractors (code, name, class, contact_name, contact_phone)
       values ($1, $2, $3, $4, $5)
       on conflict (code) do update set name = excluded.name, class = excluded.class,
         contact_name = excluded.contact_name, contact_phone = excluded.contact_phone
       returning id`,
      [contractor.code, contractor.name, contractor.class, contractor.contact_name, contractor.contact_phone]
    );
    ids[contractor.code] = rows[0].id;
  }
  return ids;
}

async function ensureAuthUsers() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Supabase listUsers failed: ${error.message}`);
  const existing = new Map(data.users.map((user) => [user.email, user.id]));

  const authIds = {};
  for (const user of demoUsers) {
    if (existing.has(user.email)) {
      authIds[user.email] = existing.get(user.email);
      await supabase.auth.admin.updateUserById(existing.get(user.email), { password: DEMO_PASSWORD });
      continue;
    }
    const created = await supabase.auth.admin.createUser({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name: user.name }
    });
    if (created.error) throw new Error(`Could not create ${user.email}: ${created.error.message}`);
    authIds[user.email] = created.data.user.id;
  }
  return authIds;
}

export const orgUsersStep = {
  name: "offices (+ demo contractors and logins)",
  async run(client, context) {
    const orgIds = await seedOrgUnits(client);
    // Production installs get the real office hierarchy only; people are added through the Admin console.
    if (context.profile === "production") {
      Object.assign(context, { orgIds, contractorIds: {}, userIds: {} });
      return;
    }
    const contractorIds = await seedContractors(client);
    const authIds = await ensureAuthUsers();
    const userIds = {};
    for (const user of demoUsers) {
      const { rows } = await client.query(
        `insert into users (auth_id, name, email, role, designation, org_unit_id, contractor_id)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (email) do update set auth_id = excluded.auth_id, name = excluded.name, role = excluded.role,
           designation = excluded.designation, org_unit_id = excluded.org_unit_id, contractor_id = excluded.contractor_id,
           is_active = true
         returning id`,
        [
          authIds[user.email],
          user.name,
          user.email,
          user.role,
          user.designation,
          orgIds[user.org],
          user.contractor ? contractorIds[user.contractor] : null
        ]
      );
      userIds[user.email] = rows[0].id;
    }
    Object.assign(context, { orgIds, contractorIds, userIds });
  }
};
