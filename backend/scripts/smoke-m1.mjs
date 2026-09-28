// M1 API smoke test: node --experimental-websocket scripts/smoke-m1.mjs (backend must be running)
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });

const API = `http://localhost:${process.env.PORT || 4000}/api/v1`;
const PASSWORD = process.env.DEMO_PASSWORD || "GujInfra@2026";
let failures = 0;

function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) failures += 1;
}

async function login(email) {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  const body = await response.json();
  if (!body.access_token) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function call(token, route, options = {}) {
  const response = await fetch(`${API}${route}`, {
    method: options.method ?? "GET",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { status: response.status, body: await response.json() };
}

const hq = await login("hq@gujinfra.example");
const eeAmd = await login("ee.ahmedabad@gujinfra.example");
const aeDas = await login("ae.daskroi@gujinfra.example");
const contractor = await login("contractor.aarav@gujinfra.example");

const noToken = await call(null, "/me");
check("No token -> 401", noToken.status === 401, `got ${noToken.status}`);

for (const [label, token, role] of [["HQ", hq, "HQ"], ["EE", eeAmd, "EE"], ["AE", aeDas, "AE"], ["Contractor", contractor, "CONTRACTOR"]]) {
  const me = await call(token, "/me");
  check(`${label} can log in and GET /me`, me.status === 200 && me.body.data.role === role, `${me.body.data?.name} @ ${me.body.data?.orgUnit?.name}`);
}

const all = await call(hq, "/org-units?limit=200");
const byCode = Object.fromEntries(all.body.data.map((unit) => [unit.code, unit]));
check("HQ sees whole state (1 state + 4 circles + 12 divisions + 32 sub-divisions)", all.body.meta.total === 49, `total ${all.body.meta.total}`);

const eeUnits = await call(eeAmd, "/org-units");
check("EE Ahmedabad scoped to own division subtree", eeUnits.body.meta.total === 4 && eeUnits.body.data.every((u) => u.path.startsWith("/GJ/CIR-AMD/DIV-AMD/")), `total ${eeUnits.body.meta.total}`);

const ownUnit = await call(aeDas, `/org-units/${byCode["SUB-DAS"].id}`);
check("AE Daskroi can fetch own sub-division", ownUnit.status === 200);

const otherDivision = await call(aeDas, `/org-units/${byCode["DIV-SUR"].id}`);
check("AE Daskroi (Division A) CANNOT fetch Surat division (Division B) -> 403", otherDivision.status === 403, otherDivision.body.error?.message);

const siblingSub = await call(aeDas, `/org-units/${byCode["SUB-SAN"].id}`);
check("AE Daskroi CANNOT fetch sibling Sanand sub-division -> 403", siblingSub.status === 403);

const aeUsers = await call(aeDas, "/users");
check("AE cannot list users (role) -> 403", aeUsers.status === 403);

const eeCreate = await call(eeAmd, "/users", {
  method: "POST",
  body: { name: "Should Fail", email: "fail@gujinfra.example", password: "Password123", role: "AE", org_unit_id: byCode["SUB-DAS"].id }
});
check("EE cannot create users -> 403", eeCreate.status === 403);

const invalid = await call(hq, "/users", { method: "POST", body: { name: "X", email: "not-an-email" } });
check("Invalid body -> 400 with field details", invalid.status === 400 && Array.isArray(invalid.body.error?.details));

const email = `smoke.${Date.now()}@gujinfra.example`;
const createdUser = await call(hq, "/users", {
  method: "POST",
  body: { name: "Smoke Test AE", email, password: "SmokeTest123", role: "AE", designation: "Assistant Engineer", org_unit_id: byCode["SUB-DHO"].id }
});
check("HQ creates a user -> 201", createdUser.status === 201, email);

const logs = await call(hq, `/audit-logs?entity=user&entity_id=${createdUser.body.data?.id}`);
check("Audit row written for the create", logs.body.data?.[0]?.action === "USER_CREATED", `by ${logs.body.data?.[0]?.user_name}`);
check("Audit diff never stores the password", !JSON.stringify(logs.body.data?.[0]?.diff ?? {}).includes("SmokeTest123"));

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("update audit_logs set action = 'TAMPERED' where entity = 'user'");
  check("Audit log UPDATE is blocked by the database", false);
} catch (error) {
  check("Audit log UPDATE is blocked by the database", /append-only/.test(error.message), error.message);
}
await db.end();

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll M1 checks passed");
process.exitCode = failures ? 1 : 0;
