# PJBL Climate Statistics - Handover Documentation

## Project root

- Local repo: `C:\Users\AJHAY\Documents\GitHub\pjbl-climate-statistics`
- Main app: React + TypeScript + Vite
- Database: Supabase

## Main roles

- Student
- Teacher
- Admin

Teacher and Admin share the same active combined portal.

## Main data tables in Supabase

- `users`
  - app user profiles and roles
- `classes`
  - class/section records
- `class_students`
  - student enrollment per class
- `responses`
  - student submissions for:
    - `pre`
    - `lesson1`
    - `lesson2`
    - `lesson3`
    - `post`
- `feedback`
  - teacher/admin feedback per student activity
- `student_progress`
  - legacy / partial progress support
- `student_state`
  - authoritative draft / in-progress lesson state snapshots for lessons 1-3

## Important implementation notes

The live lesson submission and lesson scoring flow is driven by `responses`, not by `lessons`.

- `public.lessons` is not the table that stores lesson outputs
- lesson outputs and teacher lesson scores are stored in `public.responses`

Draft lesson progress is now intended to be driven by `student_state`, with browser storage used as cache/fallback only.

## Activity storage model

- Pre-assessment:
  - `responses.activity_type = 'pre'`
  - score comes from `answers.part1Score`
- Lesson 1:
  - `responses.activity_type = 'lesson1'`
  - final output payload is stored inside `answers.lesson1State`
  - teacher score is stored in `teacher_score`
- Lesson 2:
  - `responses.activity_type = 'lesson2'`
  - final output payload is stored inside `answers.phase4_upload`
  - teacher score is stored in `teacher_score`
- Lesson 3:
  - `responses.activity_type = 'lesson3'`
  - final output payload is stored inside `answers.phase4_reflection`
  - teacher score is stored in `teacher_score`
- Post-assessment:
  - `responses.activity_type = 'post'`
  - score comes from `answers.part1Score`

## Feedback flow

- Feedback is stored in `feedback`
- Student progression is intended to require:
  - submission exists
  - feedback exists
  - feedback is acknowledged

## Active portals

- Student dashboard:
  - `src/pages/portals/StudentPortal.tsx`
- Combined Teacher/Admin portal:
  - `src/pages/portals/AdminPortal.tsx`
  - wrapped by `src/pages/portals/CombinedPortal.tsx`

## Key student pages

- `src/pages/student_sections/PreAssessment.tsx`
- `src/pages/student_sections/Lesson1.tsx`
- `src/pages/student_sections/Lesson2.tsx`
- `src/pages/student_sections/Lesson3.tsx`
- `src/pages/student_sections/PostAssessment.tsx`
- `src/pages/student_sections/PerformanceSummary.tsx`

## Key admin/teacher features

- Pre/post analytics
- Lesson 1/2/3 output review tabs
- Feedback submission
- Lesson scoring via `responses.teacher_score`
- Class record export
- CSV / printable report support

## Important repo log files

- `PROJECT_WORK_LOG.txt`
  - chronological work/change log
- `PROJECT_PHASE_CHECKLIST.txt`
  - implementation checklist by phase
- `PROJECT_VERIFICATION_CHECKLIST.txt`
  - QA / functional verification checklist
- `BUG_SELF_HEAL_LOG.txt`
  - error log and self-diagnosis notes
- `DATA_SOURCE_OF_TRUTH.md`
  - canonical storage/source-of-truth map
- `SUPABASE_CLEANUP_SQL.sql`
  - verification/reset SQL helpers for live data

## Recommended final verification before production use

1. Run through the full student path from pre-assessment to post-assessment.
2. Verify each lesson score appears in:
   - student performance summary
   - class record
3. Verify each unlock happens only after feedback acknowledgment.
4. Verify CSV/print exports for:
   - pre-assessment
   - lesson outputs
   - post-assessment
   - class record
5. Verify Supabase policies still allow:
   - staff feedback insert/update
   - student feedback read + acknowledge
   - teacher lesson score update

## Deployment note

This app uses a Vite base path for GitHub Pages:

- `base: '/pjbl-climate-statistics/'`

Static lesson images should therefore use `import.meta.env.BASE_URL` instead of root `/...` paths.
