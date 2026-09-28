// Admin console API smoke test: node --experimental-websocket scripts/smoke-admin.mjs (backend must be running)
import { call, check, login, summary } from "./_client.mjs";

const hq = await login("hq@gujinfra.example");
const ee = await login("ee.ahmedabad@gujinfra.example");
const stamp = Date.now().toString().slice(-6);

check("EE cannot open admin endpoints -> 403", (await call(ee, "/admin/users")).status === 403);

const tree = (await call(hq, "/admin/org-units")).body.data;
const byCode = Object.fromEntries(tree.map((unit) => [unit.code, unit]));
check("Office tree with user/asset counts", tree.length >= 49 && byCode["DIV-AMD"].assets > 0, `${tree.length} offices, Ahmedabad ${byCode["DIV-AMD"].assets} assets`);

// ---- users ----
const wrongLevel = await call(hq, "/users", { method: "POST", body: { name: "Smoke Wrong Level", email: `smoke.level.${stamp}@gujinfra.example`, password: "SmokeTest123", role: "AE", org_unit_id: byCode["DIV-AMD"].id } });
check("AE must sit in a sub-division -> 400", wrongLevel.status === 400, wrongLevel.body.error?.message);
const email = `smoke.admin.${stamp}@gujinfra.example`;
const created = await call(hq, "/users", { method: "POST", body: { name: "Smoke Admin Test AE", email, password: "SmokeTest123", role: "AE", designation: "Assistant Engineer", org_unit_id: byCode["SUB-DHO"].id } });
const userId = created.body.data?.id;
check("HQ creates an AE in a sub-division -> 201", created.status === 201);
const newUserToken = await login(email).catch(() => null);
const passwordLogin = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "SmokeTest123" })
}).then((response) => response.json());
check("New user can sign in and reach the API", Boolean(passwordLogin.access_token) && (await call(passwordLogin.access_token, "/me")).status === 200);

const moved = await call(hq, `/admin/users/${userId}`, { method: "PATCH", body: { org_unit_id: byCode["SUB-SAN"].id, designation: "Assistant Engineer (transferred)" } });
check("Transfer to another sub-division -> 200", moved.status === 200 && moved.body.data.org_unit_id === byCode["SUB-SAN"].id);
check("Promote AE to EE while still in a sub-division -> 400", (await call(hq, `/admin/users/${userId}`, { method: "PATCH", body: { role: "EE" } })).status === 400);

const deactivated = await call(hq, `/admin/users/${userId}`, { method: "PATCH", body: { is_active: false } });
check("Deactivate user -> 200", deactivated.status === 200 && deactivated.body.data.is_active === false);
check("Deactivated user is refused by the API immediately -> 403", (await call(passwordLogin.access_token, "/me")).status === 403);
const bannedLogin = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "SmokeTest123" })
}).then((response) => response.json());
check("Deactivated user cannot sign in", !bannedLogin.access_token, bannedLogin.error_description ?? bannedLogin.msg ?? bannedLogin.error_code);

await call(hq, `/admin/users/${userId}`, { method: "PATCH", body: { is_active: true } });
check("Password reset -> 200", (await call(hq, `/admin/users/${userId}/reset-password`, { method: "POST", body: { password: "ResetSmoke456" } })).status === 200);
const afterReset = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "ResetSmoke456" })
}).then((response) => response.json());
check("Reactivated user signs in with the new password", Boolean(afterReset.access_token));
void newUserToken;

const me = (await call(hq, "/me")).body.data;
check("Admin cannot deactivate own account -> 403", (await call(hq, `/admin/users/${me.id}`, { method: "PATCH", body: { is_active: false } })).status === 403);

const list = await call(hq, `/admin/users?q=Smoke Admin Test&active=true`);
check("User search with filters", list.body.data.some((user) => user.id === userId));

// ---- offices ----
const badOffice = await call(hq, "/admin/org-units", { method: "POST", body: { type: "SUBDIVISION", name: "Smoke Sub-division", code: `SUB-SMK${stamp.slice(-3)}`, parent_id: byCode["CIR-AMD"].id } });
check("Sub-division under a circle -> 400", badOffice.status === 400);
const office = await call(hq, "/admin/org-units", { method: "POST", body: { type: "SUBDIVISION", name: "Smoke Sub-division", code: `SUB-SMK${stamp.slice(-3)}`, parent_id: byCode["DIV-AMD"].id } });
check("Sub-division under a division -> 201 with path", office.status === 201 && office.body.data.path.startsWith("/GJ/CIR-AMD/DIV-AMD/"), office.body.data?.path);

// ---- asset types ----
const badType = await call(hq, "/admin/asset-types", {
  method: "POST",
  body: { code: `SMK_${stamp}`, name: "Smoke Pump", category: "EQUIPMENT", code_prefix: "PM", inspection_interval_days: 90, design_life_years: 15, attribute_schema: [{ key: "Bad Key", label: "x", type: "select", options: ["one"] }] }
});
check("Invalid attribute schema -> 400", badType.status === 400);
const type = await call(hq, "/admin/asset-types", {
  method: "POST",
  body: {
    code: `SMK_${stamp}`, name: `Smoke Water Pump ${stamp}`, category: "EQUIPMENT", code_prefix: "PM", inspection_interval_days: 90, design_life_years: 15,
    attribute_schema: [{ key: "capacity_kw", label: "Capacity", type: "number", unit: "kW", required: true }, { key: "pump_type", label: "Pump type", type: "select", options: ["Centrifugal", "Submersible"] }]
  }
});
check("New asset type created without code changes", type.status === 201);
check("New type available in the asset form list", (await call(ee, "/asset-types")).body.data.some((item) => item.id === type.body.data?.id));
const retired = await call(hq, `/admin/asset-types/${type.body.data.id}`, { method: "PATCH", body: { is_active: false } });
check("Type can be deactivated", retired.body.data?.is_active === false && !(await call(ee, "/asset-types")).body.data.some((item) => item.id === type.body.data.id));

// ---- approval limits change gate authority live ----
const works = (await call(ee, "/works?q=Sub-division Office")).body.data;
const officeWork = works[0];
if (officeWork) {
  const gateBefore = (await call(ee, `/works/${officeWork.id}`)).body.data.stages.find((stage) => stage.status === "ACTIVE")?.gate;
  await call(hq, "/admin/approval-limits", { method: "PUT", body: { role: "EE", max_amount: 10000000 } });
  const gateAfter = (await call(ee, `/works/${officeWork.id}`)).body.data.stages.find((stage) => stage.status === "ACTIVE")?.gate;
  await call(hq, "/admin/approval-limits", { method: "PUT", body: { role: "EE", max_amount: 20000000 } });
  check("Lowering the EE limit to ₹1 Cr removes EE authority over a ₹1.6 Cr gate", gateBefore?.can_evaluate === true && gateAfter?.can_evaluate === false, gateAfter?.reason);
} else {
  check("Seeded ₹1.6 Cr approval work present", false);
}
check("HQ limit stays unlimited -> 400", (await call(hq, "/admin/approval-limits", { method: "PUT", body: { role: "HQ", max_amount: 5 } })).status === 400);

// ---- contractors ----
const firm = await call(hq, "/admin/contractors", { method: "POST", body: { code: `CON-S${stamp.slice(-4)}`, name: `Smoke Builders ${stamp}`, class: "B" } });
check("Contractor created", firm.status === 201);
check("Contractor deactivated", (await call(hq, `/admin/contractors/${firm.body.data.id}`, { method: "PATCH", body: { is_active: false } })).body.data?.is_active === false);
const firms = (await call(hq, "/admin/contractors")).body.data;
check("Contractor list shows performance", firms.some((row) => row.avg_score !== null), firms.map((row) => `${row.name}: ${row.avg_score ?? "—"}`).slice(0, 2).join(", "));

// ---- templates & system ----
const template = (await call(hq, "/admin/work-templates/NEW_ROAD")).body.data;
check("Template detail: 8 stages with tasks and checklists", template.stages.length === 8 && template.stages[5].tasks.length === 7);
const system = (await call(hq, "/admin/system")).body.data;
check("System status with counts and migrations", system.database.status === "ok" && system.migrations.length >= 6, `${system.counts.assets} assets, DB ${system.database.size}`);

const auditTrail = (await call(hq, `/audit-logs?entity=user&entity_id=${userId}`)).body.data.map((row) => row.action);
check("Every admin action is audited", ["USER_CREATED", "USER_UPDATED", "USER_DEACTIVATED", "USER_REACTIVATED", "USER_PASSWORD_RESET"].every((action) => auditTrail.includes(action)), auditTrail.join(", "));

summary("admin");
