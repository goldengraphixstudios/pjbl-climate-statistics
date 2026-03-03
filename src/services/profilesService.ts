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
  const userRes = await supabase.auth.getUser();
  const uid = userRes.data?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id,name,email,username,role,section')
    .eq('id', uid)
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
