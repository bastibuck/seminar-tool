grant select on releases to anon;

alter table releases replica identity full;

alter publication supabase_realtime add table releases;
