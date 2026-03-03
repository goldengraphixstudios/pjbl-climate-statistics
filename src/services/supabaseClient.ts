import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read Vite env variables directly so Vite can statically replace them at build time
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    'Supabase environment variables are missing. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are defined in the build environment.'
  );
} else {
  // provide a tiny bit of visibility when the app initializes
  console.info('Supabase client configured for', SUPABASE_URL);
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '');

// Auth helpers
export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// Lessons / progress / responses
export async function getLessons() {
  return supabase.from('lessons').select('*');
}

export async function getProgressForStudent(studentId: string) {
  return supabase.from('student_progress').select('*').eq('student_id', studentId);
}

export async function saveProgress(progress: {
  student_id: string;
  lesson_id: string;
  phase: number;
  activity: number;
  status: 'not_started' | 'in_progress' | 'completed';
  score?: number | null;
}) {
  // Upsert by unique keys might require a unique constraint on the DB; for now use simple insert
  return (supabase.from('student_progress') as any).upsert(progress, { onConflict: ['student_id', 'lesson_id', 'phase', 'activity'] });
}

export async function submitResponse(payload: {
  student_id: string;
  question_id: string;
  choice: string;
  is_correct?: boolean;
}) {
  return supabase.from('responses').insert(payload);
}

export async function getResponses(filter?: { student_id?: string; question_id?: string }) {
  let q = supabase.from('responses').select('*');
  if (filter?.student_id) q = q.eq('student_id', filter.student_id);
  if (filter?.question_id) q = q.eq('question_id', filter.question_id);
  return q;
}

export async function getClassStudents(classId: string) {
  return supabase
    .from('class_students')
    .select('student_id')
    .eq('class_id', classId);
}

// Get user profile (includes role) by id or email/name
export async function getUserProfileByIdentifier(identifier: string) {
  // identifier may be uuid or email or name
  const byId = await supabase.from('users').select('*').eq('id', identifier).limit(1).maybeSingle();
  if (byId.data) return byId.data;
  const byEmail = await supabase.from('users').select('*').ilike('email', identifier).limit(1).maybeSingle();
  if (byEmail.data) return byEmail.data;
  const byName = await supabase.from('users').select('*').ilike('name', identifier).limit(1).maybeSingle();
  if (byName.data) return byName.data;
  return null;
}

// Upload a base64/dataURL to Supabase Storage and return public URL (best-effort)
export async function uploadDataUrlToStorage(bucket: string, path: string, dataUrl: string) {
  try {
    const matches = dataUrl.match(/^data:(.+);base64,(.*)$/);
    if (!matches) throw new Error('Invalid data URL');
    const mime = matches[1];
    const b64 = matches[2];
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const file = new File([blob], path.split('/').pop() || path, { type: mime });
    const uploadRes = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (uploadRes.error) throw uploadRes.error;
    const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    return { publicUrl };
  } catch (e) {
    return { error: e };
  }
}
