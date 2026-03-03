-- Add columns and tables to support LMS features: activities, feedback, scores, acknowledgments, sections

-- 1. Extend users profile
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS section text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- 2. Extend responses table with LMS-specific fields
ALTER TABLE IF EXISTS responses
  ADD COLUMN IF NOT EXISTS activity_type text;
ALTER TABLE IF EXISTS responses
  ADD COLUMN IF NOT EXISTS answers jsonb;
ALTER TABLE IF EXISTS responses
  ADD COLUMN IF NOT EXISTS correctness jsonb;
ALTER TABLE IF EXISTS responses
  ADD COLUMN IF NOT EXISTS teacher_score numeric;
ALTER TABLE IF EXISTS responses
  ADD COLUMN IF NOT EXISTS teacher_scored_by uuid REFERENCES users(id);
ALTER TABLE IF EXISTS responses
  ADD COLUMN IF NOT EXISTS teacher_scored_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_responses_activity_type ON responses (activity_type);

-- 3. New feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES users(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  feedback_text text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, activity_type)
);

CREATE INDEX IF NOT EXISTS idx_feedback_student ON feedback(student_id);
CREATE INDEX IF NOT EXISTS idx_feedback_activity ON feedback(activity_type);

-- 4. Enable row level security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- 5. Helper functions for role checks (optional but convenient)
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_teacher() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'
  );
$$;

CREATE OR REPLACE FUNCTION is_student() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student'
  );
$$;

-- 6. Policies for users table
CREATE POLICY IF NOT EXISTS users_select_self ON users
  FOR SELECT
  USING (
    id = auth.uid()
    OR is_teacher()
    OR is_admin()
  );

CREATE POLICY IF NOT EXISTS users_select_teacher_section ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_students cs
      JOIN classes c ON c.id = cs.class_id
      WHERE cs.student_id = users.id AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS users_select_admin ON users
  FOR SELECT
  USING (is_admin());

CREATE POLICY IF NOT EXISTS users_insert ON users
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY IF NOT EXISTS users_update ON users
  FOR UPDATE
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY IF NOT EXISTS users_delete ON users
  FOR DELETE
  USING (is_admin());

-- 7. Policies for responses
CREATE POLICY IF NOT EXISTS responses_insert_student ON responses
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

CREATE POLICY IF NOT EXISTS responses_select ON responses
  FOR SELECT
  USING (
    student_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM class_students cs
      JOIN classes c ON c.id = cs.class_id
      WHERE cs.student_id = responses.student_id
        AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS responses_update_teacher ON responses
  FOR UPDATE
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM class_students cs
      JOIN classes c ON c.id = cs.class_id
      WHERE cs.student_id = responses.student_id
        AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS responses_delete ON responses
  FOR DELETE
  USING (is_admin());

-- 8. Policies for feedback
CREATE POLICY IF NOT EXISTS feedback_insert_teacher ON feedback
  FOR INSERT
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM class_students cs
      JOIN classes c ON c.id = cs.class_id
      WHERE cs.student_id = feedback.student_id
        AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS feedback_select ON feedback
  FOR SELECT
  USING (
    student_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM class_students cs
      JOIN classes c ON c.id = cs.class_id
      WHERE cs.student_id = feedback.student_id
        AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS feedback_update_student_ack ON feedback
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid() AND acknowledged = true AND acknowledged_at IS NOT NULL);

CREATE POLICY IF NOT EXISTS feedback_update_teacher ON feedback
  FOR UPDATE
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM class_students cs
      JOIN classes c ON c.id = cs.class_id
      WHERE cs.student_id = feedback.student_id
        AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS feedback_delete ON feedback
  FOR DELETE
  USING (is_admin());

-- 9. Trigger for feedback.updated_at
CREATE OR REPLACE FUNCTION update_feedback_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_updated_at_trig ON feedback;
CREATE TRIGGER feedback_updated_at_trig
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION update_feedback_timestamp();
