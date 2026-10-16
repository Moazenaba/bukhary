-- Migration 003: data integrity and account security.
--
-- Before running on an existing database, check for rows these constraints would reject:
--   SELECT phone, count(*) FROM app_users GROUP BY phone HAVING count(*) > 1;
--   SELECT lower(email), count(*) FROM app_users WHERE email <> '' GROUP BY 1 HAVING count(*) > 1;
--   SELECT course_id, committee_number, count(*) FROM committees GROUP BY 1, 2 HAVING count(*) > 1;
-- Foreign keys are added NOT VALID: existing orphans are kept (and can be listed and cleaned
-- later), while every new or updated row must reference a real parent.

-- ---------- Empty strings mean "no value" ----------
UPDATE app_users SET email = NULL WHERE email = '';
UPDATE committees SET course_id = NULL WHERE course_id = '';
UPDATE schedule_tasks SET committee_id = NULL WHERE committee_id = '';
UPDATE schedule_tasks SET assigned_assistant_id = NULL WHERE assigned_assistant_id = '';
UPDATE summer_course_rows SET committee_id = NULL WHERE committee_id = '';
UPDATE summer_course_rows SET course_id = NULL WHERE course_id = '';
UPDATE notifications SET committee_id = NULL WHERE committee_id = '';
UPDATE scoring_records SET committee_id = NULL WHERE committee_id = '';

-- ---------- Accounts ----------
ALTER TABLE app_users ADD COLUMN token_version INT NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN failed_login_count INT NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN locked_until TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN request_code TEXT;
ALTER TABLE app_users ADD COLUMN password_changed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX uq_app_users_phone ON app_users (phone);
CREATE UNIQUE INDEX uq_app_users_email ON app_users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX uq_app_users_request_code ON app_users (request_code) WHERE request_code IS NOT NULL;
ALTER TABLE app_users ADD CONSTRAINT chk_app_users_role
  CHECK (role IN ('super_admin', 'committee_head', 'teacher', 'assistant', 'auditor'));
ALTER TABLE app_users ADD CONSTRAINT chk_app_users_status
  CHECK (status IN ('pending', 'interview', 'approved', 'rejected'));

CREATE TABLE refresh_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ---------- Committees ----------
CREATE UNIQUE INDEX uq_committees_course_number ON committees (course_id, committee_number);
ALTER TABLE committees ADD CONSTRAINT fk_committees_course
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT NOT VALID;

-- ---------- Dependent rows ----------
ALTER TABLE schedule_tasks ADD CONSTRAINT fk_tasks_committee
  FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE schedule_tasks ADD CONSTRAINT fk_tasks_assistant
  FOREIGN KEY (assigned_assistant_id) REFERENCES app_users(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE scoring_records ADD CONSTRAINT fk_scoring_committee
  FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE summer_course_rows ADD CONSTRAINT fk_summer_rows_committee
  FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE summer_course_rows ADD CONSTRAINT fk_summer_rows_course
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_committee
  FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE SET NULL NOT VALID;

-- At most one default course.
UPDATE courses SET is_default = false
  WHERE is_default AND id <> (SELECT id FROM courses WHERE is_default ORDER BY updated_at DESC LIMIT 1);
CREATE UNIQUE INDEX uq_courses_single_default ON courses (is_default) WHERE is_default;

-- ---------- Audit trail written by the server ----------
ALTER TABLE audit_logs ADD COLUMN actor_id VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN entity TEXT;
ALTER TABLE audit_logs ADD COLUMN entity_id TEXT;
ALTER TABLE audit_logs ADD COLUMN before_data JSONB;
ALTER TABLE audit_logs ADD COLUMN after_data JSONB;
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);

-- ---------- Exam files leave the exams table ----------
-- PDFs are served only through an authorized endpoint and never included in list queries.
CREATE TABLE exam_files (
  exam_id VARCHAR(255) PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes INT NOT NULL,
  content BYTEA NOT NULL,
  uploaded_by VARCHAR(255),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO exam_files (exam_id, file_name, mime_type, size_bytes, content)
SELECT
  id,
  COALESCE(NULLIF(pdf_file_name, ''), id || '.pdf'),
  'application/pdf',
  length(decode(substring(pdf_data_url FROM position(',' IN pdf_data_url) + 1), 'base64')),
  decode(substring(pdf_data_url FROM position(',' IN pdf_data_url) + 1), 'base64')
FROM exams
WHERE pdf_data_url LIKE 'data:%;base64,%';

UPDATE exams SET pdf_data_url = NULL, data = data - 'pdfDataUrl'
  WHERE pdf_data_url IS NOT NULL OR data ? 'pdfDataUrl';
