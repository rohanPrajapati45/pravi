-- Typed documents attached to assets, works, inspections or maintenance requests.
-- Files live in object storage; the database keeps metadata only. Deletion is soft (history is kept).
create table documents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id),
  work_id uuid references works(id),
  inspection_id uuid references inspections(id),
  maintenance_id uuid references maintenance_requests(id),
  doc_type text not null check (doc_type in
    ('DPR', 'DRAWING', 'AS_BUILT', 'CONTRACT', 'COMPLETION_CERTIFICATE', 'INSPECTION_REPORT', 'TEST_REPORT', 'INVOICE', 'WARRANTY', 'PHOTO', 'OTHER')),
  title text not null,
  description text,
  file_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references users(id),
  constraint document_has_owner check (num_nonnulls(asset_id, work_id, inspection_id, maintenance_id) >= 1)
);

create index documents_asset_idx on documents (asset_id) where deleted_at is null;
create index documents_work_idx on documents (work_id) where deleted_at is null;
create index documents_type_idx on documents (doc_type);

alter table documents enable row level security;
