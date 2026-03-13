# Statistics Meets Climate Action

React + TypeScript + Vite learning platform for a climate-statistics project-based learning workflow with Student, Teacher, and Admin roles, backed by Supabase and deployed to GitHub Pages.

Live site:
- `https://goldengraphixstudios.github.io/pjbl-climate-statistics/`

## System Summary

This repository contains the active LMS-style experience for:

- student login and portal navigation
- pre-assessment and post-assessment
- Lesson 1, Lesson 2, and Lesson 3 guided activities
- lesson draft persistence and final submission handling
- combined Teacher/Admin portal
- class creation, enrollment, and roster views
- lesson review, scoring, and feedback
- analytics, exports, and class record reporting

## Current UX / Workflow

### Student flow

- log in with student username and password
- complete `Pre-Assessment`
- continue through `Lesson 1`, `Lesson 2`, and `Lesson 3`
- save lesson drafts and resume later
- submit final lesson outputs
- complete `Post-Assessment`
- review overall progress in `Performance Summary`

Important current behavior:

- progression is completion-based, not feedback-acknowledgment-based
- lesson cards can show `Not started`, `In progress`, or `Completed`
- lesson draft state can exist without a final `responses` row
- Lesson 3 and Post-Assessment resume from saved draft state and only mark complete after final submit succeeds

### Teacher / Admin flow

- Teacher and Admin share the same combined portal
- staff can log in with username or email
- staff can create classes and enroll students
- lesson output tabs show both final submissions and draft-saved work where available
- staff can review lesson and assessment submissions
- staff can save lesson scores and lesson feedback
- class record and analytics tabs read from live Supabase data

Important current behavior:

- assessment feedback is no longer part of the active UI flow
- lesson feedback remains active
- background admin polling was reduced to avoid excessive Supabase reads
- staff class data now refreshes on login and browser focus/visibility recovery instead of constant interval polling

## Tech Stack

- React 18
- TypeScript
- Vite
- Supabase
- localforage for browser fallback persistence
- xlsx for export support
- Puppeteer for smoke/debug scripts

## Active Source Of Truth

Primary live tables:

- `public.users`
- `public.classes`
- `public.class_students`
- `public.responses`
- `public.feedback`
- `public.student_state`

Current usage:

- `responses`
  - final submissions for `pre`, `lesson1`, `lesson2`, `lesson3`, `post`
  - lesson teacher scores via `teacher_score`
- `feedback`
  - active lesson feedback records
- `student_state`
  - lesson draft / in-progress state snapshots

Important notes:

- `student_progress` is legacy and not the main live source of truth
- browser storage still exists as fallback cache, not as the primary live record
- `lessonCompletion.ts` now centralizes lesson completion and in-progress derivation logic used by the student dashboard

## Authentication

### Staff

Teacher and Admin accounts use Supabase Auth.

- accepts `username` or `email`
- verifies staff role after sign-in
- surfaces backend outages separately from bad credentials

### Students

Students use custom RPC/database verification:

- `register_student`
- `verify_student`

Student passwords are stored as bcrypt hashes in `public.users.hashed_password`.

Implications:

- Supabase does not store a recoverable plaintext password
- visible student passwords in staff views depend on local credential cache
- if the visible password is lost, it must be reset or reissued

## Current Test Credentials

### Teacher

- Username: `teacher01`
- Email: `teacher01@pjbl.local`
- Password: `cbnhs`

### Admin

- Username: `sirmarco`
- Email: `sirmarco@pjbl.local`
- Password: `101997`

### Students

- Username: `gabriel_labriaga`
- Password: `labriaga066`
- Username: `thandie_arevalo`
- Password: `arevalo276`

## Password Reissue

Local compatibility caches:

- `studentPasswordCache`
- `studentDatabase`

If a student password no longer appears in `List of Classes` and no local cache remains:

1. run [SUPABASE_PASSWORD_RESET_SQL.sql](./SUPABASE_PASSWORD_RESET_SQL.sql) in Supabase
2. use the `Reset PW` or `Reissue Password` action in the class list

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create `.env` in the project root:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Supabase SQL

Run:

- [supabase/schema.sql](./supabase/schema.sql)

Required RPC/functions for the current auth flow:

- `register_student`
- `verify_student`

Optional helper SQL already in the repo:

- [SUPABASE_PASSWORD_RESET_SQL.sql](./SUPABASE_PASSWORD_RESET_SQL.sql)
- [SUPABASE_FEEDBACK_SCOPE_SQL.sql](./SUPABASE_FEEDBACK_SCOPE_SQL.sql)
- [SUPABASE_CLEANUP_SQL.sql](./SUPABASE_CLEANUP_SQL.sql)

Additional setup notes:

- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- [DATA_SOURCE_OF_TRUTH.md](./DATA_SOURCE_OF_TRUTH.md)

## Commands

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run deploy
```

Notes:

- `npm run deploy` publishes the Vite build to GitHub Pages
- there is no generic `npm test` script in `package.json`
- browser/debug automation currently lives in `scripts/` and `tests/e2e/`

## Repository Shape

Top-level tree:

```text
.
|-- public/
|-- scripts/
|-- src/
|-- supabase/
|-- tests/
|-- README.md
|-- HANDOVER_DOCUMENTATION.md
|-- PROJECT_CONTEXT_SNAPSHOT.txt
|-- PROJECT_WORK_LOG.txt
|-- BUG_SELF_HEAL_LOG.txt
|-- PROJECT_PHASE_CHECKLIST.txt
|-- PROJECT_VERIFICATION_CHECKLIST.txt
|-- FINAL_SIGNOFF_QA_CHECKLIST.txt
`-- DATA_SOURCE_OF_TRUTH.md
```

Important `src/` areas:

- `src/pages/auth`
- `src/pages/portals`
- `src/pages/student_sections`
- `src/components/teacher`
- `src/services`
- `src/styles`

## Key Files

### App and portals

- [src/App.tsx](./src/App.tsx)
- [src/pages/portals/CombinedPortal.tsx](./src/pages/portals/CombinedPortal.tsx)
- [src/pages/portals/StudentPortal.tsx](./src/pages/portals/StudentPortal.tsx)
- [src/pages/portals/AdminPortal.tsx](./src/pages/portals/AdminPortal.tsx)

### Student sections

- [src/pages/student_sections/PreAssessment.tsx](./src/pages/student_sections/PreAssessment.tsx)
- [src/pages/student_sections/Lesson1.tsx](./src/pages/student_sections/Lesson1.tsx)
- [src/pages/student_sections/Lesson2.tsx](./src/pages/student_sections/Lesson2.tsx)
- [src/pages/student_sections/Lesson3.tsx](./src/pages/student_sections/Lesson3.tsx)
- [src/pages/student_sections/PostAssessment.tsx](./src/pages/student_sections/PostAssessment.tsx)
- [src/pages/student_sections/PerformanceSummary.tsx](./src/pages/student_sections/PerformanceSummary.tsx)

### Core services

- [src/services/authService.ts](./src/services/authService.ts)
- [src/services/classService.ts](./src/services/classService.ts)
- [src/services/progressService.ts](./src/services/progressService.ts)
- [src/services/studentStateService.ts](./src/services/studentStateService.ts)
- [src/services/responsesService.ts](./src/services/responsesService.ts)
- [src/services/feedbackService.ts](./src/services/feedbackService.ts)
- [src/services/fileAssetService.ts](./src/services/fileAssetService.ts)
- [src/services/lessonCompletion.ts](./src/services/lessonCompletion.ts)

## Verification / Handover Files

- [HANDOVER_DOCUMENTATION.md](./HANDOVER_DOCUMENTATION.md)
- [PROJECT_CONTEXT_SNAPSHOT.txt](./PROJECT_CONTEXT_SNAPSHOT.txt)
- [PROJECT_WORK_LOG.txt](./PROJECT_WORK_LOG.txt)
- [BUG_SELF_HEAL_LOG.txt](./BUG_SELF_HEAL_LOG.txt)
- [PROJECT_PHASE_CHECKLIST.txt](./PROJECT_PHASE_CHECKLIST.txt)
- [PROJECT_VERIFICATION_CHECKLIST.txt](./PROJECT_VERIFICATION_CHECKLIST.txt)
- [FINAL_SIGNOFF_QA_CHECKLIST.txt](./FINAL_SIGNOFF_QA_CHECKLIST.txt)
- [CLIENT_SCOPE_AND_RECOMMENDATIONS.txt](./CLIENT_SCOPE_AND_RECOMMENDATIONS.txt)

## Known Practical Limits

- plaintext student passwords cannot be recovered from bcrypt hashes
- some legacy localStorage-era code still exists and should be retired gradually
- full manual cross-role QA is still the last meaningful release gate
- `PerformanceSummary.tsx` still uses a timed refresh while open

## Recommended Verification Before Handover

Use:

- [PROJECT_VERIFICATION_CHECKLIST.txt](./PROJECT_VERIFICATION_CHECKLIST.txt)
- [FINAL_SIGNOFF_QA_CHECKLIST.txt](./FINAL_SIGNOFF_QA_CHECKLIST.txt)
