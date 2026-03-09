import { supabase } from './supabaseClient';

export type ActivityType = 'pre' | 'lesson1' | 'lesson2' | 'lesson3' | 'post';

export interface ResponseRow {
  id: string;
  student_id: string;
  activity_type: ActivityType;
  answers: any;
  correctness?: any;
  teacher_score?: number;
  teacher_scored_by?: string;
  teacher_scored_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Upsert a student's response for an activity.  Returns the upserted row.
 */
export async function upsertResponse(payload: {
  student_id: string;
  activity_type: ActivityType;
  answers: any;
  correctness?: any;
}) {
  const { data, error } = await supabase
    .from('responses')
    .upsert(
      {
        student_id: payload.student_id,
        activity_type: payload.activity_type,
        answers: payload.answers,
        correctness: payload.correctness || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,activity_type' }
    )
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ResponseRow | null;
}

export async function getResponsesForStudent(student_id: string) {
  const { data, error } = await supabase
    .from('responses')
    .select('*')
    .eq('student_id', student_id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as ResponseRow[]) || [];
}

export async function getResponsesForStudents(studentIds: string[]) {
  if (studentIds.length === 0) return [] as ResponseRow[];
  const { data, error } = await supabase
    .from('responses')
    .select('*')
    .in('student_id', studentIds)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as ResponseRow[]) || [];
}

export async function getResponseForStudentActivity(
  student_id: string,
  activity_type: ActivityType
) {
  const { data, error } = await supabase
    .from('responses')
    .select('*')
    .eq('student_id', student_id)
    .eq('activity_type', activity_type)
    .order('updated_at', { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return data as ResponseRow | null;
}

export async function teacherUpdateScore(
  student_id: string,
  activity_type: ActivityType,
  teacher_score: number
) {
  const user = await supabase.auth.getUser();
  const teacher_id = user.data?.user?.id || null;
  const { data, error } = await supabase
    .from('responses')
    .update({
      teacher_score,
      teacher_scored_by: teacher_id,
      teacher_scored_at: new Date().toISOString(),
    })
    .eq('student_id', student_id)
    .eq('activity_type', activity_type)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ResponseRow | null;
}
