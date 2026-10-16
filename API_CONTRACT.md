# 📜 عقد واجهات برمجة التطبيقات (API Contract)
## Bukhari Competition System - Client & Server API Contract (v1.0.0)

هذا المستند يمثل العقد الرسمي والمطابق للكود بين السيرفر (Express) والعملاء (Web و Android).
أي تعديل في شكل الطلب أو الاستجابة يجب توثيقه هنا فوراً مع المحافظة على التوافقية العكسية (Backward Compatibility).

---

## 1. التوثيق والمصادقة (Authentication & Authorization)

يتم تمرير هوية المستخدم وصلاحياته عبر الترويسات (Headers):
- `x-user-id`: معرف المستخدم في جدول `app_users` (مثال: `user-admin`).
- `x-user-role`: دور المستخدم في النظام (`super_admin` | `committee_head` | `teacher` | `assistant` | `auditor`).
- `x-user-committees`: أرقام اللجان المسندة إليه بصيغة JSON array (مثال: `[1, 2, 3]`).
- اختياري: `Authorization: Bearer <token>`.

### الأدوار والصلاحيات (Roles Matrix):
1. **`super_admin`**: صلاحيات كاملة 100% لجميع المسارات والعمليات (قراءة، كتابة، حذف، إدارة النظام وقاعدة البيانات).
2. **`committee_head`**: إدارة لجان الاختبار المسندة إليه فقط، مراجعة وتدقيق الدرجات، اعتماد جاهزية الامتحانات، الاطلاع على بنك الامتحانات. (ممنوع من تعديل لجان غير مسندة 403).
3. **`teacher`**: رصد درجات الطلاب، تصحيح الأسئلة، فحص جاهزية الامتحانات للجان المسندة فقط.
4. **`assistant`**: استلام اللجان الميدانية، فحص جاهزية القاعات، رصد الحضور والتسليم للجان المسندة فقط.
5. **`auditor`**: صلاحية قراءة واستعراض فقط (GET) لجميع اللجان والتقارير والإحصائيات وسجلات التدقيق (ممنوع من أي عملية POST/PUT/PATCH/DELETE 403).

---

## 2. المسارات ومصفوفة الصلاحيات (Endpoints & Permissions)

| المسار | الطريقة | الصلاحية المطلوبة (Action) | الأدوار المسموح بها | التقييد باللجنة المسندة |
| :--- | :--- | :--- | :--- | :--- |
| `/api/courses` | GET | `COURSES_READ` | الكل (super_admin, committee_head, teacher, assistant, auditor) | لا |
| `/api/courses` | POST | `COURSES_WRITE` | super_admin فقط | لا |
| `/api/courses/:id` | DELETE | `COURSES_DELETE` | super_admin فقط | لا |
| `/api/committees` | GET | `COMMITTEES_READ` | الكل | لا (يتم إرجاع الكل أو المفلتر) |
| `/api/committees` | POST | `COMMITTEES_WRITE` | super_admin, committee_head, teacher, assistant | **نعم** (403 إذا لم تكن اللجنة مسندة لغير super_admin) |
| `/api/committees/bulk` | POST | `COMMITTEES_WRITE` | super_admin فقط | لا |
| `/api/committees/:id` | DELETE | `COMMITTEES_DELETE` | super_admin فقط | لا |
| `/api/users` | GET | `USERS_READ` | الكل (لأغراض التعيين والاستعراض) | لا |
| `/api/users` | POST | `USERS_WRITE` | super_admin فقط (أو التسجيل الذاتي) | لا |
| `/api/users/:id` | DELETE | `USERS_DELETE` | super_admin فقط | لا |
| `/api/exams` | GET | `EXAMS_READ` | الكل | لا |
| `/api/exams` | POST | `EXAMS_WRITE` | super_admin, committee_head | لا |
| `/api/exams/:id` | DELETE | `EXAMS_DELETE` | super_admin فقط | لا |
| `/api/tasks` | GET | `TASKS_READ` | الكل | لا |
| `/api/tasks` | POST | `TASKS_WRITE` | super_admin, committee_head, assistant | لا |
| `/api/tasks/:id/toggle` | PATCH | `TASKS_WRITE` | super_admin, committee_head, assistant | **نعم** (إذا كانت المهمة مرتبطة بلجنة محددة) |
| `/api/tasks/:id` | DELETE | `TASKS_DELETE` | super_admin, committee_head | لا |
| `/api/scoring` | GET | `SCORING_READ` | الكل | لا |
| `/api/scoring` | POST | `SCORING_WRITE` | super_admin, committee_head, teacher, assistant | **نعم** (403 إذا لم تكن اللجنة مسندة) |
| `/api/notifications` | GET | `NOTIFICATIONS_READ` | الكل | لا |
| `/api/notifications` | POST | `NOTIFICATIONS_WRITE` | super_admin, assistant, committee_head | لا |
| `/api/notifications/:id/read` | PATCH | `NOTIFICATIONS_WRITE` | الكل | لا |
| `/api/audit-logs` | GET | `AUDIT_LOGS_READ` | super_admin, auditor | لا |
| `/api/audit-logs` | POST | `AUDIT_LOGS_WRITE` | الكل (لتسجيل الأحداث) | لا |
| `/api/database/*` | ALL | `DATABASE_ADMIN` | super_admin فقط | لا |

---

## 3. التعامل مع التعارض (Optimistic Concurrency Control - 409)

لتفادي فقدان التعديلات المتزامنة بين أعضاء اللجان والمشرفين:
- في `POST /api/committees`: يمكن تمرير الحقل الاختياري `expectedUpdatedAt`.
- إذا كانت قيمة `updated_at` في قاعدة البيانات أحدث من `expectedUpdatedAt` المرسلة، يرفض السيرفر الطلب برمز **`409 Conflict`** مع محتوى الكائن الحالي في قاعدة البيانات:
```json
{
  "success": false,
  "error": "conflict",
  "message": "تم تعديل هذه البيانات بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً.",
  "currentUpdatedAt": "2026-10-16T12:00:00.000Z",
  "currentData": { ... }
}
```
- ينطبق نفس المبدأ على `app_users`، وعلى `exams` و `schedule_tasks` (وفق المهمة 2).

---

## 4. الترقيم (Pagination)

يدعم السيرفر الترقيم الاختياري عبر الاستعلام: `?limit=20&offset=0`.
عند تمرير `limit` أو `offset`، تعود الاستجابة بالشكل التالي:
```json
{
  "success": true,
  "total": 120,
  "limit": 20,
  "offset": 0,
  "hasMore": true,
  "<itemsKey>": [ ... ]
}
```
عند عدم تمرير معلمات الترقيم، تعود الاستجابة بالقائمة الكاملة حفاظاً على التوافقية العكسية لتطبيق الأندرويد.
