// M9 contractors & DLP API smoke test (read-only): node --experimental-websocket scripts/smoke-m9.mjs
import pg from "pg";
import { call, check, login, summary } from "./_client.mjs";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

const hq = await login("hq@gujinfra.example");
const ee = await login("ee.ahmedabad@gujinfra.example");
const ae = await login("ae.daskroi@gujinfra.example");
const aarav = await login("contractor.aarav@gujinfra.example");
const kaveri = await login("contractor.kaveri@gujinfra.example");

// ---- DLP tracker ----
const s = (await call(hq, "/dlp/summary")).body.data;
const dbDlp = await one(`select count(*) filter (where dlp_end_date >= current_date)::int in_dlp,
                                count(*) filter (where dlp_end_date between current_date and current_date + 30)::int exp30 from assets`);
check("DLP summary matches DB (in DLP, expiring ≤30 days)", s.in_dlp === dbDlp.in_dlp && s.expiring_30 === dbDlp.exp30, `${s.in_dlp} in DLP, ${s.expiring_30} expiring`);
const dbLiable = await one(`select count(*)::int n from maintenance_requests where dlp_liable and status in ('OPEN','ASSIGNED','IN_PROGRESS','COMPLETED')`);
check("Open contractor-liable defects match DB", s.liable_open === dbLiable.n, `${s.liable_open} open`);

const active = await call(hq, "/dlp/assets?bucket=active&limit=100");
check("Active DLP list = asset registry 'in DLP' filter", active.body.meta.total === (await call(hq, "/assets?in_dlp=true&limit=1")).body.meta.total, `${active.body.meta.total}`);
check("Active list sorted soonest-expiring first, with days remaining", active.body.data.every((row, i, all) => i === 0 || all[i - 1].days_remaining <= row.days_remaining));
const expiring = (await call(hq, "/dlp/expiring")).body.data;
check("Expiring list only ≤30 days", expiring.length === s.expiring_30 && expiring.every((row) => row.days_remaining >= 0 && row.days_remaining <= 30), `${expiring.length}`);
check("Expired bucket only past end dates", (await call(hq, "/dlp/assets?bucket=expired")).body.data.every((row) => row.days_remaining < 0));
const hero = active.body.data.find((row) => row.asset_code === "RDB-BR-000001");
check("Hero bridge shows origin work + contractor + defect count", Boolean(hero?.work_code && hero?.contractor_name && hero.defects_total >= 1), `${hero?.work_code} · ${hero?.contractor_name} · ${hero?.defects_total} defect(s)`);
check("Bad bucket -> 400", (await call(hq, "/dlp/assets?bucket=soon")).status === 400);
const eeActive = (await call(ee, "/dlp/assets?limit=100")).body.meta.total;
check("EE DLP list scoped to division", eeActive < active.body.meta.total, `${eeActive}`);
check("AE can read the DLP tracker for their area", (await call(ae, "/dlp/summary")).status === 200);

// ---- contractor performance ----
const perf = (await call(hq, "/contractors/performance")).body.data;
const aaravRow = perf.find((row) => row.code === "CON-001");
check("HQ sees active firms with metrics", perf.length >= 2 && aaravRow && aaravRow.completed_works > 0, perf.map((row) => `${row.name}: ${row.completed_works} done, score ${row.avg_score ?? "—"}`).join(" | "));
check("Metrics are well-formed (on-time %, first-pass %, delay)", [aaravRow.on_time_pct, aaravRow.first_pass_pct].every((value) => value === null || (value >= 0 && value <= 100)) && (aaravRow.avg_delay_days === null || aaravRow.avg_delay_days >= 0));
const dbAaravDefects = await one(`select count(*)::int n from maintenance_requests where dlp_liable and contractor_id = $1`, [aaravRow.id]);
check("DLP defect count per firm = DB", aaravRow.dlp_defects === dbAaravDefects.n, `${aaravRow.dlp_defects}`);

const detail = (await call(hq, `/contractors/${aaravRow.id}/performance`)).body.data;
check("Firm detail: works, evaluations and liable defects", detail.works.length > 0 && detail.evaluations.length > 0 && Array.isArray(detail.dlp_defects), `${detail.works.length} works, ${detail.evaluations.length} evaluation(s), ${detail.dlp_defects.length} defects`);

const own = await call(aarav, "/contractors/performance");
check("Contractor sees only their own firm", own.body.data.length === 1 && own.body.data[0].id === aaravRow.id);
check("Contractor opens own detail -> 200", (await call(aarav, `/contractors/${aaravRow.id}/performance`)).status === 200);
check("Other contractor cannot open it -> 403", (await call(kaveri, `/contractors/${aaravRow.id}/performance`)).status === 403);
check("AE cannot open contractor performance -> 403", (await call(ae, "/contractors/performance")).status === 403);

const liableForAarav = (await call(aarav, "/maintenance-requests?dlp_liable=true&limit=50")).body.data;
check("DLP-liable requests reach the liable contractor's view", liableForAarav.length > 0 && liableForAarav.every((row) => row.dlp_liable), `${liableForAarav.length} visible to Aarav`);

const eePerf = (await call(ee, "/contractors/performance")).body.data.find((row) => row.id === aaravRow.id);
check("EE metrics limited to their division's works", eePerf.completed_works <= aaravRow.completed_works);

await db.end();
summary("M9");
