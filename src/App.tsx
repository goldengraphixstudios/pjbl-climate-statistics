import { useState, useEffect } from 'react';
import { supabase, getUserProfileByIdentifier, signOut } from './services/supabaseClient';
import './styles/App.css';
import LandingPage from './pages/LandingPage';
import StudentLogin from './pages/auth/StudentLogin';
import TeacherLogin from './pages/auth/TeacherLogin';
import AdminLogin from './pages/auth/AdminLogin';
import CombinedPortal from './pages/portals/CombinedPortal';
import PreAssessment from './pages/student_sections/PreAssessment';
import Lesson1 from './pages/student_sections/Lesson1';
import Lesson2 from './pages/student_sections/Lesson2';
import Lesson3 from './pages/student_sections/Lesson3';
import PostAssessment from './pages/student_sections/PostAssessment';
import PerformanceSummary from './pages/student_sections/PerformanceSummary';
import { deleteClassAndStudents } from './services/classService';
import ErrorBoundary from './components/ErrorBoundary';

type UserRole = 'student' | 'teacher' | 'admin' | null;
interface AuthUser {
  id?: string; // supabase user id when available
  username: string;
  role: UserRole;
}

interface Class {
  id: string;
  grade: string;
  section: string;
  students: Student[];
}

interface Student {
  id: string;
  name: string;
  username: string;
  password: string;
  hasLoggedIn: boolean;
}

function App() {
  const [currentPage, setCurrentPage] = useState<string>('landing');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [portalTab, setPortalTab] = useState<'overview' | 'sections'>('overview');

  // Load data from localStorage on mount
  useEffect(() => {
    const savedClasses = localStorage.getItem('teacherClasses');
    if (savedClasses) {
      setClasses(JSON.parse(savedClasses));
    }
    // Check Supabase session and subscribe to auth changes
    (async () => {
      try {
        const sess = await supabase.auth.getSession();
        const session = sess.data?.session;
        if (session) {
          const user = session.user;
          // lookup profile for role/name
          const profile = await getUserProfileByIdentifier(user.email || user.id);
          const role = (profile && (profile.role as UserRole)) || 'student';
          setAuthUser({ id: user.id, username: profile?.email || profile?.name || user.id, role });
          setCurrentPage(`portal`); // all roles use unified portal
        }
      } catch (e) {}
    })();
  }, []);

  // Capture uncaught errors and promise rejections to localStorage for diagnostics
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        localStorage.setItem('lastAppError', JSON.stringify({ message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, stack: (event.error && event.error.stack) || null, time: Date.now() }));
      } catch {}
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason instanceof Error ? { message: event.reason.message, stack: event.reason.stack } : { reason: event.reason };
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

  // Save classes to localStorage whenever they change
  useEffect(() => {
    try {
      console.log('[App] saving classes to localStorage', classes);
      localStorage.setItem('teacherClasses', JSON.stringify(classes));
    } catch (err) {
      console.error('[App] failed saving classes', err);
    }
  }, [classes]);

  const handleRoleSelect = (role: string) => {
    setCurrentPage(`${role}-login`);
  };

  const handleLogin = (username: string, role: UserRole, id?: string) => {
    const userObj: AuthUser = { username, role };
    if (id) userObj.id = id;
    setAuthUser(userObj);
    setCurrentPage(`portal`);
  };

  const handleLogout = () => {
    // Sign out from Supabase if possible
    try { signOut().catch(() => {}); } catch (e) {}
    setAuthUser(null);
    setCurrentPage('landing');
  };

  const openStudentSection = (id: number) => {
    setCurrentPage(`student-section-${id}`);
  };

  const handleStudentLogin = (username: string, role: UserRole) => {
    // Mark student as logged in
    const updatedClasses = classes.map(classItem => ({
      ...classItem,
      students: classItem.students.map(student =>
        student.username === username ? { ...student, hasLoggedIn: true } : student
      )
    }));
    setClasses(updatedClasses);
    
    // Proceed with normal login
    setAuthUser({ username, role });
    // Ensure Student Portal opens on the Overview tab when logging in
    setPortalTab('overview');
    // If admin logs in via Student Login (bypass testing), open Student Portal
    if (role === 'admin') {
      setCurrentPage('student-portal');
    } else {
      setCurrentPage(`${role}-portal`);
    }
  };

  const handleCreateClass = (grade: string, section: string) => {
    const newClass: Class = {
      id: Date.now().toString(),
      grade,
      section,
      students: []
    };
    setClasses([...classes, newClass]);
  };

  const handleUpdateStudents = (classId: string, students: Student[]) => {
    console.log('[App] handleUpdateStudents called', { classId, students });
    setClasses(classes.map(c => c.id === classId ? { ...c, students } : c));
  };

  const handleDeleteClass = (classId: string) => {
    const classToDelete = classes.find(c => c.id === classId);
    if (classToDelete) {
      // Remove all students from the class-student mapping
      const studentUsernames = classToDelete.students.map((s: Student) => s.username);
      deleteClassAndStudents(classId, studentUsernames);
    }
    // Remove the class from state
    setClasses(classes.filter(c => c.id !== classId));
  };

  return (
    <div className="app">
      {currentPage === 'landing' && <LandingPage onRoleSelect={handleRoleSelect} />}
      {currentPage === 'student-login' && (
        <StudentLogin onLogin={handleStudentLogin} onBack={() => setCurrentPage('landing')} />
      )}
      {currentPage === 'teacher-login' && (
        <TeacherLogin onLogin={handleLogin} onBack={() => setCurrentPage('landing')} />
      )}
      {currentPage === 'admin-login' && (
        <AdminLogin onLogin={handleLogin} onBack={() => setCurrentPage('landing')} />
      )}
      {/* Unified Portal for all authenticated users */}
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
        <ErrorBoundary fallback={<div style={{padding:24}}><h2>Unable to load Lesson 1.</h2><p>Please go back and try again.</p><button className="back-btn" onClick={() => { setPortalTab('sections'); setCurrentPage('portal'); }}>Back to Dashboard</button></div>}>
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
      {/* Fallback: if an unknown page string is set, show portal */}
      {authUser && !(
        [
          'landing','student-login','teacher-login','admin-login',
          'portal',
          'student-section-1','student-section-2','student-section-3','student-section-4','student-section-5','student-section-6'
        ] as string[]
      ).includes(currentPage) && (
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
