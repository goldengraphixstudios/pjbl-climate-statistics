-- Supabase / Postgres schema for PJBL_new
-- Run this in Supabase SQL editor or psql

-- Enable UUID helper (pgcrypto provides gen_random_uuid)
create extension if not exists "pgcrypto";

-- Users
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  role text not null check (role in ('admin','teacher','student')),
  hashed_password text,
  username text,
  created_at timestamptz default now()
);

-- Classes
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade text,
  teacher_id uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- Join table for class membership
create table if not exists class_students (
  class_id uuid references classes(id) on delete cascade,
  student_id uuid references users(id) on delete cascade,
  primary key (class_id, student_id)
);

-- Lessons metadata
create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_lessons_slug on lessons (slug);

-- Student progress per lesson / phase / activity
create table if not exists student_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references users(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,
  phase integer not null,
  activity integer not null,
  status text not null check (status in ('not_started','in_progress','completed')),
  score numeric,
  updated_at timestamptz default now()
);

create index if not exists idx_progress_student on student_progress (student_id);

-- Responses / answers for analytics
create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references users(id) on delete cascade,
  question_id text,
  choice text,
  is_correct boolean,
  response_json jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_responses_student on responses (student_id);

-- Per-student per-lesson full state storage (JSON)
create table if not exists student_state (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references users(id) on delete cascade,
  lesson_slug text not null,
  state jsonb,
  updated_at timestamptz default now(),
  unique (student_id, lesson_slug)
);

-- Extended profile and LMS support
alter table users add column if not exists section text;
create unique index if not exists idx_users_username on users (username);

-- Responses enhancements
alter table responses add column if not exists activity_type text;
alter table responses add column if not exists answers jsonb;
alter table responses add column if not exists correctness jsonb;
alter table responses add column if not exists teacher_score numeric;
alter table responses add column if not exists teacher_scored_by uuid references users(id);
alter table responses add column if not exists teacher_scored_at timestamptz;
create index if not exists idx_responses_activity_type on responses (activity_type);

-- Feedback table for teacher comments, acknowledgements, and scores
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references users(id) on delete cascade,
  activity_type text not null,
  feedback_scope text not null default 'overall',
  sub_activity_key text not null default '',
  feedback_text text not null default '',
  created_by uuid references users(id) on delete set null,
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, activity_type, feedback_scope, sub_activity_key)
);

create index if not exists idx_feedback_student on feedback(student_id);
create index if not exists idx_feedback_activity on feedback(activity_type);
create index if not exists idx_feedback_scope on feedback(feedback_scope);
create index if not exists idx_feedback_sub_activity on feedback(sub_activity_key);

-- ============================================================
-- MIGRATIONS (run these in Supabase SQL editor if the tables
-- already exist from a prior deployment)
-- ============================================================

-- 1. Make users.email nullable (students use generated @pjbl.local emails for Supabase Auth)
alter table users alter column email drop not null;

-- 2. Add grade column to classes
alter table classes add column if not exists grade text;

-- 3. Make responses.question_id nullable (legacy column, no longer required)
alter table responses alter column question_id drop not null;

-- 4. Add unique constraint so upsert on (student_id, activity_type) works
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'responses_student_id_activity_type_key'
  ) then
    alter table responses add constraint responses_student_id_activity_type_key
      unique (student_id, activity_type);
  end if;
end$$;

-- 5. Add updated_at to responses for tracking
alter table responses add column if not exists updated_at timestamptz default now();

-- 6. RLS: Enable row-level security on all tables
alter table users enable row level security;
alter table classes enable row level security;
alter table class_students enable row level security;
alter table responses enable row level security;
alter table feedback enable row level security;
alter table student_progress enable row level security;
alter table student_state enable row level security;

-- 7. RLS Policies ---

-- users: anyone authenticated can read all profiles (needed for username lookup)
drop policy if exists "users_select_all" on users;
create policy "users_select_all" on users for select using (true);

-- users: authenticated users can insert their own profile row
drop policy if exists "users_insert_own" on users;
create policy "users_insert_own" on users for insert with check (
  auth.uid() = id or auth.uid() is not null
);

-- users: users can update their own profile
drop policy if exists "users_update_own" on users;
create policy "users_update_own" on users for update using (auth.uid() = id);

-- classes: all authenticated users can read classes
drop policy if exists "classes_select_all" on classes;
create policy "classes_select_all" on classes for select using (auth.uid() is not null);

-- classes: teachers can insert/update/delete their own classes
drop policy if exists "classes_insert_teacher" on classes;
create policy "classes_insert_teacher" on classes for insert with check (auth.uid() is not null);

drop policy if exists "classes_update_teacher" on classes;
create policy "classes_update_teacher" on classes for update using (
  teacher_id = auth.uid() or
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

drop policy if exists "classes_delete_teacher" on classes;
create policy "classes_delete_teacher" on classes for delete using (
  teacher_id = auth.uid() or
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

-- class_students: all authenticated users can read
drop policy if exists "class_students_select" on class_students;
create policy "class_students_select" on class_students for select using (auth.uid() is not null);

-- class_students: teachers/admins can insert/delete
drop policy if exists "class_students_insert" on class_students;
create policy "class_students_insert" on class_students for insert with check (
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

drop policy if exists "class_students_delete" on class_students;
create policy "class_students_delete" on class_students for delete using (
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

-- responses: students can insert/read their own; teachers/admins can read all and update teacher_score
drop policy if exists "responses_select_own" on responses;
create policy "responses_select_own" on responses for select using (
  student_id = auth.uid() or
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

drop policy if exists "responses_insert_own" on responses;
create policy "responses_insert_own" on responses for insert with check (
  student_id = auth.uid()
);

drop policy if exists "responses_update" on responses;
create policy "responses_update" on responses for update using (
  student_id = auth.uid() or
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

-- feedback: students can read their own and update acknowledged; teachers/admins can do all
drop policy if exists "feedback_select" on feedback;
create policy "feedback_select" on feedback for select using (
  student_id = auth.uid() or
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

drop policy if exists "feedback_insert" on feedback;
create policy "feedback_insert" on feedback for insert with check (
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

drop policy if exists "feedback_update" on feedback;
create policy "feedback_update" on feedback for update using (
  student_id = auth.uid() or
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

-- student_progress: own read/write; teachers/admins read all
drop policy if exists "progress_select" on student_progress;
create policy "progress_select" on student_progress for select using (
  student_id = auth.uid() or
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

drop policy if exists "progress_insert" on student_progress;
create policy "progress_insert" on student_progress for insert with check (
  student_id = auth.uid()
);

drop policy if exists "progress_update" on student_progress;
create policy "progress_update" on student_progress for update using (
  student_id = auth.uid()
);

-- student_state: own read/write; teachers/admins read all
drop policy if exists "state_select" on student_state;
create policy "state_select" on student_state for select using (
  student_id = auth.uid() or
  exists (select 1 from users where id = auth.uid() and role in ('teacher','admin'))
);

drop policy if exists "state_insert" on student_state;
create policy "state_insert" on student_state for insert with check (
  student_id = auth.uid()
);

drop policy if exists "state_update" on student_state;
create policy "state_update" on student_state for update using (
  student_id = auth.uid()
);
