/**
 * analyticsService.ts
 *
 * Supabase-backed analytics functions that replace the localStorage-based
 * functions from progressService. Functions match the same signatures so
 * AdminPortal can swap them in without logic changes.
 */

import { supabase } from './supabaseClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getStudentIdsByUsernames(usernames: string[]): Promise<string[]> {
  if (usernames.length === 0) return [];
  const { data } = await supabase
    .from('users')
    .select('id')
    .in('username', usernames)
    .eq('role', 'student');
  return (data || []).map((r: any) => r.id);
}

async function getResponsesByActivityType(
  studentIds: string[],
  activityType: string
): Promise<any[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('responses')
    .select('student_id, answers, correctness, teacher_score')
    .in('student_id', studentIds)
    .eq('activity_type', activityType);
  if (error) { console.error('[analyticsService] responses error', error); return []; }
  return data || [];
}

// ─── Pre-Assessment Summary ───────────────────────────────────────────────────

/**
 * Returns { total, tested, scores, groups } for the pre-assessment.
 * - scores: per-student Part 1 correct count (0-15)
 * - groups: per-student LC group scores { lc12, lc34, lc56 }
 */
export async function getPreAssessmentSummaryFromDB(usernames: string[]) {
  const studentIds = await getStudentIdsByUsernames(usernames);
  const rows = await getResponsesByActivityType(studentIds, 'pre');

  const scores: number[] = [];
  const groups: { lc12: number; lc34: number; lc56: number }[] = [];

  for (const row of rows) {
    const a = row.answers || {};
    const score = typeof a.part1Score === 'number' ? a.part1Score : null;
    if (score !== null) {
      scores.push(score);
      if (a.part1GroupScores) groups.push(a.part1GroupScores);
    }
  }

  return { total: usernames.length, tested: scores.length, scores, groups };
}

// ─── Initial Survey Summary ───────────────────────────────────────────────────

/**
 * Returns { responses } where each entry is a 17-item Likert array (1–4).
 */
export async function getInitialSurveySummaryFromDB(usernames: string[]) {
  const studentIds = await getStudentIdsByUsernames(usernames);
  const rows = await getResponsesByActivityType(studentIds, 'pre');

  const responses: number[][] = rows
    .map((r: any) => r.answers?.part2)
    .filter((p: any): p is number[] => Array.isArray(p) && p.length === 17);

  return { responses };
}

// ─── Post-Assessment Summary ──────────────────────────────────────────────────

export async function getPostAssessmentSummaryFromDB(usernames: string[]) {
  const studentIds = await getStudentIdsByUsernames(usernames);
  const rows = await getResponsesByActivityType(studentIds, 'post');

  const scores: number[] = [];
  const groups: { lc12: number; lc34: number; lc56: number }[] = [];

  for (const row of rows) {
    const a = row.answers || {};
    const score = typeof a.part1Score === 'number' ? a.part1Score : null;
    if (score !== null) {
      scores.push(score);
      if (a.part1GroupScores) groups.push(a.part1GroupScores);
    }
  }

  return { total: usernames.length, tested: scores.length, scores, groups };
}

// ─── End-of-Lesson Survey Summary ────────────────────────────────────────────

export async function getEndOfLessonSurveySummaryFromDB(usernames: string[]) {
  const studentIds = await getStudentIdsByUsernames(usernames);
  const rows = await getResponsesByActivityType(studentIds, 'post');

  const responses: number[][] = rows
    .map((r: any) => r.answers?.part2)
    .filter((p: any): p is number[] => Array.isArray(p) && p.length === 17);

  return { responses };
}

// ─── Class Record CSV export ──────────────────────────────────────────────────

export interface ClassRecordEntry {
  name: string;
  username: string;
  section: string;
  pre_score: number | null;
  lesson1_score: number | null;
  lesson2_score: number | null;
  lesson3_score: number | null;
  post_score: number | null;
}

export async function getClassRecordForExport(
  usernames: string[],
  sectionLabel: string
): Promise<ClassRecordEntry[]> {
  if (usernames.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, name, username')
    .in('username', usernames);

  if (!users || users.length === 0) return [];

  const studentIds = users.map((u: any) => u.id);

  const { data: responses } = await supabase
    .from('responses')
    .select('student_id, activity_type, teacher_score, answers')
    .in('student_id', studentIds)
    .not('activity_type', 'is', null);

  const scoreMap: Record<string, Record<string, number | null>> = {};
  (responses || []).forEach((r: any) => {
    if (!scoreMap[r.student_id]) scoreMap[r.student_id] = {};
    // For pre/post, prefer answers.part1Score; fallback to teacher_score
    if (r.activity_type === 'pre' || r.activity_type === 'post') {
      const s = r.answers?.part1Score ?? r.teacher_score ?? null;
      scoreMap[r.student_id][r.activity_type] = s;
    } else {
      scoreMap[r.student_id][r.activity_type] = r.teacher_score ?? null;
    }
  });

  return users.map((u: any) => ({
    name: u.name || u.username || '',
    username: u.username || '',
    section: sectionLabel,
    pre_score: scoreMap[u.id]?.['pre'] ?? null,
    lesson1_score: scoreMap[u.id]?.['lesson1'] ?? null,
    lesson2_score: scoreMap[u.id]?.['lesson2'] ?? null,
    lesson3_score: scoreMap[u.id]?.['lesson3'] ?? null,
    post_score: scoreMap[u.id]?.['post'] ?? null,
  }));
}
