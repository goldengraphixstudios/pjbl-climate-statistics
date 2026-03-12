import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read Vite env variables directly so Vite can statically replace them at build time
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
const isBrowser = typeof window !== 'undefined';
const isGithubPagesHost = isBrowser && /(^|\.)github\.io$/i.test(window.location.hostname);
const STAFF_LOGIN_HINTS_KEY = 'staffLoginHintsV1';

export type AuthFailureReason = 'invalid' | 'timeout' | 'service_unavailable' | 'unknown';

export function clearStaleSupabaseAuthStorage() {
  if (!isBrowser) return;
  const clearMatchingKeys = (storage: Storage) => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith('sb-') && key.includes('auth-token')) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      storage.removeItem(key);
    }
  };

  try {
    clearMatchingKeys(window.localStorage);
  } catch {}

  try {
    clearMatchingKeys(window.sessionStorage);
  } catch {}
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return '';
}

function readStaffLoginHints(): Record<string, string> {
  if (!isBrowser) return {};
  try {
    const raw = window.localStorage.getItem(STAFF_LOGIN_HINTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

export function cacheStaffLoginHint(username: string | null | undefined, email: string | null | undefined) {
  if (!isBrowser || !username || !email) return;
  try {
    const hints = readStaffLoginHints();
    hints[username.trim().toLowerCase()] = email.trim();
    window.localStorage.setItem(STAFF_LOGIN_HINTS_KEY, JSON.stringify(hints));
  } catch {}
}

export function getCachedStaffEmail(username: string): string | null {
  const key = username.trim().toLowerCase();
  if (!key) return null;
  return readStaffLoginHints()[key] || null;
}

export function getAuthFailureReason(error: unknown): AuthFailureReason {
  const message = getErrorMessage(error).toLowerCase();
  if (message === 'timeout') return 'timeout';
  if (
    message.includes('web server is down') ||
    message.includes('error code 521') ||
    message.includes('cloudflare') ||
    message.includes('<!doctype html') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed')
  ) {
    return 'service_unavailable';
  }
  return message ? 'unknown' : 'invalid';
}

export function getFriendlyAuthErrorMessage(error: unknown, fallback = 'Login failed. Please try again.'): string {
  const reason = getAuthFailureReason(error);
  if (reason === 'timeout') {
    return 'Login timed out. Please check your connection and try again.';
  }
  if (reason === 'service_unavailable') {
    return 'Login service is temporarily unavailable. Please try again later.';
  }
  return fallback;
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    'Supabase environment variables are missing. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are defined in the build environment.'
  );
} else {
  // provide a tiny bit of visibility when the app initializes
  console.info('Supabase client configured for', SUPABASE_URL);
  if (isGithubPagesHost) {
    console.info('GitHub Pages host detected: Supabase auth auto-refresh disabled');
  }
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: !isGithubPagesHost,
    detectSessionInUrl: false,
  },
});

// Auth helpers
export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password, options: { emailRedirectTo: '' } });
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
