import { useEffect, useState } from 'react';
import { HeaderStudentIcon } from '../../components/RoleIcons';
import ProgressBar from '../../components/ProgressBar';
import '../../styles/StudentPortal.css';
import { ActivityType, getResponsesForStudent } from '../../services/responsesService';
import { getFeedbackForStudent } from '../../services/feedbackService';
import { getMyProfile } from '../../services/profilesService';
import ConfettiOverlay from '../../components/ConfettiOverlay';

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

interface StudentPortalProps {
  user: AuthUser;
  onLogout: () => void;
  classes: Class[];
  onOpenSection?: (sectionId: number) => void;
  initialTab?: 'overview' | 'sections';
}

const sections = [
  { id: 1, title: 'Pre-Assessment', icon: '📋' },
  { id: 2, title: 'Lesson 1 – Climate Correlation Analysis', icon: '📊' },
  { id: 3, title: 'Lesson 2 – Climate Linear Regression Equations', icon: '📈' },
  { id: 4, title: 'Lesson 3 – Climate Predictions and Applications', icon: '🎯' },
  { id: 5, title: 'Post Assessment', icon: '✅' },
  { id: 6, title: 'Performance Summary', icon: '📚' }
];

const getActivityStatusLabel = (status?: {
  submitted: boolean;
  feedback?: any;
  acknowledged: boolean;
}, activityType?: ActivityType | 'performance') => {
  if (!status?.submitted) return 'Not started';
  return 'Completed';
};

const StudentPortal: React.FC<StudentPortalProps> = ({ user, onLogout, classes, onOpenSection, initialTab }) => {
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'sections'>('overview');
  // statuses for each activity
  const [activityStatuses, setActivityStatuses] = useState<
    Record<ActivityType | 'performance', {
      submitted: boolean;
      feedback?: any;
      acknowledged: boolean;
    }>
  >({
    pre: { submitted: false, feedback: undefined, acknowledged: false },
    lesson1: { submitted: false, feedback: undefined, acknowledged: false },
    lesson2: { submitted: false, feedback: undefined, acknowledged: false },
    lesson3: { submitted: false, feedback: undefined, acknowledged: false },
    post: { submitted: false, feedback: undefined, acknowledged: false },
    performance: { submitted: false, feedback: undefined, acknowledged: false }
  });
  const [showConfetti, setShowConfetti] = useState(false);
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // load statuses from Supabase
  useEffect(() => {
    let studentId = '';
    let pollId: ReturnType<typeof setInterval> | null = null;

    const load = async (sid?: string) => {
      try {
        const id = sid || studentId || user?.id || '';
        if (!id) return;
        const resolvedId = id;
        const resps = await getResponsesForStudent(resolvedId);
        const fbs = await getFeedbackForStudent(resolvedId);
        const mapStatus: any = {
          pre: { submitted: false, feedback: undefined, acknowledged: false },
          lesson1: { submitted: false, feedback: undefined, acknowledged: false },
          lesson2: { submitted: false, feedback: undefined, acknowledged: false },
          lesson3: { submitted: false, feedback: undefined, acknowledged: false },
          post: { submitted: false, feedback: undefined, acknowledged: false }
        };
        resps.forEach(r => {
          if (r.activity_type in mapStatus) {
            mapStatus[r.activity_type].submitted = true;
          }
        });
        fbs.forEach(f => {
          if (f.activity_type in mapStatus) {
            mapStatus[f.activity_type].feedback = f;
            mapStatus[f.activity_type].acknowledged = !!f.acknowledged;
          }
        });
        setActivityStatuses({ ...mapStatus, performance: { submitted: false, feedback: undefined, acknowledged: false } });
      } catch (e) {
        console.error('failed to load activity statuses', e);
      }
    };

    const init = async () => {
      studentId = user?.id || '';
      if (!studentId) {
        const prof = await getMyProfile();
        studentId = prof?.id || '';
      }
      if (!studentId) return;
      await load(studentId);
      pollId = setInterval(() => load(studentId), 10000);
    };

    init();

    return () => {
      if (pollId) {
        clearInterval(pollId);
      }
    };
  }, [user, user?.id]);

  useEffect(() => {
    // Show confetti for first newly completed section not yet rewarded
    // Note: sectionProgress would come from lesson completion tracking if needed
    // For now, we'll skip confetti or track it differently
  }, [user.username]);

  const activityTypeForId = (id: number): ActivityType | null =>
    id === 1 ? 'pre' : id === 2 ? 'lesson1' : id === 3 ? 'lesson2' : id === 4 ? 'lesson3' : id === 5 ? 'post' : null;

  const isSectionLocked = (sectionId: number) => {
    if (user.role === 'admin') return false;
    if (sectionId === 6) return false;
    const current = activityTypeForId(sectionId);
    if (!current) return false;
    // if previous activity not satisfied
    if (sectionId > 1) {
      const prevType = activityTypeForId(sectionId - 1);
      if (prevType) {
        const prev = activityStatuses[prevType];
        if (!prev.submitted) return true;
      }
    }
    return false;
  };

  const handleSectionClick = (sectionId: number) => {
    const locked = isSectionLocked(sectionId);
    if (locked) return;
    if (onOpenSection) {
      onOpenSection(sectionId);
    } else {
      setActiveSection(activeSection === sectionId ? null : sectionId);
    }
  };


  const displayName = (() => {
    for (const cls of classes) {
      const found = cls.students.find(s => s.username === user.username);
      if (found) return found.name;
    }
    return user.username;
  })();

  return (
    <div className="portal-container">
      {showConfetti && (
        <ConfettiOverlay onClose={() => setShowConfetti(false)} />
      )}
      <header className="portal-header">
        <div className="header-left">
          <span className="header-badge badge--student"><HeaderStudentIcon /></span>
          <div className="header-texts">
            <h1 className="portal-title">Statistics Meets Climate Action</h1>
            <p className="portal-subtitle">Student Dashboard</p>
          </div>
        </div>
        <div className="header-right">
          <p className="welcome-text">Welcome, <strong>{displayName}</strong> {user.role==='admin' && (<span className="admin-mode-badge" title="Bypass enabled for testing">Admin Mode</span>)}</p>
          <button className="logout-button" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <main className="portal-content">
        <div className="overview-tabs">
          <button className={`tab-button ${activeTab==='overview'?'active':''}`} onClick={()=>setActiveTab('overview')}>Overview</button>
          <button className={`tab-button ${activeTab==='sections'?'active':''}`} onClick={()=>setActiveTab('sections')}>Learning Sections</button>
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

        {activeTab === 'sections' && (
          <section className="sections-container">
            <h2>Learning Sections</h2>
            <div className="sections-grid">
              {sections.map((section) => (
                <div
                  key={section.id}
                  className={`section-card ${activeSection === section.id ? 'active' : ''} ${isSectionLocked(section.id)?'locked':''}`}
                  onClick={() => handleSectionClick(section.id)}
                >
                  <div className="section-header">
                    <span className="section-icon">{section.icon}</span>
                    {isSectionLocked(section.id) && <span className="section-lock-icon" title="Locked until previous section is completed">🔒</span>}
                  </div>
                  <h3>{section.title}</h3>
                  {/* status indicator based on Supabase-backed statuses */}
                  {(() => {
                    const type = activityTypeForId(section.id);
                    if (!type) return null;
                    const st = activityStatuses[type];
                    const label = getActivityStatusLabel(st, type);
                    return <p className="progress-text">{label}</p>;
                  })()}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default StudentPortal;
