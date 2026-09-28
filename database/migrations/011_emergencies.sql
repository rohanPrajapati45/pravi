-- M12: emergency mode — a declared event, the assets it damaged, and the fast-track response.
create sequence emergency_code_seq;

create table emergencies (
  id uuid primary key default gen_random_uuid(),
  emergency_code text not null unique,
  title text not null,
  kind text not null check (kind in ('FLOOD', 'HEAVY_RAIN', 'CYCLONE', 'EARTHQUAKE', 'STRUCTURAL_FAILURE', 'ACCIDENT', 'OTHER')),
  description text,
  org_unit_id uuid not null references org_units(id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED')),
  declared_by uuid not null references users(id),
  declared_at timestamptz not null default now(),
  closed_by uuid references users(id),
  closed_at timestamptz,
  closure_remarks text
);
create index emergencies_status_idx on emergencies (status);

create table emergency_assets (
  id uuid primary key default gen_random_uuid(),
  emergency_id uuid not null references emergencies(id),
  asset_id uuid not null references assets(id),
  damage text not null,
  severity text not null check (severity in ('MINOR', 'MAJOR', 'SEVERE')),
  traffic_status text not null check (traffic_status in ('OPEN', 'RESTRICTED', 'CLOSED')),
  status text not null default 'REPORTED' check (status in ('REPORTED', 'RESTORED')),
  maintenance_request_id uuid references maintenance_requests(id),
  work_id uuid references works(id),
  photo_paths text[] not null default '{}',
  reported_by uuid not null references users(id),
  reported_at timestamptz not null default now(),
  restored_by uuid references users(id),
  restored_at timestamptz,
  restore_remarks text,
  unique (emergency_id, asset_id)
);

alter table emergencies enable row level security;
alter table emergency_assets enable row level security;

-- Damage reports raise maintenance requests with their own source.
alter table maintenance_requests drop constraint if exists maintenance_requests_source_check;
alter table maintenance_requests add constraint maintenance_requests_source_check check (source in ('INSPECTION', 'COMPLAINT', 'MANUAL', 'PERIODIC', 'EMERGENCY'));
