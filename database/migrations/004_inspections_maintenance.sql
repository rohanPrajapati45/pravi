create sequence inspection_code_seq start 1;
create sequence request_code_seq start 1;

create table inspections (
  id uuid primary key default gen_random_uuid(),
  inspection_code text not null unique,
  asset_id uuid not null references assets(id),
  type text not null check (type in ('ROUTINE', 'PRE_MONSOON', 'POST_MONSOON', 'SPECIAL', 'POST_EMERGENCY')),
  inspector_id uuid references users(id),
  inspector_name text,
  inspected_at timestamptz not null default now(),
  condition_rating smallint not null check (condition_rating between 1 and 5),
  previous_condition smallint,
  severity text not null default 'LOW' check (severity in ('LOW', 'MEDIUM', 'HIGH')),
  defects jsonb not null default '[]'::jsonb,
  remarks text,
  recommendation text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  gps_accuracy_m numeric(8, 1),
  distance_from_asset_m numeric(10, 1),
  photo_paths text[] not null default '{}',
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'REVIEWED')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_remarks text,
  created_at timestamptz not null default now()
);

create index inspections_asset_idx on inspections (asset_id, inspected_at desc);
create index inspections_inspector_idx on inspections (inspector_id, inspected_at desc);
create index inspections_at_idx on inspections (inspected_at desc);

-- Created here because inspections raise requests automatically; M4 adds the workflow.
create table maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  asset_id uuid not null references assets(id),
  source text not null check (source in ('INSPECTION', 'COMPLAINT', 'MANUAL', 'PERIODIC')),
  source_id uuid,
  title text not null,
  description text,
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH')),
  status text not null default 'OPEN' check (status in ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED')),
  priority_score numeric(5, 1),
  assigned_to uuid references users(id),
  assigned_by uuid references users(id),
  assigned_at timestamptz,
  contractor_id uuid references contractors(id),
  due_date date,
  dlp_liable boolean not null default false,
  work_id uuid references works(id),
  estimated_cost numeric(14, 2),
  actual_cost numeric(14, 2),
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references users(id),
  completion_remarks text,
  after_photo_paths text[] not null default '{}',
  verified_by uuid references users(id),
  verified_at timestamptz,
  verified_condition smallint check (verified_condition between 1 and 5),
  verification_remarks text,
  rejection_count int not null default 0,
  closed_at timestamptz,
  cancel_reason text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_status_assignee_idx on maintenance_requests (status, assigned_to);
create index maintenance_asset_idx on maintenance_requests (asset_id);
create index maintenance_due_idx on maintenance_requests (due_date);
create index maintenance_contractor_idx on maintenance_requests (contractor_id, status);

create trigger maintenance_requests_updated_at before update on maintenance_requests
  for each row execute function set_updated_at();

alter table inspections enable row level security;
alter table maintenance_requests enable row level security;
