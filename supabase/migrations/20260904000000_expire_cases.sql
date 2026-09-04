alter table cases
  add column last_activity_at timestamptz not null default now();

create extension if not exists pg_cron;

update cases
set last_activity_at = created_at
where last_activity_at > created_at;

create index cases_expiry_idx
  on cases (ended_at, last_activity_at);

create or replace function delete_expired_cases()
returns integer
language sql
security invoker
set search_path = public
as $$
  with deleted as (
    delete from cases
    where ended_at <= now() - interval '24 hours'
       or (
         ended_at is null
         and last_activity_at <= now() - interval '72 hours'
       )
    returning id
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function delete_expired_cases() from public;

select cron.schedule(
  'delete-expired-cases',
  '0 3 * * *',
  $$select delete_expired_cases();$$
)
where not exists (
  select 1 from cron.job where jobname = 'delete-expired-cases'
);
