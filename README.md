# Statistics Meets Climate Action

React + TypeScript + Vite learning platform for a climate-statistics PJBL workflow with Student, Teacher, and Admin roles, backed by Supabase.

## Current Delivered System

This repo contains the implemented LMS-side work for:

- student submissions for `pre`, `lesson1`, `lesson2`, `lesson3`, and `post`
- combined Teacher/Admin portal
- teacher feedback workflow
- teacher lesson scoring workflow
- class record and analytics/reporting tabs
- Supabase-backed submissions, feedback, and lesson draft persistence
- handover logs, checklists, and cleanup helpers

## Active Source Of Truth

The current active data model is:

- `public.users`
- `public.classes`
- `public.class_students`
- `public.responses`
- `public.feedback`
- `public.student_state`

Important:

- `responses` stores final activity submissions and teacher scores
- `feedback` stores teacher feedback and acknowledgment state
- `student_state` stores lesson draft/in-progress state
- `lessons` and `student_progress` still exist but are not the main live source of truth for final submissions/scoring

See:

- [DATA_SOURCE_OF_TRUTH.md](./DATA_SOURCE_OF_TRUTH.md)
- [CLIENT_SCOPE_AND_RECOMMENDATIONS.txt](./CLIENT_SCOPE_AND_RECOMMENDATIONS.txt)

## Authentication

### Staff

Teacher and Admin accounts use Supabase Auth sign-in.

### Students

Students use custom RPC-based auth through:

- `register_student`
- `verify_student`

Student passwords are stored as bcrypt hashes in `public.users.hashed_password`.

That means:

- Supabase does not store a recoverable plaintext password
- the Teacher/Admin class list can only display a plaintext password if it still exists in the local browser credential cache
- if the visible password is lost, it must be reissued/reset

## Current Test Credentials

### Teacher

- Username: `teacher01`
- Password: `cbnhs`

### Admin

- Username: `sirmarco`
- Password: `101997`

### Students

- Username: `gabriel_labriaga`
- Password: `labriaga066`
- Username: `thandie_arevalo`
- Password: `arevalo276`

## Password Reissue

There are two local browser caches used for compatibility:

- `studentPasswordCache`
- `studentDatabase`

The class list now attempts to recover visible passwords from both.

If a student's password no longer appears in `List of Classes` and no cache exists, use the password reissue flow:

1. run [SUPABASE_PASSWORD_RESET_SQL.sql](./SUPABASE_PASSWORD_RESET_SQL.sql) in Supabase
2. use the `Reset PW` or `Reissue Password` action in the Teacher/Admin class list

This updates the student's hashed password in Supabase and stores the new plaintext password locally for teacher-side display.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create `.env` in project root:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Supabase SQL

Run:

- [supabase/schema.sql](./supabase/schema.sql)

If you are using the current custom student auth flow, make sure the RPC functions exist:

- `register_student`
- `verify_student`

For teacher/admin password reissue support, also run:

- [SUPABASE_PASSWORD_RESET_SQL.sql](./SUPABASE_PASSWORD_RESET_SQL.sql)

Additional helper docs:

- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- [SUPABASE_CLEANUP_SQL.sql](./SUPABASE_CLEANUP_SQL.sql)

## Development

Run the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Main User Flows

### Student

- log in with username/password
- submit pre-assessment
- view teacher feedback
- acknowledge feedback
- unlock next activity
- submit Lesson 1 / Lesson 2 / Lesson 3
- receive teacher score and feedback
- view performance summary
- complete post-assessment

### Teacher / Admin

- log in through the shared combined portal
- create classes
- enroll students
- view masterlist and class list
- review pre/post results
- review lesson output rows
- save lesson scores
- send feedback
- export CSV/report outputs
- view class record
- reissue student passwords if needed

## Key Files

### Active portals

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
- [src/services/responsesService.ts](./src/services/responsesService.ts)
- [src/services/feedbackService.ts](./src/services/feedbackService.ts)
- [src/services/studentStateService.ts](./src/services/studentStateService.ts)
- [src/services/submissionsService.ts](./src/services/submissionsService.ts)

## Handover Files

- [HANDOVER_DOCUMENTATION.md](./HANDOVER_DOCUMENTATION.md)
- [PROJECT_WORK_LOG.txt](./PROJECT_WORK_LOG.txt)
- [BUG_SELF_HEAL_LOG.txt](./BUG_SELF_HEAL_LOG.txt)
- [PROJECT_PHASE_CHECKLIST.txt](./PROJECT_PHASE_CHECKLIST.txt)
- [PROJECT_VERIFICATION_CHECKLIST.txt](./PROJECT_VERIFICATION_CHECKLIST.txt)
- [FINAL_SIGNOFF_QA_CHECKLIST.txt](./FINAL_SIGNOFF_QA_CHECKLIST.txt)
- [CLIENT_SCOPE_AND_RECOMMENDATIONS.txt](./CLIENT_SCOPE_AND_RECOMMENDATIONS.txt)

## Known Practical Limits

- plaintext student passwords cannot be recovered from Supabase hashes
- some legacy/inactive localStorage-era code still remains in the repo and should be retired over time
- final cross-role QA should still be completed before final sign-off

## Recommended Pre-Handover Step

Run the acceptance pass in:

- [FINAL_SIGNOFF_QA_CHECKLIST.txt](./FINAL_SIGNOFF_QA_CHECKLIST.txt)
