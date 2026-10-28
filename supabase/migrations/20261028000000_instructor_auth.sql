-- Existing Auth users are deliberately not backfilled. Only accounts created
-- after this migration are enrolled; hosted public sign-up must be disabled.
create table public.instructors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  setup_required boolean not null default true
);

create table public.instructor_sessions (
  token_hash text primary key,
  user_id uuid not null references public.instructors(user_id) on delete cascade,
  auth_session_id uuid not null references auth.sessions(id) on delete cascade,
  credential_hash text not null,
  setup_session boolean not null
);

-- A short-lived, single-use server-to-Auth admission bound to the credential
-- version seen by the app. It is never sent to the browser.
create table public.instructor_login_admissions (
  nonce_hash text primary key,
  user_id uuid not null references public.instructors(user_id) on delete cascade,
  credential_hash text not null,
  expires_at timestamptz not null
);

alter table public.instructors enable row level security;
alter table public.instructor_sessions enable row level security;
alter table public.instructor_login_admissions enable row level security;
revoke all on public.instructors, public.instructor_sessions, public.instructor_login_admissions from public, anon, authenticated, service_role;

create function public.enroll_new_instructor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.instructors(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.enroll_new_instructor() from public, anon, authenticated, service_role;

create trigger enroll_new_instructor after insert on auth.users
for each row execute function public.enroll_new_instructor();

-- There is deliberately no account-settings or password-reset flow. Reject
-- out-of-band password updates for enrolled accounts, including requests that
-- authenticated with a temporary password just before setup completed.
create function public.guard_instructor_password() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and new.deleted_at is null
     and exists (select 1 from public.instructors where user_id = old.id)
     and coalesce(current_setting('seminar.instructor_password_setup', true), '') <> 'on' then
    raise exception 'Instructor password changes must use setup';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_instructor_password() from public, anon, authenticated, service_role;
create trigger guard_instructor_password before update of encrypted_password on auth.users
for each row execute function public.guard_instructor_password();

-- Serialize session issuance with setup. A direct Auth login verified before
-- setup cannot issue a late session after setup has revoked the old sessions.
-- Completed accounts can issue sessions only through a matching app admission.
create function public.guard_instructor_session() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pending boolean;
begin
  select setup_required into pending from public.instructors
    where user_id = new.user_id for update;
  if not found or pending then return new; end if;

  delete from public.instructor_login_admissions a
  using auth.users u
  where a.user_id = new.user_id and u.id = a.user_id
    and a.nonce_hash = encode(extensions.digest(coalesce(new.user_agent, ''), 'sha256'), 'hex')
    and a.credential_hash = encode(extensions.digest(u.encrypted_password, 'sha256'), 'hex')
    and a.expires_at > clock_timestamp();
  if not found then raise exception 'Instructor session requires app sign-in'; end if;
  return new;
end;
$$;
revoke all on function public.guard_instructor_session() from public, anon, authenticated, service_role;
create trigger guard_instructor_session before insert on auth.sessions
for each row execute function public.guard_instructor_session();
