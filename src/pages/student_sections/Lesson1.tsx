import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ProgressBar from '../../components/ProgressBar';
import React from 'react';
import { getLesson1State, getLesson1StateAsync, saveLesson1State, awaitSaveLesson1State, flushLesson1StateSync, getTeacherFeedback, setUserProgress, setPhase1ActivityFlag, getPhase1Progress, saveActivity2Checkpoint, saveActivity3Choice, saveActivity4aQuestion, saveActivity4bFinal, savePhase2Activity1, savePhase2Activity2, savePhase2Activity2Answer, savePhase2Activity2Steps, getPhase2Activity2AnswersAll, getPhase2Activity2All, savePhase2FinalizeScatter, savePhase2SelfAssessment, savePhase2Activity4Check, savePhase2Activity4Interpret, savePhase2Activity3Upload, getPhase2Activity3All, getPhase2SelfAssessAll, savePhase3FinishAnalysis, savePhase3SubmitWorksheet, savePhase3FinalizeRecommendation, savePhase4SubmitReview, savePhase4MissionComplete, savePhase4PeerReview, savePhase4Reflection, getPhase4ReviewAll, getPhase4CompleteAll, getPhase2Activity4CheckAll, getPhase2Activity4InterpAllDetailed, Lesson1State } from '../../services/progressService';
import { ActivityType, getResponseForStudentActivity, upsertResponse } from '../../services/responsesService';
import { getFeedbackForStudentActivity, acknowledgeFeedback } from '../../services/feedbackService';
import { getMyProfile } from '../../services/profilesService';
import { resolveStudentId } from '../../services/studentStateService';
import BarDualChart from '../../components/BarDualChart';
import { climateLabels, societalLabels, getMonthlySeriesForClimate, getMonthlySeriesForSocietal, Year } from '../../services/lesson1Phase1Data';
import { activity2Questions, activity2Validators } from '../../services/activity2Questions';

import '../../styles/StudentPortal.css';
import '../../styles/Lesson.css';

interface AuthUser {
  username: string;
  role: 'student' | 'teacher' | 'admin' | null;
}

interface Lesson1Props {
  user: AuthUser;
  onBack: () => void;
}

const createEmptyLesson1State = (): Lesson1State => ({
  unlockedPhase: 0,
  completedPhases: [],
  phaseData: {},
});

const mergeLesson1States = (...candidates: Array<Lesson1State | null | undefined>): Lesson1State | null => {
  const valid = candidates.filter((candidate): candidate is Lesson1State => !!candidate && typeof candidate === 'object');
  if (valid.length === 0) return null;

  return valid.reduce<Lesson1State>((acc, candidate) => {
    const mergedPhaseData: Lesson1State['phaseData'] = { ...(acc.phaseData || {}) };
    for (const phase of [1, 2, 3, 4] as const) {
      const existing = (mergedPhaseData as any)[phase] || {};
      const incoming = (candidate.phaseData as any)?.[phase] || {};
      if (Object.keys(incoming).length > 0) {
        (mergedPhaseData as any)[phase] = { ...existing, ...incoming };
      }
    }

    return {
      unlockedPhase: Math.max(acc.unlockedPhase || 0, candidate.unlockedPhase || 0),
      completedPhases: Array.from(new Set([...(acc.completedPhases || []), ...(candidate.completedPhases || [])])),
      phaseProgress: {
        ...(acc.phaseProgress || {}),
        ...(candidate.phaseProgress || {}),
        1: Math.max(acc.phaseProgress?.[1] || 0, candidate.phaseProgress?.[1] || 0),
        2: Math.max(acc.phaseProgress?.[2] || 0, candidate.phaseProgress?.[2] || 0),
        3: Math.max(acc.phaseProgress?.[3] || 0, candidate.phaseProgress?.[3] || 0),
        4: Math.max(acc.phaseProgress?.[4] || 0, candidate.phaseProgress?.[4] || 0),
      },
      phaseData: mergedPhaseData,
    };
  }, createEmptyLesson1State());
};

const normalizeLesson1State = (rawState: Lesson1State | null | undefined): Lesson1State => {
  const state = rawState ? mergeLesson1States(rawState) || createEmptyLesson1State() : createEmptyLesson1State();
  const phaseData = { ...(state.phaseData || {}) } as any;
  const phaseProgress = { ...(state.phaseProgress || {}) } as Record<number, number>;
  const completedPhases = new Set<number>(state.completedPhases || []);

  const p1 = phaseData[1] || {};
  const p2 = phaseData[2] || {};
  const p3 = phaseData[3] || {};
  const p4 = phaseData[4] || {};

  const phase1Complete = !!(p1.a1Done && p1.a2Done && p1.a3Done && p1.a4bFinalized);
  const phase2Complete = !!(p2.a1Done && p2.a2Done && p2.a3Done && p2.selfAssessSubmitted && (p2.interpretSubmitted || p2.a4Checked));
  const phase3Complete = !!(p3.part1Done && p3.saDone && p3.recFinalized);
  const phase4Complete = !!(p4.peerReviewSubmitted && p4.missionComplete);

  if (phase1Complete) {
    completedPhases.add(1);
    phaseProgress[1] = 25;
  }
  if (phase2Complete) {
    completedPhases.add(2);
    phaseProgress[2] = 25;
  }
  if (phase3Complete) {
    completedPhases.add(3);
    phaseProgress[3] = 25;
  }
  if (phase4Complete) {
    completedPhases.add(4);
    phaseProgress[4] = 25;
  }

  const highestCompleted = completedPhases.size > 0 ? Math.max(...completedPhases) : 0;

  return {
    unlockedPhase: Math.max(state.unlockedPhase || 0, highestCompleted > 0 ? highestCompleted + 1 : 0),
    completedPhases: Array.from(completedPhases).sort((a, b) => a - b),
    phaseProgress,
    phaseData,
  };
};

const Lesson1: React.FC<Lesson1Props> = ({ user, onBack }) => {
  const labelDefinitions: Record<string, string> = {
    // Climate
    'Rainfall Total (mm)': 'Total precipitation measured in the month, in millimeters.',
    'Max Daily Rainfall (mm)': 'Highest single-day rainfall recorded within the month, in millimeters.',
    'Consecutive Wet Days': 'Longest run of consecutive days with measurable rainfall during the month.',
    'Consecutive Dry Days': 'Longest run of consecutive days without measurable rainfall during the month.',
    'Temperature Max (°C)': 'Average of daily maximum air temperatures for the month, in °C.',
    'Temperature Min (°C)': 'Average of daily minimum air temperatures for the month, in °C.',
    'Temperature Mean (°C)': 'Average air temperature for the month, in °C.',
    'Heat Index (°C)': 'Perceived temperature that combines heat and humidity for the month, in °C.',
    'Warm Days Count': 'Number of days classified as warm (above the local warm threshold) in the month.',
    'Humidity (%)': 'Average relative humidity for the month, in percent.',
    'Wind Speed (m/s)': 'Average wind speed for the month, in meters per second.',
    'Wind Direction (degrees)': 'Prevailing wind direction for the month, in degrees from north (0–360).',
    'ENSO Index (Niño 3.4)': 'El Niño–Southern Oscillation indicator: sea surface temperature anomaly in the Niño 3.4 region.',
    'Flood Events': 'Number of reported flood incidents during the month.',
    'Flood Hazard Level': 'Categorical risk level for flooding (Low, Medium, High) during the month.',
    'PM2.5 (μg/m³)': 'Concentration of fine particulate matter (≤2.5µm) in micrograms per cubic meter.',
    'PM10 (μg/m³)': 'Concentration of coarse particulate matter (≤10µm) in micrograms per cubic meter.',
    'Air Quality Index': 'Composite air pollution rating category (Good, Moderate, Unhealthy).',
    'Sea Surface Temp (°C)': 'Average sea surface temperature near the region for the month, in °C.',
    // Societal
    'Banana Production (MT)': 'Total banana output for the month, in metric tons.',
    'Banana Yield (MT/ha)': 'Average banana yield per hectare for the month, in metric tons per hectare.',
    'Cacao Production (MT)': 'Total cacao output for the month, in metric tons.',
    'Rice Production (MT)': 'Total rice output for the month, in metric tons.',
    'Corn Production (MT)': 'Total corn output for the month, in metric tons.',
    'Commercial Fish Catch (MT)': 'Total fish caught by commercial/offshore operations for the month, in metric tons.',
    'Municipal Fish Catch (MT)': 'Total fish caught by small-scale/municipal operations for the month, in metric tons.',
    'Total Fish Catch (MT)': 'Combined total of commercial and municipal fish catch for the month, in metric tons.',
    'Electricity Demand (GWh)': 'Total electricity requested by consumers (demand) for the month, in gigawatt-hours.',
    'Electricity Consumption (GWh)': 'Electric energy consumed/delivered for the month, in gigawatt-hours.',
    'Renewable Energy Gen (GWh)': 'Electricity generated from renewable sources for the month, in gigawatt-hours.',
    'Solar Generation (GWh)': 'Electricity generated from solar installations for the month, in gigawatt-hours.',
    'Wind Generation (GWh)': 'Electricity generated from wind installations for the month, in gigawatt-hours.',
    'Dengue Cases': 'Number of reported dengue fever cases for the month.',
    'Respiratory ER Visits': 'Number of emergency room visits due to respiratory issues for the month.',
    'Heat-Related Illness Cases': 'Number of reported heat-related illness cases for the month.',
    'Traffic Accidents': 'Number of reported traffic accidents for the month.',
    'Road Fatalities': 'Number of reported road traffic deaths for the month.',
    'Water Service Interruptions': 'Number of reported water service interruptions for the month.',
    'Water Supply Deficit (%)': 'Shortfall in water supply relative to expected demand, in percent.',
    'Tourist Arrivals': 'Number of tourists arriving in the region for the month.',
    'Tourism Receipts (PHP Million)': 'Tourism-related earnings for the month, in Philippine pesos (millions).',
  };
  const getLabelDef = (label: string): string => labelDefinitions[label] || 'Monthly value for the selected metric.';
  const [state, setState] = useState(getLesson1State(user.username));
  const [open, setOpen] = useState<{ overview: boolean; p1: boolean; p2: boolean; p3: boolean; p4: boolean }>({ overview: false, p1: false, p2: false, p3: false, p4: false });
  const [serverFeedback, setServerFeedback] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const prof = await getMyProfile();
        const studentId = prof?.id || await resolveStudentId(user.username);
        const localState = getLesson1State(user.username);
        const remoteState = await getLesson1StateAsync(studentId || user.username);
        const responseRow = studentId
          ? await getResponseForStudentActivity(studentId, 'lesson1').catch(() => null)
          : null;
        const responseState = responseRow?.answers?.lesson1State as Lesson1State | null | undefined;
        const hydratedState = normalizeLesson1State(
          mergeLesson1States(localState, remoteState, responseState)
        );
        setState(hydratedState);
        if (!studentId) return;
        const fb = await getFeedbackForStudentActivity(studentId, 'lesson1');
        if (fb) setServerFeedback(fb);
      } catch (e) {
        console.error('load lesson1 feedback', e);
      }
    };
    load();
  }, []);
  const [subOpen, setSubOpen] = useState<{ a1: boolean; a2: boolean; a3: boolean; a4: boolean }>({ a1:false, a2:false, a3:false, a4:false });
  const [p3SubOpen, setP3SubOpen] = useState<{ p3a: boolean; p3b: boolean; p3c: boolean }>({ p3a: false, p3b: false, p3c: false });
  const [p2SubOpen, setP2SubOpen] = useState<{ a1: boolean; a2: boolean; a3: boolean; a4: boolean }>({ a1:false, a2:false, a3:false, a4:false });

  useEffect(() => {
    setOpen({ overview: false, p1: false, p2: false, p3: false, p4: false });
    setSubOpen({ a1:false, a2:false, a3:false, a4:false });
    setP2SubOpen({ a1:false, a2:false, a3:false, a4:false });
    setP3SubOpen({ p3a: false, p3b: false, p3c: false });
  }, []);

  const teacher = getTeacherFeedback(user.username);
  const p2Score = teacher?.phaseScores?.[2];
  const p3Score = teacher?.phaseScores?.[3];
  const p4Score = teacher?.phaseScores?.[4];
  const activity4Feedback = serverFeedback?.feedback_text || teacher?.comments?.[1] || '';

  const progressPct = useMemo(() => {
    const pp = state.phaseProgress || {};
    const total = (pp[1]||0) + (pp[2]||0) + (pp[3]||0) + (pp[4]||0);
    return Math.min(100, Math.round(total));
  }, [state.phaseProgress]);

  useEffect(() => { setUserProgress(user.username, 2, progressPct); }, [progressPct, user.username]);

  const savePhaseData = (phase: number, patch: Record<string, any>) => {
    setState(prev => {
      const phaseData = { ...(prev.phaseData || {}) } as Record<number, any>;
      const current = { ...(phaseData[phase] || {}) } as Record<string, unknown>;
      const nextPhaseData = { ...phaseData, [phase]: { ...current, ...patch } } as Lesson1State['phaseData'];
      const phaseProgress = { ...(prev.phaseProgress || {}) };
      const next: Lesson1State = { ...prev, phaseData: nextPhaseData, phaseProgress };
      saveLesson1State(user.username, next);
      return next;
    });
  };

  const unlockPhase = (phase: number) => {
    setState(prev => {
      const unlockedPhase = Math.max(prev.unlockedPhase ?? 0, phase);
      const next: Lesson1State = { ...prev, unlockedPhase };
      saveLesson1State(user.username, next);
      return next;
    });
  };

  // Locks removed: phase access is unrestricted. UI will no longer prevent opening phases or activities.

  const togglePhase3 = () => {
    setOpen(o => ({ ...o, p3: !o.p3 }));
    setP3SubOpen({ p3a: false, p3b: false, p3c: false });
    setSubOpen({ a1:false, a2:false, a3:false, a4:false });
  };

  const togglePhase4 = () => {
    setOpen(o => ({ ...o, p4: !o.p4 }));
    setP3SubOpen({ p3a: false, p3b: false, p3c: false });
    setSubOpen({ a1:false, a2:false, a3:false, a4:false });
  };

  const renderPhase3Content = () => {
    const headerStyle = { background: '#E6D4E8', color: '#4D2F52' } as const;
    const cardStyle: CSSProperties = { background: '#F9F5FA', border: '1px solid #E6D4E8', borderRadius: 12, padding: '14px 16px' };
    const inputStyle: CSSProperties = { borderRadius: 10, border: '1px solid #D8C8EB', padding: '10px 12px', fontFamily: 'Poppins, sans-serif', background: '#fff' };

    const togglePanel = (key: keyof typeof p3SubOpen) => setP3SubOpen(prev => ({ ...prev, [key]: !prev[key] }));

    return (
      <div className="accordion-content">
        <div className="sub-item">
          <div className="sub-header" style={headerStyle} onClick={()=> togglePanel('p3a')}>
            <span className="label"><span className="icon">📌</span> <b>Activity 1: Relating Findings to Real-World</b></span>
            <span className="right-indicator">{(state.phaseData as any)[3]?.part1Done && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{p3SubOpen.p3a ? '−' : '+'}</span></span>
          </div>
          <div className="sub-content" style={{ display: p3SubOpen.p3a ? 'block' : 'none' }}>
            <div className="gap-3" />
            <div className="card" style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="info-card" style={{ ...cardStyle, background: '#F9F5FA', borderColor: '#E6D4E8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span role="img" aria-label="compass">🧭</span>
                    <div style={{ fontWeight: 700, color: '#4D2F52', fontSize: '1.05rem' }}>What you will do:</div>
                  </div>
                  <div style={{ color: '#6B4D70', lineHeight: 1.6 }}>
                    <p style={{ margin: 0, marginBottom: 12 }}>You will evaluate the strength and reliability of the correlation you found between climate variables.</p>
                    <p style={{ margin: 0 }}>You will examine whether the relationship is strong enough to make meaningful conclusions and identify any limitations or factors that might affect the results.</p>
                  </div>
                </div>
                <div className="info-card" style={{ ...cardStyle, background: '#F9F5FA', borderColor: '#E6D4E8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span role="img" aria-label="tools">🛠️</span>
                    <div style={{ fontWeight: 700, color: '#4D2F52', fontSize: '1.05rem' }}>How to do it:</div>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20, color: '#6B4D70', lineHeight: 1.6 }}>
                    <li>Consider what the relationship between your variable means in real-world terms.</li>
                    <li>Identify at least three factors that could influence or confound your results (such as seasonal patterns, measurement errors, or other climate variables not included).</li>
                    <li>Discuss whether correlation implies causation in your specific climate scenario.</li>
                    <li>List the limitations of using only correlation to understand this climate relationship.</li>
                    <li>Write a brief statement about how confident you are in using this correlation for predictions.</li>
                  </ul>
                </div>
              </div>
              <div className="gap-3" />
              <div className="info-card" style={{ ...cardStyle, background: '#F9F5FA', borderColor: '#E6D4E8' }}>
                <div style={{ fontWeight: 700, color: '#4D2F52', fontSize: '1.05rem', marginBottom: 12 }}>Critical Analysis Framework</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, color: '#4D2F52' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>PART 1: What Your Data Shows</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>My correlation coefficient: r =</span>
                    <input
                      value={p3Data.part1_r || ''}
                      onChange={(e)=> savePhaseData(3, { part1_r: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                        placeholder="encode your answer here"
                      style={{ ...inputStyle, width: 180, height: 34, background: '#fff' }}
                    />
                  </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>Interpretation:</span>
                    <input
                      value={p3Data.part1_interp || ''}
                      onChange={(e)=> savePhaseData(3, { part1_interp: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                        placeholder="encode your answer here"
                      style={{ ...inputStyle, flex: '1 1 320px', height: 34, background: '#fff' }}
                    />
                  </div>

                  <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 4 }}>PART 2: Explaining the Pattern</div>
                  <div>Why might these variables be related?</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, alignItems: 'center' }}>
                    <div>Possible Explanation 1:</div>
                    <input
                      value={p3Data.part2_exp1 || ''}
                      onChange={(e)=> savePhaseData(3, { part2_exp1: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                        placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fff' }}
                    />
                    <div>Supporting Evidence</div>
                    <input
                      value={p3Data.part2_evid1 || ''}
                      onChange={(e)=> savePhaseData(3, { part2_evid1: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fff' }}
                    />
                    <div>Possible Explanation 2:</div>
                    <input
                      value={p3Data.part2_exp2 || ''}
                      onChange={(e)=> savePhaseData(3, { part2_exp2: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fff' }}
                    />
                    <div>Supporting Evidence</div>
                    <input
                      value={p3Data.part2_evid2 || ''}
                      onChange={(e)=> savePhaseData(3, { part2_evid2: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fff' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div>Which explanation seems most plausible? Why?</div>
                    <input
                      value={p3Data.part2_plausible || ''}
                      onChange={(e)=> savePhaseData(3, { part2_plausible: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                        placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fff' }}
                    />
                  </div>

                    <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 8 }}>PART 3: What Your Data DOESN'T Show</div>
                    <div>Does correlation prove causation here?</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>☐ No, because</span>
                      <input
                        value={p3Data.part3_because || ''}
                        onChange={(e)=> savePhaseData(3, { part3_because: e.target.value })}
                        disabled={((state.phaseData as any)[3]?.part1Done)}
                        placeholder="encode your answer here"
                        style={{ ...inputStyle, flex: '1 1 320px', height: 34, background: '#fff' }}
                      />
                    </div>
                    <div>What other factors might influence this relationship?</div>
                    <input
                      value={p3Data.part3_factor1 || ''}
                      onChange={(e)=> savePhaseData(3, { part3_factor1: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fff' }}
                    />
                    <input
                      value={p3Data.part3_factor2 || ''}
                      onChange={(e)=> savePhaseData(3, { part3_factor2: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fff' }}
                    />

                    <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 8 }}>PART 4: Data Quality and Limitations</div>
                    <div>Consider these questions:</div>
                    <div style={{ paddingLeft: 4, lineHeight: 1.5 }}>
                      <div>☐ Sample size: Is 24 months enough data? What would be better?</div>
                      <div>☐ Time period: Could the season or year matter?</div>
                      <div>☐ Measurement: How accurate are our measurements?</div>
                      <div>☐ Missing variables: What else should we have measured?</div>
                    </div>
                    <div>My biggest concern about data reliability:</div>
                    <input
                      value={p3Data.part4_concern || ''}
                      onChange={(e)=> savePhaseData(3, { part4_concern: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fff' }}
                    />
                    <div>How does this limitation affect my confidence in the findings?</div>
                    <input
                      value={p3Data.part4_confidence || ''}
                      onChange={(e)=> savePhaseData(3, { part4_confidence: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.part1Done)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fff' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <button
                        className="submit-btn"
                        disabled={![
                          p3Data.part1_r,
                          p3Data.part1_interp,
                          p3Data.part2_exp1,
                          p3Data.part2_evid1,
                          p3Data.part2_exp2,
                          p3Data.part2_evid2,
                          p3Data.part2_plausible,
                          p3Data.part3_because,
                          p3Data.part3_factor1,
                          p3Data.part3_factor2,
                          p3Data.part4_concern,
                          p3Data.part4_confidence,
                        ].every(v => (v || '').toString().trim().length > 0) || !!(state.phaseData as any)[3]?.part1Done}
                        onClick={() => {
                          const next = savePhase3FinishAnalysis(user.username);
                          setState(next);
                        }}
                        style={{ height: 40, padding: '0 16px', fontFamily: 'Poppins, sans-serif', minWidth: 160 }}
                      >
                        Finish Analysis
                      </button>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sub-item">
            <div className="sub-header" style={headerStyle} onClick={()=> togglePanel('p3b')}> 
            <span className="label"><span className="icon">🔎</span> <b>Activity 2: Analyzing Key Stakeholders</b></span>
            <span className="right-indicator">{(state.phaseData as any)[3]?.saDone && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{p3SubOpen.p3b ? '−' : '+'}</span></span>
          </div>
          <div className="sub-content" style={{ display: p3SubOpen.p3b ? 'block' : 'none' }}>
            <div className="gap-3" />
            <div className="card" style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="info-card" style={{ ...cardStyle, background: '#F9F5FA', borderColor: '#E6D4E8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span role="img" aria-label="compass">🧭</span>
                    <div style={{ fontWeight: 700, color: '#4D2F52', fontSize: '1.05rem' }}>What you will do:</div>
                  </div>
                  <div style={{ color: '#6B4D70', lineHeight: 1.6 }}>
                    <p style={{ margin: 0 }}>You will identify different groups of people who would be affected by the climate relationship you discovered and analyze how the correlation findings impact each group differently.</p>
                  </div>
                </div>
                <div className="info-card" style={{ ...cardStyle, background: '#F9F5FA', borderColor: '#E6D4E8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span role="img" aria-label="tools">🛠️</span>
                    <div style={{ fontWeight: 700, color: '#4D2F52', fontSize: '1.05rem' }}>How to do it:</div>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20, color: '#6B4D70', lineHeight: 1.6 }}>
                    <li>List stakeholder groups affected by your climate variables.</li>
                    <li>For each stakeholder group, describe how they are directly impacted by the climate relationship you found and what decisions they might make based on your correlation findings.</li>
                  </ul>
                </div>
              </div>
              <div className="gap-3" />
              <div className="info-card" style={{ ...cardStyle, background: '#F9F5FA', borderColor: '#E6D4E8' }}>
                <div style={{ fontWeight: 700, color: '#4D2F52', fontSize: '1.05rem', marginBottom: 12 }}>Stakeholder Analysis Worksheet</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, color: '#4D2F52' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 8, alignItems: 'center' }}>
                    <div>Our research question:</div>
                    <input
                      value={p3Data.sa_question || ''}
                      onChange={(e)=> savePhaseData(3, { sa_question: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.saDone)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 36, background: '#fde8f1' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px auto', gap: 8, alignItems: 'center' }}>
                    <div>Our r value:</div>
                    <input
                      value={p3Data.sa_rvalue || ''}
                      onChange={(e)=> savePhaseData(3, { sa_rvalue: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.saDone)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: 200, maxWidth: '100%', height: 36, background: '#fde8f1' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center' }}>
                    <div>Interpretation:</div>
                    <input
                      value={p3Data.sa_interp || ''}
                      onChange={(e)=> savePhaseData(3, { sa_interp: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.saDone)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 36, background: '#fde8f1' }}
                    />
                  </div>

                  <div style={{ fontWeight: 700, marginTop: 4 }}>PART 1: Identify Potential Stakeholders</div>
                  <div>Who in our community might care about this relationship?</div>
                  {[1,2,3].map((n) => (
                    <div key={n} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gap: 8, alignItems: 'center' }}>
                      <div>{n}.</div>
                      <input
                        value={(p3Data.sa_stakeholders?.[n-1]?.name) || ''}
                        onChange={(e)=> {
                          const list = Array.isArray(p3Data.sa_stakeholders) ? [...p3Data.sa_stakeholders] : [];
                          list[n-1] = { ...(list[n-1]||{}), name: e.target.value };
                          savePhaseData(3, { sa_stakeholders: list });
                        }}
                        disabled={((state.phaseData as any)[3]?.saDone)}
                        placeholder="encode your answer here"
                        style={{ ...inputStyle, width: '100%', height: 34, background: '#fde8f1' }}
                      />
                      <div style={{ color: '#6B4D70', fontSize: '0.95rem' }}>{n === 1 ? '(e.g., rice farmers)' : n === 2 ? '(e.g., barangay health workers)' : '(e.g., city disaster management office)'}</div>
                    </div>
                  ))}

                  <div style={{ fontWeight: 700, marginTop: 4 }}>PART 2: Why It Matters to Them</div>
                  <div>Choose ONE stakeholder and explain:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 8, alignItems: 'center' }}>
                    <div>This relationship matters to</div>
                    <input
                      value={p3Data.sa_matters_to || ''}
                      onChange={(e)=> savePhaseData(3, { sa_matters_to: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.saDone)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fde8f1' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, alignItems: 'center' }}>
                    <div>because:</div>
                    <input
                      value={p3Data.sa_because || ''}
                      onChange={(e)=> savePhaseData(3, { sa_because: e.target.value })}
                      disabled={((state.phaseData as any)[3]?.saDone)}
                      placeholder="encode your answer here"
                      style={{ ...inputStyle, width: '100%', height: 34, background: '#fde8f1' }}
                    />
                  </div>

                  <div style={{ fontWeight: 700, marginTop: 4 }}>PART 3: Current Decisions This Affects</div>
                  <div>What decisions does this stakeholder make that could be informed by your finding?</div>
                  {[1,2].map((n) => (
                    <div key={n} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 8, alignItems: 'center' }}>
                      <div>–</div>
                      <input
                        value={(p3Data.sa_decisions?.[n-1]) || ''}
                        onChange={(e)=> {
                          const list = Array.isArray(p3Data.sa_decisions) ? [...p3Data.sa_decisions] : [];
                          list[n-1] = e.target.value;
                          savePhaseData(3, { sa_decisions: list });
                        }}
                        disabled={((state.phaseData as any)[3]?.saDone)}
                        placeholder="encode your answer here"
                        style={{ ...inputStyle, width: '100%', height: 34, background: '#fde8f1' }}
                      />
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button
                      className="submit-btn"
                      disabled={![
                        p3Data.sa_question,
                        p3Data.sa_rvalue,
                        p3Data.sa_interp,
                        ...(p3Data.sa_stakeholders || []).slice(0,3).map((s: { name: any; }) => s?.name),
                        p3Data.sa_matters_to,
                        p3Data.sa_because,
                        ...(p3Data.sa_decisions || []).slice(0,2),
                      ].every(v => (v || '').toString().trim().length > 0) || !!(state.phaseData as any)[3]?.saDone}
                      onClick={() => {
                        const next = savePhase3SubmitWorksheet(user.username);
                        setState(next);
                      }}
                      style={{ height: 40, padding: '0 16px', fontFamily: 'Poppins, sans-serif', minWidth: 180 }}
                    >
                      Submit Worksheet
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sub-item">
          <div className="sub-header" style={headerStyle} onClick={()=> togglePanel('p3c')}>
            <span className="label"><span className="icon">🧠</span> <b>Activity 3: Building Evidence-Based Recommendation</b></span>
            <span className="right-indicator">{(state.phaseData as any)[3]?.recFinalized && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{p3SubOpen.p3c ? '−' : '+'}</span></span>
          </div>
          <div className="sub-content" style={{ display: p3SubOpen.p3c ? 'block' : 'none' }}>
            <div className="gap-3" />
            <div className="card" style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="info-card" style={{ ...cardStyle, background: '#F9F5FA', borderColor: '#E6D4E8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span role="img" aria-label="compass">🧭</span>
                    <div style={{ fontWeight: 700, color: '#4D2F52', fontSize: '1.05rem' }}>What you will do:</div>
                  </div>
                  <div style={{ color: '#6B4D70', lineHeight: 1.6 }}>
                    <p style={{ margin: 0 }}>You will use your correlation findings to develop practical, data-driven recommendations for addressing the climate issue, while acknowledging the statistical limitations of your analysis.</p>
                  </div>
                </div>
                <div className="info-card" style={{ ...cardStyle, background: '#F9F5FA', borderColor: '#E6D4E8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span role="img" aria-label="tools">🛠️</span>
                    <div style={{ fontWeight: 700, color: '#4D2F52', fontSize: '1.05rem' }}>How to do it:</div>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20, color: '#6B4D70', lineHeight: 1.6 }}>
                    <li>State the main finding from your correlation analysis in one clear sentence.</li>
                    <li>Based on your r value strength, create 2-3 specific recommendations.</li>
                    <li>For each recommendation, identify what action should be taken, who should take this action, and what resources or changes would be needed.</li>
                    <li>Acknowledge uncertainties by listing what additional information would strengthen your recommendations.</li>
                    <li>Consider short-term (1-2 years) and long-term (5-10 years) implications of following your recommendations.</li>
                    <li>Include a brief statement about monitoring: How would you track whether the relationship changes over time?</li>
                  </ul>
                </div>
              </div>
              <div className="gap-3" />
              <div className="info-card" style={{ ...cardStyle, background: '#F9F5FA', borderColor: '#E6D4E8' }}>
                <div style={{ fontWeight: 700, color: '#4D2F52', fontSize: '1.05rem', marginBottom: 12 }}>Our Evidence-Based Recommendation</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, rowGap: 18 }}>
                  {/* Row 1: Header/Contact */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 6, alignItems: 'center' }}>
                      <div style={{ fontWeight: 700 }}>TO:</div>
                      <input value={p3Data.rec_to || ''} onChange={(e)=> savePhaseData(3, { rec_to: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, height: 34, background: '#fde8f1' }} />
                      <div style={{ fontWeight: 700 }}>FROM:</div>
                      <input value={p3Data.rec_from || ''} onChange={(e)=> savePhaseData(3, { rec_from: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, height: 34, background: '#fde8f1' }} />
                      <div style={{ fontWeight: 700 }}>RE:</div>
                      <input value={p3Data.rec_re || ''} onChange={(e)=> savePhaseData(3, { rec_re: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, height: 34, background: '#fde8f1' }} />
                      <div style={{ fontWeight: 700 }}>DATE:</div>
                      <input value={p3Data.rec_date || ''} onChange={(e)=> savePhaseData(3, { rec_date: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, height: 34, background: '#fde8f1' }} />
                    </div>
                  </div>
                  <div style={{ borderLeft: '2px solid #d8c8eb', paddingLeft: 16, color: '#4D2F52', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontWeight: 700, color: '#4D2F52', marginBottom: 4 }}>Sample Output</div>
                    <div style={{ lineHeight: 1.7 }}>
                      <div><strong>TO:</strong> Davao City Agricultural Office</div>
                      <div><strong>FROM:</strong> Climate Data Analysis Team</div>
                      <div><strong>RE:</strong> Climate Data Analysis Findings</div>
                      <div><strong>DATE:</strong> February 14, 2026</div>
                    </div>
                  </div>

                  {/* Row 2: Executive Summary */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #d8c8eb', paddingTop: 12 }}>
                    <div style={{ fontWeight: 700 }}>EXECUTIVE SUMMARY</div>
                    <div style={{ lineHeight: 1.6, color: '#4D2F52' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <span>Our analysis examined the relationship between</span>
                        <input value={p3Data.rec_var1 || ''} onChange={(e)=> savePhaseData(3, { rec_var1: e.target.value })} placeholder="Variable 1" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: 180, height: 32, background: '#fde8f1' }} />
                        <span>and</span>
                        <input value={p3Data.rec_var2 || ''} onChange={(e)=> savePhaseData(3, { rec_var2: e.target.value })} placeholder="Variable 2" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: 180, height: 32, background: '#fde8f1' }} />
                      </div>
                      <div>in Davao Region using 24 months of PAGASA climate data.</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <span>We found a</span>
                        <input value={p3Data.rec_strength || ''} onChange={(e)=> savePhaseData(3, { rec_strength: e.target.value })} placeholder="strength and direction" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: 220, height: 32, background: '#fde8f1' }} />
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <span>correlation (</span>
                        <input value={p3Data.rec_rvalue || ''} onChange={(e)=> savePhaseData(3, { rec_rvalue: e.target.value })} placeholder="r value" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: 120, height: 32, background: '#fde8f1' }} />
                        <span>), indicating that</span>
                      </div>
                      <input value={p3Data.rec_meaning || ''} onChange={(e)=> savePhaseData(3, { rec_meaning: e.target.value })} placeholder="what the data means" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: '100%', height: 32, background: '#fde8f1', marginTop: 6 }} />
                      <div style={{ marginTop: 8 }}>This pattern has important implications for</div>
                      <input value={p3Data.rec_aspect || ''} onChange={(e)=> savePhaseData(3, { rec_aspect: e.target.value })} placeholder="affected aspect" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: '100%', height: 32, background: '#fde8f1', marginTop: 4 }} />
                    </div>
                  </div>
                  <div style={{ color: '#4D7061', lineHeight: 1.7, borderTop: '1px solid #C4E8D4', paddingTop: 12, borderLeft: '2px solid #C4E8D4', paddingLeft: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: '#2F5242' }}>EXECUTIVE SUMMARY</div>
                    Our analysis examined the relationship between monthly <strong>temperature</strong> and <strong>rainfall</strong> in Davao Region using 24 months of PAGASA data (2023-2024). We found a <strong>moderate negative</strong> correlation (<strong>r = -0.58</strong>), indicating that higher temperatures tend to correspond with lower rainfall. This pattern has important implications for <strong>local rice farmers' planting schedules.</strong>
                  </div>

                  {/* Row 3: What this means */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#4D2F52', borderTop: '1px solid #d8c8eb', paddingTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>WHAT THIS MEANS FOR</div>
                      <input value={p3Data.rec_means_for || ''} onChange={(e)=> savePhaseData(3, { rec_means_for: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, flex: '1 1 0', maxWidth: 420, height: 34, background: '#fde8f1' }} />
                    </div>
                    <textarea value={p3Data.rec_significance || ''} onChange={(e)=> savePhaseData(3, { rec_significance: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: '100%', minHeight: 140, background: '#fde8f1', resize: 'vertical' }} />
                  </div>
                  <div style={{ color: '#4D7061', lineHeight: 1.6, borderTop: '1px solid #C4E8D4', paddingTop: 12, borderLeft: '2px solid #C4E8D4', paddingLeft: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#2F5242' }}>WHAT THIS MEANS FOR RICE FARMERS</div>
                    <div>Farmers planning dry-season rice cultivation face compounded water stress: not only is rainfall naturally lower during this period, but warmer temperatures accelerate evaporation and increase irrigation demands. This dual pressure threatens crop yields.</div>
                  </div>

                  {/* Row 4: Recommendation */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: '#4D2F52', borderTop: '1px solid #d8c8eb', paddingTop: 12 }}>
                    <div style={{ fontWeight: 700 }}>RECOMMENDATION</div>
                    <div>Based on our analysis, we recommend:</div>
                    <textarea value={p3Data.rec_action || ''} onChange={(e)=> savePhaseData(3, { rec_action: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: '100%', minHeight: 110, background: '#fde8f1', resize: 'vertical' }} />
                  </div>
                  <div style={{ color: '#4D7061', lineHeight: 1.6, borderTop: '1px solid #C4E8D4', paddingTop: 12, borderLeft: '2px solid #C4E8D4', paddingLeft: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, color: '#2F5242' }}>RECOMMENDATION</div>
                    <div>The Agricultural Office should develop a temperature-based irrigation alert system that notifies farmers when monthly temperatures exceed 28°C, indicating likely below-average rainfall and need for supplemental irrigation planning.</div>
                  </div>

                  {/* Row 5: Justification */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: '#4D2F52', borderTop: '1px solid #d8c8eb', paddingTop: 12 }}>
                    <div style={{ fontWeight: 700 }}>JUSTIFICATION</div>
                    <div>This recommendation is supported by our data because:</div>
                    <textarea value={p3Data.rec_justification || ''} onChange={(e)=> savePhaseData(3, { rec_justification: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: '100%', minHeight: 110, background: '#fde8f1', resize: 'vertical' }} />
                  </div>
                  <div style={{ color: '#4D7061', lineHeight: 1.6, borderTop: '1px solid #C4E8D4', paddingTop: 12, borderLeft: '2px solid #C4E8D4', paddingLeft: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, color: '#2F5242' }}>JUSTIFICATION</div>
                    <div>Our data shows that 83% of months with T&gt;28°C had below-average rainfall. Farmers currently rely only on rainfall forecasts, missing the temperature–water stress connection.</div>
                  </div>

                  {/* Row 6: Limitations & Cautions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: '#4D2F52', borderTop: '1px solid #d8c8eb', paddingTop: 12 }}>
                    <div style={{ fontWeight: 700 }}>LIMITATIONS & CAUTIONS</div>
                    <div>We acknowledge that our analysis has limitations:</div>
                    <textarea value={p3Data.rec_limitations || ''} onChange={(e)=> savePhaseData(3, { rec_limitations: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: '100%', minHeight: 110, background: '#fde8f1', resize: 'vertical' }} />
                  </div>
                  <div style={{ color: '#4D7061', lineHeight: 1.6, borderTop: '1px solid #C4E8D4', paddingTop: 12, borderLeft: '2px solid #C4E8D4', paddingLeft: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2, color: '#2F5242' }}>LIMITATIONS & CAUTIONS</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Our 24-month sample may not capture longer-term climate cycles (e.g., El Niño effects).</li>
                      <li>Relationship strength may vary in future years as climate patterns shift.</li>
                    </ul>
                  </div>

                  {/* Row 7: Strengthening the Evidence */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: '#4D2F52', borderTop: '1px solid #d8c8eb', paddingTop: 12 }}>
                    <div style={{ fontWeight: 700 }}>STRENGTHENING THE EVIDENCE</div>
                    <div>To make this recommendation more robust, future analysis should:</div>
                    <textarea value={p3Data.rec_strengthen || ''} onChange={(e)=> savePhaseData(3, { rec_strengthen: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: '100%', minHeight: 110, background: '#fde8f1', resize: 'vertical' }} />
                  </div>
                  <div style={{ color: '#4D7061', lineHeight: 1.6, borderTop: '1px solid #C4E8D4', paddingTop: 12, borderLeft: '2px solid #C4E8D4', paddingLeft: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2, color: '#2F5242' }}>STRENGTHENING THE EVIDENCE</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Extend dataset to 5–10 years to capture climate cycles; include additional variables (wind patterns, humidity).</li>
                      <li>Compare with irrigation usage data from actual farms.</li>
                      <li>Analyze subregions separately (coastal vs. inland).</li>
                    </ul>
                  </div>

                  {/* Row 8: Conclusion */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#4D2F52', borderTop: '1px solid #d8c8eb', paddingTop: 12 }}>
                    <div style={{ fontWeight: 700 }}>CONCLUSION</div>
                    <textarea value={p3Data.rec_conclusion || ''} onChange={(e)=> savePhaseData(3, { rec_conclusion: e.target.value })} placeholder="encode your answer here" disabled={((state.phaseData as any)[3]?.recFinalized)} style={{ ...inputStyle, width: '100%', minHeight: 110, background: '#fde8f1', resize: 'vertical' }} />
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                      <button
                        className="submit-btn"
                        disabled={![
                          p3Data.rec_means_for,
                          p3Data.rec_significance,
                          p3Data.rec_action,
                          p3Data.rec_justification,
                          p3Data.rec_limitations,
                          p3Data.rec_strengthen,
                          p3Data.rec_conclusion,
                        ].every(v => (v || '').toString().trim().length > 0) || !!(state.phaseData as any)[3]?.recFinalized}
                        onClick={() => {
                          const next = savePhase3FinalizeRecommendation(user.username);
                          setState(next);
                        }}
                        style={{ height: 44, padding: '0 18px', fontFamily: 'Poppins, sans-serif', minWidth: 240, background: '#c45bb4', color: '#fff', border: 'none', borderRadius: 10 }}
                      >
                        Finalize Recommendation
                      </button>
                    </div>
                  </div>
                  <div style={{ color: '#4D7061', lineHeight: 1.6, borderTop: '1px solid #C4E8D4', paddingTop: 12, borderLeft: '2px solid #C4E8D4', paddingLeft: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2, color: '#2F5242' }}>CONCLUSION</div>
                    <div>While acknowledging limitations, the consistent negative correlation between temperature and rainfall provides actionable intelligence for agricultural planning. Implementing a temperature-based alert system would give farmers a valuable planning tool with minimal cost. We recommend a pilot program in three barangays to test effectiveness.</div>
                  </div>
                </div>
              </div>
              {p3Score !== undefined && (<div className="banner">Teacher Score: {p3Score}%</div>)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ========= Phase 1 activity helpers =========
  const p1Data = (state.phaseData as any)[1] || {};
  const p3Data = (state.phaseData as any)[3] || {};
  const [a2Answers, setA2Answers] = useState<string[]>(() => p1Data.a2Answers ?? Array(activity2Questions.length).fill(''));
  const [a2Submitted, setA2Submitted] = useState<boolean>(!!p1Data.a2Done);
  const [a2Checks, setA2Checks] = useState<(boolean | null)[]>(() => Array(activity2Questions.length).fill(null));
  useEffect(() => {
    setA2Answers(p1Data.a2Answers ?? Array(activity2Questions.length).fill(''));
    setA2Submitted(!!p1Data.a2Done);
    // compute checks from saved answers if present
    try {
      const checks = (p1Data.a2Answers || Array(activity2Questions.length).fill('')).map((ans: string, idx: number) => {
        try { return !!activity2Validators[idx] && activity2Validators[idx](ans || ''); } catch (e) { return null; }
      });
      setA2Checks(checks as (boolean | null)[]);
    } catch (e) { setA2Checks(Array(activity2Questions.length).fill(null)); }
  }, [p1Data.a2Answers, p1Data.a2Done]);
  const a2AllAnswered = useMemo(() => a2Answers.every(a => (a || '').trim().length > 0), [a2Answers]);

  const renderActivity2Questions = () => (
    <div className="question-list">
      {activity2Questions.map((q, idx) => (
        <div key={idx} className="question-item">
          <label style={{ marginLeft: 16 }}><b>{idx + 1}.</b> {q}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea
              rows={1}
              style={{ flex: 1, height: 56, boxSizing: 'border-box', padding: '8px', resize: 'vertical' }}
              value={a2Answers[idx] || ''}
              onChange={(e)=> {
                const next = [...a2Answers];
                next[idx] = e.target.value;
                setA2Answers(next);
              }}
              disabled={a2Submitted}
            />
            <div style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {a2Checks[idx] === true && (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="11" stroke="#16a34a" strokeWidth="2" fill="white" />
                  <path d="M7 12.5l2.5 2.5L17 8" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {a2Checks[idx] === false && (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="11" stroke="#dc2626" strokeWidth="2" fill="#dc2626" />
                  <rect x="5" y="11" width="14" height="2" fill="white" rx="1" />
                </svg>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const onCompleteCheckpoint = async () => {
    const score = activity2Validators.reduce((acc, fn, idx) => acc + (fn(a2Answers[idx] || '') ? 1 : 0), 0);
    try {
      await saveActivity2Checkpoint(user.username, a2Answers, score);
    } catch (err) {
      console.error('saveActivity2Checkpoint failed', err);
      try { alert('Failed to save checkpoint. Please try again or contact your teacher.'); } catch(_){}
    }
    // compute checks and set
    try {
      const checks = a2Answers.map((ans, idx) => {
        try { return !!activity2Validators[idx] && activity2Validators[idx](ans || ''); } catch (e) { return false; }
      });
      setA2Checks(checks.map(c => c ? true : false));
    } catch (e) { /* ignore */ }
    setState(getLesson1State(user.username));
    setA2Submitted(true);
  };

  const a3Ready = useMemo(() => !!(p1Data.a3Var1 || '').trim() && !!(p1Data.a3Var2 || '').trim() && !!(p1Data.a3Reason || '').trim(), [p1Data.a3Var1, p1Data.a3Var2, p1Data.a3Reason]);

  const onActivity3Done = async () => {
    if (!a3Ready) return;
    try {
      await saveActivity3Choice(user.username, p1Data.a3Var1 || '', p1Data.a3Var2 || '', p1Data.a3Reason || '');
    } catch (err) {
      console.error('saveActivity3Choice failed', err);
      try { alert('Failed to save your choice. Please try again or contact your teacher.'); } catch(_){}
      return;
    }
    setState(getLesson1State(user.username));
    setSubOpen({ a1:false, a2:false, a3:false, a4:true });
  };

  const canSubmitQuestion = useMemo(() => !!(p1Data.a4aQuestion || '').trim(), [p1Data.a4aQuestion]);
  const onSubmitQuestion = async () => {
    try {
      await saveActivity4aQuestion(user.username, p1Data.a4aQuestion || '');
    } catch (err) {
      console.error('saveActivity4aQuestion failed', err);
      try { alert('Failed to submit your question. Please try again or contact your teacher.'); } catch(_){}
      return;
    }
    setState(getLesson1State(user.username));
  };

  const canFinalize = useMemo(() => !!(p1Data.a4aSubmitted) && !!(p1Data.a4bFinalQuestion || '').trim() && !!activity4Feedback, [p1Data.a4aSubmitted, p1Data.a4bFinalQuestion, activity4Feedback]);
  const onFinalizeQuestion = () => {
    saveActivity4bFinal(user.username, p1Data.a4bFinalQuestion || '');
    setState(getLesson1State(user.username));
  };

  const canOpenActivity = (activity: number) => {
    if (activity === 1) return true;
    if (activity === 2) return !!p1Data.a1Done;
    if (activity === 3) return !!p1Data.a2Done;
    if (activity === 4) return !!p1Data.a3Done;
    return true;
  };

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

  // ========= Phase 2 Activity 1 helpers =========
  type P2Pattern = 'positive' | 'negative' | 'none';

  const [p2Answers, setP2Answers] = useState<string[]>(new Array(6).fill(''));
  const [p2Result, setP2Result] = useState<boolean[] | null>(null);
  const p2AllAnswered = useMemo(() => p2Answers.every(s => (s || '').trim().length > 0), [p2Answers]);
  const rightListRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [, setPlotHeight] = useState<number>(352);

  useEffect(() => {
    const updateHeight = () => {
      if (rightListRef.current) {
        const h = rightListRef.current.getBoundingClientRect().height;
        setPlotHeight(Math.round(h));
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [p2Answers, p2Result, subOpen.a1, state.phaseData]);

  // Numeric helpers used by correlation visualization
  function randn(mu = 0, sigma = 1): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mu + sigma * z;
  }

  function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function makePatternPoints(pattern: P2Pattern): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i < 36; i++) {
      const x = clamp(randn(50, 18), 0, 100);
      let y = randn(50, 18);
      if (pattern === 'positive') y = x + randn(0, 14);
      if (pattern === 'negative') y = 100 - x + randn(0, 14);
      pts.push([clamp(x, 0, 100), clamp(y, 0, 100)]);
    }
    return pts;
  }

  // Lightweight scatter plot renderer used in Activities 2–3
  function renderScatterSVG(
    points: [number, number][],
    width = 420,
    height = 300,
    className?: string,
    displayHeight?: number,
    xLabel?: string,
    yLabel?: string,
    overlayText?: string,
    subtitleText?: string
  ) {
    const w = width;
    const h = displayHeight ?? height;
    const padL = 44, padR = 24, padT = 20, padB = 40;
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const minX = Math.min(...xs, 0);
    const maxX = Math.max(...xs, 100);
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys, 100);
    const toX = (v: number) => padL + ((v - minX) / Math.max(1, maxX - minX)) * (w - padL - padR);
    const toY = (v: number) => padT + (1 - (v - minY) / Math.max(1, maxY - minY)) * (h - padT - padB);

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} style={{ background: '#fff' }} role="img">
        <rect x={padL} y={padT} width={w - padL - padR} height={h - padT - padB} fill="#f9f4fb" stroke="#e6d9f1" strokeWidth={2} rx={8} />
        <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#b489d6" strokeWidth={2} />
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#b489d6" strokeWidth={2} />
        {Array.from({ length: 5 }).map((_, i) => {
          const t = i / 4;
          const gx = padL + t * (w - padL - padR);
          const gy = padT + (1 - t) * (h - padT - padB);
          const xv = (minX + t * (maxX - minX)).toFixed(0);
          const yv = (minY + t * (maxY - minY)).toFixed(0);
          return (
            <g key={i}>
              <line x1={gx} y1={padT} x2={gx} y2={h - padB} stroke="#e6d9f1" strokeWidth={1} />
              <line x1={padL} y1={gy} x2={w - padR} y2={gy} stroke="#e6d9f1" strokeWidth={1} />
              <text x={gx} y={h - padB + 16} textAnchor="middle" fontSize={10} fill="#5a3a7a">{xv}</text>
              <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="#5a3a7a">{yv}</text>
            </g>
          );
        })}
        {xLabel && (<text x={(padL + w - padR) / 2} y={h - 8} textAnchor="middle" fontSize={12} fill="#5a3a7a" fontWeight={600}>{xLabel}</text>)}
        {yLabel && (<text x={12} y={(padT + h - padB) / 2} textAnchor="middle" fontSize={12} fill="#5a3a7a" fontWeight={600} transform={`rotate(-90 12 ${(padT + h - padB) / 2})`}>{yLabel}</text>)}
        {subtitleText && (<text x={padL + 8} y={padT + 16} fontSize={12} fill="#5a3a7a">{subtitleText}</text>)}
        {overlayText && (<text x={w - padR - 8} y={padT + 16} textAnchor="end" fontSize={12} fill="#5a3a7a" fontWeight={600}>{overlayText}</text>)}
        {points.map((p, idx) => (
          <circle key={idx} cx={toX(p[0])} cy={toY(p[1])} r={4} fill="rgba(142,68,173,0.75)" stroke="#5a3a7a" strokeWidth={0.6} />
        ))}
      </svg>
    );
  }

  const visualGuides = useMemo(() => ([
    { label: 'Positive correlation', points: makePatternPoints('positive'), img: `${import.meta.env.BASE_URL}correlation_positive.png` },
    { label: 'Negative correlation', points: makePatternPoints('negative'), img: `${import.meta.env.BASE_URL}correlation_negative.png` },
    { label: 'No correlation', points: makePatternPoints('none'), img: `${import.meta.env.BASE_URL}correlation_none.png` },
  ]), []);


  const p2A2Datasets = useMemo(() => ([
    {
      v1: 'Consecutive Dry Days (x)', v2: 'Water Service Interruptions (y)',
      x: ['20.00','10.00','13.00','3.00','6.00','3.00','19.00','16.00'],
      y: ['10.00','3.00','2.00','2.00','4.00','2.00','8.00','8.00']
    },
    {
      v1: 'Temperature Mean (°C) (x)', v2: 'Electricity Demand (GWh) (y)',
      x: ['27.68','26.21','28.28','28.41','25.85','30.23','29.60','28.96'],
      y: ['602.00','683.00','704.00','633.00','615.00','740.00','708.00','679.00']
    },
    {
      v1: 'Rainfall Total (mm) (x)', v2: 'Dengue Cases (y)',
      x: ['63.00','417.00','275.00','179.00','126.00','86.00','391.00','289.00'],
      y: ['61.00','493.00','193.00','467.00','374.00','144.00','426.00','202.00']
    },
    {
      v1: 'ENSO Index (Niño 3.4) (x)', v2: 'Banana Production (MT) (y)',
      x: ['0.50','0.20','1.70','0.80','-0.10','0.70','-0.30','-1.30'],
      y: ['102,061.00','106,146.00','84,229.00','91,548.00','106,147.00','102,490.00','112,551.00','97,878.00']
    },
    {
      v1: 'Wind Speed (m/s) (x)', v2: 'Municipal Fish Catch (MT) (y)',
      x: ['7.12','4.27','1.22','8.36','3.64','2.43','2.66','4.01'],
      y: ['2,092.00','2,447.00','2,587.00','2,024.00','2,197.00','2,722.00','2,435.00','1,066.00']
    },
    {
      v1: 'PM2.5 (μg/m³) (x)', v2: 'Respiratory ER Visits (y)',
      x: ['62.56','13.75','10.45','27.43','60.35','54.24','79.40','53.22'],
      y: ['442.00','689.00','337.00','332.00','733.00','389.00','630.00','685.00']
    },
    {
      v1: 'Rainfall Total (mm) (x)', v2: 'Traffic Accidents (y)',
      x: ['63.00','417.00','275.00','179.00','126.00','86.00','391.00','289.00'],
      y: ['298.00','373.00','160.00','182.00','367.00','245.00','291.00','372.00']
    },
    {
      v1: 'Heat Index (°C) (x)', v2: 'Heat-Related Illness Cases (y)',
      x: ['38.91','33.01','32.58','34.38','31.67','40.28','37.43','38.15'],
      y: ['12.00','21.00','23.00','39.00','33.00','33.00','48.00','40.00']
    },
    {
      v1: 'Temperature Mean (°C) (x)', v2: 'Tourist Arrivals (y)',
      x: ['27.68','26.21','28.28','28.41','25.85','30.23','29.60','28.96'],
      y: ['43,260.00','19,680.00','43,305.00','29,849.00','29,748.00','14,546.00','45,558.00','34,024.00']
    },
    {
      v1: 'Sea Surface Temp (°C) (x)', v2: 'Commercial Fish Catch (MT) (y)',
      x: ['30.33','26.71','29.06','26.29','28.47','27.40','26.76','26.12'],
      y: ['2,390.00','3,497.00','4,066.00','2,237.00','2,165.00','4,678.00','3,232.00','2,082.00']
    }
  ]), []);

  const [p2A2Sel, setP2A2Sel] = useState<number | null>(null);
  const [p2A2Locked, setP2A2Locked] = useState<boolean>(false);
  const selectedDataset = p2A2Sel !== null ? p2A2Datasets[p2A2Sel] : null;
  const a2Done = !!(state.phaseData as any)[2]?.a2Done;
  const variableOptions = useMemo(() => (
    Array.from(new Set([...climateLabels, ...societalLabels])).map(String).sort((a, b) => a.localeCompare(b))
  ), []);
  const [pairVar1, setPairVar1] = useState<string>('');
  const [pairVar2, setPairVar2] = useState<string>('');
  const [pairResearchQuestion, setPairResearchQuestion] = useState<string>('');
  const [pairComputeR, setPairComputeR] = useState<string>('');
  const [pairStrength, setPairStrength] = useState<string>('');
  const [pairDirection, setPairDirection] = useState<string>('');
  const [pairInterpretation, setPairInterpretation] = useState<string>('');
  const [visibleStep, setVisibleStep] = useState<number | null>(null);
  const stepCardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [showAllSteps, setShowAllSteps] = useState<boolean>(false);
  const showStep = (step: number) => {
    setShowAllSteps(false);
    setVisibleStep(step);
    setTimeout(() => {
      const el = stepCardRefs.current[step - 1];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };
  const scrollToTable = () => {
    setVisibleStep(null);
    setTimeout(() => {
      const el = tableRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.pageYOffset - 72;
      window.scrollTo({ top, behavior: 'smooth' });
    }, 0);
  };
  const BasicCalc: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
    const [display, setDisplay] = useState<string>('0');
    const [acc, setAcc] = useState<number | null>(null);
    const [op, setOp] = useState<string | null>(null);
    const [fresh, setFresh] = useState<boolean>(true);

    const toNum = (s: string) => {
      const t = s.replace(/,/g, '');
      const v = Number(t);
      return Number.isFinite(v) ? v : 0;
    };

    const formatDisplay = (s: string) => s;

    const inputDigit = (d: string) => {
      if (fresh) {
        setDisplay(d === '.' ? '0.' : d);
        setFresh(false);
      } else {
        if (d === '.' && display.includes('.')) return;
        setDisplay(prev => (prev === '0' && d !== '.') ? d : prev + d);
      }
    };

    const doOp = (nextOp: string) => {
      const cur = toNum(display);
      if (acc === null) {
        setAcc(cur);
      } else if (op) {
        let res = acc;
        switch (op) {
          case '+': res = acc + cur; break;
          case '-': res = acc - cur; break;
          case '×': res = acc * cur; break;
          case '÷': res = cur === 0 ? acc : acc / cur; break;
        }
        setAcc(res);
        setDisplay(String(res));
      }
      setOp(nextOp === '=' ? null : nextOp);
      setFresh(true);
    };

    const clearAll = () => { setDisplay('0'); setAcc(null); setOp(null); setFresh(true); };
    const backspace = () => {
      if (fresh) return;
      setDisplay(prev => prev.length <= 1 ? '0' : prev.slice(0, -1));
    };

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const k = e.key;
      if ((/^[0-9]$/).test(k)) { inputDigit(k); e.preventDefault(); return; }
      if (k === '.' ) { inputDigit('.'); e.preventDefault(); return; }
      if (k === 'Backspace') { backspace(); e.preventDefault(); return; }
      if (k === 'Enter' || k === '=') { doOp('='); e.preventDefault(); return; }
      if (k === '+' || k === '-') { doOp(k); e.preventDefault(); return; }
      if (k === '*' ) { doOp('×'); e.preventDefault(); return; }
      if (k === '/') { doOp('÷'); e.preventDefault(); return; }
      if (k === 'Escape') { clearAll(); e.preventDefault(); return; }
    };

    return (
      <div style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', minWidth: 88, maxWidth: 140, textAlign: 'center', ...style }}>
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 12 }}>Calculator</div>
        <input
          value={formatDisplay(display)}
          onChange={(e) => { setDisplay(e.target.value); setFresh(false); }}
          onKeyDown={handleKey}
          style={{ width: '100%', height: 22, textAlign: 'right', padding: '2px 6px', fontSize: 12, borderRadius: 4, border: '1px solid #ccc' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginTop: 4 }}>
          {['7','8','9','÷','4','5','6','×','1','2','3','-','0','.','=','+'].map((k) => (
            <button key={k} type="button" onClick={() => {
              if ((/^[0-9]$/).test(k)) return inputDigit(k);
              if (k === '.') return inputDigit('.');
              if (k === '÷' || k === '×' || k === '-' || k === '+' || k === '=') return doOp(k === '=' ? '=' : k);
            }} style={{ height: 22, borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 11, padding: '0' }}>{k}</button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <button type="button" onClick={backspace} style={{ padding: '3px 6px', borderRadius: 4, fontSize: 12 }}>←</button>
          <button type="button" onClick={clearAll} style={{ padding: '3px 6px', borderRadius: 4, fontSize: 12 }}>C</button>
        </div>
        <div style={{ fontStyle: 'italic', textAlign: 'right', marginTop: 4, fontSize: '0.75rem' }}>Always round off to the nearest hundredths (or two decimal places).</div>
      </div>
    );
  };
  const selfAssessItems = [
    'I can correctly encode and organize two related variables in a spreadsheet for analysis.',
    'I can create an accurate scatterplot using spreadsheet tools.',
    'I can properly label the scatterplot (title, x-axis, y-axis) to represent the data clearly.',
    'I can use spreadsheet formulas or functions to calculate the correlation coefficient (r).',
    'I can interpret the value of r to describe the strength and direction of the relationship between variables.'
  ];
  const selfAssessScale: string[] = [
    'Yes, independently and accurately',
    'Yes, with minimal assistance',
    'Yes, with some guidance',
    'Yes, with significant help',
    'No, I cannot do this yet'
  ];
  // Activity 3 local states
  const [selfAssessAnswers, setSelfAssessAnswers] = useState<string[]>(Array(selfAssessItems.length).fill(''));
  const [selfAssessSubmitted, setSelfAssessSubmitted] = useState<boolean>(false);
  const [uploadPreview, setUploadPreview] = useState<{ url: string; type: 'image' | 'pdf' } | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [checkpointAnswers, setCheckpointAnswers] = useState<Array<'yes' | 'no' | ''>>(['', '', '', '']);
  const [checkpointFinalized, setCheckpointFinalized] = useState<boolean>(false);

  // Phase 4: Peer review and reflection states
  const [peerAnswers, setPeerAnswers] = useState<string[][]>([[], [], [], []]);
  const [peerStrength, setPeerStrength] = useState<string>('');
  const [peerSuggestion, setPeerSuggestion] = useState<string>('');
  const [peerReviewer, setPeerReviewer] = useState<string>('');
  const [peerSubmitted, setPeerSubmitted] = useState<boolean>(false);

  const [reflectionFields, setReflectionFields] = useState<Record<string, string>>({});
  const [reflectionUpload, setReflectionUpload] = useState<{ url: string; mimeType?: string } | null>(null);
  const [reflectionFile, setReflectionFile] = useState<File | null>(null);

  // Rehydrate Phase 4 saved peer-review and reflection on mount
  useEffect(() => {
    try {
      const allReviews: any = (typeof getPhase4ReviewAll === 'function') ? getPhase4ReviewAll() : {};
      const mine = allReviews[user.username] || {};
      if (mine.review) {
        const r = mine.review || {};
        try { setPeerAnswers([r.q1 || [], r.q2 || [], r.q3 || [], r.q4 || []]); } catch (e) {}
        try { setPeerStrength(r.strength || ''); } catch (e) {}
        try { setPeerSuggestion(r.suggestion || ''); } catch (e) {}
        try { setPeerReviewer(r.reviewer || ''); } catch (e) {}
        if (mine.submitted || mine.timestamp) setPeerSubmitted(true);
      } else {
        // fallback to lesson1 state if aggregate missing
        try {
          const ls = getLesson1State(user.username);
          const p4 = (ls.phaseData as any)?.[4] || {};
          if (p4.peerReview) {
            const r = p4.peerReview || {};
            try { setPeerAnswers([r.q1 || [], r.q2 || [], r.q3 || [], r.q4 || []]); } catch (e) {}
            try { setPeerStrength(r.strength || ''); } catch (e) {}
            try { setPeerSuggestion(r.suggestion || ''); } catch (e) {}
            try { setPeerReviewer(r.reviewer || ''); } catch (e) {}
            if (p4.peerReviewSubmitted) setPeerSubmitted(true);
          }
        } catch (e) {}
      }

      try {
        const allComplete: any = (typeof getPhase4CompleteAll === 'function') ? getPhase4CompleteAll() : {};
        const mine2 = allComplete[user.username] || {};
        if (mine2.reflection) setReflectionFields(mine2.reflection || {});
        if (mine2.uploadUrl) setReflectionUpload({ url: mine2.uploadUrl, mimeType: mine2.mimeType });
        // also try lesson1 state fallback
        try {
          const ls = getLesson1State(user.username);
          const p4 = (ls.phaseData as any)?.[4] || {};
          if (p4.reflection) setReflectionFields(p4.reflection || {});
          if (p4.upload) setReflectionUpload({ url: p4.upload.url || '', mimeType: p4.upload.mimeType || '' });
        } catch (e) {}
      } catch (e) {}
    } catch (e) {
      // ignore rehydrate errors
    }
  }, []);

  // ========= Phase 2 Activity 4 (Interpretation Quiz) state =========
  const a4StrengthOptions: string[] = [
    'Perfect',
    'Very Strong',
    'Strong',
    'Moderate',
    'Weak',
    'Very Weak',
    'No Relationship'
  ];
  const a4DirectionOptions: string[] = ['Positive', 'Negative', 'None'];
  const a4QuizItems: Array<{ r: string; strength: string; direction: string }> = [
    { r: '0.43', strength: 'Moderate', direction: 'Positive' },
    { r: '-0.97', strength: 'Very Strong', direction: 'Negative' },
    { r: '0.18', strength: 'Very Weak', direction: 'Positive' },
    { r: '0.74', strength: 'Strong', direction: 'Positive' },
    { r: '-0.27', strength: 'Weak', direction: 'Negative' }
  ];
  const [a4StrengthSel, setA4StrengthSel] = useState<string[]>(Array(a4QuizItems.length).fill(''));
  const [a4DirectionSel, setA4DirectionSel] = useState<string[]>(Array(a4QuizItems.length).fill(''));
  const a4Complete = useMemo(() => (
    a4StrengthSel.every(v => (v || '').trim().length > 0) &&
    a4DirectionSel.every(v => (v || '').trim().length > 0)
  ), [a4StrengthSel, a4DirectionSel]);
  const [a4Checked, setA4Checked] = useState<boolean>(false);
  const [a4Correct, setA4Correct] = useState<boolean[]>(Array(a4QuizItems.length).fill(false));
  const checkA4Answers = () => {
    const verdicts = a4QuizItems.map((item, idx) =>
      item.strength === a4StrengthSel[idx] && item.direction === a4DirectionSel[idx]
    );
    setA4Correct(verdicts);
    setA4Checked(true);
    const next = savePhase2Activity4Check(user.username, a4StrengthSel, a4DirectionSel);
    setState(next);
  };
  const StepButton: React.FC<{ label: string; style?: React.CSSProperties; onClick?: () => void; disabled?: boolean }> = ({ label, style, onClick, disabled }) => {
    const [pressed, setPressed] = useState(false);
    const [hover, setHover] = useState(false);
    const needsTranslate = style && Object.prototype.hasOwnProperty.call(style, 'left');
    const bg = disabled ? 'var(--phase2-accent-light, #FFF1F6)' : ((hover || pressed) ? 'var(--phase2-accent-hover, #d7aebf)' : 'var(--phase2-accent, #E6B8CC)');
    const transform = needsTranslate ? `translateX(-50%) ${pressed ? 'scale(0.97)' : 'scale(1)'}` : (pressed ? 'scale(0.97)' : 'scale(1)');
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled && onClick) onClick(); }}
        onMouseDown={() => { if (!disabled) setPressed(true); }}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => { setPressed(false); setHover(false); }}
        onMouseEnter={() => { if (!disabled) setHover(true); }}
        onKeyDown={(e) => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) setPressed(true); }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') setPressed(false); }}
        style={{
          height: 28,
          minWidth: 80,
          borderRadius: 16,
          background: bg,
          color: 'var(--phase2-accent-text, #4D2038)',
          border: 'none',
          fontWeight: 600,
          boxShadow: pressed ? 'inset 0 2px 0 rgba(0,0,0,0.12)' : '0 4px 10px rgba(0,0,0,0.06)',
          transform,
          transition: 'transform 80ms ease, box-shadow 120ms ease, background 120ms ease',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...style,
        }}
      >{label}</button>
    );
  };

  // Card 10 formula input boxes (independent fields)
  const [nVal, setNVal] = useState<string>('');
  const [nLocked, setNLocked] = useState<boolean>(false);
  const [xSumVal, setXSumVal] = useState<string>('');
  const [xSumLocked, setXSumLocked] = useState<boolean>(false);
  const [ySumVal, setYSumVal] = useState<string>('');
  const [ySumLocked, setYSumLocked] = useState<boolean>(false);
  const [xyVals, setXyVals] = useState<string[]>(Array(8).fill(''));
  const [xyLocked, setXyLocked] = useState<boolean>(false);
  const [xySumVal, setXySumVal] = useState<string>('');
  const [xySumLocked, setXySumLocked] = useState<boolean>(false);
  const [xSqVals, setXSqVals] = useState<string[]>(Array(8).fill(''));
  const [xSqLocked, setXSqLocked] = useState<boolean>(false);
  const [xSqSumVal, setXSqSumVal] = useState<string>('');
  const [xSqSumLocked, setXSqSumLocked] = useState<boolean>(false);
  const [ySqVals, setYSqVals] = useState<string[]>(Array(8).fill(''));
  const [ySqLocked, setYSqLocked] = useState<boolean>(false);
  const [ySqSumVal, setYSqSumVal] = useState<string>('');
  const [ySqSumLocked, setYSqSumLocked] = useState<boolean>(false);

  // Load saved Phase2 Activity2 steps and selected dataset on mount
  useEffect(() => {
    try {
      const extraAll = (typeof getPhase2Activity2AnswersAll === 'function') ? getPhase2Activity2AnswersAll() : {};
      const metaAll = (typeof getPhase2Activity2All === 'function') ? getPhase2Activity2All() : {};
      const myExtra: any = extraAll[user.username] || {};
      const myMeta: any = metaAll[user.username] || {};
      let steps: any = myExtra.steps || {};
      // fallback: if aggregate store missing per-row arrays, try lesson1State per-user a2Steps
      if (!steps || Object.keys(steps).length === 0) {
        try {
          const ls = getLesson1State(user.username);
          const s2 = (ls.phaseData as any)?.[2]?.a2Steps || {};
          if (s2 && Object.keys(s2).length) steps = s2;
        } catch (e) {
          // ignore
        }
      }
      if (steps.n) { setNVal(steps.n); setNLocked(true); }
      if (steps.xSum) { setXSumVal(steps.xSum); setXSumLocked(true); }
      if (steps.ySum) { setYSumVal(steps.ySum); setYSumLocked(true); }
      if (steps.xySum) { setXySumVal(steps.xySum); setXySumLocked(true); }
      if (steps.xSqSum) { setXSqSumVal(steps.xSqSum); setXSqSumLocked(true); }
      if (steps.ySqSum) { setYSqSumVal(steps.ySqSum); setYSqSumLocked(true); }
      // restore per-row arrays if present
      if (Array.isArray(steps.xyVals) && steps.xyVals.length) {
        setXyVals((steps.xyVals as any[]).map(v => v == null ? '' : String(v)));
        try { if ((steps.xyVals as any[]).every((v:any) => String(v ?? '').trim().length > 0)) setXyLocked(true); } catch (e) {}
      }
      if (Array.isArray(steps.xSqVals) && steps.xSqVals.length) {
        setXSqVals((steps.xSqVals as any[]).map(v => v == null ? '' : String(v)));
        try { if ((steps.xSqVals as any[]).every((v:any) => String(v ?? '').trim().length > 0)) setXSqLocked(true); } catch (e) {}
      }
      if (Array.isArray(steps.ySqVals) && steps.ySqVals.length) {
        setYSqVals((steps.ySqVals as any[]).map(v => v == null ? '' : String(v)));
        try { if ((steps.ySqVals as any[]).every((v:any) => String(v ?? '').trim().length > 0)) setYSqLocked(true); } catch (e) {}
      }
      // restore Card 10 encoding/formula fields
      if (steps.fNNum) setFNNum(steps.fNNum);
      if (steps.fXYNum) setFXYNum(steps.fXYNum);
      if (steps.fXNum) setFXNum(steps.fXNum);
      if (steps.fYNum) setFYNum(steps.fYNum);
      if (steps.fN_DX) setFN_DX(steps.fN_DX);
      if (steps.fXSq_DX) setFXSq_DX(steps.fXSq_DX);
      if (steps.fX_DX) setFX_DX(steps.fX_DX);
      if (steps.fN_DY) setFN_DY(steps.fN_DY);
      if (steps.fYSq_DY) setFYSq_DY(steps.fYSq_DY);
      if (steps.fY_DY) setFY_DY(steps.fY_DY);
      if (myExtra.answer) setCorrAnswer(myExtra.answer || '');
      if (myMeta.var1 && myMeta.var2) {
        const idx = p2A2Datasets.findIndex((ds:any) => ds.v1 === myMeta.var1 && ds.v2 === myMeta.var2);
        if (idx !== -1) { setP2A2Sel(idx); setP2A2Locked(true); }
      }
      // restore checkpointFinalized and checkpoint answers from lesson1 state
      try {
        const ls = getLesson1State(user.username);
        if ((ls.phaseData as any)?.[2]?.checkpointFinalized) setCheckpointFinalized(true);
        if (Array.isArray((ls.phaseData as any)?.[2]?.checkpointAnswers)) {
          setCheckpointAnswers((ls.phaseData as any)[2].checkpointAnswers as Array<'yes' | 'no' | ''>);
        }
      } catch (e) { }

      // restore any previously uploaded preview for Phase 2 Activity 3
      try {
        const p3All: any = (typeof getPhase2Activity3All === 'function') ? getPhase2Activity3All() : {};
        const mine3 = p3All[user.username] || {};
        if (mine3.uploadUrl) {
          const mime = (mine3.mimeType || '') as string;
          setUploadPreview({ url: mine3.uploadUrl, type: mime.includes('pdf') ? 'pdf' : 'image' });
        }
      } catch (e) { }
      // restore Phase 2 self-assessment answers if present
      try {
        const saAll: any = (typeof getPhase2SelfAssessAll === 'function') ? getPhase2SelfAssessAll() : {};
        const mineSa = saAll[user.username] || {};
        if (Array.isArray(mineSa.answers) && mineSa.answers.length) {
          setSelfAssessAnswers(mineSa.answers.slice(0, selfAssessItems.length));
          setSelfAssessSubmitted(true);
        }
      } catch (e) { }
      // restore Activity4 (Interpretation Quiz) selections if previously checked
      try {
        const a4All: any = (typeof getPhase2Activity4CheckAll === 'function') ? getPhase2Activity4CheckAll() : {};
        const mine = a4All[user.username] || {};
        if (Array.isArray(mine.strength) && mine.strength.length) setA4StrengthSel(mine.strength.slice(0, a4QuizItems.length));
        if (Array.isArray(mine.direction) && mine.direction.length) setA4DirectionSel(mine.direction.slice(0, a4QuizItems.length));
        if (mine.checked) {
          const verdicts = a4QuizItems.map((item: any, idx: number) => item.strength === (mine.strength?.[idx] || a4StrengthSel[idx]) && item.direction === (mine.direction?.[idx] || a4DirectionSel[idx]));
          setA4Correct(verdicts);
          setA4Checked(true);
        }
      } catch (e) { }
      // restore Activity4 interpretation submission if present
      try {
        const interpAll: any = (typeof getPhase2Activity4InterpAllDetailed === 'function') ? getPhase2Activity4InterpAllDetailed() : {};
        const mine2 = interpAll[user.username] || {};
        if (mine2.var1) setPairVar1(mine2.var1);
        if (mine2.var2) setPairVar2(mine2.var2);
        if (mine2.question) setPairResearchQuestion(mine2.question);
        if (mine2.computedR) setPairComputeR(mine2.computedR);
        if (mine2.strength) setPairStrength(mine2.strength);
        if (mine2.direction) setPairDirection(mine2.direction);
        if (mine2.interp) setPairInterpretation(mine2.interp);
        // restore encodings into Card 10 fields if present
        if (mine2.encodings) {
          const e = mine2.encodings;
          if (e.fNNum) setFNNum(e.fNNum);
          if (e.fXYNum) setFXYNum(e.fXYNum);
          if (e.fXNum) setFXNum(e.fXNum);
          if (e.fYNum) setFYNum(e.fYNum);
          if (e.fN_DX) setFN_DX(e.fN_DX);
          if (e.fXSq_DX) setFXSq_DX(e.fXSq_DX);
          if (e.fX_DX) setFX_DX(e.fX_DX);
          if (e.fN_DY) setFN_DY(e.fN_DY);
          if (e.fYSq_DY) setFYSq_DY(e.fYSq_DY);
          if (e.fY_DY) setFY_DY(e.fY_DY);
        }
        if (mine2.timestamp) {
          // mark as submitted/locked
          setA4Checked(true);
          setA4Correct(a4QuizItems.map((item,i)=> item.strength === (mine2.strength || '') && item.direction === (mine2.direction || '')));
          // also update lesson state copy
          try { const ls = getLesson1State(user.username); setState(ls); } catch (e) {}
        }
      } catch (e) {}
    } catch (e) {
      // ignore
    }
  }, []);

  // Card 10 formula input boxes (independent fields)
  const [fNNum, setFNNum] = useState<string>('');
  const [fXYNum, setFXYNum] = useState<string>('');
  const [fXNum, setFXNum] = useState<string>('');
  const [fYNum, setFYNum] = useState<string>('');
  const [fN_DX, setFN_DX] = useState<string>('');
  const [fXSq_DX, setFXSq_DX] = useState<string>('');
  const [fX_DX, setFX_DX] = useState<string>('');
  const [fN_DY, setFN_DY] = useState<string>('');
  const [fYSq_DY, setFYSq_DY] = useState<string>('');
  const [fY_DY, setFY_DY] = useState<string>('');

  // Card 10 auto-check helpers and status
  const norm = (s: string | number | null | undefined) => String(s ?? '').trim();
  const toNum = (s: string | number | null | undefined) => {
    const v = Number(norm(s));
    return Number.isFinite(v) ? v : null;
  };
  const eqVal = (a: string | number | null | undefined, b: string | number | null | undefined) => {
    const na = toNum(a), nb = toNum(b);
    if (na !== null && nb !== null) return na === nb;
    return norm(a) === norm(b);
  };
  const anyFilled = (arr: Array<string | undefined>) => arr.some(s => norm(s).length > 0);
  const allMatch = (arr: Array<string | undefined>, target: string | undefined) => arr.every(s => eqVal(s, target));

  const nOk = useMemo(() => !!norm(nVal) && allMatch([fNNum, fN_DX, fN_DY], nVal), [nVal, fNNum, fN_DX, fN_DY]);
  const nShow = useMemo(() => !!norm(nVal) && anyFilled([fNNum, fN_DX, fN_DY]), [nVal, fNNum, fN_DX, fN_DY]);

  const sxOk = useMemo(() => !!norm(xSumVal) && allMatch([fXNum, fX_DX], xSumVal), [xSumVal, fXNum, fX_DX]);
  const sxShow = useMemo(() => !!norm(xSumVal) && anyFilled([fXNum, fX_DX]), [xSumVal, fXNum, fX_DX]);

  const syOk = useMemo(() => !!norm(ySumVal) && allMatch([fYNum, fY_DY], ySumVal), [ySumVal, fYNum, fY_DY]);
  const syShow = useMemo(() => !!norm(ySumVal) && anyFilled([fYNum, fY_DY]), [ySumVal, fYNum, fY_DY]);

  const sxyOk = useMemo(() => !!norm(xySumVal) && allMatch([fXYNum], xySumVal), [xySumVal, fXYNum]);
  const sxyShow = useMemo(() => !!norm(xySumVal) && anyFilled([fXYNum]), [xySumVal, fXYNum]);

  const sx2Ok = useMemo(() => !!norm(xSqSumVal) && allMatch([fXSq_DX], xSqSumVal), [xSqSumVal, fXSq_DX]);
  const sx2Show = useMemo(() => !!norm(xSqSumVal) && anyFilled([fXSq_DX]), [xSqSumVal, fXSq_DX]);

  const sy2Ok = useMemo(() => !!norm(ySqSumVal) && allMatch([fYSq_DY], ySqSumVal), [ySqSumVal, fYSq_DY]);
  const sy2Show = useMemo(() => !!norm(ySqSumVal) && anyFilled([fYSq_DY]), [ySqSumVal, fYSq_DY]);

  const CheckCircle = ({ size = 22 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="correct" role="img">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#2ecc71" strokeWidth="3" />
      <path d="M6 12l4 4 8-8" fill="none" stroke="#2ecc71" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const StopSign = ({ size = 22 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="incorrect" role="img">
      <circle cx="12" cy="12" r="11" fill="#e74c3c" stroke="#c0392b" strokeWidth="2" />
      <rect x="5" y="10.5" width="14" height="3" fill="#ffffff" />
    </svg>
  );

  const allValuesOk = nOk && sxOk && syOk && sxyOk && sx2Ok && sy2Ok;
  const [plotVisible, setPlotVisible] = useState<boolean>(false);
  const [corrAnswer, setCorrAnswer] = useState<string>('');

  const cleanName = (s?: string) => (s || '').replace(/\s*\(x\)\s*/i, '').replace(/\s*\(y\)\s*/i, '').trim();
  const rMap: Record<string, Record<string, string>> = {
    'Consecutive Dry Days': { 'Water Service Interruptions': 'r=0.8509' },
    'Temperature Mean (°C)': { 'Electricity Demand (GWh)': 'r=0.6391', 'Tourist Arrivals': 'r=0.0801' },
    'Rainfall Total (mm)': { 'Dengue Cases': 'r=0.5900', 'Traffic Accidents': 'r=0.2152' },
    'ENSO Index (Niño 3.4)': { 'Banana Production (MT)': 'r=-0.5738' },
    'Wind Speed (m/s)': { 'Municipal Fish Catch (MT)': 'r=-0.3738' },
    'PM2.5 (μg/m³)': { 'Respiratory ER Visits': 'r=0.3402' },
    'Heat Index (°C)': { 'Heat-Related Illness Cases': 'r=0.1222' },
    'Sea Surface Temp (°C)': { 'Commercial Fish Catch (MT)': 'r=0.0502' },
  };
  const currentR = (() => {
    const v1 = cleanName(selectedDataset?.v1); const v2 = cleanName(selectedDataset?.v2);
    return (rMap[v1]?.[v2]) || 'r=—';
  })();

  const parseVal = (s: string) => Number((s || '').replace(/,/g, ''));
  const pointsForDataset = useMemo<[number, number][]>(() => {
    if (!selectedDataset) return [] as [number, number][];
    const xs = selectedDataset.x.map(parseVal);
    const ys = selectedDataset.y.map(parseVal);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = (v: number, min: number, max: number) => {
      if (!isFinite(v) || !isFinite(min) || !isFinite(max)) return 50;
      if (max === min) return 50;
      return ((v - min) / (max - min)) * 100;
    };
    return xs.map((vx, i) => [scale(vx, minX, maxX), scale(ys[i], minY, maxY)]);
  }, [selectedDataset]);

  const onSubmitP2A1 = () => {
    const norm = (s:string) => (s||'').trim().toLowerCase();
    const synonyms: Record<P2Pattern, string[]> = {
      positive: ['positive', 'positive correlation', 'pos', '+', 'increasing', 'upward', 'uptrend'],
      negative: ['negative', 'negative correlation', 'neg', '-', 'decreasing', 'downward', 'downtrend'],
      none: ['none', 'no correlation', 'no', 'zero', 'no pattern', 'random']
    };
    const expected: P2Pattern[] = ['positive','negative','negative','positive','none','positive'];
    const results = expected.map((exp, i) => {
      const a = norm(p2Answers[i] || '');
      return synonyms[exp].some(k => a.includes(k));
    });
    setP2Result(results);
    const score = results.filter(Boolean).length;
    const next = savePhase2Activity1(user.username, p2Answers, score);
    setState(next);
  };

  const persistP2Steps = () => {
    try {
      const steps: any = {
        n: nVal,
        xSum: xSumVal,
        ySum: ySumVal,
        xySum: xySumVal,
        xSqSum: xSqSumVal,
        ySqSum: ySqSumVal,
        // persist per-row arrays so Step 4/6/8 values are restored
        xyVals: xyVals,
        xSqVals: xSqVals,
        ySqVals: ySqVals,
        // persist formula / encoding fields from Card 10
        fNNum, fXYNum, fXNum, fYNum, fN_DX, fXSq_DX, fX_DX, fN_DY, fYSq_DY, fY_DY
      };
      savePhase2Activity2Steps(user.username, steps);
    } catch (e) {
      // ignore
    }
  };
  
  // Auto-save on unload or navigation away: persist intermediate steps and selected variable names
  useEffect(() => {
    const saveOnExit = () => {
      try {
        persistP2Steps();
        if (selectedDataset) {
          try {
            const raw = String(currentR || '');
            const m = raw.match(/r=([-+]?\d*\.?\d+)/);
            const rVal = m ? parseFloat(m[1]) : 0;
            savePhase2Activity2(user.username, { var1: selectedDataset.v1, var2: selectedDataset.v2, r: isNaN(rVal) ? 0 : rVal });
          } catch (e) {
            // ignore
          }
        }
        try { flushLesson1StateSync(user.username); } catch (e) { /* ignore */ }
      } catch (e) {
        // ignore
      }
    };

    window.addEventListener('beforeunload', saveOnExit);
    return () => {
      window.removeEventListener('beforeunload', saveOnExit);
      // also save on component unmount/navigation
      saveOnExit();
    };
  }, [nVal, xSumVal, ySumVal, xySumVal, xSqSumVal, ySqSumVal, selectedDataset, currentR, user.username]);
  
  return (
    <div className="portal-container">
      <header className="portal-header">
        <div className="header-left">
          <span className="header-badge badge--lesson1">📊</span>
          <div className="header-texts">
            <h1 className="portal-title">Lesson 1: Climate Correlation Analysis</h1>
            <p className="portal-subtitle">Student Section</p>
          </div>
        </div>
        <div className="header-right">
          <p className="welcome-text">Welcome, <strong>{displayName}</strong></p>
          <button className="logout-button" onClick={async () => {
            try {
              persistP2Steps();
              if (selectedDataset) {
                try {
                  const raw = String(currentR || '');
                  const m = raw.match(/r=([-+]?\d*\.?\d+)/);
                  const rVal = m ? parseFloat(m[1]) : 0;
                  savePhase2Activity2(user.username, { var1: selectedDataset.v1, var2: selectedDataset.v2, r: isNaN(rVal) ? 0 : rVal });
                } catch (e) {}
              }
              try { await awaitSaveLesson1State(user.username, getLesson1State(user.username)); } catch (e) {}
            } catch (e) {}
            onBack();
          }}>Back to Dashboard</button>
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
                  const fb = await acknowledgeFeedback(sid, 'lesson1');
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
          <ProgressBar progress={progressPct} />

          <div className="accordion">
            {/* Overview */}
            <div className="accordion-item overview">
              <div className="accordion-header" onClick={() => setOpen(o => ({ ...o, overview: !o.overview }))}>
                <h3>Mission Brief: Understanding Our Local Environment</h3>
                <span>{open.overview ? '▼' : '▶'}</span>
              </div>
              {open.overview && (
                <div className="accordion-content">
                  <div className="mission-brief">
                    <div className="intro-text">
                      <div className="hero-title">📚 LESSON 1: Climate Correlation Analysis</div>
                      <div className="hero-subtitle">AKA "Does Rain Actually Follow the Heat, or Is Lolo Just Making Things Up?"</div>
                        <div className="gap-2" />
                      <p>Hey there, future data detectives! 👋</p>
                      <p>
                        Ever wonder if two things are secretly connected? Like, does it always rain harder when it gets super hot? Or do mango trees produce less when humidity goes crazy?
                        Today, you&apos;re becoming a correlation detective! We&apos;re diving into Davao&apos;s climate data to uncover hidden relationships that could help solve real environmental problems in our region.
                      </p>
                        <p>Grab your calculators and your curiosity—let&apos;s find out what the numbers are trying to tell us! 🔍</p>
                        <div className="gap-2" />
                    </div>

                    <div className="brief-grid two-up">
                      <div className="brief-card">
                        <div className="card-title">What You Will Master:</div>
                        <ul>
                          <li>Calculate Pearson&apos;s sample correlation coefficient (because saying "r" sounds way cooler than "that number thing").</li>
                          <li>Solve problems involving correlation analysis (translation: become a correlation wizard).</li>
                        </ul>
                      </div>
                      <div className="brief-card">
                        <div className="card-title">Your Mission:</div>
                        <ul>
                          <li>Explain correlation like you&apos;re teaching your younger sibling—what does it mean when two climate variables are BFFs or mortal enemies?</li>
                          <li>Calculate Pearson&apos;s r without breaking your calculator (spreadsheets are your friend!).</li>
                          <li>Analyze real scenarios and drop recommendations that would make local officials say, "Wow, these kids know their stuff!"</li>
                        </ul>
                      </div>
                      <div className="brief-card epic-card">
                        <div className="card-title project-title">Your Epic Project: 🎯</div>
                        <div className="card-subtitle project-center">"Understanding Our Local Environment" — Climate Correlation Analysis Project</div>
                        <p>
                          You will investigate how two climate variables in Davao Region are secretly related (or not!), then present evidence so good that actual stakeholders will want to listen.
                          Think: temperature vs. rainfall, humidity vs. crop yield—whatever keeps you up at night wondering.
                        </p>
                        <p className="time-budget-text">⏰ Time Budget: 4 hours <span className="time-note"><em>(less time than binge-watching one season of anything)</em></span></p>
                      </div>
                    </div>

                    <div className="closing-text">
                      <h4 className="body-heading">Ready to Start This Adventure?</h4>
                      <p>
                        By the end of this lesson, you won&apos;t just understand correlation—you&apos;ll wield it like a climate superhero. You&apos;ll look at two sets of data and immediately see if they&apos;re dancing together or completely ignoring each other. You&apos;ll make your community better with nothing but numbers, spreadsheets, and your brilliant brain.
                      </p>
                      <div className="gap-2" />
                      <p><strong>So, what are you waiting for?</strong></p>
                      <p>
                        Your journey begins now with Phase 1. Let&apos;s find out what Davao&apos;s climate is really trying to tell us... and maybe prove lolo right in the process! 🙌➡️📊➡️💡
                      </p>
                      <div className="closing-cta">
                        <p><em>Click ahead to Phase 1, where the real detective work begins! 🔍</em></p>
                        <div className="section-actions start-row">
                          <button className="save-btn" onClick={() => { unlockPhase(1); setOpen(o => ({ ...o, overview: false, p1: true })); }}>Start First Mission</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Phase 1 */}
            <div className="accordion-item phase1">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p1: !o.p1 })); setSubOpen({ a1:false, a2:false, a3:false, a4:false }); }}>
                <h3>Phase 1: Launch the Investigation</h3>
                <span className="right-indicator">{getPhase1Progress(state) >= 25 && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{open.p1 ? '▼' : '▶'}</span></span>
              </div>
              {open.p1 && (
                <div className="accordion-content">
                  <div className="sub-accordion">
                  {/* Accordion 1: Activity 1 */}
                  <div className="sub-item">
                    <div className="sub-header green" onClick={()=> setSubOpen(s => ({ ...s, a1: !s.a1 }))}><span className="label"><span className="icon">🔎</span> <b>Activity 1: Explore the Data</b></span><span className="right-indicator">{(state.phaseData as any)[1]?.a1Done && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{subOpen.a1 ? '−' : '+'}</span></span></div>
                    <div className="sub-content" style={{display: subOpen.a1 ? 'block' : 'none'}}>
                  <div className="card spacious activity-card">
                    <div className="info-cards">
                      <div className="info-card">
                        <div className="icon-label"><span className="icon">🧭</span> <b>What you will do:</b></div>
                        <p>Start by exploring real climate and environmental data. You’ll see a bar graph and several filter buttons on the screen.</p>
                      </div>
                      <div className="info-card">
                        <div className="icon-label"><span className="icon">🛠️</span> <b>How to do it:</b></div>
                        <ol style={{ paddingLeft: 22 }}>
                          <li>Click the filter buttons to change what data appears on the bar graph.</li>
                          <li>Observe how the values change when you select different options.</li>
                          <li>Take note of patterns, increases, decreases, or anything that catches your attention.</li>
                        </ol>
                      </div>
                    </div>
                    <div className="gap-3">
                      <div className="input-row">
                        <label><b>Year</b></label>
                        <select value={(state.phaseData as any)[1]?.year ?? 'All'} onChange={(e)=> savePhaseData(1, { year: e.target.value === 'All' ? 'All' : Number(e.target.value) as Year })}>
                          <option value={'All'}>All</option>
                          <option value={2021}>2021</option>
                          <option value={2022}>2022</option>
                          <option value={2023}>2023</option>
                          <option value={2024}>2024</option>
                        </select>
                        <label className="icon-label" style={{ fontSize: '1.05rem', fontWeight: 700 }}><span className="legend-dot" style={{ background:'var(--plot-primary)', width:14, height:14 }}></span><b>Climate Data</b></label>
                        <select value={(state.phaseData as any)[1]?.climateKey || climateLabels[0]} onChange={(e)=> savePhaseData(1, { climateKey: e.target.value })}>
                          {([...climateLabels].map(String).sort((a,b)=> a.localeCompare(b))).map(k => (<option key={k} value={k}>{k}</option>))}
                        </select>
                        <label className="icon-label" style={{ fontSize: '1.05rem', fontWeight: 700 }}><span className="legend-dot" style={{ background:'var(--plot-secondary)', width:14, height:14 }}></span><b>Societal Data</b></label>
                        <select value={(state.phaseData as any)[1]?.socKey || societalLabels[0]} onChange={(e)=> savePhaseData(1, { socKey: e.target.value })}>
                          {([...societalLabels].map(String).sort((a,b)=> a.localeCompare(b))).map(k => (<option key={k} value={k}>{k}</option>))}
                        </select>
                      </div>
                      <div className="var-def">
                        {(() => {
                          const ck = ((state.phaseData as any)[1]?.climateKey || climateLabels[0]) as string;
                          return (
                            <div>
                              <div><b>{ck}</b></div>
                              <div>Definition: {getLabelDef(ck)}</div>
                            </div>
                          );
                        })()}
                        {(() => {
                          const sk = ((state.phaseData as any)[1]?.socKey || societalLabels[0]) as string;
                          return (
                            <div style={{ marginTop: 6 }}>
                              <div><b>{sk}</b></div>
                              <div>Definition: {getLabelDef(sk)}</div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="gap-4" />
                      {/* Graph */}
                      {(() => {
                        const yearSel = (state.phaseData as any)[1]?.year ?? 'All';
                        const ck = ((state.phaseData as any)[1]?.climateKey || climateLabels[0]) as keyof import('../../services/lesson1Phase1Data').ClimateRecord;
                        const sk = ((state.phaseData as any)[1]?.socKey || societalLabels[0]) as keyof import('../../services/lesson1Phase1Data').SocietalRecord;
                        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        const seriesA = yearSel === 'All'
                          ? ([2021,2022,2023,2024] as Year[]).reduce((acc, y) => {
                              const arr = getMonthlySeriesForClimate(y, ck);
                              return acc.map((v,i)=> v + arr[i]);
                            }, Array(12).fill(0)).map(v=> v / 4)
                          : getMonthlySeriesForClimate(yearSel as Year, ck);
                        const seriesB = yearSel === 'All'
                          ? ([2021,2022,2023,2024] as Year[]).reduce((acc, y) => {
                              const arr = getMonthlySeriesForSocietal(y, sk);
                              return acc.map((v,i)=> v + arr[i]);
                            }, Array(12).fill(0)).map(v=> v / 4)
                          : getMonthlySeriesForSocietal(yearSel as Year, sk);
                        return <BarDualChart months={months} seriesA={seriesA} seriesB={seriesB} width={1100} height={420} barWidthScale={0.8} colorA={"var(--plot-primary)"} colorB={"var(--plot-secondary)"} valueColorA={"var(--plot-secondary)"} valueColorB={"var(--plot-primary)"} showValues={true} />;
                      })()}
                      <div className="gap-3"><b>Think about this:</b></div>
                      <p>What does the data tell you? Which data sets seem connected or related?</p>
                      <div className="section-actions">
                        <button className="mark-btn" onClick={()=>{ const next = setPhase1ActivityFlag(user.username, 'a1Done', true); setState(next); setSubOpen({ a1: false, a2: true, a3: false, a4: false }); }} disabled={!!(state.phaseData as any)[1]?.a1Done}>Mark as Done</button>
                      </div>
                    </div>
                  </div>
                    </div>
                  </div>

                  {/* Accordion 2: Activity 2 */}
                  <div className="sub-item">
                    <div className="sub-header green" onClick={()=> setSubOpen(s => ({ ...s, a2: !s.a2 }))}><span className="label"><span className="icon">🎬</span> <b>Activity 2: Watch and Check Your Understanding</b></span><span className="right-indicator">{(state.phaseData as any)[1]?.a2Done && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{subOpen.a2 ? '−' : '+'}</span></span></div>
                    <div className="sub-content" style={{display: subOpen.a2 ? 'block' : 'none'}}>
                    <div className="card spacious activity-card">
                    <div className="info-cards">
                      <div className="info-card">
                        <div className="icon-label"><span className="icon">🧭</span> <b>What you will do:</b></div>
                        <p>You will watch a short video that explains correlation.</p>
                      </div>
                      <div className="info-card">
                        <div className="icon-label"><span className="icon">🛠️</span> <b>How to do it:</b></div>
                        <p>Watch the video carefully. You can pause the video at certain points to answer the checkpoint questions on the left. Replay the video until you finish answering all the questions.</p>
                      </div>
                    </div>
                    <div className="input-row gap-3" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                      <div style={{ overflow: 'hidden', borderRadius: 12 }}>
                        <iframe src="https://www.youtube.com/embed/k7IctLRiZmo" title="Pearson r" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ width: '100%', height: 480, border: 'none', display: 'block' }} />
                      </div>
                      <div className="gap-3" />
                      <div className="gap-3" />
                      <div>
                        <h4>Video Checkpoints:</h4>
                        {renderActivity2Questions()}
                        <div className="section-actions" style={{ justifyContent: 'flex-start' }}><button className="complete-check-btn" onClick={onCompleteCheckpoint} disabled={!a2AllAnswered || a2Submitted}>Submit Answer</button></div>
                        {a2Submitted && (
                          <div className="phase1-complete-banner" style={{ textAlign:'left' }}>Well done! You may now close this activity, and open the next activity.</div>
                        )}
                      </div>
                    </div>
                  </div>
                    </div>
                  </div>

                  {/* Accordion 3: Activity 3 */}
                  <div className="sub-item">
                    <div className="sub-header green" onClick={()=> setSubOpen(s => ({ ...s, a3: !s.a3 }))}><span className="label"><span className="icon">🧩</span> <b>Activity 3: Choose a Possible Correlation</b></span><span className="right-indicator">{(state.phaseData as any)[1]?.a3Done && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{subOpen.a3 ? '−' : '+'}</span></span></div>
                    <div className="sub-content" style={{display: subOpen.a3 ? 'block' : 'none'}}>
                    <div className="card spacious activity-card">
                    <div className="info-cards">
                      <div className="info-card">
                        <div className="icon-label"><span className="icon">🧭</span> <b>What you will do:</b></div>
                        <p>Now that you’ve explored the data and learned about correlation, it’s time to make a decision.</p>
                        <p>Don't worry, you're not alone in this.</p>
                        <p>You will brainstorm with your assigned group members.</p>
                      </div>
                      <div className="info-card">
                        <div className="icon-label"><span className="icon">🛠️</span> <b>How to do it:</b></div>
                        <ol style={{ paddingLeft: 22 }}>
                          <li>Choose one pair of variables that you think may have a possible correlation.</li>
                          <li>Use the drop-down buttons to select your chosen variable pair.</li>
                          <li>In the encoding field, explain why you think these two variables might be related.</li>
                        </ol>
                      </div>
                    </div>
                    <div className="gap-3 icon-label"><span className="icon">🔔</span> <b>Reminder:</b></div>
                    <p>There is no single “correct” answer. What matters is how clearly you explain your reasoning using what you observed.</p>
                    <div className="gap-4" />
                    <div className="gap-4" />
                    <div className="gap-4" />
                    <div className="gap-4" />
                    <div className="gap-3 input-row">
                      <label style={{ color: '#0EA5E9', fontWeight: 700 }}>Variable 1</label>
                      <select value={(state.phaseData as any)[1]?.a3Var1 || ''} onChange={(e)=> savePhaseData(1, { a3Var1: e.target.value })} disabled={!!(state.phaseData as any)[1]?.a3Done}>
                        <option value="">Select</option>
                        {[...climateLabels, ...societalLabels].map(String).sort((a,b)=>a.localeCompare(b)).map(k => (<option key={k} value={k}>{k}</option>))}
                      </select>
                      <label style={{ color: '#EF4444', fontWeight: 700 }}>Variable 2</label>
                      <select value={(state.phaseData as any)[1]?.a3Var2 || ''} onChange={(e)=> savePhaseData(1, { a3Var2: e.target.value })} disabled={!!(state.phaseData as any)[1]?.a3Done}>
                        <option value="">Select</option>
                        {[...climateLabels, ...societalLabels].map(String).sort((a,b)=>a.localeCompare(b)).map(k => (<option key={k} value={k}>{k}</option>))}
                      </select>
                    </div>
                    <div className="gap-3">
                      <div><b>Reason:</b> <span className="gray-italic">You may use any language (English or Filipino) or dialect (Bisaya) in encoding your reasons.</span></div>
                      <textarea rows={3} style={{ width: '100%' }} value={(state.phaseData as any)[1]?.a3Reason || ''} onChange={(e)=> savePhaseData(1, { a3Reason: e.target.value })} disabled={!!(state.phaseData as any)[1]?.a3Done} />
                    </div>
                    <div className="section-actions"><button className="mark-btn" onClick={onActivity3Done} disabled={!a3Ready || !!p1Data.a3Done}>Mark as Done</button></div>
                    {(state.phaseData as any)[1]?.a3Done && (<div className="phase2-complete-banner gap-3">Well done! You may now open the next activity.</div>)}
                  </div>
                    </div>
                  </div>

                  {/* Accordion 4: Activity 4 */}
                  <div className="sub-item">
                    <div className="sub-header green" onClick={()=> setSubOpen(s => ({ ...s, a4: !s.a4 }))}><span className="label"><span className="icon">✍️</span> <b>Activity 4: Write Your Research Question</b></span><span className="right-indicator">{(state.phaseData as any)[1]?.a4bFinalized && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{subOpen.a4 ? '−' : '+'}</span></span></div>
                    <div className="sub-content" style={{display: subOpen.a4 ? 'block' : 'none'}}>
                    <div className="card spacious activity-card">
                    <div className="info-cards">
                      <div className="info-card">
                        <div className="icon-label"><span className="icon">🧭</span> <b>What you will do:</b></div>
                        <p>You will now turn your idea into a research question.</p>
                        <p>You will brainstorm again with your group members to come up with the research question.</p>
                      </div>
                      <div className="info-card">
                        <div className="icon-label"><span className="icon">🛠️</span> <b>How to do it:</b></div>
                        <ol style={{ paddingLeft:22 }}>
                          <li>Look at the sample research question provided as a guide.</li>
                          <li>In the first encoding field, type your first version of your research question.</li>
                          <li>Submit it and wait for your teacher’s feedback.</li>
                          <li>Once you receive feedback, follow the instructions given by your teacher.</li>
                          <li>Encode your revised or improved version in the second encoding field.</li>
                        </ol>
                      </div>
                    </div>
                    <div className="gap-3 icon-label"><span className="icon">🔔</span> <b>Reminder:</b></div>
                    <p>Feedback is part of the process—use it to strengthen your question.</p>
                    <div className="info-card" style={{ marginTop: 8 }}>
                      <div><b>Question Template:</b></div>
                      <div className="gap-2"><em>"Is there a correlation between [Variable 1] and [Variable 2] in Davao Region, and what does this mean for [specific local concern]?"</em></div>
                      <div className="gap-3"><b>Sample Question:</b></div>
                      <div className="gap-2"><em>“Is there a correlation between Air Quality Index and Respiratory Cases in Davao Region, and what does this mean for the residents and health professionals?”</em></div>
                    </div>
                    <div className="gap-3">
                      <div><b>Now it’s your turn. Encode your question here:</b></div>
                      <textarea rows={3} style={{ width: '100%' }} value={(state.phaseData as any)[1]?.a4aQuestion || ''} onChange={(e)=> savePhaseData(1, { a4aQuestion: e.target.value })} disabled={!!(p1Data.a4aSubmitted)} />
                    </div>
                    <div className="section-actions" style={{ justifyContent:'flex-end' }}><button className="submit-btn" onClick={onSubmitQuestion} disabled={!canSubmitQuestion || !!p1Data.a4aSubmitted}>Submit Question</button></div>
                    <div className="gap-3 feedback-box" style={{ width: '100%' }}>
                      <b>Feedback Box</b>
                      <div className="gap-2">{activity4Feedback || 'Awaiting teacher feedback...'}</div>
                    </div>
                    <div className="gap-3">
                      <div><b>Now, encode here your revised question based on your teacher’s feedback.</b></div>
                      <textarea rows={3} style={{ width: '100%' }} value={(state.phaseData as any)[1]?.a4bFinalQuestion || ''} onChange={(e)=> savePhaseData(1, { a4bFinalQuestion: e.target.value })} disabled={!activity4Feedback || !!((state.phaseData as any)[1]?.a4bFinalized)} />
                    </div>
                    <div className="section-actions" style={{ justifyContent:'flex-end' }}><button className="finalize-btn" onClick={onFinalizeQuestion} disabled={!canFinalize || !!p1Data.a4bFinalized}>Finalize Question</button></div>
                  </div>
                    </div>
                  </div>
                  </div>
                </div>
              )}
            </div>

            {/* Phase 2 */}
            <div className="accordion-item phase2">
              <div className="accordion-header" onClick={() => { setOpen(o => ({ ...o, p2: !o.p2 })); setP2SubOpen({ a1:false,a2:false,a3:false,a4:false }); }}>
                <h3>Phase 2: Decode the Data</h3>
                <span className="right-indicator">{state.completedPhases.includes(2) && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{open.p2 ? '▼' : '▶'}</span></span>
              </div>
              {open.p2 && (
                <div className="accordion-content">
                  <div className="sub-accordion">
                    {/* Phase 2 - Activity 1 */}
                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=>{ const prev = window.pageYOffset || 0; setP2SubOpen(s=>({...s, a1: !s.a1})); setTimeout(()=> { try { window.scrollTo({ top: prev, behavior: 'auto' }); } catch (err) {} }, 10); }}><span className="label"><span className="icon">📈</span> <b>Activity 1: Understand Scatter Plots</b></span><span className="right-indicator">{(state.phaseData as any)[2]?.a1Done && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{p2SubOpen.a1 ? '−' : '+'}</span></span></div>
                      <div className="sub-content" style={{display: p2SubOpen.a1 ? 'block' : 'none'}}>
                        <div className="info-cards">
                          <div className="card">
                            <div className="icon-label"><span className="icon">🧭</span> <b>What you will do:</b></div>
                            <p>You will learn what a scatter plot is and how to recognize different patterns.</p>
                          </div>
                          <div className="card">
                            <div className="icon-label"><span className="icon">🛠️</span> <b>How to do it:</b></div>
                            <ol style={{ paddingLeft:22 }}>
                              <li>Read the short explanation of scatter plots and their common patterns.</li>
                              <li>Study the visual guides that show what each pattern looks like.</li>
                              <li>Practice by identifying the pattern shown in each sample scatter plot.</li>
                            </ol>
                            <div className="gap-3 icon-label"><span className="icon">💡</span> <b>Tip:</b> Focus on the direction and strength of the pattern, not individual points.</div>
                          </div>
                        </div>

                        {/* Card row: definition & patterns */}
                        <div className="cards-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                          <div className="card">
                            <h4>What is Scatter Plot?</h4>
                            <p>A scatter plot is a graph that shows how two numerical variables relate by plotting points (x, y). Patterns in the points can suggest whether the variables move together (positive), move in opposite directions (negative), or do not show a consistent relationship (no correlation).</p>
                          </div>
                          <div className="card">
                            <h4>Scatter Plot Patterns</h4>
                            <ul>
                              <li><b>Positive correlation</b>: points trend upward — as X increases, Y tends to increase.</li>
                              <li><b>Negative correlation</b>: points trend downward — as X increases, Y tends to decrease.</li>
                              <li><b>No correlation</b>: points are scattered without a clear upward or downward trend.</li>
                            </ul>
                          </div>
                        </div>

                        <div className="gap-4" />
                        {/* Card 3: visual pattern guides */}
                          <div className="card">
                            <h4>Visual Pattern Guide</h4>
                            <div className="cards-row" style={{ gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'start' }}>
                              {visualGuides.map((guide, i) => (
                                <div key={i} className="card" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                                  <div style={{ fontWeight: 700 }}>{guide.label}</div>
                                  <img src={guide.img} alt={guide.label} style={{ width: '100%', maxWidth: 240, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }} />
                                </div>
                              ))}
                            </div>
                          </div>

                        <div className="gap-4" />
                        {/* Card 4: split layout selector + plot */}
                        <div className="card" style={{ display:'grid', gridTemplateColumns:'1fr', gap:16, alignItems:'start' }}>
                          <div style={{ fontWeight: 800, textAlign: 'left', marginBottom: 8 }}>
                            Let's try identifying scatter plot patterns using actual climate data.
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 300px)', gap: 12, justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifySelf: 'start' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, textAlign: 'left' }}>Temperature Ave (°C) &nbsp;<br/>Sea Temperature Ave (°C)</div>
                              <img src={`${import.meta.env.BASE_URL}plot1_temp_sea_temp.png`} alt="plot1" style={{ width: 300, height: 300, objectFit: 'cover', border: '1px solid #e5e7eb', borderRadius: 12 }} />
                              <div style={{ height: 8 }} />
                              <input
                                placeholder="pattern (positive/negative/none)"
                                value={p2Answers[0] || ''}
                                onChange={(e) => { const next = [...p2Answers]; next[0] = e.target.value; setP2Answers(next); }}
                                style={{ width: 300, height: 36, textAlign: 'center', borderRadius: 8, border: '1px solid #ccc', padding: '0 8px' }}
                                disabled={!!(state.phaseData as any)[2]?.a1Done}
                              />
                              {p2Result && (<div style={{ textAlign: 'center', fontSize: 18, marginTop: 6 }}>{p2Result[0] ? '✅' : '⭕'}</div>)}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifySelf: 'center' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, textAlign: 'left' }}>Relative Humidity (%) &nbsp;<br/>Temperature Max (°C)</div>
                              <img src={`${import.meta.env.BASE_URL}plot2_humidity_temp_max.png`} alt="plot2" style={{ width: 300, height: 300, objectFit: 'cover', border: '1px solid #e5e7eb', borderRadius: 12 }} />
                              <div style={{ height: 8 }} />
                              <input
                                placeholder="pattern (positive/negative/none)"
                                value={p2Answers[1] || ''}
                                onChange={(e) => { const next = [...p2Answers]; next[1] = e.target.value; setP2Answers(next); }}
                                style={{ width: 300, height: 36, textAlign: 'center', borderRadius: 8, border: '1px solid #ccc', padding: '0 8px' }}
                                disabled={!!(state.phaseData as any)[2]?.a1Done}
                              />
                              {p2Result && (<div style={{ textAlign: 'center', fontSize: 18, marginTop: 6 }}>{p2Result[1] ? '✅' : '⭕'}</div>)}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifySelf: 'end' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, textAlign: 'left' }}>Relative Humidity (%) &nbsp;<br/>Electricity Consumption (GWh)</div>
                              <img src={`${import.meta.env.BASE_URL}plot3_humidity_electricity.png`} alt="plot3" style={{ width: 300, height: 300, objectFit: 'cover', border: '1px solid #e5e7eb', borderRadius: 12 }} />
                              <div style={{ height: 8 }} />
                              <input
                                placeholder="pattern (positive/negative/none)"
                                value={p2Answers[2] || ''}
                                onChange={(e) => { const next = [...p2Answers]; next[2] = e.target.value; setP2Answers(next); }}
                                style={{ width: 300, height: 36, textAlign: 'center', borderRadius: 8, border: '1px solid #ccc', padding: '0 8px' }}
                                disabled={!!(state.phaseData as any)[2]?.a1Done}
                              />
                              {p2Result && (<div style={{ textAlign: 'center', fontSize: 18, marginTop: 6 }}>{p2Result[2] ? '✅' : '⭕'}</div>)}
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 300px)', gap: 12, justifyContent: 'space-between', width: '100%', marginBottom: 24 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifySelf: 'start' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, textAlign: 'left' }}>Air Quality Index &nbsp;<br/>PM10 (μg/m³)</div>
                              <img src={`${import.meta.env.BASE_URL}plot4_aqi_pm10.png`} alt="plot4" style={{ width: 300, height: 300, objectFit: 'cover', border: '1px solid #e5e7eb', borderRadius: 12 }} />
                              <div style={{ height: 8 }} />
                              <input
                                placeholder="pattern (positive/negative/none)"
                                value={p2Answers[3] || ''}
                                onChange={(e) => { const next = [...p2Answers]; next[3] = e.target.value; setP2Answers(next); }}
                                style={{ width: 300, height: 36, textAlign: 'center', borderRadius: 8, border: '1px solid #ccc', padding: '0 8px' }}
                                disabled={!!(state.phaseData as any)[2]?.a1Done}
                              />
                              {p2Result && (<div style={{ textAlign: 'center', fontSize: 18, marginTop: 6 }}>{p2Result[3] ? '✅' : '⭕'}</div>)}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifySelf: 'center' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, textAlign: 'left' }}>Wind Speed (km/h) &nbsp;<br/>Daily Solar Energy Production (kWh)</div>
                              <img src={`${import.meta.env.BASE_URL}plot5_wind_solar.png`} alt="plot5" style={{ width: 300, height: 300, objectFit: 'cover', border: '1px solid #e5e7eb', borderRadius: 12 }} />
                              <div style={{ height: 8 }} />
                              <input
                                placeholder="pattern (positive/negative/none)"
                                value={p2Answers[4] || ''}
                                onChange={(e) => { const next = [...p2Answers]; next[4] = e.target.value; setP2Answers(next); }}
                                style={{ width: 300, height: 36, textAlign: 'center', borderRadius: 8, border: '1px solid #ccc', padding: '0 8px' }}
                                disabled={!!(state.phaseData as any)[2]?.a1Done}
                              />
                              {p2Result && (<div style={{ textAlign: 'center', fontSize: 18, marginTop: 6 }}>{p2Result[4] ? '✅' : '⭕'}</div>)}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifySelf: 'end' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, textAlign: 'left' }}>Rainfall (mm) &nbsp;<br/>Dengue Cases</div>
                              <img src={`${import.meta.env.BASE_URL}plot6_rainfall_dengue.png`} alt="plot6" style={{ width: 300, height: 300, objectFit: 'cover', border: '1px solid #e5e7eb', borderRadius: 12 }} />
                              <div style={{ height: 8 }} />
                              <input
                                placeholder="pattern (positive/negative/none)"
                                value={p2Answers[5] || ''}
                                onChange={(e) => { const next = [...p2Answers]; next[5] = e.target.value; setP2Answers(next); }}
                                style={{ width: 300, height: 36, textAlign: 'center', borderRadius: 8, border: '1px solid #ccc', padding: '0 8px' }}
                                disabled={!!(state.phaseData as any)[2]?.a1Done}
                              />
                              {p2Result && (<div style={{ textAlign: 'center', fontSize: 18, marginTop: 6 }}>{p2Result[5] ? '✅' : '⭕'}</div>)}
                            </div>
                          </div>

                          <div style={{ marginTop: 4 }}>
                            <div ref={rightListRef} />
                            <div className="section-actions"><button className="complete-check-btn" onClick={onSubmitP2A1} disabled={!p2AllAnswered || (state.phaseData as any)[2]?.a1Done}>Submit Answer</button></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Phase 2 - Activity 2 */}
                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2SubOpen(s=>({...s, a2: !s.a2}))}><span className="label"><span className="icon">🧪</span> <b>Activity 2: Guided Pearson r Practice</b></span><span className="right-indicator">{(state.phaseData as any)[2]?.a2Done && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{p2SubOpen.a2 ? '−' : '+'}</span></span></div>
                      <div className="sub-content" style={{display: p2SubOpen.a2 ? 'block' : 'none'}}>
                        <div className="card spacious activity-card">
                          <div className="info-cards">
                            <div className="card">
                              <div className="icon-label"><span className="icon">🧭</span> <b>What you will do:</b></div>
                              <p>You will calculate Pearson’s correlation coefficient (r) using a guided, hands-on process.</p>
                            </div>
                            <div className="card">
                              <div className="icon-label"><span className="icon">🛠️</span> <b>How to do it:</b></div>
                              <ul style={{ paddingLeft:22 }}>
                                <li>Follow the step-by-step interactive guide on the screen.</li>
                                <li>Complete each step before moving to the next one.</li>
                                <li>Enter values where prompted and observe how each step affects the final result.</li>
                              </ul>
                              <p style={{ marginTop: 14 }}>
                                <span className="icon">⏳</span> <b>Reminder:</b><br />
                                Take your time. Understanding the process is more important than speed.
                              </p>
                            </div>
                          </div>
                          <div className="card" style={{ marginTop: 12 }}>
                            <h4>Step-by-Step Process in Solving Pearson Correlation Coefficient</h4>
                            <p style={{ marginTop: 24, fontWeight: 700 }}>
                              Look at the last number of your account password. Then, click the button below that matches that number.
                            </p>
                            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                                {[0,1,2,3,4].map(n => {
                                const disabled = a2Done || (p2A2Locked && p2A2Sel !== n);
                                return (
                                  <button key={n} type="button" disabled={disabled} onClick={()=>{ setP2A2Sel(n); setP2A2Locked(true); try { const ds = p2A2Datasets[n]; savePhase2Activity2(user.username, { var1: ds.v1, var2: ds.v2, r: 0 }); } catch(e){} }} style={{
                                    height: 40,
                                    borderRadius: 8,
                                    background: disabled ? 'var(--phase2-accent-light, #d7b9ea)' : 'var(--phase2-accent, #8e44ad)',
                                    color: '#fff',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: 18,
                                    cursor: disabled ? 'not-allowed' : 'pointer'
                                  }}>{n}</button>
                                );
                              })}
                            </div>
                            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                              {[5,6,7,8,9].map(n => {
                                const disabled = a2Done || (p2A2Locked && p2A2Sel !== n);
                                return (
                                  <button key={n} type="button" disabled={disabled} onClick={()=>{ setP2A2Sel(n); setP2A2Locked(true); try { const ds = p2A2Datasets[n]; savePhase2Activity2(user.username, { var1: ds.v1, var2: ds.v2, r: 0 }); } catch(e){} }} style={{
                                    height: 40,
                                    borderRadius: 8,
                                    background: disabled ? 'var(--phase2-accent-light, #d7b9ea)' : 'var(--phase2-accent, #8e44ad)',
                                    color: '#fff',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: 18,
                                    cursor: disabled ? 'not-allowed' : 'pointer'
                                  }}>{n}</button>
                                );
                              })}
                            </div>
                            <p style={{ marginTop: 36, fontWeight: 700 }}>
                              Now, look at the table. Data was generated under Column 2 and 3 for you. <br />
                              Click on each button around the table to help you complete the table. Start with Step 1.
                            </p>
                            <div style={{ marginTop: 48 }}>
                              <div ref={tableRef} style={{ position: 'relative' }}>
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                                <colgroup>
                                  <col style={{ width: '16.66%' }} />
                                  <col style={{ width: '16.66%' }} />
                                  <col style={{ width: '16.66%' }} />
                                  <col style={{ width: '16.66%' }} />
                                  <col style={{ width: '16.66%' }} />
                                  <col style={{ width: '16.66%' }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>Month</th>
                                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{selectedDataset ? selectedDataset.v1 : '[Variable 1 Name] (X)'}</th>
                                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{selectedDataset ? selectedDataset.v2 : '[Variable 2 Name] (Y)'}</th>
                                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>xy</th>
                                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>x²</th>
                                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>y²</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Array.from({ length: 9 }).map((_, i) => {
                                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'];
                                    const isMonthRow = i < months.length;
                                    const monthLabel = isMonthRow ? `${months[i]} 2021` : '';
                                    return (
                                      <tr key={i}>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', fontWeight: 700, textAlign: 'center', height: 50 }}>{i === 8 ? (nVal ? (<span style={{ fontWeight: 700 }}>n = {nVal}</span>) : '') : monthLabel}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12), inset 0 -1px 2px rgba(255,255,255,0.5)', textAlign: 'center', height: 50 }}>{i === 8 ? (xSumVal ? (<span style={{ fontWeight: 700 }}>Σx = {xSumVal}</span>) : '') : (selectedDataset ? selectedDataset.x[i] : '')}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12), inset 0 -1px 2px rgba(255,255,255,0.5)', textAlign: 'center', height: 50 }}>{i === 8 ? (ySumVal ? (<span style={{ fontWeight: 700 }}>Σy = {ySumVal}</span>) : '') : (selectedDataset ? selectedDataset.y[i] : '')}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12), inset 0 -1px 2px rgba(255,255,255,0.5)', textAlign: 'center', height: 50 }}>{i === 8 ? (xySumVal ? (<span style={{ fontWeight: 700 }}>Σxy = {xySumVal}</span>) : '') : (xyVals[i] ?? '')}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12), inset 0 -1px 2px rgba(255,255,255,0.5)', textAlign: 'center', height: 50 }}>{i === 8 ? (xSqSumVal ? (<span style={{ fontWeight: 700 }}>Σx² = {xSqSumVal}</span>) : '') : (xSqVals[i] ?? '')}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12), inset 0 -1px 2px rgba(255,255,255,0.5)', textAlign: 'center', height: 50 }}>{i === 8 ? (ySqSumVal ? (<span style={{ fontWeight: 700 }}>Σy² = {ySqSumVal}</span>) : '') : (ySqVals[i] ?? '')}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                </table>
                                {/* Step buttons centered per column */}
                              {[
                                { label: 'Step 4', left: '58.33%', step: 4 },
                                { label: 'Step 6', left: '75%', step: 6 },
                                { label: 'Step 8', left: '91.66%', step: 8 },
                              ].map(({ label, left, step }) => (
                                <StepButton key={label} label={label} onClick={() => showStep(step)} style={{ position: 'absolute', top: -34, left }} />
                              ))}
                              {[
                                { label: 'Step 1', left: '8.33%', step: 1 },
                                { label: 'Step 2', left: '25%', step: 2 },
                                { label: 'Step 3', left: '41.66%', step: 3 },
                                { label: 'Step 5', left: '58.33%', step: 5 },
                                { label: 'Step 7', left: '75%', step: 7 },
                                { label: 'Step 9', left: '91.66%', step: 9 },
                              ].map(({ label, left, step }) => (
                                <StepButton key={label} label={label} onClick={() => showStep(step)} style={{ position: 'absolute', bottom: -34, left }} />
                              ))}
                              </div>
                              <div style={{ marginTop: 72 }} />
                              <div style={{ marginTop: 36, display: 'flex', justifyContent: 'center' }}>
                                <div>
                                  <div style={{ fontWeight: 700 }}>Pearson Correlation Coefficient</div>
                                  <div style={{ marginTop: 12, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 12, padding: '16px 24px', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <span style={{ fontWeight: 700, fontSize: 22 }}>r =</span>
                                      <div style={{ display: 'inline-block', textAlign: 'center' }}>
                                        <div style={{ fontSize: 20, fontWeight: 600 }}>n(Σxy) − (Σx)(Σy)</div>
                                        <div style={{ borderTop: '2px solid #333', margin: '6px 0' }} />
                                        <div style={{ fontSize: 20, fontWeight: 600 }}>√[nΣx² − (Σx)²] [nΣy² − (Σy)²]</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                                <StepButton label="Step 10" onClick={() => showStep(10)} />
                              </div>
                              <div style={{ marginTop: 24, marginBottom: 24 }}>
                                <div style={{ display: 'grid', gap: 16 }}>
                                  {[
                                    'Step 1: Finding the Value of n',
                                    'Step 2: Summation of X (ΣX)',
                                    'Step 3: Summation of Y',
                                    'Step 4: Solving XY values',
                                    'Step 5: Summation of XY',
                                    'Step 6: Solving for X² values',
                                    'Step 7: Summation of X²',
                                    'Step 8: Solving for Y² values',
                                    'Step 9: Summation of Y²',
                                    'Step 10: Substituting all values in the Pearson Coefficient Correlation Formula'
                                  ].map((title, i) => (
                                    <div key={i} className="card" ref={(el)=>{ stepCardRefs.current[i] = el; }} style={{
                                      border: '2px solid var(--phase2-accent, #8e44ad)',
                                      background: 'var(--phase2-surface, #f9f2ff)',
                                      borderRadius: 12,
                                      padding: '14px 16px',
                                      display: (showAllSteps || visibleStep === (i+1)) ? 'block' : 'none'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ fontWeight: 700 }}>{title}</div>
                                        {/* Calculator shown inside the step content — header calculator removed to avoid duplication */}
                                      </div>
                                                                            {i === 1 && (
                                                                              <>
                                                                                <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                                                                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 8 }}>
                                                                                  <div style={{ flex: 1 }}>
                                                                                    <div>X refers to your first variable.</div>
                                                                                    <div>Column 2 contains the data for your first variable.</div>
                                                                                    <div>Just add up all the values in this column.</div>
                                                                                    <div>You can use the calculator beside the table.</div>
                                                                                    <div>Encode the sum below:</div>
                                                                                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                                    <input type="number" min={0} value={xSumVal} disabled={xSumLocked || a2Done} onChange={(e)=> setXSumVal(e.target.value)} style={{ height: 28, border: '1px solid #ccc', borderRadius: 8, padding: '0 8px', width: 140 }} />
                                                                                    <StepButton label="Submit" onClick={()=> { setXSumLocked(true); persistP2Steps(); }} disabled={!xSumVal || a2Done} />
                                                                                  </div>
                                                                                  </div>
                                                                                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                                                                                    <div style={{ width: 360 }}>
                                                                                      <div style={{ fontWeight: 700, textAlign: 'center' }}>Preview of the Column from the Table</div>
                                                                                      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 8 }}>
                                                                                        <colgroup>
                                                                                          <col style={{ width: '100%' }} />
                                                                                        </colgroup>
                                                                                        <thead>
                                                                                          <tr>
                                                                                            <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{selectedDataset ? selectedDataset.v1 : '[Variable 1 Name] (X)'}</th>
                                                                                          </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                          {Array.from({ length: 8 }).map((_, idx) => (
                                                                                            <tr key={idx}>
                                                                                              <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{selectedDataset ? selectedDataset.x[idx] : ''}</td>
                                                                                            </tr>
                                                                                          ))}
                                                                                        </tbody>
                                                                                      </table>
                                                                                    </div>
                                                                                    <BasicCalc style={{ marginTop: 0, marginLeft: 48 }} />
                                                                                  </div>
                                                                                </div>
                                                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}>
                                                                                  <StepButton label="View Table" onClick={scrollToTable} disabled={!xSumLocked || a2Done} style={{ minWidth: 160, height: 36 }} />
                                                                                </div>
                                                                              </>
                                                                            )}
                                      {i === 0 && (
                                        <>
                                          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                              <div style={{ marginTop: 8 }}>This step is very easy.</div>
                                              <div>Look at Column 1. Count from Jan 2021 to Aug 2021.</div>
                                              <div>How many pairs of data points do you have?</div>
                                              <div>Encode the number here:</div>
                                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <input type="number" min={1} value={nVal} disabled={nLocked || a2Done} onChange={(e)=> setNVal(e.target.value)} style={{ height: 28, border: '1px solid #ccc', borderRadius: 8, padding: '0 8px', width: 100 }} />
                                                <StepButton label="Submit" onClick={()=> { setNLocked(true); persistP2Steps(); }} disabled={!nVal || a2Done} />
                                              </div>
                                            </div>
                                            <div style={{ width: 360, marginRight: 108 }}>
                                              <div style={{ fontWeight: 700, textAlign: 'center' }}>Preview of the Column from the Table</div>
                                              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 8 }}>
                                                <colgroup>
                                                  <col style={{ width: '100%' }} />
                                                </colgroup>
                                                <thead>
                                                  <tr>
                                                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>Month</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {['Jan 2021','Feb 2021','Mar 2021','Apr 2021','May 2021','Jun 2021','Jul 2021','Aug 2021'].map((m, idx) => (
                                                    <tr key={idx}>
                                                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{m}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}>
                                            <StepButton label="View Table" onClick={scrollToTable} disabled={!nLocked || a2Done} style={{ minWidth: 160, height: 36 }} />
                                          </div>
                                        </>
                                      )}
                                      {i === 2 && (
                                        <>
                                          <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 8 }}>
                                            <div style={{ flex: 1 }}>
                                              <div>Y refers to your second variable.</div>
                                              <div>Column 3 contains the data for your second variable.</div>
                                              <div>Just add up all the values in this column.</div>
                                              <div>You can use the calculator beside the table.</div>
                                              <div>Encode the sum below:</div>
                                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <input type="number" min={0} value={ySumVal} disabled={ySumLocked || a2Done} onChange={(e)=> setYSumVal(e.target.value)} style={{ height: 28, border: '1px solid #ccc', borderRadius: 8, padding: '0 8px', width: 140 }} />
                                                <StepButton label="Submit" onClick={()=> { setYSumLocked(true); persistP2Steps(); }} disabled={!ySumVal || a2Done} />
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                                              <div style={{ width: 360 }}>
                                                <div style={{ fontWeight: 700, textAlign: 'center' }}>Preview of the Column from the Table</div>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 8 }}>
                                                  <colgroup>
                                                    <col style={{ width: '100%' }} />
                                                  </colgroup>
                                                  <thead>
                                                    <tr>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{selectedDataset ? selectedDataset.v2 : '[Variable 2 Name] (Y)'}</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {Array.from({ length: 8 }).map((_, idx) => (
                                                      <tr key={idx}>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{selectedDataset ? selectedDataset.y[idx] : ''}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                              <BasicCalc style={{ marginTop: 0, marginLeft: 48 }} />
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}>
                                              <StepButton label="View Table" onClick={scrollToTable} disabled={!ySumLocked || a2Done} style={{ minWidth: 160, height: 36 }} />
                                          </div>
                                        </>
                                      )}
                                      {i === 3 && (
                                        <>
                                          <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 8 }}>
                                            <div style={{ flex: 1 }}>
                                              <div>X is your first variable (Column 2).</div>
                                              <div>Y is your second variable (Column 3)</div>
                                              <div>For each pair, multiply X times Y.</div>
                                              <div>Example: If Jan 2021 has X = 3 and Y = 5, that row's XY = 15.</div>
                                              <div>You can use the calculator beside the table.</div>
                                              <div>Do this for every single pair.</div>
                                              <div>Encode the products below:</div>
                                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                  {Array.from({ length: 8 }).map((_, idx) => (
                                                  <input key={idx} type="number" min={0} value={xyVals[idx]} disabled={xyLocked || a2Done} onChange={(e)=> {
                                                    const next = [...xyVals];
                                                    next[idx] = e.target.value;
                                                    setXyVals(next);
                                                  }} style={{ height: 28, width: 100, border: '1px solid #ccc', borderRadius: 8, padding: '0 8px' }} />
                                                ))}
                                              </div>
                                              <div style={{ marginTop: 12 }}>
                                                <StepButton label="Submit" onClick={()=> { setXyLocked(true); persistP2Steps(); }} disabled={xyVals.some(v => !v) || a2Done} />
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                                              <div style={{ width: 360 }}>
                                                <div style={{ fontWeight: 700, textAlign: 'center' }}>Preview of the Columns from the Table</div>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 8 }}>
                                                  <colgroup>
                                                    <col style={{ width: '33.33%' }} />
                                                    <col style={{ width: '33.33%' }} />
                                                    <col style={{ width: '33.33%' }} />
                                                  </colgroup>
                                                  <thead>
                                                    <tr>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{selectedDataset ? selectedDataset.v1 : 'X'}</th>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{selectedDataset ? selectedDataset.v2 : 'Y'}</th>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>xy</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {Array.from({ length: 8 }).map((_, idx) => (
                                                      <tr key={idx}>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{selectedDataset ? selectedDataset.x[idx] : ''}</td>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{selectedDataset ? selectedDataset.y[idx] : ''}</td>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{xyVals[idx] || ''}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                              <BasicCalc style={{ marginTop: 0, marginLeft: 48 }} />
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}>
                                            <StepButton label="View Table" onClick={scrollToTable} disabled={!xyLocked} style={{ minWidth: 160, height: 36 }} />
                                          </div>
                                        </>
                                      )}
                                      {i === 4 && (
                                        <>
                                          <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 8 }}>
                                            <div style={{ flex: 1 }}>
                                              <div>You calculated the xy values in Column 4.</div>
                                              <div>Just add up all the values in this column.</div>
                                              <div>You can use the calculator beside the table.</div>
                                              <div>Encode the sum below:</div>
                                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <input type="number" min={0} value={xySumVal} disabled={xySumLocked || a2Done} onChange={(e)=> setXySumVal(e.target.value)} style={{ height: 28, border: '1px solid #ccc', borderRadius: 8, padding: '0 8px', width: 140 }} />
                                                <StepButton label="Submit" onClick={()=> { setXySumLocked(true); persistP2Steps(); }} disabled={!xySumVal || a2Done} />
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                                              <div style={{ width: 360 }}>
                                                <div style={{ fontWeight: 700, textAlign: 'center' }}>Preview of the Column from the Table</div>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 8 }}>
                                                  <colgroup>
                                                    <col style={{ width: '100%' }} />
                                                  </colgroup>
                                                  <thead>
                                                    <tr>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>xy</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {Array.from({ length: 8 }).map((_, idx) => (
                                                      <tr key={idx}>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{xyVals[idx] || ''}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                              <BasicCalc style={{ marginTop: 0, marginLeft: 48 }} />
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}>
                                            <StepButton label="View Table" onClick={scrollToTable} disabled={!xySumLocked || a2Done} style={{ minWidth: 160, height: 36 }} />
                                          </div>
                                        </>
                                      )}
                                      {i === 5 && (
                                        <>
                                          <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 8 }}>
                                            <div style={{ flex: 1 }}>
                                              <div>Look at the x values in Column 2.</div>
                                              <div>Multiply the x value in each row by itself.</div>
                                              <div>Example: If Jan 2021 has x = 3, then multiply 3 by 3 and you’ll get x² = 9.</div>
                                              <div>You can use the calculator beside the table.</div>
                                              <div>Do this down the values of entire x column.</div>
                                              <div>Encode the product of each x value below:</div>
                                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {Array.from({ length: 8 }).map((_, idx) => (
                                                  <input key={idx} type="number" min={0} value={xSqVals[idx]} disabled={xSqLocked} onChange={(e)=> {
                                                    const next = [...xSqVals];
                                                    next[idx] = e.target.value;
                                                    setXSqVals(next);
                                                  }} style={{ height: 28, width: 100, border: '1px solid #ccc', borderRadius: 8, padding: '0 8px' }} />
                                                ))}
                                              </div>
                                              <div style={{ marginTop: 12 }}>
                                                <StepButton label="Submit" onClick={()=> { setXSqLocked(true); persistP2Steps(); }} disabled={xSqVals.some(v => !v)} />
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                                              <div style={{ width: 360 }}>
                                                <div style={{ fontWeight: 700, textAlign: 'center' }}>Preview of the Columns from the Table</div>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 8 }}>
                                                  <colgroup>
                                                    <col style={{ width: '50%' }} />
                                                    <col style={{ width: '50%' }} />
                                                  </colgroup>
                                                  <thead>
                                                    <tr>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{selectedDataset ? selectedDataset.v1 : 'X'}</th>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>x²</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {Array.from({ length: 8 }).map((_, idx) => (
                                                      <tr key={idx}>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{selectedDataset ? selectedDataset.x[idx] : ''}</td>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{xSqVals[idx] || ''}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                              <BasicCalc style={{ marginTop: 0, marginLeft: 48 }} />
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}>
                                            <StepButton label="View Table" onClick={scrollToTable} disabled={!xSqLocked} style={{ minWidth: 160, height: 36 }} />
                                          </div>
                                        </>
                                      )}
                                      {i === 6 && (
                                        <>
                                          <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 8 }}>
                                            <div style={{ flex: 1 }}>
                                              <div>You calculated the x² values in Column 5.</div>
                                              <div>Just add up all the values in this column.</div>
                                              <div>You can use the calculator beside the table.</div>
                                              <div>Encode the sum below:</div>
                                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <input type="number" min={0} value={xSqSumVal} disabled={xSqSumLocked} onChange={(e)=> setXSqSumVal(e.target.value)} style={{ height: 28, border: '1px solid #ccc', borderRadius: 8, padding: '0 8px', width: 140 }} />
                                                <StepButton label="Submit" onClick={()=> { setXSqSumLocked(true); persistP2Steps(); }} disabled={!xSqSumVal} />
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                                              <div style={{ width: 360 }}>
                                                <div style={{ fontWeight: 700, textAlign: 'center' }}>Preview of the Column from the Table</div>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 8 }}>
                                                  <colgroup>
                                                    <col style={{ width: '100%' }} />
                                                  </colgroup>
                                                  <thead>
                                                    <tr>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>x²</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {Array.from({ length: 8 }).map((_, idx) => (
                                                      <tr key={idx}>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{xSqVals[idx] || ''}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                              <BasicCalc style={{ marginTop: 0, marginLeft: 48 }} />
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}>
                                            <StepButton label="View Table" onClick={scrollToTable} disabled={!xSqSumLocked} style={{ minWidth: 160, height: 36 }} />
                                          </div>
                                        </>
                                      )}
                                      {i === 7 && (
                                        <>
                                          <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 8 }}>
                                            <div style={{ flex: 1 }}>
                                              <div>Look at the y values in Column 3.</div>
                                              <div>Multiply the y value in each row by itself.</div>
                                              <div>Example: If Jan 2021 has y = 5, then multiply 5 by 5 and you’ll get y² = 25.</div>
                                              <div>You can use the calculator beside the table.</div>
                                              <div>Do this down the values of entire y column.</div>
                                              <div>Encode the product of each y value below:</div>
                                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {Array.from({ length: 8 }).map((_, idx) => (
                                                  <input key={idx} type="number" min={0} value={ySqVals[idx]} disabled={ySqLocked} onChange={(e)=> {
                                                    const next = [...ySqVals];
                                                    next[idx] = e.target.value;
                                                    setYSqVals(next);
                                                  }} style={{ height: 28, width: 100, border: '1px solid #ccc', borderRadius: 8, padding: '0 8px' }} />
                                                ))}
                                              </div>
                                              <div style={{ marginTop: 12 }}>
                                                <StepButton label="Submit" onClick={()=> { setYSqLocked(true); persistP2Steps(); }} disabled={ySqVals.some(v => !v)} />
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                                              <div style={{ width: 360 }}>
                                                <div style={{ fontWeight: 700, textAlign: 'center' }}>Preview of the Columns from the Table</div>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 8 }}>
                                                  <colgroup>
                                                    <col style={{ width: '50%' }} />
                                                    <col style={{ width: '50%' }} />
                                                  </colgroup>
                                                  <thead>
                                                    <tr>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{selectedDataset ? selectedDataset.v2 : 'Y'}</th>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>y²</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {Array.from({ length: 8 }).map((_, idx) => (
                                                      <tr key={idx}>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{selectedDataset ? selectedDataset.y[idx] : ''}</td>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{ySqVals[idx] || ''}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                              <BasicCalc style={{ marginTop: 0, marginLeft: 48 }} />
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}>
                                            <StepButton label="View Table" onClick={scrollToTable} disabled={!ySqLocked} style={{ minWidth: 160, height: 36 }} />
                                          </div>
                                        </>
                                      )}
                                      {i === 8 && (
                                        <>
                                          <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 8 }}>
                                            <div style={{ flex: 1 }}>
                                              <div>You calculated the y² values in Column 6.</div>
                                              <div>Just add up all the values in this column.</div>
                                              <div>You can use the calculator beside the table.</div>
                                              <div>Encode the sum below:</div>
                                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <input type="number" min={0} value={ySqSumVal} disabled={ySqSumLocked} onChange={(e)=> setYSqSumVal(e.target.value)} style={{ height: 28, border: '1px solid #ccc', borderRadius: 8, padding: '0 8px', width: 140 }} />
                                                <StepButton label="Submit" onClick={()=> { setYSqSumLocked(true); persistP2Steps(); }} disabled={!ySqSumVal} />
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                                              <div style={{ width: 360 }}>
                                                <div style={{ fontWeight: 700, textAlign: 'center' }}>Preview of the Column from the Table</div>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 8 }}>
                                                  <colgroup>
                                                    <col style={{ width: '100%' }} />
                                                  </colgroup>
                                                  <thead>
                                                    <tr>
                                                      <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>y²</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {Array.from({ length: 8 }).map((_, idx) => (
                                                      <tr key={idx}>
                                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', background: 'var(--table-cell-bg, #f6f8fa)', textAlign: 'center', height: 50 }}>{ySqVals[idx] || ''}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                              <BasicCalc style={{ marginTop: 0, marginLeft: 48 }} />
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 60 }}>
                                            <StepButton label="View Table" onClick={scrollToTable} disabled={!ySqSumLocked} style={{ minWidth: 160, height: 36 }} />
                                          </div>
                                        </>
                                      )}
                                      {i === 9 && (
                                        <>
                                          <div style={{ fontWeight: 400, whiteSpace: 'pre' }}>{'   '}</div>
                                          {/* Formula centered under title */}
                                          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                                            <div style={{ width: '100%', maxWidth: 980, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 12, padding: '16px 20px', background: '#fff' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', width: '100%' }}>
                                                <span style={{ fontWeight: 700, fontSize: 22, color: 'var(--phase2-accent, #8e44ad)' }}>r =</span>
                                                <div style={{ display: 'inline-block', textAlign: 'center', color: 'var(--phase2-accent, #8e44ad)' }}>
                                                  {/* Numerator */}
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    <input type="number" value={fNNum} onChange={(e)=> setFNNum(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <span>(</span>
                                                    <input type="number" value={fXYNum} onChange={(e)=> setFXYNum(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <span>) − (</span>
                                                    <input type="number" value={fXNum} onChange={(e)=> setFXNum(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <span>)(</span>
                                                    <input type="number" value={fYNum} onChange={(e)=> setFYNum(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <span>)</span>
                                                  </div>
                                                  {/* Fraction bar */}
                                                  <div style={{ borderTop: '3px solid var(--phase2-accent, #8e44ad)', margin: '10px 0' }} />
                                                  {/* Denominator */}
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 700 }}>√</span>
                                                    <span>[</span>
                                                    <input type="number" value={fN_DX} onChange={(e)=> setFN_DX(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <input type="number" value={fXSq_DX} onChange={(e)=> setFXSq_DX(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <span> − (</span>
                                                    <input type="number" value={fX_DX} onChange={(e)=> setFX_DX(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <span>)²]</span>
                                                    <span>[</span>
                                                    <input type="number" value={fN_DY} onChange={(e)=> setFN_DY(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <input type="number" value={fYSq_DY} onChange={(e)=> setFYSq_DY(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <span> − (</span>
                                                    <input type="number" value={fY_DY} onChange={(e)=> setFY_DY(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ width: 100, height: 36, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, textAlign: 'center' }} />
                                                    <span>)²]</span>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                          {/* Values line below formula (add 5 gaps below encoding panel) */}
                                          <div style={{ marginTop: 40 }}>Here are the values you got after finishing Steps 1 to 9:</div>
                                          {/* Horizontal equal-sized rectangles with values */}
                                          <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                                            {[
                                              { key: 'n',    label: 'n',    val: nVal,      ok: nOk,   show: nShow },
                                              { key: 'sx',   label: 'Σx',   val: xSumVal,   ok: sxOk,  show: sxShow },
                                              { key: 'sy',   label: 'Σy',   val: ySumVal,   ok: syOk,  show: syShow },
                                              { key: 'sxy',  label: 'Σxy',  val: xySumVal,  ok: sxyOk, show: sxyShow },
                                              { key: 'sx2',  label: 'Σx²',  val: xSqSumVal, ok: sx2Ok, show: sx2Show },
                                              { key: 'sy2',  label: 'Σy²',  val: ySqSumVal, ok: sy2Ok, show: sy2Show },
                                            ].map((it) => (
                                              <div key={it.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <div style={{ width: 140, height: 40, border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                                  <span>{it.label} = {it.val || '[not set]'}</span>
                                                </div>
                                                <div style={{ height: 26, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                  {it.show ? (it.ok ? <CheckCircle /> : <StopSign />) : null}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          {/* Guidance lines */}
                                          <div style={{ marginTop: 12, fontWeight: 400 }}>Now, refer to the formula, and encode these values in their corresponding boxes.</div>
                                          <div style={{ fontWeight: 400 }}>When a value is encoded in the correct box(es), a green check with a green circular outline will appear below that value’s box in the list.</div>
                                          <div style={{ fontWeight: 400 }}>If one or more boxes are incorrect for a value, a red stop sign will appear below that value’s box.</div>

                                          {/* Calculate button aligned bottom-right */}
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingRight: 24, paddingBottom: 24 }}>
                                            <StepButton label="Calculate" onClick={()=> setPlotVisible(true)} disabled={!allValuesOk || a2Done} style={{ height: 42, minWidth: 200 }} />
                                          </div>

                                          {/* Congrats line 3 gaps below the button */}
                                          {plotVisible && (
                                            <div style={{ marginTop: 24, fontWeight: 700, textAlign: 'left' }}>
                                              Congratulations! You have succesfully calculated the Pearson Coefficient Correlation of the assigned variables to you.
                                            </div>
                                          )}

                                          {/* Scatter plot 10 gaps below button */}
                                          {plotVisible && (
                                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                                              <div style={{ width: '100%', maxWidth: 980, padding: '0 16px', textAlign: 'center' }}>
                                                {/* Rectangle and title outside and above the scatter plot */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 16px', border: '2px solid var(--phase2-accent, #8e44ad)', borderRadius: 8, background: '#fff', fontSize: 18, fontWeight: 700, color: 'var(--phase2-accent, #8e44ad)' }}>{currentR}</div>
                                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--phase2-accent, #8e44ad)' }}>
                                                    {selectedDataset ? `Correlation between ${cleanName(selectedDataset.v1)} and ${cleanName(selectedDataset.v2)}` : ''}
                                                  </div>
                                                </div>
                                                {renderScatterSVG(
                                                  pointsForDataset,
                                                  980,
                                                  360,
                                                  'scatter-card10',
                                                  360,
                                                  cleanName(selectedDataset?.v1) || 'Variable X',
                                                  cleanName(selectedDataset?.v2) || 'Variable Y'
                                                )}
                                              </div>
                                            </div>
                                          )}

                                          {/* Reflection question and input */
                                          }
                                          {plotVisible && (
                                            <div style={{ marginTop: 48, textAlign: 'center' }}>
                                              <div style={{ fontWeight: 700 }}>Looking at the scatter plot pattern, what kind of correlation do the two variables have?</div>
                                              <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'center' }}>
                                                <input type="text" value={corrAnswer} onChange={(e)=> setCorrAnswer(e.target.value)} placeholder="positive, negative, no correlation" style={{ height: 32, border: '1px solid #ccc', borderRadius: 8, padding: '0 10px', width: 340 }} disabled={!!(state.phaseData as any)[2]?.a2Done} />
                                                <StepButton label="Submit" disabled={!corrAnswer.trim() || !!(state.phaseData as any)[2]?.a2Done} onClick={() => {
                                                  if (!corrAnswer.trim()) return;
                                                  const steps = { n: nVal, xSum: xSumVal, ySum: ySumVal, xySum: xySumVal, xSqSum: xSqSumVal, ySqSum: ySqSumVal };
                                                  try {
                                                    const raw = String(currentR || '');
                                                    const m = raw.match(/r=([-+]?\d*\.?\d+)/);
                                                    const rVal = m ? parseFloat(m[1]) : 0;
                                                    savePhase2Activity2(user.username, { var1: selectedDataset?.v1 || '', var2: selectedDataset?.v2 || '', r: isNaN(rVal) ? 0 : rVal });
                                                  } catch (e) {
                                                    // ignore
                                                  }
                                                  const next = savePhase2Activity2Answer(user.username, corrAnswer.trim(), steps);
                                                  setState(next);
                                                }} />
                                              </div>
                                            </div>
                                          )}
                                          {plotVisible && (
                                            <div style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-end', paddingRight: 24 }}>
                                              <StepButton label="Show All Steps" onClick={()=> { setShowAllSteps(true); }} style={{ height: 44, minWidth: 220, fontSize: 16 }} />
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Phase 2 - Activity 3 */}
                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2SubOpen(s=>({...s, a3: !s.a3}))}><span className="label"><span className="icon">🧮</span> <b>Activity 3: Spreadsheet Pearson r</b></span><span className="right-indicator">{(state.phaseData as any)[2]?.a3Done && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{p2SubOpen.a3 ? '−' : '+'}</span></span></div>
                      <div className="sub-content" style={{display: p2SubOpen.a3 ? 'block' : 'none'}}>
                        {/* Instructional cards above video */}
                        <div className="cards-row" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
                          <div className="card spacious">
                            <div style={{ fontWeight: 700 }}>🧭 What you will do:</div>
                            <div className="gap-3" />
                            <div>You will calculate Pearson r again, this time using a spreadsheet tool.</div>
                          </div>
                          <div className="card spacious">
                            <div style={{ fontWeight: 700 }}>🛠️ How to do it:</div>
                            <div className="gap-3" />
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              <li>Watch the video tutorial while working on your spreadsheet.</li>
                              <li>Follow along as the video shows how to enter data and apply the formula.</li>
                              <li>Complete the calculation using the given climate data.</li>
                            </ul>
                            <div className="gap-3" />
                            <div style={{ fontWeight: 700 }}>💡 Tip:</div>
                            <div>Pause or replay the video anytime if you need to review a step.</div>
                          </div>
                        </div>
                        <div className="card spacious activity-card">
                          <div style={{ fontWeight: 700 }}>Let's solve Pearson Correlation Coefficient the Fast and Easy Way</div>
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div>Watch the video below to learn how to build the scatterplot and compute for the correlation coefficient in a spreadsheet.</div>
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div>
                            <iframe width="100%" height="420" src="https://www.youtube.com/embed/EvdmMZxM1jY" title="Pearson correlation in spreadsheet" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                          </div>
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div>
                            Easy right? Now, let's using what you have learned in finding the pearson correlation coefficient of your selected variables during the first phase of our lesson.
                          </div>
                          <div>
                            The dataset of the variables you selected in Phase 1 is displayed below.
                          </div>
                          <div>
                            Calculate the Pearson Correlation Coefficient and create the scatter plot for the two variables.
                            <br />
                            Click on the link below the table to access the spreadsheet.
                          </div>
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          {(() => {
                            const monthsNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                            const var1Label = ((state.phaseData as any)[1]?.a3Var1 || '') as string;
                            const var2Label = ((state.phaseData as any)[1]?.a3Var2 || '') as string;

                            const inClimate = (label: string) => (climateLabels as unknown as string[]).includes(label);
                            const inSocietal = (label: string) => (societalLabels as unknown as string[]).includes(label);

                            const getSeries = (label: string, year: Year): number[] => {
                              if (!label) return [];
                              if (inClimate(label)) {
                                return getMonthlySeriesForClimate(year, label as keyof import('../../services/lesson1Phase1Data').ClimateRecord);
                              }
                              if (inSocietal(label)) {
                                return getMonthlySeriesForSocietal(year, label as keyof import('../../services/lesson1Phase1Data').SocietalRecord);
                              }
                              return [];
                            };

                            const v1_2022 = getSeries(var1Label, 2022 as Year);
                            const v1_2023 = getSeries(var1Label, 2023 as Year);
                            const v2_2022 = getSeries(var2Label, 2022 as Year);
                            const v2_2023 = getSeries(var2Label, 2023 as Year);
                            const rows2022 = Array.from({ length: 12 }).map((_, m) => ({
                              mLabel: `${monthsNames[m]} 2022`,
                              v1: v1_2022[m],
                              v2: v2_2022[m]
                            }));
                            const rows2023 = Array.from({ length: 12 }).map((_, m) => ({
                              mLabel: `${monthsNames[m]} 2023`,
                              v1: v1_2023[m],
                              v2: v2_2023[m]
                            }));

                            return (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
                                <div style={{ paddingRight: 12, borderRight: '1px solid #e5e7eb' }}>
                                  <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                                    <colgroup>
                                      <col style={{ width: '45%' }} />
                                      <col style={{ width: '27.5%' }} />
                                      <col style={{ width: '27.5%' }} />
                                    </colgroup>
                                    <thead>
                                      <tr>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>Month and Year</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{var1Label || 'Variable 1 (Column 2)'}</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{var2Label || 'Variable 2 (Column 3)'}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows2022.map((r, i) => (
                                        <tr key={i}>
                                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', textAlign: 'center' }}>{r.mLabel}</td>
                                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', textAlign: 'center', background: 'var(--table-cell-bg, #f6f8fa)' }}>{(r.v1 ?? '') as any}</td>
                                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', textAlign: 'center', background: 'var(--table-cell-bg, #f6f8fa)' }}>{(r.v2 ?? '') as any}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div style={{ minHeight: 480, padding: '0 12px' }}>
                                  <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                                    <colgroup>
                                      <col style={{ width: '45%' }} />
                                      <col style={{ width: '27.5%' }} />
                                      <col style={{ width: '27.5%' }} />
                                    </colgroup>
                                    <thead>
                                      <tr>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>Month and Year</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{var1Label || 'Variable 1 (Column 2)'}</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid var(--phase2-accent, #8e44ad)', fontWeight: 700 }}>{var2Label || 'Variable 2 (Column 3)'}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows2023.map((r, i) => (
                                        <tr key={i}>
                                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', textAlign: 'center' }}>{r.mLabel}</td>
                                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', textAlign: 'center', background: 'var(--table-cell-bg, #f6f8fa)' }}>{(r.v1 ?? '') as any}</td>
                                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--phase2-accent, #8e44ad)', textAlign: 'center', background: 'var(--table-cell-bg, #f6f8fa)' }}>{(r.v2 ?? '') as any}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12 }}>
                                    <a
                                      href="https://docs.google.com/spreadsheets/d/1-qZXsncfMwdTZGI0biiL4r0LIN7T2dOuZC_9B2MWNnE/edit?gid=0#gid=0"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '10px 14px',
                                        borderRadius: 8,
                                        background: '#E6B8CC',
                                        border: '1px solid #D3A5BD',
                                        color: '#4D2038',
                                        textDecoration: 'none',
                                        fontWeight: 700
                                      }}
                                    >
                                      Open Google Sheet
                                    </a>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                          {/* spacing before cards */}
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          <div className="gap-3" />
                          {/* Upload card: full width */}
                          <div className="card" style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
                              <div style={{ fontWeight: 700, textAlign: 'left' }}>Upload your screenshot here.</div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                               <div className="input-row">
                                <label>Upload file</label>
                                 <input type="file" accept="image/jpeg,image/png,application/pdf" disabled={checkpointFinalized} onChange={(e)=>{
                                  const f = e.target.files && e.target.files[0];
                                  if (!f) { setUploadPreview(null); setUploadedFile(null); return; }
                                  const url = URL.createObjectURL(f);
                                  const type = f.type.includes('pdf') ? 'pdf' : 'image';
                                  setUploadPreview({ url, type });
                                  setUploadedFile(f);
                                }} />
                              </div>
                              <div style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff', minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {uploadPreview ? (
                                  uploadPreview.type === 'image' ? (
                                    <img src={uploadPreview.url} alt="Uploaded preview" style={{ maxWidth: '100%', maxHeight: 420 }} />
                                  ) : (
                                    <iframe src={uploadPreview.url} title="PDF preview" style={{ width: '100%', height: 420, border: 0 }} />
                                  )
                                ) : (
                                  <span style={{ color: '#888' }}>No file uploaded yet.</span>
                                )}
                              </div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div style={{ fontWeight: 700, textAlign: 'left' }}>Scatter Plot Label Checkpoints:</div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              {(() => {
                                const checkpointLabels: Array<string | JSX.Element> = [
                                  'a.\u00A0Is the name of the X-Axis referring to your First Variable?',
                                  'b.\u00A0Is the name of the Y-Axis referring to your Second Variable?',
                                  'c.\u00A0Are the names of the X and Y-axis properly capitalized?',
                                  (<>
                                    d.&nbsp;Does the title have this format:<br />
                                    <i>The Correlation between [Variable 1 Name] and [Variable 2 Name] in [Place]?</i>
                                  </>)
                                ];
                                const setAnswer = (idx: number, val: 'yes' | 'no') => {
                                  const next = [...checkpointAnswers];
                                  next[idx] = val;
                                  setCheckpointAnswers(next);
                                };
                                const canFinalize = checkpointAnswers.every(a => a === 'yes');
                                return (
                                  <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '80% 20%', gap: 10, paddingLeft: 12, paddingRight: 12 }}>
                                      {checkpointLabels.map((lbl, i) => (
                                        <React.Fragment key={`cp-${i}`}>
                                          <div key={`cp-l-${i}`} style={{ textAlign: 'left' }}>{lbl}</div>
                                          <div key={`cp-r-${i}`} style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                                            <button
                                              type="button"
                                              disabled={checkpointFinalized}
                                              onClick={() => setAnswer(i, 'yes')}
                                              style={{
                                                padding: '8px 14px',
                                                borderRadius: 10,
                                                border: '1px solid #D3A5BD',
                                                background: checkpointAnswers[i] === 'yes' ? '#E6B8CC' : '#FFF5F9',
                                                color: checkpointAnswers[i] === 'yes' ? '#4D2038' : '#6B2F47',
                                                fontFamily: 'Poppins, sans-serif',
                                                fontWeight: 400
                                              }}
                                            >Yes</button>
                                            <button
                                              type="button"
                                              disabled={checkpointFinalized}
                                              onClick={() => setAnswer(i, 'no')}
                                              style={{
                                                padding: '8px 14px',
                                                borderRadius: 10,
                                                border: '1px solid #D3A5BD',
                                                background: checkpointAnswers[i] === 'no' ? '#E6B8CC' : '#FFF5F9',
                                                color: checkpointAnswers[i] === 'no' ? '#4D2038' : '#6B2F47',
                                                fontFamily: 'Poppins, sans-serif',
                                                fontWeight: 400
                                              }}
                                            >No</button>
                                          </div>
                                        </React.Fragment>
                                      ))}
                                    </div>
                                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', paddingLeft: 12, paddingRight: 12 }}>
                                                    <button className="submit-btn" disabled={!canFinalize || !!(state.phaseData as any)[2]?.checkpointFinalized} onClick={async () => {
                                                      // persist checkpoint answers into lesson1State before finalizing
                                                      try {
                                                        const cur = getLesson1State(user.username);
                                                        const p2 = { ...(cur.phaseData[2] || {}) } as any;
                                                        p2.checkpointAnswers = checkpointAnswers;
                                                        const phaseData = { ...cur.phaseData, 2: p2 };
                                                        const nextState = { ...cur, phaseData };
                                                        await saveLesson1State(user.username, nextState);
                                                        setState(nextState);
                                                      } catch (e) { /* ignore persist error */ }
                                                      try {
                                                        const next = await savePhase2FinalizeScatter(user.username);
                                                        setState(next);
                                                        setCheckpointFinalized(true);
                                                      } catch (err) {
                                                        console.error('Failed to finalize scatter', err);
                                                        try { window.alert('Failed to finalize checkpoint. Please try again.'); } catch(_){ }
                                                        return;
                                                      }
                                                      // if a file was uploaded, convert to data URL and persist to activity3 aggregate
                                                      if (uploadedFile) {
                                                        const f = uploadedFile;
                                                        const reader = new FileReader();
                                                        reader.onload = (ev) => {
                                                          try {
                                                            const data = ev.target?.result as string;
                                                            // save into Phase2 Activity3 aggregate for teacher preview
                                                            try { savePhase2Activity3Upload(user.username, data, f.type); } catch(e) { /* ignore */ }
                                                          } catch (e) {
                                                            // ignore
                                                          }
                                                        };
                                          reader.readAsDataURL(f);
                                        }
                                      }} style={{ height: 40, padding: '10px 16px', fontSize: 15 }}>Finalize Scatter Plot</button>
                                    </div>
                                  </>
                                );
                              })()}
                          </div>
                          {/* Assessment card: stacked below upload card */}
                          <div className="card" style={{ minHeight: 320, display: 'flex', flexDirection: 'column', marginTop: 16 }}>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div style={{ display: 'flex', justifyContent: 'center', padding: '0 12px' }}>
                                <div style={{ width: '100%', background: '#E6B8CC', border: '1px solid #D3A5BD', color: '#4D2038', borderRadius: 12, padding: '10px 16px', fontWeight: 700, textAlign: 'center', fontSize: '1.2rem' }}>
                                  My Spreadsheet Skills Self-Assessment
                                </div>
                              </div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div style={{ textAlign: 'left' }}>Read each statement carefully and assess your level of ability in performing the statements using the scale on the right. There's no need to worry about. There is no right or wrong in this self-assessment.</div>
                              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '48px 2fr 1fr', gap: 6, flexGrow: 1 }}>
                                <div />
                                <div style={{ fontWeight: 700, textAlign: 'center' }}>Items</div>
                                <div style={{ fontWeight: 700, textAlign: 'center' }}>Scale</div>
                                {selfAssessItems.map((label, idx) => (
                                  <React.Fragment key={`sa-${idx}`}>
                                    <div key={`num-${idx}`} style={{ textAlign: 'left' }}>{idx + 1}.</div>
                                    <div key={`lbl-${idx}`} style={{ textAlign: 'left' }}>{label}</div>
                                    <select key={`sel-${idx}`} value={selfAssessAnswers[idx]} disabled={selfAssessSubmitted} onChange={(e)=>{
                                      const next = [...selfAssessAnswers];
                                      next[idx] = e.target.value;
                                      setSelfAssessAnswers(next);
                                    }} style={{ height: 40, background: '#E6B8CC', border: '1px solid #D3A5BD', color: '#4D2038', borderRadius: 10, padding: '8px 12px', fontFamily: 'Poppins, sans-serif', fontWeight: 400 }}>
                                      <option value="">Select</option>
                                      {selfAssessScale.map((opt, i)=>(<option key={i} value={opt}>{opt}</option>))}
                                    </select>
                                  </React.Fragment>
                                ))}
                              </div>
                              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  className="submit-btn"
                                  disabled={!!(state.phaseData as any)[2]?.selfAssessSubmitted || !selfAssessAnswers.every(a => (a || '').trim().length > 0)}
                                  onClick={async () => {
                                    try {
                                      const next = await savePhase2SelfAssessment(user.username, selfAssessAnswers);
                                      setState(next);
                                      setSelfAssessSubmitted(true);
                                    } catch (err) {
                                      console.error('savePhase2SelfAssessment failed', err);
                                      try { window.alert('Failed to submit self-assessment. Please try again.'); } catch(_){ }
                                    }
                                  }}
                                  style={{ height: 42, padding: '10px 18px', fontSize: 16 }}
                                >
                                  Submit
                                </button>
                              </div>
                              {selfAssessSubmitted && (
                                <div className="banner" style={{ marginTop: 12 }}>Self-assessment submitted. Thank you!</div>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Phase 2 - Activity 4 */}
                    <div className="sub-item">
                      <div className="sub-header blue" onClick={()=> setP2SubOpen(s=>({...s, a4: !s.a4}))}><span className="label"><span className="icon">✍️</span> <b>Activity 4: Interpret Your Pearson r Value</b></span><span className="right-indicator">{(((state.phaseData as any)[2]?.a4Checked) || ((state.phaseData as any)[2]?.interpretSubmitted)) && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{p2SubOpen.a4 ? '−' : '+'}</span></span></div>
                      <div className="sub-content" style={{display: p2SubOpen.a4 ? 'block' : 'none'}}>
                        {/* Cards 1 and 2: horizontal with equal width and gaps */}
                        <div className="cards-row" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
                          <div className="card spacious">
                            <div style={{ fontWeight: 700 }}><span className="icon">🧭</span> What you will do:</div>
                            <div className="gap-3" />
                            <div>You will learn how to interpret Pearson r values and apply this to your own results.</div>
                          </div>
                          <div className="card spacious">
                            <div style={{ fontWeight: 700 }}><span className="icon">🛠️</span> How to do it:</div>
                            <div className="gap-3" />
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              <li>Study the interpretation table that explains what different r values mean.</li>
                              <li>Locate your computed r value in the table.</li>
                              <li>Interpret what your result says about the relationship between your chosen climate variables.</li>
                            </ul>
                            <div className="gap-3" />
                            <div><span className="icon">💡</span> <b>Think about this:</b></div>
                            <div>Does the strength and direction of the relationship match what you observed earlier in the data?</div>
                          </div>
                        </div>

                        {/* Card 3: stacked full-width sections with equal gaps */}
                        <div className="card spacious">
                          {/* General Interpretation table: full width */}
                          <div>
                              {/* Understanding the r Value intro */}
                              <div style={{ fontWeight: 700, textAlign: 'left', fontSize: '1.2rem' }}>Understanding the r Value</div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div style={{ textAlign: 'left' }}>The r value, also called the correlation coefficient, shows how two variables are related. It tells us how strong the relationship is and whether it moves in the same or opposite direction.</div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div style={{ textAlign: 'left' }}>The value of r ranges from –1 to +1.</div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <svg width="740" height="200" viewBox="0 0 740 200" aria-label="Correlation coefficient reference" role="img">
                                  {/* Background */}
                                  <rect x="8" y="8" width="724" height="184" rx="12" ry="12" fill="#FFF5F9" stroke="#FFD4E4" />
                                  {/* Titles */}
                                  <text x="370" y="40" textAnchor="middle" fontSize="20" fontWeight="700" fill="#000">Correlation Coefficient</text>
                                  <text x="370" y="60" textAnchor="middle" fontSize="14" fill="#333">Shows Strength & Direction of Correlation</text>
                                  {/* Baseline segments */}
                                  <line x1="50" y1="110" x2="370" y2="110" stroke="#d9534f" strokeWidth="5" />
                                  <line x1="370" y1="110" x2="690" y2="110" stroke="#28a745" strokeWidth="5" />
                                  {/* Zero marker */}
                                  <line x1="370" y1="96" x2="370" y2="124" stroke="#1e88e5" strokeWidth="6" />
                                  {/* Tick marks */}
                                  <line x1="50" y1="104" x2="50" y2="116" stroke="#666" />
                                  <line x1="210" y1="106" x2="210" y2="114" stroke="#666" />
                                  <line x1="530" y1="106" x2="530" y2="114" stroke="#666" />
                                  <line x1="690" y1="104" x2="690" y2="116" stroke="#666" />
                                  {/* Labels under ticks */}
                                  <text x="50" y="140" textAnchor="middle" fontSize="13" fill="#000">-1.0</text>
                                  <text x="210" y="140" textAnchor="middle" fontSize="13" fill="#000">-0.5</text>
                                  <text x="370" y="140" textAnchor="middle" fontSize="13" fill="#1e88e5">0.0</text>
                                  <text x="530" y="140" textAnchor="middle" fontSize="13" fill="#000">+0.5</text>
                                  <text x="690" y="140" textAnchor="middle" fontSize="13" fill="#000">+1.0</text>
                                  {/* Strength labels */}
                                  <text x="110" y="92" textAnchor="middle" fontSize="13" fill="#000">Strong</text>
                                  <text x="260" y="92" textAnchor="middle" fontSize="13" fill="#000">Weak</text>
                                  <text x="480" y="92" textAnchor="middle" fontSize="13" fill="#000">Weak</text>
                                  <text x="630" y="92" textAnchor="middle" fontSize="13" fill="#000">Strong</text>
                                  {/* Direction labels */}
                                  <text x="170" y="165" textAnchor="middle" fontSize="13" fill="#d9534f">Negative Correlation</text>
                                  <text x="370" y="165" textAnchor="middle" fontSize="13" fill="#1e88e5">Zero</text>
                                  <text x="570" y="165" textAnchor="middle" fontSize="13" fill="#28a745">Positive Correlation</text>
                                </svg>
                              </div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <ul style={{ margin: 0, paddingLeft: 18, textAlign: 'left' }}>
                                <li><span>&nbsp;&nbsp;&nbsp;</span>A value close to +1 means a strong positive relationship (as one variable increases, the other also increases).</li>
                                <li><span>&nbsp;&nbsp;&nbsp;</span>A value close to –1 means a strong negative relationship (as one variable increases, the other decreases).</li>
                                <li><span>&nbsp;&nbsp;&nbsp;</span>A value near 0 means there is little to no relationship between the variables.</li>
                              </ul>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div style={{ textAlign: 'left' }}>Understanding the r value helps us interpret patterns in data and make evidence-based conclusions.<br />Study the table below for your reference.</div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              {/* Table title */}
                              <div style={{ fontWeight: 700, textAlign: 'left', fontSize: '1.2rem' }}>General Interpretation of Pearson r Values</div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                                <colgroup>
                                  <col style={{ width: '33%' }} />
                                  <col style={{ width: '34%' }} />
                                  <col style={{ width: '33%' }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'center', fontWeight: 700, padding: '10px 8px', borderBottom: '2px solid #ddd' }}>Correlation Coefficient (r)</th>
                                    <th style={{ textAlign: 'center', fontWeight: 700, padding: '10px 8px', borderBottom: '2px solid #ddd' }}>Strength of Relationship</th>
                                    <th style={{ textAlign: 'center', fontWeight: 700, padding: '10px 8px', borderBottom: '2px solid #ddd' }}>Direction</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    { r: '1.0 (or -1.0)', s: 'Perfect', d: 'Positive (or Negative)' },
                                    { r: '0.80 to 0.99 (-0.80 to -0.99)', s: 'Very Strong', d: 'Positive (or Negative)' },
                                    { r: '0.60 to 0.79 (-0.60 to -0.79)', s: 'Strong', d: 'Positive (or Negative)' },
                                    { r: '0.40 to 0.59 (-0.40 to -0.59)', s: 'Moderate', d: 'Positive (or Negative)' },
                                    { r: '0.20 to 0.39 (-0.20 to -0.39)', s: 'Weak', d: 'Positive (or Negative)' },
                                    { r: '0.01 to 0.19 (-0.01 to -0.19)', s: 'Very Weak', d: 'Positive (or Negative)' },
                                    { r: '0', s: 'No Relationship', d: 'Positive (or Negative)' }
                                  ].map((row, i) => (
                                    <tr key={i}>
                                      <td style={{ textAlign: 'center', fontWeight: 700, padding: '8px 8px', borderBottom: '1px solid #eee' }}>{row.r}</td>
                                      <td style={{ textAlign: 'center', padding: '8px 8px', borderBottom: '1px solid #eee' }}>{row.s}</td>
                                      <td style={{ textAlign: 'center', padding: '8px 8px', borderBottom: '1px solid #eee' }}>{row.d}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Spacer: 5 gaps below the table */}
                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />
                            <div className="gap-3" />
                            {/* Quiz: full width */}
                            <div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div style={{ fontWeight: 700, textAlign: 'left', fontSize: '1.2rem' }}>Pearson r Interpretation Quiz</div>
                              <div style={{ textAlign: 'left' }}>Based on the General Interpretation of Pearson r Table, identify the strength of relationship and direction of the r value in each item.</div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                                <colgroup>
                                  <col style={{ width: '40%' }} />
                                  <col style={{ width: '30%' }} />
                                  <col style={{ width: '30%' }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'center', fontWeight: 700, padding: '6px 6px' }}>r Value</th>
                                    <th style={{ textAlign: 'center', fontWeight: 700, padding: '6px 6px' }}>Strength</th>
                                    <th style={{ textAlign: 'center', fontWeight: 700, padding: '6px 6px' }}>Direction</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {a4QuizItems.map((item, idx) => (
                                    <tr key={idx}>
                                      <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-block', width: '95%', background: '#FFE8F1', border: '1px solid #FFD4E4', color: '#6B2F47', borderRadius: 10, padding: '8px 12px', fontWeight: 700 }}>
                                          {idx+1}. r = {item.r}
                                        </div>
                                      </td>
                                      <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                                        <select value={a4StrengthSel[idx]} onChange={(e)=>{
                                          const next = [...a4StrengthSel]; next[idx] = e.target.value; setA4StrengthSel(next);
                                          }} disabled={a4Checked || ((state.phaseData as any)[2]?.a4Checked)} style={{ width: '95%', height: 40, background: '#E6B8CC', border: '1px solid #D3A5BD', color: '#4D2038', borderRadius: 10, padding: '8px 12px' }}>
                                          <option value="">Select</option>
                                          {a4StrengthOptions.map((opt, i)=>(<option key={i} value={opt}>{opt}</option>))}
                                        </select>
                                      </td>
                                      <td style={{ padding: '10px 6px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                        <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center' }}>
                                          <select value={a4DirectionSel[idx]} onChange={(e)=>{
                                            const next = [...a4DirectionSel]; next[idx] = e.target.value; setA4DirectionSel(next);
                                          }} disabled={a4Checked || ((state.phaseData as any)[2]?.a4Checked)} style={{ width: '95%', height: 40, background: '#FFF5F9', border: '1px solid #FFD4E4', color: '#6B2F47', borderRadius: 10, padding: '8px 12px' }}>
                                            <option value="">Select</option>
                                            {a4DirectionOptions.map((opt, i)=>(<option key={i} value={opt}>{opt}</option>))}
                                          </select>
                                        </div>
                                        <div style={{ width: 34, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                          {a4Checked ? (a4Correct[idx] ? <CheckCircle size={18} /> : <StopSign size={18} />) : null}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="submit-btn" onClick={checkA4Answers} disabled={!a4Complete} style={{ height: 40, padding: '10px 16px' }}>Check Answers</button>
                              </div>
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="gap-3" />
                              <div className="card" style={{ padding: '20px 28px', border: '1px solid #e6d9f1', borderRadius: 16, background: '#f9f4fb', width: '100%', maxWidth: '100%', margin: '0 auto', fontFamily: 'Poppins, sans-serif' }}>
                                <div style={{ textAlign: 'left', fontWeight: 700, fontSize: '1.4rem', color: '#7c3f64' }}>Now, it's time to interpret the r value for your identified variables.</div>
                                <div className="gap-3" />
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 280px' }}>
                                    <label style={{ fontWeight: 700, marginBottom: 6, color: '#7c3f64' }}>Variable 1:</label>
                                    <select value={pairVar1} onChange={(e)=> setPairVar1(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ height: 44, borderRadius: 12, border: '1px solid #d8c8eb', padding: '10px 12px', background: '#fff', fontFamily: 'Poppins, sans-serif' }}>
                                      <option value="">Select</option>
                                      {variableOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                                    </select>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 280px' }}>
                                    <label style={{ fontWeight: 700, marginBottom: 6, color: '#7c3f64' }}>Variable 2:</label>
                                    <select value={pairVar2} onChange={(e)=> setPairVar2(e.target.value)} disabled={((state.phaseData as any)[2]?.interpretSubmitted)} style={{ height: 44, borderRadius: 12, border: '1px solid #d8c8eb', padding: '10px 12px', background: '#fff', fontFamily: 'Poppins, sans-serif' }}>
                                      <option value="">Select</option>
                                      {variableOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                                    </select>
                                  </div>
                                </div>
                                <div className="gap-3" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                    <span style={{ fontWeight: 700, color: '#7c3f64' }}>Research Question:</span>
                                    <span style={{ fontSize: '0.95rem', color: '#6c616c', fontStyle: 'italic' }}>Encode here your finalized research question from Phase 1, Activity 4.</span>
                                  </div>
                                  <input
                                    value={pairResearchQuestion}
                                    onChange={(e)=> setPairResearchQuestion(e.target.value)}
                                    disabled={((state.phaseData as any)[2]?.interpretSubmitted)}
                                    placeholder="Type your research question"
                                    style={{ width: '100%', minHeight: 44, borderRadius: 12, border: '1px solid #d8c8eb', padding: '10px 12px', background: '#fde8f1', fontFamily: 'Poppins, sans-serif' }}
                                  />
                                </div>
                                <div className="gap-3" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                  {[{ label: 'Computed r:', value: pairComputeR, setter: setPairComputeR, placeholder: 'e.g. 0.74' },
                                    { label: 'Strength:', value: pairStrength, setter: setPairStrength, placeholder: 'e.g. Strong' },
                                    { label: 'Direction:', value: pairDirection, setter: setPairDirection, placeholder: 'e.g. Positive' }].map(({ label, value, setter, placeholder }) => (
                                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <label style={{ fontWeight: 700, color: '#7c3f64' }}>{label}</label>
                                      <input
                                        value={value}
                                        onChange={(e)=> setter(e.target.value)}
                                        disabled={((state.phaseData as any)[2]?.interpretSubmitted)}
                                        placeholder={placeholder}
                                        style={{ width: '100%', maxWidth: 720, minHeight: 42, borderRadius: 12, border: '1px solid #d8c8eb', padding: '10px 12px', background: '#fde8f1', fontFamily: 'Poppins, sans-serif' }}
                                      />
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <label style={{ fontWeight: 700, color: '#7c3f64' }}>Interpretation:</label>
                                    <input
                                      value={pairInterpretation}
                                      onChange={(e)=> setPairInterpretation(e.target.value)}
                                      disabled={((state.phaseData as any)[2]?.interpretSubmitted)}
                                      placeholder="e.g. A strong positive relationship between the selected variables"
                                      style={{ width: '100%', minHeight: 42, borderRadius: 12, border: '1px solid #d8c8eb', padding: '10px 12px', background: '#fde8f1', fontFamily: 'Poppins, sans-serif' }}
                                    />
                                    <div style={{ fontSize: '0.95rem', fontStyle: 'italic', color: '#49454f' }}>Sample interpretation: There is a strong positive correlation between Heat Index and Heat-Related Illnesses in Davao Region.</div>
                                  </div>
                                </div>
                                <div className="gap-3" />
                                <div className="gap-3" />
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                  <button
                                    className="submit-btn"
                                    onClick={async ()=> {
                                        if (!pairInterpretation.trim()) return;
                                        // prevent double-submit when already submitted
                                        if (((state.phaseData as any)[2]?.interpretSubmitted)) return;
                                        const enc = { fNNum, fXYNum, fXNum, fYNum, fN_DX, fXSq_DX, fX_DX, fN_DY, fYSq_DY, fY_DY };
                                        try {
                                          const next = await savePhase2Activity4Interpret(user.username, pairInterpretation.trim(), {
                                            var1: pairVar1,
                                            var2: pairVar2,
                                            question: pairResearchQuestion,
                                            computedR: pairComputeR,
                                            strength: pairStrength,
                                            direction: pairDirection,
                                            encodings: enc
                                          });
                                          setState(next);
                                        } catch (err) {
                                          console.error('savePhase2Activity4Interpret failed', err);
                                          try { window.alert('Failed to submit interpretation. Please try again.'); } catch(_){ }
                                        }
                                      }}
                                    disabled={!pairInterpretation.trim() || ((state.phaseData as any)[2]?.interpretSubmitted)}
                                    style={{ height: 44, padding: '0 18px', fontFamily: 'Poppins, sans-serif', minWidth: 200 }}
                                  >
                                    Submit Interpretation
                                  </button>
                                </div>
                              </div>
                              {/* per-item marks now shown inline next to each Direction select */}
                            </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {p2Score !== undefined && (
                    <div className="banner">Teacher Score: {p2Score}%</div>
                  )}
                </div>
              )}
            </div>

            {/* Phase 3 */}
            <div className="accordion-item phase3">
              <div className="accordion-header" onClick={togglePhase3}>
                <h3>Phase 3: From Numbers to Action</h3>
                <span className="right-indicator">{(state.completedPhases.includes(3) || (((state.phaseData as any)[3]?.part1Done) && ((state.phaseData as any)[3]?.saDone) && ((state.phaseData as any)[3]?.recFinalized))) && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{open.p3 ? '▼' : '▶'}</span></span>
              </div>
              {open.p3 && renderPhase3Content()}
            </div>

            {/* Phase 4 */}
            <div className="accordion-item phase4">
              <div className="accordion-header" onClick={togglePhase4}>
                <h3>Phase 4: Share the Story, Reflect on the Journey</h3>
                <span className="right-indicator">{(state.completedPhases.includes(4) || (((state.phaseData as any)[4]?.peerReviewSubmitted) && ((state.phaseData as any)[4]?.missionComplete))) && (<span className="status-tag">Completed</span>)}<span className="toggle-sign">{open.p4 ? '▼' : '▶'}</span></span>
              </div>
              {open.p4 && (
                <div className="accordion-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ background: '#F2FAF5', border: '1px solid #C4E8D4', borderRadius: 12, padding: '14px 16px', color: '#4D7061', minHeight: 260 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: '1.05rem', color: '#2F5242' }}>
                        <span role="img" aria-label="compass">🧭</span>
                        <span style={{ fontWeight: 700 }}>What you will do:</span>
                      </div>
                      <div style={{ lineHeight: 1.6 }}>
                        <p style={{ margin: '0 0 12px' }}>You will transform your evidence-based recommendations into a professional communication piece designed for your chosen stakeholder audience.</p>
                        <p style={{ margin: 0 }}>You will select the most appropriate format (policy brief, infographic, or slide presentation) based on who needs to receive your findings and create a polished final product that clearly communicates your statistical analysis and recommendations.</p>
                      </div>
                    </div>

                    <div style={{ background: '#F2FAF5', border: '1px solid #C4E8D4', borderRadius: 12, padding: '14px 16px', color: '#4D7061', minHeight: 260 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: '1.05rem', color: '#2F5242' }}>
                        <span role="img" aria-label="tools">🛠️</span>
                        <span style={{ fontWeight: 700 }}>How to do it:</span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                        <li>Review your evidence-based recommendations from Activity 3.</li>
                        <li>Choose ONE format that best suits your audience: (a) Policy Brief, (b) Infographic, or (c) Slide Presentation.</li>
                        <li>Use language appropriate for their level of technical understanding.</li>
                        <li>Highlight information most relevant to their decision-making needs.</li>
                        <li>Review your final output to ensure it accurately represents your statistical findings without overstating or misrepresenting the strength of the correlation.</li>
                      </ul>
                    </div>
                  </div>

                  <div style={{ background: '#F2FAF5', border: '1px solid #C4E8D4', borderRadius: 12, padding: '14px 16px', color: '#4D7061', overflowX: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#2F5242' }}>Final Output Rubrics</div>
                    <div style={{ marginTop: 2, fontWeight: 500, color: '#4D7061' }}>Before you start doing your final output, study the rubrics below for your guidance.</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880, color: '#4D7061' }}>
                      <thead>
                        <tr>
                          <th style={{ border: '1px solid #C4E8D4', padding: '8px', background: '#E0F4E8', color: '#2F5242', textAlign: 'left' }}>Criterion</th>
                          <th style={{ border: '1px solid #C4E8D4', padding: '8px', background: '#E0F4E8', color: '#2F5242', textAlign: 'left' }}>Below Proficient (1–2)</th>
                          <th style={{ border: '1px solid #C4E8D4', padding: '8px', background: '#E0F4E8', color: '#2F5242', textAlign: 'left' }}>Proficient (3)</th>
                          <th style={{ border: '1px solid #C4E8D4', padding: '8px', background: '#E0F4E8', color: '#2F5242', textAlign: 'left' }}>Advanced (4)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            c: 'CALCULATION ACCURACY',
                            b: 'r value incorrect or calculation process has major errors',
                            p: 'r correctly calculated using appropriate method; minor errors in process',
                            a: 'r calculated both manually and digitally with verification; all steps shown accurately'
                          },
                          {
                            c: 'INTERPRETATION',
                            b: 'Misidentifies strength or direction; interpretation unclear',
                            p: 'Correctly identifies strength and direction; explains meaning in context',
                            a: 'Thorough interpretation with nuanced understanding; connects to climate patterns effectively'
                          },
                          {
                            c: 'PATTERN ANALYSIS',
                            b: 'Patterns not clearly identified; limited use of visual/numerical evidence',
                            p: 'Patterns identified and described using scatter plot and r value',
                            a: 'Sophisticated pattern analysis; discusses seasonal variations, outliers, or subgroup differences'
                          },
                          {
                            c: 'DATA RELIABILITY EVALUATION',
                            b: 'No discussion of limitations or data quality',
                            p: 'Acknowledges at least 2 limitations (sample size, time period, missing variables)',
                            a: 'Critical evaluation of data quality with specific implications for confidence in findings'
                          },
                          {
                            c: 'EVIDENCE-BASED CONCLUSIONS',
                            b: 'Conclusions not clearly supported by data; confuses correlation with causation',
                            p: 'Conclusions logically follow from data; distinguishes between correlation and causation',
                            a: 'Nuanced conclusions acknowledging what data does and does not show; considers alternative explanations'
                          },
                          {
                            c: 'ACTIONABLE RECOMMENDATION',
                            b: 'No clear recommendation OR recommendation not connected to findings',
                            p: 'Specific, stakeholder-focused recommendation with clear justification',
                            a: 'Highly actionable recommendation with detailed implementation guidance; addresses potential challenges'
                          },
                          {
                            c: 'COMMUNICATION CLARITY',
                            b: 'Output disorganized; findings unclear; poor visual/written presentation',
                            p: 'Clear organization; findings communicated effectively; appropriate visuals',
                            a: 'Professional-quality output; compelling presentation; excellent integration of text, data, visuals'
                          },
                          {
                            c: 'REFLECTION ON PROCESS',
                            b: 'Minimal reflection on assumptions, uncertainties, or learning',
                            p: 'Reflects on analytical assumptions and uncertainties; identifies learning growth',
                            a: 'Deep metacognitive reflection; discusses how experience changed understanding of statistics and climate'
                          }
                        ].map((row, idx) => (
                          <tr key={idx}>
                            <td style={{ border: '1px solid #C4E8D4', padding: '8px', fontWeight: 700, width: '16%' }}>{row.c}</td>
                            <td style={{ border: '1px solid #C4E8D4', padding: '8px', width: '28%' }}>{row.b}</td>
                            <td style={{ border: '1px solid #C4E8D4', padding: '8px', width: '28%' }}>{row.p}</td>
                            <td style={{ border: '1px solid #C4E8D4', padding: '8px', width: '28%' }}>{row.a}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ textAlign: 'right', marginTop: 8, color: '#2F5242', fontWeight: 700 }}>Total Points: _____ / 32</div>
                  </div>

                  <div style={{ background: '#F2FAF5', border: '1px solid #C4E8D4', borderRadius: 12, padding: '16px', color: '#2F5242', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>Final Output Selector</div>
                    <div style={{ color: '#4D7061', lineHeight: 1.5 }}>
                      Choose one format for your final output. Click on the link to access the platform where you can start developing your final output. Once done, save the output as <span style={{ fontWeight: 700 }}>pdf file</span> and upload below.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                      {[{
                        title: 'Option A:',
                        subtitle: 'Policy Brief',
                        body: 'A formal, structured document that presents research findings and actionable recommendations',
                        cta: 'Go to Google Docs',
                        href: 'https://docs.google.com/document/d/1dpALsL8znktjNBH9JDi4XHzp7DLaLv1AZHe46vykHho/edit?usp=sharing'
                      }, {
                        title: 'Option B:',
                        subtitle: 'Infographics',
                        body: 'A visually engaging, one-page graphic design that combines data visualizations, icons, charts, and minimal text to communicate key statistics and recommendations',
                        cta: 'Go to Canva',
                        href: 'https://www.canva.com/design/DAHAYXJ9ZtU/nH8b2T0QqAfyEHYl0e2lVg/edit?utm_content=DAHAYXJ9ZtU&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton'
                      }, {
                        title: 'Option C:',
                        subtitle: 'Slide Presentation',
                        body: 'A multi-slide digital presentation that guides an audience through your findings step-by-step',
                        cta: 'Go to Google Slides',
                        href: 'https://docs.google.com/presentation/d/1j-h9xS-VPNi7qzvgokKTP2_33eAtwpNbTzdv6v9eojE/edit?usp=sharing'
                      }].map((card, idx) => (
                        <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #C4E8D4', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 3px 8px rgba(0,0,0,0.04)' }}>
                          <div>
                            <div style={{ fontWeight: 800, color: '#2F5242' }}>{card.title}</div>
                            <div style={{ fontWeight: 800, color: '#2F5242', fontSize: '1.05rem' }}>{card.subtitle}</div>
                          </div>
                          <div style={{ color: '#4D7061', lineHeight: 1.6 }}>{card.body}</div>
                          <a href={card.href} target="_blank" rel="noopener noreferrer" style={{ marginTop: 'auto', textDecoration: 'none' }}>
                            <div style={{ textAlign: 'center', background: '#C4E8D4', color: '#2F5242', padding: '12px 10px', borderRadius: 10, fontWeight: 800 }}>
                              {card.cta}
                            </div>
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: '#F2FAF5', border: '1px solid #C4E8D4', borderRadius: 12, padding: '16px', color: '#2F5242', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>Peer Review: Quality Check Before Submission</div>
                      {(state.phaseData as any)[4]?.peerReviewSubmitted && (<span className="status-tag">Completed</span>)}
                    </div>
                    <div style={{ color: '#4D7061', lineHeight: 1.6 }}>
                      Before you upload the pdf file of your final output, make sure to ask one classmate who is not part of your group to identify your output&rsquo;s strength and possible areas for improvement. Ask your classmate to answer the following:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, color: '#2F5242' }}>
                      <div>1. <span style={{ fontWeight: 800 }}>CLARITY:</span> Can you understand their finding and recommendation without asking questions?</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, paddingLeft: 14, color: '#4D7061' }}>
                        {['Very clear','Mostly clear','Confusing'].map((opt) => (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={peerAnswers[0].includes(opt)} disabled={peerSubmitted || !!(state.phaseData as any)[4]?.peerReviewSubmitted || !!(state.phaseData as any)[4]?.missionComplete} onChange={() => {
                              setPeerAnswers(prev => {
                                const copy = prev.map(a => a.slice());
                                const idx = copy[0].indexOf(opt);
                                if (idx === -1) copy[0].push(opt); else copy[0].splice(idx,1);
                                return copy;
                              });
                            }} />
                            {opt}
                          </label>
                        ))}
                      </div>

                      <div>2. <span style={{ fontWeight: 800 }}>EVIDENCE:</span> Is their recommendation clearly supported by their r value and interpretation?</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, paddingLeft: 14, color: '#4D7061' }}>
                        {['Strong support','Some support','Weak support'].map((opt) => (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={peerAnswers[1].includes(opt)} disabled={peerSubmitted || !!(state.phaseData as any)[4]?.peerReviewSubmitted || !!(state.phaseData as any)[4]?.missionComplete} onChange={() => {
                              setPeerAnswers(prev => {
                                const copy = prev.map(a => a.slice());
                                const idx = copy[1].indexOf(opt);
                                if (idx === -1) copy[1].push(opt); else copy[1].splice(idx,1);
                                return copy;
                              });
                            }} />
                            {opt}
                          </label>
                        ))}
                      </div>

                      <div>3. <span style={{ fontWeight: 800 }}>ACTIONABILITY:</span> Could a stakeholder actually implement this recommendation?</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, paddingLeft: 14, color: '#4D7061' }}>
                        {['Yes, very specific','Somewhat','Too vague'].map((opt) => (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={peerAnswers[2].includes(opt)} disabled={peerSubmitted || !!(state.phaseData as any)[4]?.peerReviewSubmitted || !!(state.phaseData as any)[4]?.missionComplete} onChange={() => {
                              setPeerAnswers(prev => {
                                const copy = prev.map(a => a.slice());
                                const idx = copy[2].indexOf(opt);
                                if (idx === -1) copy[2].push(opt); else copy[2].splice(idx,1);
                                return copy;
                              });
                            }} />
                            {opt}
                          </label>
                        ))}
                      </div>

                      <div>4. <span style={{ fontWeight: 800 }}>HONESTY:</span> Did they acknowledge limitations of their data?</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, paddingLeft: 14, color: '#4D7061' }}>
                        {['Yes','Somewhat','No'].map((opt) => (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={peerAnswers[3].includes(opt)} disabled={peerSubmitted || !!(state.phaseData as any)[4]?.peerReviewSubmitted || !!(state.phaseData as any)[4]?.missionComplete} onChange={() => {
                              setPeerAnswers(prev => {
                                const copy = prev.map(a => a.slice());
                                const idx = copy[3].indexOf(opt);
                                if (idx === -1) copy[3].push(opt); else copy[3].splice(idx,1);
                                return copy;
                              });
                            }} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#2F5242' }}>
                      <label style={{ fontWeight: 800 }}>ONE STRENGTH <span style={{ fontWeight: 500 }}>of their work:</span></label>
                      <input value={peerStrength} disabled={peerSubmitted || !!(state.phaseData as any)[4]?.peerReviewSubmitted} onChange={(e)=>setPeerStrength(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />

                      <label style={{ fontWeight: 800 }}>ONE SUGGESTION <span style={{ fontWeight: 500 }}>for improvement:</span></label>
                      <input value={peerSuggestion} disabled={peerSubmitted || !!(state.phaseData as any)[4]?.peerReviewSubmitted || !!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=>setPeerSuggestion(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />

                      <label style={{ fontWeight: 500 }}>Username of Peer reviewer:</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, alignItems: 'center' }}>
                        <input value={peerReviewer} disabled={peerSubmitted || !!(state.phaseData as any)[4]?.peerReviewSubmitted || !!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=>setPeerReviewer(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />
                        <button style={{ width: '100%', padding: '12px 10px', borderRadius: 10, border: 'none', background: ((state.phaseData as any)[4]?.peerReviewSubmitted || peerSubmitted || (state.phaseData as any)[4]?.missionComplete ? '#E5EDF9' : '#C4E8D4'), color: '#2F5242', fontWeight: 800, cursor: ((state.phaseData as any)[4]?.peerReviewSubmitted || peerSubmitted || (state.phaseData as any)[4]?.missionComplete ? 'not-allowed' : 'pointer') }} disabled={!!(state.phaseData as any)[4]?.peerReviewSubmitted || peerSubmitted || !!(state.phaseData as any)[4]?.missionComplete} onClick={() => {
                          const payload = {
                            q1: peerAnswers[0], q2: peerAnswers[1], q3: peerAnswers[2], q4: peerAnswers[3], strength: peerStrength, suggestion: peerSuggestion, reviewer: peerReviewer
                          };
                          try {
                            const next = savePhase4PeerReview(user.username, payload);
                            setState(next);
                          } catch (e) { const next = savePhase4SubmitReview(user.username); setState(next); }
                          setPeerSubmitted(true);
                        }}>Submit Review</button>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#F2FAF5', border: '1px solid #C4E8D4', borderRadius: 12, padding: '16px', color: '#2F5242', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>Reflection and Final Submission</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <span>1. How confident am I in my correlation calculation?</span>
                        <input value={reflectionFields.confidence || ''} disabled={!!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=> setReflectionFields(prev=> ({...prev, confidence: e.target.value}))} style={{ flex: '1 1 240px', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242', fontStyle: 'italic' }} placeholder="1 (not confident) -> 5 (very confident)" />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span>2. What contributed to this confidence level?</span>
                        <input value={reflectionFields.contributed || ''} disabled={!!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=> setReflectionFields(prev=> ({...prev, contributed: e.target.value}))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span>3. What was most challenging about this project?</span>
                        <input value={reflectionFields.challenging || ''} disabled={!!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=> setReflectionFields(prev=> ({...prev, challenging: e.target.value}))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span>4. How has this project changed my understanding of:</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 14 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            <span style={{ minWidth: 80 }}>a. Statistics:</span>
                            <input value={reflectionFields.stats || ''} disabled={!!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=> setReflectionFields(prev=> ({...prev, stats: e.target.value}))} style={{ flex: '1 1 240px', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            <span style={{ minWidth: 80 }}>b. Climate:</span>
                            <input value={reflectionFields.climate || ''} disabled={!!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=> setReflectionFields(prev=> ({...prev, climate: e.target.value}))} style={{ flex: '1 1 240px', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            <span style={{ minWidth: 80 }}>c. The connection between them:</span>
                            <input value={reflectionFields.connection || ''} disabled={!!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=> setReflectionFields(prev=> ({...prev, connection: e.target.value}))} style={{ flex: '1 1 240px', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span>5. If I could extend this project, I would investigate:</span>
                        <input value={reflectionFields.extend || ''} disabled={!!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=> setReflectionFields(prev=> ({...prev, extend: e.target.value}))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span>6. One thing I learned about myself as a learner:</span>
                        <input value={reflectionFields.learned || ''} disabled={!!(state.phaseData as any)[4]?.missionComplete} onChange={(e)=> setReflectionFields(prev=> ({...prev, learned: e.target.value}))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      <span style={{ fontWeight: 800 }}>Upload your Final Output here.</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: '#2F5242' }}>
                        <span style={{ fontWeight: 600 }}>Upload file</span>
                        <input
                          type="file"
                          disabled={!!(state.phaseData as any)[4]?.missionComplete}
                          onChange={(e)=>{
                            const f = e.target.files?.[0] || null;
                            setReflectionFile(f);
                            if (!f) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const data = ev.target?.result as string;
                              setReflectionUpload({ url: data, mimeType: f.type });
                              try {
                                const next = savePhase4Reflection(user.username, reflectionFields || {}, data, f.type);
                                setState(next);
                              } catch (err) {
                                // ignore persistence errors
                              }
                            };
                            reader.readAsDataURL(f);
                          }}
                          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #C4E8D4', background: '#FFFFFF', color: '#2F5242' }}
                        />
                        {reflectionUpload && (<div style={{ fontSize: 12 }}>Saved file preview available</div>)}
                      </div>
                      {reflectionUpload && (
                        <div style={{ marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff', minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {reflectionUpload.mimeType?.includes('pdf') ? (
                            <iframe src={reflectionUpload.url} title="Reflection PDF preview" style={{ width: '100%', aspectRatio: '16 / 9', height: 'auto', border: 0 }} />
                          ) : (
                            <img src={reflectionUpload.url} alt="Reflection preview" style={{ width: '100%', height: 'auto', objectFit: 'contain', aspectRatio: '16 / 9' }} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {p4Score !== undefined && (
                    <div className="banner">Teacher Score: {p4Score}%</div>
                  )}
                    <div className="section-actions">
                    <button className="complete-btn" disabled={!!(state.phaseData as any)[4]?.missionComplete} onClick={() => {
                      // persist reflection fields and uploaded file, then mark mission complete
                      const finalize = async (uploadUrl?: string, mime?: string) => {
                        try { savePhase4Reflection(user.username, reflectionFields || {}, uploadUrl, mime); } catch (e) {}
                        const missionState = savePhase4MissionComplete(user.username);
                        const next = normalizeLesson1State({
                          ...missionState,
                          completedPhases: Array.from(new Set([...(missionState.completedPhases || []), 4])),
                          phaseProgress: { ...(missionState.phaseProgress || {}), 4: 25 },
                          unlockedPhase: Math.max(missionState.unlockedPhase || 0, 5),
                        });
                        saveLesson1State(user.username, next);
                        setState(next);
                        // upsert lesson1 response record
                        try {
                          const prof = await getMyProfile();
                          const studentId = prof?.id;
                          if (studentId) {
                            await upsertResponse({
                              student_id: studentId,
                              activity_type: 'lesson1',
                              answers: {
                                __meta: {
                                  schemaVersion: 1,
                                  source: 'student-portal',
                                  activityType: 'lesson1',
                                  submittedAt: new Date().toISOString(),
                                  username: user.username,
                                  stage: 'final'
                                },
                                lesson1State: next
                              }
                            });
                          }
                        } catch (e) {
                          console.error('upsert lesson1 response', e);
                        }
                        alert('Mission Complete! Returning to Home.');
                        onBack();
                      };

                      if (reflectionFile) {
                        const f = reflectionFile;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const data = ev.target?.result as string;
                          finalize(data, f.type);
                        };
                        reader.readAsDataURL(f);
                      } else if (reflectionUpload?.url) {
                        finalize(reflectionUpload.url, reflectionUpload.mimeType);
                      } else {
                        finalize();
                      }
                    }}>Mission Complete</button>
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

export default Lesson1;


// removed: renderPhase3Content top-level helper; now defined inside component
