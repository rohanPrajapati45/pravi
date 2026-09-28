# M10 — Notifications & daily jobs

## What was built
- **Alerts** (`notifications`, migration 009): a system alert with a severity (info / warning / critical), a deep link and server-side read state. Person-to-person hand-offs remain in the activity feed (audit log). The **bell** shows both: unread alerts plus new hand-offs, a dropdown with the latest alerts, **Mark all read**, and a link to the hand-off feed.
- **Daily job**, run once per IST day by an in-process scheduler (it checks every 30 minutes, so the Render free tier catches up on wake-up). HQ can also start it with **Administration → Jobs & integrations → Run now**. Its steps:
  1. **Risk recompute** for every live asset. Scores age as inspections fall overdue and design life runs out.
  2. **Overdue inspections**: a daily digest per AE (sub-division) and per EE (division).
  3. **SLA breaches**: sent once per request to the assignee and the division EE. Critical when the severity is High.
  4. **DLP ending within 30 days**: sent to the AE and EE, so the end-of-DLP joint inspection happens while the contractor is still liable.
  5. **Overdue work tasks**: sent to the assignee.
- **Safe to re-run**: every alert carries a dedupe key, so the same alert never reaches the same person twice. A unique index allows only one run at a time. A run left RUNNING for more than an hour is marked FAILED.
- **Job history** (`job_runs`) records the trigger, who started it, duration, a per-step summary and any error.
- Emergencies (M12), new complaints (M13) and bills (M11) also raise alerts through the same service.
- Endpoints:
  - `GET /notifications`, `GET /notifications/count`
  - `POST /notifications/:id/read`, `POST /notifications/read-all`
  - `GET /admin/jobs`, `POST /admin/jobs/daily/run`
- Setting `DISABLE_SCHEDULER=true` turns the scheduler off, for example when a platform cron calls the run endpoint instead.

## How to test
`node --experimental-websocket scripts/smoke-m10.mjs` (12 checks)

## DoD
The job runs daily and on demand ✔ · no duplicate alerts on re-run ✔ · read state is per user ✔ · HQ-only job control ✔.
