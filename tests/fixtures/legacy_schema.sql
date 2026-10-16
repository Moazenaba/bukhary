-- ==============================================================================
-- منظومة إدارة لجان ودورات واختبارات مسابقات مسجد الإمام البخاري
-- BUKHARI COMPETITION & COMMITTEE MANAGEMENT SYSTEM
-- SUPABASE POSTGRESQL FULL DATABASE SCHEMA (المخطط الكامل لقاعدة البيانات)
-- ==============================================================================

-- 1. تفعيل الملحقات الضرورية
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

-- ==============================================================================
-- 12. البيانات الأولية الأساسية (Seed Data Inserts)
-- السيرفر يطبّق هذا الملف عند كل تشغيل، لذلك تُدرج البيانات الأولية مرة واحدة فقط
-- (ON CONFLICT DO NOTHING) ولا تكتب فوق التعديلات الحية مثل كلمات المرور.
-- ==============================================================================

-- أولاً: الدورات العلمية
INSERT INTO courses (id, name, season, year, start_date, end_date, status, is_default, target_committees_count, description, created_at, data)
VALUES
  (
    'course-summer-1447',
    'دورة الصيف 1447هـ - متون العقيدة والتوحيد',
    'صيفية',
    '1447هـ / 2026م',
    '2026-09-01',
    '2026-10-30',
    'active',
    true,
    30,
    'الدورة الرئيسية الحالية بمسجد البخاري، تشمل متون الأصول الثلاثة وكتاب التوحيد وكشف الشبهات وتضم لجان القاعة الكبرى.',
    '2026-09-01',
    '{"id":"course-summer-1447","name":"دورة الصيف 1447هـ - متون العقيدة والتوحيد","season":"صيفية","year":"1447هـ / 2026م","startDate":"2026-09-01","endDate":"2026-10-30","status":"active","isDefault":true,"targetCommitteesCount":30}'::jsonb
  ),
  (
    'course-winter-1446',
    'دورة الشتاء 1446هـ - الدورة التأسيسية السابقة',
    'شتوية',
    '1446هـ / 2025م',
    '2025-11-01',
    '2026-02-15',
    'completed',
    false,
    22,
    'الدورة الشتوية المكتملة والمؤرشفة، محفوظة بكافة كشوفاتنا ودرجات لجانها للاطلاع والمقارنة.',
    '2025-11-01',
    '{"id":"course-winter-1446","name":"دورة الشتاء 1446هـ - الدورة التأسيسية السابقة","season":"شتوية","year":"1446هـ / 2025م","startDate":"2025-11-01","endDate":"2026-02-15","status":"completed","isDefault":false,"targetCommitteesCount":22}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- ثانياً: المستخدمون الأساسيون (المشرف العام، رؤساء اللجان، المعاونون)
-- ملاحظة أمنية: تم تشفير كلمات المرور باستخدام bcrypt
INSERT INTO app_users (id, name, phone, email, password, role, status, assigned_committees, permissions, notes, created_at, data)
VALUES
  (
    'user-admin',
    'فضيلة الشيخ د. أحمد بن محمد المنشاوي',
    '0501112233',
    'admin',
    '$2b$10$2NcJwJpiIAjm581jdds1nu1ALIs6xQ/w19OBuodgkFD0FkNZYOu0q',
    'super_admin',
    'approved',
    '[]'::jsonb,
    '["database_sheets","manage_committees","add_new_committee","exams_pdf","manage_courses","calendar_schedule","progress_stats","manage_assistants","receive_committee","approve_exam","enter_scores","verify_sheets","manage_exams"]'::jsonb,
    'المشرف العام على مسابقات مسجد البخاري ومدير النظام بصلاحيات كاملة',
    '2026/09/20 - 08:00 ص',
    '{"id":"user-admin","name":"فضيلة الشيخ د. أحمد بن محمد المنشاوي","email":"admin","role":"super_admin","status":"approved"}'::jsonb
  ),
  (
    'user-head-dosari',
    'الشيخ عبد الله بن فهد الدوسري',
    '0552223344',
    'dosari@bukhari.org',
    '$2b$10$zalk.bdZUzbpbz2LtqcZbOxXKGJXeY4T0toNb8sqzSjC/ea.BvcqC',
    'committee_head',
    'approved',
    '[1, 2]'::jsonb,
    '["receive_committee","approve_exam","enter_scores","verify_sheets","manage_committees","exams_pdf"]'::jsonb,
    'رئيس لجان قاعة الإمام البخاري ومعلم معتمد ومكلف باعتماد الاختبارات ومراجعة النتائج',
    '2026/09/24 - 04:00 م',
    '{"id":"user-head-dosari","name":"الشيخ عبد الله بن فهد الدوسري","role":"committee_head","status":"approved"}'::jsonb
  ),
  (
    'user-ast-moaz',
    'أ. معاذ بن سعيد العتيبي',
    '0553334455',
    'moaz@bukhari.org',
    '$2b$10$dP/9G2A7zrX95KMpXEYOY.tXAboYnS1Zdr7UHLUyKb7Qap8GkiMuq',
    'assistant',
    'approved',
    '[3, 4]'::jsonb,
    '["receive_committee","approve_exam","enter_scores"]'::jsonb,
    'معاون معتمد ومكلف بالرصد واستلام لجان متون الناشئة',
    '2026/09/24 - 06:15 م',
    '{"id":"user-ast-moaz","name":"أ. معاذ بن سعيد العتيبي","role":"assistant","status":"approved"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- ثالثاً: بنك نماذج الامتحانات (Exams)
INSERT INTO exams (id, title, book, branch, total_marks, duration_minutes, questions_count, pdf_file_name, pdf_file_size, uploaded_at, notes, data)
VALUES
  (
    'exam-1',
    'امتحان كتاب الأصول الثلاثة وأدلتها — النموذج (أ)',
    'مسابقة كتاب الأصول الثلاثة',
    'فرع الطلاب المتقدمين',
    100,
    60,
    5,
    'امتحان_الأصول_الثلاثة_نموذج_أ.pdf',
    '1.4 MB',
    '2026/09/25 - 08:00 ص',
    'الأسئلة تشمل ضبط المتن، وشرح الأصول الثلاثة، والأدلة على المسائل الأربع والشهادتين.',
    '{"id":"exam-1","title":"امتحان كتاب الأصول الثلاثة وأدلتها — النموذج (أ)","book":"مسابقة كتاب الأصول الثلاثة"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- رابعاً: اللجان الأولية النموذجية (Committees)
INSERT INTO committees (id, committee_number, committee_name, association_name, members, branch, competition_book, general_notes, course_id, course_name, sheikh_name, sheikh_phone, sheikh_country, students_count, is_women_committee, stages, created_date, created_at_time, data)
VALUES
  (
    '1',
    1,
    'لجنة الأصول الثلاثة (المجموعة أ)',
    'جمعية مسجد البخاري للعلوم الشرعية',
    '["فضيلة الشيخ د. أحمد بن محمد المنشاوي", "الشيخ عبد الله الدوسري", "الشيخ إبراهيم فخرو"]'::jsonb,
    'فرع الطلاب المتقدمين',
    'مسابقة كتاب الأصول الثلاثة',
    'تم اختبار 14 طالباً حتى الآن في أبواب معرفة العبد ربه ودينه ونبيه، الأداء العام ممتاز.',
    'course-summer-1447',
    'دورة الصيف 1447هـ - متون العقيدة والتوحيد',
    'فضيلة الشيخ د. أحمد بن محمد المنشاوي',
    '+20 100 123 4567',
    'مصر - القاهرة',
    22,
    false,
    '{"registration":{"completed":true,"completedAt":"2026/09/25 - 08:30 ص"},"exam":{"completed":true,"completedAt":"2026/09/25 - 09:15 ص"},"scoring":{"completed":true,"completedAt":"2026/09/25 - 09:50 ص"},"aggregation":{"completed":false},"review":{"completed":false},"sheet":{"completed":false},"accreditation":{"completed":false},"announcement":{"completed":false},"ceremony":{"completed":false}}'::jsonb,
    '1445-09-12',
    '08:30 ص',
    '{"id":"1","committeeNumber":1,"committeeName":"لجنة الأصول الثلاثة (المجموعة أ)","courseId":"course-summer-1447","courseName":"دورة الصيف 1447هـ - متون العقيدة والتوحيد","studentsCount":22,"sheikhName":"فضيلة الشيخ د. أحمد بن محمد المنشاوي"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_settings (key, value, description)
VALUES
  (
    'app_info',
    '{"appName":"منظومة إدارة لجان مسابقات مسجد البخاري","version":"2.5.0","environment":"production","database":"Supabase PostgreSQL"}'::jsonb,
    'المعلومات الأساسية للنظام'
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- نهاية المخطط الشامل لقاعدة البيانات
