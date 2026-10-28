# Instructor accounts

**Do not enable this feature in production until #66 and the account review and rollout in #67 are complete.** In particular, #65 alone does not provide the two-hour shared-computer timeout or identity/sign-out controls.

## Prerequisites

- Disable **public sign-up** in the hosted Supabase Auth settings **before applying the Instructor migration**. Verify directly against hosted Auth that public registration fails; local `supabase/config.toml` does not configure hosted projects. Keep email/password sign-in enabled, and disable anonymous sign-ins and unintended external providers. In local development `auth.enable_signup = false` disables registration; `auth.email.enable_signup = true` keeps the email provider available for sign-in. Restart the local Supabase stack after changing Auth configuration.
- After migration `20261028000002_explicit_instructor_enrollment.sql`, creating an Auth user does **not** grant Instructor access. An operator must explicitly enroll each approved user in `public.instructors`. Keep public sign-up disabled anyway: unenrolled users can still have Supabase Auth accounts and may be able to sign in directly to Auth. When applying the migrations for the first time, keep access blocked and sign-up disabled throughout: the earlier Instructor migration temporarily enables automatic enrollment until the explicit-enrollment migration removes it.
- The server needs `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The owner database connection must be able to read/update `auth.users`, read/delete `auth.sessions` and `auth.one_time_tokens`, and manage the Instructor tables. Keep the database URL and service role key server-side. Password setup atomically writes a bcrypt hash, changes setup state and deletes Auth sessions and outstanding one-time tokens in one database transaction; Auth-table triggers block other password changes and prevent stale sessions being issued after setup. The app prehashes chosen passwords with SHA-256 before bcrypt so long and Unicode passwords are supported despite bcrypt's input limit. Sign in through the app, not directly through Supabase Auth. This depends on Supabase Auth's `auth.sessions`, `auth.one_time_tokens`, `auth.users.encrypted_password`, bcrypt and trigger behavior: verify these assumptions and all authentication tests when upgrading Supabase Auth.
- Only Auth accounts with a confirmed email and a standard `$2a$` bcrypt password hash are supported for enrollment; passwordless, SSO, imported non-bcrypt or Auth-database-encrypted password records require a separately approved delete-and-recreate workflow. Do not enable Supabase Auth database encryption for these credentials. Ordinary database storage encryption is not affected. Setup fails closed for unsupported hashes. Check with the owner before recreating any existing account.
- Supabase must allow email/password sign-in without sending email. For dashboard-created accounts, use the dashboard's **Auto Confirm User** / email-confirmed option: setting an email address alone does not verify it. No SMTP, invitation, or password-reset email is required.

## Review existing accounts

The explicit-enrollment migration preserves all existing Instructor approvals and sessions; it does not determine whether an approval was appropriate. Earlier versions automatically enrolled newly created Auth users, so review **all** existing accounts and approvals with the owner as part of #67 before restoring access. The following read-only query lists Auth users and whether each has Instructor access:

```sql
select u.id, u.email, u.created_at, (i.user_id is not null) as instructor_approved
from auth.users u
left join public.instructors i on i.user_id = u.id
order by u.created_at;
```

Do not delete or approve unexpected accounts without the owner's decision. To grant access to an approved account, follow the enrollment steps below. User-editable metadata does not grant Instructor access.

## Add an Instructor

Every Instructor has access to both the Cockpit and admin. Only grant access to people authorized for both.

1. In Supabase Dashboard → Authentication → Users, manually create the user with their email and a strong temporary password. Select **Auto Confirm User** / email-confirmed; setting an email address alone does not verify it. Share the temporary password privately, never in issue comments or application logs.
2. Copy the new user's **UUID** from the Users list. Creating the Auth user alone does not grant access to the application.
3. In the Supabase Dashboard → SQL Editor, replace the placeholder with that exact UUID and run the following query to enroll this one approved account:

```sql
insert into public.instructors (user_id)
select id from auth.users
where id = '<reviewed-user-uuid>'::uuid
  and email_confirmed_at is not null and deleted_at is null
  and not is_anonymous and not is_sso_user
  and left(encrypted_password, 4) = '$2a$'
on conflict (user_id) do nothing
returning user_id;
```

4. Confirm the query returns the intended UUID. If it returns no rows, check the UUID, confirmation and supported password requirements above; it may also already be enrolled. Use the review query above to check. Do not bypass these checks or bulk-enroll accounts.
5. The Instructor signs in at `/sign-in` with the temporary password, then chooses a different password of at least 12 characters. Spaces are allowed. Until setup succeeds, the temporary password can be used again, but the session cannot access Cockpit or admin. Completing setup invalidates other sessions and opens the Cockpit start page.

Existing approved users retain their current setup state. An existing account enrolled for the first time must also complete password setup.

## Offboarding and recovery

- If a password is forgotten, delete and recreate the account in the dashboard and repeat **all** steps above, including explicit enrollment. There is no password reset or account-settings flow. Recreating the same email creates a new identity and requires setup again.
- To revoke access, delete the account. Its existing application sessions are denied on the next protected request. Cases belong to no Instructor and are not deleted; Viewer access continues.

Each browser session expires after two hours without a qualifying Instructor navigation or action. Typing, background fetches, prefetches, Viewer use and Auth token refreshes do not extend it. Open protected pages lock without a keepalive; unsaved changes can be lost. There is no separate application session lifetime limit. Do not configure a Supabase Auth timebox or refresh-based inactivity limit as a substitute for this policy.

Safari does not report whether a browser-initiated reload or address-bar/bookmark navigation was user-triggered. To avoid treating automatic refreshes as activity, these navigations do not renew the timeout in Safari; use a link or action within the protected interface instead. A sign-in attempt in another tab locks previously open protected pages even if that attempt fails.

Protected pages require JavaScript for their on-screen lock. Cross-tab handover notifications use BroadcastChannel or browser local storage; keep at least one available on shared devices. The server still rejects expired or signed-out sessions independently of browser-side locking.

On shared computers another person can use an unlocked browser before the timeout. Sign out before handing over the computer. Sign-out revokes that browser session, not other browsers. Confirm the timeout, locking and handover behavior during the #67 rollout checks; keep external access blocked until those checks pass.
