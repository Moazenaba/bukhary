# عقد واجهات برمجة التطبيقات (API Contract) — منظومة مسجد الإمام البخاري

السيرفر واحد (`Web/server.ts`) ويخدم تطبيق الويب وتطبيق الأندرويد معاً على قاعدة بيانات Supabase واحدة.
هذه الوثيقة مطابقة للكود في `Web/server/routes/*.ts` و`Web/server/policy.ts` بتاريخ 2026-10-16.
عند أي اختلاف، الكود هو المرجع، وتُحدَّث الوثيقة في نفس التعديل.

---

## ١. قواعد عامة

| البند | القيمة |
|---|---|
| المسار الأساسي | `/api` على نفس نطاق الويب. في الإنتاج **HTTPS فقط** (تطبيق الأندرويد يرفض بناء release بعنوان غير https). |
| نوع المحتوى | `application/json` لكل الطلبات، ما عدا رفع ملف الامتحان (`application/pdf` خام). |
| حجم الطلب | 1 ميجابايت للـ JSON، و15 ميجابايت لمسار استخراج الجدول، و20 ميجابايت لملف PDF. |
| المصادقة | `Authorization: Bearer <accessToken>` لكل المسارات عدا المذكورة كعامة. |
| الحقول غير المعروفة | تُحذف بصمت (لا يُخزَّن أي حقل خارج المخطط). |
| المعرّفات | يرسلها العميل (UUID مقترح). نفس `id` في `POST` = تعديل للسجل الموجود (upsert). |

### صيغة الأخطاء

كل خطأ يرجع JSON بهذا الشكل، ومعه `requestId` للبحث في سجلات السيرفر:

```json
{ "success": false, "message": "رسالة عربية للمستخدم", "code": "اختياري", "errors": [{ "path": "field", "message": "..." }], "requestId": "uuid" }
```

| الحالة | المعنى |
|---|---|
| 400 | بيانات غير صحيحة (`errors` تحدد الحقل). |
| 401 | لا توجد جلسة أو انتهت. العميل يجدد التوكن مرة واحدة ثم يُخرج المستخدم. |
| 403 | الدور أو الصلاحية لا تسمح، أو اللجنة خارج اللجان المسندة. |
| 404 | السجل أو المسار غير موجود (المسارات غير المعروفة تحت `/api` ترجع JSON وليس صفحة HTML). |
| 409 | تعارض: رقم مكرر، أو السجل عُدِّل من مستخدم آخر بعد آخر قراءة (انظر «التعارض» أدناه). |
| 413 | حجم الطلب أكبر من المسموح. |
| 429 | محاولات كثيرة (الدخول: 30 كل 15 دقيقة، التسجيل: 10 كل ساعة، تتبع الطلب: 30 كل 15 دقيقة). |
| 500 | خطأ غير متوقع؛ الرسالة عامة ولا تكشف تفاصيل داخلية. |

### التعارض (Optimistic concurrency)

اللجان والمستخدمون يحملون `updatedAt`. عند الحفظ الكامل يرسل العميل `expectedUpdatedAt` = آخر `updatedAt` قرأه.
إذا تغيّر السجل على السيرفر بعدها يرجع **409** ولا يُكتب شيء؛ العميل يعيد التحميل ويعرض التعديل الأحدث.
الإرسال بدون `expectedUpdatedAt` مسموح (إنشاء جديد، أو عميل قديم) لكنه يكتب فوق الموجود.

### التواريخ

| الحقل | النوع المُخزَّن | الصيغة في الـ API |
|---|---|---|
| `courses.startDate/endDate`, `committees.createdDate`, `tasks.date` | `date` | `YYYY-MM-DD` (يُقبل `YYYY/MM/DD` ويُحوَّل). أي قيمة أخرى ⇒ 400. |
| `createdAt`, `approvedAt`, `uploadedAt`, `completedAt`, `updatedAt` | `timestamptz` | ISO 8601 بتوقيت UTC، مثل `2026-10-16T11:49:12.882Z`. |
| `committees.createdAtTime`, `tasks.time` | نص | وقت للعرض فقط، مثل `08:00 ص`. |

### الترقيم (Pagination)

`GET /api/committees` و`GET /api/tasks` يقبلان `?limit=1..500&offset=0..`.
بدون `limit` ترجع القائمة كاملة كما كانت (العملاء الحاليون لا يتأثرون)، ويكون `total: null` و`hasMore: false`.
مع `limit` ترجع `total` (العدد الكلي) و`hasMore`. سجل التدقيق يستخدم `?before=<ISO>&limit=` بدلاً من ذلك.

---

## ٢. الأدوار والصلاحيات

الأدوار: `super_admin` (المشرف العام)، `committee_head` (رئيس لجنة)، `teacher` (مصحح)، `assistant` (معاون)، `auditor` (مدقق).
«المديرون» في الجدول = `super_admin` و`committee_head`.

القاعدة: الدور يجب أن يكون ضمن الأدوار المسموحة **و**، لغير المشرف العام، أن يملك إحدى الصلاحيات المذكورة
(إلا إذا كانت الصلاحية ممنوحة لدوره تلقائياً). الإجراءات «المقيّدة باللجنة» تُرفض بـ 403 إذا لم تكن اللجنة ضمن
`assignedCommittees` للمستخدم (المشرف العام غير مقيّد). المصدر: `server/policy.ts`، ويصل للعميل جاهزاً في `GET /api/auth/me`.

| الإجراء | الأدوار | الصلاحية المطلوبة | مقيّد باللجنة |
|---|---|---|---|
| `committees.read`, `courses.read`, `exams.read`, `tasks.read`, `books.read`, `summerRows.read` | كل مستخدم معتمد | — | — |
| `committees.create` | المديرون | `add_new_committee` | — |
| `committees.update`, `committees.delete` | المديرون | `manage_committees` | نعم |
| `committees.reception` (مرحلتا التسجيل والامتحان) | المديرون، `assistant` | `manage_committees` (ممنوحة للمعاون) | نعم |
| `committees.scoring` (التصحيح والتجميع والمراجعة) | المديرون، `teacher` | `manage_committees` (ممنوحة للمصحح) | نعم |
| `committees.finalize` (الكشف، الاعتماد، الإعلان، الحفل) | المديرون | `manage_committees` | نعم |
| `courses.write` | المديرون | `manage_courses` | — |
| `exams.write` (إنشاء، تعديل، رفع ملف) | المديرون | `exams_pdf` | — |
| `exams.file` (تنزيل ملف الأسئلة) | المديرون فقط | — | — |
| `exams.delete` | `super_admin` | — | — |
| `tasks.write` | الكل عدا `auditor` | `calendar_schedule` | — |
| `tasks.delete` | المديرون | `calendar_schedule` | — |
| `users.read`, `users.manage`, `profiles.read` | المديرون | `manage_assistants` | — |
| `users.delete`, `users.grant`, `profiles.write` | `super_admin` | — | — |
| `books.write` | المديرون | إحدى: `manage_courses`, `add_new_committee`, `exams_pdf` | — |
| `summerRows.write` | المديرون | إحدى: `database_sheets`, `manage_committees` | — |
| `scoring.read` | الكل عدا `assistant` | — | — |
| `scoring.write` | المديرون، `teacher` | `manage_committees` (ممنوحة للمصحح) | نعم |
| `notifications.create` | `super_admin` | — | — |
| `audit.read` | `super_admin`, `auditor` | — | — |
| `database.admin` | `super_admin` | — | — |
| `ocr.use` | المديرون | `database_sheets` | — |

هوية المنفّذ (اسم المصحح، من استلم اللجنة، من اعتمد، وقت الإنجاز) يضعها السيرفر من التوكن، ولا تُقبل من جسم الطلب.

---

## ٣. الصحة والجاهزية (عامة)

| الطلب | الاستجابة |
|---|---|
| `GET /api/health` | `200 {"status":"ok"}` — العملية تعمل. لا يلمس قاعدة البيانات. |
| `GET /api/ready` | `200 {"status":"ready"}` عند نجاح الاتصال بالقاعدة وعدم وجود ترحيلات معلّقة، وإلا `503`. |

---

## ٤. المصادقة `/api/auth`

| الطلب | عام؟ | الوصف |
|---|---|---|
| `POST /login` | نعم | `{ identifier, password }` (الهاتف أو البريد). يرجع `{ token, refreshToken, user }`. رسالة خطأ واحدة لكل حالات الفشل؛ قفل مؤقت بعد محاولات متكررة. |
| `POST /refresh` | نعم | `{ refreshToken }` ⇒ توكنات جديدة. التوكن القديم يُلغى (تدوير). |
| `POST /logout` | نعم | `{ refreshToken }` يُلغى. |
| `POST /register` | نعم | طلب انضمام: `{ name, phone, email?, password, roleKey, notes?, ... }`. الحساب يُنشأ `pending` ويرجع `requestCode` بالشكل `REQ-YYYY-XXXXXXXX`. `roleKey` طلب فقط (`assistant` / `teacher` / `committee_head` / `auditor`، وأي قيمة أخرى تصبح `assistant`). |
| `GET /join-status/:code` | نعم | حالة طلب الانضمام فقط: `{ status, interviewDate? }`. |
| `GET /me` | لا | `{ user, permissions }`. `permissions.actions` خريطة `إجراء ⇒ true/false` لإظهار وإخفاء الأزرار. |
| `POST /change-password` | لا | `{ currentPassword, newPassword }` ⇒ توكنات جديدة، وتُلغى كل الجلسات الأخرى. |

أرقام الهاتف تُقبل بالأرقام العربية (٠-٩) أو اللاتينية، مع مسافات أو شرطات، وتُخزَّن بأرقام لاتينية فقط (في التسجيل والدخول).
كلمة المرور: 8 أحرف على الأقل، وفيها حروف وأرقام لاتينية (0-9).

مدة توكن الوصول 8 ساعات. تغيير الدور أو الحالة أو كلمة المرور يُبطل التوكنات القديمة من الطلب التالي مباشرة.

---

## ٥. الموارد

### اللجان `/api/committees`

| الطلب | الإجراء | ملاحظات |
|---|---|---|
| `GET /` | `committees.read` | `{ committees, total, hasMore }`، مرتبة برقم اللجنة. |
| `POST /` | `committees.create` لجديد، `committees.update` لموجود | لجنة كاملة. `courseId` **مطلوب** ويجب أن يكون دورة موجودة. `committeeNumber` فريد داخل الدورة (409). |
| `POST /bulk` | نفس السابق لكل عنصر | `{ committees: [...] }` في معاملة واحدة: إما الكل أو لا شيء. |
| `PATCH /:id` | حسب الحقول | تعديل جزئي. `stages` تُدمج **مرحلة بمرحلة**، وكل مرحلة تتطلب إجراءها (`reception` / `scoring` / `finalize`). |
| `DELETE /:id` | `committees.delete` | |

### الدورات `/api/courses`

`GET /` (`courses.read`)، `POST /` (`courses.write`، upsert؛ دورة افتراضية واحدة فقط)، `DELETE /:id` (`courses.write`؛ يُرفض بـ 409 إذا كانت لها لجان).

### الامتحانات `/api/exams`

| الطلب | الإجراء | ملاحظات |
|---|---|---|
| `GET /` | `exams.read` | بيانات فقط مع `hasFile` وحجم الملف؛ **لا يرجع محتوى الملف أبداً**. |
| `GET /:id` | `exams.read` | امتحان واحد. |
| `POST /` | `exams.write` | upsert. `uploadedAt` بصيغة ISO أو تاريخ. |
| `PUT /:id/file` | `exams.write` | جسم الطلب = ملف PDF خام، `Content-Type: application/pdf`. يجب أن يبدأ بـ `%PDF-`، والحد 20 ميجابايت. |
| `GET /:id/file` | `exams.file` | تنزيل الملف (المديرون فقط). |
| `DELETE /:id/file` | `exams.write` | حذف الملف فقط. |
| `DELETE /:id` | `exams.delete` | |

### المهام `/api/tasks`

`GET /` (`tasks.read`، يدعم الترقيم)، `POST /` (`tasks.write`؛ `date` بصيغة `YYYY-MM-DD` إلزامي)،
`PATCH /:id/toggle` (`{ completed }`؛ يضع السيرفر `completedAt`)، `DELETE /:id` (`tasks.delete`).

### المستخدمون `/api/users`

| الطلب | الإجراء | ملاحظات |
|---|---|---|
| `GET /` | `users.read` | بدون كلمات المرور أو بيانات الدخول. |
| `POST /` | المستخدم لنفسه، أو `users.manage` | upsert مع `expectedUpdatedAt`. حساب جديد يحتاج كلمة مرور أولية. تغيير الدور أو الصلاحيات يتطلب `users.grant`. الرفض = `status: "rejected"` (لا حذف). لا يمكن إزالة آخر مشرف عام. **اعتماد** حساب دوره غير `assistant` (الدور المطلوب في طلب الانضمام) يتطلب `users.grant`، أي المشرف العام فقط. |
| `DELETE /:id` | `users.delete` | |

### الإشعارات `/api/notifications`

`GET /` (لكل مستخدم: العامة والموجهة له، مع حالة القراءة الخاصة به)، `POST /` (`notifications.create`)،
`PATCH /:id/read`، `POST /read-all`. حالة القراءة لكل مستخدم على حدة.

### رصد الدرجات `/api/scoring`

`GET /` (`scoring.read`)، `POST /` و`DELETE /:id` (`scoring.write`، مقيّد باللجنة؛ اسم المصحح من التوكن).

### كشف الدورة `/api/summer-course-rows`

`GET /?courseId=` (`summerRows.read`)، `POST /` و`POST /bulk` و`DELETE /:id` (`summerRows.write`). `bulk` في معاملة واحدة.

### الإعدادات المشتركة

| المسار | قراءة | كتابة وحذف |
|---|---|---|
| `/api/books` | `books.read` | `books.write` |
| `/api/permission-profiles` | `profiles.read` | `profiles.write` |
| `/api/custom-permissions` | أي مستخدم معتمد | `profiles.write` |

### الإدارة

| الطلب | الإجراء | ملاحظات |
|---|---|---|
| `GET /api/audit-logs?before=&limit=` | `audit.read` | سجل كل التعديلات (المنفّذ، الدور، الكيان، قبل/بعد). |
| `GET /api/database/status` | `database.admin` | أعداد السجلات الفعلية وزمن الاستجابة وحالة الترحيلات. |
| `POST /api/extract-table` | `ocr.use` | صورة جدول ⇒ صفوف (Gemini، النموذج من `GEMINI_MODEL`). |

---

## ٦. ما يلتزم به العملاء

- الويب: كل الطلبات عبر `src/services/api.ts`، والبيانات في ذاكرة TanStack Query مفتاحها المستخدم الحالي،
  وتُمسح عند الخروج.
- الأندرويد: القراءة من Room بعد المزامنة؛ الكتابة تمر بطابور `pending_ops` بالترتيب، مع `expectedUpdatedAt`
  للجان والمستخدمين. 409 و403 و400 تُعرض للمستخدم ولا تُعاد. أخطاء 5xx تُعاد حتى 5 مرات ثم تُركن للمراجعة.
  WorkManager يرسل الطابور عند عودة الشبكة حتى لو كان التطبيق مغلقاً.
