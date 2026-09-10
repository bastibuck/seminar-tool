-- Purges rate-limit counter rows whose retention period (the 60-second sliding
-- window in check_rate_limit) has long since expired. The per-check prune in
-- check_rate_limit only removes rows for the ip+endpoint currently being
-- checked, so a probe that stops hammering would otherwise leave its IP rows
-- behind indefinitely. This bounds table growth and keeps IP addresses for at
-- most the duration the rate-limit purpose requires.
create or replace function purge_rate_limits()
returns integer
language sql
security invoker
set search_path = public
as $$
  with deleted as (
    delete from rate_limits
    where created_at < now() - interval '1 hour'
    returning ip
  )
  select count(*)::integer from deleted;
$$;

-- revoking from public alone is not enough: Supabase's default grants leave an
-- explicit EXECUTE for the anon/authenticated roles (see #20), so API roles can
-- still reach the function via PostgREST RPC. Revoke from them explicitly.
revoke execute on function purge_rate_limits() from public, anon, authenticated;

-- check_rate_limit() in 20260910000000 has the same API-role exposure:
-- anon/authenticated could call it directly via PostgREST, bypassing the
-- route-level request metadata. Revoke the API roles here as well.
revoke execute on function check_rate_limit(text, text, integer, interval) from public, anon, authenticated;

select cron.schedule(
  'purge-rate-limits',
  '*/10 * * * *',
  $$select purge_rate_limits();$$
)
where not exists (
  select 1 from cron.job where jobname = 'purge-rate-limits'
);