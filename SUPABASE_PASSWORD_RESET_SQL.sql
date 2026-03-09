-- Run this in Supabase SQL Editor.
-- This enables teacher/admin users to reissue a student's password.

create extension if not exists pgcrypto;

create or replace function public.reset_student_password(
  p_student_id uuid,
  p_new_password text
) returns json
language plpgsql
security definer
as $$
declare
  v_actor_role text;
  v_username text;
begin
  select role
    into v_actor_role
  from public.users
  where id = auth.uid();

  if v_actor_role not in ('teacher', 'admin') then
    return json_build_object('error', 'forbidden');
  end if;

  update public.users
     set hashed_password = crypt(p_new_password, gen_salt('bf'))
   where id = p_student_id
     and role = 'student'
  returning username into v_username;

  if v_username is null then
    return json_build_object('error', 'student_not_found');
  end if;

  return json_build_object('success', true, 'username', v_username);
end;
$$;

grant execute on function public.reset_student_password(uuid, text) to authenticated;
