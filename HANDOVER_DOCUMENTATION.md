# PJBL Climate Statistics - Handover Documentation

## Project Root

- Local repo: `C:\Users\AJHAY\Documents\GitHub\pjbl-climate-statistics`
- Stack: React + TypeScript + Vite
- Backend: Supabase
- Live site: `https://goldengraphixstudios.github.io/pjbl-climate-statistics/`

## Active Roles

- Student
- Teacher
- Admin

Teacher and Admin share the same active combined portal.

## Active Functional Areas

### Student side

- student login
- pre-assessment
- Lesson 1
- Lesson 2
- Lesson 3
- post-assessment
- performance summary
- lesson draft resume
- lesson final submission

### Teacher / Admin side

- shared staff login
- class creation and enrollment
- masterlist and class list
- pre/post result tables
- lesson output review tabs
- lesson scoring
- lesson feedback
- class record
- CSV / PDF-style export actions

## Current Source Of Truth

Main live tables:

- `public.users`
- `public.classes`
- `public.class_students`
- `public.responses`
- `public.feedback`
- `public.student_state`

Current meaning:

- `responses`
  - final submissions for `pre`, `lesson1`, `lesson2`, `lesson3`, `post`
  - lesson scores via `teacher_score`
- `feedback`
  - active lesson feedback records
- `student_state`
  - lesson draft / resume state

Important clarifications:

- `public.lessons` is not the live lesson-output store
- `student_progress` is legacy
- browser storage is fallback cache only

## Current Behavior Rules

These override older documentation where there is a conflict.

### Progression

- `Pre-Assessment` completion unlocks `Lesson 1`
- `Lesson 1` completion unlocks `Lesson 2`
- `Lesson 2` completion unlocks `Lesson 3`
- `Lesson 3` completion unlocks `Post-Assessment`

Progression is now completion-based.

It does not depend on teacher feedback acknowledgment.

### Feedback

- lesson feedback remains active
- assessment feedback is no longer part of the active student/admin UI flow

### Student status model

- `Not started`
- `In progress`
- `Completed`

Lesson cards can now distinguish draft state from final completion.

## Important Implementation Notes

### Completion derivation

`src/services/lessonCompletion.ts` is now the shared completion/status layer for lesson cards and student progression behavior.

### Resume behavior

- lesson drafts are persisted into `student_state` plus browser fallback storage
- Lesson 3 and Post-Assessment restore saved draft state on return
- final completion is only marked after the real final response write succeeds

### Admin lesson output behavior

- admin lesson tabs merge `responses` and `student_state`
- draft-only lesson work can appear in admin output tabs
- score save remains tied to real `responses` rows

### Refresh behavior

- the old 7-second admin refresh loop was removed
- staff class refresh now happens on login and browser focus/visibility recovery
- `PerformanceSummary.tsx` still has its own timed refresh while open

## Key App Files

### App shell and routing

- `src/App.tsx`
- `src/pages/portals/CombinedPortal.tsx`
- `src/pages/portals/StudentPortal.tsx`
- `src/pages/portals/AdminPortal.tsx`

### Student pages

- `src/pages/student_sections/PreAssessment.tsx`
- `src/pages/student_sections/Lesson1.tsx`
- `src/pages/student_sections/Lesson2.tsx`
- `src/pages/student_sections/Lesson3.tsx`
- `src/pages/student_sections/PostAssessment.tsx`
- `src/pages/student_sections/PerformanceSummary.tsx`

### Important services

- `src/services/authService.ts`
- `src/services/classService.ts`
- `src/services/progressService.ts`
- `src/services/studentStateService.ts`
- `src/services/responsesService.ts`
- `src/services/feedbackService.ts`
- `src/services/fileAssetService.ts`
- `src/services/lessonCompletion.ts`

## Current UX Notes

- Student portal uses section cards and a learning-sections dashboard.
- Staff portal is tab-driven and horizontally scrollable on smaller screens.
- Lesson output tabs distinguish draft saves from final submissions.
- Review actions are available for lessons and assessments.
- Assessment UI is completion-oriented rather than feedback-oriented.

## Verification Priority

Before final signoff, manually verify:

1. student can complete the full path from pre-assessment through post-assessment
2. lesson drafts restore correctly after refresh and return navigation
3. Lesson 3 final submission retry works after reopening a saved draft
4. Post-Assessment resumes Part 1 / Part 2 state correctly
5. staff portal loads data without background refresh thrash
6. lesson scores appear in both class record and student performance summary
7. exports generate expected data

## Related Root Docs

- `README.md`
- `PROJECT_CONTEXT_SNAPSHOT.txt`
- `PROJECT_WORK_LOG.txt`
- `BUG_SELF_HEAL_LOG.txt`
- `PROJECT_PHASE_CHECKLIST.txt`
- `PROJECT_VERIFICATION_CHECKLIST.txt`
- `FINAL_SIGNOFF_QA_CHECKLIST.txt`
- `DATA_SOURCE_OF_TRUTH.md`

## Deployment Note

This app is deployed to GitHub Pages and uses a Vite base path:

- `base: '/pjbl-climate-statistics/'`

Static assets should use `import.meta.env.BASE_URL` rather than root-relative `/...` URLs.
