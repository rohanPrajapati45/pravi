import { upsertTemplates } from "./work_templates.mjs";

export const programmes = [
  {
    code: "SHIP-2026-27",
    name: "State Highway Improvement Programme 2026-27 (Demo)",
    description: "Widening and strengthening of state highways and major district roads.",
    financial_year: "2026-27",
    budget_head: "5054-Roads (demo)",
    allocated_amount: 4_500_000_000
  },
  {
    code: "RCB-2026-27",
    name: "Rural Connectivity & Bridges 2026-27 (Demo)",
    description: "New link roads, minor bridges and culvert replacement in rural talukas.",
    financial_year: "2026-27",
    budget_head: "5054-Bridges (demo)",
    allocated_amount: 1_800_000_000
  }
];

export const templatesStep = {
  name: "work templates and approval limits (+ demo programmes)",
  async run(client, context) {
    context.templateIds = await upsertTemplates(client);
    if (context.profile === "production") return;
    const { rows: state } = await client.query("select id from org_units where code = 'GJ'");
    context.programmeIds = {};
    for (const programme of programmes) {
      const { rows } = await client.query(
        `insert into programmes (code, name, description, financial_year, budget_head, allocated_amount, owner_org_unit_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (code) do update set name = excluded.name, description = excluded.description, allocated_amount = excluded.allocated_amount
         returning id`,
        [programme.code, programme.name, programme.description, programme.financial_year, programme.budget_head, programme.allocated_amount, state[0].id, context.userIds["hq@gujinfra.example"]]
      );
      context.programmeIds[programme.code] = rows[0].id;
    }
  }
};
