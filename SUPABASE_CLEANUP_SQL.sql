-- PJBL Climate Statistics: cleanup / verification helpers
-- Run these one block at a time in Supabase SQL Editor.

-- 1. Verify the live source-of-truth rows for a student + lesson
with target_user as (
  select id, username, name
  from public.users
  where username = 'gabriel_labriaga'
  limit 1
)
select 'responses' as source, r.id::text as row_id, r.updated_at, r.activity_type as item_key
from public.responses r
join target_user u on u.id = r.student_id
where r.activity_type in ('lesson1', 'lesson2', 'lesson3')

union all

select 'student_state' as source, s.id::text as row_id, s.updated_at, s.lesson_slug as item_key
from public.student_state s
join target_user u on u.id = s.student_id
where s.lesson_slug in ('lesson1', 'lesson2', 'lesson3')

union all

select 'feedback' as source, f.id::text as row_id, f.updated_at, f.activity_type as item_key
from public.feedback f
join target_user u on u.id = f.student_id
where f.activity_type in ('lesson1', 'lesson2', 'lesson3')

order by updated_at desc;

-- 2. Hard reset one student's lesson rows
-- Replace `lesson1` with `lesson2` or `lesson3` when needed.
delete from public.responses
where student_id = (
  select id from public.users
  where username = 'gabriel_labriaga'
  limit 1
)
and activity_type = 'lesson1';

delete from public.student_state
where student_id = (
  select id from public.users
  where username = 'gabriel_labriaga'
  limit 1
)
and lesson_slug = 'lesson1';

delete from public.feedback
where student_id = (
  select id from public.users
  where username = 'gabriel_labriaga'
  limit 1
)
and activity_type = 'lesson1';

-- 3. Inspect rows after reset
with u as (
  select id
  from public.users
  where username = 'gabriel_labriaga'
  limit 1
)
select 'responses' as src, count(*) as total
from public.responses r
join u on u.id = r.student_id
where r.activity_type = 'lesson1'

union all

select 'student_state' as src, count(*) as total
from public.student_state s
join u on u.id = s.student_id
where s.lesson_slug = 'lesson1'

union all

select 'feedback' as src, count(*) as total
from public.feedback f
join u on u.id = f.student_id
where f.activity_type = 'lesson1';
