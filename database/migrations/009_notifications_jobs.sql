-- M10: in-app alerts raised by the daily jobs, emergencies and complaints, plus a history of job runs.
-- Person-to-person hand-offs stay in audit_logs (activity feed); this table holds system alerts with read state.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('INSPECTION_OVERDUE', 'SLA_BREACH', 'DLP_EXPIRING', 'TASK_OVERDUE', 'EMERGENCY', 'COMPLAINT', 'MEASUREMENT', 'BILL', 'SYSTEM')),
  severity text not null default 'INFO' check (severity in ('INFO', 'WARNING', 'CRITICAL')),
  title text not null,
  body text,
  link text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
-- The same alert is never sent twice to the same person.
create unique index notifications_dedupe_idx on notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;
alter table notifications enable row level security;

create table job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  trigger text not null check (trigger in ('SCHEDULE', 'MANUAL')),
  triggered_by uuid references users(id),
  run_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  summary jsonb,
  error text
);
-- At most one run of a job at a time, even across several API instances.
create unique index job_runs_one_running_idx on job_runs (job) where status = 'RUNNING';
create index job_runs_job_idx on job_runs (job, started_at desc);
alter table job_runs enable row level security;
