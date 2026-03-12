import { useEffect, useState } from 'react';
import { HeaderStudentIcon } from '../../components/RoleIcons';
import '../../styles/StudentPortal.css';
import { ActivityType, getResponsesForStudent } from '../../services/responsesService';
import { getFeedbackForStudent } from '../../services/feedbackService';
import { getMyProfile } from '../../services/profilesService';
import { getAssessmentScores, getLesson1State, getLesson3PersistedState, getUserProgress } from '../../services/progressService';
import { getStudentState } from '../../services/studentStateService';
import {
  hasLesson1AnyProgress,
  hasLesson2AnyProgress,
  hasLesson3AnyProgress,
  isLesson1CompleteState,
  isLesson2CompleteState,
  isLesson3CompleteState,
} from '../../services/lessonCompletion';
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

type ActivityStatus = {
  submitted: boolean;
  draftSaved: boolean;
  feedback?: any;
  acknowledged: boolean;
};

const createEmptyActivityStatus = (): ActivityStatus => ({
  submitted: false,
  draftSaved: false,
  feedback: undefined,
  acknowledged: false,
});

function isFinalActivityResponse(response: { answers?: any }) {
  const stage = response?.answers?.__meta?.stage;
  return !stage || stage === 'final';
}

const getActivityStatusLabel = (status?: {
  submitted: boolean;
  draftSaved?: boolean;
  feedback?: any;
  acknowledged: boolean;
}) => {
  if (status?.submitted) return 'Completed';
  if (status?.draftSaved) return 'In progress';
  return 'Not started';
};

const StudentPortal: React.FC<StudentPortalProps> = ({ user, onLogout, classes, onOpenSection, initialTab }) => {
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'sections'>('overview');
  // statuses for each activity
  const [activityStatuses, setActivityStatuses] = useState<
    Record<ActivityType | 'performance', ActivityStatus>
  >({
    pre: createEmptyActivityStatus(),
    lesson1: createEmptyActivityStatus(),
    lesson2: createEmptyActivityStatus(),
    lesson3: createEmptyActivityStatus(),
    post: createEmptyActivityStatus(),
    performance: createEmptyActivityStatus()
  });
  const [showConfetti, setShowConfetti] = useState(false);
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // load statuses from Supabase
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let resolvedId = user?.id || '';
        if (!resolvedId) {
          const prof = await getMyProfile();
          resolvedId = prof?.id || '';
        }
        if (!resolvedId || cancelled) return;

        const [resps, fbs, lesson1State, lesson2State, lesson3Persisted, lesson3State] = await Promise.all([
          getResponsesForStudent(resolvedId),
          getFeedbackForStudent(resolvedId),
          getStudentState(resolvedId, 'lesson1').catch(() => null),
          getStudentState(resolvedId, 'lesson2').catch(() => null),
          getLesson3PersistedState(user.username).catch(() => null),
          getStudentState(resolvedId, 'lesson3').catch(() => null),
        ]);
        if (cancelled) return;

        const mapStatus: Record<ActivityType | 'performance', ActivityStatus> = {
          pre: createEmptyActivityStatus(),
          lesson1: createEmptyActivityStatus(),
          lesson2: createEmptyActivityStatus(),
          lesson3: createEmptyActivityStatus(),
          post: createEmptyActivityStatus(),
          performance: createEmptyActivityStatus()
        };
        const localProgress = getUserProgress(user.username);
        const localLesson1State = getLesson1State(user.username);
        const finalResponses: Partial<Record<ActivityType, any>> = {};
        resps.forEach(r => {
          if (r.activity_type in mapStatus) {
            if (isFinalActivityResponse(r)) {
              finalResponses[r.activity_type] = r;
            } else {
              mapStatus[r.activity_type].draftSaved = true;
            }
          }
        });
        mapStatus.pre.submitted = !!finalResponses.pre;
        mapStatus.post.submitted = !!finalResponses.post;

        const lesson1Snapshot = lesson1State || finalResponses.lesson1?.answers?.lesson1State || localLesson1State || null;
        const lesson2Snapshot = lesson2State || finalResponses.lesson2?.answers?.lesson2State || null;
        const lesson3Snapshot = lesson3State || lesson3Persisted || null;

        mapStatus.lesson1.submitted = isLesson1CompleteState(lesson1Snapshot) || Number(localProgress[2] || 0) >= 100;
        mapStatus.lesson2.submitted = isLesson2CompleteState(lesson2Snapshot) || Number(localProgress[3] || 0) >= 100;
        mapStatus.lesson3.submitted = isLesson3CompleteState(lesson3Snapshot) || Number(localProgress[4] || 0) >= 100;

        if (!mapStatus.lesson1.submitted && (hasLesson1AnyProgress(lesson1Snapshot) || Number(localProgress[2] || 0) > 0 || !!finalResponses.lesson1)) {
          mapStatus.lesson1.draftSaved = true;
        }
        if (!mapStatus.lesson2.submitted && (hasLesson2AnyProgress(lesson2Snapshot) || Number(localProgress[3] || 0) > 0 || !!finalResponses.lesson2)) {
          mapStatus.lesson2.draftSaved = true;
        }
        if (!mapStatus.lesson3.submitted && (lesson3Persisted?.hasAnyData || hasLesson3AnyProgress(lesson3Snapshot) || Number(localProgress[4] || 0) > 0 || !!finalResponses.lesson3)) {
          mapStatus.lesson3.draftSaved = true;
        }
        const postScores = getAssessmentScores()[user.username];
        const hasLocalPostDraft =
          (Array.isArray(postScores?.postPart1Responses) && postScores.postPart1Responses.some((value: string) => !!value)) ||
          (Array.isArray(postScores?.postPart2Responses) && postScores.postPart2Responses.some((value: number) => Number(value) > 0));
        if (!mapStatus.post.submitted && hasLocalPostDraft) {
          mapStatus.post.draftSaved = true;
        }
        fbs.forEach(f => {
          if (f.activity_type in mapStatus) {
            mapStatus[f.activity_type].feedback = f;
            mapStatus[f.activity_type].acknowledged = !!f.acknowledged;
          }
        });
        setActivityStatuses(mapStatus);
      } catch (e) {
        console.error('failed to load activity statuses', e);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user.username]);

  useEffect(() => {
    // Show confetti for first newly completed section not yet rewarded
    // Note: sectionProgress would come from lesson completion tracking if needed
    // For now, we'll skip confetti or track it differently
  }, [user.username]);

  const activityTypeForId = (id: number): ActivityType | null =>
    id === 1 ? 'pre' : id === 2 ? 'lesson1' : id === 3 ? 'lesson2' : id === 4 ? 'lesson3' : id === 5 ? 'post' : null;

  const handleSectionClick = (sectionId: number) => {
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
                  className={`section-card ${activeSection === section.id ? 'active' : ''}`}
                  onClick={() => handleSectionClick(section.id)}
                >
                  <div className="section-header">
                    <span className="section-icon">{section.icon}</span>
                  </div>
                  <h3>{section.title}</h3>
                  {/* status indicator based on Supabase-backed statuses */}
                  {(() => {
                    const type = activityTypeForId(section.id);
                    if (!type) return null;
                    const st = activityStatuses[type];
                    const label = getActivityStatusLabel(st);
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
