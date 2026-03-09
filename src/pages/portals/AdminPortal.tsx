import React, { useState, useEffect } from 'react';
import { HeaderAdminIcon } from '../../components/RoleIcons';
import AnalyticsChart from '../../components/admin/AnalyticsChart';
import FeedbackPanel from '../../components/teacher/FeedbackPanel';
import ClassManagement from '../../components/teacher/ClassManagement';
import StudentList from '../../components/teacher/StudentList';
import { getPreAssessmentSummary, getInitialSurveySummary, getAssessmentScores, getPostAssessmentSummary, getEndOfLessonSurveySummary } from '../../services/progressService';
import { getPreAssessmentSummaryFromDB, getInitialSurveySummaryFromDB, getPostAssessmentSummaryFromDB, getEndOfLessonSurveySummaryFromDB, getClassRecordForExport } from '../../services/analyticsService';
import { getClassRecord } from '../../services/submissionsService';
import * as XLSX from 'xlsx';
import '../../styles/AdminPortal.css';
import '../../styles/TeacherPortal.css';

interface AuthUser {
  id?: string;
  username: string;
  role: 'student' | 'teacher' | 'admin' | null;
}

interface Class {
  id: string;
  grade: string;
  section: string;
  students: any[];
}

interface AdminPortalProps {
  user: AuthUser;
  onLogout: () => void;
  classes: Class[];
  onCreateClass?: (grade: string, section: string) => void;
  onUpdateStudents?: (classId: string, students: any[]) => void;
  onDeleteClass?: (classId: string) => void;
}

const AdminPortal: React.FC<AdminPortalProps> = ({ user, onLogout, classes, onCreateClass, onUpdateStudents, onDeleteClass }) => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [sectionFilter, setSectionFilter] = useState<string>('ALL');
  const [feedbackStudent, setFeedbackStudent] = useState<{id: string, name: string, activity: any} | null>(null);
  const [classRecord, setClassRecord] = useState<any[]>([]);
  const [classRecordLoading, setClassRecordLoading] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📘' },
    { id: 'create', label: 'Create Class', icon: '➕' },
    { id: 'list', label: 'List of Classes', icon: '📋' },
    { id: 'masterlist', label: 'Masterlist', icon: '👥' },
    { id: 'pre-assessment', label: 'Pre-Assessment Results', icon: '📊' },
    { id: 'initial-survey', label: 'Initial Survey Results', icon: '📝' },
    { id: 'post-assessment', label: 'Post-Assessment Results', icon: '✅' },
    { id: 'end-survey', label: 'End-of-Lesson Survey', icon: '📋' },
    { id: 'class-record', label: 'Class Record', icon: '🗂️' }
  ];

  const analyticsTabIds = ['pre-assessment', 'initial-survey', 'post-assessment', 'end-survey', 'class-record'];

  // Load class record from Supabase when the tab is active
  useEffect(() => {
    if (activeTab !== 'class-record') return;
    setClassRecordLoading(true);
    const classId = sectionFilter === 'ALL'
      ? 'all'
      : classes.find(c => `Section ${c.section}` === sectionFilter)?.id || 'all';
    getClassRecord(classId)
      .then(rows => setClassRecord(rows))
      .catch(e => console.error('[AdminPortal] classRecord error', e))
      .finally(() => setClassRecordLoading(false));
  }, [activeTab, sectionFilter, classes]);

  const sectionOptions = ['ALL', ...classes.map(c => `Section ${c.section}`)];
  const filteredStudents = sectionFilter === 'ALL'
    ? classes.flatMap(c => c.students)
    : classes.filter(c => `Section ${c.section}` === sectionFilter).flatMap(c => c.students);
  const usernames = filteredStudents.map((s: any) => s.username).filter(Boolean);
  const preSummary = getPreAssessmentSummary(usernames);
  const initSummary = getInitialSurveySummary(usernames);
  const postSummary = getPostAssessmentSummary(usernames);
  const endSummary = getEndOfLessonSurveySummary(usernames);

  // Calculate statistics from actual classes
  // totals moved into filtered context

  const handleDownloadReport = (format: 'pdf' | 'csv') => {
    if (format === 'csv') {
      if (activeTab === 'pre-assessment') {
        // CSV should contain the "List of Students and their Responses" (Pre Part I)
        const scores = getAssessmentScores();
        const rows: string[][] = [];
        // header: Name (Last, First), Username, Q1..Q15, Score
        rows.push(['Name','Username', ...Array.from({length:15}, (_,i)=>`Q${i+1}`), 'Score']);
        const fmt = (full: string) => {
          const p = (full || '').trim().split(/\s+/);
          if (p.length <= 1) return full;
          const last = p[p.length-1];
          const first = p.slice(0, p.length-1).join(' ');
          return `${last}, ${first}`;
        };
        filteredStudents.forEach((s: any) => {
          const entry = scores[s.username] || {} as any;
          const answers = Array.isArray(entry.prePart1Responses) && entry.prePart1Responses.length === 15 ? entry.prePart1Responses : null;
          const score = typeof entry.prePart1Correct === 'number' ? entry.prePart1Correct : null;
          if (!answers) return; // only include actual takers
          rows.push([fmt(s.name || ''), s.username || '', ...answers.map(a=>String(a)), score != null ? String(score) : '']);
        });
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const label = sectionFilter === 'ALL' ? 'all' : sectionFilter.replace(/\s+/g,'_').toLowerCase();
        a.download = `pre_assessment_responses_${label}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (activeTab === 'initial-survey') {
        // Export both the Indicators & Statements summary and the per-student responses
        const resp = initSummary.responses || [];
        const mean = (arr:number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
        const itemMeans = Array.from({length:17}, (_,i)=> mean(resp.map(r=>r[i]).filter((v)=> typeof v==='number')));
        const ind1 = itemMeans.slice(0,5), ind2 = itemMeans.slice(5,13), ind3 = itemMeans.slice(13,17);
        const indMean = (arr:number[]) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
        const rows: string[][] = [];
        // Indicators summary section (include Description)
        const level = (m:number) => m>=3.26 ? 'Very High' : m>=2.51 ? 'High' : m>=1.76 ? 'Low' : 'Very Low';
        rows.push(['Indicator','Statement','Mean','Description']);
        ind1.forEach((m,i)=> rows.push(['Indicator 1', `Statement ${i+1}`, m.toFixed(2), level(m)]));
        ind2.forEach((m,i)=> rows.push(['Indicator 2', `Statement ${i+6}`, m.toFixed(2), level(m)]));
        ind3.forEach((m,i)=> rows.push(['Indicator 3', `Statement ${i+14}`, m.toFixed(2), level(m)]));
        // blank separator
        rows.push([]);
        // Student responses section header
        rows.push(['Name','Username', ...Array.from({length:17}, (_,i)=>`Q${i+1}`)]);
        const all = getAssessmentScores();
        const fmt = (full: string) => {
          const p = (full || '').trim().split(/\s+/);
          if (p.length <= 1) return full;
          const last = p[p.length-1];
          const first = p.slice(0, p.length-1).join(' ');
          return `${last}, ${first}`;
        };
        filteredStudents.forEach((s:any) => {
          const entry = all[s.username] || {} as any;
          const responses = Array.isArray(entry.prePart2Responses) && entry.prePart2Responses.length===17 ? entry.prePart2Responses : null;
          if (!responses) return;
          rows.push([fmt(s.name || ''), s.username || '', ...responses.map(r=>String(r))]);
        });
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const label = sectionFilter === 'ALL' ? 'all' : sectionFilter.replace(/\s+/g,'_').toLowerCase();
        a.download = `initial_survey_full_${label}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (activeTab === 'post-assessment') {
        // CSV should contain the "List of Students and their Responses" (Post Part I)
        const scores = getAssessmentScores();
        const rows: string[][] = [];
        rows.push(['Name','Username', ...Array.from({length:15}, (_,i)=>`Q${i+1}`), 'Score']);
        const fmt = (full: string) => {
          const p = (full || '').trim().split(/\s+/);
          if (p.length <= 1) return full;
          const last = p[p.length-1];
          const first = p.slice(0, p.length-1).join(' ');
          return `${last}, ${first}`;
        };
        filteredStudents.forEach((s: any) => {
          const entry = scores[s.username] || {} as any;
          const answers = Array.isArray(entry.postPart1Responses) && entry.postPart1Responses.length === 15 ? entry.postPart1Responses : null;
          const score = typeof entry.postPart1Correct === 'number' ? entry.postPart1Correct : null;
          if (!answers) return;
          rows.push([fmt(s.name || ''), s.username || '', ...answers.map(a=>String(a)), score != null ? String(score) : '']);
        });
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const label = sectionFilter === 'ALL' ? 'all' : sectionFilter.replace(/\s+/g,'_').toLowerCase();
        a.download = `post_assessment_responses_${label}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (activeTab === 'end-survey') {
        // Export Indicators+Description and per-student responses for End-of-Lesson survey
        const resp = endSummary.responses || [];
        const mean = (arr:number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
        const itemMeans = Array.from({length:17}, (_,i)=> mean(resp.map(r=>r[i]).filter((v)=> typeof v==='number')));
        const ind1 = itemMeans.slice(0,5), ind2 = itemMeans.slice(5,13), ind3 = itemMeans.slice(13,17);
        const level = (m:number) => m>=3.26 ? 'Very High' : m>=2.51 ? 'High' : m>=1.76 ? 'Low' : 'Very Low';
        const rows: string[][] = [];
        // Indicators summary with description
        rows.push(['Indicator','Statement','Mean','Description']);
        ind1.forEach((m,i)=> rows.push(['Indicator 1', `Statement ${i+1}`, m.toFixed(2), level(m)]));
        ind2.forEach((m,i)=> rows.push(['Indicator 2', `Statement ${i+6}`, m.toFixed(2), level(m)]));
        ind3.forEach((m,i)=> rows.push(['Indicator 3', `Statement ${i+14}`, m.toFixed(2), level(m)]));
        // blank separator
        rows.push([]);
        // Student responses
        rows.push(['Name','Username', ...Array.from({length:17}, (_,i)=>`Q${i+1}`)]);
        const all = getAssessmentScores();
        const fmt = (full: string) => {
          const p = (full || '').trim().split(/\s+/);
          if (p.length <= 1) return full;
          const last = p[p.length-1];
          const first = p.slice(0, p.length-1).join(' ');
          return `${last}, ${first}`;
        };
        filteredStudents.forEach((s:any) => {
          const entry = all[s.username] || {} as any;
          const responses = Array.isArray(entry.postPart2Responses) && entry.postPart2Responses.length===17 ? entry.postPart2Responses : null;
          if (!responses) return;
          rows.push([fmt(s.name || ''), s.username || '', ...responses.map(r=>String(r))]);
        });
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const label = sectionFilter === 'ALL' ? 'all' : sectionFilter.replace(/\s+/g,'_').toLowerCase();
        a.download = `end_lesson_survey_full_${label}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      // Printable / PDF view
      if (activeTab === 'pre-assessment') {
        const scores = getAssessmentScores();
        const title = 'Pre-Assessment Results';
        const fmt = (full: string) => {
          const p = (full || '').trim().split(/\s+/);
          if (p.length <= 1) return full;
          const last = p[p.length-1];
          const first = p.slice(0, p.length-1).join(' ');
          return `${last}, ${first}`;
        };
        // level counts
        const adv = preSummary.scores.filter(s => s>=14).length;
        const prof = preSummary.scores.filter(s => s>=11 && s<=13).length;
        const dev = preSummary.scores.filter(s => s>=9 && s<=10).length;
        const beg = preSummary.scores.filter(s => s<=8).length;
        const totalScores = preSummary.scores.length || 1;
        // histogram counts 1..15 (kept for score distribution)
        const bins = Array.from({length:15}, (_,i)=>i+1);
        const counts = bins.map(b => preSummary.scores.filter(s => s === b).length);
        const maxCount = Math.max(1, ...counts);
        // Frequency of responses per item (A/B/C/D)
        const all = getAssessmentScores();
        const items = Array.from({ length: 15 }, () => ({ A: 0, B: 0, C: 0, D: 0 } as Record<string, number>));
        filteredStudents.forEach((s: any) => {
          const entry = all[s.username] || {} as any;
          const answers = Array.isArray(entry.prePart1Responses) && entry.prePart1Responses.length === 15 ? entry.prePart1Responses : null;
          if (!answers) return;
          answers.forEach((ans: string, idx: number) => {
            const a = (ans || '').toUpperCase();
            if (a === 'A' || a === 'B' || a === 'C' || a === 'D') items[idx][a] = (items[idx][a] || 0) + 1;
          });
        });
        const totals = items.map(it => it.A + it.B + it.C + it.D);
        const maxTotal = Math.max(1, ...totals);
        const answerKey = ['C','A','C','D','A','B','A','B','A','C','B','A','C','D','A'];
        const colorMap: Record<string,string> = { A: '#FFF6C2', B: '#FFDDE6', C: '#E9D9FF', D: '#DFFFE1' };
        const correctColor = '#7FA8FF';
        // boxplot stats
        const g = preSummary.groups || [];
        const arr12 = g.map((x:any)=>x.lc12);
        const arr34 = g.map((x:any)=>x.lc34);
        const arr56 = g.map((x:any)=>x.lc56);
        const qStats = (arr: number[]) => {
          if (!arr || arr.length===0) return {min:0,q1:0,med:0,q3:0,max:0};
          const sorted = [...arr].sort((a,b)=>a-b);
          const q = (p:number) => { const pos = (sorted.length-1)*p; const lo = Math.floor(pos), hi = Math.ceil(pos); return hi===lo ? sorted[lo] : sorted[lo] + (sorted[hi]-sorted[lo])*(pos-lo); };
          return { min: sorted[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: sorted[sorted.length-1] };
        };
        const s12 = qStats(arr12), s34 = qStats(arr34), s56 = qStats(arr56);

        // prepare rows for student responses (actual takers)
        const rows = filteredStudents.map((s:any) => {
          const entry = scores[s.username] || {} as any;
          const answers = Array.isArray(entry.prePart1Responses) && entry.prePart1Responses.length===15 ? entry.prePart1Responses : null;
          const sc = typeof entry.prePart1Correct === 'number' ? entry.prePart1Correct : null;
          return { name: s.name || '', username: s.username || '', answers, score: sc };
        }).filter((r:any)=> r.answers !== null);
        rows.sort((a:any,b:any)=> fmt(a.name).toLowerCase().localeCompare(fmt(b.name).toLowerCase()));

        const html = `
          <html>
            <head>
              <title>${title}</title>
              <style>
                body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:18px}
                h1{font-size:20px;margin-bottom:6px}
                .cards{display:flex;gap:12px;margin:8px 0 18px}
                .card{border:1px solid #e5e7eb;padding:10px;border-radius:6px;background:#fff}
                .card h4{margin:0 0 6px;font-size:12px;color:#374151}
                .card p{margin:0;font-size:18px;font-weight:700}
                .levels, .histogram, .boxplots, .responses{margin-top:12px}
                .hist-row{display:flex;align-items:flex-end;gap:6px;height:120px}
                .hist-bar{width:26px;text-align:center}
                .hist-fill{background:#6C8AE4;border-radius:4px 4px 0 0;margin-bottom:4px}
                table{border-collapse:collapse;width:100%;font-size:12px}
                th,td{border:1px solid #e5e7eb;padding:6px}
                th{background:#f8fafc}
                .small{font-size:12px;color:#374151}
              </style>
            </head>
            <body>
              <h1>${title}</h1>
              <div class="small">Filter: ${sectionFilter} — Generated from Admin Dashboard</div>
              <div class="cards">
                <div class="card"><h4>Students Enrolled</h4><p>${usernames.length}</p></div>
                <div class="card"><h4>Actual Takers</h4><p>${preSummary.tested}</p></div>
                <div class="card"><h4>Completion Rate</h4><p>${usernames.length? Math.round((preSummary.tested/usernames.length)*100) : 0}%</p></div>
              </div>

              <div class="levels">
                <h3>Students' Level of Achievement in Statistical Literacy and Critical Thinking</h3>
                <table><thead><tr><th>Level</th><th>Count</th><th>Percent</th></tr></thead><tbody>
                  <tr><td>Beginning</td><td>${beg}</td><td>${Math.round((beg/totalScores)*100)}%</td></tr>
                  <tr><td>Developing</td><td>${dev}</td><td>${Math.round((dev/totalScores)*100)}%</td></tr>
                  <tr><td>Proficient</td><td>${prof}</td><td>${Math.round((prof/totalScores)*100)}%</td></tr>
                  <tr><td>Advanced</td><td>${adv}</td><td>${Math.round((adv/totalScores)*100)}%</td></tr>
                </tbody></table>
              </div>

              <div class="histogram">
                <h3>Frequency of Responses</h3>
                ${items.map((it, i) => {
                  const segments = ['A','B','C','D'].map(letter => {
                    const cnt = it[letter] || 0;
                    const w = (cnt / maxTotal) * 100;
                    const isCorrect = answerKey[i] === letter;
                    const bg = isCorrect ? correctColor : colorMap[letter];
                    const color = isCorrect ? '#fff' : '#111';
                    return `<div style="width:${w}%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:12px;color:${color}">${cnt}</div>`;
                  }).join('');
                  return `<div style="display:flex;align-items:center;gap:8;margin-bottom:6px;"><div style="width:40px;text-align:right;font-size:12px">Q${i+1}</div><div style="flex:1 1 auto;display:flex;height:28px;border:1px solid #eef2ff;border-radius:4px;overflow:hidden">${segments}</div></div>`;
                }).join('')}
              </div>

              <div class="boxplots">
                <h3>Boxplots by Learning Competency (summary stats)</h3>
                <table><thead><tr><th>Competency</th><th>Min</th><th>Q1</th><th>Median</th><th>Q3</th><th>Max</th></tr></thead>
                <tbody>
                  <tr><td>LC1-2 (Items 1–5)</td><td>${s12.min}</td><td>${s12.q1.toFixed(2)}</td><td>${s12.med.toFixed(2)}</td><td>${s12.q3.toFixed(2)}</td><td>${s12.max}</td></tr>
                  <tr><td>LC3-4 (Items 6–10)</td><td>${s34.min}</td><td>${s34.q1.toFixed(2)}</td><td>${s34.med.toFixed(2)}</td><td>${s34.q3.toFixed(2)}</td><td>${s34.max}</td></tr>
                  <tr><td>LC5-6 (Items 11–15)</td><td>${s56.min}</td><td>${s56.q1.toFixed(2)}</td><td>${s56.med.toFixed(2)}</td><td>${s56.q3.toFixed(2)}</td><td>${s56.max}</td></tr>
                </tbody></table>
              </div>

              <div class="responses">
                <h3>List of Students and their Responses (Pre Part I)</h3>
                <div style="overflow-x:auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        ${Array.from({length:15}, (_,i)=>`<th>Q${i+1}</th>`).join('')}
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.map(r => `<tr><td style="white-space:nowrap;text-align:left">${fmt(r.name)}</td><td>${r.username}</td>${(r.answers || []).map((a:any)=>`<td>${String(a)}</td>`).join('')}<td style="text-align:center">${r.score}</td></tr>`).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </body>
          </html>
        `;
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(()=>{ try { w.print(); } catch {} }, 400);
        return;
      }
      if (activeTab === 'post-assessment') {
        const scores = getAssessmentScores();
        const title = 'Post-Assessment Results';
        const fmt = (full: string) => {
          const p = (full || '').trim().split(/\s+/);
          if (p.length <= 1) return full;
          const last = p[p.length-1];
          const first = p.slice(0, p.length-1).join(' ');
          return `${last}, ${first}`;
        };
        const adv = postSummary.scores.filter(s => s>=14).length;
        const prof = postSummary.scores.filter(s => s>=11 && s<=13).length;
        const dev = postSummary.scores.filter(s => s>=9 && s<=10).length;
        const beg = postSummary.scores.filter(s => s<=8).length;
        const totalScores = postSummary.scores.length || 1;
        const bins = Array.from({length:15}, (_,i)=>i+1);
        const counts = bins.map(b => postSummary.scores.filter(s => s === b).length);
        const maxCount = Math.max(1, ...counts);
        // Frequency of responses per item (A/B/C/D)
        const all = getAssessmentScores();
        const items = Array.from({ length: 15 }, () => ({ A: 0, B: 0, C: 0, D: 0 } as Record<string, number>));
        filteredStudents.forEach((s: any) => {
          const entry = all[s.username] || {} as any;
          const answers = Array.isArray(entry.postPart1Responses) && entry.postPart1Responses.length === 15 ? entry.postPart1Responses : null;
          if (!answers) return;
          answers.forEach((ans: string, idx: number) => {
            const a = (ans || '').toUpperCase();
            if (a === 'A' || a === 'B' || a === 'C' || a === 'D') items[idx][a] = (items[idx][a] || 0) + 1;
          });
        });
        const totals = items.map(it => it.A + it.B + it.C + it.D);
        const maxTotal = Math.max(1, ...totals);
        const answerKey = ['C','A','C','D','A','B','A','B','A','C','B','A','C','D','A'];
        const colorMap: Record<string,string> = { A: '#FFF6C2', B: '#FFDDE6', C: '#E9D9FF', D: '#DFFFE1' };
        const correctColor = '#7FA8FF';
        const g = postSummary.groups || [];
        const arr12 = g.map((x:any)=>x.lc12);
        const arr34 = g.map((x:any)=>x.lc34);
        const arr56 = g.map((x:any)=>x.lc56);
        const qStats = (arr: number[]) => {
          if (!arr || arr.length===0) return {min:0,q1:0,med:0,q3:0,max:0};
          const sorted = [...arr].sort((a,b)=>a-b);
          const q = (p:number) => { const pos = (sorted.length-1)*p; const lo = Math.floor(pos), hi = Math.ceil(pos); return hi===lo ? sorted[lo] : sorted[lo] + (sorted[hi]-sorted[lo])*(pos-lo); };
          return { min: sorted[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: sorted[sorted.length-1] };
        };
        const s12 = qStats(arr12), s34 = qStats(arr34), s56 = qStats(arr56);
        const rows = filteredStudents.map((s:any) => {
          const entry = scores[s.username] || {} as any;
          const answers = Array.isArray(entry.postPart1Responses) && entry.postPart1Responses.length===15 ? entry.postPart1Responses : null;
          const sc = typeof entry.postPart1Correct === 'number' ? entry.postPart1Correct : null;
          return { name: s.name || '', username: s.username || '', answers, score: sc };
        }).filter((r:any)=> r.answers !== null);
        rows.sort((a:any,b:any)=> fmt(a.name).toLowerCase().localeCompare(fmt(b.name).toLowerCase()));

        const html = `
          <html>
            <head>
              <title>${title}</title>
              <style>
                body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:18px}
                h1{font-size:20px;margin-bottom:6px}
                .cards{display:flex;gap:12px;margin:8px 0 18px}
                .card{border:1px solid #e5e7eb;padding:10px;border-radius:6px;background:#fff}
                .card h4{margin:0 0 6px;font-size:12px;color:#374151}
                .card p{margin:0;font-size:18px;font-weight:700}
                .levels, .histogram, .boxplots, .responses{margin-top:12px}
                .hist-row{display:flex;align-items:flex-end;gap:6px;height:120px}
                .hist-bar{width:26px;text-align:center}
                .hist-fill{background:#6C8AE4;border-radius:4px 4px 0 0;margin-bottom:4px}
                table{border-collapse:collapse;width:100%;font-size:12px}
                th,td{border:1px solid #e5e7eb;padding:6px}
                th{background:#f8fafc}
                .small{font-size:12px;color:#374151}
              </style>
            </head>
            <body>
              <h1>${title}</h1>
              <div class="small">Filter: ${sectionFilter} — Generated from Admin Dashboard</div>
              <div class="cards">
                <div class="card"><h4>Students Enrolled</h4><p>${usernames.length}</p></div>
                <div class="card"><h4>Actual Takers</h4><p>${postSummary.tested}</p></div>
                <div class="card"><h4>Completion Rate</h4><p>${usernames.length? Math.round((postSummary.tested/usernames.length)*100) : 0}%</p></div>
              </div>

              <div class="levels">
                <h3>Students' Level of Achievement in Statistical Literacy and Critical Thinking (Post)</h3>
                <table><thead><tr><th>Level</th><th>Count</th><th>Percent</th></tr></thead><tbody>
                  <tr><td>Beginning</td><td>${beg}</td><td>${Math.round((beg/totalScores)*100)}%</td></tr>
                  <tr><td>Developing</td><td>${dev}</td><td>${Math.round((dev/totalScores)*100)}%</td></tr>
                  <tr><td>Proficient</td><td>${prof}</td><td>${Math.round((prof/totalScores)*100)}%</td></tr>
                  <tr><td>Advanced</td><td>${adv}</td><td>${Math.round((adv/totalScores)*100)}%</td></tr>
                </tbody></table>
              </div>

              <div class="histogram">
                <h3>Frequency of Responses</h3>
                ${items.map((it, i) => {
                  const segments = ['A','B','C','D'].map(letter => {
                    const cnt = it[letter] || 0;
                    const w = (cnt / maxTotal) * 100;
                    const isCorrect = answerKey[i] === letter;
                    const bg = isCorrect ? correctColor : colorMap[letter];
                    const color = isCorrect ? '#fff' : '#111';
                    return `<div style="width:${w}%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:12px;color:${color}">${cnt}</div>`;
                  }).join('');
                  return `<div style="display:flex;align-items:center;gap:8;margin-bottom:6px;"><div style="width:40px;text-align:right;font-size:12px">Q${i+1}</div><div style="flex:1 1 auto;display:flex;height:28px;border:1px solid #eef2ff;border-radius:4px;overflow:hidden">${segments}</div></div>`;
                }).join('')}
              </div>

              <div class="boxplots">
                <h3>Boxplots by Learning Competency (summary stats)</h3>
                <table><thead><tr><th>Competency</th><th>Min</th><th>Q1</th><th>Median</th><th>Q3</th><th>Max</th></tr></thead>
                <tbody>
                  <tr><td>LC1-2 (Items 1–5)</td><td>${s12.min}</td><td>${s12.q1.toFixed(2)}</td><td>${s12.med.toFixed(2)}</td><td>${s12.q3.toFixed(2)}</td><td>${s12.max}</td></tr>
                  <tr><td>LC3-4 (Items 6–10)</td><td>${s34.min}</td><td>${s34.q1.toFixed(2)}</td><td>${s34.med.toFixed(2)}</td><td>${s34.q3.toFixed(2)}</td><td>${s34.max}</td></tr>
                  <tr><td>LC5-6 (Items 11–15)</td><td>${s56.min}</td><td>${s56.q1.toFixed(2)}</td><td>${s56.med.toFixed(2)}</td><td>${s56.q3.toFixed(2)}</td><td>${s56.max}</td></tr>
                </tbody></table>
              </div>

              <div class="responses">
                <h3>List of Students and their Responses (Post Part I)</h3>
                <div style="overflow-x:auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        ${Array.from({length:15}, (_,i)=>`<th>Q${i+1}</th>`).join('')}
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.map(r => `<tr><td style="white-space:nowrap;text-align:left">${fmt(r.name)}</td><td>${r.username}</td>${(r.answers || []).map((a:any)=>`<td>${String(a)}</td>`).join('')}<td style="text-align:center">${r.score}</td></tr>`).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </body>
          </html>
        `;
        const w2 = window.open('', '_blank');
        if (!w2) return;
        w2.document.write(html);
        w2.document.close();
        w2.focus();
        setTimeout(()=>{ try { w2.print(); } catch {} }, 400);
        return;
      }
      if (activeTab === 'initial-survey') {
        const title = 'Initial Survey Results';
        const resp = initSummary.responses || [];
        const mean = (arr:number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
        const itemMeans = Array.from({length:17}, (_,i)=> mean(resp.map(r=>r[i]).filter((v)=> typeof v==='number')));
        const ind1 = itemMeans.slice(0,5), ind2 = itemMeans.slice(5,13), ind3 = itemMeans.slice(13,17);
        const statementTexts = [
          'Climate change increases disease rates in my community.',
          'Higher temperatures correlate with lower crop yields significantly.',
          'Diarrhea cases rise when rainfall patterns change drastically.',
          'Cholera becomes more toxic in warmer water temperatures.',
          'Floods spread waterborne diseases faster than before now.',
          'Public transportation reduces my personal carbon emissions significantly.',
          'Eating natural foods lowers my environmental impact considerably.',
          'GHG-free refrigerators decrease household emissions over time effectively.',
          'Eco-friendly air conditioners use less energy than standard models.',
          'Emission-free cars correlate with better local air quality.',
          'Reducing trips decreases car fuel consumption and emissions.',
          'Carpooling with others cuts per-person emissions by half.',
          'Correct tire pressure improves fuel efficiency by percentages.',
          'Proper building insulation reduces energy use significantly overall.',
          'Solar energy adoption correlates with lower production costs.',
          'Reusing waste heat decreases total energy consumption substantially.',
          'Bio-gas use reduces industrial fossil fuel dependence considerably.',
        ];
        const fmt = (full: string) => {
          const p = (full || '').trim().split(/\s+/);
          if (p.length <= 1) return full;
          const last = p[p.length-1];
          const first = p.slice(0, p.length-1).join(' ');
          return `${last}, ${first}`;
        };
        const all = getAssessmentScores();
        const studentRows = filteredStudents.map((s:any) => {
          const entry = all[s.username] || {} as any;
          const responses = Array.isArray(entry.prePart2Responses) && entry.prePart2Responses.length===17 ? entry.prePart2Responses : null;
          return { name: s.name || '', username: s.username || '', responses };
        }).filter((r:any)=> r.responses !== null);
        studentRows.sort((a:any,b:any)=> fmt(a.name).toLowerCase().localeCompare(fmt(b.name).toLowerCase()));

        const level = (m:number) => m>=3.26 ? 'Very High' : m>=2.51 ? 'High' : m>=1.76 ? 'Low' : 'Very Low';
        const html = `
          <html>
            <head>
              <title>${title}</title>
              <style>
                body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:18px}
                h1{font-size:20px;margin-bottom:6px}
                table{border-collapse:collapse;width:100%;font-size:12px;margin-top:12px}
                th,td{border:1px solid #e5e7eb;padding:6px}
                th{background:#f8fafc}
                .indicator-list{margin:0;padding-left:16px}
              </style>
            </head>
            <body>
              <h1>${title}</h1>
              <div class="small">Filter: ${sectionFilter} — Generated from Admin Dashboard</div>
              <h3>Indicators and Statements</h3>
              <table>
                <thead><tr><th>Indicator</th><th>Statement</th><th>Mean</th><th>Description</th></tr></thead>
                <tbody>
                  ${ind1.map((m,i)=> `<tr><td>Indicator 1</td><td>${statementTexts[i]}</td><td>${m.toFixed(2)}</td><td>${level(m)}</td></tr>`).join('')}
                  ${ind2.map((m,i)=> `<tr><td>Indicator 2</td><td>${statementTexts[i+5]}</td><td>${m.toFixed(2)}</td><td>${level(m)}</td></tr>`).join('')}
                  ${ind3.map((m,i)=> `<tr><td>Indicator 3</td><td>${statementTexts[i+13]}</td><td>${m.toFixed(2)}</td><td>${level(m)}</td></tr>`).join('')}
                </tbody>
              </table>

              <h3>List of Students and their Survey Responses</h3>
              <div style="overflow-x:auto">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Username</th>
                      ${Array.from({length:17}, (_,i)=>`<th>Q${i+1}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${studentRows.map(r=> `<tr><td style="white-space:nowrap;text-align:left">${fmt(r.name)}</td><td>${r.username}</td>${(r.responses || []).map((a:any)=>`<td>${String(a)}</td>`).join('')}</tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </body>
          </html>
        `;
        const w3 = window.open('', '_blank');
        if (!w3) return;
        w3.document.write(html);
        w3.document.close();
        w3.focus();
        setTimeout(()=>{ try { w3.print(); } catch {} }, 400);
        return;
      }
      if (activeTab === 'end-survey') {
        const title = 'End-of-Lesson Survey Results';
        const resp = endSummary.responses || [];
        const mean = (arr:number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
        const itemMeans = Array.from({length:17}, (_,i)=> mean(resp.map(r=>r[i]).filter((v)=> typeof v==='number')));
        const ind1 = itemMeans.slice(0,5), ind2 = itemMeans.slice(5,13), ind3 = itemMeans.slice(13,17);
        const statementTexts = [
          'Climate change increases disease rates in my community.',
          'Higher temperatures correlate with lower crop yields significantly.',
          'Diarrhea cases rise when rainfall patterns change drastically.',
          'Cholera becomes more toxic in warmer water temperatures.',
          'Floods spread waterborne diseases faster than before now.',
          'Public transportation reduces my personal carbon emissions significantly.',
          'Eating natural foods lowers my environmental impact considerably.',
          'GHG-free refrigerators decrease household emissions over time effectively.',
          'Eco-friendly air conditioners use less energy than standard models.',
          'Emission-free cars correlate with better local air quality.',
          'Reducing trips decreases car fuel consumption and emissions.',
          'Carpooling with others cuts per-person emissions by half.',
          'Correct tire pressure improves fuel efficiency by percentages.',
          'Proper building insulation reduces energy use significantly overall.',
          'Solar energy adoption correlates with lower production costs.',
          'Reusing waste heat decreases total energy consumption substantially.',
          'Bio-gas use reduces industrial fossil fuel dependence considerably.',
        ];
        const fmt = (full: string) => {
          const p = (full || '').trim().split(/\s+/);
          if (p.length <= 1) return full;
          const last = p[p.length-1];
          const first = p.slice(0, p.length-1).join(' ');
          return `${last}, ${first}`;
        };
        const all = getAssessmentScores();
        const studentRows = filteredStudents.map((s:any) => {
          const entry = all[s.username] || {} as any;
          const responses = Array.isArray(entry.postPart2Responses) && entry.postPart2Responses.length===17 ? entry.postPart2Responses : null;
          return { name: s.name || '', username: s.username || '', responses };
        }).filter((r:any)=> r.responses !== null);
        studentRows.sort((a:any,b:any)=> fmt(a.name).toLowerCase().localeCompare(fmt(b.name).toLowerCase()));

        const level = (m:number) => m>=3.26 ? 'Very High' : m>=2.51 ? 'High' : m>=1.76 ? 'Low' : 'Very Low';
        const html = `
          <html>
            <head>
              <title>${title}</title>
              <style>
                body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:18px}
                h1{font-size:20px;margin-bottom:6px}
                table{border-collapse:collapse;width:100%;font-size:12px;margin-top:12px}
                th,td{border:1px solid #e5e7eb;padding:6px}
                th{background:#f8fafc}
                .indicator-list{margin:0;padding-left:16px}
              </style>
            </head>
            <body>
              <h1>${title}</h1>
              <div class="small">Filter: ${sectionFilter} — Generated from Admin Dashboard</div>
              <h3>Indicators and Statements</h3>
              <table>
                <thead><tr><th>Indicator</th><th>Statement</th><th>Mean</th><th>Description</th></tr></thead>
                <tbody>
                  ${ind1.map((m,i)=> `<tr><td>Indicator 1</td><td>${statementTexts[i]}</td><td>${m.toFixed(2)}</td><td>${level(m)}</td></tr>`).join('')}
                  ${ind2.map((m,i)=> `<tr><td>Indicator 2</td><td>${statementTexts[i+5]}</td><td>${m.toFixed(2)}</td><td>${level(m)}</td></tr>`).join('')}
                  ${ind3.map((m,i)=> `<tr><td>Indicator 3</td><td>${statementTexts[i+13]}</td><td>${m.toFixed(2)}</td><td>${level(m)}</td></tr>`).join('')}
                </tbody>
              </table>

              <h3>List of Students and their Survey Responses</h3>
              <div style="overflow-x:auto">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Username</th>
                      ${Array.from({length:17}, (_,i)=>`<th>Q${i+1}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${studentRows.map(r=> `<tr><td style="white-space:nowrap;text-align:left">${fmt(r.name)}</td><td>${r.username}</td>${(r.responses || []).map((a:any)=>`<td>${String(a)}</td>`).join('')}</tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </body>
          </html>
        `;
        const w4 = window.open('', '_blank');
        if (!w4) return;
        w4.document.write(html);
        w4.document.close();
        w4.focus();
        setTimeout(()=>{ try { w4.print(); } catch {} }, 400);
        return;
      }
      // fallback: simple printable view for other tabs
      const w = window.open('', '_blank');
      if (!w) return;
      const title = tabs.find(t=>t.id===activeTab)?.label || 'Report';
      w.document.write(`<html><head><title>${title}</title></head><body><h1>${title}</h1><p>Filter: ${sectionFilter}</p><p>Generated from Admin Dashboard.</p></body></html>`);
      w.document.close();
      w.focus();
      setTimeout(()=>{ try { w.print(); } catch {} }, 300);
    }
  };

  return (
    <div className="portal-container admin-portal">
      <header className="portal-header">
        <div className="header-left">
          <span className="header-badge badge--admin"><HeaderAdminIcon /></span>
          <div className="header-texts">
            <h1 className="portal-title">Statistics Meets Climate Action</h1>
            <p className="portal-subtitle">Teacher / Administrator Dashboard</p>
          </div>
        </div>
        <div className="header-right">
          <p className="welcome-text">Welcome, <strong>{user.username}</strong></p>
          <button className="logout-button" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <main className="portal-content">
        <div className="portal-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="admin-section">
          {analyticsTabIds.includes(activeTab) && (
            <>
              <div className="section-header">
                <h2>{tabs.find(t => t.id === activeTab)?.label}</h2>
                <div className="download-buttons">
                  <button className="download-btn" onClick={() => handleDownloadReport('pdf')}>
                    📥 Download PDF
                  </button>
                  <button className="download-btn" onClick={() => handleDownloadReport('csv')}>
                    📥 Download CSV
                  </button>
                </div>
              </div>
              <div className="admin-filters">
                <label>
                  Filter:
                  <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
                    {sectionOptions.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}

          {/* Overview Tab */}
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

          {/* Create Class Tab */}
          {activeTab === 'create' && (
            <ClassManagement
              onCreateClass={onCreateClass || (() => {})}
              classes={classes}
              onDeleteClass={onDeleteClass || (() => {})}
              onUpdateStudents={onUpdateStudents || (() => {})}
            />
          )}

          {/* List of Classes Tab */}
          {activeTab === 'list' && (
            <StudentList classes={classes} onUpdateStudents={onUpdateStudents || (() => {})} />
          )}

          {/* Masterlist Tab */}
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
                      cls.students.map((s: any, idx: number) => (
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

          {activeTab === 'pre-assessment' && (
            <div className="pre-assessment-layout">
              <div className="cards-row">
                <div className="stat-box metric-card card-enrolled">
                  <h4>Students Enrolled</h4>
                  <p className="stat-number-large">{usernames.length}</p>
                </div>
                <div className="stat-box metric-card card-takers">
                  <h4>Actual Takers</h4>
                  <p className="stat-number-large">{preSummary.tested}</p>
                </div>
                <div className="stat-box metric-card donut-card card-completion">
                  <h4>Completion Rate</h4>
                  <div className="donut-inline">
                    {(() => {
                      const pct = usernames.length ? Math.round((preSummary.tested / usernames.length) * 100) : 0;
                      const r = 32; // slightly smaller radius to allow thicker stroke
                      const c = 2 * Math.PI * r;
                      const dash = (pct / 100) * c;
                      return (
                        <svg viewBox="0 0 100 100" className="donut-svg">
                          <circle cx="50" cy="50" r={r} stroke="#e6eef9" strokeWidth="14" fill="none" />
                          <circle cx="50" cy="50" r={r} stroke="#6C8AE4" strokeWidth="14" fill="none" strokeDasharray={`${dash} ${c-dash}`} transform="rotate(-90 50 50)" />
                          <text x="50" y="55" textAnchor="middle" fill="#3A4A7A" fontSize="18" fontWeight={700}>{pct}%</text>
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="charts-row one-column">
                <div className="chart-section wide card-levels">
                  <h3>Students' Level of Achievement in Statistical Literacy and Critical Thinking</h3>
                  {(() => {
                    const adv = preSummary.scores.filter(s => s>=14).length;
                    const prof = preSummary.scores.filter(s => s>=11 && s<=13).length;
                    const dev = preSummary.scores.filter(s => s>=9 && s<=10).length;
                    const beg = preSummary.scores.filter(s => s<=8).length;
                    const total = preSummary.scores.length || 1;
                    const data = [
                      { label: `Beginning (${beg})`, value: Math.round((beg/total)*100) },
                      { label: `Developing (${dev})`, value: Math.round((dev/total)*100) },
                      { label: `Proficient (${prof})`, value: Math.round((prof/total)*100) },
                      { label: `Advanced (${adv})`, value: Math.round((adv/total)*100) },
                    ];
                    const colors = ['#CBD5E1','#93B5E1','#6FA8DC','#4F6EDC'];
                    return <AnalyticsChart data={data} type="bar" colors={colors} />;
                  })()}
                </div>

                <div className="chart-section wide card-histogram">
                  <h3>Frequency of Responses</h3>
                  {(() => {
                      // Stacked column: frequency of A/B/C/D for each item (1..15)
                      const all = getAssessmentScores();
                      const items = Array.from({ length: 15 }, () => ({ A: 0, B: 0, C: 0, D: 0 } as Record<string, number>));
                      filteredStudents.forEach((s: any) => {
                        const entry = all[s.username] || {} as any;
                        const answers = Array.isArray(entry.prePart1Responses) && entry.prePart1Responses.length === 15 ? entry.prePart1Responses : null;
                        if (!answers) return;
                        answers.forEach((ans: string, idx: number) => {
                          const a = (ans || '').toUpperCase();
                          if (a === 'A' || a === 'B' || a === 'C' || a === 'D') items[idx][a] = (items[idx][a] || 0) + 1;
                        });
                      });
                      const totals = items.map(it => it.A + it.B + it.C + it.D);
                      const maxTotal = Math.max(1, ...totals);
                      // answer key for items (match Pre/Post answer keys)
                      const answerKey = ['C','A','C','D','A','B','A','B','A','C','B','A','C','D','A'];
                      const colorMap: Record<string,string> = { A: '#FFF6C2', B: '#FFDDE6', C: '#E9D9FF', D: '#DFFFE1' };
                      const correctColor = '#7FA8FF';
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingLeft: 40 }}>
                            <div style={{ fontWeight: 700 }}>Legend:</div>
                            {(['A','B','C','D'] as string[]).map(letter => (
                              <div key={letter} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 14, height: 14, background: colorMap[letter], borderRadius: 3, border: '1px solid #e6e6e6' }} />
                                <div style={{ fontSize: 13 }}>{letter}</div>
                              </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 14, height: 14, background: correctColor, borderRadius: 3, border: '1px solid #e6e6e6' }} />
                              <div style={{ fontSize: 13 }}>Correct</div>
                            </div>
                          </div>
                          {items.map((it, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 40, textAlign: 'right', fontSize: 12 }}>Q{i+1}</div>
                              <div style={{ flex: '1 1 auto', display: 'flex', height: 28, border: '1px solid #eef2ff', borderRadius: 4, overflow: 'hidden' }}>
                                {(['A','B','C','D'] as string[]).map(letter => {
                                  const cnt = it[letter] || 0;
                                  const w = (cnt / maxTotal) * 100;
                                  const isCorrect = answerKey[i] === letter;
                                  const bg = isCorrect ? correctColor : colorMap[letter];
                                  return (
                                    <div key={letter} style={{ width: `${w}%`, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: isCorrect ? '#fff' : '#111' }}>
                                      {cnt}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                </div>
                <div className="chart-section wide card-boxplots">
                  <h3>Boxplots by Learning Competency</h3>
                  {(() => {
                    const g = preSummary.groups;
                    const arr12 = g.map(x=>x.lc12);
                    const arr34 = g.map(x=>x.lc34);
                    const arr56 = g.map(x=>x.lc56);
                    const qStats = (arr: number[]) => {
                      if (arr.length===0) return {min:0,q1:0,med:0,q3:0,max:0};
                      const sorted = [...arr].sort((a,b)=>a-b);
                      const q = (p:number) => {
                        const pos = (sorted.length-1)*p;
                        const lo = Math.floor(pos), hi = Math.ceil(pos);
                        return hi===lo ? sorted[lo] : sorted[lo] + (sorted[hi]-sorted[lo])*(pos-lo);
                      };
                      return {min:sorted[0], q1:q(0.25), med:q(0.5), q3:q(0.75), max:sorted[sorted.length-1]};
                    };
                    const s12 = qStats(arr12), s34 = qStats(arr34), s56 = qStats(arr56);
                    const renderBox = (s:any, label:string) => {
                      const scale = (v:number)=> (v/5)*260; // 0..5 to width in px
                      return (
                        <div className="boxplot" key={label}>
                          <div className="boxplot-label">{label}</div>
                          <svg viewBox="0 0 300 60" className="boxplot-svg">
                            <line x1={20+scale(s.min)} y1={30} x2={20+scale(s.max)} y2={30} stroke="#9fb7df" strokeWidth={2} />
                            <rect x={20+scale(s.q1)} y={18} width={Math.max(2, scale(s.q3)-scale(s.q1))} height={24} fill="#f0f6ff" stroke="#2C4795" />
                            <line x1={20+scale(s.med)} y1={18} x2={20+scale(s.med)} y2={42} stroke="#43A047" strokeWidth={2} />
                          </svg>
                        </div>
                      );
                    };
                    return (
                      <div className="boxplots">
                        {renderBox(s12, 'LC1-2 (Items 1–5)')}
                        {renderBox(s34, 'LC3-4 (Items 6–10)')}
                        {renderBox(s56, 'LC5-6 (Items 11–15)')}
                      </div>
                    );
                  })()}
                </div>
                
                {/* New: List of Students and their Responses */}
                <div className="chart-section table-section card-student-responses">
                  <h3>List of Students and their Responses</h3>
                  {(() => {
                    const scores = getAssessmentScores();
                    const rows = filteredStudents.map((s: any) => {
                      const entry = scores[s.username] || {} as any;
                      return {
                        id: s.id || '',
                        name: s.name || '',
                        username: s.username || '',
                        answers: entry.prePart1Responses || Array.from({ length: 15 }, () => ''),
                        score: typeof entry.prePart1Correct === 'number' ? entry.prePart1Correct : null
                      };
                    }).filter(r => r.score !== null);
                    // format name Last, First and sort alphabetically by last name
                    const fmt = (full: string) => {
                      const p = (full || '').trim().split(/\s+/);
                      if (p.length <= 1) return full;
                      const last = p[p.length-1];
                      const first = p.slice(0, p.length-1).join(' ');
                      return `${last}, ${first}`;
                    };
                    rows.sort((a,b) => {
                      const an = fmt(a.name).toLowerCase();
                      const bn = fmt(b.name).toLowerCase();
                      return an.localeCompare(bn);
                    });
                    return (
                      <div>
                        <div style={{ overflowX: 'auto' }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Name</th>
                                {Array.from({length:15}, (_,i)=> <th key={i}>Q{i+1}</th>)}
                                <th>Score</th>
                                <th style={{textAlign: 'center'}}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, idx) => (
                                <tr key={r.username || idx}>
                                  <td style={{whiteSpace: 'nowrap', textAlign: 'left'}}>{fmt(r.name)}</td>
                                  {r.answers.map((a:any, i:number) => <td key={i}>{a}</td>)}
                                  <td style={{textAlign: 'center'}}>{r.score}</td>
                                  <td style={{textAlign: 'center'}}>
                                    <button
                                      onClick={() => setFeedbackStudent({ id: r.id, name: r.name, activity: 'pre' })}
                                      style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#1976D2',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600
                                      }}
                                    >
                                      💬 Feedback
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'initial-survey' && (
            <div className="initial-survey-layout">
              {(() => {
                const resp = initSummary.responses;
                const mean = (arr:number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
                const itemMeans = Array.from({length:17}, (_,i)=> mean(resp.map(r=>r[i]).filter((v)=> typeof v==='number')));
                const ind1 = itemMeans.slice(0,5);
                const ind2 = itemMeans.slice(5,13);
                const ind3 = itemMeans.slice(13,17);
                const indMean = (arr:number[]) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
                const level = (m:number) => m>=3.26 ? 'Very High' : m>=2.51 ? 'High' : m>=1.76 ? 'Low' : 'Very Low';
                const statementTexts = [
                  'Climate change increases disease rates in my community.',
                  'Higher temperatures correlate with lower crop yields significantly.',
                  'Diarrhea cases rise when rainfall patterns change drastically.',
                  'Cholera becomes more toxic in warmer water temperatures.',
                  'Floods spread waterborne diseases faster than before now.',
                  'Public transportation reduces my personal carbon emissions significantly.',
                  'Eating natural foods lowers my environmental impact considerably.',
                  'GHG-free refrigerators decrease household emissions over time effectively.',
                  'Eco-friendly air conditioners use less energy than standard models.',
                  'Emission-free cars correlate with better local air quality.',
                  'Reducing trips decreases car fuel consumption and emissions.',
                  'Carpooling with others cuts per-person emissions by half.',
                  'Correct tire pressure improves fuel efficiency by percentages.',
                  'Proper building insulation reduces energy use significantly overall.',
                  'Solar energy adoption correlates with lower production costs.',
                  'Reusing waste heat decreases total energy consumption substantially.',
                  'Bio-gas use reduces industrial fossil fuel dependence considerably.',
                ];
                const rows = [
                  { indicator: 'Awareness of Effects or Impacts of Climate Change', itemIdx: [0,1,2,3,4], means: ind1, overall: indMean(ind1) },
                  { indicator: 'Awareness Individual Initiative to Address Climate Change', itemIdx: [5,6,7,8,9,10,11,12], means: ind2, overall: indMean(ind2) },
                  { indicator: 'Awareness of Industry Initiative to Address Climate Change', itemIdx: [13,14,15,16], means: ind3, overall: indMean(ind3) },
                ];
                return (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{textAlign:'left'}}>Indicator & Statements</th>
                        <th style={{textAlign:'center'}}>Scores</th>
                        <th style={{textAlign:'center'}}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{textAlign:'left'}}>
                            <div className="indicator-title">{row.indicator}</div>
                            <ul className="indicator-list">
                              {row.itemIdx.map((si, i) => (
                                <li key={si}>{i+1}. {statementTexts[si]}</li>
                              ))}
                            </ul>
                          </td>
                          <td style={{textAlign:'center'}}>
                            <div className="means-list">
                              <div><strong>{row.overall.toFixed(2)}</strong></div>
                              {row.itemIdx.map((si) => (
                                <div key={si}>{itemMeans[si].toFixed(2)}</div>
                              ))}
                            </div>
                          </td>
                          <td style={{textAlign:'center'}}>
                            <div className="means-list">
                              <div><strong>{level(row.overall)}</strong></div>
                              {row.itemIdx.map((si) => (
                                <div key={`lvl-${si}`}>{level(itemMeans[si])}</div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
              {/* 4-space gap */}
              <div style={{ height: 16 }} />

              {/* List of Students and their Survey Responses (Initial Survey / Pre Part 2) */}
              <div style={{ marginTop: 8 }}>
                <h3>List of Students and their Survey Responses</h3>
                {(() => {
                  const all = getAssessmentScores();
                  const rows = filteredStudents.map((s: any) => {
                    const entry = all[s.username] || {} as any;
                    const responses = Array.isArray(entry.prePart2Responses) && entry.prePart2Responses.length === 17 ? entry.prePart2Responses : null;
                    return { name: s.name || '', username: s.username || '', responses };
                  }).filter((r:any) => r.responses !== null);
                  const fmt = (full: string) => {
                    const p = (full || '').trim().split(/\s+/);
                    if (p.length <= 1) return full;
                    const last = p[p.length-1];
                    const first = p.slice(0, p.length-1).join(' ');
                    return `${last}, ${first}`;
                  };
                  rows.sort((a:any,b:any) => fmt(a.name).toLowerCase().localeCompare(fmt(b.name).toLowerCase()));
                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="data-table" style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>Name</th>
                            {Array.from({length:17}, (_,i)=> <th key={i}>Q{i+1}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r:any, idx:number) => (
                            <tr key={r.username || idx}>
                              <td style={{ whiteSpace: 'nowrap', textAlign: 'left' }}>{fmt(r.name)}</td>
                              {r.responses.map((ans:any, i:number) => <td key={i}>{ans}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === 'post-assessment' && (
            <div className="pre-assessment-layout">
              <div className="cards-row">
                <div className="stat-box metric-card card-enrolled">
                  <h4>Students Enrolled</h4>
                  <p className="stat-number-large">{usernames.length}</p>
                </div>
                <div className="stat-box metric-card card-takers">
                  <h4>Actual Takers</h4>
                  <p className="stat-number-large">{postSummary.tested}</p>
                </div>
                <div className="stat-box metric-card donut-card card-completion">
                  <h4>Completion Rate</h4>
                  <div className="donut-inline">
                    {(() => {
                      const pct = usernames.length ? Math.round((postSummary.tested / usernames.length) * 100) : 0;
                      const r = 32; const c = 2 * Math.PI * r; const dash = (pct / 100) * c;
                      return (
                        <svg viewBox="0 0 100 100" className="donut-svg">
                          <circle cx="50" cy="50" r={r} stroke="#e6eef9" strokeWidth="14" fill="none" />
                          <circle cx="50" cy="50" r={r} stroke="#6C8AE4" strokeWidth="14" fill="none" strokeDasharray={`${dash} ${c-dash}`} transform="rotate(-90 50 50)" />
                          <text x="50" y="55" textAnchor="middle" fill="#3A4A7A" fontSize="18" fontWeight={700}>{pct}%</text>
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="charts-row one-column">
                <div className="chart-section wide card-levels">
                  <h3>Students' Level of Achievement in Statistical Literacy and Critical Thinking (Post)</h3>
                  {(() => {
                    const adv = postSummary.scores.filter(s => s>=14).length;
                    const prof = postSummary.scores.filter(s => s>=11 && s<=13).length;
                    const dev = postSummary.scores.filter(s => s>=9 && s<=10).length;
                    const beg = postSummary.scores.filter(s => s<=8).length;
                    const total = postSummary.scores.length || 1;
                    const data = [
                      { label: `Beginning (${beg})`, value: Math.round((beg/total)*100) },
                      { label: `Developing (${dev})`, value: Math.round((dev/total)*100) },
                      { label: `Proficient (${prof})`, value: Math.round((prof/total)*100) },
                      { label: `Advanced (${adv})`, value: Math.round((adv/total)*100) },
                    ];
                    const colors = ['#CBD5E1','#93B5E1','#6FA8DC','#4F6EDC'];
                    return <AnalyticsChart data={data} type="bar" colors={colors} />;
                  })()}
                </div>

                <div className="chart-section wide card-histogram">
                  <h3>Frequency of Responses</h3>
                  {(() => {
                      // Stacked column: frequency of A/B/C/D for each item (1..15)
                      const all = getAssessmentScores();
                      const items = Array.from({ length: 15 }, () => ({ A: 0, B: 0, C: 0, D: 0 } as Record<string, number>));
                      filteredStudents.forEach((s: any) => {
                        const entry = all[s.username] || {} as any;
                        const answers = Array.isArray(entry.postPart1Responses) && entry.postPart1Responses.length === 15 ? entry.postPart1Responses : null;
                        if (!answers) return;
                        answers.forEach((ans: string, idx: number) => {
                          const a = (ans || '').toUpperCase();
                          if (a === 'A' || a === 'B' || a === 'C' || a === 'D') items[idx][a] = (items[idx][a] || 0) + 1;
                        });
                      });
                      const totals = items.map(it => it.A + it.B + it.C + it.D);
                      const maxTotal = Math.max(1, ...totals);
                      const answerKey = ['C','A','C','D','A','B','A','B','A','C','B','A','C','D','A'];
                      const colorMap: Record<string,string> = { A: '#FFF6C2', B: '#FFDDE6', C: '#E9D9FF', D: '#DFFFE1' };
                      const correctColor = '#7FA8FF';
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingLeft: 40 }}>
                            <div style={{ fontWeight: 700 }}>Legend:</div>
                            {(['A','B','C','D'] as string[]).map(letter => (
                              <div key={letter} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 14, height: 14, background: colorMap[letter], borderRadius: 3, border: '1px solid #e6e6e6' }} />
                                <div style={{ fontSize: 13 }}>{letter}</div>
                              </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 14, height: 14, background: correctColor, borderRadius: 3, border: '1px solid #e6e6e6' }} />
                              <div style={{ fontSize: 13 }}>Correct</div>
                            </div>
                          </div>
                          {items.map((it, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 40, textAlign: 'right', fontSize: 12 }}>Q{i+1}</div>
                              <div style={{ flex: '1 1 auto', display: 'flex', height: 28, border: '1px solid #eef2ff', borderRadius: 4, overflow: 'hidden' }}>
                                {(['A','B','C','D'] as string[]).map(letter => {
                                  const cnt = it[letter] || 0;
                                  const w = (cnt / maxTotal) * 100;
                                  const isCorrect = answerKey[i] === letter;
                                  const bg = isCorrect ? correctColor : colorMap[letter];
                                  return (
                                    <div key={letter} style={{ width: `${w}%`, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: isCorrect ? '#fff' : '#111' }}>
                                      {cnt}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                </div>
                <div className="chart-section wide card-boxplots">
                  <h3>Boxplots by Learning Competency</h3>
                  {(() => {
                    const g = postSummary.groups;
                    const arr12 = g.map(x=>x.lc12);
                    const arr34 = g.map(x=>x.lc34);
                    const arr56 = g.map(x=>x.lc56);
                    const qStats = (arr: number[]) => {
                      if (arr.length===0) return {min:0,q1:0,med:0,q3:0,max:0};
                      const sorted = [...arr].sort((a,b)=>a-b);
                      const q = (p:number) => {
                        const pos = (sorted.length-1)*p; const lo = Math.floor(pos), hi = Math.ceil(pos);
                        return hi===lo ? sorted[lo] : sorted[lo] + (sorted[hi]-sorted[lo])*(pos-lo);
                      };
                      return {min:sorted[0], q1:q(0.25), med:q(0.5), q3:q(0.75), max:sorted[sorted.length-1]};
                    };
                    const s12 = qStats(arr12), s34 = qStats(arr34), s56 = qStats(arr56);
                    const renderBox = (s:any, label:string) => {
                      const scale = (v:number)=> (v/5)*260;
                      return (
                        <div className="boxplot" key={label}>
                          <div className="boxplot-label">{label}</div>
                          <svg viewBox="0 0 300 60" className="boxplot-svg">
                            <line x1={20+scale(s.min)} y1={30} x2={20+scale(s.max)} y2={30} stroke="#9fb7df" strokeWidth={2} />
                            <rect x={20+scale(s.q1)} y={18} width={Math.max(2, scale(s.q3)-scale(s.q1))} height={24} fill="#f0f6ff" stroke="#2C4795" />
                            <line x1={20+scale(s.med)} y1={18} x2={20+scale(s.med)} y2={42} stroke="#43A047" strokeWidth={2} />
                          </svg>
                        </div>
                      );
                    };
                    return (
                      <div className="boxplots">
                        {renderBox(s12, 'LC1-2 (Items 1–5)')}
                        {renderBox(s34, 'LC3-4 (Items 6–10)')}
                        {renderBox(s56, 'LC5-6 (Items 11–15)')}
                      </div>
                    );
                  })()}
                </div>
                {/* New: List of Students and their Responses (Post Part I) */}
                <div className="chart-section table-section card-student-responses">
                  <h3>List of Students and their Responses</h3>
                  {(() => {
                    const all = getAssessmentScores();
                    const rows = filteredStudents.map((s: any) => {
                      const entry = all[s.username] || {} as any;
                      const responses = Array.isArray(entry.postPart1Responses) && entry.postPart1Responses.length === 15 ? entry.postPart1Responses : null;
                      const score = typeof entry.postPart1Correct === 'number' ? entry.postPart1Correct : null;
                      return { id: s.id || '', name: s.name || '', username: s.username || '', responses, score };
                    }).filter((r:any) => r.responses !== null);
                    const fmt = (full: string) => {
                      const p = (full || '').trim().split(/\s+/);
                      if (p.length <= 1) return full;
                      const last = p[p.length-1];
                      const first = p.slice(0, p.length-1).join(' ');
                      return `${last}, ${first}`;
                    };
                    rows.sort((a:any,b:any) => fmt(a.name).toLowerCase().localeCompare(fmt(b.name).toLowerCase()));
                    return (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              {Array.from({length:15}, (_,i)=> <th key={i}>Q{i+1}</th>)}
                              <th>Score</th>
                              <th style={{textAlign: 'center'}}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r:any, idx:number) => (
                              <tr key={r.username || idx}>
                                <td style={{ whiteSpace: 'nowrap', textAlign: 'left' }}>{fmt(r.name)}</td>
                                {r.responses.map((ans:any, i:number) => <td key={i}>{ans}</td>)}
                                <td style={{ textAlign: 'center' }}>{r.score}</td>
                                <td style={{textAlign: 'center'}}>
                                  <button
                                    onClick={() => setFeedbackStudent({ id: r.id, name: r.name, activity: 'post' })}
                                    style={{
                                      padding: '6px 12px',
                                      backgroundColor: '#1976D2',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      fontWeight: 600
                                    }}
                                  >
                                    💬 Feedback
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'end-survey' && (
            <div className="initial-survey-layout">
              {(() => {
                const resp = endSummary.responses;
                const mean = (arr:number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
                const itemMeans = Array.from({length:17}, (_,i)=> mean(resp.map(r=>r[i]).filter((v)=> typeof v==='number')));
                const ind1 = itemMeans.slice(0,5);
                const ind2 = itemMeans.slice(5,13);
                const ind3 = itemMeans.slice(13,17);
                const indMean = (arr:number[]) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
                const level = (m:number) => m>=3.26 ? 'Very High' : m>=2.51 ? 'High' : m>=1.76 ? 'Low' : 'Very Low';
                const statementTexts = [
                  'Climate change increases disease rates in my community.',
                  'Higher temperatures correlate with lower crop yields significantly.',
                  'Diarrhea cases rise when rainfall patterns change drastically.',
                  'Cholera becomes more toxic in warmer water temperatures.',
                  'Floods spread waterborne diseases faster than before now.',
                  'Public transportation reduces my personal carbon emissions significantly.',
                  'Eating natural foods lowers my environmental impact considerably.',
                  'GHG-free refrigerators decrease household emissions over time effectively.',
                  'Eco-friendly air conditioners use less energy than standard models.',
                  'Emission-free cars correlate with better local air quality.',
                  'Reducing trips decreases car fuel consumption and emissions.',
                  'Carpooling with others cuts per-person emissions by half.',
                  'Correct tire pressure improves fuel efficiency by percentages.',
                  'Proper building insulation reduces energy use significantly overall.',
                  'Solar energy adoption correlates with lower production costs.',
                  'Reusing waste heat decreases total energy consumption substantially.',
                  'Bio-gas use reduces industrial fossil fuel dependence considerably.',
                ];
                const rows = [
                  { indicator: 'Awareness of Effects or Impacts of Climate Change', itemIdx: [0,1,2,3,4], means: ind1, overall: indMean(ind1) },
                  { indicator: 'Awareness Individual Initiative to Address Climate Change', itemIdx: [5,6,7,8,9,10,11,12], means: ind2, overall: indMean(ind2) },
                  { indicator: 'Awareness of Industry Initiative to Address Climate Change', itemIdx: [13,14,15,16], means: ind3, overall: indMean(ind3) },
                ];
                return (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{textAlign:'left'}}>Indicator & Statements</th>
                        <th style={{textAlign:'center'}}>Scores</th>
                        <th style={{textAlign:'center'}}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{textAlign:'left'}}>
                            <div className="indicator-title">{row.indicator}</div>
                            <ul className="indicator-list">
                              {row.itemIdx.map((si, i) => (
                                <li key={si}>{i+1}. {statementTexts[si]}</li>
                              ))}
                            </ul>
                          </td>
                          <td style={{textAlign:'center'}}>
                            <div className="means-list">
                              <div><strong>{row.overall.toFixed(2)}</strong></div>
                              {row.itemIdx.map((si) => (
                                <div key={si}>{itemMeans[si].toFixed(2)}</div>
                              ))}
                            </div>
                          </td>
                          <td style={{textAlign:'center'}}>
                            <div className="means-list">
                              <div><strong>{level(row.overall)}</strong></div>
                              {row.itemIdx.map((si) => (
                                <div key={`lvl-${si}`}>{level(itemMeans[si])}</div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
              {/* 4-space gap */}
              <div style={{ height: 16 }} />

              {/* List of Students and their Survey Responses (End-of-Lesson / Post Part 2) */}
              <div style={{ marginTop: 8 }}>
                <h3>List of Students and their Survey Responses</h3>
                {(() => {
                  const all = getAssessmentScores();
                  const rows = filteredStudents.map((s: any) => {
                    const entry = all[s.username] || {} as any;
                    const responses = Array.isArray(entry.postPart2Responses) && entry.postPart2Responses.length === 17 ? entry.postPart2Responses : null;
                    return { name: s.name || '', username: s.username || '', responses };
                  }).filter((r:any) => r.responses !== null);
                  const fmt = (full: string) => {
                    const p = (full || '').trim().split(/\s+/);
                    if (p.length <= 1) return full;
                    const last = p[p.length-1];
                    const first = p.slice(0, p.length-1).join(' ');
                    return `${last}, ${first}`;
                  };
                  rows.sort((a:any,b:any) => fmt(a.name).toLowerCase().localeCompare(fmt(b.name).toLowerCase()));
                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="data-table" style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>Name</th>
                            {Array.from({length:17}, (_,i)=> <th key={i}>Q{i+1}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r:any, idx:number) => (
                            <tr key={r.username || idx}>
                              <td style={{ whiteSpace: 'nowrap', textAlign: 'left' }}>{fmt(r.name)}</td>
                              {r.responses.map((ans:any, i:number) => <td key={i}>{ans}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Class Record Tab — reads from Supabase */}
          {activeTab === 'class-record' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Class Record (Supabase)</h3>
                <button
                  className="download-btn"
                  onClick={() => {
                    if (!classRecord.length) return;
                    const header = ['Name', 'Username', 'Section', 'Pre-Assessment', 'Lesson 1', 'Lesson 2', 'Lesson 3', 'Post-Assessment'];
                    const rows = classRecord.map(r => [
                      r.student_name, r.student_username, r.section,
                      r.pre_score ?? '', r.lesson1_score ?? '', r.lesson2_score ?? '',
                      r.lesson3_score ?? '', r.post_score ?? ''
                    ]);
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
                    XLSX.utils.book_append_sheet(wb, ws, 'Class Record');
                    XLSX.writeFile(wb, `class_record_${sectionFilter.replace(/\s+/g,'_')}.xlsx`);
                  }}
                  disabled={classRecord.length === 0}
                >
                  Download Excel
                </button>
              </div>
              {classRecordLoading ? (
                <p>Loading...</p>
              ) : classRecord.length === 0 ? (
                <p className="no-data">No data yet. Students must submit activities and teachers must score them.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Name</th>
                        <th>Username</th>
                        <th>Section</th>
                        <th>Pre-Assessment</th>
                        <th>Lesson 1</th>
                        <th>Lesson 2</th>
                        <th>Lesson 3</th>
                        <th>Post-Assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classRecord.map((r: any, i: number) => (
                        <tr key={r.student_id || i}>
                          <td style={{ textAlign: 'left' }}>{r.student_name}</td>
                          <td className="code">{r.student_username}</td>
                          <td>{r.section}</td>
                          <td>{r.pre_score !== null ? r.pre_score : <em style={{ color: '#999' }}>—</em>}</td>
                          <td>{r.lesson1_score !== null ? r.lesson1_score : <em style={{ color: '#999' }}>—</em>}</td>
                          <td>{r.lesson2_score !== null ? r.lesson2_score : <em style={{ color: '#999' }}>—</em>}</td>
                          <td>{r.lesson3_score !== null ? r.lesson3_score : <em style={{ color: '#999' }}>—</em>}</td>
                          <td>{r.post_score !== null ? r.post_score : <em style={{ color: '#999' }}>—</em>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
        {feedbackStudent && (
          <FeedbackPanel
            studentId={feedbackStudent.id}
            studentName={feedbackStudent.name}
            activityType={feedbackStudent.activity}
            onClose={() => setFeedbackStudent(null)}
            onSubmitSuccess={() => {}}
          />
        )}
      </main>
    </div>
  );
};

export default AdminPortal;
