-- Revoke all table privileges from API roles so the anon key is inert.
revoke all on app_health, case_types, findings, cases, releases
  from anon, authenticated, public;

-- Prevent future tables created by the migration owner from being auto-exposed
-- to API roles via default privileges.
alter default privileges in schema public
  revoke select on tables from anon, authenticated;

-- Enable row-level security on all application tables (deny-by-default for
-- API roles).  The Next.js server connects as the owner role via DATABASE_URL
-- and bypasses RLS.
alter table app_health enable row level security;
alter table case_types enable row level security;
alter table findings enable row level security;
alter table cases enable row level security;
alter table releases enable row level security;

-- Remove cases and releases from the realtime publication.  The viewer now
-- receives invalidation pings via Broadcast only (#43).
alter publication supabase_realtime drop table cases;
alter publication supabase_realtime drop table releases;

-- Revoke execute on the cron-scheduled cleanup function from API roles.
-- The pg_cron job runs as the owner role (bypasses EXECUTE checks) and the
-- tests call it via DATABASE_URL (also owner), so neither path is affected.
revoke execute on function delete_expired_cases() from anon, authenticated;

-- Replica identity is no longer needed for the realtime publication.
alter table releases replica identity default;
alter table cases replica identity default;
