create extension if not exists pg_trgm;

-- Asset types are configuration: adding a new kind of asset is a row, not code.
create table asset_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null check (category in ('ROAD', 'BRIDGE', 'CULVERT', 'BUILDING', 'ELECTRICAL', 'ROAD_FURNITURE', 'EQUIPMENT', 'OTHER')),
  code_prefix text not null,
  attribute_schema jsonb not null default '[]'::jsonb,
  inspection_interval_days int not null default 365 check (inspection_interval_days > 0),
  design_life_years int not null default 30 check (design_life_years > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger asset_types_updated_at before update on asset_types
  for each row execute function set_updated_at();

-- Minimal works table so assets can reference their origin work; M5 extends it.
create table works (
  id uuid primary key default gen_random_uuid(),
  work_code text not null unique,
  title text not null,
  description text,
  work_type text not null check (work_type in ('NEW', 'REPAIR', 'MAINTENANCE', 'REHAB', 'EMERGENCY')),
  status text not null default 'DRAFT',
  org_unit_id uuid not null references org_units(id),
  contractor_id uuid references contractors(id),
  estimated_cost numeric(14, 2),
  sanctioned_amount numeric(14, 2),
  contract_value numeric(14, 2),
  start_date date,
  planned_end date,
  actual_end date,
  dlp_months int,
  progress_pct numeric(5, 2) not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index works_status_org_idx on works (status, org_unit_id);
create index works_contractor_idx on works (contractor_id);

create trigger works_updated_at before update on works
  for each row execute function set_updated_at();

create sequence asset_code_seq start 1001;

create table assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  qr_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  type_id uuid not null references asset_types(id),
  name text not null,
  parent_id uuid references assets(id),
  org_unit_id uuid not null references org_units(id),
  district text,
  taluka text,
  road_code text,
  start_chainage_km numeric(9, 3),
  end_chainage_km numeric(9, 3),
  lat numeric(9, 6),
  lng numeric(9, 6),
  geometry jsonb,
  attributes jsonb not null default '{}'::jsonb,
  lifecycle_status text not null default 'OPERATIONAL' check (lifecycle_status in
    ('PLANNED', 'UNDER_CONSTRUCTION', 'OPERATIONAL', 'UNDER_MAINTENANCE', 'UNDER_REHABILITATION', 'CLOSED_TEMPORARILY', 'RETIRED')),
  condition_rating smallint check (condition_rating between 1 and 5),
  criticality smallint not null default 3 check (criticality between 1 and 5),
  traffic_level smallint not null default 3 check (traffic_level between 1 and 5),
  commissioned_on date,
  original_cost numeric(14, 2),
  design_life_years int,
  custodian_id uuid references users(id),
  origin_work_id uuid references works(id),
  dlp_end_date date,
  last_inspected_at timestamptz,
  next_inspection_due date,
  risk_score numeric(5, 1) not null default 0,
  risk_band text not null default 'LOW' check (risk_band in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  risk_factors jsonb not null default '[]'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chainage_order check (end_chainage_km is null or start_chainage_km is null or end_chainage_km >= start_chainage_km)
);

create index assets_type_idx on assets (type_id);
create index assets_org_unit_idx on assets (org_unit_id);
create index assets_district_idx on assets (district);
create index assets_status_idx on assets (lifecycle_status);
create index assets_condition_idx on assets (condition_rating);
create index assets_risk_idx on assets (risk_band, risk_score desc);
create index assets_risk_score_idx on assets (risk_score desc);
create index assets_next_due_idx on assets (next_inspection_due);
create index assets_dlp_idx on assets (dlp_end_date);
create index assets_parent_idx on assets (parent_id);
create index assets_road_idx on assets (road_code, start_chainage_km);
create index assets_origin_work_idx on assets (origin_work_id);
create index assets_name_trgm_idx on assets using gin (name gin_trgm_ops);
create index assets_code_trgm_idx on assets using gin (asset_code gin_trgm_ops);

create trigger assets_updated_at before update on assets
  for each row execute function set_updated_at();

create table work_assets (
  work_id uuid not null references works(id),
  asset_id uuid not null references assets(id),
  role text not null check (role in ('CREATED', 'TARGET')),
  created_at timestamptz not null default now(),
  primary key (work_id, asset_id, role)
);

create index work_assets_asset_idx on work_assets (asset_id);

-- The asset timeline. Append-only, like audit_logs.
create table lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  event_type text not null,
  from_status text,
  to_status text,
  actor_id uuid references users(id),
  actor_role text,
  at timestamptz not null default now(),
  lat numeric(9, 6),
  lng numeric(9, 6),
  ref_type text,
  ref_id text,
  before jsonb,
  after jsonb,
  remarks text
);

create index lifecycle_events_asset_idx on lifecycle_events (asset_id, at desc);

create trigger lifecycle_events_append_only before update or delete on lifecycle_events
  for each row execute function forbid_mutation();

alter table asset_types enable row level security;
alter table works enable row level security;
alter table assets enable row level security;
alter table work_assets enable row level security;
alter table lifecycle_events enable row level security;
