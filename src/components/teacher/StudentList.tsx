import React, { useState } from 'react';
import { removeStudentFromClass, resetStudentPassword } from '../../services/classService';
import LoginStatusChart from './LoginStatusChart';
import '../../styles/StudentList.css';

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

interface StudentListProps {
  classes: Class[];
  onUpdateStudents: (classId: string, students: Student[]) => void;
}

const StudentList: React.FC<StudentListProps> = ({ classes, onUpdateStudents }) => {
  const [selectedClassId, setSelectedClassId] = useState<string>('all');

  const selectedClass = selectedClassId === 'all' ? undefined : classes.find((c) => c.id === selectedClassId);
  const allStudents = classes.flatMap((c) => c.students);
  const currentStudents = selectedClass ? selectedClass.students : allStudents;

  const downloadCSV = () => {
    const rows = [['Class Grade', 'Class Section', 'Student Name', 'Username', 'Password', 'Status']];
    const list = selectedClass
      ? selectedClass.students.map((s) => ({ s, c: selectedClass }))
      : classes.flatMap((c) => c.students.map((s) => ({ s, c })));

    list.forEach(({ s, c }) => {
      rows.push([
        c.grade,
        c.section,
        s.name,
        s.username,
        s.password,
        s.hasLoggedIn ? 'Logged In' : 'Pending'
      ]);
    });

    const csv = rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const label = selectedClass ? `class_${selectedClass.grade}_${selectedClass.section}` : 'all_classes';
    a.download = `${label}_students.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalStudents = currentStudents.length;
  const loggedInCount = currentStudents.filter((s) => s.hasLoggedIn).length;

  const buildReplacementPassword = (student: Student) => {
    const parts = (student.name || '').trim().split(/\s+/).filter(Boolean);
    const lastToken = (parts[parts.length - 1] || 'student').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const suffix = String(Math.floor(Math.random() * 900) + 100);
    return `${lastToken}${suffix}`;
  };

  const handleDeleteStudent = async (studentId: string) => {
    const containingClass = selectedClass || classes.find((c) => c.students.some((s) => s.id === studentId));
    if (!containingClass) return;

    await removeStudentFromClass(studentId, containingClass.id);
    const updatedStudents = containingClass.students.filter((s) => s.id !== studentId);
    onUpdateStudents(containingClass.id, updatedStudents);
  };

  const handleResetPassword = async (student: Student) => {
    const containingClass = selectedClass || classes.find((c) => c.students.some((s) => s.id === student.id));
    if (!containingClass) return;

    const suggested = buildReplacementPassword(student);
    const entered = window.prompt(`Enter a new password for ${student.username}:`, suggested);
    if (!entered || !entered.trim()) return;

    const newPassword = entered.trim();
    const success = await resetStudentPassword(student.id, student.username, newPassword);
    if (!success) {
      window.alert('Failed to reset password. Run the Supabase reset password SQL first, then try again.');
      return;
    }

    const updatedStudents = containingClass.students.map((s) =>
      s.id === student.id ? { ...s, password: newPassword } : s
    );
    onUpdateStudents(containingClass.id, updatedStudents);
    window.alert(`New password for ${student.username}: ${newPassword}`);
  };

  return (
    <div className="student-list-container">
      <h2>List of Classes</h2>

      {classes.length === 0 ? (
        <p className="no-data">No classes created yet. Go to "Create Class" to get started.</p>
      ) : (
        <>
          <div className="class-selector">
            <label>Select Class:</label>
            <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Grade {c.grade} - Section {c.section}
                </option>
              ))}
            </select>
            <button className="download-btn" onClick={downloadCSV}>Download CSV</button>
          </div>

          <div className="login-stats">
            <div className="stat-card">
              <h3>Login Status</h3>
              <LoginStatusChart totalStudents={totalStudents} loggedInCount={loggedInCount} />
            </div>
          </div>

          <table className="students-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Username</th>
                <th>Password</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {currentStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="no-data">No students enrolled yet.</td>
                </tr>
              ) : (
                currentStudents.map((student) => (
                  <tr key={student.id} className={student.hasLoggedIn ? 'logged-in' : 'not-logged-in'}>
                    <td>{student.name}</td>
                    <td className="code">{student.username}</td>
                    <td className="code">
                      {student.password ? (
                        student.password
                      ) : (
                        <button
                          type="button"
                          className="download-btn"
                          style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => handleResetPassword(student)}
                        >
                          Reissue Password
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${student.hasLoggedIn ? 'active' : 'inactive'}`}>
                        {student.hasLoggedIn ? 'Logged In' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="download-btn"
                          style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => handleResetPassword(student)}
                          title="Reset password"
                        >
                          Reset PW
                        </button>
                        <button
                          className="delete-btn"
                          onClick={() => handleDeleteStudent(student.id)}
                          title="Delete student"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default StudentList;
