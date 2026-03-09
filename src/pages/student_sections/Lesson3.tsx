import '../../styles/StudentPortal.css';
import '../../styles/Lesson.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import ProgressBar from '../../components/ProgressBar';
import { setUserProgress, saveLesson3Phase1Activity1, getLesson3Phase1Activity1All, getUserProgress, saveLesson3Phase1Activity2, getLesson3Phase1Activity2All, saveLesson3Phase2Activity1, getLesson3Phase2Activity1All, saveLesson3Phase2Activity2, getLesson3Phase2Activity2All, saveLesson3Phase2Activity3, getLesson3Phase2Activity3All, saveLesson3Phase3Activity1, getLesson3Phase3Activity1All, saveLesson3Phase4PeerReview, getLesson3Phase4ReviewAll, saveLesson3Phase4Reflection, getLesson3Phase4CompleteAll } from '../../services/progressService';
import { ActivityType, upsertResponse } from '../../services/responsesService';
import { getFeedbackForStudentActivity, acknowledgeFeedback } from '../../services/feedbackService';
import { getMyProfile } from '../../services/profilesService';
import { getStudentState, upsertStudentState } from '../../services/studentStateService';

interface AuthUser {
  username: string;
  role: 'student' | 'teacher' | 'admin' | null;
}

interface SectionPageProps {
  user: AuthUser;
  onBack: () => void;
}

const Lesson3: React.FC<SectionPageProps> = ({ user, onBack }) => {
  const studentStateIdentifier = useRef<string>(user.username);
  const lesson3SnapshotLoaded = useRef(false);
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
  const [open, setOpen] = useState<{ overview: boolean; p1: boolean; p2: boolean; p3: boolean; p4: boolean }>({ overview: false, p1: false, p2: false, p3: false, p4: false });
  const [completedPhases, setCompletedPhases] = useState<number[]>([]);
  const progressPct = useMemo(() => Math.round((completedPhases.length / 4) * 100), [completedPhases]);
  const [serverFeedback, setServerFeedback] = useState<any>(null);
  
  useEffect(() => { setUserProgress(user.username, 4, progressPct); }, [progressPct, user.username]);
  
  // Load server feedback for lesson3
  useEffect(() => {
    const load = async () => {
      try {
        const prof = await getMyProfile();
        const studentId = prof?.id;
        if (!studentId) return;
        const fb = await getFeedbackForStudentActivity(studentId, 'lesson3');
        if (fb) setServerFeedback(fb);
      } catch (e) {
        console.error('load lesson3 feedback', e);
      }
    };
    load();
  }, []);

  useEffect(() => {
    setOpen({ overview: false, p1: false, p2: false, p3: false, p4: false });
    setP1Sections({ a1:false, a2:false });
    setP2Sections({ a1:false, a2:false, a3:false });
  }, []);

  // Phase 1: Scenario & question framing
  const [p1Sections, setP1Sections] = useState<{ a1:boolean; a2:boolean }>({ a1:false, a2:false });
  const [scenarioSel, setScenarioSel] = useState<{ code:string; title:string; desc:string } | null>(null);
  const [stakeholders, setStakeholders] = useState<string>('');
  const [iv, setIv] = useState<string>('');
  const [dv, setDv] = useState<string>('');
  const [rq, setRq] = useState<string>('');
  const [p1Check1] = useState<boolean>(false);
  const [, setP1Check2] = useState<boolean>(false);
  const [p1Confidence, setP1Confidence] = useState<number>(0);
  const [recallA, setRecallA] = useState<string>('');
  const [recallB, setRecallB] = useState<string>('');
  const [recallC, setRecallC] = useState<string>('');
  const [recallLocked, setRecallLocked] = useState<boolean>(false);
  const [lesson3ExtraPct, setLesson3ExtraPct] = useState<number>(0);
  useEffect(() => { setUserProgress(user.username, 4, Math.min(100, progressPct + lesson3ExtraPct)); }, [progressPct, lesson3ExtraPct, user.username]);

  // Compute extra awarded percent from saved activity entries so initial progress starts at 0
  useEffect(() => {
    try {
      let sum = 0;
      const a1 = (getLesson3Phase1Activity1All && typeof getLesson3Phase1Activity1All === 'function') ? getLesson3Phase1Activity1All() : {};
      if (a1 && a1[user.username]) sum += 10; // Phase1 Activity1
      const a2 = (getLesson3Phase1Activity2All && typeof getLesson3Phase1Activity2All === 'function') ? getLesson3Phase1Activity2All() : {};
      if (a2 && a2[user.username]) sum += 15; // Phase1 Activity2
      const p2a1 = (getLesson3Phase2Activity1All && typeof getLesson3Phase2Activity1All === 'function') ? getLesson3Phase2Activity1All() : {};
      if (p2a1 && p2a1[user.username]) sum += 8; // Phase2 A1
      const p2a2 = (getLesson3Phase2Activity2All && typeof getLesson3Phase2Activity2All === 'function') ? getLesson3Phase2Activity2All() : {};
      if (p2a2 && p2a2[user.username]) sum += 8; // Phase2 A2
      const p2a3 = (getLesson3Phase2Activity3All && typeof getLesson3Phase2Activity3All === 'function') ? getLesson3Phase2Activity3All() : {};
      if (p2a3 && p2a3[user.username]) sum += 9; // Phase2 A3
      const p3a1 = (getLesson3Phase3Activity1All && typeof getLesson3Phase3Activity1All === 'function') ? getLesson3Phase3Activity1All() : {};
      if (p3a1 && p3a1[user.username]) sum += 25; // Phase3 A1
      const rev = (getLesson3Phase4ReviewAll && typeof getLesson3Phase4ReviewAll === 'function') ? getLesson3Phase4ReviewAll() : {};
      if (rev && rev[user.username]) sum += 10; // Phase4 review
      const comp = (getLesson3Phase4CompleteAll && typeof getLesson3Phase4CompleteAll === 'function') ? getLesson3Phase4CompleteAll() : {};
      if (comp && comp[user.username]) sum += 15; // Phase4 final
      const newExtra = Math.min(100, sum);
      setLesson3ExtraPct(newExtra);
      try { localStorage.setItem('lesson3_extra_progress', String(newExtra)); } catch {}
    } catch (e) { /* ignore */ }
  }, [user.username]);

    // Load previously saved Lesson3 Phase1 Activity1 (recall fields) if any
    useEffect(() => {
      try {
        const all = getLesson3Phase1Activity1All();
        const entry = all[user.username];
        if (entry) {
          setRecallA(entry.researchQuestion || '');
          setRecallB(entry.regressionEquation || '');
          setRecallC(entry.interpretation || '');
          setRecallLocked(true);
        }
      } catch (e) {
        // ignore
      }
    }, [user.username]);
  const [depVar, setDepVar] = useState<string>('');
  const [otherFactors, setOtherFactors] = useState<string[]>(Array(12).fill(''));
  const [generated, setGenerated] = useState<{ nodes: string[] } | null>(null);
  const [uploadedDiagram, setUploadedDiagram] = useState<File | null>(null);
  const [uploadedDiagramPreview, setUploadedDiagramPreview] = useState<string | null>(null);
  const [finalConsiderations, setFinalConsiderations] = useState<string>('');
  const [submitted2, setSubmitted2] = useState<boolean>(false);

  // Load previously saved Activity2 (phase1) data
  useEffect(() => {
    try {
      const all = (getLesson3Phase1Activity2All && typeof getLesson3Phase1Activity2All === 'function') ? getLesson3Phase1Activity2All() : {};
      const entry = all[user.username];
      if (entry) {
        setFinalConsiderations(entry.considerations || '');
        setUploadedDiagramPreview(entry.fileDataUrl || null);
        setSubmitted2(true);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);

  // Phase 2: Tabbed workspace
  const [p2Sections, setP2Sections] = useState<{ a1:boolean; a2:boolean; a3:boolean }>({ a1:false, a2:false, a3:false });
  const [tab, setTab] = useState<'data'|'graph'|'analysis'>('data');
  const [ds] = useState<string>('');
  const [] = useState<string>('');
  const [] = useState<string>('');
  const [patternDesc, setPatternDesc] = useState<string>('');
  const [exitTicket, setExitTicket] = useState<string>('');
  // Phase 2 Activity 1: interpolation upload/preview/submit state
  const [p2a1File, setP2a1File] = useState<File | null>(null);
  const [p2a1Preview, setP2a1Preview] = useState<string | null>(null);
  const [p2a1Submitted, setP2a1Submitted] = useState<boolean>(false);
  // Load previously saved Phase2 Activity1
  useEffect(() => {
    try {
      const all = (getLesson3Phase2Activity1All && typeof getLesson3Phase2Activity1All === 'function') ? getLesson3Phase2Activity1All() : {};
      const entry = all[user.username];
      if (entry) {
        setP2a1Preview(entry.fileDataUrl || null);
        setP2a1Submitted(true);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // Load previously saved Phase2 Activity3
  useEffect(() => {
    try {
      const all = (getLesson3Phase2Activity3All && typeof getLesson3Phase2Activity3All === 'function') ? getLesson3Phase2Activity3All() : {};
      const entry = all[user.username];
      if (entry) {
        setP2a3Preview(entry.fileDataUrl || null);
        setP2a3Answer(entry.interpretation || '');
        setP2a3Submitted(true);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // Phase 2 Activity 2: extrapolation upload/preview/submit state
  const [p2a2File, setP2a2File] = useState<File | null>(null);
  const [p2a2Preview, setP2a2Preview] = useState<string | null>(null);
  const [p2a2Submitted, setP2a2Submitted] = useState<boolean>(false);
  // Load previously saved Phase2 Activity2
  useEffect(() => {
    try {
      const all = (getLesson3Phase2Activity2All && typeof getLesson3Phase2Activity2All === 'function') ? getLesson3Phase2Activity2All() : {};
      const entry = all[user.username];
      if (entry) {
        setP2a2Preview(entry.fileDataUrl || null);
        setP2a2Submitted(true);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // Phase 2 Activity 3: coefficient determination upload/preview/submit state
  const [p2a3File, setP2a3File] = useState<File | null>(null);
  const [p2a3Preview, setP2a3Preview] = useState<string | null>(null);
  const [p2a3Submitted, setP2a3Submitted] = useState<boolean>(false);
  const [p2a3Answer, setP2a3Answer] = useState<string>('');

  // Phase 3 upload/preview/submit state variables
  const [p3File, setP3File] = useState<File | null>(null);
  const [p3Preview, setP3Preview] = useState<string | null>(null);
  const [p3Submitted, setP3Submitted] = useState<boolean>(false);

  // Phase 3 upload/preview/submit state
  // Load previously saved Phase3 Activity1
  useEffect(() => {
    try {
      const all = (getLesson3Phase3Activity1All && typeof getLesson3Phase3Activity1All === 'function') ? getLesson3Phase3Activity1All() : {};
      const entry = all[user.username];
      if (entry) {
        setP3Preview(entry.fileDataUrl || null);
        setP3Submitted(true);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);

  // Phase 3: Prediction & limitations
  const [slope, setSlope] = useState<string>('');
  const [intercept, setIntercept] = useState<string>('');
  const [, setPredInput] = useState<string>('');
  const [limitations, setLimitations] = useState<string>('');
  const [peerVerify, setPeerVerify] = useState<boolean>(false);

  // Phase 4: Recommendations & outputs
  const [formatSel, setFormatSel] = useState<{ title:string; desc:string } | null>(null);
  const [recommendation, setRecommendation] = useState<string>('');
  const [rubricScore, setRubricScore] = useState<number>(0);
  const [reflection, setReflection] = useState<string>('');
  const [peer1Answer, setPeer1Answer] = useState<string>('');
  const [peer2Answer, setPeer2Answer] = useState<string>('');
  const [peer3Answer, setPeer3Answer] = useState<string>('');
  const [peer4Answer, setPeer4Answer] = useState<string>('');
  const [peerStrength, setPeerStrength] = useState<string>('');
  const [peerSuggestion, setPeerSuggestion] = useState<string>('');
  const [peerReviewerUsername, setPeerReviewerUsername] = useState<string>('');
  const [peerSubmitted, setPeerSubmitted] = useState<boolean>(false);

  // Load previously saved Phase4 peer review for this user (if any)
  useEffect(() => {
    try {
      const all = (getLesson3Phase4ReviewAll && typeof getLesson3Phase4ReviewAll === 'function') ? getLesson3Phase4ReviewAll() : {};
      const entry = all[user.username];
      const entryAny: any = entry;
      if (entryAny && entryAny.review) {
        const r: any = entryAny.review;
        // q1..q4 may be arrays or strings
        setPeer1Answer(Array.isArray(r.q1) ? (r.q1[0] || '') : (r.q1 || ''));
        setPeer2Answer(Array.isArray(r.q2) ? (r.q2[0] || '') : (r.q2 || ''));
        setPeer3Answer(Array.isArray(r.q3) ? (r.q3[0] || '') : (r.q3 || ''));
        setPeer4Answer(Array.isArray(r.q4) ? (r.q4[0] || '') : (r.q4 || ''));
        setPeerStrength(r.strength || '');
        setPeerSuggestion(r.suggestion || '');
        setPeerReviewerUsername(r.reviewer || '');
        setPeerSubmitted(true);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  const [finalConfidence, setFinalConfidence] = useState<string>('');
  const [finalConfidenceReason, setFinalConfidenceReason] = useState<string>('');
  const [finalChallenge, setFinalChallenge] = useState<string>('');
  const [finalStatsChange, setFinalStatsChange] = useState<string>('');
  const [finalClimateChange, setFinalClimateChange] = useState<string>('');
  const [finalConnectionChange, setFinalConnectionChange] = useState<string>('');
  const [finalExtension, setFinalExtension] = useState<string>('');
  const [finalLearnerInsight, setFinalLearnerInsight] = useState<string>('');
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const [finalPreview, setFinalPreview] = useState<string | null>(null);
  const [finalSubmitted, setFinalSubmitted] = useState<boolean>(false);

  // Load previously saved Phase4 reflection/upload if present
  useEffect(() => {
    try {
      const all = (getLesson3Phase4CompleteAll && typeof getLesson3Phase4CompleteAll === 'function') ? getLesson3Phase4CompleteAll() : {};
      const entryAny: any = all[user.username];
      if (entryAny && (entryAny.uploadUrl || entryAny.reflection)) {
        // reflection fields
        const refl = entryAny.reflection || {};
        setFinalConfidence(refl.confidence || '');
        setFinalConfidenceReason(refl.contributed || '');
        setFinalChallenge(refl.challenging || '');
        setFinalStatsChange(refl.stats || '');
        setFinalClimateChange(refl.climate || '');
        setFinalConnectionChange(refl.connection || '');
        setFinalExtension(refl.extend || '');
        setFinalLearnerInsight(refl.learned || '');
        // preview
        setFinalPreview(entryAny.uploadUrl || null);
        setFinalSubmitted(true);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);

  useEffect(() => {
    const hydrateFromServer = async () => {
      try {
        const prof = await getMyProfile();
        const identifier = prof?.id || user.username;
        studentStateIdentifier.current = identifier;
        const snapshot = await getStudentState(identifier, 'lesson3') as any;
        if (!snapshot) return;

        if (Array.isArray(snapshot.completedPhases)) setCompletedPhases(snapshot.completedPhases);
        if (typeof snapshot.lesson3ExtraPct === 'number') setLesson3ExtraPct(snapshot.lesson3ExtraPct);
        if (typeof snapshot.recallA === 'string') setRecallA(snapshot.recallA);
        if (typeof snapshot.recallB === 'string') setRecallB(snapshot.recallB);
        if (typeof snapshot.recallC === 'string') setRecallC(snapshot.recallC);
        if (typeof snapshot.recallLocked === 'boolean') setRecallLocked(snapshot.recallLocked);
        if (typeof snapshot.finalConsiderations === 'string') setFinalConsiderations(snapshot.finalConsiderations);
        if (typeof snapshot.submitted2 === 'boolean') setSubmitted2(snapshot.submitted2);
        if (typeof snapshot.uploadedDiagramPreview === 'string') setUploadedDiagramPreview(snapshot.uploadedDiagramPreview);
        if (typeof snapshot.p2a1Preview === 'string') setP2a1Preview(snapshot.p2a1Preview);
        if (typeof snapshot.p2a1Submitted === 'boolean') setP2a1Submitted(snapshot.p2a1Submitted);
        if (typeof snapshot.p2a2Preview === 'string') setP2a2Preview(snapshot.p2a2Preview);
        if (typeof snapshot.p2a2Submitted === 'boolean') setP2a2Submitted(snapshot.p2a2Submitted);
        if (typeof snapshot.p2a3Preview === 'string') setP2a3Preview(snapshot.p2a3Preview);
        if (typeof snapshot.p2a3Submitted === 'boolean') setP2a3Submitted(snapshot.p2a3Submitted);
        if (typeof snapshot.p2a3Answer === 'string') setP2a3Answer(snapshot.p2a3Answer);
        if (typeof snapshot.p3Preview === 'string') setP3Preview(snapshot.p3Preview);
        if (typeof snapshot.p3Submitted === 'boolean') setP3Submitted(snapshot.p3Submitted);
        if (typeof snapshot.peer1Answer === 'string') setPeer1Answer(snapshot.peer1Answer);
        if (typeof snapshot.peer2Answer === 'string') setPeer2Answer(snapshot.peer2Answer);
        if (typeof snapshot.peer3Answer === 'string') setPeer3Answer(snapshot.peer3Answer);
        if (typeof snapshot.peer4Answer === 'string') setPeer4Answer(snapshot.peer4Answer);
        if (typeof snapshot.peerStrength === 'string') setPeerStrength(snapshot.peerStrength);
        if (typeof snapshot.peerSuggestion === 'string') setPeerSuggestion(snapshot.peerSuggestion);
        if (typeof snapshot.peerReviewerUsername === 'string') setPeerReviewerUsername(snapshot.peerReviewerUsername);
        if (typeof snapshot.peerSubmitted === 'boolean') setPeerSubmitted(snapshot.peerSubmitted);
        if (typeof snapshot.finalConfidence === 'string') setFinalConfidence(snapshot.finalConfidence);
        if (typeof snapshot.finalConfidenceReason === 'string') setFinalConfidenceReason(snapshot.finalConfidenceReason);
        if (typeof snapshot.finalChallenge === 'string') setFinalChallenge(snapshot.finalChallenge);
        if (typeof snapshot.finalStatsChange === 'string') setFinalStatsChange(snapshot.finalStatsChange);
        if (typeof snapshot.finalClimateChange === 'string') setFinalClimateChange(snapshot.finalClimateChange);
        if (typeof snapshot.finalConnectionChange === 'string') setFinalConnectionChange(snapshot.finalConnectionChange);
        if (typeof snapshot.finalExtension === 'string') setFinalExtension(snapshot.finalExtension);
        if (typeof snapshot.finalLearnerInsight === 'string') setFinalLearnerInsight(snapshot.finalLearnerInsight);
        if (typeof snapshot.finalPreview === 'string') setFinalPreview(snapshot.finalPreview);
        if (typeof snapshot.finalSubmitted === 'boolean') setFinalSubmitted(snapshot.finalSubmitted);
      } finally {
        lesson3SnapshotLoaded.current = true;
      }
    };

    hydrateFromServer();
  }, [user.username]);

  const lesson3Snapshot = useMemo(() => ({
    version: 1,
    source: 'lesson3-student-page',
    syncedAt: new Date().toISOString(),
    completedPhases,
    lesson3ExtraPct,
    recallA,
    recallB,
    recallC,
    recallLocked,
    finalConsiderations,
    submitted2,
    uploadedDiagramPreview: uploadedDiagramPreview && !uploadedDiagramPreview.startsWith('blob:') ? uploadedDiagramPreview : null,
    p2a1Preview: p2a1Preview && !p2a1Preview.startsWith('blob:') ? p2a1Preview : null,
    p2a1Submitted,
    p2a2Preview: p2a2Preview && !p2a2Preview.startsWith('blob:') ? p2a2Preview : null,
    p2a2Submitted,
    p2a3Preview: p2a3Preview && !p2a3Preview.startsWith('blob:') ? p2a3Preview : null,
    p2a3Submitted,
    p2a3Answer,
    p3Preview: p3Preview && !p3Preview.startsWith('blob:') ? p3Preview : null,
    p3Submitted,
    peer1Answer,
    peer2Answer,
    peer3Answer,
    peer4Answer,
    peerStrength,
    peerSuggestion,
    peerReviewerUsername,
    peerSubmitted,
    finalConfidence,
    finalConfidenceReason,
    finalChallenge,
    finalStatsChange,
    finalClimateChange,
    finalConnectionChange,
    finalExtension,
    finalLearnerInsight,
    finalPreview: finalPreview && !finalPreview.startsWith('blob:') ? finalPreview : null,
    finalSubmitted,
  }), [
    completedPhases,
    lesson3ExtraPct,
    recallA,
    recallB,
    recallC,
    recallLocked,
    finalConsiderations,
    submitted2,
    uploadedDiagramPreview,
    p2a1Preview,
    p2a1Submitted,
    p2a2Preview,
    p2a2Submitted,
    p2a3Preview,
    p2a3Submitted,
    p2a3Answer,
    p3Preview,
    p3Submitted,
    peer1Answer,
    peer2Answer,
    peer3Answer,
    peer4Answer,
    peerStrength,
    peerSuggestion,
    peerReviewerUsername,
    peerSubmitted,
    finalConfidence,
    finalConfidenceReason,
    finalChallenge,
    finalStatsChange,
    finalClimateChange,
    finalConnectionChange,
    finalExtension,
    finalLearnerInsight,
    finalPreview,
    finalSubmitted,
  ]);

  useEffect(() => {
    if (!lesson3SnapshotLoaded.current) return;

    const persistSnapshot = async () => {
      try {
        await upsertStudentState(studentStateIdentifier.current || user.username, 'lesson3', lesson3Snapshot);
      } catch (e) {
        console.error('persist lesson3 snapshot failed', e);
      }
    };

    persistSnapshot();
  }, [lesson3Snapshot, user.username]);

  return (
    <div className="portal-container">
      <header className="portal-header">
        <div className="header-left">
          <span className="header-badge badge--lesson3">🎯</span>
          <div className="header-texts">
            <h1 className="portal-title">Lesson 3: Climate Predictions and Applications in Regression</h1>
            <p className="portal-subtitle">Student Section</p>
          </div>
        </div>
        <div className="header-right">
          <p className="welcome-text">Welcome, <strong>{displayName}</strong></p>
          <button className="logout-button" onClick={onBack}>Back to Dashboard</button>
        </div>
      </header>
      <main className="portal-content">
        {/* show teacher feedback and acknowledge button if available */}
        {serverFeedback && (
          <div style={{ padding: '12px 24px', background: '#f9f9f9', margin: '12px 0' }}>
            <strong>Teacher Feedback:</strong>
            <p>{serverFeedback.feedback_text}</p>
            {!serverFeedback.acknowledged && (
              <button onClick={async () => {
                const prof = await getMyProfile();
                const sid = prof?.id;
                if (sid) {
                  const fb = await acknowledgeFeedback(sid, 'lesson3');
                  setServerFeedback(fb);
                }
              }}>Acknowledge</button>
            )}
            {serverFeedback.acknowledged && serverFeedback.acknowledged_at && (
              <div style={{ fontSize: '0.9rem', color: '#555' }}>Acknowledged at {new Date(serverFeedback.acknowledged_at).toLocaleString()}</div>
            )}
          </div>
        )}
        <div className="lesson-container">
          <ProgressBar progress={Math.min(100, progressPct + lesson3ExtraPct)} />
          <div className="accordion">
            <div className="accordion-item overview">
              <div className="accordion-header" onClick={() => setOpen(o => ({ ...o, overview: !o.overview }))}>
                <h3>🧭 Mission Brief: What Will Our Weather Cost Us?</h3>
                <span>{open.overview ? '▼' : '▶'}</span>
              </div>
              {open.overview && (
                <div className="accordion-content">
                  <div className="mission-brief">
                    <div className="intro-text">
                      <div className="hero-title">📚 LESSON 3: Climate Predictions and Applications in Regression</div>
                      <div className="hero-subtitle"><em>AKA "Playing Fortune Teller, But With Math (So It Actually Works)"</em></div>
                        <div className="gap-3" />
                      <p>Hey there, future data detectives! 👋</p>
                      <p>
                        You&apos;ve found correlations. You&apos;ve built regression lines. Now it&apos;s time for the grand finale: PREDICTIONS! What if we could tell the barangay captain, "if next month is 3 degrees hotter, expect flooding to increase by this much"?
                      </p>
                      <p>
                        That&apos;s the power you&apos;re unlocking today. You&apos;re not just analyzing the past anymore—you&apos;re forecasting the future and helping your community prepare for it. Time to put your regression skills to work solving real problems! 🎯✨
                      </p>
                        <div className="gap-3" />
                    </div>

                    <div className="brief-grid two-up">
                      <div className="brief-card">
                        <div className="card-title">What You Will Master:</div>
                        <ul>
                          <li>Predict dependent variables like a boss (use your regression powers for good!)</li>
                          <li>Solve real-world regression problems (because hypothetical problems are boring)</li>
                        </ul>
                      </div>
                      <div className="brief-card">
                        <div className="card-title">Your Mission:</div>
                        <ul>
                          <li>Explain how regression equations let you see the future (kind of)</li>
                          <li>Predict outcomes with scary accuracy using your equations</li>
                          <li>Analyze problems, admit when math has limits (humility = science!), and still propose killer recommendations</li>
                        </ul>
                      </div>
                      <div className="brief-card epic-card">
                        <div className="card-title project-title">Your Epic Project: 🎯</div>
                        <div className="card-subtitle project-center">"What Will Our Weather Cost Us?" — Climate-Impact Prediction Project</div>
                        <p>
                          Model how climate variables affect real community concerns (flooding? crop loss? electric bills?), make actual predictions, and pitch solutions to stakeholders. You&apos;re basically saving the world, one equation at a time.
                        </p>
                        <p className="time-budget-text">⏰ Time Budget: 4 hours <span className="time-note"><em>(same as one really good nap)</em></span></p>
                      </div>
                    </div>

                    <div className="closing-text">
                      <h4 className="body-heading">Ready to Start This Adventure?</h4>
                      <p>
                        By the end of this lesson, you&apos;ll be a full-fledged climate forecaster. You&apos;ll plug numbers into your regression equation and out comes the future! You&apos;ll know not just what&apos;s happening, but what&apos;s going to happen—and what we can do about it. You&apos;ll present solutions so solid that community leaders will actually want to hear from you.
                      </p>
                      <div className="gap-2" />
                      <p><strong>So, what are you waiting for?</strong></p>
                      <p>Your final journey begins now with Phase 1. Let&apos;s turn your regression equation into a crystal ball that actually works! 🎯 ➡️ 📊 ➡️ 💡 ➡️ 🌍</p>
                      <div className="closing-cta">
                        <p><em>Click ahead to Phase 1, where we predict the future and change it for the better! 🔍</em></p>
                        <div className="section-actions start-row">
                          <button className="save-btn" onClick={() => setOpen(o=>({ ...o, overview:false, p1:true }))}>Start First Mission</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  
                </div>
              )}
            </div>

            <div className="accordion-item phase1">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p1: !o.p1 })); setP1Sections({ a1:false, a2:false }); }}>
                <h3>Phase 1: Reviewing Foundations and Exploring Variables</h3>
                <span>{open.p1 ? '▼' : '▶'}</span>
              </div>
              {open.p1 && (
                <div className="accordion-content">
                  <div className="sub-accordion">
                    <div className="sub-item">
                      <div className="sub-header green" onClick={()=> setP1Sections(s => ({ ...s, a1: !s.a1 }))}>
                        <span className="label"><span className="icon">🔎</span> <b>Activity 1: Revisiting Your Research Framework</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p1Sections.a1 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p1Sections.a1 ? 'block' : 'none' }}>
                        

                        <div className="brief-grid two-up" style={{gap:16, marginTop:16}}>
                          <div className="info-card" style={{minHeight:120}}>
                            <div style={{fontWeight:700}}>🧭 What you will do:</div>
                            <div style={{marginTop:8}}>• You will review and summarize the key elements of your research, including your variables, research question, regression equation, and what that equation means in the context of your study.</div>
                          </div>
                          <div className="info-card" style={{minHeight:120}}>
                            <div style={{fontWeight:700}}>🛠️ How to do it:</div>
                            <div style={{marginTop:8}}>• Retrieve your previous work and identify each component—your independent variable (what you're testing), dependent variable (what you're measuring), research question, regression line equation, and your interpretation of what the equation tells you about the relationship between variables.<br/>• Write these down clearly for reference.</div>
                          </div>
                        </div>

                        <div className="card" style={{marginTop:16, padding:16}}>
                          <div style={{fontWeight:700, textAlign:'left'}}>Recalling Research Key Components</div>
                          <p style={{marginTop:8, marginBottom:12, textAlign:'left'}}>Recall the following components of your previous project and complete the needed information below.</p>

                          <div style={{marginTop:12}}>
                            <div style={{fontWeight:700, marginBottom:6}}>A. Our Research Question:</div>
                            <input value={recallA} onChange={(e)=>setRecallA(e.target.value)} readOnly={recallLocked} style={{width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:8, background:'var(--input-bg)'}} />
                            <div style={{height:8}} />

                            <div style={{fontWeight:700, marginBottom:6}}>B. Our Regression Line Equation:</div>
                            <input value={recallB} onChange={(e)=>setRecallB(e.target.value)} readOnly={recallLocked} style={{width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:8, background:'var(--input-bg)'}} />
                            <div style={{height:8}} />

                            <div style={{fontWeight:700, marginBottom:6}}>C. Our Interpretation of the Equation:</div>
                            <input value={recallC} onChange={(e)=>setRecallC(e.target.value)} readOnly={recallLocked} style={{width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:8, background:'var(--input-bg)'}} />
                            <div style={{height:16}} />

                            <div className="section-actions">
                              <button className="save-btn" disabled={recallLocked || !(recallA.trim() && recallB.trim() && recallC.trim())} onClick={()=>{
                                if (!(recallA.trim() && recallB.trim() && recallC.trim())) return;
                                try {
                                  saveLesson3Phase1Activity1(user.username, { researchQuestion: recallA.trim(), regressionEquation: recallB.trim(), interpretation: recallC.trim(), timestamp: new Date().toISOString() });
                                } catch (e) { console.error('save failed', e); }
                                setRecallLocked(true);
                                // award 10% extra progress for finalizing these components
                                try {
                                  const current = getUserProgress(user.username) || {1:0,2:0,3:0,4:0,5:0};
                                  const cur = Number(current[4] || 0) || 0;
                                  const extra = Math.min(100 - cur, 10);
                                  if (extra > 0) {
                                    const newExtra = Math.min(100, lesson3ExtraPct + extra);
                                    setLesson3ExtraPct(newExtra);
                                    try { localStorage.setItem('lesson3_extra_progress', String(newExtra)); } catch {}
                                    setUserProgress(user.username, 4, Math.min(100, cur + extra));
                                  }
                                } catch (e) { /* ignore */ }
                              }}>Finalize Components</button>
                            </div>
                          </div>
                        </div>

                        
                        
                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header green" onClick={()=> setP1Sections(s => ({ ...s, a2: !s.a2 }))}>
                        <span className="label"><span className="icon">🔍</span> <b>Activity 2: Identifying Confounding Variables</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p1Sections.a2 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p1Sections.a2 ? 'block' : 'none' }}>
                        <div className="brief-grid two-up" style={{gap:16, marginTop:8}}>
                          <div className="info-card" style={{minHeight:100}}>
                            <div style={{fontWeight:700}}>🧭 What you will do:</div>
                            <div style={{marginTop:8}}>• You will collaborate with your group to identify other possible factors beyond your independent variable that could influence your dependent variable.</div>
                          </div>
                          <div className="info-card" style={{minHeight:100}}>
                            <div style={{fontWeight:700}}>🛠️ How to do it:</div>
                            <div style={{marginTop:8}}>• Discuss with your group members what other real-world factors might affect your results.<br/>• Consider environmental, social, temporal, or other contextual variables that weren't part of your original study but could impact your dependent variable.<br/>• Create a list of these potential confounding factors.</div>
                          </div>
                        </div>

                        <div className="card" style={{marginTop:16, padding:16}}>
                          <div style={{fontWeight:700, textAlign:'left'}}>Brainstorming on Other Factors that Affect the Dependent Variable</div>
                          <p style={{marginTop:8, marginBottom:12, textAlign:'left'}}>Discuss with your group members other factors aside from your independent variable that you think can also influence your dependent variable. Encode your answers below.</p>

                          <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:12}}>
                            <div style={{fontWeight:700}}>Our Dependent Variable:</div>
                            <input value={depVar} onChange={(e)=>setDepVar(e.target.value)} readOnly={submitted2} style={{flex:1, padding:10, border:'1px solid var(--input-border)', borderRadius:8, background:'var(--input-bg)'}} />
                          </div>

                          <div style={{fontWeight:700, marginTop:8, marginBottom:8}}>Other factors that we think can also influence our dependent variable:</div>
                          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10}}>
                            {otherFactors.map((v,i)=> (
                              <input key={i} value={v} onChange={(e)=>{ const arr=[...otherFactors]; arr[i]=e.target.value; setOtherFactors(arr); }} readOnly={submitted2} placeholder={`Factor ${i+1}`} style={{padding:10, border:'1px solid var(--input-border)', borderRadius:8, background:'var(--input-bg)'}} />
                            ))}
                          </div>

                          <div style={{marginTop:12}}>
                            <button className="save-btn" disabled={(otherFactors.filter(s=>s.trim()).length<4) || submitted2} onClick={()=>{
                              const filled = otherFactors.filter(s=>s.trim());
                              if (filled.length<4) return;
                              setGenerated({ nodes: filled });
                            }}>Generate Diagram</button>
                            <button style={{marginLeft:12}} className="save-btn" disabled={!generated} onClick={async ()=>{
                              const svgEl = document.getElementById('concept-svg') as SVGSVGElement | null;
                              if (!svgEl) return;
                              // clone and ensure xmlns for proper serialization
                              const clone = svgEl.cloneNode(true) as SVGElement;
                              if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                              const serializer = new XMLSerializer();
                              let svgString = serializer.serializeToString(clone);
                              // make data URL (encode) to avoid blob/object URL issues with foreignObject
                              // resolve CSS variables used in SVG (phase1 palette) so exported image preserves colors
                              const phaseEl = document.querySelector('.accordion-item.phase1') as HTMLElement | null;
                              let cardsBg = '#FFF5F2', inputBorder = '#FFD4C4', textColor = '#8A5D4D';
                              let plotPrimary = '#6B3D2F', plotSecondary = '#E6B8A5', plotValuePrimary = '#4D2920';
                              if (phaseEl) {
                                const cs = getComputedStyle(phaseEl);
                                cardsBg = (cs.getPropertyValue('--cards-bg') || cardsBg).trim();
                                inputBorder = (cs.getPropertyValue('--input-border') || inputBorder).trim();
                                textColor = (cs.getPropertyValue('--p-regular') || textColor).trim();
                                plotPrimary = (cs.getPropertyValue('--plot-primary') || plotPrimary).trim();
                                plotSecondary = (cs.getPropertyValue('--plot-secondary') || plotSecondary).trim();
                                plotValuePrimary = (cs.getPropertyValue('--plot-value-primary') || plotValuePrimary).trim();
                              }
                              // replace CSS var references with actual colors so exported image keeps palette
                              svgString = svgString
                                .replace(/var\(--cards-bg\)/g, cardsBg)
                                .replace(/var\(--input-border\)/g, inputBorder)
                                .replace(/var\(--text-color\)/g, textColor)
                                .replace(/var\(--plot-primary\)/g, plotPrimary)
                                .replace(/var\(--plot-secondary\)/g, plotSecondary)
                                .replace(/var\(--plot-value-primary\)/g, plotValuePrimary);
                              const svgData = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
                              const img = new Image();
                              // use same size as SVG viewBox (800x600)
                              const canvas = document.createElement('canvas');
                              canvas.width = 800; canvas.height = 600;
                              const ctx = canvas.getContext('2d');
                              if (!ctx) return;
                              img.onload = () => {
                                ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
                                ctx.drawImage(img,0,0,canvas.width,canvas.height);
                                const a = document.createElement('a');
                                a.href = canvas.toDataURL('image/jpeg', 0.92);
                                a.download = 'concept-map.jpg';
                                a.click();
                              };
                              img.onerror = (e) => { console.error('SVG -> Image load error', e); };
                              img.src = svgData;
                            }}>Download Diagram</button>
                          </div>

                          <div style={{height:16}} />
                          <div style={{width:'100%', padding:8, border:'1px dashed var(--input-border)', borderRadius:8, minHeight:240, display:'flex', alignItems:'center', justifyContent:'center'}}>
                            <div style={{width:'80%', height:'80%', display:'flex', alignItems:'center', justifyContent:'center'}}>
                              {generated ? (
                                <div style={{width:'100%'}}>
                                  <div style={{width:'100%', paddingBottom:'75%', position:'relative'}}>
                                    <div style={{position:'absolute', inset:0}}>
                                      <svg id="concept-svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" style={{width:'100%', height:'100%'}}>
                                        <defs>
                                          <style>{`.node{fill:#FFF5F9;stroke:#FFD4E4;stroke-width:2}.label{font:14px sans-serif;fill:#2C2C2C}`}</style>
                                        </defs>
                                        <rect x={0} y={0} width={800} height={600} fill="transparent" />
                                        {(() => {
                                          const nodes = generated.nodes;
                                          const cx = 400, cy = 300;
                                          const angleStep = (Math.PI*2)/nodes.length;
                                          const boxW = 2.0 * 96; // 2.00 inches in px (width)
                                          const boxH = 0.5 * 96; // 0.50 inches in px (height)
                                          // compute positions
                                          // Place factor boxes radially around the center box while ensuring
                                          // (1) gap from dependent box edge <= 1 inch (96px) where possible,
                                          // (2) no overlapping among factor boxes, and
                                          // (3) boxes remain inside the 800x600 frame.
                                          const nodesList = nodes;
                                          const halfCenterW = (3.5 * 96) / 2;
                                          const halfCenterH = (0.75 * 96) / 2;
                                          const halfBoxW = boxW / 2;
                                          const halfBoxH = boxH / 2;

                                          // Try progressive gap values (0 up to 1in) until we find positions with no overlaps
                                          const tryPositionsForGap = (gap: number) => {
                                            const rects = [];
                                            const positions = [];
                                            for (let idx=0; idx<nodesList.length; idx++) {
                                              const a = idx*angleStep - Math.PI/2;
                                              const dx = Math.cos(a);
                                              const dy = Math.sin(a);
                                              let tEdge;
                                              const eps = 1e-6;
                                              if (Math.abs(dx) < eps) tEdge = halfCenterH/Math.abs(dy);
                                              else if (Math.abs(dy) < eps) tEdge = halfCenterW/Math.abs(dx);
                                              else tEdge = Math.min(halfCenterW/Math.abs(dx), halfCenterH/Math.abs(dy));

                                              // approximate factor radial half-projection
                                              const factorRadial = Math.max(Math.abs(dx)*halfBoxW, Math.abs(dy)*halfBoxH);
                                              let dist = tEdge + gap + factorRadial;

                                              // reduce dist if placement would overflow frame
                                              let x = cx + dx*dist;
                                              let y = cy + dy*dist;
                                              let tries=0;
                                              while ((x - halfBoxW < 0 || x + halfBoxW > 800 || y - halfBoxH < 0 || y + halfBoxH > 600) && tries<20) {
                                                dist -= 8; x = cx + dx*dist; y = cy + dy*dist; tries++;
                                              }

                                              const rect = { left: x - halfBoxW, top: y - halfBoxH, right: x + halfBoxW, bottom: y + halfBoxH };
                                              rects.push(rect);
                                              positions.push({ x, y });
                                            }

                                            // Check overlaps
                                            const overlap = (r1: { left: number; right: number; top: number; bottom: number }, r2: { left: number; right: number; top: number; bottom: number }) => !(r1.right <= r2.left || r1.left >= r2.right || r1.bottom <= r2.top || r1.top >= r2.bottom);
                                            for (let i=0;i<rects.length;i++){
                                              for (let j=i+1;j<rects.length;j++){
                                                if (overlap(rects[i], rects[j])) return null;
                                              }
                                            }
                                            return positions;
                                          }

                                          let positions = null;
                                          for (let gap=0; gap<=96; gap+=4) {
                                            const tryPos = tryPositionsForGap(gap);
                                            if (tryPos) { positions = tryPos; break; }
                                          }
                                          // fallback: place at default radius
                                          if (!positions) {
                                            positions = nodesList.map((n, idx) => { const a = idx*angleStep - Math.PI/2; return { x: cx + Math.cos(a)*180, y: cy + Math.sin(a)*180 }; });
                                          }

                                          const maxY = Math.max(...positions.map(p => p.y + halfBoxH));

                                          return (
                                            <g>
                                              {positions.map((p, idx) => (
                                                <g key={idx}>
                                                  <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--plot-primary)" strokeWidth={2} />
                                                  <rect x={p.x - halfBoxW} y={p.y - halfBoxH} rx={20} ry={20} width={boxW} height={boxH} fill="var(--cards-bg)" stroke="var(--input-border)" strokeWidth={2} />
                                                  <foreignObject x={p.x - halfBoxW + 6} y={p.y - halfBoxH + 6} width={boxW - 12} height={boxH - 12}>
                                                    <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%', padding:'6px', textAlign:'center', overflow:'hidden', fontSize:12, color:'var(--text-color)'}}>{nodesList[idx]}</div>
                                                  </foreignObject>
                                                </g>
                                              ))}
                                              {/* center dependent variable box - larger fixed size */}
                                              <g>
                                                {(() => {
                                                  const centerW = 3.5 * 96; // 3.5 inches width
                                                  const centerH = 0.75 * 96; // 0.75 inches height
                                                  return (
                                                    <g>
                                                      <rect x={cx - centerW/2} y={cy - centerH/2} rx={28} ry={28} width={centerW} height={centerH} fill="var(--cards-bg)" stroke="var(--input-border)" strokeWidth={2} />
                                                      <foreignObject x={cx - centerW/2 + 6} y={cy - centerH/2 + 6} width={centerW - 12} height={centerH - 12}>
                                                        <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%', padding:'6px', textAlign:'center', overflow:'hidden', fontSize:14, color:'var(--text-color)', fontWeight:700}}>{depVar || 'Dependent Variable'}</div>
                                                      </foreignObject>
                                                    </g>
                                                  );
                                                })()}
                                              </g>
                                              {/* caption centered below bottom-most box */}
                                              {(() => {
                                                const centerH = 0.75 * 96;
                                                const centerBottom = cy + centerH/2;
                                                const overallMax = Math.max(maxY, centerBottom);
                                                return <text x={cx} y={Math.min(580, overallMax + 40)} textAnchor="middle" style={{fontSize:14, fontWeight:700, fill:'var(--text-color)'}}>Figure 1. Concept Mapping of Other Factors that Influence {depVar || 'Dependent Variable'}</text>;
                                              })()}
                                            </g>
                                          );
                                        })()}
                                      </svg>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="hint">Diagram preview will appear here after generation.</div>
                              )}
                            </div>
                          </div>

                          <div style={{height:16}} />
                          <div style={{display:'flex', alignItems:'center', gap:12}}>
                            <div style={{fontWeight:700}}>Upload your concept map here:</div>
                            <input type="file" accept="image/*" disabled={submitted2} onChange={(e)=>{ const f = e.target.files?.[0] ?? null; setUploadedDiagram(f); if (f) { try { const reader = new FileReader(); reader.onload = (ev) => { setUploadedDiagramPreview(String(ev.target?.result || '')); }; reader.readAsDataURL(f); } catch (err) { setUploadedDiagramPreview(null); } } }} />
                          </div>

                          <div style={{height:16}} />
                          <div style={{fontWeight:700}}>What were your considerations for identifying these factors to influence your dependent variable?</div>
                          <textarea rows={3} value={finalConsiderations} onChange={(e)=>setFinalConsiderations(e.target.value)} readOnly={submitted2} style={{width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:8, background:'var(--input-bg)'}} />
                          <div style={{height:20}} />
                          <div className="section-actions">
                            <button className="save-btn" disabled={submitted2 || (!uploadedDiagram && !uploadedDiagramPreview && !finalConsiderations.trim())} onClick={async ()=>{
                              if (submitted2) return;
                              if (!uploadedDiagram && !uploadedDiagramPreview && !finalConsiderations.trim()) return;
                              // avoid double-award if already saved
                              let alreadySaved = false;
                              try {
                                const all = getLesson3Phase1Activity2All();
                                if (all && all[user.username]) alreadySaved = true;
                              } catch (e) { /* ignore */ }

                              // read file to dataURL if a new file was uploaded
                              let fileDataUrl: string | undefined = undefined;
                              let filename: string | undefined = undefined;
                              if (uploadedDiagram) {
                                filename = uploadedDiagram.name;
                                try {
                                  fileDataUrl = await new Promise<string>((res, rej) => {
                                    const r = new FileReader();
                                    r.onload = () => res(String(r.result || ''));
                                    r.onerror = () => rej(new Error('read error'));
                                    r.readAsDataURL(uploadedDiagram);
                                  });
                                } catch (e) { console.error('file read failed', e); }
                              } else if (uploadedDiagramPreview) {
                                fileDataUrl = uploadedDiagramPreview;
                              }

                              try {
                                await saveLesson3Phase1Activity2(user.username, { fileDataUrl, filename, considerations: finalConsiderations.trim(), timestamp: new Date().toISOString() });
                              } catch (e) { console.error('save failed', e); }

                              setSubmitted2(true);

                              // award 15% extra progress for Activity2 if not previously awarded
                              try {
                                if (!alreadySaved) {
                                  const current = getUserProgress(user.username) || {1:0,2:0,3:0,4:0,5:0};
                                  const cur = Number(current[4] || 0) || 0;
                                  const extra = Math.min(100 - cur, 15);
                                  if (extra > 0) {
                                    const newExtra = Math.min(100, lesson3ExtraPct + extra);
                                    setLesson3ExtraPct(newExtra);
                                    try { localStorage.setItem('lesson3_extra_progress', String(newExtra)); } catch {}
                                    setUserProgress(user.username, 4, Math.min(100, cur + extra));
                                  }
                                }
                              } catch (e) { /* ignore */ }
                            }}>Submit Answer</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="accordion-item phase2">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p2: !o.p2 })); setP2Sections({ a1:false, a2:false, a3:false }); }}>
                <h3>Phase 2: Testing Predictions and Model Strength</h3>
                <span>{open.p2 ? '▼' : '▶'}</span>
              </div>
              {open.p2 && (
                <div className="accordion-content">
                  <div className="sub-accordion">
                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2Sections(s => ({ ...s, a1: !s.a1 }))}>
                        <span className="label"><span className="icon">📈</span> <b>Activity 1: Making Predictions Within Your Data Range</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p2Sections.a1 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p2Sections.a1 ? 'block' : 'none' }}>
                        <div className="brief-grid two-up" style={{gap:16, marginTop:8}}>
                          <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'flex-start'}}>
                            <div style={{fontWeight:700}}>🧭 What you will do:</div>
                            <div style={{marginTop:8}}>• You will use your regression equation to predict dependent variable values for independent variable values that fall within the range of your collected data.</div>
                          </div>
                          <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'flex-start'}}>
                            <div style={{fontWeight:700}}>🛠️ How to do it:</div>
                            <div style={{marginTop:8}}>• Access the interpolation sheet from the provided link.<br/>• Select values for your independent variable that are within the minimum and maximum values of your dataset.<br/>• Use your regression equation to calculate the predicted y-values and compare them to the pattern in your data.</div>
                          </div>
                        </div>

                        <div className="card" style={{marginTop:16, padding:16}}>
                          <div style={{fontWeight:700, textAlign:'left'}}>Interpolation Prediction Activity</div>
                          <div style={{marginTop:8, textAlign:'left'}}>
                            <div>
                              Instructions:<br/>
                              1. Click on the link to open the interpolation sheet.<br/>
                              2. Make a copy of the template for yourself.<br/>
                              3. Using the data of your independent variable, complete the tasks in the sheet.<br/>
                              4. When you're finished, download your completed work in PDF format.<br/>
                              5. Upload your file using the link below.
                            </div>
                          </div>

                          <div style={{height:24}} />
                          <a href="https://docs.google.com/spreadsheets/d/1bF_BgkRRgKfyutA9DDFF6XcnHg2soSZkwJbBMZmEg8g/edit?usp=sharing" target="_blank" rel="noopener noreferrer">
                            <button className="save-btn" style={{padding:'12px 22px', fontSize:16}}>Interpolation Activity</button>
                          </a>

                          <div style={{height:40}} />
                          <div style={{fontWeight:700, textAlign:'left'}}>Upload your output here.</div>
                          <div style={{marginTop:8, textAlign:'left'}}>Before uploading, make sure it is in PDF format with this filename format: <strong>Lesson3_Phase2_Activity1_username</strong>.</div>

                          <div style={{height:24}} />
                          <div style={{display:'flex', alignItems:'center', gap:12}}>
                            <input type="file" accept="application/pdf" disabled={p2a1Submitted} onChange={(e)=>{
                              const f = e.target.files?.[0] ?? null; setP2a1File(f);
                              if (f) {
                                try {
                                  const reader = new FileReader();
                                  reader.onload = () => { setP2a1Preview(String(reader.result || '')); };
                                  reader.readAsDataURL(f);
                                } catch (err) { setP2a1Preview(null); }
                              } else setP2a1Preview(null);
                            }} />
                          </div>

                          <div style={{height:24}} />
                          <div style={{width:'100%', padding:8, border:'3px solid rgba(0,0,0,0.18)', borderRadius:8, minHeight:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                            <div style={{width:'100%', paddingTop:'56.25%', position:'relative'}}>
                              <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                                {p2a1Preview ? (
                                  <iframe src={p2a1Preview} style={{width:'100%', height:'100%', border:'none'}} title="Preview" />
                                ) : (
                                  <div className="hint">No file uploaded. Preview will appear here.</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{height:40}} />
                          <div className="section-actions" style={{display:'flex', justifyContent:'flex-start'}}>
                            <button className="save-btn" disabled={p2a1Submitted || !p2a1File} onClick={async ()=>{ if (!p2a1File) return; 
                              // check if already saved to avoid double-award
                              let alreadySaved = false;
                              try {
                                const all = getLesson3Phase2Activity1All();
                                if (all && all[user.username]) alreadySaved = true;
                              } catch (e) { /* ignore */ }
                              // read file to dataURL and save
                              let fileDataUrl: string | undefined = undefined;
                              try {
                                fileDataUrl = await new Promise<string>((res, rej) => {
                                  const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => rej(new Error('read error')); r.readAsDataURL(p2a1File);
                                });
                              } catch (e) { console.error('read failed', e); }
                              try { await saveLesson3Phase2Activity1(user.username, { fileDataUrl, filename: p2a1File.name, timestamp: new Date().toISOString() }); } catch (e) { console.error('save failed', e); }
                              setP2a1Submitted(true);
                              // award 8% if not previously saved
                              try {
                                if (!alreadySaved) {
                                  const current = getUserProgress(user.username) || {1:0,2:0,3:0,4:0,5:0};
                                  const cur = Number(current[4] || 0) || 0;
                                  const extra = Math.min(100 - cur, 8);
                                  if (extra > 0) {
                                    const newExtra = Math.min(100, lesson3ExtraPct + extra);
                                    setLesson3ExtraPct(newExtra);
                                    try { localStorage.setItem('lesson3_extra_progress', String(newExtra)); } catch {}
                                    setUserProgress(user.username, 4, Math.min(100, cur + extra));
                                  }
                                }
                              } catch (e) { /* ignore */ }
                            }}>Submit Output</button>
                          </div>

                          {p2a1Submitted && (
                            <div style={{marginTop:12, textAlign:'left'}}>
                              You just unlocked 'Interpolation Power'—predicting y-values INSIDE your data like a detective finding clues in the evidence! You're basically Sherlock Holmes with graphs! 🕵️‍♀️
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2Sections(s => ({ ...s, a2: !s.a2 }))}>
                        <span className="label"><span className="icon">📈</span> <b>Activity 2: Making Predictions Beyond Your Data Range</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p2Sections.a2 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p2Sections.a2 ? 'block' : 'none' }}>
                        <div className="brief-grid two-up" style={{gap:16, marginTop:8}}>
                          <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'flex-start'}}>
                            <div style={{fontWeight:700}}>🧭 What you will do:</div>
                            <div style={{marginTop:8}}>• You will use your regression equation to predict dependent variable values for independent variable values that fall outside the range of your collected data.</div>
                          </div>
                          <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'center'}}>
                            <div style={{fontWeight:700}}>🛠️ How to do it:</div>
                            <div style={{marginTop:8}}>• Access the extrapolation sheet from the provided link.<br/>• Choose values for your independent variable that are either lower than your minimum or higher than your maximum data points.<br/>• Calculate the predicted y-values using your regression equation and consider the reliability and limitations of these predictions.</div>
                          </div>
                        </div>

                        <div className="card" style={{marginTop:16, padding:16}}>
                          <div style={{fontWeight:700, textAlign:'left'}}>Extrapolation Prediction Activity</div>
                          <div style={{marginTop:8, textAlign:'left'}}>
                            <div>
                              Instructions:<br/>
                              1. Click on the link to open the extrapolation sheet.<br/>
                              2. Make a copy of the template for yourself.<br/>
                              3. Using the data of your independent variable, complete the tasks in the sheet.<br/>
                              4. When you're finished, download your completed work in PDF format.<br/>
                              5. Upload your file using the link below.
                            </div>
                          </div>

                          <div style={{height:24}} />
                          <a href="https://docs.google.com/spreadsheets/d/1MuRMynHrNFCp1VBwali8HhWZMfbuAP9fks5U0wOLpi0/edit?usp=sharing" target="_blank" rel="noopener noreferrer">
                            <button className="save-btn" style={{padding:'12px 22px', fontSize:16}}>Extrapolation Activity</button>
                          </a>

                          <div style={{height:40}} />
                          <div style={{fontWeight:700, textAlign:'left'}}>Upload your output here.</div>
                          <div style={{marginTop:8, textAlign:'left'}}>Before uploading, make sure it is in PDF format with this filename format: <strong>Lesson3_Phase2_Activity2_username</strong>.</div>

                          <div style={{height:24}} />
                          <div style={{display:'flex', alignItems:'center', gap:12}}>
                            <input type="file" accept="application/pdf" disabled={p2a2Submitted} onChange={(e)=>{
                              const f = e.target.files?.[0] ?? null; setP2a2File(f);
                              if (f) {
                                try {
                                  const reader = new FileReader();
                                  reader.onload = () => { setP2a2Preview(String(reader.result || '')); };
                                  reader.readAsDataURL(f);
                                } catch (err) { setP2a2Preview(null); }
                              } else setP2a2Preview(null);
                            }} />
                          </div>

                          <div style={{height:24}} />
                          <div style={{width:'100%', padding:8, border:'3px solid rgba(0,0,0,0.34)', borderRadius:8, minHeight:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                            <div style={{width:'100%', paddingTop:'56.25%', position:'relative'}}>
                              <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                                {p2a2Preview ? (
                                  <iframe src={p2a2Preview} style={{width:'100%', height:'100%', border:'none'}} title="Preview" />
                                ) : (
                                  <div className="hint">No file uploaded. Preview will appear here.</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{height:40}} />
                          <div className="section-actions" style={{display:'flex', justifyContent:'flex-start'}}>
                            <button className="save-btn" disabled={p2a2Submitted || !p2a2File} onClick={async ()=>{
                              if (!p2a2File) return;
                              // avoid double-award if already saved
                              let alreadySaved = false;
                              try {
                                const all = getLesson3Phase2Activity2All();
                                if (all && all[user.username]) alreadySaved = true;
                              } catch (e) { /* ignore */ }

                              // read file to dataURL
                              let fileDataUrl: string | undefined = undefined;
                              try {
                                fileDataUrl = await new Promise<string>((res, rej) => {
                                  const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => rej(new Error('read error')); r.readAsDataURL(p2a2File);
                                });
                              } catch (e) { console.error('read failed', e); }

                              try {
                                await saveLesson3Phase2Activity2(user.username, { fileDataUrl, filename: p2a2File.name, timestamp: new Date().toISOString() });
                              } catch (e) { console.error('save failed', e); }

                              setP2a2Submitted(true);

                              // award 8% if not previously saved
                              try {
                                if (!alreadySaved) {
                                  const current = getUserProgress(user.username) || {1:0,2:0,3:0,4:0,5:0};
                                  const cur = Number(current[4] || 0) || 0;
                                  const extra = Math.min(100 - cur, 8);
                                  if (extra > 0) {
                                    const newExtra = Math.min(100, lesson3ExtraPct + extra);
                                    setLesson3ExtraPct(newExtra);
                                    try { localStorage.setItem('lesson3_extra_progress', String(newExtra)); } catch {}
                                    setUserProgress(user.username, 4, Math.min(100, cur + extra));
                                  }
                                }
                              } catch (e) { /* ignore */ }
                            }}>Submit Output</button>
                          </div>

                          {p2a2Submitted && (
                            <div style={{marginTop:12, textAlign:'left'}}>
                              Woohoo! You've mastered extrapolation—predicting y-values BEYOND your data range! You're like a math fortune teller gazing into the crystal ball of numbers! 🔮✨
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2Sections(s => ({ ...s, a3: !s.a3 }))}>
                        <span className="label"><span className="icon">📊</span> <b>Activity 3: Determining the Strength of Your Model</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p2Sections.a3 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p2Sections.a3 ? 'block' : 'none' }}>
                        <div className="brief-grid two-up" style={{gap:16, marginTop:8}}>
                          <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'flex-start'}}>
                            <div style={{fontWeight:700}}>🧭 What you will do:</div>
                            <div style={{marginTop:8}}>• You will calculate the coefficient of determination (R²) to measure how well your regression line explains the variation in your dependent variable.</div>
                          </div>
                          <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'center'}}>
                            <div style={{fontWeight:700}}>🛠️ How to do it:</div>
                            <div style={{marginTop:8}}>• Use the determination link to access the calculation sheet.<br/>• Follow the steps to compute R², which will give you a value between 0 and 1.<br/>• This value indicates what percentage of the variation in your dependent variable is explained by your independent variable—the closer to 1, the stronger your model.</div>
                          </div>
                        </div>

                        <div className="card" style={{marginTop:16, padding:16}}>
                          <div style={{fontWeight:700, textAlign:'left'}}>Understanding Coefficient Determination</div>
                          <div style={{marginTop:8, textAlign:'left'}}>
                            <div>
                              Instructions:<br/>
                              1. Click on the link to open the coefficient determination sheet.<br/>
                              2. Make a copy of the template for yourself.<br/>
                              3. Using the data of your independent variable, complete the tasks in the sheet.<br/>
                              4. When you're finished, download your completed work in PDF format.<br/>
                              5. Upload your file using the link below.
                            </div>
                          </div>

                          <div style={{height:24}} />
                          <a href="https://docs.google.com/spreadsheets/d/1vwFv_VYcQ7k_5hDK9UwvdqpNpBrfe19sTx4-ZbonNwM/edit?usp=sharing" target="_blank" rel="noopener noreferrer">
                            <button className="save-btn" style={{padding:'12px 22px', fontSize:16}}>Coefficient of Determination Activity</button>
                          </a>

                          <div style={{height:40}} />
                          <div style={{fontWeight:700, textAlign:'left'}}>Upload your output here.</div>
                          <div style={{marginTop:8, textAlign:'left'}}>Before uploading, make sure it is in PDF format with this filename format: <strong>Lesson3_Phase2_Activity3_username</strong>.</div>

                          <div style={{height:24}} />
                          <div style={{display:'flex', alignItems:'center', gap:12}}>
                            <input type="file" accept="application/pdf" disabled={p2a3Submitted} onChange={(e)=>{
                              const f = e.target.files?.[0] ?? null; setP2a3File(f);
                              if (f) {
                                try {
                                  const reader = new FileReader();
                                  reader.onload = () => { setP2a3Preview(String(reader.result || '')); };
                                  reader.readAsDataURL(f);
                                } catch (err) { setP2a3Preview(null); }
                              } else setP2a3Preview(null);
                            }} />
                          </div>

                          <div style={{height:24}} />
                          <div style={{width:'100%', padding:8, border:'3px solid rgba(0,0,0,0.34)', borderRadius:8, minHeight:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                            <div style={{width:'100%', paddingTop:'56.25%', position:'relative'}}>
                              <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                                {p2a3Preview ? (
                                  <iframe src={p2a3Preview} style={{width:'100%', height:'100%', border:'none'}} title="Preview" />
                                ) : (
                                  <div className="hint">No file uploaded. Preview will appear here.</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{height:24}} />
                          <div style={{fontWeight:700, textAlign:'left'}}>What does the coefficient determination tell you about the predicting power of your independent variable?</div>
                          <div style={{height:8}} />
                          <textarea value={p2a3Answer} onChange={(e)=>setP2a3Answer(e.target.value)} readOnly={p2a3Submitted} placeholder="Type your interpretation here..." rows={4} style={{width:'100%', padding:14, border:'2px solid rgba(0,0,0,0.45)', borderRadius:8, background:'var(--input-bg)', marginRight:12, minHeight:120}} />
                          <div style={{height:8}} />
                          <div style={{fontSize:12, fontStyle:'italic', color:'rgba(0,0,0,0.7)'}}>Template: The coefficient of determination value (r2=0.827) indicates that the independent variable, heat index, explains 82.7% of the variability of the dependent variable, which is heat-related illnesses, leaving 17.3% of the variability of the dependent variable can be explained by variables not covered by the analysis.</div>

                          <div style={{height:32}} />
                          <div className="section-actions" style={{display:'flex', justifyContent:'flex-start'}}>
                            <button className="save-btn" disabled={p2a3Submitted || (!p2a3File && !p2a3Answer.trim())} onClick={async ()=>{
                              if (p2a3Submitted) return;
                              if (!p2a3File && !p2a3Answer.trim()) return;

                              // avoid double-award if already saved
                              let alreadySaved = false;
                              try {
                                const all = getLesson3Phase2Activity3All();
                                if (all && all[user.username]) alreadySaved = true;
                              } catch (e) { /* ignore */ }

                              // read file to dataURL if file present
                              let fileDataUrl: string | undefined = undefined;
                              let filename: string | undefined = undefined;
                              if (p2a3File) {
                                filename = p2a3File.name;
                                try {
                                  fileDataUrl = await new Promise<string>((res, rej) => {
                                    const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => rej(new Error('read error')); r.readAsDataURL(p2a3File);
                                  });
                                } catch (e) { console.error('read failed', e); }
                              } else if (p2a3Preview) {
                                fileDataUrl = p2a3Preview;
                              }

                              try {
                                await saveLesson3Phase2Activity3(user.username, { fileDataUrl, filename, interpretation: p2a3Answer.trim(), timestamp: new Date().toISOString() });
                              } catch (e) { console.error('save failed', e); }

                              setP2a3Submitted(true);

                              // award 9% extra progress for Activity3 if not previously saved
                              try {
                                if (!alreadySaved) {
                                  const current = getUserProgress(user.username) || {1:0,2:0,3:0,4:0,5:0};
                                  const cur = Number(current[4] || 0) || 0;
                                  const extra = Math.min(100 - cur, 9);
                                  if (extra > 0) {
                                    const newExtra = Math.min(100, lesson3ExtraPct + extra);
                                    setLesson3ExtraPct(newExtra);
                                    try { localStorage.setItem('lesson3_extra_progress', String(newExtra)); } catch {}
                                    setUserProgress(user.username, 4, Math.min(100, cur + extra));
                                  }
                                }
                              } catch (e) { /* ignore */ }
                            }}>Submit Output</button>
                          </div>

                          {p2a3Submitted && (
                            <div style={{marginTop:12, textAlign:'left'}}>
                              You just figured out how strong your regression line's predicting powers are! Is it a superhero or just pretty good? Either way, YOU nailed it like a boss! 💪🎯
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="accordion-item phase3">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p3: !o.p3 })); }}>
                <h3>Phase 3: Refining Evidence-Based Recommendations</h3>
                <span>{open.p3 ? '▼' : '▶'}</span>
              </div>
              {open.p3 && (
                <div className="accordion-content">
                  <div className="brief-grid two-up" style={{gap:16, marginTop:8}}>
                    <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'flex-start'}}>
                      <div style={{fontWeight:700}}>🧭 What you will do:</div>
                      <div style={{marginTop:8}}>• You will revisit your initial recommendation from Lesson 2 and improve it by incorporating your understanding of correlation strength and how much of the variation your model explains.</div>
                    </div>
                    <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'center'}}>
                      <div style={{fontWeight:700}}>🛠️ How to do it:</div>
                      <div style={{marginTop:8}}>• Review your original recommendation and consider what you've learned about the strength of the relationship between your variables (correlation) and how much of the outcome your model can explain (R²).<br/>• Adjust your recommendation to be more accurate, nuanced, and evidence-based, acknowledging both the strengths and limitations of your findings.</div>
                    </div>
                  </div>

                  <div className="card" style={{marginTop:16, padding:16}}>
                    <div style={{fontWeight:700, textAlign:'left'}}>Our Evidence-Based Recommendation</div>
                    <div style={{marginTop:8, textAlign:'left'}}>
                      <div>
                        Instructions:<br/>
                        1. Click on the link to open the template.<br/>
                        2. Make a copy of the template for yourself.<br/>
                        3. Discuss with your group members and complete the activity.<br/>
                        4. When you're finished, download your completed work.<br/>
                        5. Upload your file using the link below.
                      </div>
                    </div>

                    <div style={{height:24}} />
                    <a href="https://docs.google.com/document/d/1NFP8wTGI5yJhQWn-QIoXObEW3YQPnWqGfeNFgwVHB1E/edit?usp=sharing" target="_blank" rel="noopener noreferrer">
                      <button className="save-btn" style={{padding:'12px 22px', fontSize:16}}>Enhancing Recommendation</button>
                    </a>

                    <div style={{height:40}} />
                    <div style={{fontWeight:700, textAlign:'left'}}>Upload your output here.</div>
                    <div style={{marginTop:8, textAlign:'left'}}>Before uploading, make sure it is in PDF format with this filename format: <strong>Lesson3_Phase3_username</strong>.</div>

                    <div style={{height:24}} />
                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <input type="file" accept="application/pdf" disabled={p3Submitted} onChange={(e)=>{
                        const f = e.target.files?.[0] ?? null; setP3File(f);
                        if (f) {
                          try {
                            const reader = new FileReader();
                            reader.onload = () => { setP3Preview(String(reader.result || '')); };
                            reader.readAsDataURL(f);
                          } catch (err) { setP3Preview(null); }
                        } else setP3Preview(null);
                      }} />
                    </div>

                    <div style={{height:24}} />
                    <div style={{width:'100%', padding:8, border:'3px solid rgba(0,0,0,0.34)', borderRadius:8, minHeight:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                      <div style={{width:'100%', paddingTop:'56.25%', position:'relative'}}>
                        <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                          {p3Preview ? (
                            <iframe src={p3Preview} style={{width:'100%', height:'100%', border:'none'}} title="Preview" />
                          ) : (
                            <div className="hint">No file uploaded. Preview will appear here.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{height:40}} />
                    <div className="section-actions" style={{display:'flex', justifyContent:'flex-start'}}>
                      <button className="save-btn" disabled={p3Submitted || !p3File} onClick={async ()=>{
                        if (!p3File) return;
                        // avoid double-award
                        let alreadySaved = false;
                        try {
                          const all = getLesson3Phase3Activity1All();
                          if (all && all[user.username]) alreadySaved = true;
                        } catch (e) { /* ignore */ }

                        // read file to dataURL
                        let fileDataUrl: string | undefined = undefined;
                        try {
                          fileDataUrl = await new Promise<string>((res, rej) => {
                            const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => rej(new Error('read error')); r.readAsDataURL(p3File);
                          });
                        } catch (e) { console.error('read failed', e); }

                        try {
                          await saveLesson3Phase3Activity1(user.username, { fileDataUrl, filename: p3File.name, timestamp: new Date().toISOString() });
                        } catch (e) { console.error('save failed', e); }

                        setP3Submitted(true);
                        // close all accordions
                        setOpen({ overview:false, p1:false, p2:false, p3:false, p4:false });

                        // award 25% extra progress if not previously saved
                        try {
                          if (!alreadySaved) {
                            const current = getUserProgress(user.username) || {1:0,2:0,3:0,4:0,5:0};
                            const cur = Number(current[4] || 0) || 0;
                            const extra = Math.min(100 - cur, 25);
                            if (extra > 0) {
                              const newExtra = Math.min(100, lesson3ExtraPct + extra);
                              setLesson3ExtraPct(newExtra);
                              try { localStorage.setItem('lesson3_extra_progress', String(newExtra)); } catch {}
                              setUserProgress(user.username, 4, Math.min(100, cur + extra));
                            }
                          }
                        } catch (e) { /* ignore */ }
                      }}>Submit Output</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="accordion-item phase4">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p4: !o.p4 })); }}>
                <h3>Phase 4: Communicating Findings</h3>
                <span>{open.p4 ? '▼' : '▶'}</span>
              </div>
              {open.p4 && (
                <div className="accordion-content">
                  <div className="brief-grid two-up" style={{gap:16, marginTop:8}}>
                    <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'flex-start'}}>
                      <div style={{fontWeight:700}}>🧭 What you will do:</div>
                      <div style={{marginTop:8}}>• You will revisit your initial recommendation from Lesson 2 and improve it by incorporating your understanding of correlation strength and how much of the variation your model explains.</div>
                    </div>
                    <div className="info-card" style={{minHeight:120, display:'flex', flexDirection:'column', justifyContent:'flex-start'}}>
                      <div style={{fontWeight:700}}>🛠️ How to do it:</div>
                      <div style={{marginTop:8}}>• Review your original recommendation and consider what you've learned about the strength of the relationship between your variables (correlation) and how much of the outcome your model can explain (R²).<br/>• Adjust your recommendation to be more accurate, nuanced, and evidence-based, acknowledging both the strengths and limitations of your findings.</div>
                    </div>
                  </div>

                  <div className="card" style={{marginTop:16, padding:16}}>
                    <div style={{fontWeight:700, textAlign:'left'}}>Final Project Rubrics</div>
                    <div style={{marginTop:8, textAlign:'left'}}>Before you begin doing your final project, study the rubrics below for your guidance.</div>

                    <div style={{height:12}} />
                    <table style={{width:'100%', borderCollapse:'collapse', border:`2px solid var(--plot-secondary)`, background:'var(--plot-bg)'}}>
                      <thead>
                        <tr>
                          <th style={{border:`1px solid var(--plot-secondary)`, padding:8, background:'var(--plot-secondary)', color:'var(--plot-value-primary)', textAlign:'center', verticalAlign:'middle'}}>Criterion</th>
                          <th style={{border:`1px solid var(--plot-secondary)`, padding:8, background:'var(--plot-secondary)', color:'var(--plot-value-primary)', textAlign:'center', verticalAlign:'middle'}}>Below Proficient (1-2)</th>
                          <th style={{border:`1px solid var(--plot-secondary)`, padding:8, background:'var(--plot-secondary)', color:'var(--plot-value-primary)', textAlign:'center', verticalAlign:'middle'}}>Proficient (3)</th>
                          <th style={{border:`1px solid var(--plot-secondary)`, padding:8, background:'var(--plot-secondary)', color:'var(--plot-value-primary)', textAlign:'center', verticalAlign:'middle'}}>Advanced (4)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{fontWeight:700, border:`1px solid var(--plot-secondary)`, padding:8}}>CALCULATION ACCURACY</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>R value, R2 value, and regression line equation are incorrect, or calculation process has major errors</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>R value, R2 value, and regression line equation correctly calculated using appropriate method; minor errors in process</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>R value, R2 value, and regression line equation calculated both manually and digitally with verification; all steps shown accurately</td>
                        </tr>
                        <tr>
                          <td style={{fontWeight:700, border:`1px solid var(--plot-secondary)`, padding:8}}>INTERPRETATION</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Misidentifies strength or direction; interpretation unclear</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Correctly identifies strength and direction; explains meaning in context</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Thorough interpretation with nuanced understanding; connects to climate patterns effectively</td>
                        </tr>
                        <tr>
                          <td style={{fontWeight:700, border:`1px solid var(--plot-secondary)`, padding:8}}>PATTERN ANALYSIS</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Patterns not clearly identified; limited use of visual/numerical evidence</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Patterns identified and described using scatter plot and r value</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Sophisticated pattern analysis; discusses seasonal variations, outliers, or subgroup differences</td>
                        </tr>
                        <tr>
                          <td style={{fontWeight:700, border:`1px solid var(--plot-secondary)`, padding:8}}>DATA RELIABILITY EVALUATION</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>No discussion of limitations or data quality</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Acknowledges at least 2 limitations (sample size, time period, missing variables)</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Critical evaluation of data quality with specific implications for confidence in findings</td>
                        </tr>
                        <tr>
                          <td style={{fontWeight:700, border:`1px solid var(--plot-secondary)`, padding:8}}>EVIDENCE-BASED CONCLUSIONS</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Conclusions not clearly supported by data; confuses correlation with causation</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Conclusions logically follow from data; distinguishes between correlation and causation</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Nuanced conclusions that appropriately acknowledge what data does and doesn't show; considers alternative explanations</td>
                        </tr>
                        <tr>
                          <td style={{fontWeight:700, border:`1px solid var(--plot-secondary)`, padding:8}}>ACTIONABLE RECOMMENDATION</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>No clear recommendation OR recommendation not connected to findings</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Specific, stakeholder-focused recommendation with clear justification</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Highly actionable recommendation with detailed implementation guidance; addresses potential challenges</td>
                        </tr>
                        <tr>
                          <td style={{fontWeight:700, border:`1px solid var(--plot-secondary)`, padding:8}}>COMMUNICATION CLARITY</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Output disorganized; findings unclear; poor visual/written presentation</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Clear organization; findings communicated effectively; appropriate visuals</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Professional-quality output; compelling presentation; excellent integration of text, data, visuals</td>
                        </tr>
                        <tr>
                          <td style={{fontWeight:700, border:`1px solid var(--plot-secondary)`, padding:8}}>REFLECTION ON PROCESS</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Minimal reflection on assumptions, uncertainties, or learning</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Reflects on analytical assumptions and uncertainties; identifies learning growth</td>
                          <td style={{border:`1px solid var(--plot-secondary)`, padding:8, textAlign:'left'}}>Deep metacognitive reflection; discusses how experience changed understanding of statistics and climate</td>
                        </tr>
                      </tbody>
                    </table>

                    <div style={{height:12}} />
                    <div style={{fontWeight:700, fontSize:18, textAlign:'right'}}>Total Points: _____ / 32</div>
                  </div>

                  <div style={{height:16}} />
                  <div className="card" style={{marginTop:16, padding:16, background:'var(--plot-bg)', border:`1px solid var(--plot-secondary)`}}>
                    <div style={{fontWeight:700, textAlign:'left'}}>Final Project Selector</div>
                    <div style={{marginTop:8, textAlign:'left'}}>Choose one format for your final output. Click on the link to access the platform where you can start developing your final output. Once done, save the output as pdf file and upload below.</div>

                    <div style={{height:24}} />

                    <div style={{display:'flex', gap:16, justifyContent:'space-between', alignItems:'stretch'}}>
                      <div className="info-card" style={{flex:'1 1 0', padding:16, minHeight:180, height:'260px', boxSizing:'border-box', display:'flex', flexDirection:'column', justifyContent:'space-between', border:`1px solid var(--plot-secondary)`, background:'var(--plot-bg)'}}>
                        <div style={{fontWeight:700, textAlign:'left'}}>Option A: Policy Bried</div>
                        <div style={{height:24}} />
                        <div style={{textAlign:'center'}}>A formal, structured document that presents research findings and actionable recommendations</div>
                        <div style={{height:40}} />
                        <a href="https://docs.google.com/document/d/1dpALsL8znktjNBH9JDi4XHzp7DLaLv1AZHe46vykHho/edit?usp=sharing" target="_blank" rel="noopener noreferrer" style={{margin:'0 auto', display:'block', width:'70%'}}>
                          <button className="save-btn" style={{width:'100%', display:'block', margin:'0 auto'}}>Go to Google Docs</button>
                        </a>
                      </div>

                      <div className="info-card" style={{flex:'1 1 0', padding:16, minHeight:180, height:'260px', boxSizing:'border-box', display:'flex', flexDirection:'column', justifyContent:'space-between', border:`1px solid var(--plot-secondary)`, background:'var(--plot-bg)'}}>
                        <div style={{fontWeight:700, textAlign:'left'}}>Option B: Infographics</div>
                        <div style={{height:24}} />
                        <div style={{textAlign:'center'}}>A visually engaging, one-page graphic design that combines data visualizations, icons, charts, and minimal text to communicate key statistics and recommendations</div>
                        <div style={{height:40}} />
                        <a href="https://www.canva.com/design/DAHAYXJ9ZtU/nH8b2T0QqAfyEHYl0e2lVg/edit" target="_blank" rel="noopener noreferrer" style={{margin:'0 auto', display:'block', width:'70%'}}>
                          <button className="save-btn" style={{width:'100%'}}>Go to Canva</button>
                        </a>
                      </div>

                      <div className="info-card" style={{flex:'1 1 0', padding:16, minHeight:180, height:'260px', boxSizing:'border-box', display:'flex', flexDirection:'column', justifyContent:'space-between', border:`1px solid var(--plot-secondary)`, background:'var(--plot-bg)'}}>
                        <div style={{fontWeight:700, textAlign:'left'}}>Option C: Slide Presentation</div>
                        <div style={{height:24}} />
                        <div style={{textAlign:'center'}}>A multi-slide digital presentation that guides an audience through your findings step-by-step</div>
                        <div style={{height:40}} />
                        <a href="https://docs.google.com/presentation/d/1j-h9xS-VPNi7qzvgokKTP2_33eAtwpNbTzdv6v9eojE/edit?usp=sharing" target="_blank" rel="noopener noreferrer" style={{margin:'0 auto', display:'block', width:'70%'}}>
                          <button className="save-btn" style={{width:'100%'}}>Go to Google Slides</button>
                        </a>
                      </div>
                    </div>
                  </div>

                  <div style={{height:16}} />
                  <div className="card" style={{marginTop:16, padding:16, background:'var(--plot-bg)', border:`1px solid var(--plot-secondary)`, minHeight:260, boxSizing:'border-box', display:'flex', flexDirection:'column', justifyContent:'flex-start'}}>
                    <div style={{fontWeight:700, textAlign:'left'}}>Peer Review: Quality Check Before Submission</div>
                    <div style={{height:12}} />
                    <div style={{textAlign:'left'}}>Before you upload the pdf file of your final output, make sure to ask one classmate who is not part of your group to identify your outputs strength and possible areas for improvement. Ask your classmate to answer the following:</div>
                    <div style={{height:32}} />
                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                      <div style={{textAlign:'left'}}>1. <strong>CLARITY:</strong> Can you understand their finding and recommendation without asking questions?</div>
                      <div style={{position:'relative', display:'inline-block', marginLeft:12}}>
                        <select value={peer1Answer} onChange={(e)=>setPeer1Answer(e.target.value)} disabled={peerSubmitted} style={{padding:'8px 12px', paddingRight:40, borderRadius:8, border:`1px solid var(--plot-secondary)`, background:'var(--plot-bg)', color:'var(--plot-value-primary)', fontFamily:'Poppins, sans-serif', width:220, appearance:'none'}}>
                          <option value="">Select...</option>
                          <option value="Very clear">Very clear</option>
                          <option value="Mostly clear">Mostly clear</option>
                          <option value="Confusing">Confusing</option>
                        </select>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none'}}>
                          <path d="M7 10l5 5 5-5" stroke="var(--plot-value-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                    <div style={{height:12}} />

                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                      <div style={{textAlign:'left'}}>2. <strong>EVIDENCE:</strong> Is their recommendation clearly supported by their r value, coefficient of determination, regression line equation, and interpretation?</div>
                      <div style={{position:'relative', display:'inline-block', marginLeft:12}}>
                        <select value={peer2Answer} onChange={(e)=>setPeer2Answer(e.target.value)} disabled={peerSubmitted} style={{padding:'8px 12px', paddingRight:40, borderRadius:8, border:`1px solid var(--plot-secondary)`, background:'var(--plot-bg)', color:'var(--plot-value-primary)', fontFamily:'Poppins, sans-serif', width:220, appearance:'none'}}>
                          <option value="">Select...</option>
                          <option value="Strong support">Strong support</option>
                          <option value="Some support">Some support</option>
                          <option value="Weak support">Weak support</option>
                        </select>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none'}}>
                          <path d="M7 10l5 5 5-5" stroke="var(--plot-value-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                    <div style={{height:12}} />

                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                      <div style={{textAlign:'left'}}>3. <strong>ACTIONABILITY:</strong> Could a stakeholder actually implement this recommendation?</div>
                      <div style={{position:'relative', display:'inline-block', marginLeft:12}}>
                        <select value={peer3Answer} onChange={(e)=>setPeer3Answer(e.target.value)} disabled={peerSubmitted} style={{padding:'8px 12px', paddingRight:40, borderRadius:8, border:`1px solid var(--plot-secondary)`, background:'var(--plot-bg)', color:'var(--plot-value-primary)', fontFamily:'Poppins, sans-serif', width:220, appearance:'none'}}>
                          <option value="">Select...</option>
                          <option value="Yes, very specific">Yes, very specific</option>
                          <option value="Somewhat">Somewhat</option>
                          <option value="Too vague">Too vague</option>
                        </select>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none'}}>
                          <path d="M7 10l5 5 5-5" stroke="var(--plot-value-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                    <div style={{height:12}} />

                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                      <div style={{textAlign:'left'}}>4. <strong>HONESTY:</strong> Did they acknowledge limitations of their data?</div>
                      <div style={{position:'relative', display:'inline-block', marginLeft:12}}>
                        <select value={peer4Answer} onChange={(e)=>setPeer4Answer(e.target.value)} disabled={peerSubmitted} style={{padding:'8px 12px', paddingRight:40, borderRadius:8, border:`1px solid var(--plot-secondary)`, background:'var(--plot-bg)', color:'var(--plot-value-primary)', fontFamily:'Poppins, sans-serif', width:220, appearance:'none'}}>
                          <option value="">Select...</option>
                          <option value="Yes">Yes</option>
                          <option value="Somewhat">Somewhat</option>
                          <option value="No">No</option>
                        </select>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none'}}>
                          <path d="M7 10l5 5 5-5" stroke="var(--plot-value-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                    <div style={{height:48}} />

                    <div style={{fontWeight:700, textAlign:'left'}}>ONE STRENGTH of their work:</div>
                    <div style={{height:8}} />
                    <div style={{padding:'0 8px'}}>
                      <textarea value={peerStrength} onChange={(e)=>setPeerStrength(e.target.value)} rows={2} placeholder="Type one clear strength..." readOnly={peerSubmitted} style={{width:'100%', padding:12, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>
                    <div style={{height:8}} />
                    <div style={{fontWeight:700, textAlign:'left'}}>ONE SUGGESTION for improvement:</div>
                    <div style={{height:8}} />
                    <div style={{padding:'0 8px'}}>
                      <textarea value={peerSuggestion} onChange={(e)=>setPeerSuggestion(e.target.value)} rows={2} placeholder="Type one specific suggestion..." readOnly={peerSubmitted} style={{width:'100%', padding:12, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>

                    <div style={{height:24}} />

                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <div style={{whiteSpace:'nowrap'}}>Username of Peer reviewer:</div>
                      <input value={peerReviewerUsername} onChange={(e)=>setPeerReviewerUsername(e.target.value)} placeholder="peer_username" readOnly={peerSubmitted} style={{flex:1, padding:10, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                      <div style={{marginLeft:'auto'}}>
                        <button className="save-btn" disabled={peerSubmitted || !(peer1Answer && peer2Answer && peer3Answer && peer4Answer && peerStrength.trim() && peerSuggestion.trim() && peerReviewerUsername.trim())} onClick={async ()=>{
                          if (peerSubmitted) return;
                          if (!(peer1Answer && peer2Answer && peer3Answer && peer4Answer && peerStrength.trim() && peerSuggestion.trim() && peerReviewerUsername.trim())) return;
                          // avoid double-save/award
                          let alreadySaved = false;
                          try {
                            const all = getLesson3Phase4ReviewAll();
                            if (all && all[user.username]) alreadySaved = true;
                          } catch (e) { /* ignore */ }

                          try {
                            await saveLesson3Phase4PeerReview(user.username, {
                              q1: [peer1Answer], q2: [peer2Answer], q3: [peer3Answer], q4: [peer4Answer],
                              strength: peerStrength.trim(), suggestion: peerSuggestion.trim(), reviewer: peerReviewerUsername.trim()
                            });
                          } catch (e) { console.error('save peer review failed', e); }

                          setPeerSubmitted(true);

                          // award 10% extra progress if not already awarded
                          try {
                            if (!alreadySaved) {
                              const current = getUserProgress(user.username) || {1:0,2:0,3:0,4:0,5:0};
                              const cur = Number(current[4] || 0) || 0;
                              const extra = Math.min(100 - cur, 10);
                              if (extra > 0) {
                                const newExtra = Math.min(100, lesson3ExtraPct + extra);
                                setLesson3ExtraPct(newExtra);
                                try { localStorage.setItem('lesson3_extra_progress', String(newExtra)); } catch {}
                                setUserProgress(user.username, 4, Math.min(100, cur + extra));
                              }
                            }
                          } catch (e) { /* ignore */ }
                        }}>Submit Review</button>
                      </div>
                    </div>

                    <div style={{height:12}} />
                    {peerSubmitted && (<div style={{color:'var(--plot-value-primary)', marginTop:12}}>Review submitted — thank you!</div>)}
                  </div>

                  <div style={{height:16}} />
                  <div className="card" style={{marginTop:16, padding:16, background:'var(--plot-bg)', border:`1px solid var(--plot-secondary)`, boxSizing:'border-box'}}>
                    <div style={{fontWeight:700, textAlign:'left'}}>Reflection and Final Submission</div>
                    <div style={{height:24}} />

                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <div style={{flex:'0 0 auto'}}>1. How confident am I in my correlation calculation?</div>
                      <input value={finalConfidence} onChange={(e)=>setFinalConfidence(e.target.value)} placeholder="e.g., Very confident" style={{flex:1, padding:10, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>
                    <div style={{height:12}} />

                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <div style={{flex:'0 0 auto'}}>2. What contributed to this confidence level?</div>
                      <input value={finalConfidenceReason} onChange={(e)=>setFinalConfidenceReason(e.target.value)} placeholder="Brief reasons..." style={{flex:1, padding:10, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>
                    <div style={{height:12}} />

                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <div style={{flex:'0 0 auto'}}>3. What was most challenging about this project?</div>
                      <input value={finalChallenge} onChange={(e)=>setFinalChallenge(e.target.value)} placeholder="Challenge..." style={{flex:1, padding:10, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>
                    <div style={{height:12}} />

                    <div style={{textAlign:'left'}}>4. How has this project changed my understanding of:</div>
                    <div style={{height:8}} />
                    <div style={{display:'flex', alignItems:'center', gap:12, marginLeft:48}}>
                      <div style={{flex:'0 0 160px'}}>Statistics:</div>
                      <input value={finalStatsChange} onChange={(e)=>setFinalStatsChange(e.target.value)} placeholder="e.g., More comfortable with r and R²" style={{flex:1, padding:10, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>
                    <div style={{height:8}} />
                    <div style={{display:'flex', alignItems:'center', gap:12, marginLeft:48}}>
                      <div style={{flex:'0 0 160px'}}>Climate:</div>
                      <input value={finalClimateChange} onChange={(e)=>setFinalClimateChange(e.target.value)} placeholder="e.g., Better link to outcomes" style={{flex:1, padding:10, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>
                    <div style={{height:8}} />
                    <div style={{display:'flex', alignItems:'center', gap:12, marginLeft:48}}>
                      <div style={{flex:'0 0 160px'}}>The connection between them:</div>
                      <input value={finalConnectionChange} onChange={(e)=>setFinalConnectionChange(e.target.value)} placeholder="e.g., How stats inform climate recommendations" style={{flex:1, padding:10, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>
                    <div style={{height:12}} />

                    <div style={{fontWeight:700, textAlign:'left'}}>5. If I could extend this project, I would investigate:</div>
                    <div style={{height:8}} />
                    <div style={{padding:'0 8px'}}>
                      <textarea value={finalExtension} onChange={(e)=>setFinalExtension(e.target.value)} rows={2} placeholder="Describe an extension idea..." style={{width:'100%', padding:12, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>
                    <div style={{height:12}} />

                    <div style={{fontWeight:700, textAlign:'left'}}>6. One thing I learned about myself as a learner:</div>
                    <div style={{height:8}} />
                    <div style={{padding:'0 8px'}}>
                      <textarea value={finalLearnerInsight} onChange={(e)=>setFinalLearnerInsight(e.target.value)} rows={2} placeholder="Personal learning insight..." style={{width:'100%', padding:12, border:'2px solid var(--plot-value-primary)', borderRadius:8, background:'var(--input-bg)', fontFamily:'Poppins, sans-serif'}} />
                    </div>

                    <div style={{height:16}} />
                    <div style={{fontWeight:700, textAlign:'left'}}>Upload your Final Output here.</div>
                    <div style={{height:8}} />
                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <input type="file" accept="application/pdf" disabled={finalSubmitted} onChange={(e)=>{ const f = e.target.files?.[0] ?? null; setFinalFile(f); if (f) { try { setFinalPreview(URL.createObjectURL(f)); } catch { setFinalPreview(null); } } else setFinalPreview(null); }} />
                    </div>

                    <div style={{height:12}} />
                    <div style={{width:'100%', padding:8, border:`3px solid var(--plot-value-primary)`, borderRadius:8, minHeight:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                      <div style={{width:'100%', paddingTop:'56.25%', position:'relative'}}>
                        <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                          {finalPreview ? (
                            <iframe src={finalPreview} style={{width:'100%', height:'100%', border:'none'}} title="Final Preview" />
                          ) : (
                            <div className="hint">No file uploaded. Preview will appear here.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{height:16}} />
                    <div>
                      <button className="save-btn" style={{padding:'14px 28px', fontSize:16}} disabled={!finalFile || finalSubmitted} onClick={async ()=>{
                        if (!finalFile) return;
                        // avoid double-save
                        let alreadySaved = false;
                        try {
                          const all = getLesson3Phase4CompleteAll();
                          if (all && all[user.username]) alreadySaved = true;
                        } catch (e) {}

                        // read file as data URL
                        try {
                          const fr = new FileReader();
                          fr.onload = async (ev) => {
                            const dataUrl = (ev.target as any)?.result || null;
                            try {
                              const reflection = {
                                confidence: finalConfidence || '',
                                contributed: finalConfidenceReason || '',
                                challenging: finalChallenge || '',
                                stats: finalStatsChange || '',
                                climate: finalClimateChange || '',
                                connection: finalConnectionChange || '',
                                extend: finalExtension || '',
                                learned: finalLearnerInsight || ''
                              };
                              await saveLesson3Phase4Reflection(user.username, reflection, dataUrl, finalFile.type);
                            } catch (e) { console.error('savePhase4Reflection failed', e); }

                            setFinalSubmitted(true);
                            
                            // upsert lesson3 response record
                            try {
                              const prof = await getMyProfile();
                              const studentId = prof?.id;
                              if (studentId) {
                                await upsertResponse({
                                  student_id: studentId,
                                  activity_type: 'lesson3',
                                  answers: {
                                    __meta: {
                                      schemaVersion: 1,
                                      source: 'student-portal',
                                      activityType: 'lesson3',
                                      submittedAt: new Date().toISOString(),
                                      username: user.username,
                                      stage: 'final'
                                    },
                                    phase4_reflection: dataUrl || ''
                                  }
                                });
                              }
                            } catch (e) {
                              console.error('upsert lesson3 response', e);
                            }

                            // award 15% one-time
                            try {
                              if (!alreadySaved) {
                                const current = getUserProgress(user.username) || {1:0,2:0,3:0,4:0,5:0};
                                const cur = Number(current[4] || 0) || 0;
                                const extra = Math.min(100 - cur, 15);
                                if (extra > 0) {
                                  const newExtra = Math.min(100, lesson3ExtraPct + extra);
                                  setLesson3ExtraPct(newExtra);
                                  try { localStorage.setItem('lesson3_extra_progress', String(newExtra)); } catch {}
                                  setUserProgress(user.username, 4, Math.min(100, cur + extra));
                                }
                              }
                            } catch (e) { /* ignore */ }
                          };
                          fr.readAsDataURL(finalFile);
                        } catch (e) {
                          console.error('file read failed', e);
                        }
                      }}>Submit Final Output</button>
                    </div>
                    {finalSubmitted && (<div style={{color:'var(--plot-value-primary)', marginTop:12}}>Final output submitted — great work!</div>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Lesson3;

// Local scaffolding data



