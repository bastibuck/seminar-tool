create table rate_limits (
  ip text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);

create index rate_limits_lookup_idx
  on rate_limits (ip, endpoint, created_at);

revoke all on rate_limits from public, anon, authenticated;

create or replace function check_rate_limit(
  p_ip text,
  p_endpoint text,
  p_limit integer,
  p_window interval
)
returns table(ok boolean, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt integer;
begin
  -- Serialize concurrent checks for the same ip+endpoint so the count never
  -- misses an in-flight insert from another request.
  perform pg_advisory_xact_lock(hashtextextended(p_ip || ':' || p_endpoint, 0));

  delete from rate_limits
  where ip = p_ip
    and endpoint = p_endpoint
    and created_at < now() - p_window;

  select count(*) into cnt
  from rate_limits
  where ip = p_ip
    and endpoint = p_endpoint
    and created_at >= now() - p_window;

  if cnt >= p_limit then
    return query select false, 0;
  end if;

  insert into rate_limits (ip, endpoint)
  values (p_ip, p_endpoint);

  return query select true, p_limit - cnt - 1;
end;
$$;

revoke execute on function check_rate_limit(text, text, integer, interval) from public;
