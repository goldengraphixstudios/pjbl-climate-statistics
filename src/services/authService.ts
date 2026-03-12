import { getAuthFailureReason, supabase, signIn, signUp, signOut } from './supabaseClient';

export { signOut };

type StudentCredentialSource = 'auth' | 'rpc' | 'legacy';
export type StudentCredentialFailureReason = 'invalid' | 'timeout' | 'service_unavailable';

const withTimeout = async <T,>(promise: PromiseLike<T>, ms = 4000): Promise<T> => {
  return await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
};

// Keep a minimal fallback for default demo accounts.
const defaultStudents: Record<string, string> = {
  'john_doe': 'doe123',
  'jane_smith': 'smith456',
  'student_001': 'pass001',
  'test_user': 'testpass123'
};

const toStudentFailureReason = (error: unknown): StudentCredentialFailureReason => {
  const reason = getAuthFailureReason(error);
  if (reason === 'timeout') return 'timeout';
  if (reason === 'service_unavailable') return 'service_unavailable';
  return 'invalid';
};

// ─── Validate credentials & return userId ────────────────────────────────────

export const validateStudentCredentials = async (
  username: string,
  password: string
): Promise<{ valid: boolean; userId?: string; email?: string; source?: StudentCredentialSource; reason?: StudentCredentialFailureReason }> => {
  // Direct email sign-in (admin/teacher accounts use Supabase Auth)
  if (username.includes('@')) {
    try {
      const res = await withTimeout(signIn(username, password), 8000);
      if (!res.error && res.data?.session) {
        return { valid: true, userId: res.data.session.user.id, email: username, source: 'auth' };
      }
      if (res.error) return { valid: false, reason: toStudentFailureReason(res.error) };
    } catch (error) {
      return { valid: false, reason: toStudentFailureReason(error) };
    }
    return { valid: false, reason: 'invalid' };
  }

  // Student login: verify password via DB function (no Supabase Auth session needed)
  let rpcFailureReason: StudentCredentialFailureReason | null = null;
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('verify_student', {
        p_username: username,
        p_password: password,
      }),
      4000
    );
    if (!error && data?.valid) {
      return { valid: true, userId: data.id, source: 'rpc' };
    }
    if (error) rpcFailureReason = toStudentFailureReason(error);
  } catch (error) {
    rpcFailureReason = toStudentFailureReason(error);
  }

  // Legacy localStorage fallback (for demo accounts that pre-date Supabase)
  try {
    const raw = localStorage.getItem('studentDatabase');
    const db = raw ? JSON.parse(raw) as Record<string, string> : defaultStudents;
    if ((db[username] || '') === password) {
      try {
        const profile = await withTimeout(
          supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle(),
          2500
        );
        const userId = profile.data?.id;
        return { valid: true, userId, source: 'legacy' };
      } catch {
        return { valid: true, source: 'legacy' };
      }
    }
  } catch {}

  return { valid: false, reason: rpcFailureReason || 'invalid' };
};

// ─── Register a student (called by teacher from ClassManagement) ─────────────

export const registerStudent = async (
  name: string,
  username: string,
  password: string,
  _email?: string
): Promise<{ success: boolean; userId?: string; reason?: 'exists' | 'quota' | 'supabase' }> => {
  // Use SECURITY DEFINER RPC function — bypasses Supabase Auth entirely.
  // No email validation, no rate limits, no confirmation emails.
  try {
    const { data, error } = await supabase.rpc('register_student', {
      p_name: name,
      p_username: username,
      p_password: password,
    });
    if (error) {
      console.error('[authService] register_student rpc error', error);
      return { success: false, reason: 'supabase' };
    }
    if (data?.error === 'username_taken') return { success: false, reason: 'exists' };
    if (!data?.id) return { success: false, reason: 'supabase' };

    // Cache plaintext password locally for credential display
    try {
      const raw = localStorage.getItem('studentDatabase');
      const db = raw ? JSON.parse(raw) as Record<string, string> : {};
      db[username] = password;
      localStorage.setItem('studentDatabase', JSON.stringify(db));
    } catch {}

    return { success: true, userId: data.id };
  } catch (e) {
    console.error('[authService] registerStudent exception', e);
    return { success: false, reason: 'supabase' };
  }
};

// ─── Generate username / password from a student's name ──────────────────────

export const generateStudentCredentials = (
  firstName: string,
  lastName: string,
  uniqueNumber: string
) => {
  const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const firstToken = normalize(firstName.split(/\s+/)[0] || 'student');
  const lastParts = lastName.trim().split(/\s+/);
  const lastToken = normalize(lastParts[lastParts.length - 1] || 'user');
  const username = `${firstToken}_${lastToken}`;
  const password = `${lastToken}${uniqueNumber}`;
  return { username, password };
};

// ─── Add a single credential to localStorage (legacy helper) ─────────────────

export const addStudentCredential = async (
  username: string,
  password: string
): Promise<{ success: boolean; error?: any }> => {
  try {
    const raw = localStorage.getItem('studentDatabase');
    const db = raw ? JSON.parse(raw) as Record<string, string> : defaultStudents;
    db[username] = password;
    localStorage.setItem('studentDatabase', JSON.stringify(db));
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
};
