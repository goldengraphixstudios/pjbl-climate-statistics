import { supabase } from './supabaseClient';

export interface Profile {
  id: string;
  name: string;
  email: string;
  username: string;
  role: 'student' | 'teacher' | 'admin';
  section?: string | null;
}

export async function getMyProfile(): Promise<Profile | null> {
  // Prefer the app-level user id we store locally. Staff accounts can have an
  // auth.users UUID that differs from public.users.id, so fall back to email.
  const userRes = await supabase.auth.getUser();
  const sessionUser = userRes.data?.user || null;
  const storedId = localStorage.getItem('currentUserId') || null;
  const identifier = storedId || sessionUser?.id || null;

  if (identifier) {
    const byId = await supabase
      .from('users')
      .select('id,name,email,username,role,section')
      .eq('id', identifier)
      .maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) return byId.data as Profile | null;
  }

  if (!sessionUser?.email) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id,name,email,username,role,section')
    .eq('email', sessionUser.email)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function listStudents(section?: string): Promise<Profile[]> {
  let query = supabase.from('users').select('id,name,username,role,section').eq('role', 'student');
  if (section) {
    query = query.eq('section', section);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as Profile[]) || [];
}

export async function getStudentProfile(student_id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id,name,email,username,role,section')
    .eq('id', student_id)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}
