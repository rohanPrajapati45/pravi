// M6 API smoke test: node --experimental-websocket scripts/smoke-m6.mjs (backend must be running)
import pg from "pg";
import { call, check, login, summary } from "./_client.mjs";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

const hq = await login("hq@gujinfra.example");
const ee = await login("ee.ahmedabad@gujinfra.example");
const ae = await login("ae.daskroi@gujinfra.example");
const contractor = await login("contractor.aarav@gujinfra.example");

// ---- numbers match the database ----
const hqSummary = (await call(hq, "/dashboard/summary")).body.data;
const dbAll = await one(`select count(*)::int total, count(*) filter (where risk_band in ('CRITICAL','HIGH'))::int hot,
                                count(*) filter (where next_inspection_due < current_date)::int overdue, count(*) filter (where dlp_end_date >= current_date)::int dlp
                           from assets where lifecycle_status <> 'RETIRED'`);
check("HQ asset total = DB", hqSummary.assets.total === dbAll.total, `${hqSummary.assets.total}`);
check("HQ critical+high = DB", hqSummary.assets.critical + hqSummary.assets.high === dbAll.hot, `${dbAll.hot}`);
check("HQ overdue inspections = DB", hqSummary.assets.overdue_inspections === dbAll.overdue, `${dbAll.overdue}`);
check("HQ assets in DLP = DB", hqSummary.assets.in_dlp === dbAll.dlp, `${dbAll.dlp}`);
const dbMr = await one(`select count(*) filter (where status in ('OPEN','ASSIGNED','IN_PROGRESS'))::int active,
                               count(*) filter (where due_date < current_date and status in ('OPEN','ASSIGNED','IN_PROGRESS'))::int overdue from maintenance_requests`);
check("HQ active / overdue maintenance = DB", hqSummary.maintenance.active === dbMr.active && hqSummary.maintenance.overdue === dbMr.overdue, `${dbMr.active} / ${dbMr.overdue}`);
const dbWorks = await one(`select count(*) filter (where status not in ('CLOSED','REJECTED','CANCELLED'))::int active from works`);
check("HQ active works = DB", hqSummary.works.active === dbWorks.active, `${dbWorks.active}`);

const eeSummary = (await call(ee, "/dashboard/summary")).body.data;
const dbEe = await one(`select count(*)::int total from assets a join org_units o on o.id = a.org_unit_id where o.path like '/GJ/CIR-AMD/DIV-AMD/%' and a.lifecycle_status <> 'RETIRED'`);
check("EE numbers scoped to Ahmedabad division = DB", eeSummary.assets.total === dbEe.total && eeSummary.assets.total < hqSummary.assets.total, `${eeSummary.assets.total} of ${hqSummary.assets.total}`);
const aeSummary = (await call(ae, "/dashboard/summary")).body.data;
check("AE numbers scoped to Daskroi (smaller than division)", aeSummary.assets.total < eeSummary.assets.total, `${aeSummary.assets.total}`);
const cSummary = (await call(contractor, "/dashboard/summary")).body.data;
check("Contractor sees own evaluations and liable defects", Array.isArray(cSummary.evaluations) && cSummary.evaluations.length >= 1, `${cSummary.evaluations.length} evaluation(s), ${cSummary.maintenance.dlp_liable_open} liable open`);

// ---- explainable priority list ----
const hqTop = (await call(hq, "/dashboard/priority-assets?limit=10")).body.data;
check("Top-10 sorted by risk", hqTop.length === 10 && hqTop.every((row, i) => i === 0 || hqTop[i - 1].risk_score >= row.risk_score), `#1 ${hqTop[0].asset_code} ${hqTop[0].risk_score}`);
check("Every priority row explains its score and suggests an action", hqTop.every((row) => row.risk_factors.some((f) => f.points > 0) && row.recommendation?.action));
const eeTop = (await call(ee, "/dashboard/priority-assets?limit=10")).body.data;
const eeIds = eeTop.map((row) => row.id);
const outside = await one(`select count(*)::int n from assets a join org_units o on o.id = a.org_unit_id where a.id = any($1) and o.path not like '/GJ/CIR-AMD/DIV-AMD/%'`, [eeIds]);
check("EE priority list scoped to own division", outside.n === 0);

const conditions = (await call(hq, "/dashboard/condition-distribution")).body.data;
check("Condition by district for HQ (12 districts)", conditions.group === "district" && conditions.rows.length >= 12);
check("Condition by sub-division for EE", (await call(ee, "/dashboard/condition-distribution")).body.data.group === "sub-division");

// ---- changing condition changes risk and rank ----
const candidate = await one(
  `select a.id, a.asset_code, a.risk_score from assets a join org_units o on o.id = a.org_unit_id
    where o.code = 'SUB-DAS' and a.lifecycle_status = 'OPERATIONAL' and a.condition_rating >= 4 and a.criticality >= 4 and a.parent_id is null
      and not exists (select 1 from maintenance_requests m where m.asset_id = a.id and m.status in ('OPEN','ASSIGNED','IN_PROGRESS','COMPLETED'))
    order by a.criticality desc, a.traffic_level desc limit 1`
);
const rankBefore = eeTop.findIndex((row) => row.id === candidate.id);
await call(ae, "/inspections", { method: "POST", body: { asset_id: candidate.id, condition_rating: 1, severity: "HIGH", defects: ["Smoke test — structural distress"] } });
const eeTopAfter = (await call(ee, "/dashboard/priority-assets?limit=10")).body.data;
const rankAfter = eeTopAfter.findIndex((row) => row.id === candidate.id);
const row = eeTopAfter[rankAfter];
check("Condition 1 raises risk and moves the asset into the top 10", rankBefore === -1 && rankAfter >= 0, `${candidate.asset_code}: ${candidate.risk_score} → ${row?.risk_score} (${row?.risk_band}), rank ${rankAfter + 1}`);
check("Its 'why' names the poor condition", row?.risk_factors.find((f) => f.key === "condition")?.points === 40);

// ---- bulk recompute ----
check("EE cannot trigger bulk recompute -> 403", (await call(ee, "/risk/recompute", { method: "POST" })).status === 403);
const recompute = await call(hq, "/risk/recompute", { method: "POST" });
check("HQ bulk recompute (set-based)", recompute.status === 200, `${recompute.body.data?.assets} assets, ${recompute.body.data?.changed} changed, ${recompute.body.data?.ms} ms`);

const timing = await call(hq, "/dashboard/summary");
check("Dashboard summary responds < 1 s", timing.ms < 1000, `${timing.ms} ms`);

// ---- activity trail: who → whom → when ----
const kiranFeed = (await call(ae, "/activity?scope=for_me&limit=50")).body.data;
const fromRohit = kiranFeed.find((item) => item.actor.name === "Rohit Parmar" && item.target?.name === "Kiran Solanki");
check("Activity: AE sees hand-offs addressed to them, with actor and timestamp", Boolean(fromRohit?.at && fromRohit?.link), fromRohit ? `${fromRohit.actor.name} ${fromRohit.verb} → ${fromRohit.target.name} · ${fromRohit.subject}` : "none");
const rohitFeed = (await call(ee, "/activity?scope=for_me&limit=50")).body.data;
check("Activity: EE sees submissions / completions sent to them", rohitFeed.some((item) => ["MAINTENANCE_COMPLETED", "TASK_SUBMITTED", "MAINTENANCE_AUTO_RAISED"].includes(item.action)), `${rohitFeed.length} items`);
const unread = (await call(ae, `/activity/unread?since=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`)).body.data;
check("Activity: unread count since a timestamp", typeof unread.unread === "number", `${unread.unread} in the last hour`);

await db.end();
summary("M6");
