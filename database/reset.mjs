// Drops every GujInfra table (demo/dev only) so migrate + seed rebuild a clean, deterministic demo.
// Usage: npm run db:reset -w backend   (runs this with --confirm, then migrate, then seed)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

if (!process.argv.includes("--confirm")) {
  console.error("Refusing to reset without --confirm. This deletes all GujInfra data in the configured database.");
  process.exit(1);
}

const tables = [
  "contractor_evaluations", "work_approvals", "stage_evaluations", "work_tasks", "work_stages", "task_templates", "stage_templates",
  "work_templates", "approval_limits", "programmes", "maintenance_requests", "inspections", "lifecycle_events", "work_assets", "assets",
  "works", "asset_types", "audit_logs", "users", "contractors", "org_units", "schema_migrations"
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`drop table if exists ${tables.join(", ")} cascade`);
  await client.query("drop sequence if exists asset_code_seq, inspection_code_seq, request_code_seq, work_code_seq cascade");
  await client.query("drop function if exists set_updated_at(), org_units_set_path(), forbid_mutation() cascade");
  await client.query("COMMIT");
  console.log(`Dropped ${tables.length} tables, sequences and functions.`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error.message);
  process.exit(1);
} finally {
  await client.end();
}

// Remove logins created by smoke tests and the evidence photos they uploaded; demo logins are re-synced by the seed.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
const stale = (data?.users ?? []).filter((user) => user.email?.startsWith("smoke."));
for (const user of stale) await supabase.auth.admin.deleteUser(user.id);
const emptied = await supabase.storage.emptyBucket("evidence");
console.log(`Removed ${stale.length} smoke-test login(s); evidence bucket ${emptied.error ? `not emptied (${emptied.error.message})` : "emptied"}.`);
