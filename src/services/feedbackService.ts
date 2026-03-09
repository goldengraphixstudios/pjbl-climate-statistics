import { supabase } from './supabaseClient';
import { ActivityType } from './responsesService';

export interface FeedbackRow {
  id: string;
  student_id: string;
  activity_type: ActivityType;
  feedback_text: string;
  created_by: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

function isUuid(value: string | null | undefined) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveCreatorId(): Promise<string | null> {
  const userRes = await supabase.auth.getUser();
  const sessionUser = userRes.data?.user || null;
  const storedId = localStorage.getItem('currentUserId');

  if (isUuid(storedId)) return storedId!;
  if (!sessionUser) return null;

  const byAuthId = await supabase
    .from('users')
    .select('id')
    .eq('id', sessionUser.id)
    .maybeSingle();
  if (byAuthId.data?.id) return byAuthId.data.id;

  if (!sessionUser.email) return null;

  const byEmail = await supabase
    .from('users')
    .select('id')
    .eq('email', sessionUser.email)
    .maybeSingle();
  return byEmail.data?.id || null;
}

export async function upsertFeedback(
  student_id: string,
  activity_type: ActivityType,
  feedback_text: string
) {
  const created_by = await resolveCreatorId();
  const { data, error } = await supabase
    .from('feedback')
    .upsert(
      {
        student_id,
        activity_type,
        feedback_text,
        created_by,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,activity_type' }
    )
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as FeedbackRow | null;
}

export async function getFeedbackForStudent(student_id: string) {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('student_id', student_id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as FeedbackRow[]) || [];
}

export async function getFeedbackForStudents(studentIds: string[]) {
  if (studentIds.length === 0) return [] as FeedbackRow[];
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .in('student_id', studentIds)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as FeedbackRow[]) || [];
}

export async function getFeedbackForStudentActivity(
  student_id: string,
  activity_type: ActivityType
) {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('student_id', student_id)
    .eq('activity_type', activity_type)
    .order('updated_at', { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return data as FeedbackRow | null;
}

export async function acknowledgeFeedback(
  student_id: string,
  activity_type: ActivityType
) {
  const { data, error } = await supabase
    .from('feedback')
    .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
    .eq('student_id', student_id)
    .eq('activity_type', activity_type)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as FeedbackRow | null;
}
