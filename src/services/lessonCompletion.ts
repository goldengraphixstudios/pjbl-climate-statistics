type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCompletedPhases(state: unknown) {
  if (!isRecord(state) || !Array.isArray(state.completedPhases)) return [] as number[];
  return state.completedPhases
    .map((phase) => toNumber(phase))
    .filter((phase, index, all) => phase > 0 && all.indexOf(phase) === index);
}

function hasCompletedPhases(state: unknown, phases: number[]) {
  const completedPhases = getCompletedPhases(state);
  return phases.every((phase) => completedPhases.includes(phase));
}

function getPhaseData(state: unknown, phase: number) {
  if (!isRecord(state) || !isRecord(state.phaseData)) return {} as UnknownRecord;
  const phaseValue = state.phaseData[phase] ?? state.phaseData[String(phase)];
  return isRecord(phaseValue) ? phaseValue : ({} as UnknownRecord);
}

function objectHasMeaningfulValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (hasText(value)) return true;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.values(value).some(objectHasMeaningfulValue);
  return false;
}

export function isLesson1CompleteState(state: unknown) {
  const p1 = getPhaseData(state, 1);
  const p2 = getPhaseData(state, 2);
  const p3 = getPhaseData(state, 3);
  const p4 = getPhaseData(state, 4);

  const phase1Complete = !!(p1.a1Done && p1.a2Done && p1.a3Done && p1.a4bFinalized);
  const phase2Complete = !!(p2.a1Done && p2.a2Done && p2.a3Done && p2.selfAssessSubmitted && (p2.interpretSubmitted || p2.a4Checked));
  const phase3Complete = !!(p3.part1Done && p3.saDone && p3.recFinalized);
  const phase4Complete = !!(p4.peerReviewSubmitted && p4.missionComplete);

  return phase1Complete && phase2Complete && phase3Complete && phase4Complete;
}

export function isLesson1ReadyForFinalSubmissionState(state: unknown) {
  const p4 = getPhaseData(state, 4);
  return !!(p4.peerReviewSubmitted && hasCompletedPhases(state, [1, 2, 3]));
}

export function hasLesson1AnyProgress(state: unknown) {
  if (!isRecord(state)) return false;
  if (isLesson1CompleteState(state)) return true;
  if (hasCompletedPhases(state, [1]) || hasCompletedPhases(state, [2]) || hasCompletedPhases(state, [3]) || hasCompletedPhases(state, [4])) {
    return true;
  }

  if (isRecord(state.phaseProgress) && Object.values(state.phaseProgress).some((value) => toNumber(value) > 0)) {
    return true;
  }

  return [1, 2, 3, 4].some((phase) => objectHasMeaningfulValue(getPhaseData(state, phase)));
}

export function isLesson2CompleteState(state: unknown) {
  if (!isRecord(state)) return false;
  return hasCompletedPhases(state, [1, 2, 3, 4]) && toNumber(state.displayProgress) >= 100 && !!state.submitDisabledP4;
}

export function isLesson2ReadyForFinalSubmission(state: unknown) {
  if (!isRecord(state)) return false;
  return hasCompletedPhases(state, [1, 2, 3]) && toNumber(state.displayProgress) >= 75;
}

export function hasLesson2AnyProgress(state: unknown) {
  if (!isRecord(state)) return false;
  if (isLesson2CompleteState(state)) return true;
  if (toNumber(state.displayProgress) > 0) return true;

  const interestingKeys = [
    'observations',
    'activity1b',
    'videoSubmitted',
    'pairSubmitted',
    'phase2A1Submitted',
    'phase2A2Submitted',
    'submitDisabled3',
    'submitDisabled4',
    'analysisSubmitted',
    'analysis2Submitted',
    'submitDisabledP4',
    'a3Submitted',
    'exitSubmitted',
    'previewURL',
    'previewURL3',
    'previewURL4',
    'previewURLP4',
  ];

  return interestingKeys.some((key) => objectHasMeaningfulValue(state[key]));
}

export function isLesson3ReflectionCompleteState(state: unknown) {
  if (!isRecord(state)) return false;

  return [
    state.finalConfidence,
    state.finalConfidenceReason,
    state.finalChallenge,
    state.finalStatsChange,
    state.finalClimateChange,
    state.finalConnectionChange,
    state.finalExtension,
    state.finalLearnerInsight,
  ].every(hasText);
}

export function isLesson3ReadyForFinalSubmission(state: unknown) {
  if (!isRecord(state)) return false;
  return !!(
    state.recallLocked &&
    state.submitted2 &&
    state.p2a1Submitted &&
    state.p2a2Submitted &&
    state.p2a3Submitted &&
    state.p3Submitted &&
    state.peerSubmitted &&
    isLesson3ReflectionCompleteState(state)
  );
}

export function isLesson3CompleteState(state: unknown) {
  if (!isRecord(state)) return false;
  return !!state.finalSubmitted && toNumber(state.lesson3ExtraPct) >= 100 && isLesson3ReadyForFinalSubmission(state);
}

export function hasLesson3AnyProgress(state: unknown) {
  if (!isRecord(state)) return false;
  if (isLesson3CompleteState(state)) return true;
  if (toNumber(state.lesson3ExtraPct) > 0) return true;

  const interestingKeys = [
    'completedPhases',
    'recallLocked',
    'submitted2',
    'p2a1Submitted',
    'p2a2Submitted',
    'p2a3Submitted',
    'p3Submitted',
    'peerSubmitted',
    'finalSubmitted',
    'recallA',
    'recallB',
    'recallC',
    'finalConsiderations',
    'uploadedDiagramPreview',
    'p2a1Preview',
    'p2a2Preview',
    'p2a3Preview',
    'p2a3Answer',
    'p3Preview',
    'peerStrength',
    'peerSuggestion',
    'peerReviewerUsername',
    'finalConfidence',
    'finalConfidenceReason',
    'finalChallenge',
    'finalStatsChange',
    'finalClimateChange',
    'finalConnectionChange',
    'finalExtension',
    'finalLearnerInsight',
    'finalPreview',
  ];

  return interestingKeys.some((key) => objectHasMeaningfulValue(state[key]));
}
