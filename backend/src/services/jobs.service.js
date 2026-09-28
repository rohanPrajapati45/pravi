import { query } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { recomputeAllRisk } from "./dashboard.service.js";
import { notify, officersCovering } from "./notifications.service.js";

export const DAILY_JOB = "daily";
const istToday = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

// 1. Risk scores age with time (overdue inspections, design life), so they are recomputed every day.
async function riskStep(user) {
  return recomputeAllRisk(user ?? null, null);
}

// 2. Overdue inspections: one daily digest per AE (their sub-division) and per EE (their division).
async function overdueInspectionsStep() {
  const today = istToday();
  const { rows } = await query(
    `select s.id as sub_id, s.name as sub_name, s.parent_id as division_id, d.name as division_name,
            count(*)::int as overdue, count(*) filter (where a.next_inspection_due < current_date - 30)::int as long_overdue
       from assets a join org_units s on s.id = a.org_unit_id join org_units d on d.id = s.parent_id
      where a.next_inspection_due < current_date and a.lifecycle_status in ('OPERATIONAL', 'UNDER_MAINTENANCE', 'UNDER_REHABILITATION', 'CLOSED_TEMPORARILY')
      group by s.id, s.name, s.parent_id, d.name`
  );
  let notified = 0;
  const divisions = new Map();
  for (const row of rows) {
    notified += await notify(null, {
      userIds: await officersCovering(null, row.sub_id, ["AE"]),
      kind: "INSPECTION_OVERDUE",
      severity: row.long_overdue ? "WARNING" : "INFO",
      title: `${row.overdue} asset${row.overdue === 1 ? "" : "s"} overdue for inspection`,
      body: `${row.sub_name}${row.long_overdue ? ` · ${row.long_overdue} overdue by more than 30 days` : ""}`,
      link: "/assets?overdue=true",
      dedupeKey: `inspection-overdue:${today}`
    });
    const division = divisions.get(row.division_id) ?? { name: row.division_name, overdue: 0, long: 0 };
    division.overdue += row.overdue;
    division.long += row.long_overdue;
    divisions.set(row.division_id, division);
  }
  for (const [divisionId, division] of divisions) {
    notified += await notify(null, {
      userIds: await officersCovering(null, divisionId, ["EE"]),
      kind: "INSPECTION_OVERDUE",
      severity: division.long ? "WARNING" : "INFO",
      title: `${division.overdue} asset${division.overdue === 1 ? "" : "s"} overdue for inspection in your division`,
      body: `${division.name}${division.long ? ` · ${division.long} overdue by more than 30 days` : ""}`,
      link: "/assets?overdue=true",
      dedupeKey: `inspection-overdue:${today}`
    });
  }
  return { subdivisions: rows.length, assets: rows.reduce((sum, row) => sum + row.overdue, 0), notified };
}

// 3. Maintenance SLA breaches: the assignee and the division EE hear once per request.
async function slaStep() {
  const { rows } = await query(
    `select m.id, m.request_code, m.title, m.severity, m.due_date, m.assigned_to, a.org_unit_id, a.asset_code
       from maintenance_requests m join assets a on a.id = m.asset_id
      where m.due_date < current_date and m.status in ('OPEN', 'ASSIGNED', 'IN_PROGRESS')`
  );
  let notified = 0;
  for (const row of rows) {
    const ee = await officersCovering(null, row.org_unit_id, ["EE"]);
    notified += await notify(null, {
      userIds: [row.assigned_to, ...ee],
      kind: "SLA_BREACH",
      severity: row.severity === "HIGH" ? "CRITICAL" : "WARNING",
      title: `${row.request_code} is past its due date`,
      body: `${row.title} · ${row.asset_code} · was due ${row.due_date}`,
      link: `/maintenance/${row.id}`,
      dedupeKey: `sla:${row.id}:${row.due_date}`
    });
  }
  return { breached: rows.length, notified };
}

// 4. DLP ending within 30 days: time to schedule the end-of-DLP joint inspection while the contractor is still liable.
async function dlpStep() {
  const { rows } = await query(
    `select a.id, a.asset_code, a.name, a.dlp_end_date, a.org_unit_id, c.name as contractor_name, (a.dlp_end_date - current_date)::int as days_left
       from assets a left join works w on w.id = a.origin_work_id left join contractors c on c.id = w.contractor_id
      where a.dlp_end_date between current_date and current_date + 30`
  );
  let notified = 0;
  for (const row of rows) {
    notified += await notify(null, {
      userIds: await officersCovering(null, row.org_unit_id, ["AE", "EE"]),
      kind: "DLP_EXPIRING",
      severity: row.days_left <= 7 ? "WARNING" : "INFO",
      title: `DLP ends in ${row.days_left} day${row.days_left === 1 ? "" : "s"} — ${row.asset_code}`,
      body: `${row.name}: record the end-of-DLP joint inspection${row.contractor_name ? ` with ${row.contractor_name}` : ""} before liability lapses`,
      link: "/dlp",
      dedupeKey: `dlp:${row.id}:${row.dlp_end_date}`
    });
  }
  return { expiring: rows.length, notified };
}

// 5. Work tasks past their due date in an open stage.
async function tasksStep() {
  const { rows } = await query(
    `select t.id, t.title, t.due_date, t.assigned_to, w.id as work_id, w.work_code
       from work_tasks t join work_stages s on s.id = t.work_stage_id join works w on w.id = t.work_id
      where t.due_date < current_date and t.status in ('PENDING', 'RETURNED') and t.assigned_to is not null and s.status = 'ACTIVE'`
  );
  let notified = 0;
  for (const row of rows) {
    notified += await notify(null, {
      userIds: [row.assigned_to],
      kind: "TASK_OVERDUE",
      severity: "WARNING",
      title: `Task overdue on ${row.work_code}`,
      body: `“${row.title}” was due ${row.due_date}`,
      link: `/works/${row.work_id}`,
      dedupeKey: `task:${row.id}:${row.due_date}`
    });
  }
  return { overdue: rows.length, notified };
}

const STEPS = [
  ["risk", riskStep],
  ["inspections_overdue", overdueInspectionsStep],
  ["sla_breaches", slaStep],
  ["dlp_expiring", dlpStep],
  ["tasks_overdue", tasksStep]
];

export async function runDailyJobs({ trigger, user = null }) {
  // A run left RUNNING by an instance that stopped mid-way would block every later run.
  await query("update job_runs set status = 'FAILED', finished_at = now(), error = 'Abandoned — the server stopped mid-run' where status = 'RUNNING' and started_at < now() - interval '1 hour'");
  let run;
  try {
    ({ rows: [run] } = await query("insert into job_runs (job, trigger, triggered_by) values ($1, $2, $3) returning *", [DAILY_JOB, trigger, user?.id ?? null]));
  } catch (error) {
    if (error.code === "23505") throw AppError.invalidTransition("The daily jobs are already running — try again in a minute");
    throw error;
  }
  const started = Date.now();
  const summary = {};
  try {
    for (const [key, step] of STEPS) summary[key] = await step(user);
    summary.ms = Date.now() - started;
    const { rows } = await query("update job_runs set status = 'SUCCEEDED', finished_at = now(), summary = $2 where id = $1 returning *", [run.id, summary]);
    return rows[0];
  } catch (error) {
    await query("update job_runs set status = 'FAILED', finished_at = now(), summary = $2, error = $3 where id = $1", [run.id, summary, error.message]);
    throw error;
  }
}

export async function listJobRuns() {
  const { rows } = await query(
    `select r.*, u.name as triggered_by_name from job_runs r left join users u on u.id = r.triggered_by
      order by r.started_at desc limit 20`
  );
  const ranToday = rows.some((row) => row.job === DAILY_JOB && row.status === "SUCCEEDED" && row.run_date === istToday());
  return {
    runs: rows,
    schedule: {
      enabled: process.env.DISABLE_SCHEDULER !== "true",
      description: "Runs once per day (IST) — shortly after the API starts, then checked every 30 minutes",
      ran_today: ranToday
    }
  };
}

// In-process scheduler: good enough for one API instance (Render free tier sleeps, so it catches up on wake-up).
// At state scale this moves to a dedicated worker or a platform cron calling POST /admin/jobs/daily/run.
export function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === "true") return;
  const tick = async () => {
    try {
      const { rows } = await query(
        "select 1 from job_runs where job = $1 and run_date = $2 and status in ('SUCCEEDED', 'RUNNING') limit 1",
        [DAILY_JOB, istToday()]
      );
      if (!rows.length) {
        const run = await runDailyJobs({ trigger: "SCHEDULE" });
        console.log(`[scheduler] daily jobs finished in ${run.summary.ms} ms`);
      }
    } catch (error) {
      if (!/already running/.test(error.message)) console.error("[scheduler]", error.message);
    }
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 30 * 60_000).unref();
}
