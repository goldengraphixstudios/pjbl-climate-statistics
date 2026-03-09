import React, { useState } from 'react';
import { HeaderTeacherIcon } from '../../components/RoleIcons';
import ClassManagement from '../../components/teacher/ClassManagement';
import StudentList from '../../components/teacher/StudentList';
import PerformanceSummary from './PerformanceSummary';
import '../../styles/TeacherPortal.css';

interface AuthUser {
  id?: string;
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

interface TeacherPortalProps {
  user: AuthUser;
  onLogout: () => void;
  classes: Class[];
  onCreateClass: (grade: string, section: string) => void;
  onUpdateStudents: (classId: string, students: Student[]) => void;
  onDeleteClass?: (classId: string) => void;
}

const TeacherPortal: React.FC<TeacherPortalProps> = ({ 
  user,
  onLogout, 
  classes, 
  onCreateClass,
  onUpdateStudents,
  onDeleteClass
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'create' | 'list' | 'masterlist' | 'performance'>('overview');

  const handleDeleteClass = (classId: string) => {
    if (onDeleteClass) {
      onDeleteClass(classId);
    }
  };

  return (
    <div className="portal-container">
      <header className="portal-header">
        <div className="header-left">
          <span className="header-badge badge--teacher"><HeaderTeacherIcon /></span>
          <div className="header-texts">
            <h1 className="portal-title">Statistics Meets Climate Action</h1>
            <p className="portal-subtitle">Teacher Dashboard</p>
          </div>
        </div>
        <div className="header-right">
          <p className="welcome-text">Welcome, <strong>{user?.username || 'Teacher'}</strong></p>
          <button className="logout-button" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <main className="portal-content">
        <div className="portal-tabs">
          <button
            className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            Create Class
          </button>
          <button
            className={`tab-button ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            List of Classes
          </button>
          <button
            className={`tab-button ${activeTab === 'masterlist' ? 'active' : ''}`}
            onClick={() => setActiveTab('masterlist')}
          >
            Masterlist
          </button>
          <button
            className={`tab-button ${activeTab === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('performance')}
          >
            Performance Summary
          </button>
        </div>
        {activeTab === 'overview' && (
          <section className="overview">
            <h2 className="overview-title"><span className="title-top">Digital Project-Based Learning:</span><span className="title-bottom">Integrating Climate Change into Statistics Instruction</span></h2>
            <p className="overview-intro">This material connects core statistics with real climate issues to build data literacy, critical thinking, and community-oriented problem solving. Students analyze local datasets, interpret relationships, and communicate insights for action. Activities emphasize meaningful applications of statistics to climate questions, helping learners understand evidence, uncertainty, and responsible decision-making.</p>

            <div className="overview-section">
              <h3 className="center section-title"><span className="title-icon">📘</span> Learning Competencies</h3>
              <p className="overview-sub center">These are the specific statistical skills students will develop through climate-focused projects.</p>
              <div className="cards-3">
                <div className="card">
                  <ul>
                    <li>The learner calculates Pearson's sample correlation coefficient <span className="code-blue">(M11/12SP-IVh-2)</span></li>
                    <li>The learner solves problems involving correlation analysis <span className="code-blue">(M11/12SP-IVh-3)</span></li>
                  </ul>
                </div>
                <div className="card">
                  <ul>
                    <li>The learner calculates the slope and y-intercept of the regression line <span className="code-blue">(M11/12SP-IVi-3)</span></li>
                    <li>The learner interprets the calculated slope and y-intercept of the regression line <span className="code-blue">(M11/12SP-IVi-4)</span></li>
                  </ul>
                </div>
                <div className="card">
                  <ul>
                    <li>The learner predicts the value of the dependent variable given the value of the independent variable <span className="code-blue">(M11/12SP-IVj-1)</span></li>
                    <li>The learner solves problems involving regression analysis <span className="code-blue">(M11/12SP-IVj-2)</span></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="overview-section">
              <h3 className="center section-title"><span className="title-icon">🎯</span> Learning Objectives</h3>
              <p className="overview-sub center">By the end of these projects, students will be able to apply statistical methods to real climate data.</p>
              <div className="cards-3">
                <div className="card">
                  <ul>
                    <li>Explain the meaning, strength, and direction of Pearson's sample correlation by interpreting two local climate variables.</li>
                    <li>Calculate Pearson's r accurately from a local environmental dataset using formulas or spreadsheets.</li>
                    <li>Analyze a correlation scenario to propose at least one actionable recommendation for a local environmental problem.</li>
                  </ul>
                </div>
                <div className="card">
                  <ul>
                    <li>Explain the meaning of slope and y‑intercept by describing how changes in one climate variable affect another.</li>
                    <li>Calculate slope and y‑intercept accurately from a local dataset using the correct formula or spreadsheet tools.</li>
                    <li>Interpret slope and intercept to suggest practical recommendations addressing local environmental issues.</li>
                  </ul>
                </div>
                <div className="card">
                  <ul>
                    <li>Explain how a regression equation supports prediction by relating a climate input to an outcome.</li>
                    <li>Predict the dependent variable accurately using a given regression equation and specified inputs.</li>
                    <li>Analyze a regression problem, note limitations, and propose an actionable recommendation for the community.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="overview-section">
              <h3 className="center section-title"><span className="title-icon">🧩</span> Expected Outputs</h3>
              <p className="overview-sub center">Students will complete three progressive climate analysis projects demonstrating their statistical mastery.</p>
              <div className="cards-3 centered">
                <div className="card">
                  <h4 className="blue-title">Climate Correlation Analysis Project: "Understanding Our Local Environment"</h4>
                  <p>Students investigate the relationship between two climate-related variables in the Davao Region and provide evidence-based recommendations to local stakeholders.</p>
                  <span className="duration">Duration: 4 hours</span>
                </div>
                <div className="card">
                  <h4 className="blue-title">Climate Action Project: Analyzing Local Environmental Trends Through Regression</h4>
                  <p>Students analyze local data, calculate and interpret regression lines, and present actionable recommendations to relevant stakeholders.</p>
                  <span className="duration">Duration: 4 hours</span>
                </div>
                <div className="card">
                  <h4 className="blue-title">Climate-Impact Prediction Project: "What Will Our Weather Cost Us?"</h4>
                  <p>Students model how a climate variable affects a community concern, use regression to make predictions, and propose recommendations to stakeholders.</p>
                  <span className="duration">Duration: 4 hours</span>
                </div>
              </div>
            </div>
          </section>
        )}
        {activeTab === 'create' && (
          <ClassManagement 
            onCreateClass={onCreateClass}
            classes={classes}
            onDeleteClass={handleDeleteClass}
            onUpdateStudents={onUpdateStudents}
          />
        )}
        {activeTab === 'list' && (
          <StudentList classes={classes} onUpdateStudents={onUpdateStudents} />
        )}

        {activeTab === 'masterlist' && (
          <section className="masterlist-section">
            <h2>Masterlist of All Students</h2>
            {classes.length === 0 ? (
              <p className="no-data">No classes created yet.</p>
            ) : (
              <table className="students-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student Name</th>
                    <th>Username</th>
                    <th>Grade &amp; Section</th>
                    <th>Login Status</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.flatMap(cls =>
                    cls.students.map((s, idx) => (
                      <tr key={s.id}>
                        <td>{idx + 1}</td>
                        <td>{s.name}</td>
                        <td className="code">{s.username}</td>
                        <td>Grade {cls.grade} – {cls.section}</td>
                        <td>
                          <span className={`status-badge ${s.hasLoggedIn ? 'active' : 'inactive'}`}>
                            {s.hasLoggedIn ? '✓ Logged In' : '⏳ Pending'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                  {classes.flatMap(c => c.students).length === 0 && (
                    <tr><td colSpan={5} className="no-data">No students enrolled yet.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </section>
        )}

        {activeTab === 'performance' && (
          <PerformanceSummary classes={classes} />
        )}
      </main>
    </div>
  );
};

export default TeacherPortal;
