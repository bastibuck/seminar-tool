alter table cases
  add column ended_at timestamptz;

grant select on cases to anon;

alter table cases replica identity full;

alter publication supabase_realtime add table cases;