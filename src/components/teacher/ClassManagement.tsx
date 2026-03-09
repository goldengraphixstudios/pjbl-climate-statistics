import React, { useState } from 'react';
import { deleteClassAndStudents, registerStudentToClass, cacheStudentPassword } from '../../services/classService';
import { generateStudentCredentials, registerStudent } from '../../services/authService';
import * as XLSX from 'xlsx';
import LoginStatusChart from './LoginStatusChart';
import '../../styles/ClassManagement.css';

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

interface ClassManagementProps {
  onCreateClass: (grade: string, section: string) => void;
  classes: Class[];
  onDeleteClass: (classId: string) => void;
  onUpdateStudents: (classId: string, students: Student[]) => void;
}

const ClassManagement: React.FC<ClassManagementProps> = ({ onCreateClass, classes, onDeleteClass, onUpdateStudents }) => {
  const [grade, setGrade] = useState('');
  const [section, setSection] = useState('');
  const [batchOpenByClass, setBatchOpenByClass] = useState<Record<string, boolean>>({});
  const [encodeTextByClass, setEncodeTextByClass] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (grade && section) {
      onCreateClass(grade, section);
      setGrade('');
      setSection('');
      alert('Class created successfully!');
    }
  };

  const handleDeleteClass = (classId: string, className: string, students: Student[]) => {
    if (window.confirm(`Are you sure you want to delete ${className}? This will also delete all ${students.length} student(s) and their data.`)) {
      // Clean up student-class mappings
      const studentUsernames = students.map(s => s.username);
      deleteClassAndStudents(classId, studentUsernames);
      
      // Delete the class
      onDeleteClass(classId);
      alert('Class and all associated student data deleted!');
    }
  };

  // login percentage computed inside chart usage

  const toggleBatchPanel = (classId: string) => {
    setBatchOpenByClass(prev => ({ ...prev, [classId]: !prev[classId] }));
  };

  const handleEncodeTextChange = (classId: string, value: string) => {
    setEncodeTextByClass(prev => ({ ...prev, [classId]: value }));
  };

  const enrollStudents = async (classItem: Class, names: string[]) => {
    try {
      const trimmed = names.map(n => n.trim()).filter(Boolean);
      if (trimmed.length === 0) return;

      const newStudents: Student[] = [];
      for (const name of trimmed) {
        const tokens = name.split(/\s+/).filter(Boolean);
        const firstName = tokens[0] || 'Student';
        const lastName = tokens[tokens.length - 1] || 'User';
        const uniqueNum = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        const { username, password } = generateStudentCredentials(firstName, lastName, uniqueNum);

        // Register in Supabase (with duplicate username handling)
        let finalUsername = username;
        let finalPassword = password;
        let registeredId: string | undefined;

        const res = await registerStudent(name, username, password);
        if (!res.success) {
          if (res.reason === 'exists') {
            let registered = false;
            for (let attempt = 0; attempt < 10; attempt++) {
              const altUnique = String(Math.floor(Math.random() * 90000) + 1000);
              const altCred = generateStudentCredentials(firstName, lastName, altUnique);
              const altRes = await registerStudent(name, altCred.username, altCred.password);
              if (altRes.success) {
                registered = true;
                finalUsername = altCred.username;
                finalPassword = altCred.password;
                registeredId = altRes.userId;
                break;
              }
            }
            if (!registered) throw new Error('register_failed');
          } else {
            throw new Error('register_failed');
          }
        } else {
          registeredId = res.userId;
        }

        // Cache the plaintext password locally (for credential display)
        cacheStudentPassword(finalUsername, finalPassword);

        // Link student to class in Supabase
        if (registeredId) {
          await registerStudentToClass(registeredId, classItem.id);
        }

        newStudents.push({
          id: registeredId || (Date.now().toString() + Math.random()),
          name,
          username: finalUsername,
          password: finalPassword,
          hasLoggedIn: false
        });
      }

      const updatedStudents = [...classItem.students, ...newStudents];
      console.log('[ClassManagement] enrolling students', { classId: classItem.id, newStudents, updatedStudents });
      onUpdateStudents(classItem.id, updatedStudents);
      alert(`Enrolled ${newStudents.length} student(s) to Grade ${classItem.grade} - Section ${classItem.section}.`);
    } catch (err: any) {
      console.error('Error enrolling students', err);
      try {
        if (err && err.message === 'localStorage_quota') {
          alert('Unable to enroll students: local storage quota exceeded. Please clear some data or use a different browser.');
        } else {
          alert('Failed to enroll students. See console for details.');
        }
      } catch {}
    }
  };

  const handleEncodeEnroll = async (e: React.FormEvent, classItem: Class) => {
    e.preventDefault();
    const raw = encodeTextByClass[classItem.id] || '';
    const names = raw.split(/[\n,\t;]+/);
    await enrollStudents(classItem, names);
    setEncodeTextByClass(prev => ({ ...prev, [classItem.id]: '' }));
    setBatchOpenByClass(prev => ({ ...prev, [classItem.id]: false }));
  };

  const handleUploadFile = async (file: File, classItem: Class) => {
    try {
        if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        const names = text.split(/[\n,\t;]+/);
        await enrollStudents(classItem, names);
      } else {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const names = rows.flat().map(cell => String(cell)).filter(val => val && val.trim().length > 0);
        await enrollStudents(classItem, names);
      }
      setBatchOpenByClass(prev => ({ ...prev, [classItem.id]: false }));
    } catch (err) {
      alert('Failed to parse the uploaded file. Please ensure it contains names in the first sheet or CSV rows.');
      console.error(err);
    }
  };

  // Single-add handler removed; batch enrollment covers adding multiple names

  return (
    <div className="class-management">
      <h2>Create New Class</h2>
      <form onSubmit={handleSubmit} className="class-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="grade">Grade Level</label>
            <select
              id="grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              required
            >
              <option value="">Select Grade Level</option>
              <option value="11">Grade 11</option>
              <option value="12">Grade 12</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="section">Section Name</label>
            <input
              id="section"
              type="text"
              placeholder="Enter section name (e.g., A, B, C)"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              required
            />
          </div>

          <div className="submit-wrap">
            <button type="submit" className="submit-button">Create Class</button>
          </div>
        </div>
      </form>

      <div className="classes-summary">
        <h3>Classes Summary</h3>
        {classes.length === 0 ? (
          <p className="no-classes">No classes created yet.</p>
        ) : (
          <div className="classes-grid">
            {classes.map((classItem) => (
              <div key={classItem.id} className="class-summary-card">
                <div className="class-header">
                  <h4>Grade {classItem.grade} - Section {classItem.section}</h4>
                  <div className="header-actions">
                    <button
                      className="batch-toggle"
                      onClick={() => toggleBatchPanel(classItem.id)}
                      title="Add Student"
                    >
                      + Add Student
                    </button>
                    <button
                      className="delete-class-btn"
                      onClick={() => handleDeleteClass(classItem.id, `Grade ${classItem.grade} - Section ${classItem.section}`, classItem.students)}
                      title="Delete class"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {batchOpenByClass[classItem.id] && (
                  <div className="batch-panel">
                    <div className="batch-option">
                      <h5>Encode List</h5>
                      <form onSubmit={(e) => handleEncodeEnroll(e, classItem)} className="batch-encode-form">
                        <textarea
                          className="batch-textarea"
                          placeholder="Paste names separated by comma, tab, or newline"
                          value={encodeTextByClass[classItem.id] || ''}
                          onChange={(e) => handleEncodeTextChange(classItem.id, e.target.value)}
                          rows={4}
                        />
                        <div className="panel-buttons">
                          <button type="submit" className="save-btn">Enroll</button>
                          <button type="button" className="cancel-btn" onClick={() => toggleBatchPanel(classItem.id)}>Cancel</button>
                        </div>
                      </form>
                    </div>
                    <div className="batch-option">
                      <h5>Upload File</h5>
                      <div className="batch-upload">
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadFile(f, classItem);
                          }}
                        />
                        <p className="hint">Accepts Excel (.xlsx/.xls) or CSV; first sheet/column entries treated as names.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="class-stats">
                  <div className="stat">
                    <span className="stat-label">Students Enrolled:</span>
                    <span className="stat-value">{classItem.students.length}</span>
                  </div>

                  <div className="stat">
                    <span className="stat-label">Login Status:</span>
                  </div>
                  
                  <LoginStatusChart 
                    totalStudents={classItem.students.length}
                    loggedInCount={classItem.students.filter(s => s.hasLoggedIn).length}
                  />

                  {/* Single add inline replaced by batch panel in header */}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassManagement;
