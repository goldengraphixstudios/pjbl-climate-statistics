/**
 * submissionsService.ts
 *
 * Provides teacher-facing queries:
 * - Fetch all student submissions for a class or all classes
 * - Set/update teacher scores on responses
 * - Build a class record (student × activity score matrix)
 */

import { supabase } from './supabaseClient';
import type { ActivityType } from './responsesService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubmissionRow {
  student_id: string;
  student_name: string;
  student_username: string;
  activity_type: ActivityType;
  answers: any;
  correctness: any;
  teacher_score: number | null;
  teacher_scored_by: string | null;
  teacher_scored_at: string | null;
  created_at: string;
  updated_at: string;
  feedback_text?: string;
  feedback_acknowledged?: boolean;
}

export interface ClassRecordRow {
  student_id: string;
  student_name: string;
  student_username: string;
  section: string;
  pre_score: number | null;
  lesson1_score: number | null;
  lesson2_score: number | null;
  lesson3_score: number | null;
  post_score: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getStudentIdsForClass(classId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('class_students')
    .select('student_id')
    .eq('class_id', classId);
  if (error) { console.error('[submissionsService] getStudentIds error', error); return []; }
  return (data || []).map((r: any) => r.student_id);
}

async function getAllStudentIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'student');
  if (error) { console.error('[submissionsService] getAllStudentIds error', error); return []; }
  return (data || []).map((r: any) => r.id);
}

// ─── Get submissions ──────────────────────────────────────────────────────────

/**
 * Fetch all responses for students in a given class, enriched with
 * student name/username and latest feedback.
 */
export async function getSubmissionsForClass(classId: string): Promise<SubmissionRow[]> {
  const studentIds = classId === 'all'
    ? await getAllStudentIds()
    : await getStudentIdsForClass(classId);

  if (studentIds.length === 0) return [];
  return fetchSubmissionsForStudents(studentIds);
}

export async function getSubmissionsForStudent(studentId: string): Promise<SubmissionRow[]> {
  return fetchSubmissionsForStudents([studentId]);
}

async function fetchSubmissionsForStudents(studentIds: string[]): Promise<SubmissionRow[]> {
  // Fetch responses
  const { data: responses, error: rErr } = await supabase
    .from('responses')
    .select('student_id, activity_type, answers, correctness, teacher_score, teacher_scored_by, teacher_scored_at, created_at, updated_at')
    .in('student_id', studentIds)
    .not('activity_type', 'is', null);

  if (rErr) { console.error('[submissionsService] responses error', rErr); return []; }

  // Fetch user profiles
  const { data: users } = await supabase
    .from('users')
    .select('id, name, username')
    .in('id', studentIds);

  const userMap: Record<string, { name: string; username: string }> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = { name: u.name || u.username || '', username: u.username || '' }; });

  // Fetch feedback
  const { data: feedbacks } = await supabase
    .from('feedback')
    .select('student_id, activity_type, feedback_text, acknowledged')
    .in('student_id', studentIds);

  const feedbackMap: Record<string, { text: string; acknowledged: boolean }> = {};
  (feedbacks || []).forEach((f: any) => {
    feedbackMap[`${f.student_id}::${f.activity_type}`] = {
      text: f.feedback_text || '',
      acknowledged: !!f.acknowledged,
    };
  });

  return (responses || []).map((r: any) => {
    const u = userMap[r.student_id] || { name: '', username: '' };
    const fb = feedbackMap[`${r.student_id}::${r.activity_type}`];
    return {
      student_id: r.student_id,
      student_name: u.name,
      student_username: u.username,
      activity_type: r.activity_type as ActivityType,
      answers: r.answers,
      correctness: r.correctness,
      teacher_score: r.teacher_score ?? null,
      teacher_scored_by: r.teacher_scored_by ?? null,
      teacher_scored_at: r.teacher_scored_at ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      feedback_text: fb?.text,
      feedback_acknowledged: fb?.acknowledged,
    } as SubmissionRow;
  });
}

// ─── Set teacher score ────────────────────────────────────────────────────────

export async function setTeacherScore(
  studentId: string,
  activityType: ActivityType,
  score: number
): Promise<void> {
  const user = await supabase.auth.getUser();
  const teacherId = user.data?.user?.id || null;

  const { error } = await supabase
    .from('responses')
    .update({
      teacher_score: score,
      teacher_scored_by: teacherId,
      teacher_scored_at: new Date().toISOString(),
    })
    .eq('student_id', studentId)
    .eq('activity_type', activityType);

  if (error) throw error;
}

// ─── Class record ─────────────────────────────────────────────────────────────

export async function getClassRecord(classId: string): Promise<ClassRecordRow[]> {
  const studentIds = classId === 'all'
    ? await getAllStudentIds()
    : await getStudentIdsForClass(classId);

  if (studentIds.length === 0) return [];

  const { data: responses } = await supabase
    .from('responses')
    .select('student_id, activity_type, teacher_score, answers')
    .in('student_id', studentIds)
    .not('activity_type', 'is', null);

  const { data: users } = await supabase
    .from('users')
    .select('id, name, username, section')
    .in('id', studentIds);

  const { data: classStudents } = await supabase
    .from('class_students')
    .select('student_id, class_id')
    .in('student_id', studentIds);

  const { data: classRows } = await supabase
    .from('classes')
    .select('id, name, grade')
    .in('id', (classStudents || []).map((r: any) => r.class_id));

  const classMap: Record<string, string> = {};
  (classStudents || []).forEach((cs: any) => {
    const cls = (classRows || []).find((c: any) => c.id === cs.class_id);
    if (cls) classMap[cs.student_id] = cls.name || '';
  });

  const scoreMap: Record<string, Record<string, number | null>> = {};
  (responses || []).forEach((r: any) => {
    if (!scoreMap[r.student_id]) scoreMap[r.student_id] = {};
    if (r.activity_type === 'pre' || r.activity_type === 'post') {
      scoreMap[r.student_id][r.activity_type] = r.answers?.part1Score ?? r.teacher_score ?? null;
    } else {
      scoreMap[r.student_id][r.activity_type] = r.teacher_score ?? null;
    }
  });

  return studentIds.map(sid => {
    const u = (users || []).find((u: any) => u.id === sid);
    const scores = scoreMap[sid] || {};
    return {
      student_id: sid,
      student_name: u?.name || u?.username || '',
      student_username: u?.username || '',
      section: classMap[sid] || u?.section || '',
      pre_score: scores['pre'] ?? null,
      lesson1_score: scores['lesson1'] ?? null,
      lesson2_score: scores['lesson2'] ?? null,
      lesson3_score: scores['lesson3'] ?? null,
      post_score: scores['post'] ?? null,
    } as ClassRecordRow;
  });
}
