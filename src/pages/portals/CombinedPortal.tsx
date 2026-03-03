import React, { useState } from 'react';
import { HeaderStudentIcon, HeaderTeacherIcon, HeaderAdminIcon } from '../../components/RoleIcons';
import StudentPortal from './StudentPortal';
import TeacherPortal from './TeacherPortal';
import AdminPortal from './AdminPortal';
import '../../styles/StudentPortal.css';
import '../../styles/TeacherPortal.css';
import '../../styles/AdminPortal.css';

interface AuthUser {
  username: string;
  role: 'student' | 'teacher' | 'admin' | null;
}

interface Student {
  id: string;
  name: string;
  username: string;
  password: string;
  hasLoggedIn: boolean;
}

interface Class {
  id: string;
  grade: string;
  section: string;
  students: Student[];
}

interface CombinedPortalProps {
  user: AuthUser;
  onLogout: () => void;
  classes: Class[];
  onCreateClass?: (grade: string, section: string) => void;
  onUpdateStudents?: (classId: string, students: Student[]) => void;
  onDeleteClass?: (classId: string) => void;
  onOpenSection?: (sectionId: number) => void;
  initialTab?: 'overview' | 'sections';
}

/**
 * CombinedPortal renders the appropriate portal based on user role:
 * - Students see StudentPortal with lessons, assessments, and performance
 * - Teachers see TeacherPortal with class/student management and performance tracking
 * - Admins see AdminPortal with analytics and reporting
 */
const CombinedPortal: React.FC<CombinedPortalProps> = ({
  user,
  onLogout,
  classes,
  onCreateClass,
  onUpdateStudents,
  onDeleteClass,
  onOpenSection,
  initialTab
}) => {
  if (!user || !user.role) {
    return (
      <div className="portal-container">
        <header className="portal-header">
          <h1>Unauthorized</h1>
        </header>
        <main className="portal-content">
          <p>You do not have a valid role. Please log in again.</p>
        </main>
      </div>
    );
  }

  if (user.role === 'student') {
    return <StudentPortal user={user} onLogout={onLogout} classes={classes} onOpenSection={onOpenSection} initialTab={initialTab} />;
  }

  if (user.role === 'teacher') {
    return (
      <TeacherPortal
        user={user}
        onLogout={onLogout}
        classes={classes}
        onCreateClass={onCreateClass || (() => {})}
        onUpdateStudents={onUpdateStudents || (() => {})}
        onDeleteClass={onDeleteClass}
      />
    );
  }

  if (user.role === 'admin') {
    return <AdminPortal user={user} onLogout={onLogout} classes={classes} />;
  }

  return (
    <div className="portal-container">
      <header className="portal-header">
        <h1>Unknown Role</h1>
      </header>
      <main className="portal-content">
        <p>Your role "{user.role}" is not recognized.</p>
      </main>
    </div>
  );
};

export default CombinedPortal;
