// Service to manage classes and student-class relationships via Supabase
// localStorage is used as a read-through cache only; Supabase is the source of truth

import { supabase } from './supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  username: string;
  password?: string; // stored locally only; not in DB
  section?: string;
  hasLoggedIn?: boolean;
}

export interface ClassRow {
  id: string;
  name: string;
  grade: string;
  section: string;
  teacher_id?: string;
  students: StudentRow[];
}

// ─── Local password cache ─────────────────────────────────────────────────────
// Supabase doesn't store plaintext passwords; we cache them locally so the
// teacher can display / copy credentials after enrollment.
//
// There are two legacy local stores in circulation:
// - studentPasswordCache: teacher-side credential display cache
// - studentDatabase: older login/demo credential cache
//
// The class list should recover from either one so existing enrolled accounts
// do not show a blank password column after refresh/browser changes.

const PW_CACHE_KEY = 'studentPasswordCache';
const LEGACY_STUDENT_DB_KEY = 'studentDatabase';

const getLegacyStudentDb = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(LEGACY_STUDENT_DB_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const getPasswordCache = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(PW_CACHE_KEY);
    const primary = raw ? JSON.parse(raw) : {};
    const legacy = getLegacyStudentDb();
    return {
      ...(legacy && typeof legacy === 'object' ? legacy : {}),
      ...(primary && typeof primary === 'object' ? primary : {})
    };
  } catch {
    return getLegacyStudentDb();
  }
};

export const savePasswordCache = (cache: Record<string, string>) => {
  try {
    localStorage.setItem(PW_CACHE_KEY, JSON.stringify(cache));
  } catch {}
};

export const cacheStudentPassword = (username: string, password: string) => {
  const cache = getPasswordCache();
  cache[username] = password;
  savePasswordCache(cache);
  try {
    const legacy = getLegacyStudentDb();
    legacy[username] = password;
    localStorage.setItem(LEGACY_STUDENT_DB_KEY, JSON.stringify(legacy));
  } catch {}
};

export const getStudentPassword = (username: string): string => {
  return getPasswordCache()[username] || '';
};

export const resetStudentPassword = async (
  studentId: string,
  username: string,
  newPassword: string
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('reset_student_password', {
    p_student_id: studentId,
    p_new_password: newPassword
  });

  if (error || data?.error) {
    console.error('[classService] resetStudentPassword error', error || data?.error);
    return false;
  }

  cacheStudentPassword(username, newPassword);
  return true;
};

// ─── Class CRUD ───────────────────────────────────────────────────────────────

export const createClass = async (
  grade: string,
  section: string,
  teacherId?: string
): Promise<{ id: string } | null> => {
  const name = `Grade ${grade} - ${section}`;
  const payload: any = { name, grade };
  if (teacherId) payload.teacher_id = teacherId;

  const { data, error } = await supabase
    .from('classes')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('[classService] createClass error', error);
    return null;
  }
  return data;
};

export const getClassesByTeacher = async (teacherId: string): Promise<ClassRow[]> => {
  const { data: classRows, error } = await supabase
    .from('classes')
    .select('id, name, grade, teacher_id')
    .eq('teacher_id', teacherId)
    .order('created_at');

  if (error) {
    console.error('[classService] getClassesByTeacher error', error);
    return [];
  }
  if (!classRows || classRows.length === 0) return [];

  const classIds = classRows.map((c: any) => c.id);

  // Fetch all class_students for these classes
  const { data: csRows } = await supabase
    .from('class_students')
    .select('class_id, student_id')
    .in('class_id', classIds);

  const studentIds = [...new Set((csRows || []).map((r: any) => r.student_id))];

  let userMap: Record<string, any> = {};
  if (studentIds.length > 0) {
    const { data: userRows } = await supabase
      .from('users')
      .select('id, name, email, username, section')
      .in('id', studentIds);
    (userRows || []).forEach((u: any) => { userMap[u.id] = u; });
  }

  const pwCache = getPasswordCache();

  return classRows.map((c: any) => {
    const enrolledIds = (csRows || [])
      .filter((r: any) => r.class_id === c.id)
      .map((r: any) => r.student_id);

    const students: StudentRow[] = enrolledIds
      .map((sid: string) => {
        const u = userMap[sid];
        if (!u) return null;
        return {
          id: u.id,
          name: u.name || u.username || '',
          email: u.email || '',
          username: u.username || '',
          password: pwCache[u.username] || '',
          section: u.section || '',
          hasLoggedIn: false,
        } as StudentRow;
      })
      .filter(Boolean) as StudentRow[];

    const nameParts = c.name?.split(' - ') || [];
    const section = nameParts.length >= 2 ? nameParts.slice(1).join(' - ') : c.name;
    return {
      id: c.id,
      name: c.name,
      grade: c.grade || '',
      section,
      teacher_id: c.teacher_id,
      students,
    } as ClassRow;
  });
};

export const getAllClasses = async (): Promise<ClassRow[]> => {
  const { data: classRows, error } = await supabase
    .from('classes')
    .select('id, name, grade, teacher_id')
    .order('created_at');

  if (error) {
    console.error('[classService] getAllClasses error', error);
    return [];
  }
  if (!classRows || classRows.length === 0) return [];

  const classIds = classRows.map((c: any) => c.id);

  const { data: csRows } = await supabase
    .from('class_students')
    .select('class_id, student_id')
    .in('class_id', classIds);

  const studentIds = [...new Set((csRows || []).map((r: any) => r.student_id))];

  let userMap: Record<string, any> = {};
  if (studentIds.length > 0) {
    const { data: userRows } = await supabase
      .from('users')
      .select('id, name, email, username, section')
      .in('id', studentIds);
    (userRows || []).forEach((u: any) => { userMap[u.id] = u; });
  }

  const pwCache = getPasswordCache();

  return classRows.map((c: any) => {
    const enrolledIds = (csRows || [])
      .filter((r: any) => r.class_id === c.id)
      .map((r: any) => r.student_id);

    const students: StudentRow[] = enrolledIds
      .map((sid: string) => {
        const u = userMap[sid];
        if (!u) return null;
        return {
          id: u.id,
          name: u.name || u.username || '',
          email: u.email || '',
          username: u.username || '',
          password: pwCache[u.username] || '',
          section: u.section || '',
          hasLoggedIn: false,
        } as StudentRow;
      })
      .filter(Boolean) as StudentRow[];

    const nameParts = c.name?.split(' - ') || [];
    const section = nameParts.length >= 2 ? nameParts.slice(1).join(' - ') : c.name;
    return {
      id: c.id,
      name: c.name,
      grade: c.grade || '',
      section,
      teacher_id: c.teacher_id,
      students,
    } as ClassRow;
  });
};

export const deleteClassFromSupabase = async (classId: string): Promise<void> => {
  // class_students rows cascade-delete automatically
  const { error } = await supabase.from('classes').delete().eq('id', classId);
  if (error) console.error('[classService] deleteClass error', error);
};

// ─── Student enrollment ───────────────────────────────────────────────────────

export const registerStudentToClass = async (
  studentId: string,
  classId: string
): Promise<void> => {
  const { error } = await supabase
    .from('class_students')
    .upsert({ class_id: classId, student_id: studentId }, { onConflict: 'class_id,student_id' });
  if (error) console.error('[classService] registerStudentToClass error', error);
};

export const removeStudentFromClass = async (
  studentId: string,
  classId: string
): Promise<void> => {
  const { error } = await supabase
    .from('class_students')
    .delete()
    .eq('class_id', classId)
    .eq('student_id', studentId);
  if (error) console.error('[classService] removeStudentFromClass error', error);
};

// ─── Legacy localStorage stubs (kept for backward compat during transition) ──

const STUDENT_CLASS_MAP_KEY = 'studentClassMap';

interface StudentClassMap {
  [username: string]: string;
}

export const getStudentClassMap = (): StudentClassMap => {
  try {
    const stored = localStorage.getItem(STUDENT_CLASS_MAP_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

export const saveStudentClassMap = (map: StudentClassMap) => {
  try { localStorage.setItem(STUDENT_CLASS_MAP_KEY, JSON.stringify(map)); } catch {}
};

export const getStudentClassId = (username: string): string | null => {
  return getStudentClassMap()[username] || null;
};

export const deleteClassAndStudents = (_classId: string, studentUsernames: string[]) => {
  const map = getStudentClassMap();
  studentUsernames.forEach(u => { delete map[u]; });
  saveStudentClassMap(map);
};
