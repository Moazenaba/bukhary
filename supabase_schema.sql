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
-- 11. البيانات الأولية الأساسية (Seed Data Inserts)
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
    'الدورة الشتوية المكتملة والمؤرشفة، محفوظة بكافة كشوفاتها ودرجات لجانها للاطلاع والمقارنة.',
    '2025-11-01',
    '{"id":"course-winter-1446","name":"دورة الشتاء 1446هـ - الدورة التأسيسية السابقة","season":"شتوية","year":"1446هـ / 2025م","startDate":"2025-11-01","endDate":"2026-02-15","status":"completed","isDefault":false,"targetCommitteesCount":22}'::jsonb
  ),
  (
    'course-winter-1448',
    'دورة الشتاء 1448هـ - المسابقة الموسعة',
    'شتوية',
    '1448هـ / 2026-2027م',
    '2026-11-15',
    '2027-02-28',
    'upcoming',
    false,
    35,
    'الدورة القادمة المقررة بعد انتهاء دورة الصيف، تشمل فروع السنة النبوية ومتون الفقه.',
    '2026-09-20',
    '{"id":"course-winter-1448","name":"دورة الشتاء 1448هـ - المسابقة الموسعة","season":"شتوية","year":"1448هـ / 2026-2027م","startDate":"2026-11-15","endDate":"2027-02-28","status":"upcoming","isDefault":false,"targetCommitteesCount":35}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  season = EXCLUDED.season,
  year = EXCLUDED.year,
  status = EXCLUDED.status,
  is_default = EXCLUDED.is_default,
  description = EXCLUDED.description,
  data = EXCLUDED.data;

-- ثانياً: المستخدمون الأساسيون (المشرف العام، رؤساء اللجان، المعاونون)
INSERT INTO app_users (id, name, phone, email, password, role, status, assigned_committees, permissions, notes, created_at, data)
VALUES
  (
    'user-admin',
    'فضيلة الشيخ د. أحمد بن محمد المنشاوي',
    '0501112233',
    'admin',
    '504',
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
    'teacher123',
    'committee_head',
    'approved',
    '[1, 2]'::jsonb,
    '["receive_committee","approve_exam","enter_scores","verify_sheets","manage_committees","exams_pdf"]'::jsonb,
    'رئيس لجان قاعة الإمام البخاري ومعلم معتمد ومكلف باعتماد الاختبارات ومراجعة النتائج',
    '2026/09/24 - 04:00 م',
    '{"id":"user-head-dosari","name":"الشيخ عبد الله بن فهد الدوسري","role":"committee_head","status":"approved"}'::jsonb
  ),
  (
    'user-teacher-saad',
    'فضيلة الشيخ سعد بن راشد الخالدي',
    '0556667788',
    'saad@bukhari.org',
    'teacher123',
    'teacher',
    'approved',
    '[2, 3]'::jsonb,
    '["enter_scores","verify_sheets","approve_exam","manage_committees"]'::jsonb,
    'معلم ومقرئ معتمد - مكلف باختبار الطلاب ورصد درجات الحفظ الميداني',
    '2026/09/23 - 02:00 م',
    '{"id":"user-teacher-saad","name":"فضيلة الشيخ سعد بن راشد الخالدي","role":"teacher","status":"approved"}'::jsonb
  ),
  (
    'user-ast-moaz',
    'أ. معاذ بن سعيد العتيبي',
    '0553334455',
    'moaz@bukhari.org',
    'assistant123',
    'assistant',
    'approved',
    '[3, 4]'::jsonb,
    '["receive_committee","approve_exam","enter_scores"]'::jsonb,
    'معاون معتمد ومكلف بالرصد واستلام لجان متون الناشئة',
    '2026/09/24 - 06:15 م',
    '{"id":"user-ast-moaz","name":"أ. معاذ بن سعيد العتيبي","role":"assistant","status":"approved"}'::jsonb
  ),
  (
    'user-ast-ahmed',
    'أ. أحمد بن إبراهيم المنصور',
    '0559998877',
    'ahmed.mansoor@bukhari.org',
    'field123',
    'assistant',
    'approved',
    '[1]'::jsonb,
    '["receive_committee","approve_exam","enter_scores"]'::jsonb,
    'معاون ميداني - مكلف باستلام وتجهيز قاعات الاختبار',
    '2026/09/25 - 07:30 ص',
    '{"id":"user-ast-ahmed","name":"أ. أحمد بن إبراهيم المنصور","role":"assistant","status":"approved"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  permissions = EXCLUDED.permissions,
  password = EXCLUDED.password,
  email = EXCLUDED.email;

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
  ),
  (
    'exam-2',
    'امتحان كتاب التوحيد — النهائي المعتمد',
    'كتاب التوحيد الذي هو حق الله على العبيد',
    'فرع الكبار',
    100,
    90,
    8,
    'امتحان_كتاب_التوحيد_الدورة_العلمية.pdf',
    '2.1 MB',
    '2026/09/25 - 08:15 ص',
    'يشمل أبواب الخوف والرجاء والتطير والرقى والتمائم وتفسير التوحيد.',
    '{"id":"exam-2","title":"امتحان كتاب التوحيد — النهائي المعتمد","book":"كتاب التوحيد الذي هو حق الله على العبيد"}'::jsonb
  ),
  (
    'exam-3',
    'امتحان القواعد الأربع — فرع الناشئة',
    'مسابقة كتاب القواعد الأربع',
    'فرع الناشئة دون 15 سنة',
    50,
    45,
    4,
    'امتحان_القواعد_الأربع_ناشئة.pdf',
    '860 KB',
    '2026/09/25 - 08:30 ص',
    'مراعاة مستوى الناشئة والتركيز على حفظ نص القواعد والرد على المشركين.',
    '{"id":"exam-3","title":"امتحان القواعد الأربع — فرع الناشئة","book":"مسابقة كتاب القواعد الأربع"}'::jsonb
  ),
  (
    'exam-4',
    'امتحان العقيدة الواسطية — القسم الأول',
    'مسابقة العقيدة الواسطية',
    'فرع حفظ المتن والشرح',
    100,
    75,
    6,
    'امتحان_العقيدة_الواسطية_مسجد_البخاري.pdf',
    '1.8 MB',
    '2026/09/25 - 08:45 ص',
    'قواعد الأسماء والصفات وآيات الصفات الواردة في كلام شيخ الإسلام.',
    '{"id":"exam-4","title":"امتحان العقيدة الواسطية — القسم الأول","book":"مسابقة العقيدة الواسطية"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  book = EXCLUDED.book,
  branch = EXCLUDED.branch,
  total_marks = EXCLUDED.total_marks,
  duration_minutes = EXCLUDED.duration_minutes;

-- رابعاً: جدول المهام والتقويم (Schedule Tasks)
INSERT INTO schedule_tasks (id, title, date, time, committee_id, committee_number, assigned_assistant_id, assigned_assistant_name, type, priority, completed, deliverable, notes, data)
VALUES
  (
    'task-ahmed-1',
    'استلام أوراق إجابات لجنة 1 الميدانية (الأصول الثلاثة)',
    '2026-10-02',
    '10:30 ص',
    '1',
    1,
    'user-ast-ahmed',
    'أ. أحمد بن إبراهيم المنصور',
    'receive',
    'urgent',
    false,
    'أوراق إجابات الطلاب (30 ورقة) ومطابقة الحضور مع كشف التوقيعات',
    'استلام الأوراق من رئيس اللجنة والتوقيع على نموذج الاستلام الميداني وتسليمها لغرفة الكنترول.',
    '{"id":"task-ahmed-1","title":"استلام أوراق إجابات لجنة 1 الميدانية (الأصول الثلاثة)"}'::jsonb
  ),
  (
    'task-1',
    'تسليم أوراق أسئلة لجنة 1 (الأصول الثلاثة)',
    '2026-10-02',
    '09:00 ص',
    '1',
    1,
    'user-head-dosari',
    'الشيخ عبد الله الدوسري',
    'delivery',
    'urgent',
    false,
    'كراسات الأسئلة ونماذج الإجابة المعتمدة (30 نسخة)',
    'تسليمها لرئيس اللجنة في قاعة الإمام البخاري قبل بدء الاختبار بنصف ساعة.',
    '{"id":"task-1","title":"تسليم أوراق أسئلة لجنة 1 (الأصول الثلاثة)"}'::jsonb
  ),
  (
    'task-2',
    'استلام كشوف رصد وتصحيح لجنة 2 ولجنة 3',
    '2026-10-02',
    '11:30 ص',
    '2',
    2,
    'user-ast-moaz',
    'أ. معاذ بن سعيد العتيبي',
    'receive',
    'high',
    false,
    'دفاتر التصحيح وكشوف الدرجات موقعة من المصححين',
    'فحص توقيعات المصححين ومطابقة الدرجات قبل تسليمها للجنة التجميع.',
    '{"id":"task-2","title":"استلام كشوف رصد وتصحيح لجنة 2 ولجنة 3"}'::jsonb
  ),
  (
    'task-3',
    'اعتماد جاهزية القاعة وقوائم أسماء الطلاب',
    '2026-10-02',
    '08:15 ص',
    NULL,
    NULL,
    NULL,
    NULL,
    'exam',
    'high',
    true,
    'كشف الحضور والغياب المطبوع وأرقام الجلوس',
    'تم فحص أجهزة التكييف والإنارة وجاهزية المقاعد وتوزيع كشوف المناداة.',
    '{"id":"task-3","title":"اعتماد جاهزية القاعة وقوائم أسماء الطلاب"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  date = EXCLUDED.date,
  completed = EXCLUDED.completed;

-- خامساً: اللجان الأولية النموذجية (Committees)
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
  ),
  (
    '2',
    2,
    'لجنة كتاب التوحيد - رجال',
    'جمعية السنة والمجد العلمي',
    '["فضيلة الشيخ عبد الرحمن بن صالح الغامدي", "الشيخ فيصل بن مسفر الشمري"]'::jsonb,
    'فرع الكبار',
    'كتاب التوحيد الذي هو حق الله على العبيد',
    'تم رصد درجات أسئلة حفظ المتن والمسائل، يجري الآن تجميع الدرجات وإعداد الكشوف.',
    'course-summer-1447',
    'دورة الصيف 1447هـ - متون العقيدة والتوحيد',
    'فضيلة الشيخ عبد الرحمن بن صالح الغامدي',
    '+966 50 234 5678',
    'السعودية - مكة المكرمة',
    18,
    false,
    '{"registration":{"completed":true,"completedAt":"2026/09/25 - 08:35 ص"},"exam":{"completed":true,"completedAt":"2026/09/25 - 09:20 ص"},"scoring":{"completed":true,"completedAt":"2026/09/25 - 10:00 ص"},"aggregation":{"completed":true,"completedAt":"2026/09/25 - 10:30 ص"},"review":{"completed":false},"sheet":{"completed":false},"accreditation":{"completed":false},"announcement":{"completed":false},"ceremony":{"completed":false}}'::jsonb,
    '1445-09-12',
    '08:35 ص',
    '{"id":"2","committeeNumber":2,"committeeName":"لجنة كتاب التوحيد - رجال","courseId":"course-summer-1447","courseName":"دورة الصيف 1447هـ - متون العقيدة والتوحيد","studentsCount":18,"sheikhName":"فضيلة الشيخ عبد الرحمن بن صالح الغامدي"}'::jsonb
  ),
  (
    '3',
    3,
    'لجنة القواعد الأربع - ناشئة',
    'مقرأة الإمام الشاطبي',
    '["فضيلة الشيخ محمود بن إبراهيم الشافعي", "الشيخ أنس بن عمر"]'::jsonb,
    'فرع الناشئة دون 15 سنة',
    'مسابقة كتاب القواعد الأربع',
    'تم الانتهاء من تصحيح أوراق 10 طلاب، متبقي 5 طلاب قيد المراجعة والتدقيق.',
    'course-summer-1447',
    'دورة الصيف 1447هـ - متون العقيدة والتوحيد',
    'فضيلة الشيخ محمود بن إبراهيم الشافعي',
    '+20 102 345 6789',
    'مصر - الإسكندرية',
    15,
    false,
    '{"registration":{"completed":true,"completedAt":"2026/09/25 - 08:40 ص"},"exam":{"completed":true,"completedAt":"2026/09/25 - 09:25 ص"},"scoring":{"completed":false},"aggregation":{"completed":false},"review":{"completed":false},"sheet":{"completed":false},"accreditation":{"completed":false},"announcement":{"completed":false},"ceremony":{"completed":false}}'::jsonb,
    '1445-09-12',
    '08:40 ص',
    '{"id":"3","committeeNumber":3,"committeeName":"لجنة القواعد الأربع - ناشئة","courseId":"course-summer-1447","courseName":"دورة الصيف 1447هـ - متون العقيدة والتوحيد","studentsCount":15,"sheikhName":"فضيلة الشيخ محمود بن إبراهيم الشافعي"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  committee_name = EXCLUDED.committee_name,
  course_id = EXCLUDED.course_id,
  course_name = EXCLUDED.course_name,
  sheikh_name = EXCLUDED.sheikh_name,
  students_count = EXCLUDED.students_count;

-- سادساً: الإشعارات وسجلات الأمان (Notifications & Audit Logs)
INSERT INTO notifications (id, title, description, type, read, committee_id, created_at)
VALUES
  ('notif-1', 'طلب تدقيق في لجنة القواعد الأربع (#3)', 'تم إحالة ورقة الإجابة للمراجعة للتأكد من رصد درجات شرح القاعدة الثالثة.', 'urgent', false, '3', NOW() - INTERVAL '5 minutes'),
  ('notif-2', 'اكتمال الحفل للجنة لمعة الاعتقاد (#5)', 'تم تتويج الفائزين وتسليم الدروع في الحفل الختامي بمسجد البخاري.', 'success', false, '5', NOW() - INTERVAL '20 minutes'),
  ('notif-3', 'بدء امتحان لجنة الأصول الثلاثة (ب)', 'لجنة #6 في وضع "جاري الامتحان الآن" في القاعة الغربية.', 'info', true, '6', NOW() - INTERVAL '35 minutes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO audit_logs (id, user_name, user_role, action, details, status)
VALUES
  ('log-1', 'المشرف العام (د. أحمد المنشاوي)', 'super_admin', 'دخول النظام وتأكيد ربط قاعدة بيانات سوبابيز', 'تم التحقق بنجاح من جداول قاعدة بيانات سوبابيز والاتصال المشفر TLS 1.3', 'success'),
  ('log-2', 'الشيخ عبد الله الدوسري (معلم)', 'committee_head', 'اعتماد جاهزية امتحان القاعة الكبرى', 'تم اعتماد جاهزية لجنة 1 وكراسات الأسئلة', 'success'),
  ('log-3', 'أ. معاذ العتيبي (معاون)', 'assistant', 'رصد درجات لجنة رقم 1 - متن الأجرومية', 'تم حفظ الدرجات وتحديث السجلات في سوبابيز', 'success'),
  ('log-4', 'النظام الآلي', 'system', 'مزامنة وتفعيل المخطط الشامل لقاعدة البيانات', 'تم إنشاء وتحديث الجداول والفهارس والمحفزات في سوبابيز تلقائياً', 'success')
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_settings (key, value, description)
VALUES
  (
    'app_info',
    '{"appName":"منظومة إدارة لجان مسابقات مسجد البخاري","version":"2.5.0","environment":"production","database":"Supabase PostgreSQL"}'::jsonb,
    'المعلومات الأساسية للنظام'
  ),
  (
    'database_config',
    '{"engine":"Supabase PostgreSQL Cloud","pool_ssl":true,"tablesCount":9,"status":"active"}'::jsonb,
    'إعدادات ومواصفات قاعدة البيانات'
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- نهاية المخطط الشامل لقاعدة البيانات
