create table app_health (
  id integer generated always as identity primary key,
  note text not null,
  checked_at timestamptz not null default now()
);
