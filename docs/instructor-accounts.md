# Instructor accounts

**Do not enable this feature in production until #66 and the account review and rollout in #67 are complete.** In particular, #65 alone does not provide the two-hour shared-computer timeout or identity/sign-out controls.

## Prerequisites

- Disable **public sign-up** in the hosted Supabase Auth settings **before applying the Instructor migration**. Verify directly against hosted Auth that public registration fails; local `supabase/config.toml` does not configure hosted projects. Keep email/password sign-in enabled, and disable anonymous sign-ins and unintended external providers. In local development `auth.enable_signup = false` disables registration; `auth.email.enable_signup = true` keeps the email provider available for sign-in. Restart the local Supabase stack after changing Auth configuration.
- The migration enrolls Auth users created *after* it is installed. It intentionally does not enroll existing users. This assumes public sign-up stays disabled: otherwise a newly registered public user would be enrolled. Restrict who can create Auth users and monitor the hosted configuration. Do not apply the migration while public sign-up is enabled.
- The server needs `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The owner database connection must be able to read/update `auth.users`, read/delete `auth.sessions` and `auth.one_time_tokens`, and manage the Instructor tables. Keep the database URL and service role key server-side. Password setup atomically writes a bcrypt hash, changes setup state and deletes Auth sessions and outstanding one-time tokens in one database transaction; Auth-table triggers block other password changes and prevent stale sessions being issued after setup. The app prehashes chosen passwords with SHA-256 before bcrypt so long and Unicode passwords are supported despite bcrypt's input limit. Sign in through the app, not directly through Supabase Auth. This depends on Supabase Auth's `auth.sessions`, `auth.one_time_tokens`, `auth.users.encrypted_password`, bcrypt and trigger behavior: verify these assumptions and all authentication tests when upgrading Supabase Auth.
- Only Auth accounts with a confirmed email and a standard `$2a$` bcrypt password hash are supported for enrollment; passwordless, SSO, imported non-bcrypt or Auth-database-encrypted password records require a separately approved delete-and-recreate workflow. Do not enable Supabase Auth database encryption for these credentials. Ordinary database storage encryption is not affected. Setup fails closed for unsupported hashes. Check with the owner before recreating any existing account.
- Supabase must allow email/password sign-in without sending email. For dashboard-created accounts, use the dashboard's **Auto Confirm User** / email-confirmed option: setting an email address alone does not verify it. No SMTP, invitation, or password-reset email is required.

## Review existing accounts

The migration does not delete or automatically trust existing Auth users. Review them with the owner as part of #67. The following read-only query shows accounts without Instructor access:

```sql
select u.id, u.email, u.created_at
from auth.users u
left join public.instructors i on i.user_id = u.id
where i.user_id is null
order by u.created_at;
```

Only after explicit approval and checking that it has a confirmed email and supported password, enroll an individual reviewed identity with its exact UUID (replace the placeholder):

```sql
insert into public.instructors (user_id)
select id from auth.users
where id = '<reviewed-user-uuid>'::uuid
  and email_confirmed_at is not null and deleted_at is null
  and not is_anonymous and not is_sso_user
  and left(encrypted_password, 4) = '$2a$'
on conflict (user_id) do nothing;
```

An enrolled existing user is required to complete password setup. Do not delete unexpected accounts or bulk-enroll users without approval. User-editable metadata does not grant Instructor access.

## Onboarding and offboarding

1. In Supabase Dashboard → Authentication → Users, manually create the Instructor with an email identifier and a strong temporary password; mark the email confirmed as described above. Share the temporary password privately, never in issue comments or application logs.
2. The Instructor signs in at `/sign-in`, then chooses a different password of at least 12 characters. Spaces are allowed. Until that succeeds, the temporary password can be used again, but the session cannot access Cockpit or admin. Completing setup invalidates the other sessions and opens the Cockpit start page.
3. If a password is forgotten, delete and recreate the account in the dashboard and repeat onboarding. There is no password reset or account-settings flow. Recreating the same email creates a new identity and requires setup again.
4. To revoke access, delete the account. Its existing application sessions are denied on the next protected request. Cases belong to no Instructor and are not deleted; Viewer access continues.

On shared computers another person can use an unlocked browser. Do not hand over a signed-in browser; #66 supplies the required timeout and sign-out controls before production rollout.
