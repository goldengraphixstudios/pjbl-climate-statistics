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

export async function upsertFeedback(
  student_id: string,
  activity_type: ActivityType,
  feedback_text: string
) {
  const user = await supabase.auth.getUser();
  const teacher_id = user.data?.user?.id || null;
  const { data, error } = await supabase
    .from('feedback')
    .upsert(
      {
        student_id,
        activity_type,
        feedback_text,
        created_by: teacher_id,
      },
      { onConflict: 'student_id, activity_type' }
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
    .eq('student_id', student_id);
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
