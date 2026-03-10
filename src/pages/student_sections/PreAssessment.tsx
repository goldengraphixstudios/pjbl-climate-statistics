import React, { useState, useEffect } from 'react';
import '../../styles/StudentPortal.css';
import '../../styles/PreAssessment.css';
import { setUserProgress, savePreAssessmentPart1Score, savePreAssessmentPart1Responses, savePreAssessmentPart2Responses } from '../../services/progressService';
import { ActivityType, upsertResponse, getResponseForStudentActivity } from '../../services/responsesService';
import { getFeedbackForStudentActivity, acknowledgeFeedback } from '../../services/feedbackService';
import { getMyProfile } from '../../services/profilesService';
import { resolveStudentId } from '../../services/studentStateService';

interface AuthUser {
  id?: string;
  username: string;
  role: 'student' | 'teacher' | 'admin' | null;
}

interface SectionPageProps {
  user: AuthUser;
  onBack: () => void;
}

type Option = 'A' | 'B' | 'C' | 'D';

const imageForSet = (index: number) => `/assets/pre-assessment/pre-assessment_page-${String(index + 1).padStart(4, '0')}.jpg`;

// Set 1 data table (Davao City 2023)
const davaoMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const davaoTemps = [26.8,27.1,27.5,28.2,28.5,27.9,27.6,27.8,27.7,27.4,27.0,26.9];
const davaoRain = [95,78,102,88,145,178,156,142,165,188,152,125];

// Set 2 data table (Quarterly rainfall vs flooding incidents)
const quarters = ['Q1 2022','Q2 2022','Q3 2022','Q4 2022','Q1 2023','Q2 2023','Q3 2023','Q4 2023'];
const quarterlyRain = [315,430,520,455,305,621,453,445];
const quarterlyFloods = [3,7,11,9,2,10,8,9];
// Set 4 data table (humidity vs dengue cases)
const quartersH = ['Q1 2022','Q2 2022','Q3 2022','Q4 2022','Q1 2023','Q2 2023','Q3 2023','Q4 2023'];
const avgHumidity = [65,75,80,78,70,74,80,75];
const dengueCases = [145,198,267,223,156,205,245,218];
// Set 3 scatter data (temperature vs electricity consumption)
const tempsX = [26.0,26.4,26.8,27.2,27.7,28.1,28.5,29.0];
const elecY = [260,300,330,345,370,395,420,470];
// Set 6 scatter (years since 2015 vs sea level change)
const yearsSince2015 = [0,1,2,3,4,5,6,7,8,9,10];
const seaLevelChange = [2,4,6,8,10,12,14,20,24,28,30];
// Set 7 scatter (water quality vs tourist arrivals)
const waterQualityX = [62,68,74,81,89];
const touristArrivalsY = [118,132,148,163,175];
// Set 8 table (AQI vs respiratory admissions) months Jan..Oct
const aqiMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct'];
const aqiX = [42,38,45,58,72,85,79,68,61,52];
const respY = [156,148,165,198,245,288,268,232,210,182];
// Set 9 table (humidity vs dengue cases) months Jan..Oct
const humMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct'];
const humX = [68,71,73,76,82,88,86,84,79,75];
const humDengueY = [45,52,58,67,89,108,102,95,78,65];
// Set 10 scatter (temperature vs water consumption)
const dailyTempX = [25.2,25.8,26.4,26.9,27.3,27.8,28.2,28.6];
const waterConsumptionY = [305,345,385,425,465,505,545,580];

// Adjust sets: Set 1 has 1 question; Set 2 has 1 question; Set 3 has 2 questions; Set 4 has 1 question; Set 5 has 2 questions
const setQuestionCounts = [1, 1, 2, 1, 2, 2, 1, 1, 2, 2]; // sums to 15
// Answer keys per global item index: Q1=C, Q2=A, Q3=C, Q4=D, Q5=A, Q6=B, Q7=A, rest placeholders
const answerKey: Option[] = ['C','A','C','D','A','B','A','B','A','C','B','A','C','D','A'];

const likertLabels = ['Not Aware', 'A Little Aware', 'Aware', 'Very Aware']; // 1..4

const getGroupScores = (itemCorrect: boolean[]) => ({
  lc12: itemCorrect.slice(0, 5).filter(Boolean).length,
  lc34: itemCorrect.slice(5, 10).filter(Boolean).length,
  lc56: itemCorrect.slice(10, 15).filter(Boolean).length,
});

const PreAssessment: React.FC<SectionPageProps> = ({ user, onBack }) => {
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
  const [phase, setPhase] = useState<'part1'|'part2'>('part1');
  const [currentSet, setCurrentSet] = useState(0);
  const totalQuestions = setQuestionCounts.reduce((a,b)=>a+b,0);
  const [responses, setResponses] = useState<(Option|null)[]>(Array(totalQuestions).fill(null));
  const [part2Responses, setPart2Responses] = useState<number[]>(Array(17).fill(0));
  const [itemCorrect, setItemCorrect] = useState<boolean[]>([]);
  const [part2Submitted, setPart2Submitted] = useState(false);
  const [serverFeedback, setServerFeedback] = useState<any>(null);
  const [existingResponse, setExistingResponse] = useState<any>(null);
  const isLockedAfterSubmit = !!existingResponse && user.role !== 'admin';

  // fetch existing response and feedback once
  useEffect(() => {
    const load = async () => {
      try {
        const prof = await getMyProfile();
        const studentId = prof?.id || await resolveStudentId(user.username);
        if (!studentId) return;
        const resp = await getResponseForStudentActivity(studentId, 'pre');
        if (resp) {
          setExistingResponse(resp);
          // prefill answers
          if (resp.answers?.part1) setResponses(resp.answers.part1);
          if (resp.answers?.part2) {
            setPart2Responses(resp.answers.part2);
            setPart2Submitted(true);
          }
        }
        const fb = await getFeedbackForStudentActivity(studentId, 'pre');
        if (fb) setServerFeedback(fb);
      } catch (e) {
        console.error('load existing preassessment data', e);
      }
    };
    load();
    const pollId = setInterval(load, 10000);
    return () => clearInterval(pollId);
  }, []);

  const globalIndexStartForSet = (setIdx: number) => setQuestionCounts.slice(0, setIdx).reduce((a,b)=>a+b, 0);
  const isSetComplete = (setIdx: number) => {
    const start = globalIndexStartForSet(setIdx);
    const count = setQuestionCounts[setIdx];
    for (let i=0;i<count;i++) {
      if (!responses[start + i]) return false;
    }
    return true;
  };

  const handleOptionSelect = (globalIndex: number, opt: Option) => {
    setResponses(prev => {
      const next = [...prev];
      next[globalIndex] = opt;
      return next;
    });
  };

  const nextSet = async () => {
    if (isLockedAfterSubmit) return;
    if (user.role !== 'admin' && !isSetComplete(currentSet)) return;
    const isLast = currentSet === setQuestionCounts.length - 1;
      if (isLast) {
      // Evaluate silently and proceed to part 2
      const itemCorrectLocal = responses.map((r, i) => r === answerKey[i]);
      setItemCorrect(itemCorrectLocal);
      const correct = itemCorrectLocal.filter(Boolean).length;
      const part1GroupScores = getGroupScores(itemCorrectLocal);
      savePreAssessmentPart1Score(user.username, correct, itemCorrectLocal);
      // save raw responses (letters) so teacher can review them
      try {
        console.log('saving part1 responses to supabase', responses);
        await savePreAssessmentPart1Responses(user.username, responses.map(r => r || ''));
        console.log('saved part1 responses');
      } catch (err) {
        console.error('error saving part1 responses', err);
      }
      setPhase('part2');
      // mark half-progress for pre-assessment part completion
      setUserProgress(user.username, 1, 50);
      // also upsert unified response row
      try {
        const prof = await getMyProfile();
        const studentId = prof?.id || await resolveStudentId(user.username);
        if (studentId) {
          await upsertResponse({
            student_id: studentId,
            activity_type: 'pre',
            answers: {
              __meta: {
                schemaVersion: 1,
                source: 'student-portal',
                activityType: 'pre',
                submittedAt: new Date().toISOString(),
                username: user.username,
                stage: 'part1'
              },
              part1: responses,
              part1Score: correct,
              part1GroupScores
            },
            correctness: { part1: itemCorrectLocal }
          });
        }
      } catch (e) {
        console.error('upsert pre response part1', e);
      }
      return;
    }
    // save current Part 1 responses incrementally so teacher can view letters as students progress
    try {
      console.log('saving incremental part1 responses', currentSet, responses);
      await savePreAssessmentPart1Responses(user.username, responses.map(r => r || ''));
      console.log('incremental save done');
    } catch (err) {
      console.error('error saving incremental responses', err);
    }
    setCurrentSet(s => s + 1);
  };

  const submitPart2 = async () => {
    if (isLockedAfterSubmit) return;
    if (user.role !== 'admin' && part2Responses.some(v => v === 0)) return; // must answer all 17 unless admin
    try {
      console.log('saving part2 responses', part2Responses);
      await savePreAssessmentPart2Responses(user.username, part2Responses);
      console.log('saved part2 responses');
    } catch (err) {
      console.error('error saving part2 responses', err);
    }
    setUserProgress(user.username, 1, 100);
    setPart2Submitted(true);
    // persist combined to responses table
    try {
      const prof = await getMyProfile();
      const studentId = prof?.id || await resolveStudentId(user.username);
      if (studentId) {
        const correct = itemCorrect.filter(Boolean).length;
        await upsertResponse({
          student_id: studentId,
          activity_type: 'pre',
          answers: {
            __meta: {
              schemaVersion: 1,
              source: 'student-portal',
              activityType: 'pre',
              submittedAt: new Date().toISOString(),
              username: user.username,
              stage: 'final'
            },
            part1: responses,
            part2: part2Responses,
            part1Score: correct,
            part1GroupScores: getGroupScores(itemCorrect)
          },
          correctness: { part1: itemCorrect }
        });
      }
    } catch (e) {
      console.error('upsert pre response final', e);
    }
  };

  const handleAcknowledge = async () => {
    try {
      const prof = await getMyProfile();
      const studentId = prof?.id || await resolveStudentId(user.username);
      if (studentId) {
        const fb = await acknowledgeFeedback(studentId, 'pre');
        setServerFeedback(fb);
      }
    } catch (e) {
      console.error('ackpre', e);
    }
  };

  const renderPart1 = () => {
    const start = globalIndexStartForSet(currentSet);
    const count = setQuestionCounts[currentSet];
    const items = Array.from({length: count}, (_, idx) => start + idx);
    const isSetOne = currentSet === 0;
    const isSetTwo = currentSet === 1;
    const isSetThree = currentSet === 2;
    const isSetFour = currentSet === 3;
    const isSetFive = currentSet === 4;
    const isSetSix = currentSet === 5;
    const isSetSeven = currentSet === 6;
    const isSetEight = currentSet === 7;
    const isSetNine = currentSet === 8;
    const isSetTen = currentSet === 9;
    return (
      <section className="pre-assessment-set">
        {/* Top lines for Part I */}
        <div className="assessment-top">
          <div className="assessment-title">Part I. Student Achievement in Statistical Literacy and Critical Thinking (SASLCT)</div>
          <div className="assessment-instructions"><span className="instructions-label">Instructions:</span> Read each item carefully. Select the correct answer from the choices.</div>
        </div>
        <div className="set-left">
          {isSetOne ? (
            <div className="data-table-wrapper">
              <div className="table-caption">Table 1. Average Monthly Temperature and Total Rainfall in Davao City (2023)</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Average Temperature (°C)</th>
                    <th>Total Rainfall (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {davaoMonths.map((m, i) => (
                    <tr key={m}>
                      <td>{m}</td>
                      <td>{davaoTemps[i]}</td>
                      <td>{davaoRain[i]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isSetTwo ? (
            <div className="data-table-wrapper">
              <div className="table-caption">Table 2. Quarterly Rainfall and Flooding Incidents in Davao City (2022-2023)</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Quarter</th>
                    <th>Total Rainfall (mm)</th>
                    <th>Number of Flooding Incidents</th>
                  </tr>
                </thead>
                <tbody>
                  {quarters.map((q, i) => (
                    <tr key={q}>
                      <td>{q}</td>
                      <td>{quarterlyRain[i]}</td>
                      <td>{quarterlyFloods[i]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-given">Given: Calculated r = 0.89</div>
            </div>
          ) : isSetThree ? (
            <div className="figure-wrapper">
              <div className="figure-caption">Figure 1. Monthly Temperature and Household Electricity Consumption in Davao City (2023)</div>
              <svg className="chart-svg" viewBox="0 0 420 280" preserveAspectRatio="xMidYMid meet" aria-label="Temperature vs Electricity Consumption">
                {(() => {
                  const margin = { left: 42, right: 14, top: 20, bottom: 36 };
                  const innerW = 420 - margin.left - margin.right;
                  const innerH = 280 - margin.top - margin.bottom;
                  const minX = Math.min(...tempsX);
                  const maxX = Math.max(...tempsX);
                  const minY = Math.min(...elecY);
                  const maxY = Math.max(...elecY);
                  const xScale = (x: number) => margin.left + ( (x - minX) / (maxX - minX) ) * innerW;
                  const yScale = (y: number) => margin.top + innerH - ( (y - minY) / (maxY - minY) ) * innerH;
                  const elements: JSX.Element[] = [];
                  elements.push(<line key="x-axis" x1={margin.left} y1={margin.top+innerH} x2={margin.left+innerW} y2={margin.top+innerH} stroke="#9fb7df" strokeWidth={1} />);
                  elements.push(<line key="y-axis" x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top+innerH} stroke="#9fb7df" strokeWidth={1} />);
                  for (let i=0;i<4;i++) {
                    const y = margin.top + (i+1)*(innerH/5);
                    elements.push(<line key={`g${i}`} x1={margin.left} y1={y} x2={margin.left+innerW} y2={y} stroke="#eef3fb" strokeWidth={1} />);
                  }
                  tempsX.forEach((x, idx) => {
                    const y = elecY[idx];
                    elements.push(<circle key={`p${idx}`} cx={xScale(x)} cy={yScale(y)} r={4.5} fill="#2C4795" opacity={0.9} />);
                  });
                  const y1 = 63.80*minX - 1390.75;
                  const y2 = 63.80*maxX - 1390.75;
                  elements.push(<line key="trend" x1={xScale(minX)} y1={yScale(y1)} x2={xScale(maxX)} y2={yScale(y2)} stroke="#43A047" strokeWidth={2} />);
                  elements.push(<text key="xlabel" x={margin.left + innerW/2} y={margin.top+innerH+28} textAnchor="middle" fill="#2C4795" fontSize="12">Average Temperature (°C)</text>);
                  elements.push(<text key="ylabel" transform={`translate(${margin.left-30}, ${margin.top + innerH/2}) rotate(-90)`} textAnchor="middle" fill="#2C4795" fontSize="12">Electricity Consumption (kWh/household)</text>);
                  return <g>{elements}</g>;
                })()}
              </svg>
              <div className="figure-given">Calculated r = 0.99</div>
              <div className="figure-given">Trendline: y = 63.80x – 1390.75</div>
            </div>
          ) : isSetFour ? (
            <div className="data-table-wrapper">
              <div className="table-caption">Table 3. Quarterly Average Humidity and Reported Dengue Cases in Davao City</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Quarter</th>
                    <th>Average Humidity (%)</th>
                    <th>Dengue Cases</th>
                  </tr>
                </thead>
                <tbody>
                  {quartersH.map((q, i) => (
                    <tr key={q}>
                      <td>{q}</td>
                      <td>{avgHumidity[i]}</td>
                      <td>{dengueCases[i]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-given">Given: Calculated r = 0.95</div>
            </div>
          ) : isSetFive ? (
            <div className="data-table-wrapper">
              <div className="table-caption">Table 4. Average Annual Temperature in Davao City (2014-2023)</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Year (X)</th>
                    <th>Years Since 2014 (x)</th>
                    <th>Average Temperature °C (Y)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {y:2014,x:0,temp:27.2},
                    {y:2015,x:1,temp:27.3},
                    {y:2016,x:2,temp:27.6},
                    {y:2017,x:3,temp:27.5},
                    {y:2018,x:4,temp:27.8},
                    {y:2019,x:5,temp:27.9},
                    {y:2020,x:6,temp:28.0},
                    {y:2021,x:7,temp:28.2},
                    {y:2022,x:8,temp:28.3},
                    {y:2023,x:9,temp:28.5},
                  ].map((row, i) => (
                    <tr key={i}>
                      <td>{row.y}</td>
                      <td>{row.x}</td>
                      <td>{row.temp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-given">Calculated regression equation: Y = 0.14x + 27.20</div>
            </div>
          ) : isSetSix ? (
            <div className="figure-wrapper">
              <div className="figure-caption">Figure 2. Relationship Between Years and Sea Level Change Relative to 2015</div>
              <svg className="chart-svg" viewBox="0 0 420 280" preserveAspectRatio="xMidYMid meet" aria-label="Years vs Sea Level Change">
                {(() => {
                  const margin = { left: 42, right: 14, top: 20, bottom: 36 };
                  const innerW = 420 - margin.left - margin.right;
                  const innerH = 280 - margin.top - margin.bottom;
                  const minX = Math.min(...yearsSince2015);
                  const maxX = Math.max(...yearsSince2015);
                  const minY = Math.min(...seaLevelChange);
                  const maxY = Math.max(...seaLevelChange);
                  const xScale = (x: number) => margin.left + ( (x - minX) / (maxX - minX) ) * innerW;
                  const yScale = (y: number) => margin.top + innerH - ( (y - minY) / (maxY - minY) ) * innerH;
                  const elements: JSX.Element[] = [];
                  elements.push(<line key="x-axis6" x1={margin.left} y1={margin.top+innerH} x2={margin.left+innerW} y2={margin.top+innerH} stroke="#9fb7df" strokeWidth={1} />);
                  elements.push(<line key="y-axis6" x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top+innerH} stroke="#9fb7df" strokeWidth={1} />);
                  for (let i=0;i<4;i++) {
                    const y = margin.top + (i+1)*(innerH/5);
                    elements.push(<line key={`g6${i}`} x1={margin.left} y1={y} x2={margin.left+innerW} y2={y} stroke="#eef3fb" strokeWidth={1} />);
                  }
                  yearsSince2015.forEach((x, idx) => {
                    const y = seaLevelChange[idx];
                    elements.push(<circle key={`s6${idx}`} cx={xScale(x)} cy={yScale(y)} r={4.5} fill="#2C4795" opacity={0.9} />);
                  });
                  const y1 = 2.89*minX - 0.09;
                  const y2 = 2.89*maxX - 0.09;
                  elements.push(<line key="trend6" x1={xScale(minX)} y1={yScale(y1)} x2={xScale(maxX)} y2={yScale(y2)} stroke="#43A047" strokeWidth={2} />);
                  elements.push(<text key="xlabel6" x={margin.left + innerW/2} y={margin.top+innerH+28} textAnchor="middle" fill="#2C4795" fontSize="12">Years Since 2015 (x)</text>);
                  elements.push(<text key="ylabel6" transform={`translate(${margin.left-30}, ${margin.top + innerH/2}) rotate(-90)`} textAnchor="middle" fill="#2C4795" fontSize="12">Sea Level Change (cm)</text>);
                  return <g>{elements}</g>;
                })()}
              </svg>
              <div className="figure-given">Calculated Values: Slope (b) = 2.89 cm per year | Y-intercept (a) = -0.09 cm</div>
              <div className="figure-given">Regression equation: Y = 2.89x – 0.09</div>
            </div>
          ) : isSetSeven ? (
            <div className="figure-wrapper">
              <div className="figure-caption">Figure 3. Relationship Between Beach Water Quality Score and Tourist Arrivals</div>
              <svg className="chart-svg" viewBox="0 0 420 280" preserveAspectRatio="xMidYMid meet" aria-label="Water Quality vs Tourist Arrivals">
                {(() => {
                  const margin = { left: 42, right: 14, top: 20, bottom: 36 };
                  const innerW = 420 - margin.left - margin.right;
                  const innerH = 280 - margin.top - margin.bottom;
                  const minX = Math.min(...waterQualityX);
                  const maxX = Math.max(...waterQualityX);
                  const minY = Math.min(...touristArrivalsY);
                  const maxY = Math.max(...touristArrivalsY);
                  const xScale = (x: number) => margin.left + ( (x - minX) / (maxX - minX) ) * innerW;
                  const yScale = (y: number) => margin.top + innerH - ( (y - minY) / (maxY - minY) ) * innerH;
                  const elements: JSX.Element[] = [];
                  elements.push(<line key="x-axis7" x1={margin.left} y1={margin.top+innerH} x2={margin.left+innerW} y2={margin.top+innerH} stroke="#9fb7df" strokeWidth={1} />);
                  elements.push(<line key="y-axis7" x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top+innerH} stroke="#9fb7df" strokeWidth={1} />);
                  for (let i=0;i<4;i++) {
                    const y = margin.top + (i+1)*(innerH/5);
                    elements.push(<line key={`g7${i}`} x1={margin.left} y1={y} x2={margin.left+innerW} y2={y} stroke="#eef3fb" strokeWidth={1} />);
                  }
                  waterQualityX.forEach((x, idx) => {
                    const y = touristArrivalsY[idx];
                    elements.push(<circle key={`s7${idx}`} cx={xScale(x)} cy={yScale(y)} r={4.5} fill="#2C4795" opacity={0.9} />);
                  });
                  elements.push(<text key="xlabel7" x={margin.left + innerW/2} y={margin.top+innerH+28} textAnchor="middle" fill="#2C4795" fontSize="12">Water Quality Score (X)</text>);
                  elements.push(<text key="ylabel7" transform={`translate(${margin.left-30}, ${margin.top + innerH/2}) rotate(-90)`} textAnchor="middle" fill="#2C4795" fontSize="12">Tourist Arrivals (thousands/year)</text>);
                  return <g>{elements}</g>;
                })()}
              </svg>
              <div className="figure-given">Data Points: (62, 118), (68, 132), (74, 148), (81, 163), (89, 175)</div>
              <div className="figure-given">Given Calculations: n = 5, ΣX = 374, ΣY = 736; ΣX² = 28,426, ΣXY = 56,022; X̄ = 74.8, Ȳ = 147.2</div>
            </div>
          ) : isSetEight ? (
            <div className="data-table-wrapper">
              <div className="table-caption">Table 5. Monthly AQI and Respiratory Hospital Admissions</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>AQI (X)</th>
                    <th>Respiratory Admissions (Y)</th>
                  </tr>
                </thead>
                <tbody>
                  {aqiMonths.map((m, i) => (
                    <tr key={m}>
                      <td>{m}</td>
                      <td>{aqiX[i]}</td>
                      <td>{respY[i]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-given">Given regression equation: y = 2.5x + 59.2</div>
              <div className="table-given">Where: Y = respiratory admissions per month, X = Air Quality Index</div>
            </div>
          ) : isSetNine ? (
            <div className="data-table-wrapper">
              <div className="table-caption">Table 6. Average Monthly Humidity and Reported Dengue Cases</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Humidity % (X)</th>
                    <th>Dengue Cases (Y)</th>
                  </tr>
                </thead>
                <tbody>
                  {humMonths.map((m, i) => (
                    <tr key={m}>
                      <td>{m}</td>
                      <td>{humX[i]}</td>
                      <td>{humDengueY[i]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-given">Regression equation: y = 3.2x – 174.3</div>
              <div className="table-given">Sample size: n = 10 months</div>
            </div>
          ) : isSetTen ? (
            <div className="figure-wrapper">
              <div className="figure-caption">Figure 4. Daily Average Temperature and Water Consumption per Household</div>
              <svg className="chart-svg" viewBox="0 0 420 280" preserveAspectRatio="xMidYMid meet" aria-label="Temperature vs Water Consumption">
                {(() => {
                  const margin = { left: 42, right: 14, top: 20, bottom: 36 };
                  const innerW = 420 - margin.left - margin.right;
                  const innerH = 280 - margin.top - margin.bottom;
                  // Per requirement: X-Axis is Water Consumption (liters/day), Y-Axis is Temperature (°C)
                  const minX = Math.min(...waterConsumptionY);
                  const maxX = Math.max(...waterConsumptionY);
                  const minY = Math.min(...dailyTempX);
                  const maxY = Math.max(...dailyTempX);
                  const xScale = (x: number) => margin.left + ((x - minX) / (maxX - minX)) * innerW;
                  const yScale = (y: number) => margin.top + innerH - ((y - minY) / (maxY - minY)) * innerH;
                  const elements: JSX.Element[] = [];
                  elements.push(<line key="x-axis10" x1={margin.left} y1={margin.top+innerH} x2={margin.left+innerW} y2={margin.top+innerH} stroke="#9fb7df" strokeWidth={1} />);
                  elements.push(<line key="y-axis10" x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top+innerH} stroke="#9fb7df" strokeWidth={1} />);
                  for (let i=0;i<4;i++) {
                    const y = margin.top + (i+1)*(innerH/5);
                    elements.push(<line key={`g10${i}`} x1={margin.left} y1={y} x2={margin.left+innerW} y2={y} stroke="#eef3fb" strokeWidth={1} />);
                  }
                  // Plot points as (Consumption, Temperature)
                  waterConsumptionY.forEach((x, idx) => {
                    const y = dailyTempX[idx];
                    elements.push(<circle key={`s10${idx}`} cx={xScale(x)} cy={yScale(y)} r={4.5} fill="#2C4795" opacity={0.9} />);
                  });
                  // Axis labels per requested orientation
                  elements.push(<text key="xlabel10" x={margin.left + innerW/2} y={margin.top+innerH+28} textAnchor="middle" fill="#2C4795" fontSize="12">Water Consumption (liters/day)</text>);
                  elements.push(<text key="ylabel10" transform={`translate(${margin.left-30}, ${margin.top + innerH/2}) rotate(-90)`} textAnchor="middle" fill="#2C4795" fontSize="12">Temperature (°C)</text>);
                  return <g>{elements}</g>;
                })()}
              </svg>
              <div className="figure-given">Data Points (8 observations): (25.2, 305), (25.8, 345), (26.4, 385), (26.9, 425), (27.3, 465), (27.8, 505), (28.2, 545), (28.6, 580)</div>
              <div className="figure-given">Regression equation: ŷ = 64x – 1,240</div>
            </div>
          ) : (
            <img src={imageForSet(currentSet)} alt={`SASLCT Set ${currentSet+1}`} className="set-image" />
          )}
        </div>
        <div className="set-right">
          {items.map((gi) => (
            <div key={gi} className="question-card">
              <div className="question-header">Question {gi+1}</div>
              {isSetOne && gi === 0 && (
                <div className="question-body">1. Looking at the temperature and rainfall data in Table 1, what pattern do you observe?</div>
              )}
              {isSetTwo && gi === start && (
                <div className="question-body">A student examining the data in Table 2 notices that Q4 2022 had less rainfall (455 mm) than Q3 2022 (520 mm), but both had almost similar flooding incidents (9 and 11). How does this observation relate to the correlation coefficient?</div>
              )}
              {isSetThree && gi === start && (
                <div className="question-body">Looking at the correlation coefficient (r = 0.99) and the context of temperature and electricity use, what is the most likely explanation for this relationship?</div>
              )}
              {isSetThree && gi === start + 1 && (
                <div className="question-body">Your school wants to reduce electricity costs. Using the correlation data between temperature and electricity consumption (r = 0.99), which recommendation is the most practical that you can give to your school principal?</div>
              )}
              {isSetSix && gi === start && (
                <div className="question-body">What does the y-intercept value of -0.09 cm mean in this sea level data?</div>
              )}
              {isSetSix && gi === start + 1 && (
                <div className="question-body">Based on the regression equation Y = 2.89x – 0.09, coastal communities want to prepare for future sea level rise. What is the most reasonable interpretation for planning purposes?</div>
              )}
              {isSetSeven && gi === start && (
                <div className="question-body">After calculating the slope (b = 2.15) and y-intercept (a = -13.62), a student writes: “For every 1-point improvement in water quality score, about 2,150 more tourists visit Davao beaches annually.” Then they notice the regression equation is Y = 2.15X - 13.62. What should they consider about the negative y-intercept?</div>
              )}
              {isSetEight && gi === start && (
                <div className="question-body">The highest AQI in the data is 85. If you wanted to predict admissions for AQI = 95, what type of prediction would this be?</div>
              )}
              {isSetNine && gi === start && (
                <div className="question-body">In the equation ŷ = 3.2x - 174.3, the y-intercept is -174.3. What does this negative value suggest about using this equation?</div>
              )}
              {isSetNine && gi === start + 1 && (
                <div className="question-body">A health officer notices the regression is based on only 10 months of data. What limitation does this create for making predictions?</div>
              )}
              {isSetTen && gi === start && (
                <div className="question-body">Climate scientists predict Davao's average temperature may rise to 30°C by 2040. Using the equation ŷ = 64x – 1,240 to predict water consumption at 30°C gives 680 liters/day. What should water authorities consider about this prediction?</div>
              )}
              {isSetTen && gi === start + 1 && (
                <div className="question-body">As a water resource planner, you need to present these findings to the Davao City Water District board. Create a recommendation that appropriately uses the regression analysis while addressing its limitations. Which approach is most appropriate?</div>
              )}
              {isSetFour && gi === start && (
                <div className="question-body">Your barangay health center needs to prepare for dengue prevention. Using the correlation data (r = 0.95) between humidity and dengue cases, which plan best uses the correlation analysis?</div>
              )}
              {isSetFive && gi === start && (
                <div className="question-body">In the regression equation Y = 0.14x + 27.20, what does the number 27.20 represent?</div>
              )}
              {isSetFive && gi === start + 1 && (
                <div className="question-body">Based on the regression equation Y = 0.14x + 27.20, what does the slope (0.14) tell us about temperature change in Davao City?</div>
              )}
              <div className={`options ${(isSetOne && gi===0) || (isSetTwo && gi===start) || (isSetThree && (gi===start || gi===start+1)) || (isSetFour && gi===start) || (isSetFive && (gi===start || gi===start+1)) || (isSetSix && (gi===start || gi===start+1)) || (isSetSeven && gi===start) || (isSetEight && gi===start) || (isSetNine && (gi===start || gi===start+1)) || (isSetTen && (gi===start || gi===start+1)) ? 'options--fulltext' : ''}`}>
                {(['A','B','C','D'] as Option[]).map(o => {
                  const fullTextMapSet1: Record<Option, string> = {
                    A: 'As temperature increases, rainfall always decreases',
                    B: 'Temperature and rainfall show no clear pattern',
                    C: 'Higher temperatures tend to occur with higher rainfall amounts',
                    D: 'Temperature stays the same while rainfall changes randomly over time'
                  };
                  const fullTextMapSet2: Record<Option, string> = {
                    A: 'It shows correlation measures trends, not predictions.',
                    B: 'It proves the correlation calculation is wrong.',
                    C: 'It means that rainfall and flooding incidents are not related at all.',
                    D: 'It indicates the data should be removed as an outlier.'
                  };
                  const fullTextMapSet3Q3: Record<Option, string> = {
                    A: 'Higher temperatures make electricity cheaper.',
                    B: 'The relationship is random and has no logical explanation at all.',
                    C: 'Higher temperatures increase electricity consumption.',
                    D: 'Lower temperatures always increase electricity use.'
                  };
                  const fullTextMapSet3Q4: Record<Option, string> = {
                    A: '"Stop using electricity completely during hot months"',
                    B: '"Use more air conditioning to keep everyone comfortable regardless of cost"',
                    C: '"Ignore the temperature data since it\'s only correlation"',
                    D: '"Install energy-efficient cooling systems, schedule classes on cooler hours"'
                  };
                  const fullTextMapSet4Q5: Record<Option, string> = {
                    A: '“Check humidity; boost mosquito prevention above 75% before rainy season”',
                    B: '"Wait for dengue cases to appear, then start responding"',
                    C: '"Focus only on treating dengue patients without considering humidity patterns"',
                    D: '"Since it\'s just correlation, don\'t use this data for planning"'
                  };
                  const fullTextMapSet5Q6: Record<Option, string> = {
                    A: 'The rate at which temperature increases each year',
                    B: 'The predicted temperature when x = 0 (year 2014)',
                    C: 'The total temperature change over 10 years',
                    D: 'The average of all temperature values'
                  };
                  const fullTextMapSet5Q7: Record<Option, string> = {
                    A: 'Temperature increases by 0.14°C every year',
                    B: 'Temperature stays constant at 0.14°C',
                    C: 'Temperature decreases by 0.14°C every year',
                    D: 'Temperature changes randomly without pattern'
                  };
                  const fullTextMapSet6Q8: Record<Option, string> = {
                    A: 'Sea level is decreasing by 0.09 cm each year since 2015',
                    B: 'Sea level in 2015 was 0.09 cm below the reference point',
                    C: 'Sea level will eventually drop to -0.09 cm',
                    D: 'The data collection started 0.09 cm underwater'
                  };
                  const fullTextMapSet6Q9: Record<Option, string> = {
                    A: 'The trend shows a 2.89 cm annual rise, guiding gradual flood defense planning.',
                    B: 'Sea level will rise exactly 2.89 cm every year with perfect accuracy until the coming years.',
                    C: 'Since the y-intercept is negative, sea level will eventually drop.',
                    D: 'The data is too uncertain to use for any planning decisions.'
                  };
                  const fullTextMapSet7Q10: Record<Option, string> = {
                    A: 'The negative y-intercept means the calculation is definitely wrong.',
                    B: 'The negative value means tourism decreases as water quality improves.',
                    C: 'Negative y-intercept is mathematical artifact, not realistic for water-quality predictions.',
                    D: 'The y-intercept should be ignored completely in all interpretations.'
                  };
                  const fullTextMapSet8Q11: Record<Option, string> = {
                    A: 'Interpolation - predicting within the data range',
                    B: 'Extrapolation - predicting beyond the data range',
                    C: 'Correlation - finding the relationship strength',
                    D: 'Calculation - computing the regression line'
                  };
                  const fullTextMapSet9Q12: Record<Option, string> = {
                    A: 'Negative predictions show equation invalid for very low humidity.',
                    B: 'Dengue cases decrease as humidity increases.',
                    C: 'The calculation is definitely wrong and should be redone.',
                    D: 'Humidity has no effect on dengue cases.'
                  };
                  const fullTextMapSet9Q13: Record<Option, string> = {
                    A: 'Ten months is enough data to predict with perfect accuracy for any situation.',
                    B: 'Sample size doesn\'t matter at all in regression analysis.',
                    C: 'Small sample size reduces prediction reliability, especially outside observed ranges.',
                    D: 'The regression equation is completely useless with only 10 data points.'
                  };
                  const fullTextMapSet10Q14: Record<Option, string> = {
                    A: 'It is a guaranteed accurate prediction for planning.',
                    B: 'Temperature will never reach 30°C, so ignore this prediction.',
                    C: 'Water consumption of the residents will not change regardless of reported temperature.',
                    D: 'Consider other long-term factors like population growth and infrastructure changes.'
                  };
                  const fullTextMapSet10Q15: Record<Option, string> = {
                    A: 'Water demand rises 64 liters per degree. Upgrade infrastructure, conserve water, monitor trends, plan for extremes.',
                    B: 'Temperature and water use are related, but since predictions are uncertain, don\'t plan anything.',
                    C: 'Water consumption will be exactly 680 liters/day when temperature reaches 30°C, so build systems for exactly that amount.',
                    D: 'Temperature doesn\'t affect water use, so current infrastructure is sufficient.'
                  };
                  let labelText = (isSetOne && gi===0)
                    ? fullTextMapSet1[o]
                    : (isSetTwo && gi===start)
                      ? fullTextMapSet2[o]
                      : (isSetThree && gi===start)
                        ? fullTextMapSet3Q3[o]
                        : (isSetThree && gi===start+1)
                          ? fullTextMapSet3Q4[o]
                          : o;
                  if (isSetFour && gi===start) labelText = fullTextMapSet4Q5[o];
                  if (isSetFive && gi===start) labelText = fullTextMapSet5Q6[o];
                  if (isSetFive && gi===start+1) labelText = fullTextMapSet5Q7[o];
                  if (isSetSix && gi===start) labelText = fullTextMapSet6Q8[o];
                  if (isSetSix && gi===start+1) labelText = fullTextMapSet6Q9[o];
                  if (isSetSeven && gi===start) labelText = fullTextMapSet7Q10[o];
                  if (isSetEight && gi===start) labelText = fullTextMapSet8Q11[o];
                  if (isSetNine && gi===start) labelText = fullTextMapSet9Q12[o];
                  if (isSetNine && gi===start+1) labelText = fullTextMapSet9Q13[o];
                  if (isSetTen && gi===start) labelText = fullTextMapSet10Q14[o];
                  if (isSetTen && gi===start+1) labelText = fullTextMapSet10Q15[o];
                  return (
                    <label key={o} className={`option ${responses[gi]===o?'selected':''}`}>
                      <input
                        type="radio"
                        name={`q-${gi}`}
                        value={o}
                        checked={responses[gi]===o}
                        onChange={() => handleOptionSelect(gi, o)}
                      />
                      <span><strong className="choice-letter">{o}.</strong> {labelText}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="set-actions">
            <button className="submit-button" disabled={user.role!=='admin' && !isSetComplete(currentSet)} onClick={nextSet}>
              {currentSet === setQuestionCounts.length - 1 ? 'Proceed to Part 2' : 'Next Set'}
            </button>
            <p className="hint">You cannot go back to previous sets. Ensure choices before proceeding.</p>
          </div>
        </div>
      </section>
    );
  };

  const part2Statements = [
    // Awareness of Effects or Impacts of Climate Change
    'Climate change increases disease rates in my community.',
    'Higher temperatures correlate with lower crop yields significantly.',
    'Diarrhea cases rise when rainfall patterns change drastically.',
    'Cholera becomes more toxic in warmer water temperatures.',
    'Floods spread waterborne diseases faster than before now.',
    // Awareness Individual Initiative to Address Climate Change
    'Public transportation reduces my personal carbon emissions significantly.',
    'Eating natural foods lowers my environmental impact considerably.',
    'GHG-free refrigerators decrease household emissions over time effectively.',
    'Eco-friendly air conditioners use less energy than standard models.',
    'Emission-free cars correlate with better local air quality.',
    'Reducing trips decreases car fuel consumption and emissions.',
    'Carpooling with others cuts per-person emissions by half.',
    'Correct tire pressure improves fuel efficiency by percentages.',
    // Awareness of Industry Initiative to Address Climate Change
    'Proper building insulation reduces energy use significantly overall.',
    'Solar energy adoption correlates with lower production costs.',
    'Reusing waste heat decreases total energy consumption substantially.',
    'Bio-gas use reduces industrial fossil fuel dependence considerably.'
  ];

  const renderStatementRow = (idx: number) => (
    <div key={idx} className="statement-row">
      <div className="statement-index">{idx+1}.</div>
      <div className="statement-text">{part2Statements[idx]}</div>
      <div className="statement-options">
        {[1,2,3,4].map(val => (
          <label key={val} className={`likert-option ${part2Responses[idx]===val?'selected':''}`}>
            <input
              type="radio"
              name={`s-${idx}`}
              value={val}
              checked={part2Responses[idx]===val}
              onChange={() => setPart2Responses(prev => { const next=[...prev]; next[idx]=val; return next; })}
            />
            <span>{likertLabels[val-1]}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const renderPart2 = () => (
    <section className="pre-assessment-part2">
      <h2>Part 2: Student Awareness on Climate Change Issues Questionnaire (SACCIQ)</h2>
      <p className="scale-note">Scale: 4 – Very Aware, 3 – Aware, 2 – A Little Aware, 1 – Not Aware</p>

      <div className="part2-group">
        <div className="part2-group-title">Awareness of Effects or Impacts of Climate Change</div>
        <div className="statements-list">
          {[0,1,2,3,4].map(renderStatementRow)}
        </div>
      </div>

      <div className="part2-group">
        <div className="part2-group-title">Awareness Individual Initiative to Address Climate Change</div>
        <div className="statements-list">
          {[5,6,7,8,9,10,11,12].map(renderStatementRow)}
        </div>
      </div>

      <div className="part2-group">
        <div className="part2-group-title">Awareness of Industry Initiative to Address Climate Change</div>
        <div className="statements-list">
          {[13,14,15,16].map(renderStatementRow)}
        </div>
      </div>

      <div className="part2-actions">
        <button className="submit-button" disabled={isLockedAfterSubmit || (user.role!=='admin' && part2Responses.some(v=>v===0))} onClick={submitPart2}>Submit</button>
      </div>
    </section>
  );

  return (
    <div className="portal-container">
      <header className="portal-header">
        <div className="header-left">
          <span className="header-badge badge--pre">📋</span>
          <div className="header-texts">
            <h1 className="portal-title">Pre-Assessment</h1>
            <p className="portal-subtitle">Student Section</p>
          </div>
        </div>
        <div className="header-right">
          <p className="welcome-text">Welcome, <strong>{displayName}</strong></p>
        </div>
      </header>
      <main className="portal-content">
        {isLockedAfterSubmit ? (
          <section className="pre-assessment-part2">
            <h2>Pre-Assessment Submitted</h2>
            <p className="scale-note">Your response has already been recorded. You cannot submit this section again.</p>
            <div className="part2-actions">
              <button className="submit-button" onClick={onBack}>Back to Dashboard</button>
            </div>
          </section>
        ) : phase==='part1' ? renderPart1() : (
          part2Submitted ? (
            <section className="pre-assessment-part2">
              <h2>Pre-Assessment Completed</h2>
              <p className="scale-note">Great job! You may return to the dashboard.</p>
              <div className="part2-actions">
                <button className="submit-button" onClick={onBack}>Back to Dashboard</button>
              </div>
            </section>
          ) : renderPart2()
        )}

        {/* teacher feedback block */}
        {serverFeedback && (
          <section className="teacher-feedback" style={{ padding: '12px 24px', background: '#f9f9f9', marginTop: 16 }}>
            <h3>Teacher Feedback</h3>
            <p>{serverFeedback.feedback_text}</p>
            {!serverFeedback.acknowledged && (
              <button onClick={handleAcknowledge}>Acknowledge</button>
            )}
            {serverFeedback.acknowledged && serverFeedback.acknowledged_at && (
              <div style={{ fontSize: '0.9rem', color: '#555' }}>Acknowledged at {new Date(serverFeedback.acknowledged_at).toLocaleString()}</div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default PreAssessment;
