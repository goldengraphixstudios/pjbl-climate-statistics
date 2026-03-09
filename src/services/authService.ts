import { supabase, signIn, signUp, signOut } from './supabaseClient';

export { signOut };

// Keep a minimal fallback for default demo accounts.
const defaultStudents: Record<string, string> = {
  'john_doe': 'doe123',
  'jane_smith': 'smith456',
  'student_001': 'pass001',
  'test_user': 'testpass123'
};

// ─── Validate credentials & return userId ────────────────────────────────────

export const validateStudentCredentials = async (
  username: string,
  password: string
): Promise<{ valid: boolean; userId?: string; email?: string }> => {
  // Direct email sign-in
  if (username.includes('@')) {
    try {
      const res = await signIn(username, password);
      if (!res.error && res.data?.session) {
        return { valid: true, userId: res.data.session.user.id, email: username };
      }
    } catch {}
    return { valid: false };
  }

  // Username → look up email in users table → Supabase signIn
  try {
    const profile = await supabase
      .from('users')
      .select('id, email, username')
      .eq('username', username)
      .maybeSingle();

    if (!profile.error && profile.data?.email) {
      const res = await signIn(profile.data.email, password);
      if (!res.error && res.data?.session) {
        return { valid: true, userId: res.data.session.user.id, email: profile.data.email };
      }
    }
  } catch {}

  // Legacy localStorage fallback (for demo accounts that pre-date Supabase)
  try {
    const raw = localStorage.getItem('studentDatabase');
    const db = raw ? JSON.parse(raw) as Record<string, string> : defaultStudents;
    if ((db[username] || '') === password) {
      // Try to get the Supabase ID even for legacy accounts
      try {
        const profile = await supabase
          .from('users')
          .select('id')
          .eq('username', username)
          .maybeSingle();
        const userId = profile.data?.id;
        return { valid: true, userId };
      } catch {
        return { valid: true };
      }
    }
  } catch {}

  return { valid: false };
};

// ─── Register a student (called by teacher from ClassManagement) ─────────────

export const registerStudent = async (
  name: string,
  username: string,
  password: string,
  email?: string
): Promise<{ success: boolean; userId?: string; reason?: 'exists' | 'quota' | 'supabase' }> => {

  // Derive email: use provided email, or generate a synthetic address so
  // Supabase Auth can create an account without requiring a real email.
  const authEmail = email && email.includes('@') ? email : `${username}@pjbl.edu.ph`;

  // Check if username already exists in users table
  try {
    const existing = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (existing.data) {
      return { success: false, reason: 'exists' };
    }
  } catch {}

  // Create Supabase Auth account
  try {
    const res = await signUp(authEmail, password);
    if (res.error) {
      // If user already exists in Auth but not in our users table, try to recover
      if (res.error.message?.includes('already registered')) {
        // Attempt sign-in to get existing user id
        const loginRes = await signIn(authEmail, password);
        if (!loginRes.error && loginRes.data?.session) {
          const userId = loginRes.data.session.user.id;
          await supabase.from('users').upsert({
            id: userId,
            name,
            email: authEmail,
            username,
            role: 'student',
          }, { onConflict: 'id' });
          return { success: true, userId };
        }
      }
      console.error('[authService] signUp error', res.error);
      return { success: false, reason: 'supabase' };
    }

    const userId = res.data?.user?.id;

    // Insert profile row into public.users
    if (userId) {
      const { error: profileErr } = await supabase.from('users').upsert({
        id: userId,
        name,
        email: authEmail,
        username,
        role: 'student',
      }, { onConflict: 'id' });
      if (profileErr) {
        console.error('[authService] profile insert error', profileErr);
      }
    }

    // Also keep legacy localStorage entry so existing fallback logic still works
    try {
      const raw = localStorage.getItem('studentDatabase');
      const db = raw ? JSON.parse(raw) as Record<string, string> : {};
      db[username] = password;
      localStorage.setItem('studentDatabase', JSON.stringify(db));
    } catch {}

    return { success: true, userId };
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
