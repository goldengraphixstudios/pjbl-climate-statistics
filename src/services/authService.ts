import { supabase, signIn, signUp, signOut } from './supabaseClient';

// Keep a minimal fallback for generating credentials locally when needed.
const defaultStudents: Record<string, string> = {
  'john_doe': 'doe123',
  'jane_smith': 'smith456',
  'student_001': 'pass001',
  'test_user': 'testpass123'
};

export const validateStudentCredentials = async (username: string, password: string): Promise<boolean> => {
  // Prefer Supabase Auth when an email is provided
  if (username.includes('@')) {
    try {
      const res = await signIn(username, password);
      if (res.error) return false;
      return !!res.data?.session;
    } catch (e) {
      return false;
    }
  }

  // If the user provided a username (not an email), try to look up the linked email
  // in the `users` profile table and attempt Supabase sign-in with that email.
  try {
    const profile = await supabase.from('users').select('email').eq('username', username).maybeSingle();
    if (!profile.error && profile.data?.email) {
      try {
        const res = await signIn(profile.data.email, password);
        if (!res.error && res.data?.session) return true;
      } catch (e) {
        // fall through to legacy/local fallback
      }
    }
  } catch (e) {
    // fall through to legacy/local fallback
  }

  // Legacy fallback: try local storage / default map
  try {
    const raw = localStorage.getItem('studentDatabase');
    const db = raw ? JSON.parse(raw) as Record<string,string> : defaultStudents;
    if ((db[username] || '') === password) return true;
  } catch (e) {
    // ignore
  }

  return false;
};

export const registerStudent = async (emailOrName: string, usernameOrEmail: string, password: string): Promise<{ success: boolean; reason?: 'exists' | 'quota' | 'supabase' }> => {
  // If an email was supplied, try Supabase signUp
  try {
    if (usernameOrEmail.includes('@')) {
      const res = await signUp(usernameOrEmail, password);
      if (res.error) return { success: false, reason: 'supabase' };
      // Optionally insert profile row into `users` table
      try {
        await supabase.from('users').insert({ email: usernameOrEmail, name: emailOrName, role: 'student' });
      } catch (_) {}
      return { success: true };
    }
  } catch (e) {
    return { success: false, reason: 'supabase' };
  }

  // Legacy: register locally
  try {
    const raw = localStorage.getItem('studentDatabase');
    const db = raw ? JSON.parse(raw) as Record<string,string> : defaultStudents;
    if (db[usernameOrEmail]) return { success: false, reason: 'exists' };
    db[usernameOrEmail] = password;
    localStorage.setItem('studentDatabase', JSON.stringify(db));
    return { success: true };
  } catch (e) {
    return { success: false, reason: 'quota' };
  }
};

export const generateStudentCredentials = (firstName: string, lastName: string, uniqueNumber: string) => {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const firstToken = normalize(firstName.split(/\s+/)[0] || 'student');
  const lastParts = lastName.trim().split(/\s+/);
  const lastToken = normalize(lastParts[lastParts.length - 1] || 'user');
  const username = `${firstToken}_${lastToken}`;
  const password = `${lastToken}${uniqueNumber}`;
  return { username, password };
};

export const addStudentCredential = async (username: string, password: string): Promise<{ success: boolean; error?: any }> => {
  try {
    const raw = localStorage.getItem('studentDatabase');
    const db = raw ? JSON.parse(raw) as Record<string,string> : defaultStudents;
    db[username] = password;
    localStorage.setItem('studentDatabase', JSON.stringify(db));
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
};
