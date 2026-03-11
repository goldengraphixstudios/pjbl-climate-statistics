import React, { useState, useEffect } from 'react';
import { HeaderAdminIcon } from '../../components/RoleIcons';
import AnalyticsChart from '../../components/admin/AnalyticsChart';
import FeedbackPanel from '../../components/teacher/FeedbackPanel';
import ClassManagement from '../../components/teacher/ClassManagement';
import StudentList from '../../components/teacher/StudentList';
import { FeedbackRow, getFeedbackForStudents } from '../../services/feedbackService';
import { ActivityType, ResponseRow, getResponsesForStudents, teacherUpdateScore } from '../../services/responsesService';
import { getStudentState, type LessonSlug } from '../../services/studentStateService';
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

const ASSESSMENT_ANSWER_KEY = ['C','A','C','D','A','B','A','B','A','C','B','A','C','D','A'];
const RESPONSE_COLOR_MAP: Record<string, string> = {
  A: '#FFF6C2',
  B: '#FFDDE6',
  C: '#E9D9FF',
  D: '#DFFFE1'
};
const CORRECT_COLOR = '#7FA8FF';

function deriveAssessmentScore(response?: ResponseRow | null) {
  if (!response) return null;
  if (typeof response.answers?.part1Score === 'number') return response.answers.part1Score;
  if (Array.isArray(response.correctness?.part1)) return response.correctness.part1.filter(Boolean).length;
  if (typeof response.teacher_score === 'number') return response.teacher_score;
  return null;
}

function deriveGroupScores(response?: ResponseRow | null) {
  if (!response) return null;
  if (response.answers?.part1GroupScores) return response.answers.part1GroupScores;
  if (Array.isArray(response.correctness?.part1)) {
    const itemCorrect = response.correctness.part1 as boolean[];
    return {
      lc12: itemCorrect.slice(0, 5).filter(Boolean).length,
      lc34: itemCorrect.slice(5, 10).filter(Boolean).length,
      lc56: itemCorrect.slice(10, 15).filter(Boolean).length
    };
  }
  return null;
}

function buildFrequencyItems(rows: ResponseRow[]) {
  const items = Array.from({ length: 15 }, () => ({ A: 0, B: 0, C: 0, D: 0 } as Record<string, number>));
  rows.forEach((row) => {
    const answers = Array.isArray(row.answers?.part1) ? row.answers.part1 : null;
    if (!answers) return;
    answers.forEach((answer: string | null, idx: number) => {
      const normalized = (answer || '').toUpperCase();
      if (normalized === 'A' || normalized === 'B' || normalized === 'C' || normalized === 'D') {
        items[idx][normalized] = (items[idx][normalized] || 0) + 1;
      }
    });
  });
  return items;
}

function buildSurveyResponses(rows: ResponseRow[]) {
  return rows
    .map((row) => row.answers?.part2)
    .filter((answers): answers is number[] => Array.isArray(answers) && answers.length === 17);
}

function getQuartileStats(values: number[]) {
  if (values.length === 0) return { min: 0, q1: 0, med: 0, q3: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return hi === lo ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  return {
    min: sorted[0],
    q1: q(0.25),
    med: q(0.5),
    q3: q(0.75),
    max: sorted[sorted.length - 1]
  };
}

function formatDisplayName(full: string) {
  const parts = (full || '').trim().split(/\s+/);
  if (parts.length <= 1) return full;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, parts.length - 1).join(' ');
  return `${last}, ${first}`;
}

function getLessonSubmissionPreview(response?: ResponseRow | null) {
  if (!response) return { summary: 'No submission yet', detail: '' };

  if (response.activity_type === 'lesson1') {
    const state = response.answers?.lesson1State;
    if (state && typeof state === 'object') {
      const question = state?.phaseData?.[1]?.a4aQuestion || '';
      const revisedQuestion = state?.phaseData?.[1]?.a4bFinalQuestion || '';
      const completed = Object.entries(state).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'string') return value.trim().length > 0;
        if (typeof value === 'number') return true;
        if (value && typeof value === 'object') return Object.keys(value).length > 0;
        return !!value;
      }).length;
      const detailParts = [`${completed} saved lesson fields`];
      if (question) detailParts.push(`Research question: ${question}`);
      if (revisedQuestion) detailParts.push(`Revised question: ${revisedQuestion}`);
      return { summary: 'Final output submitted', detail: detailParts.join(' • ') };
    }
    return { summary: 'Final output submitted', detail: 'Lesson state captured' };
  }

  if (response.activity_type === 'lesson2') {
    const upload = response.answers?.phase4_upload;
    if (typeof upload === 'string' && upload.trim()) {
      const filename = upload.split('/').pop() || upload;
      return {
        summary: 'Upload submitted',
        detail: filename.length > 40 ? `${filename.slice(0, 37)}...` : filename
      };
    }
    const lesson2State = response.answers?.lesson2State;
    if (lesson2State && typeof lesson2State === 'object') {
      const progress = typeof lesson2State.displayProgress === 'number' ? `${lesson2State.displayProgress}% progress` : 'Draft saved';
      return {
        summary: response.answers?.__meta?.stage === 'final' ? 'Final output saved' : 'Draft saved',
        detail: progress
      };
    }
    return { summary: 'Upload submitted', detail: 'Phase 4 output saved' };
  }

  if (response.activity_type === 'lesson3') {
    const reflection = response.answers?.phase4_reflection;
    if (typeof reflection === 'string' && reflection.trim()) {
      return {
        summary: reflection.startsWith('data:') ? 'Reflection image submitted' : 'Reflection submitted',
        detail: reflection.startsWith('data:') ? 'Canvas export captured' : reflection.slice(0, 80)
      };
    }
    return { summary: 'Reflection submitted', detail: 'Phase 4 reflection saved' };
  }

  return { summary: 'Submitted', detail: '' };
}

function buildDraftLessonResponse(
  studentId: string,
  activityType: 'lesson1' | 'lesson2' | 'lesson3',
  remoteState: any
): ResponseRow | null {
  if (!remoteState) return null;

  const stateKey = activityType === 'lesson1'
    ? 'lesson1State'
    : activityType === 'lesson2'
      ? 'lesson2State'
      : 'lesson3State';

  const updatedAt =
    remoteState?.updated_at ||
    remoteState?.syncedAt ||
    remoteState?.phaseData?.[1]?.a1Timestamp ||
    new Date().toISOString();

  return {
    id: `draft-${studentId}-${activityType}`,
    student_id: studentId,
    activity_type: activityType,
    answers: {
      __meta: {
        schemaVersion: 1,
        source: 'student-state',
        activityType,
        stage: 'draft'
      },
      [stateKey]: remoteState
    },
    correctness: null,
    teacher_score: undefined,
    teacher_scored_at: undefined,
    teacher_scored_by: undefined,
    created_at: updatedAt,
    updated_at: updatedAt
  };
}

function downloadCsvFile(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatReviewValue(value: any): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return '[uploaded file]';
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => formatReviewValue(item))
      .filter((item) => item !== '—');
    return normalized.length ? normalized.join(', ') : '—';
  }
  return JSON.stringify(value, null, 2);
}

function formatScenarioObservation(value: any) {
  if (!value || typeof value !== 'object') return '—';
  const parts = [
    value.obs ? `Observed: ${value.obs}` : '',
    value.affected ? `Affected: ${value.affected}` : '',
    value.causes ? `Causes: ${value.causes}` : ''
  ].filter(Boolean);
  return parts.length ? parts.join(' | ') : '—';
}

function formatPairAnswer(value: any) {
  if (!value || typeof value !== 'object') return '—';
  const predictor = value.predictor ? `Predictor: ${value.predictor}` : '';
  const response = value.response ? `Response: ${value.response}` : '';
  return [predictor, response].filter(Boolean).join(' | ') || '—';
}

function getLessonReviewSections(response?: ResponseRow | null) {
  if (!response) return [] as Array<{ title: string; items: Array<{ label: string; value: any }> }>;

  if (response.activity_type === 'lesson1') {
    const state = response.answers?.lesson1State;
    const phaseData = state?.phaseData || {};
    return [
      {
        title: 'Phase 1',
        items: [
          { label: 'Variable 1', value: phaseData?.[1]?.a3Var1 },
          { label: 'Variable 2', value: phaseData?.[1]?.a3Var2 },
          { label: 'Reason', value: phaseData?.[1]?.a3Reason },
          { label: 'Initial research question', value: phaseData?.[1]?.a4aQuestion },
          { label: 'Revised research question', value: phaseData?.[1]?.a4bFinalQuestion }
        ]
      },
      {
        title: 'Phase 2',
        items: [
          { label: 'Pattern answers', value: phaseData?.[2]?.a1Answers },
          { label: 'Guided Pearson r answer', value: phaseData?.[2]?.a2Answer },
          { label: 'Spreadsheet result', value: phaseData?.[2]?.a3Result },
          { label: 'Interpretation', value: phaseData?.[2]?.interpretation }
        ]
      },
      {
        title: 'Phase 3',
        items: [
          { label: 'Correlation coefficient', value: phaseData?.[3]?.part1_r },
          { label: 'Interpretation', value: phaseData?.[3]?.part1_interp },
          { label: 'Possible explanation 1', value: phaseData?.[3]?.part2_exp1 },
          { label: 'Possible explanation 2', value: phaseData?.[3]?.part2_exp2 },
          { label: 'Recommendation', value: phaseData?.[3]?.recommendation }
        ]
      },
      {
        title: 'Phase 4',
        items: [
          { label: 'Confidence', value: phaseData?.[4]?.confidence },
          { label: 'Most challenging', value: phaseData?.[4]?.challenging },
          { label: 'Extension idea', value: phaseData?.[4]?.extend },
          { label: 'Uploaded final output', value: phaseData?.[4]?.uploadUrl || phaseData?.[4]?.fileDataUrl }
        ]
      }
    ].filter((section) => section.items.some((item) => formatReviewValue(item.value) !== '—'));
  }

  if (response.activity_type === 'lesson2') {
    const state = response.answers?.lesson2State || {};
    return [
      {
        title: 'Phase 1',
        items: [
          { label: 'Scenario 1', value: formatScenarioObservation(state.observations?.[1]) },
          { label: 'Scenario 2', value: formatScenarioObservation(state.observations?.[2]) },
          { label: 'Scenario 3', value: formatScenarioObservation(state.observations?.[3]) },
          { label: 'Scenario 4', value: formatScenarioObservation(state.observations?.[4]) },
          { label: 'Scenario 5', value: formatScenarioObservation(state.observations?.[5]) },
          { label: 'Scenario 6', value: formatScenarioObservation(state.observations?.[6]) },
          { label: 'Scenario 7', value: formatScenarioObservation(state.observations?.[7]) },
          { label: 'Scenario 8', value: formatScenarioObservation(state.observations?.[8]) },
          { label: 'Most urgent or severe', value: state.activity1b?.mostUrgent },
          { label: 'Question 1', value: state.activity1b?.q1 },
          { label: 'Question 2', value: state.activity1b?.q2 },
          { label: 'Question 3', value: state.activity1b?.q3 },
          { label: 'Video checkpoint answers', value: state.videoAnswers },
          { label: 'Variable pair 1', value: formatPairAnswer(state.pairAnswers?.[0]) },
          { label: 'Variable pair 2', value: formatPairAnswer(state.pairAnswers?.[1]) },
          { label: 'Variable pair 3', value: formatPairAnswer(state.pairAnswers?.[2]) },
          { label: 'Variable pair 4', value: formatPairAnswer(state.pairAnswers?.[3]) },
          { label: 'Variable pair 5', value: formatPairAnswer(state.pairAnswers?.[4]) },
          { label: 'Independent variable', value: state.a3Var1 },
          { label: 'Dependent variable', value: state.a3Var2 },
          { label: 'Reasoning', value: state.a3Reasoning },
          { label: 'Predicted correlation', value: state.a3Prediction },
          { label: 'Research question', value: state.a3ResearchQuestion },
          { label: 'Exit ticket', value: state.exitText },
          { label: 'Confidence scale 1', value: state.exitScale1 },
          { label: 'Confidence scale 2', value: state.exitScale2 },
          { label: 'Confidence scale 3', value: state.exitScale3 }
        ]
      },
      {
        title: 'Phase 2',
        items: [
          { label: 'Regression line answers', value: state.phase2A1Answers },
          { label: 'Manual regression upload', value: state.previewURL },
          { label: 'Spreadsheet verification upload', value: state.previewURL3 },
          { label: 'Equation output upload', value: state.previewURL4 },
          { label: 'Regression equation', value: state.p4Equation },
          { label: 'Y-intercept', value: state.p4YIntercept },
          { label: 'Interpretation', value: state.p4Interpretation }
        ]
      },
      {
        title: 'Phase 3',
        items: [
          { label: 'Research question', value: state.analysisInputs?.part1_researchQuestion },
          { label: 'Regression equation', value: state.analysisInputs?.part1_regressionEquation },
          { label: 'Interpretation', value: state.analysisInputs?.part1_interpretation },
          { label: 'Evidence 1', value: state.analysisInputs?.part2_evidence1 },
          { label: 'Evidence 2', value: state.analysisInputs?.part2_evidence2 },
          { label: 'Possible explanation 1', value: state.analysisInputs?.part2_possible1 },
          { label: 'Possible explanation 2', value: state.analysisInputs?.part2_possible2 },
          { label: 'Most plausible explanation', value: state.analysisInputs?.part2_mostPlausible },
          { label: 'Correlation is not causation', value: state.analysisInputs?.part3_causationNo },
          { label: 'Potential causal interpretation', value: state.analysisInputs?.part3_causationYes },
          { label: 'Other factor 1', value: state.analysisInputs?.part3_otherFactor1 },
          { label: 'Other factor 2', value: state.analysisInputs?.part3_otherFactor2 },
          { label: 'Biggest concern', value: state.analysisInputs?.part4_biggestConcern },
          { label: 'Confidence effect', value: state.analysisInputs?.part4_confidenceEffect },
          { label: 'Stakeholder 1', value: state.analysis2Inputs?.part1_s1 },
          { label: 'Stakeholder 2', value: state.analysis2Inputs?.part1_s2 },
          { label: 'Stakeholder 3', value: state.analysis2Inputs?.part1_s3 },
          { label: 'Relevant stakeholder', value: state.analysis2Inputs?.part2_who },
          { label: 'Why it matters', value: state.analysis2Inputs?.part2_because },
          { label: 'Decision 1', value: state.analysis2Inputs?.part3_decision1 },
          { label: 'Decision 2', value: state.analysis2Inputs?.part3_decision2 }
        ]
      },
      {
        title: 'Phase 4',
        items: [
          { label: 'Final output upload', value: response.answers?.phase4_upload || state.previewURLP4 },
          { label: 'Progress', value: typeof state.displayProgress === 'number' ? `${state.displayProgress}%` : null }
        ]
      }
    ].filter((section) => section.items.some((item) => formatReviewValue(item.value) !== '—'));
  }

  if (response.activity_type === 'lesson3') {
    const state = response.answers?.lesson3State || {};
    return [
      {
        title: 'Phase 1',
        items: [
          { label: 'Research question', value: state.recallA },
          { label: 'Regression equation', value: state.recallB },
          { label: 'Equation interpretation', value: state.recallC },
          { label: 'Confounding variables / considerations', value: state.finalConsiderations },
          { label: 'Uploaded diagram', value: state.uploadedDiagramPreview }
        ]
      },
      {
        title: 'Phase 2',
        items: [
          { label: 'Interpolation output', value: state.p2a1Preview },
          { label: 'Extrapolation output', value: state.p2a2Preview },
          { label: 'Coefficient output', value: state.p2a3Preview },
          { label: 'Coefficient interpretation', value: state.p2a3Answer }
        ]
      },
      {
        title: 'Phase 3',
        items: [
          { label: 'Prediction output', value: state.p3Preview }
        ]
      },
      {
        title: 'Phase 4',
        items: [
          { label: 'Peer answer 1', value: state.peer1Answer },
          { label: 'Peer answer 2', value: state.peer2Answer },
          { label: 'Peer answer 3', value: state.peer3Answer },
          { label: 'Peer answer 4', value: state.peer4Answer },
          { label: 'Peer review strength', value: state.peerStrength },
          { label: 'Peer review suggestion', value: state.peerSuggestion },
          { label: 'Peer reviewer username', value: state.peerReviewerUsername },
          { label: 'Final confidence', value: state.finalConfidence },
          { label: 'Confidence reason', value: state.finalConfidenceReason },
          { label: 'Most challenging concept', value: state.finalChallenge },
          { label: 'Statistics changed view', value: state.finalStatsChange },
          { label: 'Climate understanding changed', value: state.finalClimateChange },
          { label: 'Connection to real life', value: state.finalConnectionChange },
          { label: 'Extension / next step', value: state.finalExtension },
          { label: 'Learner insight', value: state.finalLearnerInsight },
          { label: 'Final reflection output', value: response.answers?.phase4_reflection || state.finalPreview }
        ]
      }
    ].filter((section) => section.items.some((item) => formatReviewValue(item.value) !== '—'));
  }

  const answerEntries = Object.entries(response.answers || {})
    .filter(([key]) => key !== '__meta')
    .map(([key, value]) => ({
      label: key.replace(/_/g, ' '),
      value
    }));

  return [
    {
      title: 'Lesson Submission',
      items: answerEntries
    }
  ].filter((section) => section.items.some((item) => formatReviewValue(item.value) !== '—'));
}

function getSubmissionReviewSections(response?: ResponseRow | null) {
  if (!response) return [] as Array<{ title: string; items: Array<{ label: string; value: any }> }>;

  if (response.activity_type === 'pre' || response.activity_type === 'post') {
    const answers = Array.isArray(response.answers?.part1) ? response.answers.part1 : [];
    const correctness = Array.isArray(response.correctness?.part1) ? response.correctness.part1 : [];
    const questionItems = answers.map((answer: string, index: number) => ({
      label: `Question ${index + 1}`,
      value: correctness.length
        ? `${answer || '-'}${typeof correctness[index] === 'boolean' ? ` (${correctness[index] ? 'Correct' : 'Incorrect'})` : ''}`
        : (answer || '-')
    }));
    const surveyAnswers = Array.isArray(response.answers?.part2) ? response.answers.part2 : [];
    const surveyItems = surveyAnswers.map((answer: number, index: number) => ({
      label: `Survey ${index + 1}`,
      value: answer
    }));

    const sections = [
      {
        title: response.activity_type === 'pre' ? 'Pre-Assessment Part 1' : 'Post-Assessment Part 1',
        items: [
          ...questionItems,
          { label: 'Score', value: deriveAssessmentScore(response) },
          { label: 'LC1-2', value: deriveGroupScores(response)?.lc12 ?? null },
          { label: 'LC3-4', value: deriveGroupScores(response)?.lc34 ?? null },
          { label: 'LC5-6', value: deriveGroupScores(response)?.lc56 ?? null }
        ]
      },
      {
        title: response.activity_type === 'pre' ? 'Initial Survey' : 'End-of-Lesson Survey',
        items: surveyItems
      }
    ];

    return sections.filter((section) => section.items.some((item: { value: any }) => {
      const formatted = formatReviewValue(item.value);
      return formatted !== '-' && formatted !== 'â€”';
    }));
  }

  return getLessonReviewSections(response);
}

const AdminPortal: React.FC<AdminPortalProps> = ({ user, onLogout, classes, onCreateClass, onUpdateStudents, onDeleteClass }) => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [sectionFilter, setSectionFilter] = useState<string>('ALL');
  const [feedbackStudent, setFeedbackStudent] = useState<{
    id: string;
    name: string;
    activity: any;
    title?: string;
    helperText?: string;
    feedbackScope?: 'overall' | 'activity';
    subActivityKey?: string | null;
  } | null>(null);
  const [classRecord, setClassRecord] = useState<any[]>([]);
  const [classRecordLoading, setClassRecordLoading] = useState(false);
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([]);
  const [responseRows, setResponseRows] = useState<ResponseRow[]>([]);
  const [lessonStateMap, setLessonStateMap] = useState<Record<string, any>>({});
  const [feedbackRefreshKey, setFeedbackRefreshKey] = useState(0);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [scoreSavingKey, setScoreSavingKey] = useState<string | null>(null);
  const [reviewRow, setReviewRow] = useState<{
    name: string;
    username: string;
    activityType: ActivityType;
    response: ResponseRow;
  } | null>(null);

  const mergeReviewResponse = (response: ResponseRow, remoteState: any): ResponseRow => {
    if (!remoteState) return response;
    if (response.activity_type === 'lesson1') {
      const responseState = response.answers?.lesson1State || {};
      const mergedPhaseData = {
        ...(remoteState?.phaseData || {}),
        ...(responseState?.phaseData || {})
      };
      for (const phase of [1, 2, 3, 4] as const) {
        mergedPhaseData[phase] = {
          ...(remoteState?.phaseData?.[phase] || {}),
          ...(responseState?.phaseData?.[phase] || {})
        };
      }
      return {
        ...response,
        answers: {
          ...(response.answers || {}),
          lesson1State: {
            ...(remoteState || {}),
            ...(responseState || {}),
            phaseData: mergedPhaseData
          }
        }
      };
    }

    if (response.activity_type === 'lesson2') {
      const responseState = response.answers?.lesson2State || {};
      return {
        ...response,
        answers: {
          ...(response.answers || {}),
          lesson2State: {
            ...(remoteState || {}),
            ...(responseState || {})
          }
        }
      };
    }

    if (response.activity_type === 'lesson3') {
      const responseState = response.answers?.lesson3State || {};
      return {
        ...response,
        answers: {
          ...(response.answers || {}),
          lesson3State: {
            ...(remoteState || {}),
            ...(responseState || {})
          }
        }
      };
    }

    return response;
  };

  const openReviewRow = async (
    name: string,
    username: string,
    activityType: ActivityType,
    response: ResponseRow
  ) => {
    if (activityType === 'lesson1' || activityType === 'lesson2' || activityType === 'lesson3') {
      try {
        const remoteState = await getStudentState(response.student_id, activityType as LessonSlug);
        setReviewRow({
          name,
          username,
          activityType,
          response: mergeReviewResponse(response, remoteState)
        });
        return;
      } catch (error) {
        console.error('openReviewRow lesson state merge failed', error);
      }
    }

    setReviewRow({ name, username, activityType, response });
  };

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

  tabs.splice(5, 0,
    { id: 'lesson1-results', label: 'Lesson 1 Outputs', icon: 'L1' },
    { id: 'lesson2-results', label: 'Lesson 2 Outputs', icon: 'L2' },
    { id: 'lesson3-results', label: 'Lesson 3 Outputs', icon: 'L3' }
  );

  const analyticsTabIds = ['pre-assessment', 'initial-survey', 'post-assessment', 'end-survey', 'class-record'];
  const filterTabIds = [...analyticsTabIds, 'lesson1-results', 'lesson2-results', 'lesson3-results'];

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
  }, [activeTab, sectionFilter, classes, feedbackRefreshKey]);

  useEffect(() => {
    const loadFeedback = async () => {
      try {
        const studentIds = (sectionFilter === 'ALL'
          ? classes.flatMap(c => c.students)
          : classes.filter(c => `Section ${c.section}` === sectionFilter).flatMap(c => c.students))
          .map((s: any) => s.id)
          .filter(Boolean);
        if (studentIds.length === 0) {
          setFeedbackRows([]);
          return;
        }
        const rows = await getFeedbackForStudents(studentIds);
        setFeedbackRows(rows);
      } catch (e) {
        console.error('[AdminPortal] feedback load error', e);
      }
    };
    loadFeedback();
  }, [classes, sectionFilter, feedbackRefreshKey]);

  useEffect(() => {
    const loadResponses = async () => {
      try {
        const selectedStudents = (sectionFilter === 'ALL'
          ? classes.flatMap(c => c.students)
          : classes.filter(c => `Section ${c.section}` === sectionFilter).flatMap(c => c.students));
        const studentIds = selectedStudents
          .map((s: any) => s.id)
          .filter(Boolean);
        if (studentIds.length === 0) {
          setResponseRows([]);
          setLessonStateMap({});
          return;
        }
        const rows = await getResponsesForStudents(studentIds);
        setResponseRows(rows);
        const lessonStates = await Promise.all(
          selectedStudents.flatMap((student: any) =>
            (['lesson1', 'lesson2', 'lesson3'] as LessonSlug[]).map(async (lessonSlug) => {
              const state = await getStudentState(student.id, lessonSlug);
              return [`${student.id}::${lessonSlug}`, state] as const;
            })
          )
        );
        setLessonStateMap(Object.fromEntries(lessonStates.filter(([, state]) => !!state)));
      } catch (e) {
        console.error('[AdminPortal] responses load error', e);
      }
    };
    loadResponses();
  }, [classes, sectionFilter, feedbackRefreshKey]);

  const getLatestResponse = (studentId: string, activityType: ActivityType) =>
    responseRows.find((row) => row.student_id === studentId && row.activity_type === activityType);

  const getScoreKey = (studentId: string, activityType: ActivityType) => `${studentId}::${activityType}`;

  const getScoreDraft = (studentId: string, activityType: ActivityType, currentScore?: number | null) => {
    const key = getScoreKey(studentId, activityType);
    return scoreDrafts[key] ?? (typeof currentScore === 'number' ? String(currentScore) : '');
  };

  const setScoreDraft = (studentId: string, activityType: ActivityType, value: string) => {
    const key = getScoreKey(studentId, activityType);
    setScoreDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveLessonScore = async (studentId: string, activityType: ActivityType, currentScore?: number | null) => {
    const key = getScoreKey(studentId, activityType);
    const raw = (scoreDrafts[key] ?? (typeof currentScore === 'number' ? String(currentScore) : '')).trim();
    if (raw === '') return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      window.alert('Enter a valid score.');
      return;
    }

    try {
      setScoreSavingKey(key);
      await teacherUpdateScore(studentId, activityType, parsed);
      setFeedbackRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('[AdminPortal] score save error', error);
      window.alert('Failed to save score. Please try again.');
    } finally {
      setScoreSavingKey(null);
    }
  };

  const sectionOptions = ['ALL', ...classes.map(c => `Section ${c.section}`)];
  const filteredStudents = sectionFilter === 'ALL'
    ? classes.flatMap(c => c.students)
    : classes.filter(c => `Section ${c.section}` === sectionFilter).flatMap(c => c.students);
  const filteredStudentIds = filteredStudents.map((s: any) => s.id).filter(Boolean);
  const filteredDbResponses = responseRows.filter((row) => filteredStudentIds.includes(row.student_id));
  const preResponseRows = filteredDbResponses.filter((row) => row.activity_type === 'pre');
  const lesson1ResponseRows = filteredDbResponses.filter((row) => row.activity_type === 'lesson1');
  const lesson2ResponseRows = filteredDbResponses.filter((row) => row.activity_type === 'lesson2');
  const lesson3ResponseRows = filteredDbResponses.filter((row) => row.activity_type === 'lesson3');
  const postResponseRows = filteredDbResponses.filter((row) => row.activity_type === 'post');
  const preSummary = {
    total: filteredStudents.length,
    tested: preResponseRows.length,
    scores: preResponseRows.map((row) => deriveAssessmentScore(row)).filter((score): score is number => typeof score === 'number'),
    groups: preResponseRows
      .map((row) => deriveGroupScores(row))
      .filter((group): group is { lc12: number; lc34: number; lc56: number } => !!group)
  };
  const usernames = filteredStudents.map((s: any) => s.username).filter(Boolean);
  const initSummary = {
    responses: buildSurveyResponses(preResponseRows)
  };
  const postSummary = {
    total: filteredStudents.length,
    tested: postResponseRows.length,
    scores: postResponseRows.map((row) => deriveAssessmentScore(row)).filter((score): score is number => typeof score === 'number'),
    groups: postResponseRows
      .map((row) => deriveGroupScores(row))
      .filter((group): group is { lc12: number; lc34: number; lc56: number } => !!group)
  };
  const endSummary = {
    responses: buildSurveyResponses(postResponseRows)
  };

  const getAssessmentRowsForExport = (activityType: 'pre' | 'post') => {
    return filteredStudents.map((student: any) => {
      const response = getLatestResponse(student.id, activityType);
      const answers = Array.isArray(response?.answers?.part1) ? response.answers.part1 : null;
      const derivedScore = Array.isArray(response?.correctness?.part1)
        ? response.correctness.part1.filter(Boolean).length
        : null;
      const score = response?.answers?.part1Score ?? derivedScore ?? response?.teacher_score ?? null;
      return {
        name: student.name || '',
        username: student.username || '',
        answers,
        score
      };
    }).filter((row) => Array.isArray(row.answers));
  };

  const getSurveyRowsForExport = (activityType: 'pre' | 'post') => {
    return filteredStudents.map((student: any) => {
      const response = getLatestResponse(student.id, activityType);
      const responses = Array.isArray(response?.answers?.part2) ? response.answers.part2 : null;
      return {
        name: student.name || '',
        username: student.username || '',
        responses
      };
    }).filter((row) => Array.isArray(row.responses));
  };

  const getLessonRowsForActivity = (activityType: 'lesson1' | 'lesson2' | 'lesson3') => {
    return filteredStudents.map((s: any) => {
      const response = getLatestResponse(s.id, activityType);
      const remoteState = lessonStateMap[`${s.id}::${activityType}`];
      const mergedResponse = response
        ? mergeReviewResponse(response, remoteState)
        : buildDraftLessonResponse(s.id, activityType, remoteState);
      const feedback = feedbackRows.find((f) => f.student_id === s.id && f.activity_type === activityType);
      const preview = getLessonSubmissionPreview(mergedResponse);
      return {
        id: s.id || '',
        name: s.name || '',
        username: s.username || '',
        response: mergedResponse,
        feedback,
        preview
      };
    }).filter((row) => row.response)
      .sort((a, b) => formatDisplayName(a.name).toLowerCase().localeCompare(formatDisplayName(b.name).toLowerCase()));
  };

  const renderLessonResultsTab = (activityType: 'lesson1' | 'lesson2' | 'lesson3', rows: ResponseRow[]) => {
    const lessonLabelMap = {
      lesson1: 'Lesson 1',
      lesson2: 'Lesson 2',
      lesson3: 'Lesson 3'
    } as const;

    const lessonRows = getLessonRowsForActivity(activityType);
    const scoredRows = rows.filter((row) => typeof row.teacher_score === 'number');
    const averageScore = scoredRows.length
      ? (scoredRows.reduce((sum, row) => sum + Number(row.teacher_score || 0), 0) / scoredRows.length).toFixed(2)
      : null;
    const feedbackReadyCount = lessonRows.filter((row) => !!row.feedback).length;

    return (
      <div className="chart-section table-section card-student-responses">
        <h3>{lessonLabelMap[activityType]} Final Outputs</h3>
        <div className="lesson-results-summary lesson-results-summary--cards">
          <span>Submitted outputs: {lessonRows.length}</span>
          <span>Scored outputs: {scoredRows.length}</span>
          <span>Feedback sent: {feedbackReadyCount}</span>
          <span>Average score: {averageScore ?? '—'}</span>
        </div>
        {lessonRows.length === 0 ? (
          <p className="no-data">No submitted outputs yet for this section filter.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table lesson-results-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Submission</th>
                  <th>Teacher Score</th>
                  <th>Feedback</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {lessonRows.map((row) => {
                  const response = row.response!;
                  const key = getScoreKey(row.id, activityType);
                  const scoreValue = getScoreDraft(row.id, activityType, response.teacher_score ?? null);
                  const isDraftOnly = response.id.startsWith('draft-');
                  return (
                    <tr key={key}>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'left' }}>
                        <div>{formatDisplayName(row.name)}</div>
                        <div className="lesson-meta">{row.username}</div>
                      </td>
                      <td style={{ textAlign: 'left', minWidth: 260 }}>
                        <div className="lesson-preview-title">{row.preview.summary}</div>
                        {row.preview.detail && <div className="lesson-meta">{row.preview.detail}</div>}
                        <div className="lesson-meta">
                          Submitted {new Date(response.updated_at).toLocaleString()}
                        </div>
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <div className="lesson-score-cell">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={scoreValue}
                            onChange={(e) => setScoreDraft(row.id, activityType, e.target.value)}
                            className="lesson-score-input"
                            placeholder="Enter score"
                          />
                          <button
                            type="button"
                            className="download-btn lesson-score-save"
                            disabled={isDraftOnly || scoreSavingKey === key || scoreValue.trim() === ''}
                            onClick={() => handleSaveLessonScore(row.id, activityType, response.teacher_score ?? null)}
                          >
                            {isDraftOnly ? 'Draft only' : scoreSavingKey === key ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                        {isDraftOnly && (
                          <div className="lesson-meta">
                            Student has saved lesson state but has not created a final response row yet.
                          </div>
                        )}
                        {typeof response.teacher_score === 'number' && (
                          <div className="lesson-meta">
                            Current score: {response.teacher_score}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'left', minWidth: 220 }}>
                        <div>{row.feedback?.feedback_text || 'No feedback yet'}</div>
                        {row.feedback?.acknowledged && (
                          <div className="lesson-feedback-state">Acknowledged</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => openReviewRow(
                              row.name,
                              row.username,
                              activityType,
                              response
                            )}
                            className="download-btn lesson-feedback-button"
                          >
                            Review
                          </button>
                          <button
                            onClick={() => setFeedbackStudent({
                              id: row.id,
                              name: row.name,
                              activity: activityType,
                              title: `${lessonLabelMap[activityType]} Feedback`,
                              helperText: 'Use this for the overall lesson feedback that appears on the student lesson page and performance summary.',
                              feedbackScope: 'overall',
                              subActivityKey: null
                            })}
                            className="download-btn lesson-feedback-button"
                          >
                            Feedback
                          </button>
                          {activityType === 'lesson1' && (
                            <button
                              onClick={() => setFeedbackStudent({
                                id: row.id,
                                name: row.name,
                                activity: activityType,
                                title: 'Lesson 1 Activity 4 Feedback',
                                helperText: 'Use this only for the Activity 4 research-question revision step in Lesson 1.',
                                feedbackScope: 'activity',
                                subActivityKey: 'lesson1_phase1_activity4'
                              })}
                              className="download-btn lesson-feedback-button"
                            >
                              Activity 4 Feedback
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Calculate statistics from actual classes
  // totals moved into filtered context

  const handleDownloadReport = (format: 'pdf' | 'csv') => {
    if (activeTab === 'lesson1-results' || activeTab === 'lesson2-results' || activeTab === 'lesson3-results') {
      const activityType = activeTab === 'lesson1-results' ? 'lesson1' : activeTab === 'lesson2-results' ? 'lesson2' : 'lesson3';
      const label = sectionFilter === 'ALL' ? 'all' : sectionFilter.replace(/\s+/g, '_').toLowerCase();
      const lessonRows = getLessonRowsForActivity(activityType);
      const lessonTitle = activityType === 'lesson1' ? 'Lesson 1 Outputs' : activityType === 'lesson2' ? 'Lesson 2 Outputs' : 'Lesson 3 Outputs';

      if (format === 'csv') {
        const rows: string[][] = [['Name', 'Username', 'Submission', 'Submission Detail', 'Teacher Score', 'Feedback', 'Acknowledged', 'Updated At']];
        lessonRows.forEach((row) => {
          rows.push([
            formatDisplayName(row.name || ''),
            row.username || '',
            row.preview.summary,
            row.preview.detail || '',
            row.response?.teacher_score != null ? String(row.response.teacher_score) : '',
            row.feedback?.feedback_text || '',
            row.feedback?.acknowledged ? 'Yes' : 'No',
            row.response?.updated_at ? new Date(row.response.updated_at).toLocaleString() : ''
          ]);
        });
        downloadCsvFile(rows, `${activityType}_outputs_${label}.csv`);
        return;
      }

      const html = `
        <html>
          <head>
            <title>${lessonTitle}</title>
            <style>
              body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:18px}
              h1{font-size:20px;margin-bottom:6px}
              table{border-collapse:collapse;width:100%;font-size:12px;margin-top:12px}
              th,td{border:1px solid #e5e7eb;padding:6px;vertical-align:top}
              th{background:#f8fafc}
              .small{font-size:12px;color:#374151}
            </style>
          </head>
          <body>
            <h1>${lessonTitle}</h1>
            <div class="small">Filter: ${sectionFilter} - Generated from Admin Dashboard</div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Submission</th>
                  <th>Teacher Score</th>
                  <th>Feedback</th>
                  <th>Acknowledged</th>
                  <th>Updated At</th>
                </tr>
              </thead>
              <tbody>
                ${lessonRows.map((row) => `
                  <tr>
                    <td>${formatDisplayName(row.name || '')}</td>
                    <td>${row.username || ''}</td>
                    <td><strong>${row.preview.summary}</strong><br/>${row.preview.detail || ''}</td>
                    <td>${row.response?.teacher_score != null ? row.response.teacher_score : ''}</td>
                    <td>${row.feedback?.feedback_text || ''}</td>
                    <td>${row.feedback?.acknowledged ? 'Yes' : 'No'}</td>
                    <td>${row.response?.updated_at ? new Date(row.response.updated_at).toLocaleString() : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;
      const popup = window.open('', '_blank');
      if (!popup) return;
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      setTimeout(() => { try { popup.print(); } catch {} }, 400);
      return;
    }

    if (format === 'csv') {
      if (activeTab === 'pre-assessment') {
        const rows: string[][] = [];
        rows.push(['Name','Username', ...Array.from({length:15}, (_,i)=>`Q${i+1}`), 'Score']);
        getAssessmentRowsForExport('pre').forEach((row) => {
          rows.push([
            formatDisplayName(row.name || ''),
            row.username || '',
            ...(row.answers || []).map((answer: any) => String(answer)),
            row.score != null ? String(row.score) : ''
          ]);
        });
        const label = sectionFilter === 'ALL' ? 'all' : sectionFilter.replace(/\s+/g,'_').toLowerCase();
        downloadCsvFile(rows, `pre_assessment_responses_${label}.csv`);
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
        getSurveyRowsForExport('pre').forEach((row) => {
          rows.push([
            formatDisplayName(row.name || ''),
            row.username || '',
            ...(row.responses || []).map((response: any) => String(response))
          ]);
        });
        const label = sectionFilter === 'ALL' ? 'all' : sectionFilter.replace(/\s+/g,'_').toLowerCase();
        downloadCsvFile(rows, `initial_survey_full_${label}.csv`);
      } else if (activeTab === 'post-assessment') {
        const rows: string[][] = [];
        rows.push(['Name','Username', ...Array.from({length:15}, (_,i)=>`Q${i+1}`), 'Score']);
        getAssessmentRowsForExport('post').forEach((row) => {
          rows.push([
            formatDisplayName(row.name || ''),
            row.username || '',
            ...(row.answers || []).map((answer: any) => String(answer)),
            row.score != null ? String(row.score) : ''
          ]);
        });
        const label = sectionFilter === 'ALL' ? 'all' : sectionFilter.replace(/\s+/g,'_').toLowerCase();
        downloadCsvFile(rows, `post_assessment_responses_${label}.csv`);
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
        getSurveyRowsForExport('post').forEach((row) => {
          rows.push([
            formatDisplayName(row.name || ''),
            row.username || '',
            ...(row.responses || []).map((response: any) => String(response))
          ]);
        });
        const label = sectionFilter === 'ALL' ? 'all' : sectionFilter.replace(/\s+/g,'_').toLowerCase();
        downloadCsvFile(rows, `end_lesson_survey_full_${label}.csv`);
      }
    } else {
      // Printable / PDF view
      if (activeTab === 'pre-assessment') {
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
        const items = buildFrequencyItems(preResponseRows);
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
        const rows = getAssessmentRowsForExport('pre').map((row) => ({
          name: row.name || '',
          username: row.username || '',
          answers: row.answers,
          score: row.score
        }));
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
        const items = buildFrequencyItems(postResponseRows);
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
        const rows = getAssessmentRowsForExport('post').map((row) => ({
          name: row.name || '',
          username: row.username || '',
          answers: row.answers,
          score: row.score
        }));
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
        const studentRows = getSurveyRowsForExport('pre').map((row) => ({
          name: row.name || '',
          username: row.username || '',
          responses: row.responses
        }));
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
        const studentRows = getSurveyRowsForExport('post').map((row) => ({
          name: row.name || '',
          username: row.username || '',
          responses: row.responses
        }));
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
          {filterTabIds.includes(activeTab) && (
            <>
              <div className="section-header">
                <h2>{tabs.find(t => t.id === activeTab)?.label}</h2>
                {(analyticsTabIds.includes(activeTab) || activeTab === 'lesson1-results' || activeTab === 'lesson2-results' || activeTab === 'lesson3-results') && <div className="download-buttons">
                  <button className="download-btn" onClick={() => handleDownloadReport('pdf')}>
                    📥 Download PDF
                  </button>
                  <button className="download-btn" onClick={() => handleDownloadReport('csv')}>
                    📥 Download CSV
                  </button>
                </div>}
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
                      const items = buildFrequencyItems(preResponseRows);
                      const totals = items.map(it => it.A + it.B + it.C + it.D);
                      const maxTotal = Math.max(1, ...totals);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingLeft: 40 }}>
                            <div style={{ fontWeight: 700 }}>Legend:</div>
                            {(['A','B','C','D'] as string[]).map(letter => (
                              <div key={letter} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 14, height: 14, background: RESPONSE_COLOR_MAP[letter], borderRadius: 3, border: '1px solid #e6e6e6' }} />
                                <div style={{ fontSize: 13 }}>{letter}</div>
                              </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 14, height: 14, background: CORRECT_COLOR, borderRadius: 3, border: '1px solid #e6e6e6' }} />
                              <div style={{ fontSize: 13 }}>Correct</div>
                            </div>
                          </div>
                          {items.map((it, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>Q{i+1}</div>
                              <div style={{ flex: '1 1 auto', display: 'flex', height: 30, border: '1px solid #dbe7fb', borderRadius: 999, overflow: 'hidden', background: '#f8fbff' }}>
                                {(['A','B','C','D'] as string[]).map(letter => {
                                  const cnt = it[letter] || 0;
                                  const w = (cnt / maxTotal) * 100;
                                  const isCorrect = ASSESSMENT_ANSWER_KEY[i] === letter;
                                  const bg = isCorrect ? CORRECT_COLOR : RESPONSE_COLOR_MAP[letter];
                                  return (
                                    <div
                                      key={letter}
                                      style={{
                                        width: `${w}%`,
                                        minWidth: cnt > 0 ? 34 : 0,
                                        background: bg,
                                        display: cnt > 0 ? 'flex' : 'none',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: isCorrect ? '#fff' : '#334155'
                                      }}
                                    >
                                      {cnt > 0 ? cnt : ''}
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
                    const renderBox = (values: number[], label:string) => {
                      const s = getQuartileStats(values);
                      const scale = (v:number)=> 24 + (v / 5) * 252;
                      const singlePoint = values.length <= 1;
                      return (
                        <div className="boxplot" key={label}>
                          <div className="boxplot-label">{label}</div>
                          <div className="boxplot-track">
                            <svg viewBox="0 0 320 64" className="boxplot-svg">
                              <line x1={24} y1={32} x2={296} y2={32} stroke="#d7e3f7" strokeWidth={8} strokeLinecap="round" />
                              {singlePoint ? (
                                <>
                                  <circle cx={scale(s.med)} cy={32} r={8} fill="#2C4795" />
                                  <circle cx={scale(s.med)} cy={32} r={3} fill="#ffffff" />
                                </>
                              ) : (
                                <>
                                  <line x1={scale(s.min)} y1={32} x2={scale(s.max)} y2={32} stroke="#9fb7df" strokeWidth={3} />
                                  <rect x={scale(s.q1)} y={20} width={Math.max(12, scale(s.q3)-scale(s.q1))} height={24} fill="#f0f6ff" stroke="#2C4795" rx={8} />
                                  <line x1={scale(s.med)} y1={18} x2={scale(s.med)} y2={46} stroke="#43A047" strokeWidth={3} />
                                </>
                              )}
                            </svg>
                            <div className="boxplot-meta">
                              {values.length === 0 ? 'No data yet' : `n=${values.length} | median ${s.med.toFixed(1)} / 5`}
                            </div>
                          </div>
                        </div>
                      );
                    };
                    return (
                      <div className="boxplots">
                        {renderBox(arr12, 'LC1-2 (Items 1-5)')}
                        {renderBox(arr34, 'LC3-4 (Items 6-10)')}
                        {renderBox(arr56, 'LC5-6 (Items 11-15)')}
                      </div>
                    );
                  })()}
                </div>
                
                {/* New: List of Students and their Responses */}
                <div className="chart-section table-section card-student-responses">
                  <h3>List of Students and their Responses</h3>
                  {(() => {
                    const rows = filteredStudents.map((s: any) => {
                      const response = getLatestResponse(s.id, 'pre');
                      const derivedScore = Array.isArray(response?.correctness?.part1)
                        ? response.correctness.part1.filter(Boolean).length
                        : null;
                      return {
                        id: s.id || '',
                        name: s.name || '',
                        username: s.username || '',
                        response,
                        answers: Array.isArray(response?.answers?.part1) ? response.answers.part1 : Array.from({ length: 15 }, () => ''),
                        score: response?.answers?.part1Score ?? derivedScore ?? response?.teacher_score ?? null
                      };
                    }).filter(r => r.score !== null && !!r.response);
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
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                      <button
                                        onClick={() => openReviewRow(
                                          r.name,
                                          r.username,
                                          'pre',
                                          r.response as ResponseRow
                                        )}
                                        style={{
                                          padding: '6px 12px',
                                          backgroundColor: '#fff',
                                          color: '#1976D2',
                                          border: '1px solid #1976D2',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          fontSize: '12px',
                                          fontWeight: 600
                                        }}
                                      >
                                        Review
                                      </button>
                                    </div>
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

          {activeTab === 'lesson1-results' && renderLessonResultsTab('lesson1', lesson1ResponseRows)}

          {activeTab === 'lesson2-results' && renderLessonResultsTab('lesson2', lesson2ResponseRows)}

          {activeTab === 'lesson3-results' && renderLessonResultsTab('lesson3', lesson3ResponseRows)}

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
                  const rows = getSurveyRowsForExport('pre').map((row) => ({
                    name: row.name || '',
                    username: row.username || '',
                    responses: row.responses
                  }));
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
                      const items = buildFrequencyItems(postResponseRows);
                      const totals = items.map(it => it.A + it.B + it.C + it.D);
                      const maxTotal = Math.max(1, ...totals);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingLeft: 40 }}>
                            <div style={{ fontWeight: 700 }}>Legend:</div>
                            {(['A','B','C','D'] as string[]).map(letter => (
                              <div key={letter} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 14, height: 14, background: RESPONSE_COLOR_MAP[letter], borderRadius: 3, border: '1px solid #e6e6e6' }} />
                                <div style={{ fontSize: 13 }}>{letter}</div>
                              </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 14, height: 14, background: CORRECT_COLOR, borderRadius: 3, border: '1px solid #e6e6e6' }} />
                              <div style={{ fontSize: 13 }}>Correct</div>
                            </div>
                          </div>
                          {items.map((it, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>Q{i+1}</div>
                              <div style={{ flex: '1 1 auto', display: 'flex', height: 30, border: '1px solid #dbe7fb', borderRadius: 999, overflow: 'hidden', background: '#f8fbff' }}>
                                {(['A','B','C','D'] as string[]).map(letter => {
                                  const cnt = it[letter] || 0;
                                  const w = (cnt / maxTotal) * 100;
                                  const isCorrect = ASSESSMENT_ANSWER_KEY[i] === letter;
                                  const bg = isCorrect ? CORRECT_COLOR : RESPONSE_COLOR_MAP[letter];
                                  return (
                                    <div
                                      key={letter}
                                      style={{
                                        width: `${w}%`,
                                        minWidth: cnt > 0 ? 34 : 0,
                                        background: bg,
                                        display: cnt > 0 ? 'flex' : 'none',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: isCorrect ? '#fff' : '#334155'
                                      }}
                                    >
                                      {cnt > 0 ? cnt : ''}
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
                    const renderBox = (values: number[], label:string) => {
                      const s = getQuartileStats(values);
                      const scale = (v:number)=> 24 + (v / 5) * 252;
                      const singlePoint = values.length <= 1;
                      return (
                        <div className="boxplot" key={label}>
                          <div className="boxplot-label">{label}</div>
                          <div className="boxplot-track">
                            <svg viewBox="0 0 320 64" className="boxplot-svg">
                              <line x1={24} y1={32} x2={296} y2={32} stroke="#d7e3f7" strokeWidth={8} strokeLinecap="round" />
                              {singlePoint ? (
                                <>
                                  <circle cx={scale(s.med)} cy={32} r={8} fill="#2C4795" />
                                  <circle cx={scale(s.med)} cy={32} r={3} fill="#ffffff" />
                                </>
                              ) : (
                                <>
                                  <line x1={scale(s.min)} y1={32} x2={scale(s.max)} y2={32} stroke="#9fb7df" strokeWidth={3} />
                                  <rect x={scale(s.q1)} y={20} width={Math.max(12, scale(s.q3)-scale(s.q1))} height={24} fill="#f0f6ff" stroke="#2C4795" rx={8} />
                                  <line x1={scale(s.med)} y1={18} x2={scale(s.med)} y2={46} stroke="#43A047" strokeWidth={3} />
                                </>
                              )}
                            </svg>
                            <div className="boxplot-meta">
                              {values.length === 0 ? 'No data yet' : `n=${values.length} | median ${s.med.toFixed(1)} / 5`}
                            </div>
                          </div>
                        </div>
                      );
                    };
                    return (
                      <div className="boxplots">
                        {renderBox(arr12, 'LC1-2 (Items 1-5)')}
                        {renderBox(arr34, 'LC3-4 (Items 6-10)')}
                        {renderBox(arr56, 'LC5-6 (Items 11-15)')}
                      </div>
                    );
                  })()}
                </div>
                {/* New: List of Students and their Responses (Post Part I) */}
                <div className="chart-section table-section card-student-responses">
                  <h3>List of Students and their Responses</h3>
                  {(() => {
                    const rows = filteredStudents.map((s: any) => {
                      const response = getLatestResponse(s.id, 'post');
                      const derivedScore = Array.isArray(response?.correctness?.part1)
                        ? response.correctness.part1.filter(Boolean).length
                        : null;
                      return {
                        id: s.id || '',
                        name: s.name || '',
                        username: s.username || '',
                        response,
                        responses: Array.isArray(response?.answers?.part1) ? response.answers.part1 : null,
                        score: response?.answers?.part1Score ?? derivedScore ?? response?.teacher_score ?? null
                      };
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
                                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button
                                      onClick={() => openReviewRow(
                                        r.name,
                                        r.username,
                                        'post',
                                        r.response
                                      )}
                                      style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#fff',
                                        color: '#1976D2',
                                        border: '1px solid #1976D2',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 600
                                      }}
                                    >
                                      Review
                                    </button>
                                  </div>
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
                  const rows = getSurveyRowsForExport('post').map((row) => ({
                    name: row.name || '',
                    username: row.username || '',
                    responses: row.responses
                  }));
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
            title={feedbackStudent.title}
            helperText={feedbackStudent.helperText}
            feedbackScope={feedbackStudent.feedbackScope}
            subActivityKey={feedbackStudent.subActivityKey}
            onClose={() => setFeedbackStudent(null)}
            onSubmitSuccess={() => setFeedbackRefreshKey(key => key + 1)}
          />
        )}
        {reviewRow && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: 24
          }}>
            <div style={{
              background: '#fff',
              borderRadius: 14,
              width: 'min(960px, 94vw)',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: 28,
              boxShadow: '0 18px 48px rgba(0,0,0,0.18)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 26, color: '#0b61c9' }}>Submission Review</h2>
                  <div style={{ marginTop: 8, color: '#444', fontSize: 15 }}>
                    <strong>{formatDisplayName(reviewRow.name)}</strong> ({reviewRow.username}) - {
                      reviewRow.activityType === 'lesson1' ? 'Lesson 1' :
                      reviewRow.activityType === 'lesson2' ? 'Lesson 2' :
                      reviewRow.activityType === 'lesson3' ? 'Lesson 3' :
                      reviewRow.activityType === 'pre' ? 'Pre-Assessment' :
                      'Post-Assessment'
                    }
                  </div>
                  <div style={{ marginTop: 4, color: '#666', fontSize: 13 }}>
                    Last updated {new Date(reviewRow.response.updated_at).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewRow(null)}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    borderRadius: 10,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Close
                </button>
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                {getSubmissionReviewSections(reviewRow.response).map((section) => (
                  <section
                    key={section.title}
                    style={{
                      border: '1px solid #dbe6f3',
                      borderRadius: 14,
                      padding: 18,
                      background: '#f8fbff'
                    }}
                  >
                    <h3 style={{ margin: '0 0 14px 0', color: '#0b61c9' }}>{section.title}</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {section.items
                        .filter((item: { value: any }) => {
                          const formatted = formatReviewValue(item.value);
                          return formatted !== '-' && formatted !== 'â€”';
                        })
                        .map((item: { label: string; value: any }) => {
                          const formatted = formatReviewValue(item.value);
                          const multiline = formatted.includes('\n') || formatted.length > 120;
                          return (
                            <div
                              key={`${section.title}-${item.label}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '220px 1fr',
                                gap: 12,
                                alignItems: multiline ? 'start' : 'center'
                              }}
                            >
                              <div style={{ fontWeight: 700, color: '#334155' }}>{item.label}</div>
                              <div
                                style={{
                                  background: '#fff',
                                  border: '1px solid #dbe6f3',
                                  borderRadius: 10,
                                  padding: '10px 12px',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  minHeight: multiline ? 72 : 'auto'
                                }}
                              >
                                {formatted}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPortal;
