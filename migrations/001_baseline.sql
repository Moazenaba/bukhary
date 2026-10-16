-- Migration 001: baseline schema.
-- Matches the tables that existed before migrations were introduced (supabase_schema.sql
-- without its seed data), written idempotently so it can run against an existing database.
-- Never add seed rows here: the first super admin is created with `npm run create-admin`.

-- ==============================================================================
-- منظومة إدارة لجان ودورات واختبارات مسابقات مسجد الإمام البخاري
-- BUKHARI COMPETITION & COMMITTEE MANAGEMENT SYSTEM
-- SUPABASE POSTGRESQL FULL DATABASE SCHEMA (المخطط الكامل لقاعدة البيانات)
-- ==============================================================================


-- دالة التحديث التلقائي لحقل updated_at
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. جدول الدورات العلمية (Courses)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS courses (
  id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT,
  year TEXT,
  start_date TEXT,
  end_date TEXT,
  status VARCHAR(50) DEFAULT 'active',
  description TEXT,
  target_committees_count INT DEFAULT 30,
  is_default BOOLEAN DEFAULT false,
  created_at TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ضمان وجود كافة الأعمدة في حال تم إنشاء الجدول سابقاً
ALTER TABLE courses ADD COLUMN IF NOT EXISTS season TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS year TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS target_committees_count INT DEFAULT 30;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_is_default ON courses(is_default);

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ==============================================================================
-- 3. جدول اللجان الميدانية (Committees)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS committees (
  id VARCHAR(255) PRIMARY KEY,
  committee_number INT,
  committee_name TEXT NOT NULL,
  association_name TEXT,
  members JSONB DEFAULT '[]'::jsonb,
  branch TEXT,
  competition_book TEXT,
  general_notes TEXT,
  course_id VARCHAR(255),
  course_name TEXT,
  sheikh_name TEXT,
  sheikh_phone TEXT,
  sheikh_country TEXT,
  students_count INT DEFAULT 0,
  is_women_committee BOOLEAN DEFAULT false,
  stages JSONB NOT NULL DEFAULT '{}'::jsonb,
  scoring_details JSONB DEFAULT '{}'::jsonb,
  aggregation_details JSONB DEFAULT '{}'::jsonb,
  ceremony_details JSONB DEFAULT '{}'::jsonb,
  received_by_assistant JSONB,
  exam_approved_by JSONB,
  created_date TEXT,
  created_at_time TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ضمان وجود كافة الأعمدة في حال تم إنشاء الجدول سابقاً
ALTER TABLE committees ADD COLUMN IF NOT EXISTS association_name TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS members JSONB DEFAULT '[]'::jsonb;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS competition_book TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS general_notes TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS course_id VARCHAR(255);
ALTER TABLE committees ADD COLUMN IF NOT EXISTS course_name TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS sheikh_name TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS sheikh_phone TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS sheikh_country TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS students_count INT DEFAULT 0;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS is_women_committee BOOLEAN DEFAULT false;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS stages JSONB DEFAULT '{}'::jsonb;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS scoring_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS aggregation_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS ceremony_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS received_by_assistant JSONB;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS exam_approved_by JSONB;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS created_date TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS created_at_time TEXT;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE committees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_committees_course_id ON committees(course_id);
CREATE INDEX IF NOT EXISTS idx_committees_number ON committees(committee_number);
CREATE INDEX IF NOT EXISTS idx_committees_sheikh_name ON committees(sheikh_name);

DROP TRIGGER IF EXISTS trg_committees_updated_at ON committees;
CREATE TRIGGER trg_committees_updated_at
  BEFORE UPDATE ON committees
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ==============================================================================
-- 4. جدول المستخدمين والمعاونين والمشرفين (App Users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  password TEXT,
  passport_number TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'assistant',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  assigned_committees JSONB DEFAULT '[]'::jsonb,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  notes TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_phone ON app_users(phone);

DROP TRIGGER IF EXISTS trg_app_users_updated_at ON app_users;
CREATE TRIGGER trg_app_users_updated_at
  BEFORE UPDATE ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ==============================================================================
-- 5. جدول بنك الامتحانات ونماذج الأسئلة (Exams)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS exams (
  id VARCHAR(255) PRIMARY KEY,
  title TEXT NOT NULL,
  book TEXT NOT NULL,
  branch TEXT,
  total_marks INT DEFAULT 100,
  duration_minutes INT DEFAULT 60,
  questions_count INT DEFAULT 5,
  pdf_file_name TEXT,
  pdf_file_size TEXT,
  pdf_data_url TEXT,
  uploaded_at TEXT,
  notes TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_book ON exams(book);

DROP TRIGGER IF EXISTS trg_exams_updated_at ON exams;
CREATE TRIGGER trg_exams_updated_at
  BEFORE UPDATE ON exams
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ==============================================================================
-- 6. جدول المهام وجدول المواعيد والتقويم (Schedule Tasks)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS schedule_tasks (
  id VARCHAR(255) PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  committee_id VARCHAR(255),
  committee_number INT,
  assigned_assistant_id VARCHAR(255),
  assigned_assistant_name TEXT,
  type VARCHAR(50) DEFAULT 'general',
  priority VARCHAR(50) DEFAULT 'normal',
  completed BOOLEAN DEFAULT false,
  completed_at TEXT,
  deliverable TEXT,
  notes TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_tasks_date ON schedule_tasks(date);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_comm ON schedule_tasks(committee_id);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_ast ON schedule_tasks(assigned_assistant_id);

DROP TRIGGER IF EXISTS trg_schedule_tasks_updated_at ON schedule_tasks;
CREATE TRIGGER trg_schedule_tasks_updated_at
  BEFORE UPDATE ON schedule_tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ==============================================================================
-- 7. جدول رصد الدرجات التفصيلي (Scoring Records)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS scoring_records (
  id VARCHAR(255) PRIMARY KEY,
  committee_id VARCHAR(255),
  committee_number INT,
  student_name TEXT,
  question_number INT,
  score NUMERIC(5, 2),
  max_score NUMERIC(5, 2),
  scorer_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_committee ON scoring_records(committee_id);

DROP TRIGGER IF EXISTS trg_scoring_records_updated_at ON scoring_records;
CREATE TRIGGER trg_scoring_records_updated_at
  BEFORE UPDATE ON scoring_records
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ==============================================================================
-- 8. جدول سجلات الأمان والرقابة (Audit Logs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(255) PRIMARY KEY,
  user_name TEXT NOT NULL,
  user_role TEXT,
  action TEXT NOT NULL,
  details TEXT,
  status VARCHAR(50) DEFAULT 'success',
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ==============================================================================
-- 9. جدول الإشعارات والتنبيهات الميدانية (Notifications)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(255) PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type VARCHAR(50) DEFAULT 'info',
  read BOOLEAN DEFAULT false,
  committee_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- ==============================================================================
-- 10. جدول إعدادات النظام وتكامل جوجل شيت (System Settings)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ==============================================================================
-- 11. جدول صفوف الكشف الصيفي (Summer Course Rows) - لإدارة الكشوف الميدانية
-- ==============================================================================
CREATE TABLE IF NOT EXISTS summer_course_rows (
  id VARCHAR(255) PRIMARY KEY,
  number INT NOT NULL,
  sheikh_name TEXT NOT NULL,
  place TEXT,
  book TEXT,
  students_count INT DEFAULT 0,
  delivered BOOLEAN DEFAULT false,
  corrected BOOLEAN DEFAULT false,
  reviewed BOOLEAN DEFAULT false,
  announced BOOLEAN DEFAULT false,
  ceremony BOOLEAN DEFAULT false,
  struck_out BOOLEAN DEFAULT false,
  uncertain BOOLEAN DEFAULT false,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  committee_id VARCHAR(255),
  course_id VARCHAR(255),
  course_name TEXT,
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_summer_course_rows_course ON summer_course_rows(course_id);
CREATE INDEX IF NOT EXISTS idx_summer_course_rows_number ON summer_course_rows(number);

DROP TRIGGER IF EXISTS trg_summer_course_rows_updated_at ON summer_course_rows;
CREATE TRIGGER trg_summer_course_rows_updated_at
  BEFORE UPDATE ON summer_course_rows
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

