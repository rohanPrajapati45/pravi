-- Jurisdiction hierarchy: STATE > CIRCLE > DIVISION > SUBDIVISION.
-- `path` is materialised from codes so "everything under X" is a single prefix match.
create table org_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('STATE', 'CIRCLE', 'DIVISION', 'SUBDIVISION')),
  name text not null,
  parent_id uuid references org_units(id),
  path text not null,
  district text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index org_units_parent_idx on org_units (parent_id);
create index org_units_path_idx on org_units (path text_pattern_ops);
create index org_units_type_idx on org_units (type);

create or replace function org_units_set_path() returns trigger as $$
declare
  parent_path text;
begin
  if new.parent_id is null then
    new.path := '/' || new.code || '/';
  else
    select path into parent_path from org_units where id = new.parent_id;
    new.path := parent_path || new.code || '/';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger org_units_path before insert or update of parent_id, code on org_units
  for each row execute function org_units_set_path();
create trigger org_units_updated_at before update on org_units
  for each row execute function set_updated_at();

create table contractors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  class text,
  contact_name text,
  contact_phone text,
  contact_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger contractors_updated_at before update on contractors
  for each row execute function set_updated_at();

-- Demo build uses 4 merged roles (see PRD 5.2 note).
create table users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique,
  name text not null,
  email text not null unique,
  phone text,
  role text not null check (role in ('HQ', 'EE', 'AE', 'CONTRACTOR')),
  designation text,
  org_unit_id uuid not null references org_units(id),
  contractor_id uuid references contractors(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_role_link check ((role = 'CONTRACTOR') = (contractor_id is not null))
);

create index users_org_unit_idx on users (org_unit_id);
create index users_role_idx on users (role);
create index users_contractor_idx on users (contractor_id);

create trigger users_updated_at before update on users
  for each row execute function set_updated_at();

-- Append-only audit trail.
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  diff jsonb,
  ip text,
  at timestamptz not null default now()
);

create index audit_logs_entity_idx on audit_logs (entity, entity_id);
create index audit_logs_at_idx on audit_logs (at desc);
create index audit_logs_user_idx on audit_logs (user_id);

create or replace function forbid_mutation() returns trigger as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$ language plpgsql;

create trigger audit_logs_append_only before update or delete on audit_logs
  for each row execute function forbid_mutation();

-- Supabase exposes public tables through its Data API; RLS with no policies
-- blocks that path so the Express API (DB owner connection) is the only way in.
alter table schema_migrations enable row level security;
alter table org_units enable row level security;
alter table contractors enable row level security;
alter table users enable row level security;
alter table audit_logs enable row level security;
