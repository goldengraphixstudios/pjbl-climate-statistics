import '../../styles/StudentPortal.css';
import '../../styles/Lesson.css';
import { useMemo, useState, useEffect } from 'react';
import ProgressBar from '../../components/ProgressBar';
import { setUserProgress, saveLesson2Phase1Activity1, getLesson2Phase1Activity1All, saveLesson2Phase1Activity1b, getLesson2Phase1Activity1bAll, saveLesson2Phase1Activity2Checkpoint, getLesson2Phase1Activity2All, saveLesson2Phase1Activity2b, getLesson2Phase1Activity2bAll, saveLesson2Phase1Activity3, getLesson2Phase1Activity3All, saveLesson2Phase1Activity4, getLesson2Phase1Activity4All, saveLesson2Phase2Activity1, getLesson2Phase2Activity1All, saveLesson2Phase2Activity2, getLesson2Phase2Activity2All, saveLesson2Phase2Activity3, getLesson2Phase2Activity3All, saveLesson2Phase2Activity4, getLesson2Phase2Activity4All, saveLesson2Phase2Activity4Interpret, getLesson2Phase2Activity4InterpAll, saveLesson2Phase3Activity1, getLesson2Phase3Activity1All, savePhase3FinishAnalysis, saveLesson2Phase3Activity2, getLesson2Phase3Activity2All, savePhase3SubmitWorksheet, saveLesson2Phase4Activity1, getLesson2Phase4Activity1All } from '../../services/progressService';
import { activity2bAnswerKey, lesson2Phase2Activity1Validators, lesson2Phase2Activity1Questions } from '../../services/activity2Questions';
import { ActivityType, upsertResponse } from '../../services/responsesService';
import { getFeedbackForStudentActivity, acknowledgeFeedback } from '../../services/feedbackService';
import { getMyProfile } from '../../services/profilesService';

interface AuthUser {
  username: string;
  role: 'student' | 'teacher' | 'admin' | null;
}

interface SectionPageProps {
  user: AuthUser;
  onBack: () => void;
}

const Lesson2: React.FC<SectionPageProps> = ({ user, onBack }) => {
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
  const [displayProgress, setDisplayProgress] = useState<number>(progressPct);
  const [serverFeedback, setServerFeedback] = useState<any>(null);
  
  useEffect(() => { setDisplayProgress(progressPct); }, [progressPct]);
  useEffect(() => { setUserProgress(user.username, 3, displayProgress); }, [displayProgress, user.username]);
  
  // Load server feedback for lesson2
  useEffect(() => {
    const load = async () => {
      try {
        const prof = await getMyProfile();
        const studentId = prof?.id;
        if (!studentId) return;
        const fb = await getFeedbackForStudentActivity(studentId, 'lesson2');
        if (fb) setServerFeedback(fb);
      } catch (e) {
        console.error('load lesson2 feedback', e);
      }
    };
    load();
  }, []);

  useEffect(() => {
    setOpen({ overview: false, p1: false, p2: false, p3: false, p4: false });
    setP1Sections({ a1:false, a2:false, a3:false, a4:false });
    setP2Sections({ a1:false, a2:false, a3:false, a4:false });
    setP3Sections({ a1:false, a2:false, a3:false });
  }, []);

  // Local UI state for scaffolding
  const [p1Sections, setP1Sections] = useState<{ a1:boolean; a2:boolean; a3:boolean; a4:boolean }>({ a1:false, a2:false, a3:false, a4:false });
  const [p2Sections, setP2Sections] = useState<{ a1:boolean; a2:boolean; a3:boolean; a4:boolean }>({ a1:false, a2:false, a3:false, a4:false });
  const [p3Sections, setP3Sections] = useState<{ a1:boolean; a2:boolean; a3:boolean }>({ a1:false, a2:false, a3:false });
  const [formatSel, setFormatSel] = useState<{ title:string; desc:string } | null>(null);
  const [] = useState<{ key:string; rec:string; ref:string }>({ key:'', rec:'', ref:'' });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [submissionMessage, setSubmissionMessage] = useState<string>('');

  const [uploadedFile3, setUploadedFile3] = useState<File | null>(null);
  const [previewURL3, setPreviewURL3] = useState<string | null>(null);
  const [submissionMessage3, setSubmissionMessage3] = useState<string>('');
  const [submitDisabled3, setSubmitDisabled3] = useState<boolean>(false);
  const [uploadedFile4, setUploadedFile4] = useState<File | null>(null);
  const [previewURL4, setPreviewURL4] = useState<string | null>(null);
  const [submissionMessage4, setSubmissionMessage4] = useState<string>('');
  const [submitDisabled4, setSubmitDisabled4] = useState<boolean>(false);
  const [p4Equation, setP4Equation] = useState<string>('');
  const [p4YIntercept, setP4YIntercept] = useState<string>('');
  const [p4Interpretation, setP4Interpretation] = useState<string>('');
  const [p4Locked, setP4Locked] = useState<boolean>(false);
  const [uploadedFileP4, setUploadedFileP4] = useState<File | null>(null);
  const [previewURLP4, setPreviewURLP4] = useState<string | null>(null);
  const [submissionMessageP4, setSubmissionMessageP4] = useState<string>('');
  const [submitDisabledP4, setSubmitDisabledP4] = useState<boolean>(false);
  const [analysisInputs, setAnalysisInputs] = useState<{
    part1_researchQuestion: string;
    part1_regressionEquation: string;
    part1_interpretation: string;
    part2_possible1: string;
    part2_evidence1: string;
    part2_possible2: string;
    part2_evidence2: string;
    part2_mostPlausible: string;
    part3_causationYes: string;
    part3_causationNo: string;
    part3_otherFactor1: string;
    part3_otherFactor2: string;
    part4_biggestConcern: string;
    part4_confidenceEffect: string;
  }>({
    part1_researchQuestion: '', part1_regressionEquation: '', part1_interpretation: '',
    part2_possible1: '', part2_evidence1: '', part2_possible2: '', part2_evidence2: '', part2_mostPlausible: '',
    part3_causationYes: '', part3_causationNo: '', part3_otherFactor1: '', part3_otherFactor2: '',
    part4_biggestConcern: '', part4_confidenceEffect: ''
  });
  const [analysisSubmitted, setAnalysisSubmitted] = useState<boolean>(false);
  const [analysis2Inputs, setAnalysis2Inputs] = useState<{
    part1_s1: string;
    part1_s2: string;
    part1_s3: string;
    part2_who: string;
    part2_because: string;
    part3_decision1: string;
    part3_decision2: string;
  }>({ part1_s1:'', part1_s2:'', part1_s3:'', part2_who:'', part2_because:'', part3_decision1:'', part3_decision2:'' });
  const [analysis2Submitted, setAnalysis2Submitted] = useState<boolean>(false);
  const [phase2A2Submitted, setPhase2A2Submitted] = useState<boolean>(false);

  // Exit ticket (Activity 4)
  const [exitText, setExitText] = useState<string>('');
  const [exitScale1, setExitScale1] = useState<number>(0);
  const [exitScale2, setExitScale2] = useState<number>(0);
  const [exitScale3, setExitScale3] = useState<number>(0);
  const [exitSubmitted, setExitSubmitted] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      try { if (previewURL) URL.revokeObjectURL(previewURL); } catch (e) { /* ignore */ }
      try { if (previewURL3) URL.revokeObjectURL(previewURL3); } catch (e) { /* ignore */ }
      try { if (previewURL4) URL.revokeObjectURL(previewURL4); } catch (e) { /* ignore */ }
      try { if (previewURLP4) URL.revokeObjectURL(previewURLP4); } catch (e) { /* ignore */ }
    };
  }, [previewURL, previewURL3, previewURL4]);
  const [observations, setObservations] = useState<Record<number, { obs: string; affected: string; causes: string; submitted?: boolean }>>({});
  const [activity1aSubmitted, setActivity1aSubmitted] = useState<boolean>(false);
  const [activity1b, setActivity1b] = useState<{ mostUrgent: string; q1: string; q2: string; q3: string; submitted?: boolean }>({ mostUrgent: '', q1: '', q2: '', q3: '', submitted: false });

  useEffect(() => {
    try {
      const all = getLesson2Phase1Activity1All();
      const mine = all[user.username] || {};
      const map: Record<number, { obs: string; affected: string; causes: string; submitted?: boolean }> = {};
      for (let i = 1; i <= 8; i++) {
        const d = mine[i] || null;
        map[i] = {
          obs: d?.obs || '',
          affected: d?.affected || '',
          causes: d?.causes || '',
          submitted: !!d
        };
      }
      setObservations(map);
    } catch (e) {
      // ignore
    }
    try {
      const allb = getLesson2Phase1Activity1bAll();
      const mineb = allb[user.username];
      if (mineb) {
        setActivity1b({ mostUrgent: mineb.mostUrgent || '', q1: mineb.q1 || '', q2: mineb.q2 || '', q3: mineb.q3 || '', submitted: true });
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // load Phase 3 Activity 1 saved analysis encodings (persisted answers)
  useEffect(() => {
    try {
      const all = getLesson2Phase3Activity1All();
      const mine = all[user.username];
      if (mine) {
        setAnalysisInputs({
          part1_researchQuestion: mine.part1_researchQuestion || '',
          part1_regressionEquation: mine.part1_regressionEquation || '',
          part1_interpretation: mine.part1_interpretation || '',
          part2_possible1: mine.part2_possible1 || '',
          part2_evidence1: mine.part2_evidence1 || '',
          part2_possible2: mine.part2_possible2 || '',
          part2_evidence2: mine.part2_evidence2 || '',
          part2_mostPlausible: mine.part2_mostPlausible || '',
          part3_causationYes: mine.part3_causationYes || '',
          part3_causationNo: mine.part3_causationNo || '',
          part3_otherFactor1: mine.part3_otherFactor1 || '',
          part3_otherFactor2: mine.part3_otherFactor2 || '',
          part4_biggestConcern: mine.part4_biggestConcern || '',
          part4_confidenceEffect: mine.part4_confidenceEffect || ''
        });
        // lock UI if previously submitted
        if (mine._finished || mine.timestamp || mine._submitted || mine.analysisSubmitted) {
          setAnalysisSubmitted(true);
        }
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);

  // autosave analysis inputs so answers persist across logout
  useEffect(() => {
    try {
      // only save when there's something to save
      const hasAny = Object.values(analysisInputs).some(v => !!v && v.toString().trim() !== '');
      if (hasAny) {
        saveLesson2Phase3Activity1(user.username, analysisInputs);
      }
    } catch (e) { /* ignore */ }
  }, [analysisInputs, user.username]);

  // load Phase 3 Activity 2 saved worksheet encodings
  useEffect(() => {
    try {
      const all = getLesson2Phase3Activity2All();
      const mine = all[user.username];
      if (mine) {
        setAnalysis2Inputs({
          part1_s1: mine.part1_s1 || '',
          part1_s2: mine.part1_s2 || '',
          part1_s3: mine.part1_s3 || '',
          part2_who: mine.part2_who || '',
          part2_because: mine.part2_because || '',
          part3_decision1: mine.part3_decision1 || '',
          part3_decision2: mine.part3_decision2 || ''
        });
        setAnalysis2Submitted(!!mine.timestamp || !!(mine._submitted));
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);

  // autosave Phase 3 Activity 2 worksheet inputs
  useEffect(() => {
    try {
      const hasAny = Object.values(analysis2Inputs).some(v => !!v && v.toString().trim() !== '');
      if (hasAny) {
        saveLesson2Phase3Activity2(user.username, analysis2Inputs);
      }
    } catch (e) { /* ignore */ }
  }, [analysis2Inputs, user.username]);
  // Video checkpoints state
  const [videoAnswers, setVideoAnswers] = useState<string[]>(['','','','','']);
  const [videoChecks, setVideoChecks] = useState<(boolean | null)[]>([null,null,null,null,null]);
  const [videoSubmitted, setVideoSubmitted] = useState<boolean>(false);
  useEffect(() => {
    try {
      const all = getLesson2Phase1Activity2All();
      const mine = all[user.username];
      if (mine && Array.isArray(mine.answers)) {
        setVideoAnswers(mine.answers.slice(0,5).map(a => a || ''));
        // mark checks based on saved answers
        const checks = (mine.answers.slice(0,5) as string[]).map((raw, idx) => {
          const a = (raw || '').toLowerCase().trim();
          if (!a) return null;
          if (idx === 0) return a.includes('regression');
          if (idx === 1) return a.includes('dependent');
          if (idx === 2) return a.includes('independent');
          if (idx === 3) return (a.includes('influence') && a.includes('prediction')) || a.includes('influence and prediction') || a.includes('prediction');
          if (idx === 4) return a.includes('linear regression');
          return null;
        });
        setVideoChecks(checks as (boolean | null)[]);
        setVideoSubmitted(!!mine.answers && mine.answers.slice(0,5).every(a => !!a));
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // Pair of Variables state (Activity 2b)
  const [pairAnswers, setPairAnswers] = useState<{ predictor: string; response: string }[]>(Array.from({ length: 5 }, () => ({ predictor: '', response: '' })));
  const [pairSubmitted, setPairSubmitted] = useState<boolean>(false);
  const [pairChecks, setPairChecks] = useState<(boolean | null)[]>([null,null,null,null,null]);
  // Phase 2 Activity 1 (Understanding Regression Lines) - video checkpoints
  const [phase2A1Answers, setPhase2A1Answers] = useState<string[]>(['','', '','']);
  const [phase2A1Checks, setPhase2A1Checks] = useState<(boolean | null)[]>([null, null, null, null]);
  const [phase2A1Submitted, setPhase2A1Submitted] = useState<boolean>(false);
  // Activity 3: Climate Variable Selection (dropdowns + encodings)
  const [a3Var1, setA3Var1] = useState<string>('');
  const [a3Var2, setA3Var2] = useState<string>('');
  const [a3Reasoning, setA3Reasoning] = useState<string>('');
  const [a3Prediction, setA3Prediction] = useState<string>('');
  const [a3ResearchQuestion, setA3ResearchQuestion] = useState<string>('');
  const [a3Submitted, setA3Submitted] = useState<boolean>(false);
  useEffect(() => {
    try {
      const all = getLesson2Phase1Activity2bAll();
      const mine = all[user.username];
      if (mine && Array.isArray(mine.pairs)) {
        const pairs = mine.pairs.slice(0,5).map((p: any) => ({ predictor: p?.predictor || '', response: p?.response || '' }));
        setPairAnswers(pairs);
        const submittedFlag = mine.pairs.every((p: any) => (p?.predictor && p?.response));
        setPairSubmitted(submittedFlag);
        // compute checks based on answer key
        const checks = pairs.map((p, idx) => {
          try {
            const key = activity2bAnswerKey[idx];
            const pred = (p.predictor || '').toLowerCase().trim();
            const resp = (p.response || '').toLowerCase().trim();
            if (!pred && !resp) return null;
            const predOk = key && pred.includes((key.predictor || '').toLowerCase());
            const respOk = key && resp.includes((key.response || '').toLowerCase());
            return !!(predOk && respOk);
          } catch (e) { return null; }
        });
        setPairChecks(checks as (boolean | null)[]);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // load Phase2 Activity2 saved upload
  useEffect(() => {
    try {
      const all = getLesson2Phase2Activity2All();
      const mine = all[user.username];
      if (mine) {
        setPreviewURL(mine.uploadUrl || null);
        setUploadedFileName(mine.filename || '');
        setPhase2A2Submitted(!!mine.uploadUrl);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // load Phase2 Activity3 saved upload
  useEffect(() => {
    try {
      const all = getLesson2Phase2Activity3All();
      const mine = all[user.username];
      if (mine) {
        setPreviewURL3(mine.uploadUrl || null);
        setSubmitDisabled3(!!mine.uploadUrl);
        setSubmissionMessage3(!!mine.uploadUrl ? 'File previously submitted.' : '');
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // load Phase2 Activity4 saved upload and encodings
  useEffect(() => {
    try {
      const all = getLesson2Phase2Activity4All();
      const mine = all[user.username];
      if (mine) {
        setPreviewURL4(mine.uploadUrl || null);
        setSubmitDisabled4(!!mine.uploadUrl);
        setSubmissionMessage4(!!mine.uploadUrl ? 'File previously submitted.' : '');
      }
    } catch (e) { /* ignore */ }
    try {
      const interpAll = getLesson2Phase2Activity4InterpAll();
      const interp = interpAll[user.username];
      if (interp) {
        // stored shape: { interp: string, encodings?: { equation, yIntercept, interpretation } }
        setP4Interpretation((interp as any).interp || '');
        const enc = ((interp as any).encodings || {});
        setP4Equation(enc?.equation || '');
        setP4YIntercept(enc?.yIntercept || '');
        setP4Locked(true);
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);

  // load Phase 4 (Lesson 2) saved upload
  useEffect(() => {
    try {
      const all = getLesson2Phase4Activity1All();
      const mine = all[user.username];
      if (mine) {
        setPreviewURLP4(mine.uploadUrl || null);
        setSubmitDisabledP4(!!mine.submitted);
        setSubmissionMessageP4(mine.submitted ? 'File previously submitted.' : 'File uploaded (not yet submitted)');
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
    // load Phase 2 Activity 1 saved data (Lesson 2 specific)
    useEffect(() => {
      try {
        const all = getLesson2Phase2Activity1All();
        const mine = all[user.username];
        if (mine && Array.isArray(mine.answers)) {
          setPhase2A1Answers(mine.answers.slice(0,4).map(a => a || ''));
          const checks = (mine.answers.slice(0,4) as string[]).map((ans, idx) => {
            try {
              const validator = lesson2Phase2Activity1Validators[idx];
              if (!validator) return null;
              return validator(ans || '') ? true : false;
            } catch (e) { return null; }
          });
          setPhase2A1Checks(checks as (boolean | null)[]);
          setPhase2A1Submitted(!!mine.answers && mine.answers.slice(0,4).every(a => !!a));
        }
      } catch (e) { /* ignore */ }
    }, [user.username]);
  // load Activity 3 saved data
  useEffect(() => {
    try {
      const all = getLesson2Phase1Activity3All();
      const mine = all[user.username];
      if (mine) {
        setA3Var1(mine.var1 || '');
        setA3Var2(mine.var2 || '');
        setA3Reasoning(mine.reasoning || '');
        setA3Prediction(mine.prediction || '');
        setA3ResearchQuestion(mine.researchQuestion || '');
        setA3Submitted(!!(mine.var1 && mine.var2 && mine.reasoning && mine.prediction && mine.researchQuestion));
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // load Activity 4 saved data (exit ticket)
  useEffect(() => {
    try {
      const all = getLesson2Phase1Activity4All();
      const mine = all[user.username];
      if (mine) {
        setExitText(mine.importantLearning || '');
        setExitScale1(typeof mine.confidence === 'number' ? mine.confidence : 0);
        setExitScale2(typeof mine.understanding === 'number' ? mine.understanding : 0);
        setExitScale3(typeof mine.connection === 'number' ? mine.connection : 0);
        setExitSubmitted(!!(mine.importantLearning && mine.confidence && mine.understanding && mine.connection));
      }
    } catch (e) { /* ignore */ }
  }, [user.username]);
  // compute Lesson 2 progress entirely from Lesson 2 page buttons (single source on the page)
  useEffect(() => {
    // derive whether Activity 1a (all scenarios) was submitted
    try {
      const allSubmitted = Object.keys(observations).length > 0 && Object.values(observations).every(v => !!v.submitted);
      setActivity1aSubmitted(allSubmitted);
    } catch (e) { /* ignore */ }

    // Phase 1: five buttons each contribute 5% (total 25%)
    const phase1Contrib = (activity1aSubmitted ? 5 : 0) + (videoSubmitted ? 5 : 0) + (pairSubmitted ? 5 : 0) + (a3Submitted ? 5 : 0) + (exitSubmitted ? 5 : 0);

    // Phase 2: Activity1=5%, Activity2=5%, Activity3=5%, Activity4=10% (total 25%)
    const phase2Contrib = (phase2A1Submitted ? 5 : 0) + (phase2A2Submitted ? 5 : 0) + (submitDisabled3 ? 5 : 0) + (submitDisabled4 ? 10 : 0);

    // Phase 3: Activity1 (Critical Analysis Framework) = 10%, Activity2 (Worksheet) = 15%
    const phase3Contrib = (analysisSubmitted ? 10 : 0) + (analysis2Submitted ? 15 : 0);

    // Phase 4 submit contributes 25% to Lesson 2 progress when submitted
    const phase4Contrib = submitDisabledP4 ? 25 : 0;

    const total = Math.min(100, phase1Contrib + phase2Contrib + phase3Contrib + phase4Contrib);
    setDisplayProgress(total);
  }, [observations, activity1aSubmitted, videoSubmitted, pairSubmitted, a3Submitted, exitSubmitted, phase2A1Submitted, phase2A2Submitted, submitDisabled3, submitDisabled4, analysisSubmitted, analysis2Submitted, submitDisabledP4]);
  

  const canSubmitA3 = () => {
    return a3Var1.trim() !== '' && a3Var2.trim() !== '' && a3Reasoning.trim() !== '' && a3Prediction.trim() !== '' && a3ResearchQuestion.trim() !== '';
  }

  const submitA3 = () => {
    if (!canSubmitA3()) return;
    try {
      saveLesson2Phase1Activity3(user.username, a3Var1, a3Var2, a3Reasoning, a3Prediction, a3ResearchQuestion);
      setA3Submitted(true);
    } catch (e) { /* ignore */ }
  }
  const climateScenarios = [
    {
      id: 1,
      img: '/lesson2-scenario1.jpg',
      alt: 'Reference climate scenario image',
      caption: ''
    },
    {
      id: 2,
      img: '/lesson2-scenario2.jpg?v=1',
      alt: 'Flooded barangay street with residents wading through water',
      caption: 'LPA AFFECTS 3,500 FAMILIES: Davao de Oro has the highest number of families affected — February 1, 2024 | Source: SunStar Davao (Photo: Ramcez Villegas)'
    },
    {
      id: 3,
      img: '/lesson2-scenario3.jpg',
      alt: 'Drought-stricken farmland with cracked soil and dry grass',
      caption: 'DRY SPELL DESTROYS PHP4.35-B WORTH OF CROPS (Barangay Duruluman, Arakan) — April 2, 2019 | Source: DavaoToday.com (Photo: Ken E. Cagula)'
    },
    {
      id: 4,
      img: '/lesson2-scenario4.jpg',
      alt: 'Rows of makeshift green partitions for cholera patients in a hall',
      caption: 'DAVAO ORIENTAL TOWN CHOLERA OUTBREAK VICTIMS CLIMB TO 544 — February 9, 2022 | Source: Philippine News Agency (Photo: Davao Oriental PIO)'
    },
    {
      id: 5,
      img: '/lesson2-scenario5.jpg',
      alt: 'People outside an emergency room receiving treatment for diarrhea outbreak',
      caption: 'DAVAO CITY CONFIRMS DIARRHEA OUTBREAK IN TORIL DUE TO FOOD CONTAMINATION — July 29, 2022 | Source: Philippine News Agency (Photo: Robinson Niñal)'
    },
    {
      id: 6,
      img: '/lesson2-scenario6.jpg',
      alt: 'Nighttime city street flooded after heavy rains with vehicles and motorcycles',
      caption: 'SEVERAL AREAS IN DAVAO CITY FLOODED FOLLOWING HEAVY RAINS — December 31, 2024 | Source: GMA Regional TV (Photo: BDRRMC Matina Pangi)'
    },
    {
      id: 7,
      img: '/lesson2-scenario7.jpg',
      alt: 'Crowded market scene with health personnel amid mpox update',
      caption: 'MPOX CASES IN DAVAO CITY RISE TO 6 — May 30, 2025 | Source: ABS-CBN News (Photo: Hernel Tocmo)'
    },
    {
      id: 8,
      img: '/lesson2-scenario8.jpg',
      alt: 'Elderly couple walking under an umbrella during intense heat',
      caption: "DAVAO CITY EXPERIENCES 'DANGEROUS' HEAT INDEX LEVEL — April 30, 2024 | Source: SunStar Davao (Photo: SunStar File Photo)"
    }
  ];

  return (
    <div className="portal-container">
      <header className="portal-header">
        <div className="header-left">
          <span className="header-badge badge--lesson2">📈</span>
          <div className="header-texts">
            <h1 className="portal-title">Lesson 2: Climate Linear Regression Equations</h1>
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
                  const fb = await acknowledgeFeedback(sid, 'lesson2');
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
          <ProgressBar progress={displayProgress} />
          <div className="accordion">
            {/* Overview - collapsed by default */}
            <div className="accordion-item overview">
              <div className="accordion-header" onClick={() => setOpen(o => ({ ...o, overview: !o.overview }))}>
                <h3>🧭 Mission Brief: Tracking Environmental Change</h3>
                <span>{open.overview ? '▼' : '▶'}</span>
              </div>
              {open.overview && (
                <div className="accordion-content">
                  <div className="mission-brief">
                    <div className="intro-text">
                      <div className="hero-title">📚 LESSON 2: Climate Linear Regression Equations</div>
                      <div className="hero-subtitle"><em>AKA "Drawing Lines Through Chaos (And Calling it Science)"</em></div>
                      <div className="gap-3" />
                      <p>Hey there, future data detectives! 👋</p>
                      <p>
                        So you&apos;ve discovered that two climate variables are connected—awesome! But now comes the million-peso question: HOW are they connected? If temperature goes up by 2 degrees, how much does rainfall change? That&apos;s where regression lines come in!
                      </p>
                      <p>
                        Today, you&apos;re learning to draw the line (literally) that best describes the relationship between climate variables. Think of it as finding the secret formula that connects cause and effect. Ready to become a trend-spotting, line-drawing environmental analyst? Let&apos;s go! 📈
                      </p>
                      <div className="gap-3" />
                    </div>

                    <div className="brief-grid two-up">
                      <div className="brief-card">
                        <div className="card-title">What You Will Master:</div>
                        <ul>
                          <li>Calculate slope and y-intercept of regression lines (a.k.a. the recipe for prediction)</li>
                          <li>Interpret what those numbers actually mean (because math without meaning is just... numbers)</li>
                        </ul>
                      </div>
                      <div className="brief-card">
                        <div className="card-title">Your Mission:</div>
                        <ul>
                          <li>Explain slope and y-intercept like you&apos;re a climate translator—“For every degree hotter, this happens...”</li>
                          <li>Calculate these magical numbers using formulas or Excel wizardry</li>
                          <li>Interpret your findings and suggest fixes that could actually help your barangay</li>
                        </ul>
                      </div>
                      <div className="brief-card epic-card">
                        <div className="card-title project-title">Your Epic Project: 🎯</div>
                        <div className="card-subtitle project-center">"Analyzing Local Environmental Trends Through Regression" — Climate Action Project</div>
                        <p>
                          Take local data, build your regression line, and present recommendations so practical that local leaders might actually use them. You&apos;re basically becoming a consultant, minus the fancy suit.
                        </p>
                        <p className="time-budget-text">⏰ Time Budget: 4 hours <span className="time-note"><em>(less time than binge-watching one season of anything)</em></span></p>
                      </div>
                    </div>

                    <div className="closing-text">
                      <h4 className="body-heading">Ready to Start This Adventure?</h4>
                      <p>
                        By the end of this lesson, you won&apos;t just see scattered data points—you&apos;ll see THE LINE that tells the story. You&apos;ll understand exactly how one climate variable pushes and pulls another. You&apos;ll be able to say, “For every additional degree of heat, we lose X liters of water” and actually know what you&apos;re talking about!
                      </p>
                      <div className="gap-2" />
                      <p><strong>So, what are you waiting for?</strong></p>
                      <p>Your journey begins now with Phase 1. Let&apos;s turn chaos into clarity, one perfectly calculated slope at a time! 📉 ➡️ 📊 ➡️ 💡</p>
                      <div className="closing-cta">
                        <p><em>Click ahead to Phase 1, where we start building your prediction superpower! 🔍</em></p>
                        <div className="section-actions start-row">
                          <button className="save-btn" onClick={() => { setOpen(o=>({ ...o, overview:false, p1:true })); }}>Start First Mission</button>
                        </div>
                      </div>
                      </div>

                        
                  </div>
                </div>
              )}
            </div>

            <div className="accordion-item phase1">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p1: !o.p1 })); setP1Sections({ a1:false, a2:false, a3:false, a4:false }); }}>
                <h3>Phase 1: Launch the Investigation</h3>
                <span>{open.p1 ? '▼' : '▶'}</span>
              </div>
              {open.p1 && (
                <div className="accordion-content">
                  <div className="sub-accordion">
                    <div className="sub-item">
                      <div className="sub-header green" onClick={()=> setP1Sections(s => ({ ...s, a1: !s.a1 }))}>
                        <span className="label"><span className="icon">🔎</span> <b>Activity 1: Climate Change Observation</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p1Sections.a1 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p1Sections.a1 ? 'block' : 'none' }}>
                        <div className="info-cards" style={{ width:'100%', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:16 }}>
                          <div className="info-card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', wordBreak:'break-word' }}>
                            <div className="icon-label"><span className="icon">🧭</span> <b>What you will do:</b></div>
                            <p>You will examine real photographs or images showing the effects of climate change specifically in the Davao Region.</p>
                            <p>You will identify visible changes, patterns, and impacts on the environment, communities, and daily life to build awareness of local climate issues that can be studied statistically.</p>
                          </div>
                          <div className="info-card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', wordBreak:'break-word' }}>
                            <div className="icon-label"><span className="icon">🛠️</span> <b>How to do it:</b></div>
                            <ul style={{ paddingLeft:18, marginTop:10 }}>
                              <li>View each image carefully and note what climate-related change or impact is being shown.</li>
                              <li>For each scenario, write down:
                                <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                                  <li>What you observe (flooding, drought, temperature effects, crop damage, etc.)</li>
                                  <li>Who or what is affected (people, animals, plants, infrastructure)</li>
                                  <li>Possible causes</li>
                                </ul>
                              </li>
                              <li>Discuss with classmates: Which scenarios seem most urgent or severe?</li>
                              <li>List 2–3 questions you have about each scenario that could be answered using data or statistics.</li>
                            </ul>
                          </div>
                        </div>

                          <div className="gap-3" />
                          <div className="card spacious" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)' }}>
                            <div className="icon-label" style={{ marginBottom: 8 }}><span className="icon">🖼️</span> <b>Climate Impact Observation</b></div>
                            <p style={{ marginTop: 0, marginBottom: 16 }}>View each image carefully and note what climate-related change or impact is being shown. Answer the questions for each image.</p>

                            {climateScenarios.map((scenario) => {
                              const state = observations[scenario.id] || { obs: '', affected: '', causes: '', submitted: false };
                              const allFilled = !!(state.obs && state.affected && state.causes);
                              return (
                                <div className="card" key={scenario.id} style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', marginBottom:24 }}>
                                  <h4 style={{ marginTop: 0 }}>Climate Scenario {scenario.id}:</h4>
                                  <div style={{ display:'grid', gridTemplateColumns:'4fr 1fr', gap:16, alignItems:'start' }}>
                                    <div style={{ width:'100%' }}>
                                      <img src={scenario.img} alt={scenario.alt} style={{ width:'100%', borderRadius:8, border:'1px solid var(--input-border)', objectFit:'cover' }} />
                                    </div>
                                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                                      <div>
                                        <div style={{ fontWeight:700, marginBottom:4 }}>What do you observe in the image?</div>
                                        <textarea rows={3} value={state.obs} onChange={(e)=> setObservations(prev=>({ ...prev, [scenario.id]: { ...(prev[scenario.id]||{}), obs: e.target.value } }))} disabled={!!state.submitted} style={{ width:'100%', padding:10, border:'1px solid var(--input-border)', borderRadius:8, background:'var(--input-bg)' }} placeholder={`Describe the visible changes or impacts in Scenario ${scenario.id}`} />
                                      </div>
                                      <div>
                                        <div style={{ fontWeight:700, marginBottom:4 }}>Who or what is affected?</div>
                                        <textarea rows={3} value={state.affected} onChange={(e)=> setObservations(prev=>({ ...prev, [scenario.id]: { ...(prev[scenario.id]||{}), affected: e.target.value } }))} disabled={!!state.submitted} style={{ width:'100%', padding:10, border:'1px solid var(--input-border)', borderRadius:8, background:'var(--input-bg)' }} placeholder="People, animals, plants, infrastructure" />
                                      </div>
                                      <div>
                                        <div style={{ fontWeight:700, marginBottom:4 }}>What are the possible causes?</div>
                                        <textarea rows={3} value={state.causes} onChange={(e)=> setObservations(prev=>({ ...prev, [scenario.id]: { ...(prev[scenario.id]||{}), causes: e.target.value } }))} disabled={!!state.submitted} style={{ width:'100%', padding:10, border:'1px solid var(--input-border)', borderRadius:8, background:'var(--input-bg)' }} placeholder="List potential causes" />
                                      </div>
                                      <div className="section-actions" style={{ justifyContent:'flex-start' }}>
                                        <button className="save-btn" onClick={() => {
                                          const cur = observations[scenario.id] || { obs: '', affected: '', causes: '' };
                                          if (!(cur.obs && cur.affected && cur.causes)) return;
                                          try {
                                            saveLesson2Phase1Activity1(user.username, scenario.id, cur.obs, cur.affected, cur.causes);
                                            setObservations(prev => ({ ...prev, [scenario.id]: { ...(prev[scenario.id]||{}), submitted: true } }));
                                          } catch (e) { /* ignore */ }
                                        }} disabled={!allFilled || !!state.submitted} style={{ background:'var(--submit-bg)', color:'var(--submit-text)' }}>Submit Observations</button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)' }}>
                              <div style={{ fontWeight:700, fontSize:18, marginBottom:12 }}>Which scenarios seem most urgent or severe?</div>
                              <textarea rows={4} value={activity1b.mostUrgent} onChange={(e)=> setActivity1b(prev=>({ ...prev, mostUrgent: e.target.value }))} disabled={!!activity1b.submitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)', marginBottom:20 }} placeholder="Write your assessment" />
                              <div style={{ fontWeight:700, fontSize:18, marginBottom:12 }}>List 2–3 questions you have about each scenario that could be answered using data or statistics</div>
                              <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
                                <input value={activity1b.q1} onChange={(e)=> setActivity1b(prev=>({ ...prev, q1: e.target.value }))} disabled={!!activity1b.submitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)' }} placeholder="Question 1" />
                                <input value={activity1b.q2} onChange={(e)=> setActivity1b(prev=>({ ...prev, q2: e.target.value }))} disabled={!!activity1b.submitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)' }} placeholder="Question 2" />
                                <input value={activity1b.q3} onChange={(e)=> setActivity1b(prev=>({ ...prev, q3: e.target.value }))} disabled={!!activity1b.submitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)' }} placeholder="Question 3 (optional)" />
                              </div>
                              <div className="section-actions" style={{ justifyContent:'flex-end' }}>
                                <button className="save-btn" onClick={() => {
                                  if (!(activity1b.mostUrgent && activity1b.q1 && activity1b.q2)) return;
                                  try {
                                    saveLesson2Phase1Activity1b(user.username, activity1b.mostUrgent, activity1b.q1, activity1b.q2, activity1b.q3);
                                    setActivity1b(prev => ({ ...prev, submitted: true }));
                                  } catch (e) { /* ignore */ }
                                }} disabled={!!activity1b.submitted || !(activity1b.mostUrgent && activity1b.q1 && activity1b.q2)} style={{ background:'var(--submit-bg)', color:'var(--submit-text)', borderColor:'var(--submit-bg)' }}>Submit Answers</button>
                              </div>
                            </div>
                            <div className="gap-3" />
                          </div>
                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header green" onClick={()=> setP1Sections(s => ({ ...s, a2: !s.a2 }))}>
                        <span className="label"><span className="icon">🔍</span> <b>Activity 2: Variable Exploration & Identification</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p1Sections.a2 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p1Sections.a2 ? 'block' : 'none' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:18, width:'100%' }}>
                          <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div className="icon-label" style={{ fontWeight:700, fontSize:18, marginBottom:10 }}><span className="icon">🧭</span> What you will do:</div>
                            <p>You will watch a video on the concept of Regression Analysis.</p>
                            <p>Then, you will investigate different climate-related variables and learn to distinguish between independent variables (factors that influence change) and dependent variables (outcomes that are affected).</p>
                          </div>

                          <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div className="icon-label" style={{ fontWeight:700, fontSize:18, marginBottom:10 }}><span className="icon">🛠️</span> How to do it:</div>
                            <ul style={{ paddingLeft:18, margin:0, display:'flex', flexDirection:'column', gap:8 }}>
                              <li>Watch the video and answer the checkpoints.</li>
                              <li>Then, review a list of climate variable pairs provided.</li>
                              <li>For each pair of variables presented, determine which variable is the independent variable (the predictor) and which variable is the dependent variable (the outcome).</li>
                              <li>Write one sentence explaining why correctly identifying variables matters for statistical analysis.</li>
                            </ul>
                          </div>
                        </div>
                        <div className="gap-3" />
                        <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                          <div style={{ fontWeight:700, fontSize:18, marginBottom:12 }}>The Concept of Independent and Dependent Variables in Regression Analysis</div>
                          <div style={{ height:16 }} />
                          <div style={{ position:'relative', paddingBottom:'56.25%', height:0, overflow:'hidden', borderRadius:12, border:'1px solid var(--input-border)', background:'#000' }}>
                            <iframe
                              src="https://www.youtube.com/embed/-JTKf-a1JpU"
                              title="The Concept of Independent and Dependent Variables in Regression Analysis"
                              style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'0' }}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />

                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, alignItems:'start' }}>
                            <div style={{ fontWeight:700, fontSize:18 }}>Video Checkpoints</div>
                            <div />

                            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
                              <div style={{ display:'flex', gap:10 }}>
                                <span style={{ fontWeight:600 }}>1.</span>
                                <span>What method is used to infer or predict a variable based on one or more variables?</span>
                              </div>
                              <div style={{ display:'flex', gap:10 }}>
                                <span style={{ fontWeight:600 }}>2.</span>
                                <span>What variable is being inferred or predicted in a regression analysis and is sometimes called response variable?</span>
                              </div>
                              <div style={{ display:'flex', gap:10 }}>
                                <span style={{ fontWeight:600 }}>3.</span>
                                <span>What variable is used for predicting another variable and is sometimes called predictor variable?</span>
                              </div>
                              <div style={{ display:'flex', gap:10 }}>
                                <span style={{ fontWeight:600 }}>4.</span>
                                <span>What are the two goals of regression analysis?</span>
                              </div>
                              <div style={{ display:'flex', gap:10 }}>
                                <span style={{ fontWeight:600 }}>5.</span>
                                <span>Which type of regression analysis uses only one independent variable as predictor?</span>
                              </div>
                            </div>

                            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
                              {/* Video checkpoint inputs with saved state, validation, and icons */}
                              {[1,2,3,4,5].map((i) => {
                                const val = videoAnswers[i-1] || '';
                                const checked = videoChecks[i-1];
                                return (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input value={val} onChange={(e) => {
                                      if (videoSubmitted) return;
                                      const copy = videoAnswers.slice(); copy[i-1] = e.target.value; setVideoAnswers(copy);
                                    }} disabled={videoSubmitted} style={{ flex: 1, padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)' }} placeholder={`Answer ${i}`} />
                                    <div style={{ width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                      {checked === true && (
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <circle cx="12" cy="12" r="11" stroke="#16a34a" strokeWidth="2" fill="white" />
                                          <path d="M7 12.5l2.5 2.5L17 8" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      )}
                                      {checked === false && (
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <circle cx="12" cy="12" r="11" stroke="#dc2626" strokeWidth="2" fill="#dc2626" />
                                          <rect x="5" y="11" width="14" height="2" fill="white" rx="1" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="section-actions" style={{ marginTop:24, justifyContent:'flex-end' }}>
                            <button className="save-btn" onClick={() => {
                              if (videoSubmitted) return;
                              // require all answers filled
                              if (videoAnswers.slice(0,5).some(a => !a || a.trim() === '')) return;
                              // compute checks
                              const checks = videoAnswers.slice(0,5).map((raw, idx) => {
                                const a = (raw || '').toLowerCase().trim();
                                if (idx === 0) return a.includes('regression');
                                if (idx === 1) return a.includes('dependent');
                                if (idx === 2) return a.includes('independent');
                                if (idx === 3) return (a.includes('influence') && a.includes('prediction')) || a.includes('influence and prediction') || a.includes('prediction');
                                if (idx === 4) return a.includes('linear regression');
                                return false;
                              });
                              const score = checks.reduce((s, c) => s + (c ? 1 : 0), 0);
                              try {
                                saveLesson2Phase1Activity2Checkpoint(user.username, videoAnswers.slice(0,5), score);
                                setVideoChecks(checks.map(c => c ? true : false));
                                setVideoSubmitted(true);
                              } catch (e) { /* ignore */ }
                            }} disabled={videoSubmitted || videoAnswers.slice(0,5).some(a => !a || a.trim() === '')} style={{ background:'var(--submit-bg)', color:'var(--submit-text)', borderColor:'var(--submit-bg)' }}>Submit Answers</button>
                          </div>
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />

                          <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div style={{ fontWeight:700, fontSize:18, marginBottom:16 }}>
                              Now, using your knowledge about independent and dependent variables, explore the pair of climate variables below and identify which is the predictor and response variable between the two.
                            </div>
                            <div style={{ overflowX:'auto' }}>
                              <div style={{ display:'grid', gridTemplateColumns:'0.25fr 1.5fr 1fr 1fr', gap:12, alignItems:'center', fontWeight:700, marginBottom:10 }}>
                                <div />
                                <div>Pair of Variables</div>
                                <div style={{ textAlign:'center' }}>Independent Variable</div>
                                <div style={{ textAlign:'center' }}>Dependent Variable</div>
                              </div>
                              {[
                                'Consecutive Dry Days & Tourist Arrivals',
                                'Rice Production & Heat Index',
                                'Total Rainfall & Rice Production',
                                'Consecutive Wet Days & Electricity Demand',
                                'Respiratory ER Visits & ENSO Index (Niño 3.4)'
                              ].map((pair, idx) => (
                                <div key={pair} style={{ display:'grid', gridTemplateColumns:'0.25fr 1.5fr 1fr 1fr 40px', gap:12, alignItems:'center', marginBottom:14 }}>
                                  <div style={{ fontWeight:600 }}>{idx+1}.</div>
                                  <div>{pair}</div>
                                  <input value={pairAnswers[idx]?.predictor || ''} onChange={(e) => {
                                      if (pairSubmitted) return;
                                      const copy = pairAnswers.slice(); copy[idx] = { ...(copy[idx] || { predictor: '', response: '' }), predictor: e.target.value }; setPairAnswers(copy);
                                  }} disabled={pairSubmitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)' }} placeholder="Predictor" />
                                  <input value={pairAnswers[idx]?.response || ''} onChange={(e) => {
                                      if (pairSubmitted) return;
                                      const copy = pairAnswers.slice(); copy[idx] = { ...(copy[idx] || { predictor: '', response: '' }), response: e.target.value }; setPairAnswers(copy);
                                  }} disabled={pairSubmitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)' }} placeholder="Response" />
                                  <div style={{ width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    {pairChecks[idx] === true && (
                                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="11" stroke="#16a34a" strokeWidth="2" fill="white" />
                                        <path d="M7 12.5l2.5 2.5L17 8" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    )}
                                    {pairChecks[idx] === false && (
                                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="11" stroke="#dc2626" strokeWidth="2" fill="#dc2626" />
                                        <rect x="5" y="11" width="14" height="2" fill="white" rx="1" />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="section-actions" style={{ marginTop:12, justifyContent:'flex-end' }}>
                              <button className="save-btn" onClick={() => {
                                if (pairSubmitted) return;
                                // require all predictors and responses filled
                                if (pairAnswers.slice(0,5).some(p => !p.predictor || !p.response)) return;
                                try {
                                  saveLesson2Phase1Activity2b(user.username, pairAnswers.slice(0,5));
                                  // compute checks
                                  const checks = pairAnswers.slice(0,5).map((p, idx) => {
                                    try {
                                      const key = activity2bAnswerKey[idx];
                                      const pred = (p.predictor || '').toLowerCase().trim();
                                      const resp = (p.response || '').toLowerCase().trim();
                                      const predOk = key && pred.includes((key.predictor || '').toLowerCase());
                                      const respOk = key && resp.includes((key.response || '').toLowerCase());
                                      return !!(predOk && respOk);
                                    } catch (e) { return false; }
                                  });
                                  setPairChecks(checks.map(c => c ? true : false));
                                  setPairSubmitted(true);
                                } catch (e) { /* ignore */ }
                              }} disabled={pairSubmitted || pairAnswers.slice(0,5).some(p => !p.predictor || !p.response)} style={{ background:'var(--submit-bg)', color:'var(--submit-text)', borderColor:'var(--submit-bg)' }}>Submit Answers</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header green" onClick={()=> setP1Sections(s => ({ ...s, a3: !s.a3 }))}>
                        <span className="label"><span className="icon">📊</span> <b>Activity 3: Climate Variable Selection</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p1Sections.a3 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p1Sections.a3 ? 'block' : 'none' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:18, width:'100%' }}>
                          <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div className="icon-label" style={{ fontWeight:700, fontSize:18, marginBottom:10 }}><span className="icon">🧭</span> What you will do:</div>
                            <p>You will choose a specific pair of climate-related variables from the Davao Region that you want to investigate for your regression analysis project.</p>
                            <p>You will justify your selection based on relevance, data availability, and personal interest in the climate issue.</p>
                          </div>

                          <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div className="icon-label" style={{ fontWeight:700, fontSize:18, marginBottom:10 }}><span className="icon">🛠️</span> How to do it:</div>
                            <ul style={{ paddingLeft:18, margin:0, display:'flex', flexDirection:'column', gap:8 }}>
                              <li>Review the list of available climate variables and datasets for Davao Region.</li>
                              <li>Consider which climate issues from Activity 1 (observation) interested you most.</li>
                              <li>Select one independent variable and one dependent variable.</li>
                              <li>Write a brief explanation that includes why you think they are related, what you hope to discover about their relationship, and how this relationship impacts Davao Region communities or environment.</li>
                              <li>Predict whether you expect a positive correlation, negative correlation, or no correlation.</li>
                            </ul>
                          </div>
                        </div>
                        <div className="gap-3" />
                        <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                          <div style={{ fontWeight:700, fontSize:18, marginBottom:18 }}>
                            From the list in each variable, choose one independent variable and one dependent variable that you would like to explore for this lesson.
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:16, width:'100%', marginBottom:32 }}>
                            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                              <div style={{ fontWeight:700, fontSize:18, textAlign:'center' }}>Independent Variable</div>
                              <select value={a3Var1} onChange={(e) => setA3Var1(e.target.value)} disabled={a3Submitted} style={{ width:'90%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)', color:'var(--p-regular)', alignSelf:'center' }}>
                                <option value="" disabled>Select independent variable</option>
                                <option>Consecutive Dry Days</option>
                                <option>Consecutive Wet Days</option>
                                <option>ENSO Index (Niño 3.4)</option>
                                <option>Heat Index (°C)</option>
                                <option>PM2.5 (μg/m³)</option>
                                <option>Rainfall Total (mm)</option>
                                <option>Sea Surface Temp (°C)</option>
                                <option>Temperature Mean (°C)</option>
                                <option>Wind Speed (m/s)</option>
                              </select>
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                              <div style={{ fontWeight:700, fontSize:18, textAlign:'center' }}>Dependent Variable</div>
                              <select value={a3Var2} onChange={(e) => setA3Var2(e.target.value)} disabled={a3Submitted} style={{ width:'90%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)', color:'var(--p-regular)', alignSelf:'center' }}>
                                <option value="" disabled>Select dependent variable</option>
                                <option>Banana Production (MT)</option>
                                <option>Commercial Fish Catch (MT)</option>
                                <option>Electricity Demand (GWh)</option>
                                <option>Heat-Related Illness Cases</option>
                                <option>Municipal Fish Catch (MT)</option>
                                <option>Respiratory ER Visits</option>
                                <option>Rice Production (MT)</option>
                                <option>Tourist Arrivals</option>
                                <option>Traffic Accidents</option>
                                <option>Water Service Interruptions</option>
                              </select>
                            </div>
                          </div>

                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div style={{ height:40 }} />
                          <div style={{ fontStyle:'italic', marginBottom:8 }}>Why do you think this pair of variables are related?</div>
                          <textarea rows={2} value={a3Reasoning} onChange={(e) => setA3Reasoning(e.target.value)} disabled={a3Submitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)', marginBottom:12 }} placeholder="Provide your reasoning" />

                          <div style={{ fontStyle:'italic', marginBottom:8 }}>Predict whether you expect a positive correlation, negative correlation, or no correlation</div>
                          <textarea rows={2} value={a3Prediction} onChange={(e) => setA3Prediction(e.target.value)} disabled={a3Submitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)', marginBottom:12 }} placeholder="State your prediction" />

                            <div style={{ fontStyle:'italic', marginBottom:8 }}>Write your research question based on the influence of the independent variable on the dependent variable.<br/>Example: Does heat index influence heat-related illneses in Davao Region?</div>
                          <textarea rows={2} value={a3ResearchQuestion} onChange={(e) => setA3ResearchQuestion(e.target.value)} disabled={a3Submitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)', marginBottom:16 }} placeholder="Describe the potential impact" />

                          <div className="section-actions" style={{ justifyContent:'flex-end' }}>
                            <button className="save-btn" onClick={() => submitA3()} disabled={a3Submitted || !canSubmitA3()} style={{ background:'var(--submit-bg)', color:'var(--submit-text)', borderColor:'var(--submit-bg)' }}>{a3Submitted ? 'Submitted' : 'Submit Answers'}</button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header green" onClick={()=> setP1Sections(s => ({ ...s, a4: !s.a4 }))}>
                        <span className="label"><span className="icon">✅</span> <b>Activity 4: Exit Ticket</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p1Sections.a4 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p1Sections.a4 ? 'block' : 'none' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:18, width:'100%', marginBottom:18 }}>
                          <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div className="icon-label" style={{ fontWeight:700, fontSize:18, marginBottom:10 }}><span className="icon">🧭</span> What you will do:</div>
                            <p>You will reflect on what you learned during the lesson by completing a brief exit ticket.</p>
                            <p>This helps you consolidate your understanding of key concepts and allows your teacher to assess what was clear and what needs further review.</p>
                          </div>
                          <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div className="icon-label" style={{ fontWeight:700, fontSize:18, marginBottom:10 }}><span className="icon">🛠️</span> How to do it:</div>
                            <ul style={{ paddingLeft:18, margin:0, display:'flex', flexDirection:'column', gap:8 }}>
                              <li>Answer the prompt honestly and completely.</li>
                              <li>Rate your confidence level on a scale of 1–5:
                                <ul style={{ marginTop:8, paddingLeft:18, display:'flex', flexDirection:'column', gap:6 }}>
                                  <li>Understanding independent vs. dependent variables</li>
                                  <li>Selecting appropriate climate variables for analysis</li>
                                  <li>Connecting statistics to real-world climate issues</li>
                                </ul>
                              </li>
                            </ul>
                          </div>
                        </div>

                        <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                          <div style={{ fontWeight:700, fontSize:18, marginBottom:12 }}>Exit Ticket</div>
                          <div style={{ marginBottom:10 }}>Write the most important concept or skill you gained from this phase of the lesson.</div>
                          <textarea rows={2} value={exitText} onChange={(e) => setExitText(e.target.value)} disabled={exitSubmitted} style={{ width:'100%', padding:12, border:'1px solid var(--input-border)', borderRadius:10, background:'var(--input-bg)', marginBottom:20 }} placeholder="Share your key takeaway" />

                          <div style={{ marginBottom:12 }}>On a scale of 1–5, rate your confidence level on the following:</div>
                          <div style={{ display:'grid', gridTemplateColumns:'1.5fr repeat(5, 60px)', gap:8, alignItems:'center' }}>
                            <div />
                            {[5,4,3,2,1].map((n)=> (
                              <div key={`hdr-${n}`} style={{ textAlign:'center', fontWeight:600 }}>{n}</div>
                            ))}

                            <div style={{ paddingLeft:10 }}>Understanding independent vs. dependent variables</div>
                            {[5,4,3,2,1].map((n)=> (
                              <label key={`row1-${n}`} style={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
                                <input type="radio" name="conf-indep" value={n} checked={exitScale1 === n} onChange={() => setExitScale1(n)} disabled={exitSubmitted} style={{ accentColor:'var(--submit-bg)' }} />
                              </label>
                            ))}

                            <div style={{ paddingLeft:10 }}>Selecting appropriate climate variables for analysis</div>
                            {[5,4,3,2,1].map((n)=> (
                              <label key={`row2-${n}`} style={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
                                <input type="radio" name="conf-select" value={n} checked={exitScale2 === n} onChange={() => setExitScale2(n)} disabled={exitSubmitted} style={{ accentColor:'var(--submit-bg)' }} />
                              </label>
                            ))}

                            <div style={{ paddingLeft:10 }}>Connecting statistics to real-world climate issues</div>
                            {[5,4,3,2,1].map((n)=> (
                              <label key={`row3-${n}`} style={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
                                <input type="radio" name="conf-connect" value={n} checked={exitScale3 === n} onChange={() => setExitScale3(n)} disabled={exitSubmitted} style={{ accentColor:'var(--submit-bg)' }} />
                              </label>
                            ))}
                          </div>

                          <div className="section-actions" style={{ marginTop:20, justifyContent:'flex-end' }}>
                            <button className="save-btn" onClick={() => {
                              if (exitSubmitted) return;
                              if (!exitText || !exitScale1 || !exitScale2 || !exitScale3) return;
                              try {
                                saveLesson2Phase1Activity4(user.username, exitText, exitScale1, exitScale2, exitScale3);
                                setExitSubmitted(true);
                              } catch (e) { /* ignore */ }
                            }} disabled={exitSubmitted || !(exitText && exitScale1 && exitScale2 && exitScale3)} style={{ background:'var(--submit-bg)', color:'var(--submit-text)', borderColor:'var(--submit-bg)' }}>{exitSubmitted ? 'Submitted' : 'Submit Exit Ticket'}</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

              <div className="accordion-item phase2">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p2: !o.p2 })); setP2Sections({ a1:false, a2:false, a3:false, a4:false }); }}>
                <h3>Phase 2: Build the Model</h3>
                <span>{open.p2 ? '▼' : '▶'}</span>
              </div>
              {open.p2 && (
                <div className="accordion-content">
                  <div className="sub-accordion">
                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2Sections(s => ({ ...s, a1: !s.a1 }))}>
                        <span className="label"><span className="icon">📐</span> <b>Activity 1: Understanding Regression Lines</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p2Sections.a1 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p2Sections.a1 ? 'block' : 'none' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, padding: '8px 8px', alignItems: 'stretch' }}>
                          <div className="info-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <span className="icon">🧭</span>
                              <div style={{ fontWeight: 700, color: 'var(--plot-primary)', fontSize: '1.05rem' }}>What you will do:</div>
                            </div>
                            <div style={{ color: 'var(--plot-value-primary)', lineHeight: 1.6, flex: 1 }}>
                              <p style={{ margin: 0 }}>You will watch an instructional video that explains what a regression line is, how it represents the relationship between two variables, and why it's useful for making predictions about climate data.</p>
                              <p style={{ marginTop: 12 }}>You will learn the basic concepts before applying them to calculations.</p>
                            </div>
                          </div>

                          <div className="info-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <span className="icon">🛠️</span>
                              <div style={{ fontWeight: 700, color: 'var(--plot-primary)', fontSize: '1.05rem' }}>How to do it:</div>
                            </div>
                            <div style={{ color: 'var(--plot-value-primary)', lineHeight: 1.6, flex: 1 }}>
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                <li>Watch the video carefully from beginning to end without pausing first to get an overview</li>
                                <li>Take notes on the key concepts as you watch</li>
                                <li>Pay attention to the regression equation format: ŷ = a + bx (or y = mx + b)</li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        <div className="gap-3" />

                        <div className="card" style={{ padding: 18 }}>
                          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, textAlign: 'left' }}><b>The Concept of Linear Regression</b></div>
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />

                          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 12, border: '1px solid #FFD4E4', background: '#000' }}>
                            <iframe
                              src="https://www.youtube.com/embed/gPfgB4ew3RY"
                              title="Linear Regression"
                              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: '0' }}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>

                          <div style={{ height: 40 }} />

                          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, textAlign: 'left' }}>Video Checkpoints:</div>
                          <div className="gap-3" />

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {lesson2Phase2Activity1Questions.map((q, idx) => (
                                <div key={`q-left-${idx}`} style={{ fontWeight: 600 }}>{idx+1}. {q}</div>
                              ))}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {[0,1,2,3].map((i)=> (
                                <div key={`p2q-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input value={phase2A1Answers[i] || ''} onChange={(e) => {
                                    if (phase2A1Submitted) return;
                                    const copy = phase2A1Answers.slice(); copy[i] = e.target.value; setPhase2A1Answers(copy);
                                  }} disabled={phase2A1Submitted} placeholder={`Answer ${i+1}`} style={{ flex: 1, padding:10, border:'1px solid #FFD4E4', borderRadius:8, background:'#FFF5F9' }} />
                                  <div style={{ width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    {phase2A1Checks[i] === true && (
                                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="11" stroke="#16a34a" strokeWidth="2" fill="white" />
                                        <path d="M7 12.5l2.5 2.5L17 8" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    )}
                                    {phase2A1Checks[i] === false && (
                                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="11" stroke="#dc2626" strokeWidth="2" fill="#dc2626" />
                                        <rect x="5" y="11" width="14" height="2" fill="white" rx="1" />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                              ))}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                <button className="save-btn" onClick={() => {
                                  if (phase2A1Submitted) return;
                                  if (phase2A1Answers.slice(0,4).some(a => !a || a.trim() === '')) return;
                                  try {
                                    const checks = phase2A1Answers.slice(0,4).map((ans, idx) => {
                                      try { const v = lesson2Phase2Activity1Validators[idx]; return v ? !!v(ans) : false; } catch (e) { return false; }
                                    });
                                    const score = checks.reduce((s, c) => s + (c ? 1 : 0), 0);
                                    saveLesson2Phase2Activity1(user.username, phase2A1Answers.slice(0,4), score);
                                    setPhase2A1Checks(checks.map(c => c ? true : false));
                                    setPhase2A1Submitted(true);
                                  } catch (e) { /* ignore */ }
                                }} disabled={phase2A1Submitted || phase2A1Answers.slice(0,4).some(a => !a || a.trim() === '')} style={{ background: '#E6B8CC', color: '#4D2038', borderColor: '#E6B8CC' }}>Save Answers</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2Sections(s => ({ ...s, a2: !s.a2 }))}>
                        <span className="label"><span className="icon">✏️</span> <b>Activity 2: Manual Regression Calculation Practice</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p2Sections.a2 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p2Sections.a2 ? 'block' : 'none' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, padding: '8px 8px', alignItems: 'stretch' }}>
                          <div className="info-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <span className="icon">🧭</span>
                              <div style={{ fontWeight: 700, color: 'var(--plot-primary)', fontSize: '1.05rem' }}>What you will do:</div>
                            </div>
                            <div style={{ color: 'var(--plot-value-primary)', lineHeight: 1.6, flex: 1 }}>
                              <p style={{ margin: 0 }}>You will learn to calculate a regression equation by hand using sample climate data.</p>
                              <p style={{ marginTop: 8 }}>Through guided practice, you will work step-by-step through the mathematical process to find the slope and y-intercept of the regression line.</p>
                            </div>
                          </div>

                          <div className="info-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <span className="icon">🛠️</span>
                              <div style={{ fontWeight: 700, color: 'var(--plot-primary)', fontSize: '1.05rem' }}>How to do it:</div>
                            </div>
                            <div style={{ color: 'var(--plot-value-primary)', lineHeight: 1.6, flex: 1 }}>
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                <li>Using the sample data set, complete the calculation table like what you did in the previous lesson.</li>
                                <li>Once you have all data in the calculation table, substitute the necessary values in the formula for slope (b) and y-intercept (a).</li>
                                <li>Once you have calculated your slope (b) and y-intercept (a) values, substitute actual numbers for a and b in the final regression equation.</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                        <div className="gap-3" />
                        <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                          <div style={{ fontWeight:700, fontSize:18, marginBottom:12, textAlign:'left' }}>
                            <b>Step-by-Step Guide in Solving the Slope and y-Intercept</b>
                          </div>
                          <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                            <div>Instructions:</div>
                            <ol style={{ marginTop:6, paddingLeft:18 }}>
                              <li>Click on the link to open the activity sheet.</li>
                              <li>Make a copy of the template for yourself.</li>
                              <li>Complete the activity by showing the step-by-step process of solving for the slope (b) and y-intercept.</li>
                              <li>When you're finished, download your completed work.</li>
                              <li>Upload your file using the link below.</li>
                            </ol>

                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div className="section-actions" style={{ justifyContent: 'flex-start' }}>
                              <button
                                type="button"
                                onClick={() => window.open('https://docs.google.com/spreadsheets/d/1mfr-gFIMTGMeuSXPmPHBQurT4Er8wYUAWgvBiE4-L0M/edit?usp=sharing', '_blank')}
                                className="save-btn"
                              >
                                Activity Sheet Link
                              </button>
                            </div>
                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div style={{ height: 1, background: 'var(--input-border)', width: '100%', marginTop: 8 }} />

                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>Upload your output here.</div>
                            <div style={{ textAlign:'left', marginBottom:12 }}>Before uploading, make sure it is in pdf format with this filename format: Lesson2_Phase2_Activity2_username.</div>

                            <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
                              <input id="activity2-upload" type="file" accept="application/pdf" style={{ display:'none' }} onChange={(e) => {
                                if (phase2A2Submitted) return;
                                const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                                if (previewURL) { try { URL.revokeObjectURL(previewURL); } catch(e){} }
                                if (f) { setPreviewURL(URL.createObjectURL(f)); setUploadedFile(f); setUploadedFileName(f.name); } else { setPreviewURL(null); setUploadedFile(null); setUploadedFileName(''); }
                              }} />
                              <button className="save-btn" type="button" disabled={phase2A2Submitted} onClick={() => (document.getElementById('activity2-upload') as HTMLInputElement).click()}>Upload File</button>
                              <div style={{ fontStyle:'italic' }}>{uploadedFileName || (uploadedFile ? uploadedFile.name : 'No file chosen')}</div>
                            </div>

                            <div style={{ marginBottom:12 }}>
                                <div style={{ position:'relative', paddingBottom:'56.25%', height:0, overflow:'hidden', borderRadius:8, border:'1px solid var(--input-border)', background:'#FFF' }}>
                                {previewURL ? (
                                  <iframe src={previewURL} title="Upload Preview" style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:0 }} />
                                ) : (
                                  <div style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}>Preview will appear here after upload</div>
                                )}
                              </div>
                            </div>

                            <div className="gap-3" />
                            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                              <button className="save-btn" type="button" disabled={!uploadedFile || phase2A2Submitted} onClick={() => {
                                if (phase2A2Submitted) return;
                                const f = uploadedFile;
                                if (!f) return;
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  try {
                                    const data = ev.target?.result as string;
                                    saveLesson2Phase2Activity2(user.username, data, f.type, f.name);
                                    setPhase2A2Submitted(true);
                                    setSubmissionMessage('File submitted — preview saved.');
                                    // ensure preview displays persisted data URL
                                    setPreviewURL(data);
                                    // progress will be recomputed by central effect
                                  } catch (e) { /* ignore */ }
                                };
                                reader.readAsDataURL(f);
                              }}>{phase2A2Submitted ? 'Submitted' : 'Submit Output'}</button>
                            </div>

                            {submissionMessage && (
                              <div style={{ marginTop:12 }}>{submissionMessage}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2Sections(s => ({ ...s, a3: !s.a3 }))}>
                        <span className="label"><span className="icon">🧮</span> <b>Activity 3: Spreadsheet Verification of Regression Equation</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p2Sections.a3 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p2Sections.a3 ? 'block' : 'none' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, padding: '8px 8px', alignItems: 'stretch' }}>
                          <div className="info-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <span className="icon">🧭</span>
                              <div style={{ fontWeight: 700, color: 'var(--plot-primary)', fontSize: '1.05rem' }}>What you will do:</div>
                            </div>
                            <div style={{ color: 'var(--plot-value-primary)', lineHeight: 1.6, flex: 1 }}>
                              <p style={{ margin: 0 }}>You will use spreadsheet software (Google Sheets) to verify the regression equation you calculated manually in Activity 2.</p>
                              <p style={{ marginTop: 8 }}>You will learn spreadsheet functions and formulas that automate regression calculations and compare results to ensure accuracy.</p>
                            </div>
                          </div>

                          <div className="info-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <span className="icon">🛠️</span>
                              <div style={{ fontWeight: 700, color: 'var(--plot-primary)', fontSize: '1.05rem' }}>How to do it:</div>
                            </div>
                            <div style={{ color: 'var(--plot-value-primary)', lineHeight: 1.6, flex: 1 }}>
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                <li>Open a new spreadsheet and enter your sample dataset from Activity 2.</li>
                                <li>Use the SLOPE function to calculate the slope (b) and the INTERCEPT function to calculate the y-intercept (a).</li>
                                <li>Compare your spreadsheet results with your manual calculations.</li>
                                <li>Verify that the equation shown on the chart matches your calculated values.</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                        <div className="gap-3" />
                        <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                          <div style={{ fontWeight:700, fontSize:18, marginBottom:12, textAlign:'left' }}>
                            <b>Steps in Solving for Slope (b) and y-Intercept (a) in Spreadsheet</b>
                          </div>
                          <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                            <div style={{ margin: 0 }}>Alright math wizards, you've conquered slopes and y-intercepts the old-fashioned way with your brain power! 🧠</div>
                            <div style={{ marginTop:8 }}>Now it's time to let the spreadsheets do some of the heavy lifting!</div>
                            <div style={{ marginTop:8 }}>Watch the video below to learn how to solve for slope and y-intercept using a spreadsheet.</div>
                            <div style={{ marginTop:8 }}>It's like giving your calculator a superpower upgrade! 🚀</div>

                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div style={{ position:'relative', paddingBottom:'56.25%', height:0, overflow:'hidden', borderRadius:12, border:'1px solid var(--input-border)', background:'#000' }}>
                              <iframe
                                src="https://www.youtube.com/embed/rEbfDFhMDiI"
                                title="Spreadsheet Slope and Intercept"
                                style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:0 }}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                          
                          <div className="gap-3" />
                          <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18, marginTop:12 }}>
                            <div style={{ fontWeight:700, fontSize:18, marginBottom:12, textAlign:'left' }}>
                              <b>Verification of Computed Slope and y-Intercept Values</b>
                            </div>
                            <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                              <div>Instructions:</div>
                              <ol style={{ marginTop:6, paddingLeft:18 }}>
                                <li>Click on the link to open the verification sheet.</li>
                                <li>Make a copy of the template for yourself.</li>
                                <li>Complete the activity by using the formula to solve for the slope (b) and y-intercept (a).</li>
                                <li>When you're finished, download your completed work in PDF format.</li>
                                <li>Upload your file using the link below.</li>
                              </ol>

                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />

                              <div className="section-actions" style={{ justifyContent:'flex-start' }}>
                                <button type="button" className="save-btn" onClick={() => window.open('https://docs.google.com/spreadsheets/d/1RaYyGskt_-2z4AT7BGW3Ujvl3o1QY9caU1FMJYrDXFk/edit?usp=sharing', '_blank')}>Verification Sheet Link</button>
                              </div>

                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />

                              <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>Upload your output here.</div>
                              <div style={{ textAlign:'left', marginBottom:12 }}>Before uploading, make sure it is in PDF format with this filename format: Lesson2_Phase2_Activity3_username.</div>

                              <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
                                  <input id="activity3-upload" type="file" accept="application/pdf" style={{ display:'none' }} onChange={(e) => {
                                    if (submitDisabled3) return;
                                    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                                    try { if (previewURL3) { URL.revokeObjectURL(previewURL3); } } catch (e) { /* ignore */ }
                                    if (f) { setPreviewURL3(URL.createObjectURL(f)); setUploadedFile3(f); } else { setPreviewURL3(null); setUploadedFile3(null); }
                                  }} />
                                  <button className="save-btn" type="button" onClick={() => (document.getElementById('activity3-upload') as HTMLInputElement).click()} disabled={submitDisabled3}>Upload File</button>
                                  <div style={{ fontStyle:'italic' }}>{uploadedFile3 ? uploadedFile3.name : 'No file chosen'}</div>
                              </div>

                              <div style={{ marginBottom:12 }}>
                                <div style={{ position:'relative', paddingBottom:'56.25%', height:0, overflow:'hidden', borderRadius:8, border:'1px solid var(--input-border)', background:'#FFF' }}>
                                  {previewURL3 ? (
                                    <iframe src={previewURL3} title="Upload Preview" style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:0 }} />
                                  ) : (
                                    <div style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}>Preview will appear here after upload</div>
                                  )}
                                </div>
                              </div>

                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />

                              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                                <button className="save-btn" type="button" disabled={!uploadedFile3 || submitDisabled3} onClick={() => {
                                  if (submitDisabled3) return;
                                  const f = uploadedFile3;
                                  if (!f) return;
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    try {
                                      const data = ev.target?.result as string;
                                      saveLesson2Phase2Activity3(user.username, data, f.type, f.name);
                                      setSubmissionMessage3('File submitted — preview saved.');
                                      setSubmitDisabled3(true);
                                      setPreviewURL3(data);
                                      // progress will be recomputed by central effect
                                    } catch (e) { /* ignore */ }
                                  };
                                  reader.readAsDataURL(f);
                                }}>{submitDisabled3 ? 'Submitted' : 'Submit Output'}</button>
                              </div>

                              {submissionMessage3 && (
                                <div style={{ marginTop:12 }}>{submissionMessage3}</div>
                              )}
                            </div>
                          </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2Sections(s => ({ ...s, a4: !s.a4 }))}>
                        <span className="label"><span className="icon">📈</span> <b>Activity 4: Calculating Your Climate Project Regression</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p2Sections.a4 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p2Sections.a4 ? 'block' : 'none' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, padding: '8px 8px', alignItems: 'stretch' }}>
                          <div className="info-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <span className="icon">🧭</span>
                              <div style={{ fontWeight: 700, color: 'var(--plot-primary)', fontSize: '1.05rem' }}>What you will do:</div>
                            </div>
                            <div style={{ color: 'var(--plot-value-primary)', lineHeight: 1.6, flex: 1 }}>
                              <p style={{ margin: 0 }}>You will apply spreadsheet regression tools to analyze your own selected climate variables for the Davao Region.</p>
                              <p style={{ marginTop: 8 }}>You will calculate the regression equation for your actual project data and interpret what the results mean for your climate research question.</p>
                            </div>
                          </div>

                          <div className="info-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <span className="icon">🛠️</span>
                              <div style={{ fontWeight: 700, color: 'var(--plot-primary)', fontSize: '1.05rem' }}>How to do it:</div>
                            </div>
                            <div style={{ color: 'var(--plot-value-primary)', lineHeight: 1.6, flex: 1 }}>
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                <li>Open a new spreadsheet and organize your climate dataset as shown below.</li>
                                <li>Calculate the regression equation components using the SLOPE function to calculate the slope (b) and the INTERCEPT function to calculate the y-intercept (a).</li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        <div className="gap-3" />
                        <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18, marginTop:12 }}>
                          <div style={{ fontWeight:700, fontSize:18, marginBottom:12, textAlign:'left' }}>
                            <b>Application of the Slope and y-Intercept Calculation in the Chosen Independent and Dependent Variables</b>
                          </div>
                          <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                            <div>Instructions:</div>
                              <ol style={{ marginTop:6, paddingLeft:18 }}>
                              <li>Click on the link to open the computation sheet.</li>
                              <li>Make a copy of the template for yourself.</li>
                              <li>From the given complete dataset, extract only the data for the Independent and Dependent Variables that you chose in Phase 1 of this Lesson.</li>
                              <li>Complete the activity by solving for the slope (b) and y-intercept.</li>
                              <li>When you're finished, download your completed work in PDF format.</li>
                              <li>Upload your file using the link below.</li>
                            </ol>

                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div className="section-actions" style={{ justifyContent:'flex-start' }}>
                              <button type="button" className="save-btn" onClick={() => window.open('https://docs.google.com/spreadsheets/d/1YLUhFPwIBJ0rcUQydeGLMKoMgiVkSWc6ZgDeWsy7ssE/edit?usp=sharing', '_blank')}>Computation Sheet Link</button>
                            </div>

                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>Upload your output here.</div>
                            <div style={{ textAlign:'left', marginBottom:12 }}>Before uploading, make sure it is in PDF format with this filename format: Lesson2_Phase2_Activity4_username.</div>

                            <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
                              <input id="activity4-upload" type="file" accept="application/pdf" style={{ display:'none' }} onChange={(e) => {
                                const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                                if (previewURL4) { URL.revokeObjectURL(previewURL4); }
                                if (f) { setPreviewURL4(URL.createObjectURL(f)); setUploadedFile4(f); } else { setPreviewURL4(null); setUploadedFile4(null); }
                              }} />
                              <button className="save-btn" type="button" onClick={() => (document.getElementById('activity4-upload') as HTMLInputElement).click()} disabled={submitDisabled4}>Upload File</button>
                              <div style={{ fontStyle:'italic' }}>{uploadedFile4 ? uploadedFile4.name : 'No file chosen'}</div>
                            </div>

                            <div style={{ marginBottom:12 }}>
                              <div style={{ position:'relative', paddingBottom:'56.25%', height:0, overflow:'hidden', borderRadius:8, border:'1px solid var(--input-border)', background:'#FFF' }}>
                                {previewURL4 ? (
                                  <iframe src={previewURL4} title="Upload Preview" style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:0 }} />
                                ) : (
                                  <div style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}>Preview will appear here after upload</div>
                                )}
                              </div>
                            </div>

                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>Now, encode the Regression Line Equation of your variables and its interpretation.</div>

                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>A. My Regression Line Equation:</div>
                            <input value={p4Equation} onChange={(e)=>setP4Equation(e.target.value)} onBlur={async ()=>{ try { await saveLesson2Phase2Activity4Interpret(user.username, p4Interpretation, { encodings: { equation: p4Equation, yIntercept: p4YIntercept, interpretation: p4Interpretation }, var1:'', var2:'' }); } catch(e){} }} disabled={p4Locked} style={{ width:'100%', padding:12, border:'1px solid #FFD4E4', borderRadius:10, background:'#FFF5F9', marginBottom:8 }} placeholder="Enter regression equation (e.g., y = 24.5x - 45)" />
                            <div style={{ fontStyle:'italic', fontSize:'0.9rem', color:'#6B7280', marginBottom:12 }}>Regression Line Equation: y = bx + a   or  y = a + bx      |  Example: y = 24.5x - 45</div>

                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>B. y-Intercept Interpretation:</div>
                            <input value={p4YIntercept} onChange={(e)=>setP4YIntercept(e.target.value)} onBlur={async ()=>{ try { await saveLesson2Phase2Activity4Interpret(user.username, p4Interpretation, { encodings: { equation: p4Equation, yIntercept: p4YIntercept, interpretation: p4Interpretation }, var1:'', var2:'' }); } catch(e){} }} disabled={p4Locked} style={{ width:'100%', padding:12, border:'1px solid #FFD4E4', borderRadius:10, background:'#FFF5F9', marginBottom:8 }} placeholder="Enter y-intercept interpretation" />
                            <div style={{ fontStyle:'italic', fontSize:'0.9rem', color:'#6B7280', marginBottom:12 }}>Sample: The best fit line begins at [value of y-intercept].</div>

                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>C. My Regression Line Equation's Interpretation:</div>
                            <textarea value={p4Interpretation} onChange={(e)=>setP4Interpretation(e.target.value)} onBlur={async ()=>{ try { await saveLesson2Phase2Activity4Interpret(user.username, p4Interpretation, { encodings: { equation: p4Equation, yIntercept: p4YIntercept, interpretation: p4Interpretation }, var1:'', var2:'' }); } catch(e){} }} rows={3} disabled={p4Locked} style={{ width:'100%', padding:12, border:'1px solid #FFD4E4', borderRadius:10, background:'#FFF5F9', marginBottom:8 }} placeholder="Describe the interpretation of your regression equation" />
                            <div style={{ fontStyle:'italic', fontSize:'0.9rem', color:'#6B7280', marginBottom:12 }}>Templates:
                              <div>For positive slope: As [name of IV] increases, the [name of DV] also increases by [value of slope without the positive sign].</div>
                              <div>For negative slope: As [name of IV] decreases, the [name of DV] also increases by [value of slope without the negative sign].</div>
                            </div>

                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />

                            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                              <button className="save-btn" type="button" disabled={submitDisabled4 || !uploadedFile4 || !p4Equation.trim() || !p4YIntercept.trim() || !p4Interpretation.trim()} onClick={() => {
                                if (submitDisabled4) return;
                                const f = uploadedFile4;
                                if (!f) return;
                                const reader = new FileReader();
                                    reader.onload = async (ev) => {
                                  try {
                                    const data = ev.target?.result as string;
                                    // persist uploaded file for teacher preview
                                    saveLesson2Phase2Activity4(user.username, data, f.type, f.name);
                                    // persist interpretation and encodings
                                    try {
                                      await saveLesson2Phase2Activity4Interpret(user.username, p4Interpretation, { encodings: { equation: p4Equation, yIntercept: p4YIntercept, interpretation: p4Interpretation }, var1: '', var2: '' });
                                      setP4Locked(true);
                                    } catch (e) { /* ignore */ }
                                    setSubmissionMessage4('File and encodings submitted — saved.');
                                    setSubmitDisabled4(true);
                                    setPreviewURL4(data);
                                    // progress will be recomputed by central effect
                                  } catch (e) { /* ignore */ }
                                };
                                reader.readAsDataURL(f);
                              }}>{submitDisabled4 ? 'Submitted' : 'Submit Output'}</button>
                            </div>

                            {submissionMessage4 && (
                              <div style={{ marginTop:12 }}>{submissionMessage4}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="accordion-item phase3">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p3: !o.p3 })); setP3Sections({ a1:false, a2:false, a3:false }); }}>
                <h3>Phase 3: Make Sense of the Line</h3>
                <span>{open.p3 ? '▼' : '▶'}</span>
              </div>
              {open.p3 && (
                <div className="accordion-content">
                  <div className="sub-accordion">
                    <div className="sub-item">
                      <div className="sub-header" onClick={()=> setP3Sections(s => ({ ...s, a1: !s.a1 }))}>
                        <span className="label"><span className="icon">🔮</span> <b>Activity 1: Relating Findings to Real-World</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p3Sections.a1 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p3Sections.a1 ? 'block' : 'none' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:12 }}>
                          <div className="info-card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div style={{ fontWeight:700, marginBottom:8 }}><span className="icon">🧭</span> What you will do:</div>
                            <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                              <p style={{ margin:0 }}>You will evaluate the degree of influence that your chosen independent variable has on your dependent variable.</p>
                              <p style={{ marginTop:8 }}>You will examine whether the influence is strong enough to make meaningful conclusions and identify any limitations or factors that might affect the results.</p>
                            </div>
                          </div>

                          <div className="info-card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div style={{ fontWeight:700, marginBottom:8 }}><span className="icon">🛠️</span> How to do it:</div>
                            <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                              <ul style={{ margin:0, paddingLeft:18 }}>
                                <li>Consider what the influence of the independent variable on the dependent variable means in real-world terms</li>
                                <li>Identify at least three factors that could influence or confound your results (such as seasonal patterns, measurement errors, or other climate variables not included)</li>
                                <li>Discuss whether regression implies absolute causation in your specific climate scenario</li>
                                <li>List the limitations of using regression to understand this climate relationship</li>
                                <li>Write a brief statement about how confident you are in using this correlation for predictions</li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                          <div style={{ fontWeight:700, fontSize:18, marginBottom:8, textAlign:'left' }}><b>Critical Analysis Framework</b></div>
                          <div style={{ marginBottom:12 }}>Discuss with your group members and complete the analysis below.</div>

                          <div className="gap-3" />
                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>PART 1: What Your Data Shows</div>

                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:6 }}>A. Our Research Question:</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part1_researchQuestion} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part1_researchQuestion: e.target.value }))} placeholder="Encoding / answer" style={{ width:'100%', padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:8 }} />

                          <div style={{ height:8 }} />
                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:6 }}>B. Our Regression Line Equation:</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part1_regressionEquation} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part1_regressionEquation: e.target.value }))} placeholder="Encoding / answer" style={{ width:'100%', padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:8 }} />

                          <div style={{ height:8 }} />
                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:6 }}>C. Our Interpretation:</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part1_interpretation} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part1_interpretation: e.target.value }))} placeholder="Encoding / answer" style={{ width:'100%', padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:8 }} />

                          <div className="gap-3" />
                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>PART 2: Explaining the Pattern</div>
                          <div style={{ marginBottom:8 }}>A. Why does the independent variable have an influence on the dependent variable?</div>

                          <div style={{ marginLeft:12, fontStyle:'italic', marginBottom:6 }}>Possible Explanation 1:</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part2_possible1} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part2_possible1: e.target.value }))} placeholder="Encoding / answer" style={{ width:'calc(100% - 12px)', marginLeft:12, padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:8 }} />

                          <div style={{ marginLeft:12, fontStyle:'italic', marginBottom:6 }}>Evidence supporting this:</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part2_evidence1} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part2_evidence1: e.target.value }))} placeholder="Encoding / answer" style={{ width:'calc(100% - 12px)', marginLeft:12, padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:8 }} />

                          <div style={{ marginLeft:12, fontStyle:'italic', marginBottom:6 }}>Possible Explanation 2:</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part2_possible2} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part2_possible2: e.target.value }))} placeholder="Encoding / answer" style={{ width:'calc(100% - 12px)', marginLeft:12, padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:8 }} />

                          <div style={{ marginLeft:12, fontStyle:'italic', marginBottom:6 }}>Evidence supporting this:</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part2_evidence2} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part2_evidence2: e.target.value }))} placeholder="Encoding / answer" style={{ width:'calc(100% - 12px)', marginLeft:12, padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:8 }} />

                          <div style={{ marginTop:8, marginBottom:6 }}>B. Which explanation seems most plausible? Why?</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part2_mostPlausible} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part2_mostPlausible: e.target.value }))} placeholder="Encoding / answer" style={{ width:'100%', padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:12 }} />

                          <div className="gap-3" />
                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>PART 3: What Your Data DOESN'T Show</div>
                          <div style={{ marginBottom:8 }}>A. Does the regression prove absolute causation or prediction here?</div>
                          <div style={{ display:'flex', gap:12, marginBottom:8 }}>
                            <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" disabled={analysisSubmitted} checked={analysisInputs.part3_causationYes !== ''} onChange={(e)=> setAnalysisInputs(s=>({ ...s, part3_causationYes: e.target.checked ? 'Yes, because' : '' }))} /> <span>Yes, because</span></label>
                            <input disabled={analysisSubmitted} value={analysisInputs.part3_causationYes} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part3_causationYes: e.target.value }))} placeholder="Encoding / answer" style={{ padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, flex:1 }} />
                          </div>
                          <div style={{ display:'flex', gap:12, marginBottom:8 }}>
                            <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" disabled={analysisSubmitted} checked={analysisInputs.part3_causationNo !== ''} onChange={(e)=> setAnalysisInputs(s=>({ ...s, part3_causationNo: e.target.checked ? 'No, because' : '' }))} /> <span>No, because</span></label>
                            <input disabled={analysisSubmitted} value={analysisInputs.part3_causationNo} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part3_causationNo: e.target.value }))} placeholder="Encoding / answer" style={{ padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, flex:1 }} />
                          </div>

                          <div style={{ marginBottom:8 }}>B. What other factors might influence this prediction?</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part3_otherFactor1} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part3_otherFactor1: e.target.value }))} placeholder="Encoding / answer" style={{ width:'100%', padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:8 }} />
                          <input disabled={analysisSubmitted} value={analysisInputs.part3_otherFactor2} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part3_otherFactor2: e.target.value }))} placeholder="Encoding / answer" style={{ width:'100%', padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:12 }} />

                          <div className="gap-3" />
                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>PART 4: Data Quality and Limitations</div>
                          <div style={{ marginBottom:12 }}>Consider these questions:
                            <div style={{ marginTop:6 }}>
                              ☐ Sample size: Is 24 months enough data? What would be better?<br/>
                              ☐ Time period: Could the season or year matter?<br/>
                              ☐ Measurement: How accurate are our measurements?<br/>
                              ☐ Missing variables: What else should we have measured?
                            </div>
                          </div>

                          <div style={{ fontWeight:700, marginBottom:6 }}>A. My biggest concern about data reliability:</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part4_biggestConcern} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part4_biggestConcern: e.target.value }))} placeholder="Encoding / answer" style={{ width:'100%', padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:8 }} />

                          <div style={{ height:8 }} />
                          <div style={{ fontWeight:700, marginBottom:6 }}>B. How does this limitation affect my confidence in the findings?</div>
                          <input disabled={analysisSubmitted} value={analysisInputs.part4_confidenceEffect} onChange={(e)=>setAnalysisInputs(s=>({ ...s, part4_confidenceEffect: e.target.value }))} placeholder="Encoding / answer" style={{ width:'100%', padding:12, border:`1px solid var(--input-border)`, borderRadius:8, background:`var(--input-bg)`, marginBottom:12 }} />

                          <div style={{ height:16 }} />
                          <div className="section-actions" style={{ justifyContent:'flex-end' }}>
                            {(() => {
                              const allFilled = Object.values(analysisInputs).every(v => v && v.trim() !== '');
                              return (
                                <button className="save-btn phase3-submit" disabled={!allFilled || analysisSubmitted} onClick={() => {
                                    if (!allFilled || analysisSubmitted) return;
                                    try {
                                      // Save answers and mark as submitted
                                      saveLesson2Phase3Activity1(user.username, { ...analysisInputs, _submitted: true, analysisSubmitted: true });
                                        savePhase3FinishAnalysis(user.username);
                                    } catch (e) { /* ignore */ }
                                    setAnalysisSubmitted(true);
                                  
                                  }} style={{ background: allFilled && !analysisSubmitted ? 'var(--submit-bg)' : '#E5EDF9', color: allFilled && !analysisSubmitted ? 'var(--submit-text)' : '#9CA3AF' }}>Submit Analysis</button>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="sub-item">
                      <div className="sub-header" onClick={()=> setP3Sections(s => ({ ...s, a2: !s.a2 }))}>
                        <span className="label"><span className="icon">🔎</span> <b>Activity 2: Evaluating Relevance of Information to Stakeholders</b></span>
                        <span className="right-indicator"><span className="toggle-sign">{p3Sections.a2 ? '−' : '+'}</span></span>
                      </div>
                      <div className="sub-content" style={{ display: p3Sections.a2 ? 'block' : 'none' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:12 }}>
                          <div className="info-card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div style={{ fontWeight:700, marginBottom:8 }}><span className="icon">🧭</span> What you will do:</div>
                            <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                              <p style={{ margin:0 }}>You will identify different groups of people who would be affected by the climate relationship you discovered and analyze how the correlation findings impact each group differently.</p>
                            </div>
                          </div>

                          <div className="info-card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                            <div style={{ fontWeight:700, marginBottom:8 }}><span className="icon">🛠️</span> How to do it:</div>
                            <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                              <ul style={{ margin:0, paddingLeft:18 }}>
                                <li>List stakeholder groups affected by your climate variables.</li>
                                <li>For each stakeholder group, describe how they are directly impacted by the climate relationship you found and what decisions they might make based on your correlation findings.</li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18 }}>
                          <div style={{ fontWeight:700, fontSize:18, marginBottom:8, textAlign:'left' }}><b>Stakeholder Analysis Worksheet</b></div>
                          <div style={{ marginBottom:12 }}>Discuss with your group members and complete the worksheet below.</div>

                          <div className="gap-3" />
                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>PART 1: Identify Potential Stakeholders</div>
                          <div style={{ marginBottom:8 }}>Who in our community might care about this relationship?</div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                            <div style={{ fontWeight:700 }}>1.</div>
                            <input disabled={analysis2Submitted} value={analysis2Inputs.part1_s1} onChange={(e)=>setAnalysis2Inputs(s=>({ ...s, part1_s1: e.target.value }))} placeholder="Encoding / answer" style={{ padding:12, border:'1px solid #FFD4E4', borderRadius:8, background:'#FFF5F9', flex:1 }} />
                            <div style={{ fontStyle:'italic', color:'#6B7280', fontSize:'0.85rem' }}>(e.g., rice farmers)</div>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                            <div style={{ fontWeight:700 }}>2.</div>
                            <input disabled={analysis2Submitted} value={analysis2Inputs.part1_s2} onChange={(e)=>setAnalysis2Inputs(s=>({ ...s, part1_s2: e.target.value }))} placeholder="Encoding / answer" style={{ padding:12, border:'1px solid #FFD4E4', borderRadius:8, background:'#FFF5F9', flex:1 }} />
                            <div style={{ fontStyle:'italic', color:'#6B7280', fontSize:'0.85rem' }}>(e.g., barangay health workers)</div>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                            <div style={{ fontWeight:700 }}>3.</div>
                            <input disabled={analysis2Submitted} value={analysis2Inputs.part1_s3} onChange={(e)=>setAnalysis2Inputs(s=>({ ...s, part1_s3: e.target.value }))} placeholder="Encoding / answer" style={{ padding:12, border:'1px solid #FFD4E4', borderRadius:8, background:'#FFF5F9', flex:1 }} />
                            <div style={{ fontStyle:'italic', color:'#6B7280', fontSize:'0.85rem' }}>(e.g., city disaster management office)</div>
                          </div>

                          <div className="gap-3" />
                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>PART 2: Why It Matters to Them</div>
                          <div style={{ marginBottom:8 }}>Choose ONE stakeholder and explain:</div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                            <div style={{ width:260 }}>The understanding of this influence matters to</div>
                            <input disabled={analysis2Submitted} value={analysis2Inputs.part2_who} onChange={(e)=>setAnalysis2Inputs(s=>({ ...s, part2_who: e.target.value }))} placeholder="Encoding / answer" style={{ padding:12, border:'1px solid #FFD4E4', borderRadius:8, background:'#FFF5F9', flex:1 }} />
                          </div>
                          <div style={{ marginBottom:6 }}>because…</div>
                          <input disabled={analysis2Submitted} value={analysis2Inputs.part2_because} onChange={(e)=>setAnalysis2Inputs(s=>({ ...s, part2_because: e.target.value }))} placeholder="Encoding / answer" style={{ padding:12, border:'1px solid #FFD4E4', borderRadius:8, background:'#FFF5F9', width:'100%', marginBottom:12 }} />

                          <div className="gap-3" />
                          <div style={{ fontWeight:700, textAlign:'left', marginBottom:8 }}>PART 3: Current Decisions This Affects</div>
                          <div style={{ marginBottom:8 }}>What decisions does this stakeholder make that could be informed by your finding?</div>
                          <div style={{ fontStyle:'italic', marginBottom:8 }}>Decisions affected:</div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                            <div style={{ fontWeight:700 }}>1.</div>
                            <input disabled={analysis2Submitted} value={analysis2Inputs.part3_decision1} onChange={(e)=>setAnalysis2Inputs(s=>({ ...s, part3_decision1: e.target.value }))} placeholder="Encoding / answer" style={{ padding:12, border:'1px solid #FFD4E4', borderRadius:8, background:'#FFF5F9', flex:1 }} />
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                            <div style={{ fontWeight:700 }}>2.</div>
                            <input disabled={analysis2Submitted} value={analysis2Inputs.part3_decision2} onChange={(e)=>setAnalysis2Inputs(s=>({ ...s, part3_decision2: e.target.value }))} placeholder="Encoding / answer" style={{ padding:12, border:'1px solid #FFD4E4', borderRadius:8, background:'#FFF5F9', flex:1 }} />
                          </div>

                          <div style={{ height:16 }} />
                          <div className="section-actions" style={{ justifyContent:'flex-end' }}>
                            {(() => {
                              const allFilled = Object.values(analysis2Inputs).every(v => v && v.trim() !== '');
                              return (
                                <button className="save-btn phase3-submit" disabled={!allFilled || analysis2Submitted} onClick={() => {
                                  if (!allFilled || analysis2Submitted) return;
                                  try {
                                    saveLesson2Phase3Activity2(user.username, analysis2Inputs);
                                    savePhase3SubmitWorksheet(user.username);
                                  } catch (e) { /* ignore */ }
                                  setAnalysis2Submitted(true);
                                }} style={{ background: allFilled && !analysis2Submitted ? 'var(--submit-bg)' : '#E5EDF9', color: allFilled && !analysis2Submitted ? 'var(--submit-text)' : '#9CA3AF' }}>Submit Worksheet</button>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    
                  </div>
                </div>
              )}
            </div>

            <div className="accordion-item phase4">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p4: !o.p4 })); setP3Sections({ a1:false, a2:false, a3:false }); setP2Sections({ a1:false, a2:false, a3:false, a4:false }); }}>
                <h3>Phase 4: Tell the Climate Story</h3>
                <span>{open.p4 ? '▼' : '▶'}</span>
              </div>
              {open.p4 && (
                <div className="accordion-content">
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, padding:'8px 0' }}>
                    <div className="info-card" style={{ padding:18, display:'flex', flexDirection:'column', height:'100%' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                        <span className="icon">🧭</span>
                        <div style={{ fontWeight:700, color: 'var(--plot-primary)', fontSize:'1.05rem' }}>What you will do:</div>
                      </div>
                      <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                        <p style={{ margin:0 }}>You will use your regression findings to develop practical, data-driven recommendations for addressing the climate issue, while acknowledging the statistical limitations of your analysis.</p>
                      </div>
                    </div>

                    <div className="info-card" style={{ padding:18, display:'flex', flexDirection:'column', height:'100%' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                        <span className="icon">🛠️</span>
                        <div style={{ fontWeight:700, color: 'var(--plot-primary)', fontSize:'1.05rem' }}>How to do it:</div>
                      </div>
                      <div style={{ color:'var(--plot-value-primary)', lineHeight:1.6 }}>
                        <ul style={{ margin:0, paddingLeft:18 }}>
                          <li>State the main finding from your regression analysis in one clear sentence</li>
                          <li>Based on your r value strength, create 2-3 specific recommendations.</li>
                          <li>For each recommendation, identify what action should be taken, who should take this action, and what resources or changes would be needed</li>
                          <li>Acknowledge uncertainties by listing what additional information would strengthen your recommendations</li>
                          <li>Consider short-term (1-2 years) and long-term (5-10 years) implications of following your recommendations</li>
                          <li>Include a brief statement about monitoring: How would you track whether the relationship changes over time?</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ background:'var(--cards-bg)', borderColor:'var(--input-border)', padding:18, marginTop:12 }}>
                    <div style={{ fontWeight:700, fontSize:18, marginBottom:8, textAlign:'left' }}><b>Our Evidence-Based Recommendation</b></div>
                    <div style={{ marginBottom:12 }}>Instructions:
                      <ol style={{ marginTop:6, paddingLeft:18 }}>
                        <li>Click on the link to open the template.</li>
                        <li>Make a copy of the template for yourself.</li>
                        <li>Discuss with your group members and complete the activity.</li>
                        <li>When you're finished, download your completed work.</li>
                        <li>Upload your file using the link below.</li>
                      </ol>
                    </div>

                    <div style={{ height:32 }} />
                    <div className="section-actions" style={{ justifyContent:'flex-start' }}>
                      <button type="button" className="save-btn" onClick={() => window.open('https://docs.google.com/document/d/1tQT62OAPnDEGjnx9VNYtbIDFAF9ufCiMeajZEJXD_GY/edit?usp=sharing', '_blank')}>Recommendation Template</button>
                    </div>

                    <div style={{ height:40 }} />
                    <div style={{ fontWeight:700, marginBottom:8 }}>Upload your output here.</div>
                    <div style={{ marginBottom:12 }}>Before uploading, make sure it is in PDF format with this filename format: Lesson2_Phase4_username.</div>

                    <div style={{ height:24 }} />
                      <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
                      <input id="phase4-upload" type="file" accept="application/pdf,image/*" style={{ display:'none' }} onChange={(e) => {
                        const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                        try { if (previewURLP4) { URL.revokeObjectURL(previewURLP4); } } catch (e) {}
                        if (f) {
                          setPreviewURLP4(URL.createObjectURL(f));
                          setUploadedFileP4(f);
                          // persist uploaded file immediately so it survives logout
                          try {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const data = ev.target?.result as string;
                              try { saveLesson2Phase4Activity1(user.username, data, f.type, f.name, false); } catch (e) { /* ignore */ }
                            };
                            reader.readAsDataURL(f);
                          } catch (e) { /* ignore */ }
                        } else { setPreviewURLP4(null); setUploadedFileP4(null); }
                      }} />
                      <button className="save-btn" type="button" onClick={() => (document.getElementById('phase4-upload') as HTMLInputElement).click()} disabled={submitDisabledP4}>Upload File</button>
                      <div style={{ fontStyle:'italic' }}>{uploadedFileP4 ? uploadedFileP4.name : (previewURLP4 ? 'Previously uploaded file' : 'No file chosen')}</div>
                    </div>

                    <div style={{ height:24 }} />
                    <div style={{ position:'relative', paddingBottom:'56.25%', height:0, overflow:'hidden', borderRadius:8, border:'1px solid var(--input-border)', background:'#FFF', marginBottom:40 }}>
                      {previewURLP4 ? (
                        <iframe src={previewURLP4} title="Phase4 Upload Preview" style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:0 }} />
                      ) : (
                        <div style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF' }}>Preview will appear here after upload</div>
                      )}
                    </div>

                      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                      <button className="save-btn" type="button" disabled={!(uploadedFileP4 || previewURLP4) || submitDisabledP4} onClick={() => {
                        if (submitDisabledP4) return;
                        const f = uploadedFileP4;
                        const finalize = async (uploadUrl?: string) => {
                          try {
                            const prof = await getMyProfile();
                            const studentId = prof?.id;
                            if (studentId) {
                              await upsertResponse({
                                student_id: studentId,
                                activity_type: 'lesson2',
                                answers: { phase4_upload: uploadUrl || previewURLP4 }
                              });
                            }
                          } catch (e) {
                            console.error('upsert lesson2 response', e);
                          }
                        };
                        
                        if (f) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            try {
                              const data = ev.target?.result as string;
                              saveLesson2Phase4Activity1(user.username, data, f.type, f.name, true);
                              setSubmissionMessageP4('Submitted — saved.');
                              setSubmitDisabledP4(true);
                              setPreviewURLP4(data);
                              setOpen({ overview:false, p1:false, p2:false, p3:false, p4:false });
                              finalize(data);
                            } catch (e) { /* ignore */ }
                          };
                          reader.readAsDataURL(f);
                        } else if (previewURLP4) {
                          // If user previously uploaded (persisted) but file object not present, use previewURLP4 already stored
                          try {
                            // mark as submitted in storage
                            saveLesson2Phase4Activity1(user.username, previewURLP4, 'application/pdf', (uploadedFileP4 as File | null)?.name || 'uploaded', true);
                          } catch (e) { /* ignore */ }
                          setSubmissionMessageP4('Submitted — saved.');
                          setSubmitDisabledP4(true);
                          setOpen({ overview:false, p1:false, p2:false, p3:false, p4:false });
                          finalize();
                        }
                      }}>{submitDisabledP4 ? 'Submitted' : 'Submit Output'}</button>
                    </div>

                    {submissionMessageP4 && (
                      <div style={{ marginTop:12 }}>{submissionMessageP4}</div>
                    )}
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

export default Lesson2;


