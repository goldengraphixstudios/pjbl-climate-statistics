import '../../styles/StudentPortal.css';
import '../../styles/Lesson.css';
import { useMemo, useState, useEffect } from 'react';
import { getAssessmentScores, getLesson1State } from '../../services/progressService';
import { getUserProgress } from '../../services/progressService';
import { ActivityType, getResponsesForStudent } from '../../services/responsesService';
import { getFeedbackForStudent } from '../../services/feedbackService';
import { getMyProfile } from '../../services/profilesService';

interface AuthUser {
  id?: string;
  username: string;
  role: 'student' | 'teacher' | 'admin' | null;
}

interface SectionPageProps {
  user: AuthUser;
  onBack: () => void;
}

const PerformanceSummary: React.FC<SectionPageProps> = ({ user, onBack }) => {
  const displayName = (() => {
    const raw = localStorage.getItem('teacherClasses');
    if (raw) {
      try {
        const classes = JSON.parse(raw) as Array<{ students: Array<{username:string; name:string}> }>;
        for (const cls of classes) {
          const found = cls.students.find(s => s.username === user.username);
          if (found) return found.name;
        }
      } catch {}
    }
    return user.username;
  })();

  const [sectionProgress, setSectionProgress] = useState<Record<number, number>>({});
  const [responseRows, setResponseRows] = useState<any[]>([]);
  const [feedbackRows, setFeedbackRows] = useState<any[]>([]);

  const getSummaryStatus = (resp: any, fb: any) => {
    if (!resp) return { text: 'pending', tone: '#999' };
    if (!fb) return { text: 'submitted', tone: 'var(--primary-blue)' };
    if (!fb.acknowledged) return { text: 'feedback ready', tone: '#d97706' };
    return { text: 'completed', tone: '#15803d' };
  };

  const loadData = async () => {
    try {
      let studentId = (user as any).id || '';
      if (!studentId) {
        const prof = await getMyProfile();
        if (prof?.id) studentId = prof.id;
      }
      if (!studentId) return;
      const resps = await getResponsesForStudent(studentId);
      setResponseRows(resps);
      const fbs = await getFeedbackForStudent(studentId);
      setFeedbackRows(fbs);
      // compute sectionProgress similar to before using resps + fbs
      const progress: Record<number, number> = {};
      ['pre','lesson1','lesson2','lesson3','post'].forEach((act, idx) => {
        const type = act as ActivityType;
        const resp = resps.find(r=>r.activity_type===type);
        const fb = fbs.find(f=>f.activity_type===type);
        if (resp && fb && fb.acknowledged) progress[idx+1] = 100;
        else if (resp) progress[idx+1] = 50;
        else progress[idx+1] = 0;
      });
      const compCount = [1,2,3,4,5].reduce((acc,id)=>(progress[id]===100?acc+1:acc),0);
      progress[6] = Math.min(100, compCount * 20);
      setSectionProgress(progress);
    } catch (e) {
      console.error('loadData failed', e);
    }
  };

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 15000);
    return () => clearInterval(iv);
  }, [user.username]);

  return (
    <div className="portal-container">
      <header className="portal-header">
        <div className="header-left">
          <span className="header-badge badge--performance">📚</span>
          <div className="header-texts">
            <h1 className="portal-title">Performance Summary</h1>
            <p className="portal-subtitle">Student Section</p>
          </div>
        </div>
        <div className="header-right">
          <p className="welcome-text">Welcome, <strong>{displayName}</strong></p>
          <button className="logout-button" onClick={onBack}>Back to Dashboard</button>
        </div>
      </header>

      <main className="portal-content">
        <div className="lesson-container">
          <div style={{ padding: 24 }}>
            <h3>Overview</h3>
            <p>This page summarizes your performance across the learning sections.</p>
            <div style={{ height: 12 }} />
            <div style={{ height: 12 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {[
                { id: 1, icon: '📋', title: 'Pre-Assessment' },
                { id: 2, icon: '📊', title: 'Lesson 1: Climate Correlation Analysis' },
                { id: 3, icon: '📈', title: 'Lesson 2: Climate Linear Regression Equations' },
                { id: 4, icon: '🎯', title: 'Lesson 3: Climate Predictions and Applications in Regression' },
                { id: 5, icon: '✅', title: 'Post-Assessment' }
              ].map(item => (
                <div
                  key={item.id}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E6EEF9',
                    borderRadius: 12,
                    padding: '14px 18px',
                    minHeight: 72,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
                    <div style={{ fontWeight: 700, textAlign: 'left', color: 'var(--primary-blue)' }}>{item.title}</div>
                  </div>
                  {
                    (() => {
                      const actMap: Record<number,string> = {1:'pre',2:'lesson1',3:'lesson2',4:'lesson3',5:'post'};
                      const actKey = actMap[item.id] || '';
                      const resp = responseRows.find((r: any) => r.activity_type === actKey);
                      const fb = feedbackRows.find((f: any) => f.activity_type === actKey);
                      const maxScores: Record<number,number> = {1:15, 2:32, 3:32, 4:32, 5:15};
                      const max = maxScores[item.id] || '—';
                      const score = (item.id===1||item.id===5) ? (resp?.answers?.part1Score ?? resp?.teacher_score ?? null) : (resp?.teacher_score ?? null);
                      const hasScore = typeof score === 'number' && score !== null;
                      const summaryStatus = getSummaryStatus(resp, fb);
                      return (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: hasScore ? 'var(--primary-blue)' : summaryStatus.tone }}>
                            {hasScore ? `${score} / ${max}` : <em style={{ fontWeight: 400, color: summaryStatus.tone }}>{summaryStatus.text}</em>}
                          </div>
                          {fb?.feedback_text && (
                            <div style={{ fontSize: '0.8rem', color: '#555', marginTop: 4, maxWidth: 260, textAlign: 'right' }}>
                              <em>"{fb.feedback_text}"</em>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PerformanceSummary;
