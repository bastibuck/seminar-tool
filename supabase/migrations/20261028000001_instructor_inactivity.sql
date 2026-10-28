-- Existing sessions receive a bounded deadline when this migration is applied.
alter table public.instructor_sessions
  add column expires_at timestamptz not null default (now() + interval '2 hours');
