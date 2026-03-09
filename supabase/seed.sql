-- ============================================================
-- SEED: Initial teacher and admin accounts
-- ============================================================
-- Run these in Supabase SQL editor AFTER creating the accounts
-- via the Supabase Dashboard → Authentication → Users
--
-- STEP 1: Go to Supabase Dashboard → Authentication → Users → "Add user"
--   Add each account with "Auto Confirm User" checked:
--
--   Teacher account:
--     Email:    teacher01@pjbl.local
--     Password: cbnhs
--
--   Admin account:
--     Email:    sirmarco@pjbl.local
--     Password: 101997
--
-- STEP 2: After creating the Auth users above, copy the UUID of each
--   from the dashboard and replace the placeholder below, then run this SQL.
--
-- NOTE: If you do NOT want to use @pjbl.local emails, use real emails instead.
--       The login page will look up the username → email from this table.
-- ============================================================

-- Replace these UUIDs with the actual IDs from auth.users after creating them:
-- (You can also run without the id field and let Postgres generate one,
--  but then the profile won't be linked to Supabase Auth)

INSERT INTO public.users (id, name, email, username, role)
VALUES
  -- Teacher account (id must match auth.users id from the dashboard)
  -- gen_random_uuid() is used as placeholder; replace with real auth user id
  (gen_random_uuid(), 'Teacher One', 'teacher01@pjbl.local', 'teacher01', 'teacher'),
  -- Admin account
  (gen_random_uuid(), 'Sir Marco', 'sirmarco@pjbl.local', 'sirmarco', 'admin')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- ALTERNATIVE: If you already have auth users and want to link them,
-- use the id from auth.users:
--
-- INSERT INTO public.users (id, name, email, username, role)
-- SELECT id, 'Teacher One', email, 'teacher01', 'teacher'
-- FROM auth.users WHERE email = 'teacher01@pjbl.local'
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.users (id, name, email, username, role)
-- SELECT id, 'Sir Marco', email, 'sirmarco', 'admin'
-- FROM auth.users WHERE email = 'sirmarco@pjbl.local'
-- ON CONFLICT (id) DO NOTHING;
-- ============================================================
