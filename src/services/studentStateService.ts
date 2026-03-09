import { supabase } from './supabaseClient';

export type LessonSlug = 'lesson1' | 'lesson2' | 'lesson3';

function isUuid(value: string | null | undefined) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function resolveStudentId(identifier: string) {
  if (!identifier) return null;
  if (isUuid(identifier)) return identifier;

  const queries = [
    supabase.from('users').select('id').eq('username', identifier).maybeSingle(),
    supabase.from('users').select('id').eq('email', identifier).maybeSingle(),
    supabase.from('users').select('id').eq('name', identifier).maybeSingle(),
  ];

  for (const query of queries) {
    const { data, error } = await query;
    if (!error && data?.id) return data.id as string;
  }

  return null;
}

export async function getStudentState(identifier: string, lessonSlug: LessonSlug) {
  const studentId = await resolveStudentId(identifier);
  if (!studentId) return null;

  const { data, error } = await supabase
    .from('student_state')
    .select('state')
    .eq('student_id', studentId)
    .eq('lesson_slug', lessonSlug)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.state ?? null;
}

export async function upsertStudentState(identifier: string, lessonSlug: LessonSlug, state: unknown) {
  const studentId = await resolveStudentId(identifier);
  if (!studentId) return null;

  const { data, error } = await (supabase.from('student_state') as any)
    .upsert(
      {
        student_id: studentId,
        lesson_slug: lessonSlug,
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: ['student_id', 'lesson_slug'] }
    )
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function deleteStudentState(identifier: string, lessonSlug: LessonSlug) {
  const studentId = await resolveStudentId(identifier);
  if (!studentId) return null;

  const { error } = await supabase
    .from('student_state')
    .delete()
    .eq('student_id', studentId)
    .eq('lesson_slug', lessonSlug);

  if (error) throw error;
  return true;
}
