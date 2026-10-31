alter table public.instructors
  add column can_create_instructors boolean not null default false;

-- The record identifies both people through their Instructor accounts. Removing
-- either account also removes the corresponding record and personal data.
create table public.instructor_creations (
  instructor_id uuid primary key references public.instructors(user_id) on delete cascade,
  created_by uuid not null references public.instructors(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  check (instructor_id <> created_by)
);

alter table public.instructor_creations enable row level security;
revoke all on public.instructor_creations from public, anon, authenticated, service_role;
