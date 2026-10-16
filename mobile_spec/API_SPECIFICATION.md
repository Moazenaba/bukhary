# 🌐 توثيق واجهات برمجة التطبيقات (API_SPECIFICATION.md)
## Bukhari Competition Mobile App - REST API Endpoints & Payloads

التطبيق يتصل بالخادم عبر بروتوكول **REST API (JSON)**. جميع المسارات تبدأ بـ `/api`.

---

## 1. الدورات العلمية (Courses API)

### `GET /api/courses`
- **الوصف**: جلب قائمة كافة الدورات مرتبة بالافتراضية ثم الأحدث.
- **الاستجابة (200 OK)**:
```json
{
  "success": true,
  "courses": [
    {
      "id": "course-summer-1447",
      "name": "دورة الصيف 1447هـ - متون العقيدة والتوحيد",
      "season": "صيفية",
      "year": "1447هـ / 2026م",
      "startDate": "2026-09-01",
      "endDate": "2026-10-30",
      "status": "active",
      "isDefault": true,
      "targetCommitteesCount": 30,
      "description": "الدورة الرئيسية الحالية بمسجد البخاري...",
      "createdAt": "2026-09-01"
    }
  ]
}
```

### `POST /api/courses`
- **الوصف**: إنشاء أو تحديث دورة علمية.
- **جسم الطلب (Body)**: كائن دورة كامل (`Course` Object).
- **الاستجابة (200 OK)**: `{ "success": true, "course": { ... } }`.

### `DELETE /api/courses/:id`
- **الوصف**: حذف دورة علمية.
- **الاستجابة (200 OK)**: `{ "success": true }`.

---

## 2. اللجان الميدانية (Committees API)

### `GET /api/committees`
- **الوصف**: جلب كافة اللجان مرتبة برقم اللجنة.
- **الاستجابة (200 OK)**:
```json
{
  "success": true,
  "committees": [
    {
      "id": "1",
      "committeeNumber": 1,
      "committeeName": "لجنة الأصول الثلاثة (المجموعة أ)",
      "associationName": "جمعية مسجد البخاري للعلوم الشرعية",
      "members": ["فضيلة الشيخ د. أحمد المنشاوي"],
      "branch": "فرع الطلاب المتقدمين",
      "competitionBook": "مسابقة كتاب الأصول الثلاثة",
      "generalNotes": "تم اختبار 14 طالباً...",
      "courseId": "course-summer-1447",
      "courseName": "دورة الصيف 1447هـ - متون العقيدة والتوحيد",
      "sheikhName": "فضيلة الشيخ د. أحمد بن محمد المنشاوي",
      "sheikhPhone": "+20 100 123 4567",
      "sheikhCountry": "مصر - القاهرة",
      "studentsCount": 22,
      "isWomenCommittee": false,
      "stages": {
        "registration": { "completed": true, "completedAt": "2026/09/25 - 08:30 ص" },
        "exam": { "completed": true, "completedAt": "2026/09/25 - 09:15 ص" },
        "scoring": { "completed": true, "completedAt": "2026/09/25 - 09:50 ص" },
        "aggregation": { "completed": false },
        "review": { "completed": false },
        "sheet": { "completed": false },
        "accreditation": { "completed": false },
        "announcement": { "completed": false },
        "ceremony": { "completed": false }
      },
      "createdDate": "1445-09-12",
      "createdAtTime": "08:30 ص"
    }
  ]
}
```

### `POST /api/committees`
- **الوصف**: إنشاء أو تعديل لجنة مع كافة مراحلها وتفاصيل الشيخ.
- **الاستجابة (200 OK)**: `{ "success": true, "committee": { ... } }`.

### `DELETE /api/committees/:id`
- **الوصف**: حذف لجنة بالكامل.
- **الاستجابة (200 OK)**: `{ "success": true }`.

---

## 3. المستخدمون والمعاونون (Users API)

### `GET /api/users`
- **الوصف**: جلب قائمة المستخدمين والمعاونين وطلبات الانضمام.
- **الاستجابة (200 OK)**: `{ "success": true, "users": [ ... ] }`.

### `POST /api/users`
- **الوصف**: حفظ مستخدم، اعتماد طلب انضمام، أو تعديل الصلاحيات واللجان المسندة.

### `DELETE /api/users/:id`
- **الوصف**: حذف مستخدم أو رفض طلب انضمام.

---

## 4. بنك الامتحانات (Exams API)

- `GET /api/exams`: جلب قائمة نماذج الامتحانات.
- `POST /api/exams`: رفع/إضافة نموذج امتحان جديد.
- `DELETE /api/exams/:id`: حذف نموذج امتحان.

---

## 5. جدول المهام والتقويم (Schedule Tasks API)

- `GET /api/tasks`: جلب كافة المهام مرتبة بالموعد والتوقيت.
- `POST /api/tasks`: جدولة مهمة جديدة في التقويم.
- `PATCH /api/tasks/:id/toggle`: تبديل حالة إنجاز المهمة (`completed: boolean`).
- `DELETE /api/tasks/:id`: حذف مهمة من التقويم.

---

## 6. الإشعارات (Notifications API)

- `GET /api/notifications`: جلب آخر 50 إشعاراً ميدانياً.
- `PATCH /api/notifications/:id/read`: تعليم الإشعار كمقروء.

---

## 7. فحص وحالة قاعدة البيانات (Database Status API)

### `GET /api/database/test`
- **الوصف**: فحص حي ومباشر للاتصال بسوبابيز مع بيان عدد الجداول والسجلات وسرعة الاستجابة.
```json
{
  "success": true,
  "message": "تم الاتصال بقاعدة بيانات سوبابيز بنجاح تام! ✓",
  "connection": {
    "host": "aws-1-eu-west-1.pooler.supabase.com",
    "port": "6543",
    "database": "postgres",
    "user": "postgres",
    "latencyMs": 18,
    "tablesCount": 9,
    "tables": [
      { "name": "committees", "count": 8 },
      { "name": "courses", "count": 3 },
      { "name": "app_users", "count": 5 },
      { "name": "exams", "count": 4 },
      { "name": "schedule_tasks", "count": 4 }
    ]
  }
}
```
