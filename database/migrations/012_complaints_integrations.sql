-- M13: citizen complaints (public intake, routing to an asset/office) and integration adapter logs.
create sequence complaint_code_seq;

create table complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_code text not null unique,
  channel text not null default 'WEB' check (channel in ('WEB', 'CPGRAMS', 'SWAGAT', 'HELPLINE')),
  external_ref text,
  category text not null check (category in ('POTHOLE', 'ROAD_DAMAGE', 'BRIDGE_DAMAGE', 'DRAINAGE', 'WATERLOGGING', 'STREETLIGHT', 'SIGNAGE', 'BUILDING', 'OTHER')),
  description text not null,
  location_text text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  citizen_name text,
  citizen_phone text,
  photo_paths text[] not null default '{}',
  asset_id uuid references assets(id),
  match_method text check (match_method in ('CODE', 'NEAREST', 'MANUAL')),
  match_distance_m numeric(10, 1),
  org_unit_id uuid references org_units(id),
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'DUPLICATE')),
  duplicate_of uuid references complaints(id),
  maintenance_request_id uuid references maintenance_requests(id),
  acknowledged_by uuid references users(id),
  acknowledged_at timestamptz,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger complaints_updated_at before update on complaints for each row execute function set_updated_at();
create index complaints_status_idx on complaints (status, created_at desc);
create index complaints_asset_idx on complaints (asset_id);
create index complaints_org_idx on complaints (org_unit_id);
create index complaints_request_idx on complaints (maintenance_request_id);
-- An external grievance is imported once, however often the portal retries.
create unique index complaints_external_idx on complaints (channel, external_ref) where external_ref is not null;

create table integration_logs (
  id uuid primary key default gen_random_uuid(),
  adapter text not null,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND')),
  status text not null check (status in ('OK', 'REJECTED', 'ERROR')),
  reference text,
  message text,
  created_at timestamptz not null default now()
);
create index integration_logs_idx on integration_logs (adapter, created_at desc);

alter table complaints enable row level security;
alter table integration_logs enable row level security;
