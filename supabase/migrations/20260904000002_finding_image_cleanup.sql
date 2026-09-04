create table finding_image_cleanup (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index finding_image_cleanup_pending_idx
  on finding_image_cleanup (next_attempt_at, locked_until, created_at);

revoke all on finding_image_cleanup from public, anon, authenticated;

create or replace function enqueue_obsolete_finding_image()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into finding_image_cleanup (path)
    values (old.image_path)
    on conflict (path) do nothing;
  elsif old.image_path is distinct from new.image_path then
    insert into finding_image_cleanup (path)
    values (old.image_path)
    on conflict (path) do nothing;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger findings_image_cleanup
after delete or update of image_path on findings
for each row execute function enqueue_obsolete_finding_image();
