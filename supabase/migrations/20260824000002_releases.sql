create table releases (
  id bigint generated always as identity primary key,
  case_id uuid not null references cases (id) on delete cascade,
  finding_id uuid not null references findings (id) on delete cascade,
  released_at timestamptz not null default now(),
  unique (case_id, finding_id)
);

create index releases_case_released_at_idx on releases (case_id, released_at);
