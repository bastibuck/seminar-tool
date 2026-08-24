create table case_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table findings (
  id uuid primary key default gen_random_uuid(),
  case_type_id uuid not null references case_types (id) on delete cascade,
  name text not null,
  note text,
  position integer not null,
  unique (case_type_id, position)
);

create table cases (
  id uuid primary key default gen_random_uuid(),
  case_type_id uuid not null references case_types (id) on delete restrict,
  name text not null,
  cockpit_id uuid not null unique default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);
