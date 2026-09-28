create table programmes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  financial_year text not null,
  budget_head text,
  allocated_amount numeric(16, 2) not null default 0,
  owner_org_unit_id uuid not null references org_units(id),
  created_by uuid references users(id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger programmes_updated_at before update on programmes for each row execute function set_updated_at();

-- Illustrative, configurable delegation of financial powers (not the department's actual limits).
create table approval_limits (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  work_type text,
  max_amount numeric(16, 2),
  label text,
  unique nulls not distinct (role, work_type)
);

-- Templates: a work = ordered stages; each stage has tasks and a gate.
create table work_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  work_type text not null check (work_type in ('NEW', 'REPAIR', 'MAINTENANCE', 'REHAB', 'EMERGENCY')),
  asset_type_code text,
  description text,
  is_active boolean not null default true
);

create table stage_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references work_templates(id),
  seq int not null,
  code text not null,
  name text not null,
  description text,
  kind text not null default 'GENERIC' check (kind in ('GENERIC', 'DESIGN', 'APPROVAL', 'AWARD', 'CONSTRUCTION', 'HANDOVER', 'CLOSURE')),
  planned_days int not null default 30,
  gate_role text not null check (gate_role in ('HQ', 'EE', 'COST_LIMIT')),
  gate_checklist jsonb not null default '[]'::jsonb,
  work_status_on_enter text,
  work_status_on_pass text,
  unique (template_id, seq)
);

create table task_templates (
  id uuid primary key default gen_random_uuid(),
  stage_template_id uuid not null references stage_templates(id),
  seq int not null,
  title text not null,
  description text,
  default_assignee_role text not null check (default_assignee_role in ('HQ', 'EE', 'AE', 'CONTRACTOR')),
  required_deliverables jsonb not null default '[]'::jsonb,
  is_mandatory boolean not null default true,
  planned_days int not null default 7,
  is_milestone boolean not null default false,
  weight numeric(6, 2) not null default 0,
  unique (stage_template_id, seq)
);

create sequence work_code_seq start 1;

alter table works
  add column programme_id uuid references programmes(id),
  add column template_id uuid references work_templates(id),
  add column current_stage_id uuid,
  add column initiation_type text check (initiation_type in ('PROGRAMME', 'DIRECTIVE', 'FIELD_NEED', 'COMPLAINT', 'EMERGENCY', 'DEPOSIT_REQUEST')),
  add column initiated_by uuid references users(id),
  add column initiation_ref text,
  add column initiation_date date,
  add column priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  add column source_type text,
  add column source_ref text,
  add column objective text,
  add column target_start date,
  add column target_end date,
  add column tender_ref text,
  add column planned_asset jsonb,
  add column closed_at timestamptz;

alter table works drop constraint if exists works_status_check;
alter table works add constraint works_status_check check (status in
  ('DRAFT', 'PROPOSED', 'TECHNICALLY_SANCTIONED', 'ADMIN_APPROVED', 'TENDERED', 'AWARDED', 'IN_PROGRESS', 'COMPLETED', 'HANDED_OVER', 'CLOSED', 'REJECTED', 'ON_HOLD', 'CANCELLED'));

create table work_stages (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id),
  stage_template_id uuid references stage_templates(id),
  seq int not null,
  code text not null,
  name text not null,
  kind text not null,
  status text not null default 'LOCKED' check (status in ('LOCKED', 'ACTIVE', 'PASSED', 'REJECTED', 'SKIPPED')),
  gate_role text not null,
  gate_checklist jsonb not null default '[]'::jsonb,
  planned_days int not null,
  work_status_on_enter text,
  work_status_on_pass text,
  return_count int not null default 0,
  started_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  unique (work_id, seq)
);

create index work_stages_work_idx on work_stages (work_id, seq);
create index work_stages_status_idx on work_stages (status, due_at);

alter table works add constraint works_current_stage_fk foreign key (current_stage_id) references work_stages(id);
create index works_current_stage_idx on works (current_stage_id);
create index works_programme_idx on works (programme_id);

create table work_tasks (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id),
  work_stage_id uuid not null references work_stages(id),
  task_template_id uuid references task_templates(id),
  seq int not null,
  title text not null,
  description text,
  default_assignee_role text not null,
  assigned_to uuid references users(id),
  assigned_by uuid references users(id),
  assigned_at timestamptz,
  due_date date,
  status text not null default 'PENDING' check (status in ('PENDING', 'SUBMITTED', 'ACCEPTED', 'RETURNED', 'SKIPPED')),
  required_deliverables jsonb not null default '[]'::jsonb,
  deliverables jsonb not null default '[]'::jsonb,
  submission_note text,
  progress_pct numeric(5, 2),
  photo_paths text[] not null default '{}',
  submitted_by uuid references users(id),
  submitted_at timestamptz,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_remarks text,
  return_count int not null default 0,
  is_mandatory boolean not null default true,
  is_milestone boolean not null default false,
  weight numeric(6, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_tasks_assignee_idx on work_tasks (assigned_to, status, due_date);
create index work_tasks_stage_idx on work_tasks (work_id, work_stage_id);
create trigger work_tasks_updated_at before update on work_tasks for each row execute function set_updated_at();

create table stage_evaluations (
  id uuid primary key default gen_random_uuid(),
  work_stage_id uuid not null references work_stages(id),
  work_id uuid not null references works(id),
  evaluator_id uuid references users(id),
  evaluator_role text,
  outcome text not null check (outcome in ('PASSED', 'PASSED_WITH_OBSERVATIONS', 'RETURNED', 'REJECTED')),
  checklist jsonb not null default '[]'::jsonb,
  data jsonb,
  remarks text,
  evaluated_at timestamptz not null default now()
);

create index stage_evaluations_stage_idx on stage_evaluations (work_stage_id);

create table work_approvals (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id),
  work_stage_id uuid references work_stages(id),
  stage text not null check (stage in ('TECHNICAL_SANCTION', 'ADMIN_APPROVAL')),
  approver_id uuid references users(id),
  approver_role text,
  decision text not null check (decision in ('APPROVED', 'REJECTED')),
  amount numeric(16, 2),
  reference text,
  remarks text,
  decided_at timestamptz not null default now()
);

create index work_approvals_work_idx on work_approvals (work_id);

create table contractor_evaluations (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null unique references works(id),
  contractor_id uuid not null references contractors(id),
  evaluator_id uuid references users(id),
  schedule_score numeric(5, 1) not null,
  quality_score numeric(5, 1) not null,
  rework_score numeric(5, 1) not null,
  dlp_score numeric(5, 1) not null,
  documentation_score numeric(5, 1) not null,
  total_score numeric(5, 1) not null,
  inputs jsonb not null,
  remarks text,
  evaluated_at timestamptz not null default now()
);

create index contractor_evaluations_contractor_idx on contractor_evaluations (contractor_id);

alter table programmes enable row level security;
alter table approval_limits enable row level security;
alter table work_templates enable row level security;
alter table stage_templates enable row level security;
alter table task_templates enable row level security;
alter table work_stages enable row level security;
alter table work_tasks enable row level security;
alter table stage_evaluations enable row level security;
alter table work_approvals enable row level security;
alter table contractor_evaluations enable row level security;
