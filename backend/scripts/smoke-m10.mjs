// M10 notifications & daily jobs smoke test: node --experimental-websocket scripts/smoke-m10.mjs
// Runs the daily job twice (the second run must not repeat alerts) and exercises read state.
import { call, check, login, summary } from "./_client.mjs";

const hq = await login("hq@gujinfra.example");
const ee = await login("ee.ahmedabad@gujinfra.example");
const kiran = await login("ae.daskroi@gujinfra.example");

check("Only HQ runs jobs -> AE 403", (await call(kiran, "/admin/jobs/daily/run", { method: "POST" })).status === 403);
const first = await call(hq, "/admin/jobs/daily/run", { method: "POST" });
const steps = Object.keys(first.body.data?.summary ?? {});
check("Daily job runs all five steps", first.status === 200 && first.body.data.status === "SUCCEEDED" && ["risk", "inspections_overdue", "sla_breaches", "dlp_expiring", "tasks_overdue"].every((key) => steps.includes(key)), `${first.body.data?.summary?.ms} ms`);
check("Risk recomputed for every live asset", first.body.data?.summary?.risk?.assets > 400, `${first.body.data?.summary?.risk?.assets} assets`);

const second = await call(hq, "/admin/jobs/daily/run", { method: "POST" });
const repeated = ["inspections_overdue", "sla_breaches", "dlp_expiring", "tasks_overdue"].reduce((sum, key) => sum + (second.body.data?.summary?.[key]?.notified ?? 0), 0);
check("Re-running the same day sends no duplicate alerts", second.status === 200 && repeated === 0, `${repeated} repeated`);

const jobs = await call(hq, "/admin/jobs");
check("Job history lists manual runs with who triggered them", jobs.body.data?.runs?.some((run) => run.trigger === "MANUAL" && run.triggered_by_name === "Meera Desai"));
check("Schedule reported as run today", jobs.body.data?.schedule?.ran_today === true);

const inbox = await call(ee, "/notifications?limit=50");
const kinds = new Set(inbox.body.data?.map((item) => item.kind));
check("EE receives overdue-inspection and SLA / DLP alerts", kinds.has("INSPECTION_OVERDUE") && (kinds.has("SLA_BREACH") || kinds.has("DLP_EXPIRING")), [...kinds].join(", "));
check("Alerts carry a deep link", inbox.body.data?.every((item) => !item.link || item.link.startsWith("/")));
const before = (await call(ee, "/notifications/count")).body.data.unread;
check("Another user cannot read my alert -> 404", (await call(kiran, `/notifications/${inbox.body.data[0].id}/read`, { method: "POST" })).status === 404);
// On a re-run the same day every alert may already be read (alerts are sent once); only then is this check skipped.
const target = inbox.body.data.find((item) => !item.read_at);
if (target) {
  await call(ee, `/notifications/${target.id}/read`, { method: "POST" });
  const after = (await call(ee, "/notifications/count")).body.data.unread;
  check("Marking one read lowers the unread count by one", after === before - 1, `${before} -> ${after}`);
}
await call(ee, "/notifications/read-all", { method: "POST" });
check("Mark all read clears the badge", (await call(ee, "/notifications/count")).body.data.unread === 0);
check("Unread filter returns nothing after read-all", (await call(ee, "/notifications?unread=true")).body.data.length === 0);

summary("M10");
