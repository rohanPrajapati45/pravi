// Creates (or restores) the first HQ administrator on a fresh installation.
// Usage: npm run create-admin -w backend -- --email admin@dept.gov.in --name "System Administrator" [--password "..."] [--designation "..."]
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
};
const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const designation = arg("designation") ?? "System Administrator (HQ)";
const password = arg("password") ?? `${randomBytes(9).toString("base64url")}@1`;

if (!email || !name) {
  console.error('Usage: npm run create-admin -w backend -- --email <email> --name "<full name>" [--password <password>]');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const { rows: state } = await client.query("select id from org_units where type = 'STATE' order by created_at limit 1");
  if (!state[0]) throw new Error("No STATE office found — run `npm run seed:production -w backend` first.");

  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(listError.message);
  let authId = list.users.find((user) => user.email === email)?.id;
  if (authId) {
    const { error } = await supabase.auth.admin.updateUserById(authId, { password, ban_duration: "none" });
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (error) throw new Error(error.message);
    authId = data.user.id;
  }

  const { rows } = await client.query(
    `insert into users (auth_id, name, email, role, designation, org_unit_id)
     values ($1, $2, $3, 'HQ', $4, $5)
     on conflict (email) do update set auth_id = excluded.auth_id, name = excluded.name, role = 'HQ', designation = excluded.designation,
       org_unit_id = excluded.org_unit_id, contractor_id = null, is_active = true
     returning id`,
    [authId, name, email, designation, state[0].id]
  );
  await client.query(
    `insert into audit_logs (user_id, actor_role, action, entity, entity_id, diff) values (null, 'SYSTEM', 'ADMIN_BOOTSTRAPPED', 'user', $1, $2)`,
    [rows[0].id, JSON.stringify({ email, via: "create-admin script" })]
  );

  console.log(`\nHQ administrator ready: ${name} <${email}>`);
  if (!arg("password")) console.log(`Temporary password: ${password}   (share securely; change after first sign-in)`);
} catch (error) {
  console.error(`create-admin failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
