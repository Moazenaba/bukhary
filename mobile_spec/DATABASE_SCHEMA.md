# 🗄️ مخطط قاعدة البيانات السحابية (DATABASE_SCHEMA.md)
## Bukhari Competition Mobile App - Supabase PostgreSQL Schema Specification

قاعدة البيانات مستضافة على **Supabase PostgreSQL** وتعتمد على الاتصال المباشر والـ REST API. هذا المخطط يوضح الجداول الـ 9 وحقولها وأنواع بياناتها.

---

## 1. ملخص الجداول (Tables Summary)

| اسم الجدول | الوصف | المفتاح الأساسي |
| :--- | :--- | :--- |
| **`courses`** | الدورات العلمية الصيفية والشتوية | `id` (VARCHAR) |
| **`committees`** | اللجان الميدانية وحالات المراحل التسع | `id` (VARCHAR) |
| **`app_users`** | المستخدمون، المشرفون، المعلمون، المعاونون | `id` (VARCHAR) |
| **`exams`** | بنك الامتحانات ونماذج الـ PDF | `id` (VARCHAR) |
| **`schedule_tasks`** | تقويم وجدول المهام والتسليم الميداني | `id` (VARCHAR) |
| **`scoring_records`** | سجلات رصد درجات الأسئلة والطلاب | `id` (VARCHAR) |
| **`audit_logs`** | سجلات الأمان والتدقيق وتتبع العمليات | `id` (VARCHAR) |
| **`notifications`** | الإشعارات والتنبيهات الميدانية | `id` (VARCHAR) |
| **`system_settings`** | إعدادات المنظومة العامة والربط | `key` (VARCHAR) |

---

## 2. تفصيل الجداول والحقول (Table Schemas)

### 1. جدول الدورات (`courses`)
```sql
CREATE TABLE courses (
  id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT,                               -- صيفية / شتوية / رمضانية
  year TEXT,                                 -- 1447هـ / 2026م
  start_date TEXT,                           -- YYYY-MM-DD
  end_date TEXT,                             -- YYYY-MM-DD
  status VARCHAR(50) DEFAULT 'active',       -- active, completed, upcoming
  description TEXT,
  target_committees_count INT DEFAULT 30,
  is_default BOOLEAN DEFAULT false,          -- الدورة الحالية المفعلة تلقائياً
  created_at TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. جدول اللجان (`committees`)
```sql
CREATE TABLE committees (
  id VARCHAR(255) PRIMARY KEY,
  committee_number INT,                      -- رقم اللجنة التسلسلي (1, 2, 3...)
  committee_name TEXT NOT NULL,              -- اسم اللجنة
  association_name TEXT,                     -- اسم الجمعية أو المصلى
  members JSONB DEFAULT '[]'::jsonb,         -- أعضاء اللجنة
  branch TEXT,                               -- الفرع
  competition_book TEXT,                     -- الكتاب المقرر
  general_notes TEXT,                        -- ملاحظات عامة
  course_id VARCHAR(255),                    -- معرف الدورة المرتبطة
  course_name TEXT,                          -- اسم الدورة
  sheikh_name TEXT,                          -- اسم الشيخ
  sheikh_phone TEXT,                         -- هاتف الشيخ
  sheikh_country TEXT,                       -- دولة/مدينة الشيخ
  students_count INT DEFAULT 0,              -- عدد الطلاب
  is_women_committee BOOLEAN DEFAULT false,  -- لجنة نسائية أم رجال
  stages JSONB NOT NULL DEFAULT '{}'::jsonb, -- سجل حالات المراحل التسع (انظر أدناه)
  scoring_details JSONB DEFAULT '{}'::jsonb, -- تفاصيل ومصححو الأسئلة
  aggregation_details JSONB DEFAULT '{}'::jsonb, -- تفاصيل تجميع الدرجات
  ceremony_details JSONB DEFAULT '{}'::jsonb,    -- تفاصيل موعد ومكان الحفل والشيوخ
  received_by_assistant JSONB,               -- توثيق استلام المعاون
  exam_approved_by JSONB,                   -- توثيق اعتماد الامتحان
  created_date TEXT,
  created_at_time TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### هيكل حقل `stages` داخل `committees`:
```json
{
  "registration": { "completed": true, "completedAt": "2026/09/25 - 08:30 ص" },
  "exam": { "completed": true, "completedAt": "2026/09/25 - 09:15 ص" },
  "scoring": { "completed": true, "completedAt": "2026/09/25 - 09:50 ص" },
  "aggregation": { "completed": false },
  "review": { "completed": false },
  "sheet": { "completed": false },
  "accreditation": { "completed": false },
  "announcement": { "completed": false },
  "ceremony": { "completed": false }
}
```

### 3. جدول المستخدمين والمعاونين (`app_users`)
```sql
CREATE TABLE app_users (
  id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  password TEXT,
  passport_number TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'assistant', -- super_admin, committee_head, teacher, assistant, auditor
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  assigned_committees JSONB DEFAULT '[]'::jsonb, -- [1, 2, 5]
  permissions JSONB DEFAULT '[]'::jsonb,         -- ["database_sheets", "manage_committees"...]
  created_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  notes TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4. جدول الامتحانات (`exams`)
```sql
CREATE TABLE exams (
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
```

### 5. جدول المهام والتقويم (`schedule_tasks`)
```sql
CREATE TABLE schedule_tasks (
  id VARCHAR(255) PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,                        -- YYYY-MM-DD
  time TEXT,                                 -- 09:30 ص
  committee_id VARCHAR(255),
  committee_number INT,
  assigned_assistant_id VARCHAR(255),
  assigned_assistant_name TEXT,
  type VARCHAR(50) DEFAULT 'general',        -- delivery, receive, exam, scoring, review, ceremony, general
  priority VARCHAR(50) DEFAULT 'normal',     -- urgent, high, normal
  completed BOOLEAN DEFAULT false,
  completed_at TEXT,
  deliverable TEXT,                          -- ما يلزم تسليمه
  notes TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 6. جدول الإشعارات (`notifications`)
```sql
CREATE TABLE notifications (
  id VARCHAR(255) PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type VARCHAR(50) DEFAULT 'info',           -- urgent, info, success
  read BOOLEAN DEFAULT false,
  committee_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);
```
