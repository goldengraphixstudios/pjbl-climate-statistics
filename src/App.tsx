import { useState, useEffect } from 'react';
import { supabase, getUserProfileByIdentifier, signOut } from './services/supabaseClient';
import './styles/App.css';
import LandingPage from './pages/LandingPage';
import StudentLogin from './pages/auth/StudentLogin';
import AdminLogin from './pages/auth/AdminLogin';
import CombinedPortal from './pages/portals/CombinedPortal';
import PreAssessment from './pages/student_sections/PreAssessment';
import Lesson1 from './pages/student_sections/Lesson1';
import Lesson2 from './pages/student_sections/Lesson2';
import Lesson3 from './pages/student_sections/Lesson3';
import PostAssessment from './pages/student_sections/PostAssessment';
import PerformanceSummary from './pages/student_sections/PerformanceSummary';
import { getAllClasses, deleteClassFromSupabase, createClass, ClassRow } from './services/classService';
import ErrorBoundary from './components/ErrorBoundary';

type UserRole = 'student' | 'teacher' | 'admin' | null;
interface AuthUser {
  id?: string;
  username: string;
  role: UserRole;
}

// Legacy shape kept for props compatibility with existing components
interface LegacyStudent {
  id: string;
  name: string;
  username: string;
  password: string;
  hasLoggedIn: boolean;
}

interface LegacyClass {
  id: string;
  grade: string;
  section: string;
  students: LegacyStudent[];
}

const LOGIN_STATUS_KEY = 'studentLoginStatus';

function getStudentLoginStatusMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LOGIN_STATUS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStudentLoginStatus(username: string) {
  try {
    const current = getStudentLoginStatusMap();
    current[username] = true;
    localStorage.setItem(LOGIN_STATUS_KEY, JSON.stringify(current));
  } catch {}
}

function toLegacyClass(c: ClassRow): LegacyClass {
  const loginStatus = getStudentLoginStatusMap();
  return {
    id: c.id,
    grade: c.grade || '',
    section: c.section || '',
    students: c.students.map(s => ({
      id: s.id,
      name: s.name,
      username: s.username,
      password: s.password || '',
      hasLoggedIn: !!(s.hasLoggedIn || loginStatus[s.username]),
    })),
  };
}

function App() {
  const [currentPage, setCurrentPage] = useState<string>('landing');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [classes, setClasses] = useState<LegacyClass[]>([]);
  const [portalTab, setPortalTab] = useState<'overview' | 'sections'>('overview');

  // Load classes from Supabase on mount
  const loadClasses = async () => {
    try {
      const rows = await getAllClasses();
      const legacyRows = rows.map(toLegacyClass);
      setClasses(legacyRows);
      try {
        localStorage.setItem('teacherClasses', JSON.stringify(legacyRows));
      } catch {}
    } catch (e) {
      console.error('[App] loadClasses error', e);
      // Fall back to localStorage if Supabase is unavailable
      try {
        const saved = localStorage.getItem('teacherClasses');
        if (saved) setClasses(JSON.parse(saved));
      } catch {}
    }
  };

  useEffect(() => {
    // Check Supabase session and subscribe to auth changes
    (async () => {
      try {
        const sess = await supabase.auth.getSession();
        const session = sess.data?.session;
        if (session) {
          const user = session.user;
          const profile = await getUserProfileByIdentifier(user.email || user.id);
          const role = (profile && (profile.role as UserRole)) || 'student';
          setAuthUser({ id: user.id, username: profile?.username || profile?.email || user.id, role });
          setCurrentPage('portal');
        }
      } catch (e) {}
    })();

    loadClasses();
  }, []);

  useEffect(() => {
    if (!authUser) return;

    const refresh = () => {
      loadClasses().catch((e) => console.error('[App] periodic loadClasses error', e));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    const intervalId = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authUser?.id, authUser?.role]);

  // Capture uncaught errors to localStorage for diagnostics
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        localStorage.setItem('lastAppError', JSON.stringify({
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          stack: (event.error && event.error.stack) || null,
          time: Date.now()
        }));
      } catch {}
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason instanceof Error
          ? { message: event.reason.message, stack: event.reason.stack }
          : { reason: event.reason };
        localStorage.setItem('lastAppError', JSON.stringify({ promiseRejection: true, ...reason, time: Date.now() }));
      } catch {}
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection as any);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection as any);
    };
  }, []);

  const handleRoleSelect = (role: string) => {
    setCurrentPage(`${role}-login`);
  };

  const handleLogin = (username: string, role: UserRole, id?: string) => {
    const userObj: AuthUser = { username, role };
    if (id) {
      userObj.id = id;
      localStorage.setItem('currentUserId', id);
    }
    setAuthUser(userObj);
    setCurrentPage('portal');
  };

  const handleLogout = () => {
    try { signOut().catch(() => {}); } catch {}
    localStorage.removeItem('currentUserId');
    setAuthUser(null);
    setCurrentPage('landing');
  };

  const openStudentSection = (id: number) => {
    setCurrentPage(`student-section-${id}`);
  };

  const handleStudentLogin = (username: string, role: UserRole, id?: string) => {
    saveStudentLoginStatus(username);
    // Mark student as logged in in local state
    setClasses(prev => prev.map(cls => ({
      ...cls,
      students: cls.students.map(s =>
        s.username === username ? { ...s, hasLoggedIn: true } : s
      )
    })));

    const userObj: AuthUser = { username, role };
    if (id) {
      userObj.id = id;
      localStorage.setItem('currentUserId', id);
    }
    setAuthUser(userObj);
    setPortalTab('overview');

    if (role === 'admin') {
      setCurrentPage('student-portal');
    } else {
      setCurrentPage('portal');
    }
  };

  const handleCreateClass = async (grade: string, section: string) => {
    // Get teacher id from authUser if available
    const teacherId = authUser?.id;
    const result = await createClass(grade, section, teacherId);
    if (result) {
      // Reload classes from Supabase to stay in sync
      await loadClasses();
    } else {
      // Fallback: optimistic local add
      const newClass: LegacyClass = {
        id: Date.now().toString(),
        grade,
        section,
        students: []
      };
      setClasses(prev => [...prev, newClass]);
    }
  };

  const handleUpdateStudents = async (classId: string, students: LegacyStudent[]) => {
    // Update local state immediately for responsiveness
    setClasses(prev => prev.map(c => c.id === classId ? { ...c, students } : c));
    // Re-sync from Supabase after a short delay to pick up any DB-side changes
    setTimeout(() => loadClasses(), 1500);
  };

  const handleDeleteClass = async (classId: string) => {
    await deleteClassFromSupabase(classId);
    setClasses(prev => prev.filter(c => c.id !== classId));
  };

  const knownPages = [
    'landing', 'student-login', 'admin-login',
    'portal',
    'student-section-1', 'student-section-2', 'student-section-3',
    'student-section-4', 'student-section-5', 'student-section-6'
  ];

  return (
    <div className="app">
      {currentPage === 'landing' && <LandingPage onRoleSelect={handleRoleSelect} />}
      {currentPage === 'student-login' && (
        <StudentLogin onLogin={handleStudentLogin} onBack={() => setCurrentPage('landing')} />
      )}
      {currentPage === 'admin-login' && (
        <AdminLogin onLogin={handleLogin} onBack={() => setCurrentPage('landing')} />
      )}
      {currentPage === 'portal' && authUser && (
        <CombinedPortal
          user={authUser}
          onLogout={handleLogout}
          classes={classes}
          onCreateClass={handleCreateClass}
          onUpdateStudents={handleUpdateStudents}
          onDeleteClass={handleDeleteClass}
          onOpenSection={openStudentSection}
          initialTab={portalTab}
        />
      )}
      {currentPage === 'student-section-1' && authUser && (
        <PreAssessment user={authUser} onBack={() => setCurrentPage('portal')} />
      )}
      {currentPage === 'student-section-6' && authUser && (
        <PerformanceSummary user={authUser} onBack={() => { setPortalTab('sections'); setCurrentPage('portal'); }} />
      )}
      {currentPage === 'student-section-2' && authUser && (
        <ErrorBoundary fallback={
          <div style={{ padding: 24 }}>
            <h2>Unable to load Lesson 1.</h2>
            <p>Please go back and try again.</p>
            <button className="back-btn" onClick={() => { setPortalTab('sections'); setCurrentPage('portal'); }}>
              Back to Dashboard
            </button>
          </div>
        }>
          <Lesson1 user={authUser} onBack={() => { setPortalTab('sections'); setCurrentPage('portal'); }} />
        </ErrorBoundary>
      )}
      {currentPage === 'student-section-3' && authUser && (
        <Lesson2 user={authUser} onBack={() => { setPortalTab('sections'); setCurrentPage('portal'); }} />
      )}
      {currentPage === 'student-section-4' && authUser && (
        <Lesson3 user={authUser} onBack={() => { setPortalTab('sections'); setCurrentPage('portal'); }} />
      )}
      {currentPage === 'student-section-5' && authUser && (
        <PostAssessment user={authUser} onBack={() => setCurrentPage('portal')} />
      )}
      {/* Fallback: unknown page → portal */}
      {authUser && !knownPages.includes(currentPage) && (
        <CombinedPortal
          user={authUser}
          onLogout={handleLogout}
          classes={classes}
          onCreateClass={handleCreateClass}
          onUpdateStudents={handleUpdateStudents}
          onDeleteClass={handleDeleteClass}
          onOpenSection={openStudentSection}
          initialTab={portalTab}
        />
      )}
    </div>
  );
}

export default App;
