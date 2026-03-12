export type SectionId = 1 | 2 | 3 | 4 | 5;

interface UserProgress {
  [sectionId: number]: number; // 0-100
}

interface AssessmentScores {
  [username: string]: {
    prePart1Responses?: string[]; // letters selected by student, length 15
    prePart1Correct?: number;
    prePart1ItemCorrect?: boolean[]; // length 15
    prePart1GroupScores?: { lc12: number; lc34: number; lc56: number }; // each 0..5
    prePart2Responses?: number[]; // 17 Likert selections
    postPart1Responses?: string[]; // letters selected by student, length 15
    postPart1Correct?: number;
    postPart1ItemCorrect?: boolean[];
    postPart1GroupScores?: { lc12: number; lc34: number; lc56: number };
    postPart2Responses?: number[];
  };
}

const PROGRESS_KEY = 'studentSectionProgress';
const SCORES_KEY = 'assessmentScores';
const REWARD_KEY = 'rewardShownSections';
import localforage from 'localforage';
import { supabase } from './supabaseClient';
import { getStudentState, upsertStudentState, resolveStudentId } from './studentStateService';

const LESSON1_KEY = 'lesson1State';

// Fallback in-memory cache populated from IndexedDB (localforage) when localStorage becomes unavailable
let LESSON1_FALLBACK: Record<string, Lesson1State> | null = null;
// Try to load any previously stored lesson1State from localforage on module init
try {
  localforage.getItem<Record<string, Lesson1State>>(LESSON1_KEY).then(v => {
    if (v) LESSON1_FALLBACK = v;
  }).catch(() => { /* ignore */ });
} catch (e) { /* ignore */ }

// Generic in-memory fallback cache for other keys that may have been written to IndexedDB
const FALLBACK_CACHE: Record<string, any> = {};
const _KNOWN_KEYS = [
  'lesson1State',
  'lesson1_phase1_activity2',
  'lesson1_phase1_activity3',
  'lesson1_phase1_activity4a',
  'lesson1_phase1_activity4b',
  'lesson1_phase2_activity1',
  'lesson1_phase2_activity2',
  'lesson1_phase2_activity3',
  'lesson1_phase2_activity2_answer',
  'lesson1_phase2_finalize_scatter',
  'lesson1_phase2_selfassess',
  'lesson1_phase2_activity4_check',
  'lesson1_phase2_activity4_interp',
  'lesson1_phase3_finish',
  'lesson1_phase3_worksheet',
  'lesson1_phase3_recommendation',
  'teacherFeedback',
  'lesson1_phase4_review',
  'lesson1_phase4_complete',
  // lesson2 keys
  'lesson2_phase1_activity1',
  'lesson2_phase1_activity1b',
  'lesson2_phase1_activity2',
  'lesson2_phase1_activity2b',
  'lesson2_phase1_activity3',
  'lesson2_phase1_activity4',
  'lesson2_phase2_activity1',
  'lesson2_phase2_activity2',
  'lesson2_phase2_activity3',
  'lesson2_phase2_activity4',
  'lesson2_phase4_activity1',
  // lesson3 keys
  'lesson3_phase1_activity1',
  'lesson3_phase1_activity2',
  'lesson3_phase2_activity1',
  'lesson3_phase2_activity2',
  'lesson3_phase2_activity3',
  'lesson3_phase3_activity1',
  'lesson3_phase4_review',
  'lesson3_phase4_complete',
  // shared progress map
  PROGRESS_KEY
];

try {
  // populate fallback cache from localforage for known keys
  _KNOWN_KEYS.forEach(k => {
    try {
      localforage.getItem(k).then(v => { if (v) FALLBACK_CACHE[k] = v; }).catch(() => {});
    } catch (e) { /* ignore */ }
  });
} catch (e) { /* ignore */ }

const safeGetAll = (key: string): any => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  // fall back to in-memory cache loaded from IndexedDB
  try { return FALLBACK_CACHE[key] || {}; } catch (e) { return {}; }
};

// Generic safe get/set helpers that attempt localStorage first, then fall back to IndexedDB via localforage
const awaitSafeGet = async (key: string): Promise<any> => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore and try localforage */ }
  try {
    return await localforage.getItem(key);
  } catch (e) {
    return null;
  }
};

const awaitSafeSet = async (key: string, value: any): Promise<void> => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    FALLBACK_CACHE[key] = value;
    return;
  } catch (err) {
    try {
      await localforage.setItem(key, value);
      FALLBACK_CACHE[key] = value;
      return;
    } catch (e) {
      console.error('awaitSafeSet failed for key', key, e);
    }
  }
};
// Synchronous-safe setter: tries localStorage first and falls back to async IndexedDB
// Does not block the caller; any fallback persistence happens asynchronously.
const safeSetItemSync = (key: string, value: any): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    FALLBACK_CACHE[key] = value;
    return;
  } catch (err) {
    FALLBACK_CACHE[key] = value;
    // Trigger async fallback but don't await here (keep sync API)
    awaitSafeSet(key, value).catch(e => console.error('safeSetItemSync fallback failed for key', key, e));
  }
};

const safeGetAllAsync = async <T>(key: string, fallback: T): Promise<T> => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch (e) { /* ignore */ }

  try {
    const stored = await awaitSafeGet(key);
    if (!stored) return fallback;
    if (typeof stored === 'string') return JSON.parse(stored) as T;
    return stored as T;
  } catch (e) {
    return fallback;
  }
};
const TEACHER_FEEDBACK_KEY = 'teacherFeedback';

export interface Lesson1State {
  unlockedPhase: number; // 0..4
  completedPhases: number[]; // phases 1..4 completed
  phaseProgress?: { [phase: number]: number }; // percent per phase (0..25)
  phaseData: {
    1?: {
      // legacy fields (kept for compatibility)
      var1?: string;
      var2?: string;
      question?: string;
      validated?: boolean;
      // Phase 1 Activity states
      a1Done?: boolean;
      a2Answers?: string[]; // length 5
      a2Score?: number; // 0..5
      a2Done?: boolean;
      a3Var1?: string;
      a3Var2?: string;
      a3Reason?: string;
      a3Done?: boolean;
      a4aQuestion?: string;
      a4aSubmitted?: boolean;
      a4bFinalQuestion?: string;
      a4bFinalized?: boolean;
    };
    2?: { 
      // New: Phase 2 Activity 1 pattern identification
      a1Answers?: string[]; // length 5
      a1Score?: number; // 0..5
      a1Done?: boolean;
      a1SelectedPair?: number; // 0..4 (UI memory)
      // Phase 2 Activity 3 spreadsheet-based Pearson r
      a3Done?: boolean;
      a3Result?: number;
      a3Var1?: string;
      a3Var2?: string;
      a3Year?: number | 'All';
      // Phase 2 Activity 2 free-text answer
      a2Answer?: string;
      a2Done?: boolean;
      // Phase 2 Finalize Scatter Plot
      checkpointFinalized?: boolean;
      // Phase 2 Self-assessment
      selfAssessment?: number; 
      selfAssessSubmitted?: boolean;
      // Phase 2 Activity 4
      a4Checked?: boolean;
      interpretation?: string;
      interpretSubmitted?: boolean;
      // Legacy placeholders kept for compatibility
      peerReview?: Array<{ reviewer: string; clearLabels: boolean; accuratePlot: boolean; patternIdentified: boolean; accurateR: boolean }>;
      quiz?: { answers: number[]; score?: number } 
    };
    3?: { stakeholders?: string[]; linkage?: string; recommendation?: string; lesson2?: any };
    4?: { format?: string; reflection?: string };
  };
}

export interface TeacherFeedback {
  [username: string]: {
    lesson1?: {
      phaseScores?: { [phase: number]: number }; // numeric scores per phase
      comments?: { [phase: number]: string };
    };
  };
}

export const getLesson1State = (username: string): Lesson1State => {
  // Try Supabase first (non-blocking). If supabase returns data, the caller can call getLesson1StateAsync.
  try {
    const raw = localStorage.getItem(LESSON1_KEY);
    const all: Record<string, Lesson1State> = raw ? JSON.parse(raw) : {};
    const existing = all[username];
    if (existing) return existing;
  } catch (err) {
    console.error('getLesson1State localStorage read failed', err);
  }
  if (LESSON1_FALLBACK) {
    const existing = LESSON1_FALLBACK[username];
    if (existing) return existing;
  }
  return { unlockedPhase: 0, completedPhases: [], phaseData: {} };
};

// Async loader from Supabase: returns the lesson state stored for the given student and lesson slug 'lesson1'
export const getLesson1StateAsync = async (studentIdOrUsername: string): Promise<Lesson1State | null> => {
  try {
    return await getStudentState(studentIdOrUsername, 'lesson1') as Lesson1State | null;
  } catch (e) {
    return null;
  }
};

export const saveLesson1State = (username: string, state: Lesson1State) => {
  try {
    // Local synchronous write
    const raw = localStorage.getItem(LESSON1_KEY);
    const all: Record<string, Lesson1State> = raw ? JSON.parse(raw) : {};
    all[username] = state;
    localStorage.setItem(LESSON1_KEY, JSON.stringify(all));
    try { LESSON1_FALLBACK = all; localforage.setItem(LESSON1_KEY, all).catch(() => {}); } catch(e) {}
  } catch (err) {
    console.error('saveLesson1State localStorage write failed, falling back to IndexedDB', err);
    try {
      const all = LESSON1_FALLBACK || {};
      all[username] = state;
      LESSON1_FALLBACK = all;
      localforage.setItem(LESSON1_KEY, all).catch(e => console.error('localforage save failed', e));
    } catch (e) {
      console.error('saveLesson1State fallback failed', e);
    }
  }

  // Persist to Supabase asynchronously (best-effort)
  (async () => {
    try {
      await upsertStudentState(username, 'lesson1', state);
    } catch (e) {
      // ignore supabase errors (keep local state)
    }
  })();
};

// Async-safe save: persists the full LESSON1 map to fallback storage (IndexedDB)
export const awaitSaveLesson1State = async (username: string, state: Lesson1State) => {
  try {
    const allRaw = (await awaitSafeGet(LESSON1_KEY)) || {};
    const all = typeof allRaw === 'string' ? JSON.parse(allRaw) : (allRaw as Record<string, Lesson1State>);
    all[username] = state;
    await awaitSafeSet(LESSON1_KEY, all);
    LESSON1_FALLBACK = all;
  } catch (e) {
    try {
      const raw = localStorage.getItem(LESSON1_KEY);
      const all: Record<string, Lesson1State> = raw ? JSON.parse(raw) : (LESSON1_FALLBACK || {});
      all[username] = state;
      try { localStorage.setItem(LESSON1_KEY, JSON.stringify(all)); } catch (_){ /* ignore */ }
      LESSON1_FALLBACK = all;
    } catch (err) {
      console.error('awaitSaveLesson1State failed', err);
    }
  }

  // Best-effort persist to Supabase synchronously in this async function
  try {
    await upsertStudentState(username, 'lesson1', state);
  } catch (e) {
    // ignore
  }
};

// Synchronous flush: attempt a sync write and fall back to async persistence
export const flushLesson1StateSync = (username: string) => {
  try {
    const raw = localStorage.getItem(LESSON1_KEY);
    const all: Record<string, Lesson1State> = raw ? JSON.parse(raw) : (LESSON1_FALLBACK || {});
    all[username] = getLesson1State(username);
    safeSetItemSync(LESSON1_KEY, all);
  } catch (e) {
    try {
      const all = LESSON1_FALLBACK || {};
      all[username] = getLesson1State(username);
      safeSetItemSync(LESSON1_KEY, all);
    } catch (err) {
      console.error('flushLesson1StateSync failed', err);
    }
  }
};

// Helpers to manage Phase 1 per-activity progress (adds up to 25%)
export const getPhase1Progress = (state: Lesson1State): number => {
  const p1 = state.phaseData[1] || {};
  let pct = 0;
  if (p1.a1Done) pct += 5.0;
  if (p1.a2Done) pct += 5.0;
  if (p1.a3Done) pct += 5.0;
  if (p1.a4aSubmitted) pct += 5.0;
  if (p1.a4bFinalized) pct += 5.0;
  return Math.min(25, pct);
};

export const setPhase1ActivityFlag = (username: string, key: keyof NonNullable<Lesson1State['phaseData'][1]>, value: any) => {
  const current = getLesson1State(username);
  const p1 = { ...(current.phaseData[1] || {}) } as NonNullable<Lesson1State['phaseData'][1]>;
  (p1 as any)[key] = value;
  // When Activity 1 is marked done, record timestamp for teacher monitoring
  if (key === 'a1Done' && value) {
    try {
      (p1 as any).a1Timestamp = new Date().toISOString();
    } catch (e) {
      (p1 as any).a1Timestamp = '';
    }
  }
  const phaseData = { ...current.phaseData, 1: p1 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  phaseProgress[1] = getPhase1Progress({ ...current, phaseData });
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  // if Phase 2 is fully complete, mark the phase as completed and unlock next phase
  if ((next.phaseProgress?.[2] || 0) >= 25) {
    const completed = Array.from(new Set([...(next.completedPhases || []), 2]));
    next.completedPhases = completed;
    next.unlockedPhase = Math.max(next.unlockedPhase || 0, 3);
  }
  saveLesson1State(username, next);
  return next;
};

// Aggregates for teacher monitoring
const PHASE1_ACTIVITY2_KEY = 'lesson1_phase1_activity2';
const PHASE1_ACTIVITY3_KEY = 'lesson1_phase1_activity3';
const PHASE1_ACTIVITY4A_KEY = 'lesson1_phase1_activity4a';
const PHASE1_ACTIVITY4B_KEY = 'lesson1_phase1_activity4b';
const PHASE2_ACTIVITY1_KEY = 'lesson1_phase2_activity1';
const PHASE2_ACTIVITY2_KEY = 'lesson1_phase2_activity2';
const PHASE2_ACTIVITY3_KEY = 'lesson1_phase2_activity3';
const PHASE2_ACTIVITY2_ANS_KEY = 'lesson1_phase2_activity2_answer';
const PHASE2_FINALIZE_SCATTER_KEY = 'lesson1_phase2_finalize_scatter';
const PHASE2_SELFASSESS_KEY = 'lesson1_phase2_selfassess';
const PHASE2_ACTIVITY4_CHECK_KEY = 'lesson1_phase2_activity4_check';
const PHASE2_ACTIVITY4_INTERP_KEY = 'lesson1_phase2_activity4_interp';
const LESSON2_P1_A1_KEY = 'lesson2_phase1_activity1a';
const LESSON2_P1_A1B_KEY = 'lesson2_phase1_activity1b';
const LESSON2_P1_A2_KEY = 'lesson2_phase1_activity2';
const LESSON2_P1_A2B_KEY = 'lesson2_phase1_activity2b';
const LESSON2_P1_A3_KEY = 'lesson2_phase1_activity3';
const LESSON2_P2_A1_KEY = 'lesson2_phase2_activity1';
const LESSON2_P2_A2_KEY = 'lesson2_phase2_activity2';
const LESSON2_P2_A3_KEY = 'lesson2_phase2_activity3';
const LESSON2_P2_A4_KEY = 'lesson2_phase2_activity4';
const LESSON2_P2_A4_INTERP_KEY = 'lesson2_phase2_activity4_interp';
const LESSON2_P1_A4_KEY = 'lesson2_phase1_activity4';
const LESSON2_P4_A1_KEY = 'lesson2_phase4_activity1';
const LESSON3_P1_A1_KEY = 'lesson3_phase1_activity1';
const LESSON3_P1_A2_KEY = 'lesson3_phase1_activity2';
const LESSON3_P2_A1_KEY = 'lesson3_phase2_activity1';

export const saveLesson3Phase1Activity1 = async (username: string, payload: { researchQuestion: string; regressionEquation: string; interpretation: string; timestamp?: string }) => {
  try {
    const storeRaw = localStorage.getItem(LESSON3_P1_A1_KEY);
    const store: Record<string, { researchQuestion: string; regressionEquation: string; interpretation: string; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { researchQuestion: payload.researchQuestion, regressionEquation: payload.regressionEquation, interpretation: payload.interpretation, timestamp: payload.timestamp || new Date().toISOString() };
    localStorage.setItem(LESSON3_P1_A1_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(LESSON3_P1_A1_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { researchQuestion: payload.researchQuestion, regressionEquation: payload.regressionEquation, interpretation: payload.interpretation, timestamp: payload.timestamp || new Date().toISOString() } };
      await awaitSafeSet(LESSON3_P1_A1_KEY, store);
    } catch (e) {
      console.error('Failed to save lesson3 phase1 activity1', e);
    }
  }
  // Best-effort persist to Supabase student_state (merge into lesson3)
  (async () => {
    try {
      const student_id = await resolveStudentId(username);
      if (!student_id) return;
      // fetch existing student_state
      const ss = await supabase.from('student_state').select('state').eq('student_id', student_id).eq('lesson_slug', 'lesson3').limit(1).maybeSingle();
      const existing = ss.data?.state || {};
      const merged = {
        ...(existing as any),
        phase3_p1_a1: { researchQuestion: payload.researchQuestion, regressionEquation: payload.regressionEquation, interpretation: payload.interpretation, timestamp: payload.timestamp || new Date().toISOString() },
        recallA: payload.researchQuestion,
        recallB: payload.regressionEquation,
        recallC: payload.interpretation,
        recallLocked: true,
      };
      await upsertStudentState(student_id, 'lesson3', merged);
    } catch (e) {
      // ignore
    }
  })();
};

export const saveLesson3Phase1Activity2 = async (username: string, payload: { fileDataUrl?: string; filename?: string; considerations?: string; timestamp?: string }) => {
  try {
    const storeRaw = localStorage.getItem(LESSON3_P1_A2_KEY);
    const store: Record<string, { fileDataUrl?: string; filename?: string; considerations?: string; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { fileDataUrl: payload.fileDataUrl, filename: payload.filename, considerations: payload.considerations, timestamp: payload.timestamp || new Date().toISOString() };
    localStorage.setItem(LESSON3_P1_A2_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(LESSON3_P1_A2_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { fileDataUrl: payload.fileDataUrl, filename: payload.filename, considerations: payload.considerations, timestamp: payload.timestamp || new Date().toISOString() } };
      await awaitSafeSet(LESSON3_P1_A2_KEY, store);
    } catch (e) {
      console.error('Failed to save lesson3 phase1 activity2', e);
    }
  }
  // Best-effort persist to Supabase student_state (merge into lesson3)
  // If a file dataUrl is supplied, try uploading to Supabase Storage and save public URL instead
  (async () => {
    try {
      const student_id = await resolveStudentId(username);
      if (!student_id) return;
      let publicUrl = payload.fileDataUrl;
      if (payload.fileDataUrl && payload.filename) {
        try {
          const uploadPath = `lesson3/${student_id}/${Date.now()}-${payload.filename}`;
          const up = await import('../services/supabaseClient').then(m => m.uploadDataUrlToStorage('uploads', uploadPath, payload.fileDataUrl!));
          if (!up.error) publicUrl = up.publicUrl;
        } catch (e) {
          // ignore upload errors and keep dataUrl
        }
      }
      const ss = await supabase.from('student_state').select('state').eq('student_id', student_id).eq('lesson_slug', 'lesson3').limit(1).maybeSingle();
      const existing = ss.data?.state || {};
      const merged = {
        ...(existing as any),
        phase3_p1_a2: { fileUrl: publicUrl, filename: payload.filename, considerations: payload.considerations, timestamp: payload.timestamp || new Date().toISOString() },
        finalConsiderations: payload.considerations || '',
        uploadedDiagramPreview: publicUrl || null,
        submitted2: true,
      };
      await upsertStudentState(student_id, 'lesson3', merged);
    } catch (e) {
      // ignore
    }
  })();
};

export const getLesson3Phase1Activity2All = (): Record<string, { fileDataUrl?: string; filename?: string; considerations?: string; timestamp?: string }> => {
  return safeGetAll(LESSON3_P1_A2_KEY) as Record<string, { fileDataUrl?: string; filename?: string; considerations?: string; timestamp?: string }>;
};

export const saveLesson3Phase2Activity1 = async (username: string, payload: { fileDataUrl?: string; filename?: string; timestamp?: string }) => {
  try {
    const storeRaw = localStorage.getItem(LESSON3_P2_A1_KEY);
    const store: Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { fileDataUrl: payload.fileDataUrl, filename: payload.filename, timestamp: payload.timestamp || new Date().toISOString() };
    localStorage.setItem(LESSON3_P2_A1_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(LESSON3_P2_A1_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { fileDataUrl: payload.fileDataUrl, filename: payload.filename, timestamp: payload.timestamp || new Date().toISOString() } };
      await awaitSafeSet(LESSON3_P2_A1_KEY, store);
    } catch (e) {
      console.error('Failed to save lesson3 phase2 activity1', e);
    }
  }
  // Best-effort persist to Supabase student_state (merge into lesson3)
  (async () => {
    try {
      const student_id = await resolveStudentId(username);
      if (!student_id) return;
      let publicUrl = payload.fileDataUrl;
      if (payload.fileDataUrl && payload.filename) {
        try {
          const uploadPath = `lesson3/${student_id}/${Date.now()}-${payload.filename}`;
          const up = await import('../services/supabaseClient').then(m => m.uploadDataUrlToStorage('uploads', uploadPath, payload.fileDataUrl!));
          if (!up.error) publicUrl = up.publicUrl;
        } catch (e) {
          // ignore upload errors and keep dataUrl
        }
      }
      const ss = await supabase.from('student_state').select('state').eq('student_id', student_id).eq('lesson_slug', 'lesson3').limit(1).maybeSingle();
      const existing = ss.data?.state || {};
      const merged = {
        ...(existing as any),
        phase3_p2_a1: { fileUrl: publicUrl, filename: payload.filename, timestamp: payload.timestamp || new Date().toISOString() },
        p2a1Preview: publicUrl || null,
        p2a1Submitted: true,
      };
      await upsertStudentState(student_id, 'lesson3', merged);
    } catch (e) {
      // ignore
    }
  })();
};

export const getLesson3Phase2Activity1All = (): Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }> => {
  return safeGetAll(LESSON3_P2_A1_KEY) as Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }>;
};

const LESSON3_P2_A2_KEY = 'lesson3_phase2_activity2';
const LESSON3_P2_A3_KEY = 'lesson3_phase2_activity3';
const LESSON3_P3_A1_KEY = 'lesson3_phase3_activity1';

export const saveLesson3Phase2Activity2 = async (username: string, payload: { fileDataUrl?: string; filename?: string; timestamp?: string }) => {
  try {
    const storeRaw = localStorage.getItem(LESSON3_P2_A2_KEY);
    const store: Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { fileDataUrl: payload.fileDataUrl, filename: payload.filename, timestamp: payload.timestamp || new Date().toISOString() };
    localStorage.setItem(LESSON3_P2_A2_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(LESSON3_P2_A2_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { fileDataUrl: payload.fileDataUrl, filename: payload.filename, timestamp: payload.timestamp || new Date().toISOString() } };
      await awaitSafeSet(LESSON3_P2_A2_KEY, store);
    } catch (e) {
      console.error('Failed to save lesson3 phase2 activity2', e);
    }
  }
  (async () => {
    try {
      const student_id = await resolveStudentId(username);
      if (!student_id) return;
      let publicUrl = payload.fileDataUrl;
      if (payload.fileDataUrl && payload.filename) {
        try {
          const uploadPath = `lesson3/${student_id}/${Date.now()}-${payload.filename}`;
          const up = await import('../services/supabaseClient').then(m => m.uploadDataUrlToStorage('uploads', uploadPath, payload.fileDataUrl!));
          if (!up.error) publicUrl = up.publicUrl;
        } catch {
          // ignore upload errors and keep original URL/data
        }
      }
      const ss = await supabase.from('student_state').select('state').eq('student_id', student_id).eq('lesson_slug', 'lesson3').limit(1).maybeSingle();
      const existing = ss.data?.state || {};
      const merged = {
        ...(existing as any),
        p2a2Preview: publicUrl || null,
        p2a2Submitted: true,
      };
      await upsertStudentState(student_id, 'lesson3', merged);
    } catch {
      // ignore
    }
  })();
};

export const getLesson3Phase2Activity2All = (): Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }> => {
  return safeGetAll(LESSON3_P2_A2_KEY) as Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }>;
};

export const saveLesson3Phase2Activity3 = async (username: string, payload: { fileDataUrl?: string; filename?: string; interpretation?: string; timestamp?: string }) => {
  try {
    const storeRaw = localStorage.getItem(LESSON3_P2_A3_KEY);
    const store: Record<string, { fileDataUrl?: string; filename?: string; interpretation?: string; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { fileDataUrl: payload.fileDataUrl, filename: payload.filename, interpretation: payload.interpretation, timestamp: payload.timestamp || new Date().toISOString() };
    localStorage.setItem(LESSON3_P2_A3_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(LESSON3_P2_A3_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { fileDataUrl: payload.fileDataUrl, filename: payload.filename, interpretation: payload.interpretation, timestamp: payload.timestamp || new Date().toISOString() } };
      await awaitSafeSet(LESSON3_P2_A3_KEY, store);
    } catch (e) {
      console.error('Failed to save lesson3 phase2 activity3', e);
    }
  }
  (async () => {
    try {
      const student_id = await resolveStudentId(username);
      if (!student_id) return;
      let publicUrl = payload.fileDataUrl;
      if (payload.fileDataUrl && payload.filename) {
        try {
          const uploadPath = `lesson3/${student_id}/${Date.now()}-${payload.filename}`;
          const up = await import('../services/supabaseClient').then(m => m.uploadDataUrlToStorage('uploads', uploadPath, payload.fileDataUrl!));
          if (!up.error) publicUrl = up.publicUrl;
        } catch {
          // ignore upload errors and keep original URL/data
        }
      }
      const ss = await supabase.from('student_state').select('state').eq('student_id', student_id).eq('lesson_slug', 'lesson3').limit(1).maybeSingle();
      const existing = ss.data?.state || {};
      const merged = {
        ...(existing as any),
        p2a3Preview: publicUrl || null,
        p2a3Answer: payload.interpretation || '',
        p2a3Submitted: true,
      };
      await upsertStudentState(student_id, 'lesson3', merged);
    } catch {
      // ignore
    }
  })();
};

export const getLesson3Phase2Activity3All = (): Record<string, { fileDataUrl?: string; filename?: string; interpretation?: string; timestamp?: string }> => {
  return safeGetAll(LESSON3_P2_A3_KEY) as Record<string, { fileDataUrl?: string; filename?: string; interpretation?: string; timestamp?: string }>;
};

export const saveLesson3Phase3Activity1 = async (username: string, payload: { fileDataUrl?: string; filename?: string; timestamp?: string }) => {
  try {
    const storeRaw = localStorage.getItem(LESSON3_P3_A1_KEY);
    const store: Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { fileDataUrl: payload.fileDataUrl, filename: payload.filename, timestamp: payload.timestamp || new Date().toISOString() };
    localStorage.setItem(LESSON3_P3_A1_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(LESSON3_P3_A1_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { fileDataUrl: payload.fileDataUrl, filename: payload.filename, timestamp: payload.timestamp || new Date().toISOString() } };
      await awaitSafeSet(LESSON3_P3_A1_KEY, store);
    } catch (e) {
      console.error('Failed to save lesson3 phase3 activity1', e);
    }
  }
  (async () => {
    try {
      const student_id = await resolveStudentId(username);
      if (!student_id) return;
      let publicUrl = payload.fileDataUrl;
      if (payload.fileDataUrl && payload.filename) {
        try {
          const uploadPath = `lesson3/${student_id}/${Date.now()}-${payload.filename}`;
          const up = await import('../services/supabaseClient').then(m => m.uploadDataUrlToStorage('uploads', uploadPath, payload.fileDataUrl!));
          if (!up.error) publicUrl = up.publicUrl;
        } catch {
          // ignore upload errors and keep original URL/data
        }
      }
      const ss = await supabase.from('student_state').select('state').eq('student_id', student_id).eq('lesson_slug', 'lesson3').limit(1).maybeSingle();
      const existing = ss.data?.state || {};
      const merged = {
        ...(existing as any),
        p3Preview: publicUrl || null,
        p3Submitted: true,
      };
      await upsertStudentState(student_id, 'lesson3', merged);
    } catch {
      // ignore
    }
  })();
};

export const getLesson3Phase3Activity1All = (): Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }> => {
  return safeGetAll(LESSON3_P3_A1_KEY) as Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }>;
};

export const getLesson3Phase1Activity1All = (): Record<string, { researchQuestion: string; regressionEquation: string; interpretation: string; timestamp?: string }> => {
  return safeGetAll(LESSON3_P1_A1_KEY) as Record<string, { researchQuestion: string; regressionEquation: string; interpretation: string; timestamp?: string }>;
};

export const saveActivity2Checkpoint = async (username: string, answers: string[], score: number) => {
  try {
    const storeRaw = localStorage.getItem(PHASE1_ACTIVITY2_KEY);
    const store: Record<string, { answers: string[]; score: number }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { answers, score };
    localStorage.setItem(PHASE1_ACTIVITY2_KEY, JSON.stringify(store));
  } catch (err) {
    // localStorage may be full; persist to IndexedDB as a fallback
    try {
      const storeRaw = (await awaitSafeGet(PHASE1_ACTIVITY2_KEY)) || {};
      const store = { ...(storeRaw as Record<string, { answers: string[]; score: number }>), [username]: { answers, score } };
      await awaitSafeSet(PHASE1_ACTIVITY2_KEY, store);
    } catch (e) {
      console.error('Failed to save activity2 checkpoint to fallback store', e);
    }
  }
  // Mirror into canonical Lesson1State for teacher monitoring (Activity 2 -> Phase1 a2 flags)
  setPhase1ActivityFlag(username, 'a2Answers', answers);
  setPhase1ActivityFlag(username, 'a2Score', score);
  setPhase1ActivityFlag(username, 'a2Done', true);
};

export const getActivity2CheckpointAll = (): Record<string, { answers: string[]; score: number }> => {
  return safeGetAll(PHASE1_ACTIVITY2_KEY) as Record<string, { answers: string[]; score: number }>;
};

// Lesson 2 Phase 1 Activity 2 (Video checkpoints for Lesson 2) - separate storage from Lesson 1
export const saveLesson2Phase1Activity2Checkpoint = (username: string, answers: string[], score: number) => {
  const store = safeGetAll(LESSON2_P1_A2_KEY) as Record<string, { answers: string[]; score: number; timestamp?: string; submitted?: boolean }>;
  store[username] = { answers, score, timestamp: new Date().toISOString(), submitted: true };
  safeSetItemSync(LESSON2_P1_A2_KEY, store);
  // Mirror into canonical Lesson1State for teacher monitoring (Activity 2 -> Phase1 a2 flags)
  try {
    setPhase1ActivityFlag(username, 'a2Answers', answers);
    setPhase1ActivityFlag(username, 'a2Score', score);
    setPhase1ActivityFlag(username, 'a2Done', true);
  } catch (e) { /* ignore */ }
  return store;
};

export const getLesson2Phase1Activity2All = (): Record<string, { answers: string[]; score: number }> => {
  return safeGetAll(LESSON2_P1_A2_KEY) as Record<string, { answers: string[]; score: number }>;
};

// Lesson 2 Phase 1 Activity 2b (Pair of Variables answers for Lesson 2)
export const saveLesson2Phase1Activity2b = (username: string, pairs: { predictor: string; response: string }[]) => {
  const store = safeGetAll(LESSON2_P1_A2B_KEY) as Record<string, { pairs: { predictor: string; response: string }[]; timestamp?: string; submitted?: boolean }>;
  store[username] = { pairs: pairs.map(p => ({ predictor: p.predictor, response: p.response })), timestamp: new Date().toISOString(), submitted: true };
  safeSetItemSync(LESSON2_P1_A2B_KEY, store);
  // Mirror minimal info for teacher monitoring
  try { setPhase1ActivityFlag(username, 'a2Done', true); } catch (e) { /* ignore */ }
  return store;
};

export const getLesson2Phase1Activity2bAll = (): Record<string, { pairs: { predictor: string; response: string }[]; timestamp?: string }> => {
  return safeGetAll(LESSON2_P1_A2B_KEY) as Record<string, { pairs: { predictor: string; response: string }[]; timestamp?: string }>;
};

// Lesson 2 Phase 1 Activity 3: Climate Variable Selection (dropdowns + encodings)
export const saveLesson2Phase1Activity3 = (username: string, var1: string, var2: string, reasoning: string, prediction: string, researchQuestion: string) => {
  const store = safeGetAll(LESSON2_P1_A3_KEY) as Record<string, { var1: string; var2: string; reasoning: string; prediction: string; researchQuestion: string; timestamp?: string; submitted?: boolean }>;
  store[username] = { var1: var1 || '', var2: var2 || '', reasoning: reasoning || '', prediction: prediction || '', researchQuestion: researchQuestion || '', timestamp: new Date().toISOString(), submitted: true };
  safeSetItemSync(LESSON2_P1_A3_KEY, store);
  // reflect in lesson1 state for teacher monitoring if desired
  try { setPhase1ActivityFlag(username, 'a3Var1', var1); setPhase1ActivityFlag(username, 'a3Var2', var2); setPhase1ActivityFlag(username, 'a3Done', true); } catch (e) { /* ignore */ }
  return store;
};

export const getLesson2Phase1Activity3All = (): Record<string, { var1: string; var2: string; reasoning: string; prediction: string; researchQuestion: string; timestamp?: string }> => {
  return safeGetAll(LESSON2_P1_A3_KEY) as Record<string, { var1: string; var2: string; reasoning: string; prediction: string; researchQuestion: string; timestamp?: string }>;
};

// Lesson 2 Phase 1 Activity 4: Exit Ticket (important learning + 3 confidence scales)
export const saveLesson2Phase1Activity4 = (username: string, importantLearning: string, confidence: number, understanding: number, connection: number) => {
  const store = safeGetAll(LESSON2_P1_A4_KEY) as Record<string, { importantLearning: string; confidence: number; understanding: number; connection: number; timestamp?: string; submitted?: boolean }>;
  store[username] = { importantLearning: importantLearning || '', confidence: confidence || 0, understanding: understanding || 0, connection: connection || 0, timestamp: new Date().toISOString(), submitted: true };
  safeSetItemSync(LESSON2_P1_A4_KEY, store);
  try { setPhase1ActivityFlag(username, 'a4aQuestion', importantLearning); setPhase1ActivityFlag(username, 'a4aSubmitted', true); } catch (e) { /* ignore */ }
  return store;
};

export const getLesson2Phase1Activity4All = (): Record<string, { importantLearning: string; confidence: number; understanding: number; connection: number; timestamp?: string }> => {
  return safeGetAll(LESSON2_P1_A4_KEY) as Record<string, { importantLearning: string; confidence: number; understanding: number; connection: number; timestamp?: string }>;
};

export const saveActivity3Choice = async (username: string, var1: string, var2: string, reason: string) => {
  try {
    const storeRaw = localStorage.getItem(PHASE1_ACTIVITY3_KEY);
    const store: Record<string, { var1: string; var2: string; reason: string }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { var1, var2, reason };
    localStorage.setItem(PHASE1_ACTIVITY3_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(PHASE1_ACTIVITY3_KEY)) || {};
      const store = { ...(storeRaw as Record<string, { var1: string; var2: string; reason: string }>), [username]: { var1, var2, reason } };
      await awaitSafeSet(PHASE1_ACTIVITY3_KEY, store);
    } catch (e) {
      console.error('Failed to save activity3 choice to fallback store', e);
      throw e;
    }
  }
  setPhase1ActivityFlag(username, 'a3Var1', var1);
  setPhase1ActivityFlag(username, 'a3Var2', var2);
  setPhase1ActivityFlag(username, 'a3Reason', reason);
  setPhase1ActivityFlag(username, 'a3Done', true);
};

export const getActivity3ChoiceAll = (): Record<string, { var1: string; var2: string; reason: string }> => {
  return safeGetAll(PHASE1_ACTIVITY3_KEY) as Record<string, { var1: string; var2: string; reason: string }>;
};

export const saveActivity4aQuestion = async (username: string, question: string) => {
  try {
    const storeRaw = await awaitSafeGet(PHASE1_ACTIVITY4A_KEY) || {};
    const store: Record<string, { question: string; feedback?: string; timestamp?: string }> = typeof storeRaw === 'string' ? JSON.parse(storeRaw) : (storeRaw as any);
    store[username] = { ...(store[username] || {}), question, timestamp: new Date().toISOString() };
    await awaitSafeSet(PHASE1_ACTIVITY4A_KEY, store);
  } catch (err) {
    console.error('saveActivity4aQuestion failed', err);
    // attempt a best-effort sync-safe write so UI doesn't crash
    try {
      const raw = localStorage.getItem(PHASE1_ACTIVITY4A_KEY);
      const store: Record<string, { question: string; feedback?: string; timestamp?: string }> = raw ? JSON.parse(raw) : {};
      store[username] = { ...(store[username] || {}), question, timestamp: new Date().toISOString() };
      safeSetItemSync(PHASE1_ACTIVITY4A_KEY, store);
    } catch (e) { console.error('saveActivity4aQuestion sync fallback failed', e); throw e; }
  }
  try {
    setPhase1ActivityFlag(username, 'a4aQuestion', question);
    setPhase1ActivityFlag(username, 'a4aSubmitted', true);
  } catch (e) { /* ignore */ }
};

export const setActivity4aFeedback = (username: string, feedback: string) => {
  try {
    const store = safeGetAll(PHASE1_ACTIVITY4A_KEY) as Record<string, { question: string; feedback?: string }> || {};
    store[username] = { ...(store[username] || { question: '' }), feedback };
    safeSetItemSync(PHASE1_ACTIVITY4A_KEY, store);
  } catch (e) { console.error('setActivity4aFeedback failed to write activity store', e); }
  // Also reflect in teacher feedback per user
  try {
    const allTF = safeGetAll(TEACHER_FEEDBACK_KEY) as TeacherFeedback || {};
    const userTF = allTF[username] || {};
    const lesson1 = userTF.lesson1 || {};
    const comments = { ...(lesson1.comments || {}), 1: feedback };
    allTF[username] = { ...userTF, lesson1: { ...lesson1, comments } };
    safeSetItemSync(TEACHER_FEEDBACK_KEY, allTF);
  } catch (e) { console.error('setActivity4aFeedback failed to write teacher feedback', e); }
};

export const getActivity4aAll = (): Record<string, { question: string; feedback?: string }> => {
  return safeGetAll(PHASE1_ACTIVITY4A_KEY) as Record<string, { question: string; feedback?: string }>;
};

export const saveActivity4bFinal = (username: string, finalQuestion: string) => {
  const storeRaw = localStorage.getItem(PHASE1_ACTIVITY4B_KEY);
  const store: Record<string, { finalQuestion: string; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = { finalQuestion, timestamp: new Date().toISOString() };
  localStorage.setItem(PHASE1_ACTIVITY4B_KEY, JSON.stringify(store));
  setPhase1ActivityFlag(username, 'a4bFinalQuestion', finalQuestion);
  setPhase1ActivityFlag(username, 'a4bFinalized', true);
};

export const getActivity4bAll = (): Record<string, { finalQuestion: string }> => {
  return safeGetAll(PHASE1_ACTIVITY4B_KEY) as Record<string, { finalQuestion: string }>;
};

export const getTeacherFeedback = (username: string) => {
  const all: TeacherFeedback = safeGetAll(TEACHER_FEEDBACK_KEY) as TeacherFeedback;
  return all[username]?.lesson1 || {};
};

// Save a numeric phase score for a student (stored under teacher feedback)
export const setPhaseScore = (username: string, phase: number, score: number) => {
  const allTF: TeacherFeedback = safeGetAll(TEACHER_FEEDBACK_KEY) as TeacherFeedback;
  const userTF = allTF[username] || {};
  const lesson1 = userTF.lesson1 || {};
  const phaseScores = { ...(lesson1.phaseScores || {}), [phase]: score };
  allTF[username] = { ...userTF, lesson1: { ...lesson1, phaseScores } };
  safeSetItemSync(TEACHER_FEEDBACK_KEY, allTF);
  // Also mirror the teacher score into the student's lesson1 state for easy teacher-portal display
  try {
    const current = getLesson1State(username);
    const p4 = { ...(current.phaseData[4] || {}) } as NonNullable<Lesson1State['phaseData'][4]>;
    (p4 as any).teacherScore = score;
    const phaseData = { ...current.phaseData, 4: p4 };
    const next: Lesson1State = { ...current, phaseData };
    saveLesson1State(username, next);
  } catch (e) { /* ignore */ }
  return allTF[username].lesson1;
};

// Phase 2 Activity 1: save answers and increment phase 2 progress by 6.25
export const savePhase2Activity1 = (username: string, answers: string[], score: number) => {
  const storeRaw = localStorage.getItem(PHASE2_ACTIVITY1_KEY);
  const store: Record<string, { answers: string[]; score: number; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = { answers, score, timestamp: new Date().toISOString() };
  localStorage.setItem(PHASE2_ACTIVITY1_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p2 = { ...(current.phaseData[2] || {}) } as NonNullable<Lesson1State['phaseData'][2]>;
  p2.a1Answers = answers;
  p2.a1Score = score;
  p2.a1Done = true;
  try { (p2 as any).a1Timestamp = new Date().toISOString(); } catch (e) { (p2 as any).a1Timestamp = ''; }
  const phaseData = { ...current.phaseData, 2: p2 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[2] || 0;
  phaseProgress[2] = Math.min(25, prev + 4.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  if ((next.phaseProgress?.[2] || 0) >= 25) {
    const completed = Array.from(new Set([...(next.completedPhases || []), 2]));
    next.completedPhases = completed;
    next.unlockedPhase = Math.max(next.unlockedPhase || 0, 3);
  }
  saveLesson1State(username, next);
  return next;
};

export const getPhase2Activity1All = (): Record<string, { answers: string[]; score: number }> => {
  // Return only the canonical Lesson 1 Phase 2 Activity 1 entries.
  // Do NOT merge Lesson 2 entries here — Lesson 2 has its own separate store.
  return safeGetAll(PHASE2_ACTIVITY1_KEY) as Record<string, { answers: string[]; score: number }>;
};

// Lesson 2 Phase 2 Activity 1: store video checkpoint answers separately from Lesson 1
export const saveLesson2Phase2Activity1 = (username: string, answers: string[], score: number) => {
  const store = safeGetAll(LESSON2_P2_A1_KEY) as Record<string, { answers: string[]; score: number; timestamp?: string; submitted?: boolean }>;
  store[username] = { answers, score, timestamp: new Date().toISOString(), submitted: true };
  safeSetItemSync(LESSON2_P2_A1_KEY, store);
  // Do NOT mirror Lesson 2 answers into the canonical Lesson 1 state — these are separate pages.
  return store;
};

export const getLesson2Phase2Activity1All = (): Record<string, { answers: string[]; score: number; timestamp?: string }> => {
  return safeGetAll(LESSON2_P2_A1_KEY) as Record<string, { answers: string[]; score: number; timestamp?: string }>;
};

// Lesson 2 Phase 2 Activity 2: student file upload (PDF) storage
export const saveLesson2Phase2Activity2 = (username: string, uploadUrl: string, mime: string, filename?: string) => {
  const store = safeGetAll(LESSON2_P2_A2_KEY) as Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string }>;
  store[username] = { uploadUrl, mime, filename: filename || '', timestamp: new Date().toISOString() };
  safeSetItemSync(LESSON2_P2_A2_KEY, store);
  // Do NOT mirror Lesson2 Phase2 Activity2 uploads into Lesson1 canonical state.
  // Lesson2 Phase2 Activity2 has its own separate store (`LESSON2_P2_A2_KEY`).
  return store;
};

export const getLesson2Phase2Activity2All = (): Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string }> => {
  return safeGetAll(LESSON2_P2_A2_KEY) as Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string }>;
};

// Lesson 2 Phase 2 Activity 3: student file upload (PDF) storage
export const saveLesson2Phase2Activity3 = (username: string, uploadUrl: string, mime: string, filename?: string) => {
  const store = safeGetAll(LESSON2_P2_A3_KEY) as Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string }>;
  store[username] = { uploadUrl, mime, filename: filename || '', timestamp: new Date().toISOString() };
  safeSetItemSync(LESSON2_P2_A3_KEY, store);
  // Do NOT mirror Lesson2 Phase2 Activity3 uploads into Lesson1 canonical state.
  // Lesson2 Phase2 Activity3 writes to `LESSON2_P2_A3_KEY` only.
  return store;
};

export const getLesson2Phase2Activity3All = (): Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string }> => {
  return safeGetAll(LESSON2_P2_A3_KEY) as Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string }>;
};

export const getPhase2FinalizeAll = (): Record<string, { finalized: boolean }> => {
  return safeGetAll(PHASE2_FINALIZE_SCATTER_KEY) as Record<string, { finalized: boolean }>;
};

export const getPhase2Activity2AnswersAll = (): Record<string, { answer: string }> => {
  return safeGetAll(PHASE2_ACTIVITY2_ANS_KEY) as Record<string, { answer: string }>;
};

// Phase 2 Activity 2 (free-text answer under scatter plot): save answer and increment by 4.00
export const savePhase2Activity2Answer = (
  username: string,
  answer: string,
  steps?: { n?: string; xSum?: string; ySum?: string; xySum?: string; xSqSum?: string; ySqSum?: string }
) => {
  const storeRaw = localStorage.getItem(PHASE2_ACTIVITY2_ANS_KEY);
  const store: Record<string, { answer: string; steps?: typeof steps; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = { answer, steps: steps || {}, timestamp: new Date().toISOString() };
  localStorage.setItem(PHASE2_ACTIVITY2_ANS_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p2 = { ...(current.phaseData[2] || {}) } as NonNullable<Lesson1State['phaseData'][2]>;
  p2.a2Answer = answer;
  p2.a2Done = true;
  try { (p2 as any).a2Timestamp = new Date().toISOString(); } catch (e) { (p2 as any).a2Timestamp = ''; }
  (p2 as any).a2Steps = steps || {};
  const phaseData = { ...current.phaseData, 2: p2 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[2] || 0;
  phaseProgress[2] = Math.min(25, prev + 4.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  if ((next.phaseProgress?.[2] || 0) >= 25) {
    const completed = Array.from(new Set([...(next.completedPhases || []), 2]));
    next.completedPhases = completed;
    next.unlockedPhase = Math.max(next.unlockedPhase || 0, 3);
  }
  saveLesson1State(username, next);
  return next;
};

// Save intermediate steps for Phase 2 Activity 2 without finalizing the activity
export const savePhase2Activity2Steps = (
  username: string,
  steps?: { n?: string; xSum?: string; ySum?: string; xySum?: string; xSqSum?: string; ySqSum?: string }
) => {
  const storeRaw = localStorage.getItem(PHASE2_ACTIVITY2_ANS_KEY);
  const store: Record<string, { answer?: string; steps?: typeof steps; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
  const existing = store[username] || {};
  store[username] = { ...existing, steps: steps || {}, timestamp: new Date().toISOString(), answer: existing.answer || '' };
  localStorage.setItem(PHASE2_ACTIVITY2_ANS_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p2 = { ...(current.phaseData[2] || {}) } as NonNullable<Lesson1State['phaseData'][2]>;
  (p2 as any).a2Steps = steps || {};
  const phaseData = { ...current.phaseData, 2: p2 };
  const next: Lesson1State = { ...current, phaseData };
  saveLesson1State(username, next);
  return next;
};

// Phase 2 Finalize Scatter Plot: mark finalized and add 4.00
export const savePhase2FinalizeScatter = async (username: string) => {
  try {
    const storeRaw = (await awaitSafeGet(PHASE2_FINALIZE_SCATTER_KEY)) || {};
    const store = typeof storeRaw === 'string' ? JSON.parse(storeRaw) : (storeRaw as Record<string, { finalized: boolean }>);
    store[username] = { finalized: true };
    // try async-safe set
    await awaitSafeSet(PHASE2_FINALIZE_SCATTER_KEY, store);
  } catch (e) {
    // fallback to sync-safe write
    try {
      const raw = localStorage.getItem(PHASE2_FINALIZE_SCATTER_KEY);
      const store: Record<string, { finalized: boolean }> = raw ? JSON.parse(raw) : {};
      store[username] = { finalized: true };
      safeSetItemSync(PHASE2_FINALIZE_SCATTER_KEY, store);
    } catch (err) {
      console.error('savePhase2FinalizeScatter failed to persist', err);
    }
  }

  const current = getLesson1State(username);
  const p2 = { ...(current.phaseData[2] || {}) } as NonNullable<Lesson1State['phaseData'][2]>;
  p2.checkpointFinalized = true;
  // mark spreadsheet activity as done when scatter is finalized
  p2.a3Done = true;
  const phaseData = { ...current.phaseData, 2: p2 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[2] || 0;
  phaseProgress[2] = Math.min(25, prev + 4.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  if ((next.phaseProgress?.[2] || 0) >= 25) {
    const completed = Array.from(new Set([...(next.completedPhases || []), 2]));
    next.completedPhases = completed;
    next.unlockedPhase = Math.max(next.unlockedPhase || 0, 3);
  }
  saveLesson1State(username, next);
  return next;
};

// Phase 2 Self-assessment submit: store answers and add 4.00
export const savePhase2SelfAssessment = async (username: string, answers: string[]) => {
  try {
    const storeRaw = localStorage.getItem(PHASE2_SELFASSESS_KEY);
    const store: Record<string, { answers: string[]; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { answers, timestamp: new Date().toISOString() };
    localStorage.setItem(PHASE2_SELFASSESS_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(PHASE2_SELFASSESS_KEY)) || {};
      const store = { ...(storeRaw as Record<string, { answers: string[]; timestamp?: string }>), [username]: { answers, timestamp: new Date().toISOString() } };
      await awaitSafeSet(PHASE2_SELFASSESS_KEY, store);
    } catch (e) {
      console.error('Failed to save Phase2 self-assessment to fallback store', e);
    }
  }

  const current = getLesson1State(username);
  const p2 = { ...(current.phaseData[2] || {}) } as NonNullable<Lesson1State['phaseData'][2]>;
  p2.selfAssessment = 1;
  p2.selfAssessSubmitted = true;
  // self-assessment is part of Activity 3: mark it done
  p2.a3Done = true;
  const phaseData = { ...current.phaseData, 2: p2 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[2] || 0;
  phaseProgress[2] = Math.min(25, prev + 4.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  if ((next.phaseProgress?.[2] || 0) >= 25) {
    const completed = Array.from(new Set([...(next.completedPhases || []), 2]));
    next.completedPhases = completed;
    next.unlockedPhase = Math.max(next.unlockedPhase || 0, 3);
  }
  saveLesson1State(username, next);
  return next;
};

// Lesson 2 Phase 1 Activity 1 (Climate Change Observation per scenario)
export const saveLesson2Phase1Activity1 = (
  username: string,
  scenarioId: number,
  obs: string,
  affected: string,
  causes: string
) => {
  const store = safeGetAll(LESSON2_P1_A1_KEY) as Record<string, Record<number, { obs: string; affected: string; causes: string; timestamp?: string; submitted?: boolean }>>;
  const userStore = store[username] || {};
  userStore[scenarioId] = { obs, affected, causes, timestamp: new Date().toISOString(), submitted: true };
  store[username] = userStore;
  safeSetItemSync(LESSON2_P1_A1_KEY, store);
  // mark phase1 activity 1 as done (teacher monitoring)
  try { setPhase1ActivityFlag(username, 'a1Done', true); } catch (e) { /* ignore */ }
  return store;
};

export const getLesson2Phase1Activity1All = (): Record<string, Record<number, { obs: string; affected: string; causes: string; timestamp?: string; submitted?: boolean }>> => {
  return safeGetAll(LESSON2_P1_A1_KEY) as Record<string, Record<number, { obs: string; affected: string; causes: string; timestamp?: string; submitted?: boolean }>>;
};

// Lesson 2 Phase1 Activity 1b (Most urgent scenario + 3 questions)
export const saveLesson2Phase1Activity1b = (
  username: string,
  mostUrgent: string,
  q1: string,
  q2: string,
  q3?: string
) => {
  const store = safeGetAll(LESSON2_P1_A1B_KEY) as Record<string, { mostUrgent: string; q1: string; q2: string; q3?: string; timestamp?: string; submitted?: boolean }>;
  store[username] = { mostUrgent, q1, q2, q3: q3 || '', timestamp: new Date().toISOString(), submitted: true };
  safeSetItemSync(LESSON2_P1_A1B_KEY, store);
  try { setPhase1ActivityFlag(username, 'a1Done', true); } catch (e) { /* ignore */ }
  return store;
};

export const getLesson2Phase1Activity1bAll = (): Record<string, { mostUrgent: string; q1: string; q2: string; q3?: string; timestamp?: string; submitted?: boolean }> => {
  return safeGetAll(LESSON2_P1_A1B_KEY) as Record<string, { mostUrgent: string; q1: string; q2: string; q3?: string; timestamp?: string; submitted?: boolean }>;
};

// Phase 2 Activity 4: check answers (adds 4.00)
export const savePhase2Activity4Check = (
  username: string,
  strengthSel?: string[],
  directionSel?: string[]
) => {
  const storeRaw = localStorage.getItem(PHASE2_ACTIVITY4_CHECK_KEY);
  const store: Record<string, { checked: boolean; strength?: string[]; direction?: string[]; timestamp?: string }> = storeRaw ? JSON.parse(storeRaw) : {};
  const ts = new Date().toISOString();
  store[username] = { checked: true, strength: strengthSel || [], direction: directionSel || [], timestamp: ts };
  localStorage.setItem(PHASE2_ACTIVITY4_CHECK_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p2 = { ...(current.phaseData[2] || {}) } as NonNullable<Lesson1State['phaseData'][2]>;
  p2.a4Checked = true;
  // persist selections into lesson state so UI can restore and lock
  try { (p2 as any).a4StrengthSel = strengthSel || []; } catch (e) { /* ignore */ }
  try { (p2 as any).a4DirectionSel = directionSel || []; } catch (e) { /* ignore */ }
  try { (p2 as any).a4CheckTimestamp = ts; } catch (e) { /* ignore */ }
  const phaseData = { ...current.phaseData, 2: p2 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[2] || 0;
  phaseProgress[2] = Math.min(25, prev + 4.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

// Phase 2 Activity 4: submit interpretation (adds 5.00)
export const savePhase2Activity4Interpret = async (
  username: string,
  interpretation: string,
  meta?: {
    var1?: string;
    var2?: string;
    question?: string;
    computedR?: string;
    strength?: string;
    direction?: string;
    encodings?: { [key: string]: string };
  }
) => {
  const ts = new Date().toISOString();
  try {
    const storeRaw = localStorage.getItem(PHASE2_ACTIVITY4_INTERP_KEY);
    const store: Record<string, { interp: string; timestamp?: string; var1?: string; var2?: string; question?: string; computedR?: string; strength?: string; direction?: string; encodings?: any }> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { interp: interpretation, timestamp: ts, var1: meta?.var1 || '', var2: meta?.var2 || '', question: meta?.question || '', computedR: meta?.computedR || '', strength: meta?.strength || '', direction: meta?.direction || '', encodings: meta?.encodings || {} };
    localStorage.setItem(PHASE2_ACTIVITY4_INTERP_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(PHASE2_ACTIVITY4_INTERP_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { interp: interpretation, timestamp: ts, var1: meta?.var1 || '', var2: meta?.var2 || '', question: meta?.question || '', computedR: meta?.computedR || '', strength: meta?.strength || '', direction: meta?.direction || '', encodings: meta?.encodings || {} } };
      await awaitSafeSet(PHASE2_ACTIVITY4_INTERP_KEY, store);
    } catch (e) {
      console.error('Failed to save phase2 interpretation to fallback store', e);
    }
  }

  const current = getLesson1State(username);
  const p2 = { ...(current.phaseData[2] || {}) } as NonNullable<Lesson1State['phaseData'][2]>;
  p2.interpretation = interpretation;
  p2.interpretSubmitted = true;
  try { (p2 as any).a4Var1 = meta?.var1 || ''; } catch (e) {}
  try { (p2 as any).a4Var2 = meta?.var2 || ''; } catch (e) {}
  try { (p2 as any).a4ResearchQuestion = meta?.question || ''; } catch (e) {}
  try { (p2 as any).a4ComputedR = meta?.computedR || ''; } catch (e) {}
  try { (p2 as any).a4Strength = meta?.strength || ''; } catch (e) {}
  try { (p2 as any).a4Direction = meta?.direction || ''; } catch (e) {}
  try { (p2 as any).a4Encodings = meta?.encodings || {}; } catch (e) {}
  try { (p2 as any).a4InterpTimestamp = ts; } catch (e) {}
  const phaseData = { ...current.phaseData, 2: p2 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[2] || 0;
  // This final interpretation/submit should contribute 10% to the phase progress
  phaseProgress[2] = Math.min(25, prev + 10.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

// Lesson 2 Phase 2 Activity 4: student file upload (PDF/image) storage (separate from interpretation meta)
export const saveLesson2Phase2Activity4 = (username: string, uploadUrl: string, mime: string, filename?: string) => {
  const store = safeGetAll(LESSON2_P2_A4_KEY) as Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string }>;
  store[username] = { uploadUrl, mime, filename: filename || '', timestamp: new Date().toISOString() };
  safeSetItemSync(LESSON2_P2_A4_KEY, store);
  try {
    const current = getLesson1State(username);
    const p2: any = { ...(current.phaseData[2] || {}) };
    (p2 as any).a4Upload = { url: uploadUrl, mime, filename: filename || '' };
    const phaseData = { ...current.phaseData, 2: p2 };
    saveLesson1State(username, { ...current, phaseData });
  } catch (e) { /* ignore */ }
  return store;
};

// Lesson2: Phase2 Activity4 interpretation/encodings (separate from Lesson1)
export const saveLesson2Phase2Activity4Interpret = async (
  username: string,
  interpretation: string,
  meta?: {
    var1?: string;
    var2?: string;
    question?: string;
    computedR?: string;
    strength?: string;
    direction?: string;
    encodings?: { [key: string]: string };
  }
) => {
  const ts = new Date().toISOString();
  try {
    const storeRaw = localStorage.getItem(LESSON2_P2_A4_INTERP_KEY);
    const store: Record<string, any> = storeRaw ? JSON.parse(storeRaw) : {};
    store[username] = { interp: interpretation, timestamp: ts, var1: meta?.var1 || '', var2: meta?.var2 || '', question: meta?.question || '', computedR: meta?.computedR || '', strength: meta?.strength || '', direction: meta?.direction || '', encodings: meta?.encodings || {} };
    localStorage.setItem(LESSON2_P2_A4_INTERP_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(LESSON2_P2_A4_INTERP_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { interp: interpretation, timestamp: ts, var1: meta?.var1 || '', var2: meta?.var2 || '', question: meta?.question || '', computedR: meta?.computedR || '', strength: meta?.strength || '', direction: meta?.direction || '', encodings: meta?.encodings || {} } };
      await awaitSafeSet(LESSON2_P2_A4_INTERP_KEY, store);
    } catch (e) {
      console.error('Failed to save lesson2 phase2 interpretation to fallback store', e);
    }
  }
  return { interp: interpretation, timestamp: ts };
};

export const getLesson2Phase2Activity4All = (): Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string }> => {
  return safeGetAll(LESSON2_P2_A4_KEY) as Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string }>;
};

// Lesson 2 Phase 4 Activity 1: student file upload (PDF/image) storage
export const saveLesson2Phase4Activity1 = (username: string, uploadUrl: string, mime: string, filename?: string, submitted?: boolean) => {
  const store = safeGetAll(LESSON2_P4_A1_KEY) as Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string; submitted?: boolean }>;
  store[username] = { uploadUrl, mime, filename: filename || '', timestamp: new Date().toISOString(), submitted: !!submitted };
  safeSetItemSync(LESSON2_P4_A1_KEY, store);

  // Do NOT mirror Lesson 2 Phase 4 uploads into the canonical Lesson 1 state.
  // Lesson 2 Phase 4 has its own store (`LESSON2_P4_A1_KEY`) and should remain separate.

  return store;
};

export const getLesson2Phase4Activity1All = (): Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string; submitted?: boolean }> => {
  return safeGetAll(LESSON2_P4_A1_KEY) as Record<string, { uploadUrl: string; mime: string; filename?: string; timestamp?: string; submitted?: boolean }>;
};

// Phase 3 actions
const PHASE3_FINISH_KEY = 'lesson1_phase3_finish';
const PHASE3_WS_KEY = 'lesson1_phase3_worksheet';
const PHASE3_REC_KEY = 'lesson1_phase3_recommendation';

// Lesson 2 Phase 3 Activity 1: detailed analysis encodings (student-side storage)
const LESSON2_P3_A1_KEY = 'lesson2_phase3_activity1';

export const saveLesson2Phase3Activity1 = (username: string, payload: any) => {
  const store = safeGetAll(LESSON2_P3_A1_KEY) as Record<string, any>;
  const ts = new Date().toISOString();
  store[username] = { ...(payload || {}), timestamp: ts };
  safeSetItemSync(LESSON2_P3_A1_KEY, store);

  // Mirror important fields into the canonical Lesson1State.phaseData[3] so teacher portal shows encodings
  try {
    const current = getLesson1State(username);
    const p3: any = { ...(current.phaseData[3] || {}) };
    // Namespace Lesson2 encodings under a lesson2 object to avoid clobbering
    // Lesson1 student UI relies on top-level p3.* keys; keep Lesson2 data in p3.lesson2
    const lesson2 = { ...(p3.lesson2 || {}) };
    lesson2.activity1 = {
      part1_r: payload?.part1_regressionEquation || '',
      part1_interp: payload?.part1_interpretation || '',
      part1_researchQuestion: payload?.part1_researchQuestion || '',
      part2_reason: payload?.part2_possible1 || '',
      part2_exp1: payload?.part2_possible1 || '',
      part2_evid1: payload?.part2_evidence1 || '',
      part2_exp2: payload?.part2_possible2 || '',
      part2_evid2: payload?.part2_evidence2 || '',
      part2_plausible: payload?.part2_mostPlausible || '',
      part3_because: payload?.part3_causationYes || payload?.part3_causationNo || '',
      part3_factor1: payload?.part3_otherFactor1 || '',
      part3_factor2: payload?.part3_otherFactor2 || '',
      part4_concern: payload?.part4_biggestConcern || '',
      part4_confidence: payload?.part4_confidenceEffect || '',
      timestamp: ts,
    };

    p3.lesson2 = lesson2;
    const phaseData = { ...current.phaseData, 3: p3 };
    const next: Lesson1State = { ...current, phaseData };
    saveLesson1State(username, next);
  } catch (e) {
    // ignore persistence errors
  }

  return store;
};

export const getLesson2Phase3Activity1All = (): Record<string, any> => {
  return safeGetAll(LESSON2_P3_A1_KEY) as Record<string, any>;
};

// Lesson 2 Phase 3 Activity 2: stakeholder worksheet encodings (student-side storage)
const LESSON2_P3_A2_KEY = 'lesson2_phase3_activity2';

export const saveLesson2Phase3Activity2 = (username: string, payload: any) => {
  const store = safeGetAll(LESSON2_P3_A2_KEY) as Record<string, any>;
  const ts = new Date().toISOString();
  store[username] = { ...(payload || {}), timestamp: ts };
  safeSetItemSync(LESSON2_P3_A2_KEY, store);

  try {
    const current = getLesson1State(username);
    const p3: any = { ...(current.phaseData[3] || {}) };
    // Namespace Lesson2 encodings under p3.lesson2 to avoid overwriting Lesson1 fields
    const lesson2 = { ...(p3.lesson2 || {}) };
    lesson2.activity2 = {
      sa_question: payload?.part1_s1 || '',
      sa_stakeholders: [payload?.part1_s1 || '', payload?.part1_s2 || '', payload?.part1_s3 || ''].filter(Boolean),
      sa_matters_to: payload?.part2_who || '',
      sa_because: payload?.part2_because || '',
      sa_decisions: [payload?.part3_decision1 || '', payload?.part3_decision2 || ''].filter(Boolean),
      timestamp: ts,
    };

    p3.lesson2 = lesson2;
    const phaseData = { ...current.phaseData, 3: p3 };
    const next: Lesson1State = { ...current, phaseData };
    saveLesson1State(username, next);
  } catch (e) { /* ignore */ }

  return store;
};

export const getLesson2Phase3Activity2All = (): Record<string, any> => {
  return safeGetAll(LESSON2_P3_A2_KEY) as Record<string, any>;
};

export const savePhase3FinishAnalysis = (username: string) => {
  const storeRaw = localStorage.getItem(PHASE3_FINISH_KEY);
  const store: Record<string, { done: boolean }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = { done: true };
  localStorage.setItem(PHASE3_FINISH_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p3 = { ...(current.phaseData[3] || {}) } as NonNullable<Lesson1State['phaseData'][3]>;
  (p3 as any).part1Done = true;
  const phaseData = { ...current.phaseData, 3: p3 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[3] || 0;
  phaseProgress[3] = Math.min(25, prev + 8.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

export const savePhase3SubmitWorksheet = (username: string) => {
  const storeRaw = localStorage.getItem(PHASE3_WS_KEY);
  const store: Record<string, { submitted: boolean }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = { submitted: true };
  localStorage.setItem(PHASE3_WS_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p3 = { ...(current.phaseData[3] || {}) } as NonNullable<Lesson1State['phaseData'][3]>;
  (p3 as any).saDone = true;
  const phaseData = { ...current.phaseData, 3: p3 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[3] || 0;
  phaseProgress[3] = Math.min(25, prev + 8.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

export const savePhase3FinalizeRecommendation = (username: string) => {
  const storeRaw = localStorage.getItem(PHASE3_REC_KEY);
  const store: Record<string, { finalized: boolean }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = { finalized: true };
  localStorage.setItem(PHASE3_REC_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p3 = { ...(current.phaseData[3] || {}) } as NonNullable<Lesson1State['phaseData'][3]>;
  (p3 as any).recFinalized = true;
  const phaseData = { ...current.phaseData, 3: p3 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[3] || 0;
  phaseProgress[3] = Math.min(25, prev + 9.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

export const getPhase3FinishAll = (): Record<string, { done: boolean }> => {
  const base = safeGetAll(PHASE3_FINISH_KEY) as Record<string, any>;
  try {
    const l2 = safeGetAll(LESSON2_P3_A1_KEY) as Record<string, any>;
    const merged = { ...base } as Record<string, any>;
    for (const k of Object.keys(l2)) merged[k] = { done: true };
    return merged;
  } catch (e) { return base; }
};

export const getPhase3WorksheetAll = (): Record<string, { submitted: boolean }> => {
  const base = safeGetAll(PHASE3_WS_KEY) as Record<string, any>;
  try {
    const l2 = safeGetAll(LESSON2_P3_A2_KEY) as Record<string, any>;
    const merged = { ...base } as Record<string, any>;
    for (const k of Object.keys(l2)) merged[k] = { submitted: true };
    return merged;
  } catch (e) { return base; }
};

export const getPhase3RecommendationAll = (): Record<string, { finalized: boolean }> => {
  const base = safeGetAll(PHASE3_REC_KEY) as Record<string, any>;
  try {
    const l2a = safeGetAll(LESSON2_P3_A1_KEY) as Record<string, any>;
    const l2b = safeGetAll(LESSON2_P4_A1_KEY) as Record<string, any>;
    const merged = { ...base } as Record<string, any>;
    for (const k of Object.keys(l2a || {})) merged[k] = { finalized: true };
    for (const k of Object.keys(l2b || {})) merged[k] = { finalized: true };
    return merged;
  } catch (e) { return base; }
};

export const getAllLesson1States = (): Record<string, Lesson1State> => {
  const base = safeGetAll(LESSON1_KEY) as Record<string, Lesson1State> || {};
  // Merge any in-memory or preloaded fallback entries (prefer base/localStorage values)
  try {
    if (LESSON1_FALLBACK) {
      for (const k of Object.keys(LESSON1_FALLBACK)) {
        if (!base[k]) base[k] = LESSON1_FALLBACK[k];
      }
    }
  } catch (e) { /* ignore */ }
  try {
    const cached = FALLBACK_CACHE[LESSON1_KEY];
    if (cached) {
      for (const k of Object.keys(cached)) {
        if (!base[k]) base[k] = cached[k];
      }
    }
  } catch (e) { /* ignore */ }
  return base;
};

// Phase 4 actions
const PHASE4_REVIEW_KEY = 'lesson1_phase4_review';
const PHASE4_COMPLETE_KEY = 'lesson1_phase4_complete';
// Lesson 3 Phase 4 keys (separate from lesson1)
const LESSON3_P4_REVIEW_KEY = 'lesson3_phase4_review';
const LESSON3_P4_COMPLETE_KEY = 'lesson3_phase4_complete';

export const savePhase4SubmitReview = (username: string) => {
  const storeRaw = localStorage.getItem(PHASE4_REVIEW_KEY);
  const store: Record<string, { submitted: boolean }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = { submitted: true };
  localStorage.setItem(PHASE4_REVIEW_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p4 = { ...(current.phaseData[4] || {}) } as NonNullable<Lesson1State['phaseData'][4]>;
  (p4 as any).peerReviewSubmitted = true;
  const phaseData = { ...current.phaseData, 4: p4 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[4] || 0;
  phaseProgress[4] = Math.min(25, prev + 10.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

// Save detailed peer review (checkbox selections and encoded answers)
export const savePhase4PeerReview = (
  username: string,
  review: {
    q1?: string[];
    q2?: string[];
    q3?: string[];
    q4?: string[];
    strength?: string;
    suggestion?: string;
    reviewer?: string;
  }
) => {
  const storeRaw = localStorage.getItem(PHASE4_REVIEW_KEY);
  const store: Record<string, any> = storeRaw ? JSON.parse(storeRaw) : {};
  const ts = new Date().toISOString();
  store[username] = { ...(store[username] || {}), submitted: true, review: review || {}, timestamp: ts };
  localStorage.setItem(PHASE4_REVIEW_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p4 = { ...(current.phaseData[4] || {}) } as NonNullable<Lesson1State['phaseData'][4]>;
  try { (p4 as any).peerReview = review || {}; } catch (e) {}
  try { (p4 as any).peerReviewSubmitted = true; } catch (e) {}
  // For teacher-facing table convenience, also copy normalized text fields
  try {
    const norm = (arr?: string[] | undefined) => Array.isArray(arr) ? arr.join(', ') : (typeof arr === 'string' ? arr : '');
    (p4 as any).clarity = norm(review.q1);
    (p4 as any).evidence = norm(review.q2);
    (p4 as any).actionability = norm(review.q3);
    (p4 as any).honesty = norm(review.q4);
    (p4 as any).strength = review.strength || '';
    (p4 as any).suggestion = review.suggestion || '';
    (p4 as any).peerReviewer = review.reviewer || '';
  } catch (e) { /* ignore */ }
  const phaseData = { ...current.phaseData, 4: p4 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[4] || 0;
  phaseProgress[4] = Math.min(25, prev + 10.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

export const savePhase4MissionComplete = (username: string) => {
  const storeRaw = localStorage.getItem(PHASE4_COMPLETE_KEY);
  const store: Record<string, { completed: boolean }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = { completed: true };
  localStorage.setItem(PHASE4_COMPLETE_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p4 = { ...(current.phaseData[4] || {}) } as NonNullable<Lesson1State['phaseData'][4]>;
  (p4 as any).missionComplete = true;
  const phaseData = { ...current.phaseData, 4: p4 };
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[4] || 0;
  phaseProgress[4] = Math.min(25, prev + 15.0);
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

// Save reflection answers and uploaded file metadata for Phase 4 (persist before mission complete)
export const savePhase4Reflection = (
  username: string,
  reflection: { [key: string]: string },
  uploadUrl?: string,
  mimeType?: string
) => {
  const storeRaw = localStorage.getItem(PHASE4_COMPLETE_KEY);
  const store: Record<string, any> = storeRaw ? JSON.parse(storeRaw) : {};
  const existing = store[username] || {};
  const ts = new Date().toISOString();
  store[username] = { ...existing, reflection: reflection || {}, uploadUrl: uploadUrl || existing.uploadUrl, mimeType: mimeType || existing.mimeType, timestamp: ts };
  localStorage.setItem(PHASE4_COMPLETE_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p4 = { ...(current.phaseData[4] || {}) } as NonNullable<Lesson1State['phaseData'][4]>;
  try { (p4 as any).reflection = reflection || {}; } catch (e) {}
  try { (p4 as any).upload = { url: uploadUrl || existing.uploadUrl || '', mimeType: mimeType || existing.mimeType || '' }; } catch (e) {}
  const phaseData = { ...current.phaseData, 4: p4 };
  const next: Lesson1State = { ...current, phaseData };
  saveLesson1State(username, next);
  return next;
};

export const getPhase4ReviewAll = (): Record<string, { submitted: boolean }> => {
  // Return only Lesson 1 Phase 4 review entries. Lesson 2 has separate storage.
  return safeGetAll(PHASE4_REVIEW_KEY) as Record<string, { submitted: boolean }>;
};

// Lesson3 Phase4 peer review (separate storage so Lesson1 and Lesson3 do not merge)
export const saveLesson3Phase4PeerReview = async (
  username: string,
  review: {
    q1?: string[];
    q2?: string[];
    q3?: string[];
    q4?: string[];
    strength?: string;
    suggestion?: string;
    reviewer?: string;
  }
) => {
  try {
    const storeRaw = localStorage.getItem(LESSON3_P4_REVIEW_KEY);
    const store: Record<string, any> = storeRaw ? JSON.parse(storeRaw) : {};
    const ts = new Date().toISOString();
    store[username] = { ...(store[username] || {}), submitted: true, review: review || {}, timestamp: ts };
    localStorage.setItem(LESSON3_P4_REVIEW_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(LESSON3_P4_REVIEW_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { ...(storeRaw[username] || {}), submitted: true, review: review || {}, timestamp: new Date().toISOString() } };
      await awaitSafeSet(LESSON3_P4_REVIEW_KEY, store);
    } catch (e) { console.error('Failed to save lesson3 phase4 peer review', e); }
  }
  (async () => {
    try {
      const student_id = await resolveStudentId(username);
      if (!student_id) return;
      const ss = await supabase.from('student_state').select('state').eq('student_id', student_id).eq('lesson_slug', 'lesson3').limit(1).maybeSingle();
      const existing = ss.data?.state || {};
      const merged = {
        ...(existing as any),
        peer1Answer: Array.isArray(review.q1) ? (review.q1[0] || '') : '',
        peer2Answer: Array.isArray(review.q2) ? (review.q2[0] || '') : '',
        peer3Answer: Array.isArray(review.q3) ? (review.q3[0] || '') : '',
        peer4Answer: Array.isArray(review.q4) ? (review.q4[0] || '') : '',
        peerStrength: review.strength || '',
        peerSuggestion: review.suggestion || '',
        peerReviewerUsername: review.reviewer || '',
        peerSubmitted: true,
      };
      await upsertStudentState(student_id, 'lesson3', merged);
    } catch {
      // ignore
    }
  })();
};

export const getLesson3Phase4ReviewAll = (): Record<string, { submitted: boolean; review?: any; timestamp?: string }> => {
  return safeGetAll(LESSON3_P4_REVIEW_KEY) as Record<string, { submitted: boolean; review?: any; timestamp?: string }>;
};

export const getPhase4CompleteAll = (): Record<string, { completed: boolean }> => {
  // Return only Lesson 1 Phase 4 complete entries. Lesson 2 Phase 4 entries are separate.
  return safeGetAll(PHASE4_COMPLETE_KEY) as Record<string, { completed: boolean }>;
};

// Lesson3 Phase4 reflection/upload (separate storage)
export const saveLesson3Phase4Reflection = async (
  username: string,
  reflection: { [key: string]: string },
  uploadUrl?: string,
  mimeType?: string
) => {
  try {
    const storeRaw = localStorage.getItem(LESSON3_P4_COMPLETE_KEY);
    const store: Record<string, any> = storeRaw ? JSON.parse(storeRaw) : {};
    const existing = store[username] || {};
    const ts = new Date().toISOString();
    store[username] = { ...existing, reflection: reflection || {}, uploadUrl: uploadUrl || existing.uploadUrl, mimeType: mimeType || existing.mimeType, timestamp: ts, completed: true };
    localStorage.setItem(LESSON3_P4_COMPLETE_KEY, JSON.stringify(store));
  } catch (err) {
    try {
      const storeRaw = (await awaitSafeGet(LESSON3_P4_COMPLETE_KEY)) || {};
      const store = { ...(storeRaw as Record<string, any>), [username]: { ...(storeRaw[username] || {}), reflection: reflection || {}, uploadUrl: uploadUrl || storeRaw[username]?.uploadUrl, mimeType: mimeType || storeRaw[username]?.mimeType, timestamp: new Date().toISOString(), completed: true } };
      await awaitSafeSet(LESSON3_P4_COMPLETE_KEY, store);
    } catch (e) { console.error('Failed to save lesson3 phase4 reflection', e); }
  }
  (async () => {
    try {
      const student_id = await resolveStudentId(username);
      if (!student_id) return;
      let publicUrl = uploadUrl;
      if (uploadUrl && uploadUrl.startsWith('data:')) {
        try {
          const extension = mimeType === 'application/pdf' ? 'pdf' : 'bin';
          const uploadPath = `lesson3/${student_id}/${Date.now()}-phase4-final.${extension}`;
          const up = await import('../services/supabaseClient').then(m => m.uploadDataUrlToStorage('uploads', uploadPath, uploadUrl));
          if (!up.error) publicUrl = up.publicUrl;
        } catch {
          // ignore upload errors and keep original URL/data
        }
      }
      const ss = await supabase.from('student_state').select('state').eq('student_id', student_id).eq('lesson_slug', 'lesson3').limit(1).maybeSingle();
      const existing = ss.data?.state || {};
      const merged = {
        ...(existing as any),
        finalConfidence: reflection?.confidence || '',
        finalConfidenceReason: reflection?.contributed || '',
        finalChallenge: reflection?.challenging || '',
        finalStatsChange: reflection?.stats || '',
        finalClimateChange: reflection?.climate || '',
        finalConnectionChange: reflection?.connection || '',
        finalExtension: reflection?.extend || '',
        finalLearnerInsight: reflection?.learned || '',
        finalPreview: publicUrl || null,
        finalSubmitted: true,
      };
      await upsertStudentState(student_id, 'lesson3', merged);
    } catch {
      // ignore
    }
  })();
};

export const getLesson3Phase4CompleteAll = (): Record<string, { completed?: boolean; reflection?: any; uploadUrl?: string; mimeType?: string; timestamp?: string }> => {
  return safeGetAll(LESSON3_P4_COMPLETE_KEY) as Record<string, { completed?: boolean; reflection?: any; uploadUrl?: string; mimeType?: string; timestamp?: string }>;
};

export interface Lesson3PersistedState {
  hasAnyData: boolean;
  recallA: string;
  recallB: string;
  recallC: string;
  recallLocked: boolean;
  finalConsiderations: string;
  uploadedDiagramPreview: string | null;
  submitted2: boolean;
  p2a1Preview: string | null;
  p2a1Submitted: boolean;
  p2a2Preview: string | null;
  p2a2Submitted: boolean;
  p2a3Preview: string | null;
  p2a3Submitted: boolean;
  p2a3Answer: string;
  p3Preview: string | null;
  p3Submitted: boolean;
  peer1Answer: string;
  peer2Answer: string;
  peer3Answer: string;
  peer4Answer: string;
  peerStrength: string;
  peerSuggestion: string;
  peerReviewerUsername: string;
  peerSubmitted: boolean;
  finalConfidence: string;
  finalConfidenceReason: string;
  finalChallenge: string;
  finalStatsChange: string;
  finalClimateChange: string;
  finalConnectionChange: string;
  finalExtension: string;
  finalLearnerInsight: string;
  finalPreview: string | null;
  finalSubmitted: boolean;
  lesson3ExtraPct: number;
}

export const getLesson3PersistedState = async (username: string): Promise<Lesson3PersistedState> => {
  const [
    a1All,
    a2All,
    p2a1All,
    p2a2All,
    p2a3All,
    p3All,
    reviewAll,
    finalAll,
  ] = await Promise.all([
    safeGetAllAsync<Record<string, { researchQuestion: string; regressionEquation: string; interpretation: string; timestamp?: string }>>(LESSON3_P1_A1_KEY, {}),
    safeGetAllAsync<Record<string, { fileDataUrl?: string; filename?: string; considerations?: string; timestamp?: string }>>(LESSON3_P1_A2_KEY, {}),
    safeGetAllAsync<Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }>>(LESSON3_P2_A1_KEY, {}),
    safeGetAllAsync<Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }>>(LESSON3_P2_A2_KEY, {}),
    safeGetAllAsync<Record<string, { fileDataUrl?: string; filename?: string; interpretation?: string; timestamp?: string }>>(LESSON3_P2_A3_KEY, {}),
    safeGetAllAsync<Record<string, { fileDataUrl?: string; filename?: string; timestamp?: string }>>(LESSON3_P3_A1_KEY, {}),
    safeGetAllAsync<Record<string, { submitted?: boolean; review?: any; timestamp?: string }>>(LESSON3_P4_REVIEW_KEY, {}),
    safeGetAllAsync<Record<string, { completed?: boolean; reflection?: any; uploadUrl?: string; mimeType?: string; timestamp?: string }>>(LESSON3_P4_COMPLETE_KEY, {}),
  ]);

  const a1 = a1All[username];
  const a2 = a2All[username];
  const p2a1 = p2a1All[username];
  const p2a2 = p2a2All[username];
  const p2a3 = p2a3All[username];
  const p3 = p3All[username];
  const review = reviewAll[username] as any;
  const finalEntry = finalAll[username] as any;
  const reflection = finalEntry?.reflection || {};

  const recallLocked = !!a1;
  const submitted2 = !!a2;
  const p2a1Submitted = !!p2a1;
  const p2a2Submitted = !!p2a2;
  const p2a3Submitted = !!p2a3;
  const p3Submitted = !!p3;
  const peerSubmitted = !!(review?.submitted || review?.review);
  const finalSubmitted = !!(finalEntry?.completed || finalEntry?.uploadUrl || finalEntry?.reflection);
  const lesson3ExtraPct = Math.min(
    100,
    (recallLocked ? 10 : 0) +
      (submitted2 ? 15 : 0) +
      (p2a1Submitted ? 8 : 0) +
      (p2a2Submitted ? 8 : 0) +
      (p2a3Submitted ? 9 : 0) +
      (p3Submitted ? 25 : 0) +
      (peerSubmitted ? 10 : 0) +
      (finalSubmitted ? 15 : 0)
  );

  return {
    hasAnyData: !!(a1 || a2 || p2a1 || p2a2 || p2a3 || p3 || review || finalEntry),
    recallA: a1?.researchQuestion || '',
    recallB: a1?.regressionEquation || '',
    recallC: a1?.interpretation || '',
    recallLocked,
    finalConsiderations: a2?.considerations || '',
    uploadedDiagramPreview: a2?.fileDataUrl || null,
    submitted2,
    p2a1Preview: p2a1?.fileDataUrl || null,
    p2a1Submitted,
    p2a2Preview: p2a2?.fileDataUrl || null,
    p2a2Submitted,
    p2a3Preview: p2a3?.fileDataUrl || null,
    p2a3Submitted,
    p2a3Answer: p2a3?.interpretation || '',
    p3Preview: p3?.fileDataUrl || null,
    p3Submitted,
    peer1Answer: Array.isArray(review?.review?.q1) ? (review.review.q1[0] || '') : (review?.review?.q1 || ''),
    peer2Answer: Array.isArray(review?.review?.q2) ? (review.review.q2[0] || '') : (review?.review?.q2 || ''),
    peer3Answer: Array.isArray(review?.review?.q3) ? (review.review.q3[0] || '') : (review?.review?.q3 || ''),
    peer4Answer: Array.isArray(review?.review?.q4) ? (review.review.q4[0] || '') : (review?.review?.q4 || ''),
    peerStrength: review?.review?.strength || '',
    peerSuggestion: review?.review?.suggestion || '',
    peerReviewerUsername: review?.review?.reviewer || '',
    peerSubmitted,
    finalConfidence: reflection?.confidence || '',
    finalConfidenceReason: reflection?.contributed || '',
    finalChallenge: reflection?.challenging || '',
    finalStatsChange: reflection?.stats || '',
    finalClimateChange: reflection?.climate || '',
    finalConnectionChange: reflection?.connection || '',
    finalExtension: reflection?.extend || '',
    finalLearnerInsight: reflection?.learned || '',
    finalPreview: finalEntry?.uploadUrl || null,
    finalSubmitted,
    lesson3ExtraPct,
  };
};

// Phase 2 Activity 2: guided Pearson r (store r and variable names)
export const savePhase2Activity2 = (username: string, payload: { var1: string; var2: string; r: number }) => {
  const storeRaw = localStorage.getItem(PHASE2_ACTIVITY2_KEY);
  const store: Record<string, { var1: string; var2: string; r: number }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = payload;
  localStorage.setItem(PHASE2_ACTIVITY2_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[2] || 0;
  phaseProgress[2] = Math.min(25, prev + 4.0);
  const next: Lesson1State = { ...current, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

export const getPhase2Activity2All = (): Record<string, { var1: string; var2: string; r: number }> => {
  // Return only the canonical Lesson 1 Phase2 Activity2 entries.
  // Do NOT merge Lesson 2 entries here; Lesson 2 has its own store.
  return safeGetAll(PHASE2_ACTIVITY2_KEY) as Record<string, { var1: string; var2: string; r: number }>;
};

// Phase 2 Activity 3: spreadsheet-based Pearson r (store var1/var2/r and year)
export const savePhase2Activity3 = (username: string, payload: { var1: string; var2: string; r: number; year: number | 'All' }) => {
  const storeRaw = localStorage.getItem(PHASE2_ACTIVITY3_KEY);
  const store: Record<string, { var1: string; var2: string; r: number; year: number | 'All' }> = storeRaw ? JSON.parse(storeRaw) : {};
  store[username] = payload;
  localStorage.setItem(PHASE2_ACTIVITY3_KEY, JSON.stringify(store));

  const current = getLesson1State(username);
  const p2 = { ...(current.phaseData[2] || {}) } as NonNullable<Lesson1State['phaseData'][2]>;
  // record that spreadsheet activity was completed and store some payload info
  p2.a3Done = true;
  p2.a3Result = payload.r;
  p2.a3Var1 = payload.var1;
  p2.a3Var2 = payload.var2;
  p2.a3Year = payload.year;
  const phaseProgress = { ...(current.phaseProgress || {}) };
  const prev = phaseProgress[2] || 0;
  phaseProgress[2] = Math.min(25, prev + 4.0);
  const phaseData = { ...current.phaseData, 2: p2 };
  const next: Lesson1State = { ...current, phaseData, phaseProgress };
  saveLesson1State(username, next);
  return next;
};

export const getPhase2Activity3All = (): Record<string, { var1: string; var2: string; r: number; year: number | 'All' }> => {
  // Return only the canonical Lesson 1 Phase2 Activity3 entries (no merge with Lesson2).
  return safeGetAll(PHASE2_ACTIVITY3_KEY) as Record<string, { var1: string; var2: string; r: number; year: number | 'All' }>;
};

// Save uploaded PDF/image for Phase 2 Activity 3 so teacher preview can display it
export const savePhase2Activity3Upload = (username: string, uploadUrl: string, mimeType?: string) => {
  const storeRaw = localStorage.getItem(PHASE2_ACTIVITY3_KEY);
  const store: Record<string, any> = storeRaw ? JSON.parse(storeRaw) : {};
  const existing = store[username] || {};
  // store uploadUrl and mime type (pdf/image)
  existing.uploadUrl = uploadUrl;
  if (mimeType) existing.mimeType = mimeType;
  store[username] = existing;
  localStorage.setItem(PHASE2_ACTIVITY3_KEY, JSON.stringify(store));
  // Also mark spreadsheet activity as done in lesson1 state to reflect finalization
  const current = getLesson1State(username);
  const p2 = { ...(current.phaseData[2] || {}) } as NonNullable<Lesson1State['phaseData'][2]>;
  p2.a3Done = true;
  const phaseData = { ...current.phaseData, 2: p2 };
  const next: Lesson1State = { ...current, phaseData };
  saveLesson1State(username, next);
  return next;
};

export const getPhase2SelfAssessAll = (): Record<string, { answers: string[] }> => {
  return safeGetAll(PHASE2_SELFASSESS_KEY) as Record<string, { answers: string[] }>;
};

export const getPhase2Activity4CheckAll = (): Record<string, { checked: boolean; strength?: string[]; direction?: string[]; timestamp?: string }> => {
  const base = safeGetAll(PHASE2_ACTIVITY4_CHECK_KEY) as Record<string, { checked: boolean; strength?: string[]; direction?: string[]; timestamp?: string }>;
  try {
    const l2 = safeGetAll(LESSON2_P2_A4_KEY) as Record<string, any>;
    const merged = { ...base } as Record<string, any>;
    for (const k of Object.keys(l2)) {
      if (!merged[k]) merged[k] = { checked: false };
      merged[k] = { ...merged[k], ...(l2[k] || {}) };
    }
    return merged;
  } catch (e) { return base; }
};

export const getPhase2Activity4InterpAll = (): Record<string, { interp: string }> => {
  return safeGetAll(PHASE2_ACTIVITY4_INTERP_KEY) as Record<string, { interp: string }>;
};

export const getPhase2Activity4InterpAllDetailed = (): Record<string, { interp: string; timestamp?: string; var1?: string; var2?: string; question?: string; computedR?: string; strength?: string; direction?: string; encodings?: any }> => {
  return safeGetAll(PHASE2_ACTIVITY4_INTERP_KEY) as Record<string, { interp: string; timestamp?: string; var1?: string; var2?: string; question?: string; computedR?: string; strength?: string; direction?: string; encodings?: any }>;
};

// Lesson2-only getters for Phase2 Activity4 interpretations (separate store)
export const getLesson2Phase2Activity4InterpAll = (): Record<string, { interp: string }> => {
  return safeGetAll(LESSON2_P2_A4_INTERP_KEY) as Record<string, { interp: string }>;
};

export const getLesson2Phase2Activity4InterpAllDetailed = (): Record<string, { interp: string; timestamp?: string; var1?: string; var2?: string; question?: string; computedR?: string; strength?: string; direction?: string; encodings?: any }> => {
  return safeGetAll(LESSON2_P2_A4_INTERP_KEY) as Record<string, { interp: string; timestamp?: string; var1?: string; var2?: string; question?: string; computedR?: string; strength?: string; direction?: string; encodings?: any }>;
};

export const getUserProgress = (username: string): UserProgress => {
  const all = safeGetAll(PROGRESS_KEY) as Record<string, UserProgress>;
  const existing = all[username];
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, ...(existing || {}) };
};

export const setUserProgress = (username: string, sectionId: SectionId, percent: number) => {
  const all = safeGetAll(PROGRESS_KEY) as Record<string, UserProgress>;
  const user = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, ...(all[username] || {}) };
  user[sectionId] = Math.max(0, Math.min(100, Math.round(percent)));
  safeSetItemSync(PROGRESS_KEY, { ...all, [username]: user });
};

export const savePreAssessmentPart1Score = (username: string, correctCount: number, itemCorrect?: boolean[]) => {
  const raw = localStorage.getItem(SCORES_KEY);
  const all: AssessmentScores = raw ? JSON.parse(raw) : {};
  const entry = { ...(all[username] || {}), prePart1Correct: correctCount } as AssessmentScores[string];
  if (itemCorrect && itemCorrect.length === 15) {
    entry.prePart1ItemCorrect = itemCorrect;
    const lc12 = itemCorrect.slice(0,5).filter(Boolean).length;
    const lc34 = itemCorrect.slice(5,10).filter(Boolean).length;
    const lc56 = itemCorrect.slice(10,15).filter(Boolean).length;
    entry.prePart1GroupScores = { lc12, lc34, lc56 };
  }
  all[username] = entry;
  localStorage.setItem(SCORES_KEY, JSON.stringify(all));
};

export const savePreAssessmentPart1Responses = async (username: string, responses: string[]) => {
  const raw = localStorage.getItem(SCORES_KEY);
  const all: AssessmentScores = raw ? JSON.parse(raw) : {};
  all[username] = { ...(all[username] || {}), prePart1Responses: responses } as AssessmentScores[string];
  localStorage.setItem(SCORES_KEY, JSON.stringify(all));
  
  // Also save to Supabase
  try {
    let userRecord = (await supabase.from('users').select('id').eq('username', username).maybeSingle()).data;
    const userErr = (await supabase.from('users').select('id').eq('username', username).maybeSingle()).error;
    if (userErr) {
      // if fetch itself fails, log and continue
      console.error('error fetching user for responses', userErr);
    }
    if (!userRecord) {
      console.warn('no user found when saving responses for', username);
      // create a minimal profile row so we can associate responses
      const dummyEmail = `${username}@example.invalid`;
      const { data: newUser, error: createErr } = await supabase
        .from('users')
        .insert({ username, role: 'student', email: dummyEmail })
        .select('id')
        .maybeSingle();
      if (createErr) {
        console.error('failed to create missing user', createErr);
      } else {
        userRecord = newUser;
        if (userRecord?.id) {
          console.log('created new user id', userRecord.id);
        }
      }
    }
    if (userRecord && userRecord.id) {
      console.log('inserting responses row for user id', userRecord.id);
      const { error: insertErr } = await supabase.from('responses').insert({
        student_id: userRecord.id as string,
        question_id: 'pre_assessment_part1',
        response_json: JSON.stringify({ responses, submitted_at: new Date().toISOString() })
      });
      if (insertErr) console.error('insert error', insertErr);
    }
  } catch (e) {
    console.error('Failed to save responses to Supabase:', e);
  }
};

export const savePreAssessmentPart2Responses = async (username: string, responses: number[]) => {
  const raw = localStorage.getItem(SCORES_KEY);
  const all: AssessmentScores = raw ? JSON.parse(raw) : {};
  all[username] = { ...(all[username] || {}), prePart2Responses: responses };
  localStorage.setItem(SCORES_KEY, JSON.stringify(all));
  
  // Also save to Supabase
  try {
    let userRecord = (await supabase.from('users').select('id').eq('username', username).maybeSingle()).data;
    const userErr = (await supabase.from('users').select('id').eq('username', username).maybeSingle()).error;
    if (userErr) console.error('error fetching user for responses', userErr);
    if (!userRecord) {
      console.warn('no user found when saving responses for', username);
      const dummyEmail = `${username}@example.invalid`;
      const { data: newUser, error: createErr } = await supabase
        .from('users')
        .insert({ username, role: 'student', email: dummyEmail })
        .select('id')
        .maybeSingle();
      if (createErr) {
        console.error('failed to create missing user', createErr);
      } else {
        userRecord = newUser;
        if (userRecord?.id) {
          console.log('created new user id', userRecord.id);
        }
      }
    }
    if (userRecord && userRecord.id) {
      console.log('inserting responses row for user id', userRecord.id);
      const { error: insertErr } = await supabase.from('responses').insert({
        student_id: userRecord.id as string,
        question_id: 'pre_assessment_part2',
        response_json: JSON.stringify({ responses, submitted_at: new Date().toISOString() })
      });
      if (insertErr) console.error('insert error', insertErr);
    }
  } catch (e) {
    console.error('Failed to save responses to Supabase:', e);
  }
};

export const savePostAssessmentPart1Score = (username: string, correctCount: number, itemCorrect?: boolean[]) => {
  const raw = localStorage.getItem(SCORES_KEY);
  const all: AssessmentScores = raw ? JSON.parse(raw) : {};
  const entry = { ...(all[username] || {}), postPart1Correct: correctCount } as AssessmentScores[string];
  if (itemCorrect && itemCorrect.length === 15) {
    entry.postPart1ItemCorrect = itemCorrect;
    const lc12 = itemCorrect.slice(0,5).filter(Boolean).length;
    const lc34 = itemCorrect.slice(5,10).filter(Boolean).length;
    const lc56 = itemCorrect.slice(10,15).filter(Boolean).length;
    entry.postPart1GroupScores = { lc12, lc34, lc56 };
  }
  all[username] = entry;
  localStorage.setItem(SCORES_KEY, JSON.stringify(all));
};

export const savePostAssessmentPart1Responses = async (username: string, responses: string[]) => {
  const raw = localStorage.getItem(SCORES_KEY);
  const all: AssessmentScores = raw ? JSON.parse(raw) : {};
  all[username] = { ...(all[username] || {}), postPart1Responses: responses } as AssessmentScores[string];
  localStorage.setItem(SCORES_KEY, JSON.stringify(all));
  
  // Also save to Supabase
  try {
    const { data: user } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
    if (user?.id) {
      await supabase.from('responses').insert({
        student_id: user.id,
        question_id: 'post_assessment_part1',
        response_json: JSON.stringify({ responses, submitted_at: new Date().toISOString() })
      });
    }
  } catch (e) {
    console.error('Failed to save responses to Supabase:', e);
  }
};

export const savePostAssessmentPart2Responses = async (username: string, responses: number[]) => {
  const raw = localStorage.getItem(SCORES_KEY);
  const all: AssessmentScores = raw ? JSON.parse(raw) : {};
  all[username] = { ...(all[username] || {}), postPart2Responses: responses };
  localStorage.setItem(SCORES_KEY, JSON.stringify(all));
  
  // Also save to Supabase
  try {
    const { data: user } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
    if (user?.id) {
      await supabase.from('responses').insert({
        student_id: user.id,
        question_id: 'post_assessment_part2',
        response_json: JSON.stringify({ responses, submitted_at: new Date().toISOString() })
      });
    }
  } catch (e) {
    console.error('Failed to save responses to Supabase:', e);
  }
};

export const getAssessmentScores = (): AssessmentScores => {
  const raw = localStorage.getItem(SCORES_KEY);
  return raw ? JSON.parse(raw) as AssessmentScores : {};
};

export const getPreAssessmentSummary = (usernames: string[]) => {
  const all = getAssessmentScores();
  const list = usernames.map(u => ({ username: u, entry: all[u] })).filter(x => !!x.entry);
  const tested = list.filter(x => typeof x.entry!.prePart1Correct === 'number');
  const scores = tested.map(x => x.entry!.prePart1Correct as number);
  const groups = tested.map(x => x.entry!.prePart1GroupScores).filter(Boolean) as {lc12:number; lc34:number; lc56:number}[];
  return { total: usernames.length, tested: tested.length, scores, groups };
};

export const getInitialSurveySummary = (usernames: string[]) => {
  const all = getAssessmentScores();
  const responses = usernames
    .map(u => all[u]?.prePart2Responses)
    .filter((r): r is number[] => Array.isArray(r) && r.length === 17);
  return { responses };
};

export const getPostAssessmentSummary = (usernames: string[]) => {
  const all = getAssessmentScores();
  const list = usernames.map(u => ({ username: u, entry: all[u] })).filter(x => !!x.entry);
  const tested = list.filter(x => typeof x.entry!.postPart1Correct === 'number');
  const scores = tested.map(x => x.entry!.postPart1Correct as number);
  const groups = tested.map(x => x.entry!.postPart1GroupScores).filter(Boolean) as {lc12:number; lc34:number; lc56:number}[];
  return { total: usernames.length, tested: tested.length, scores, groups };
};

export const getEndOfLessonSurveySummary = (usernames: string[]) => {
  const all = getAssessmentScores();
  const responses = usernames
    .map(u => all[u]?.postPart2Responses)
    .filter((r): r is number[] => Array.isArray(r) && r.length === 17);
  return { responses };
};

export const getRewardShownSections = (username: string): number[] => {
  const raw = localStorage.getItem(REWARD_KEY);
  const all: Record<string, number[]> = raw ? JSON.parse(raw) : {};
  return all[username] || [];
};

export const markRewardShown = (username: string, sectionId: SectionId) => {
  const raw = localStorage.getItem(REWARD_KEY);
  const all: Record<string, number[]> = raw ? JSON.parse(raw) : {};
  const list = all[username] || [];
  if (!list.includes(sectionId)) {
    list.push(sectionId);
    all[username] = list;
    localStorage.setItem(REWARD_KEY, JSON.stringify(all));
  }
};
