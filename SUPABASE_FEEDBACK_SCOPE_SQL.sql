-- Run this once in Supabase SQL Editor before using separate
-- overall lesson feedback and activity-scoped feedback rows.

alter table public.feedback
  add column if not exists feedback_scope text not null default 'overall';

alter table public.feedback
  add column if not exists sub_activity_key text not null default '';

update public.feedback
set feedback_scope = 'overall'
where feedback_scope is null or feedback_scope = '';

update public.feedback
set sub_activity_key = ''
where sub_activity_key is null;

alter table public.feedback
  drop constraint if exists feedback_student_id_activity_type_key;

create unique index if not exists idx_feedback_scope_unique
on public.feedback (student_id, activity_type, feedback_scope, sub_activity_key);

create index if not exists idx_feedback_scope
on public.feedback (feedback_scope);

create index if not exists idx_feedback_sub_activity
on public.feedback (sub_activity_key);
