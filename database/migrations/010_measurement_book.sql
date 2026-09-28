-- M11: bill of quantities, measurement book and running (RA) bills per work.
create table boq_items (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id),
  item_no text not null,
  description text not null,
  unit text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  rate numeric(14, 2) not null check (rate >= 0),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, item_no)
);
create trigger boq_items_updated_at before update on boq_items for each row execute function set_updated_at();

create table running_bills (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id),
  bill_no int not null,
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'APPROVED', 'RETURNED', 'PAID')),
  amount numeric(16, 2) not null check (amount > 0),
  cumulative_amount numeric(16, 2) not null,
  entries int not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  decided_by uuid references users(id),
  decided_at timestamptz,
  remarks text,
  payment_ref text,
  paid_at timestamptz,
  unique (work_id, bill_no)
);

create table measurements (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id),
  boq_item_id uuid not null references boq_items(id),
  entry_no int not null,
  measured_on date not null,
  location text,
  nos numeric(12, 3) not null default 1 check (nos > 0),
  length numeric(12, 3) check (length > 0),
  breadth numeric(12, 3) check (breadth > 0),
  depth numeric(12, 3) check (depth > 0),
  quantity numeric(14, 3) not null check (quantity > 0),
  amount numeric(16, 2) not null,
  remarks text,
  excess boolean not null default false,
  recorded_by uuid not null references users(id),
  recorded_at timestamptz not null default now(),
  status text not null default 'RECORDED' check (status in ('RECORDED', 'CHECKED', 'REJECTED')),
  checked_by uuid references users(id),
  checked_at timestamptz,
  check_remarks text,
  bill_id uuid references running_bills(id),
  unique (work_id, entry_no)
);
create index measurements_work_idx on measurements (work_id, status);
create index measurements_item_idx on measurements (boq_item_id);

alter table boq_items enable row level security;
alter table running_bills enable row level security;
alter table measurements enable row level security;
