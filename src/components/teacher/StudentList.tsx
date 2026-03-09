import React, { useState } from 'react';
import { removeStudentFromClass } from '../../services/classService';
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

  const selectedClass = selectedClassId === 'all' ? undefined : classes.find(c => c.id === selectedClassId);
  const allStudents = classes.flatMap(c => c.students);
    const downloadCSV = () => {
      const rows = [
        ['Class Grade', 'Class Section', 'Student Name', 'Username', 'Password', 'Status']
      ];
      const list = selectedClass ? selectedClass.students.map(s => ({ s, c: selectedClass })) : classes.flatMap(c => c.students.map(s => ({ s, c })));
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
      const csv = rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const label = selectedClass ? `class_${selectedClass.grade}_${selectedClass.section}` : 'all_classes';
      a.download = `${label}_students.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };
  const totalStudents = selectedClass ? selectedClass.students.length : allStudents.length;
  const loggedInCount = selectedClass
    ? selectedClass.students.filter(s => s.hasLoggedIn).length
    : allStudents.filter(s => s.hasLoggedIn).length;

  // Add Student functionality moved to ClassManagement per class card

  const handleDeleteStudent = async (studentId: string) => {
    const containingClass = selectedClass || classes.find(c => c.students.some(s => s.id === studentId));
    if (!containingClass) return;
    // Remove from Supabase class_students
    await removeStudentFromClass(studentId, containingClass.id);
    const updatedStudents = containingClass.students.filter(s => s.id !== studentId);
    onUpdateStudents(containingClass.id, updatedStudents);
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
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="all">All Classes</option>
              {classes.map(c => (
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
              {(selectedClass ? selectedClass.students : allStudents).length === 0 ? (
                <tr>
                  <td colSpan={5} className="no-data">No students enrolled yet.</td>
                </tr>
              ) : (
                (selectedClass ? selectedClass.students : allStudents).map(student => (
                  <tr key={student.id} className={student.hasLoggedIn ? 'logged-in' : 'not-logged-in'}>
                    <td>{student.name}</td>
                    <td className="code">{student.username}</td>
                    <td className="code">{student.password}</td>
                    <td>
                      <span className={`status-badge ${student.hasLoggedIn ? 'active' : 'inactive'}`}>
                        {student.hasLoggedIn ? '✓ Logged In' : '⏳ Pending'}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="delete-btn" 
                        onClick={() => handleDeleteStudent(student.id)}
                        title="Delete student"
                      >
                        🗑️
                      </button>
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
