import React from 'react';
import { StudentCapIcon, TeacherCalendarIcon, AdminShieldIcon } from '../components/RoleIcons';
import '../styles/LandingPage.css';

interface LandingPageProps {
  onRoleSelect: (role: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onRoleSelect }) => {
  return (
    <div className="landing-page">
      <header className="hero">
        <h1 className="title">Statistics Meets Climate Action</h1>
        <div className="divider"><span className="line" /><span className="star">★</span><span className="line" /></div>
        <p className="subtitle">A Digitized Project-Based Learning Material for Senior High School Statistics Integrating Mathematics and Climate Education</p>
        <p className="welcome">Welcome to our interactive learning environment!</p>
      </header>

      <section className="roles">
        <div className="role-card" onClick={() => onRoleSelect('student')}>
          <div className="role-icon"><StudentCapIcon /></div>
          <h3>Student</h3>
          <p>Access learning materials and projects</p>
        </div>
        <div className="role-card" onClick={() => onRoleSelect('teacher')}>
          <div className="role-icon"><AdminShieldIcon /></div>
          <h3>Teacher / Administrator</h3>
          <p>Manage classes, track progress, and oversee system</p>
        </div>
      </section>

      <section className="highlights">
        <span className="chip">Interactive</span>
        <span className="chip">Project-Based</span>
        <span className="chip">Climate-Focused</span>
      </section>

      <footer className="credits">
        <p>Developed by:</p>
        <p className="author">Mr. Marco R. Ocumen</p>
        <p>Student - Master of Arts in Mathematics Education</p>
        <p>University of Southeastern Philippines</p>
      </footer>
    </div>
  );
};

export default LandingPage;
