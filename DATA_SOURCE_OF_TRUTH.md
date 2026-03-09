# Data Source Of Truth

This file defines which storage layer is authoritative for each major feature in the current application.

## Authoritative Tables

- `public.users`
  - canonical identity for student / teacher / admin app users
- `public.classes`
  - canonical class/section records
- `public.class_students`
  - canonical student enrollment mapping
- `public.responses`
  - canonical final student submissions for:
    - `pre`
    - `lesson1`
    - `lesson2`
    - `lesson3`
    - `post`
  - canonical teacher scores for lesson final outputs
- `public.feedback`
  - canonical teacher feedback
  - canonical feedback acknowledgment state
- `public.student_state`
  - canonical draft / in-progress lesson state snapshots for:
    - `lesson1`
    - `lesson2`
    - `lesson3`

## Non-Authoritative Browser Storage

Browser storage is now treated as a cache/fallback only.

- `localStorage.lesson1State`
- `localStorage.lesson1_*`
- `localStorage.lesson2_*`
- `localStorage.lesson3_*`
- `localStorage.studentSectionProgress`
- IndexedDB / `localforage`

These may still exist for resilience and offline-ish behavior, but they should not be treated as the final truth when Supabase data exists.

## Current Rules

1. Student progression between sections
   - source of truth: `responses` + `feedback`
   - unlock requirement:
     - previous section submitted
     - previous section has feedback
     - previous feedback acknowledged

2. Pre/Post scores
   - source of truth: `responses.answers.part1Score`
   - fallback:
     - `responses.correctness.part1`
     - `responses.teacher_score`

3. Lesson 1 / 2 / 3 final output score
   - source of truth: `responses.teacher_score`

4. Student performance summary
   - source of truth:
     - `responses`
     - `feedback`

5. Teacher/Admin lesson result tables
   - source of truth:
     - `responses`
     - `feedback`

6. Draft lesson progress
   - source of truth: `student_state`
   - local browser state is cache/fallback

## Legacy / Transitional Columns

The `responses` table still contains older columns from the earlier model:

- `question_id`
- `choice`
- `is_correct`
- `response_json`

The current active app flow primarily uses:

- `student_id`
- `activity_type`
- `answers`
- `correctness`
- `teacher_score`
- `teacher_scored_by`
- `teacher_scored_at`
- `updated_at`

Do not build new features on the legacy columns.

## Legacy / Transitional Structures

- `public.lessons`
  - currently not the primary driver of the student lesson flow
- `public.student_progress`
  - not the active source of truth for student dashboard unlocking
- `src/pages/portals/PerformanceSummary.tsx`
  - legacy teacher portal implementation; not the active combined portal

## Cleanup Direction

1. Continue moving draft lesson persistence to `student_state`
2. Keep final submissions in `responses`
3. Keep feedback/acknowledgment in `feedback`
4. Treat browser storage as cache only
5. Avoid introducing new logic that depends on legacy localStorage-only services
