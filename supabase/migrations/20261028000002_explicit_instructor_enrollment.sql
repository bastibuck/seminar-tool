-- Existing Instructor approvals remain in place. New Auth users must be
-- explicitly reviewed and enrolled before they can sign in to the app.
drop trigger if exists enroll_new_instructor on auth.users;
drop function if exists public.enroll_new_instructor();
