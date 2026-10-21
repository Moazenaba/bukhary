# عقد واجهات برمجة التطبيقات (API Contract) — منظومة مسجد الإمام البخاري

السيرفر واحد (`Web/server.ts`) ويخدم تطبيق الويب وتطبيق الأندرويد معاً على قاعدة بيانات Supabase واحدة.
هذه الوثيقة مطابقة للكود في `Web/server/routes/*.ts` و`Web/server/policy.ts` بتاريخ 2026-10-17.
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
| عميل الويب | يرسل `X-Client: web`. توكن التجديد عندها في كوكي `bukhari_rt` (HttpOnly، SameSite=Strict، المسار `/api/auth`) ولا يظهر في جسم الاستجابة. |
| إصدار الأندرويد | يرسل `X-App-Version-Code`. إذا كان أقدم من `MIN_ANDROID_VERSION_CODE` يرجع **426** `app_update_required`. |
| تكرار الكتابة | أي `POST/PUT/PATCH/DELETE` قد يحمل `Idempotency-Key` (8–100 حرف). نفس المفتاح لنفس الطلب يرجع الاستجابة الأولى دون تنفيذ ثانٍ (ترويسة `Idempotent-Replay: true`)؛ لطلب مختلف ⇒ 400. |

### صيغة الأخطاء

كل خطأ يرجع JSON بهذا الشكل، ومعه `requestId` للبحث في سجلات السيرفر:

```json
{ "success": false, "message": "رسالة عربية للمستخدم", "code": "اختياري", "errors": [{ "path": "field", "message": "..." }], "requestId": "uuid" }
```

| الحالة | المعنى |
|---|---|
| 400 | بيانات غير صحيحة (`errors` تحدد الحقل). |
| 401 | لا توجد جلسة أو انتهت. العميل يجدد التوكن مرة واحدة ثم يُخرج المستخدم. |
| 403 | الدور أو الصلاحية لا تسمح، أو اللجنة خارج اللجان المسندة، أو `password_change_required` بعد إعادة تعيين كلمة المرور. |
| 404 | السجل أو المسار غير موجود (المسارات غير المعروفة تحت `/api` ترجع JSON وليس صفحة HTML). |
| 409 | تعارض: رقم مكرر، أو السجل عُدِّل من مستخدم آخر بعد آخر قراءة (انظر «التعارض» أدناه). |
| 413 | حجم الطلب أكبر من المسموح. |
| 426 | إصدار تطبيق الأندرويد أقدم من المسموح؛ يجب التحديث. |
| 500 | خطأ غير متوقع؛ الرسالة عامة ولا تكشف تفاصيل داخلية. |

### التعارض (Optimistic concurrency)

اللجان والمستخدمون يحملون `updatedAt`. عند الحفظ الكامل يرسل العميل `expectedUpdatedAt` = آخر `updatedAt` قرأه.
إذا تغيّر السجل على السيرفر بعدها يرجع **409** ولا يُكتب شيء؛ العميل يعيد التحميل ويعرض التعديل الأحدث.
الإرسال بدون `expectedUpdatedAt` مسموح للحقول البسيطة، لكن **استبدال مستند كامل** (`scoringDetails` أو
`aggregationDetails` أو `ceremonyDetails` في `PATCH` أو في حفظ لجنة موجودة) بدونه يُرفض بـ 409.
التعديلات الصغيرة (سؤال واحد، مرحلة واحدة، الاستلام) تُرسل كإجراءات عبر `POST /api/committees/:id/actions`.
حفظ المستخدم الجزئي: الحقل غير المُرسَل يبقى كما هو (لا يُمسح).

### التواريخ

| الحقل | النوع المُخزَّن | الصيغة في الـ API |
|---|---|---|
| `courses.startDate/endDate`, `committees.createdDate`, `tasks.date` | `date` | `YYYY-MM-DD` (يُقبل `YYYY/MM/DD` ويُحوَّل). أي قيمة أخرى ⇒ 400. |
| `createdAt`, `approvedAt`, `uploadedAt`, `completedAt`, `updatedAt` | `timestamptz` | ISO 8601 بتوقيت UTC، مثل `2026-10-16T11:49:12.882Z`. وقت إتمام المرحلة ووقت رفع ملف الامتحان يضعهما الخادم؛ ما يرسله العميل يُتجاهل. |
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
(إلا إذا كانت الصلاحية ممنوحة لدوره تلقائياً). المصدر: `server/policy.ts`، ويصل للعميل جاهزاً في `GET /api/auth/me`.

**نطاق اللجان:** رئيس اللجنة والمعاون والمعلم يعملون على اللجان المسندة إليهم **بالمعرّف** (`assignedCommitteeIds`)،
لأن رقم اللجنة يتكرر بين الدورات، أو على كل اللجان إذا منحهم المشرف العام `allCommitteesAllowed`. `me.permissions.committeeScope`
= `"all"` أو قائمة المعرّفات، و`committeeNumbers` نفس النطاق بالأرقام للعرض. المشرف العام والمدقق غير مقيّدين باللجان.

**ملفات الامتحانات ومحتواها:** لغير المشرف العام تخضع لقائمة `allowedExamIds` إلا مع `allExamsAllowed`؛ `me.permissions.exams`
= `"all"` أو القائمة. من لا يحق له فتح الامتحان يرى بياناته دون الأسئلة النموذجية والملاحظات (`canOpen: false`).

**الصلاحيات المخصصة:** تسميات عرض فقط ولا تمنح شيئاً. الصلاحيات المخزنة هي صلاحيات النظام فقط؛ غيرها يُحذف
(أو يُرفض بـ 400 مع `STRICT_PERMISSION_IDS=true`).

| الإجراء | الأدوار | الصلاحية المطلوبة | مقيّد باللجنة |
|---|---|---|---|
| `committees.read`, `courses.read`, `exams.read`, `tasks.read`, `books.read`, `summerRows.read` | كل مستخدم معتمد | — | — |
| `committees.create` | المديرون | `add_new_committee` | — |
| `committees.update`, `committees.delete` | المديرون | `manage_committees` | نعم |
| `committees.reception` (مرحلتا التسجيل والامتحان) | المديرون، `assistant` | `manage_committees` (ممنوحة للمعاون) | نعم |
| `committees.scoring` (التصحيح والتجميع والمراجعة) | المديرون، `teacher` | `manage_committees` (ممنوحة للمصحح) | نعم (المعلم أيضاً) |
| `committees.finalize` (الكشف، الاعتماد، الإعلان، الحفل) | المديرون | `manage_committees` | نعم |
| `courses.write` | المديرون | `manage_courses` | — |
| `exams.write` (إنشاء، تعديل، رفع ملف) | المديرون | `exams_pdf` | — |
| `exams.file` (تنزيل ملف الأسئلة) | المديرون فقط | — | قائمة الامتحانات المسموحة |
| `exams.delete` | `super_admin` | — | — |
| `tasks.write` | الكل عدا `auditor` | `calendar_schedule` | نعم (مهام اللجان) |
| `tasks.delete` | المديرون | `calendar_schedule` | نعم |
| `users.read`, `users.manage`, `profiles.read` | المديرون | `manage_assistants` | رئيس اللجنة: المتقدمون ومعاونو لجانه فقط |
| `users.delete`, `users.grant`, `profiles.write` | `super_admin` | — | — |
| `books.write` | المديرون | إحدى: `manage_courses`, `add_new_committee`, `exams_pdf` | — |
| `summerRows.write` | المديرون | إحدى: `database_sheets`, `manage_committees` | — |
| `scoring.read` | الكل عدا `assistant` | — | — |
| `scoring.write` | المديرون، `teacher` | `manage_committees` (ممنوحة للمصحح) | نعم (المعلم أيضاً) |
| `notifications.create` | `super_admin` | — | — |
| `audit.read` | `super_admin`, `auditor` | — | — |
| `stats.read` (شاشة الإحصائيات) | الكل للقراءة | `progress_stats` (ممنوحة لرئيس اللجنة والمدقق) | — |
| `database.admin` | `super_admin` | — | — |
| `ocr.use` | المديرون | `database_sheets` | — |

هوية المنفّذ (اسم المصحح، من استلم اللجنة، من اعتمد، وقت الإنجاز) يضعها السيرفر من التوكن، ولا تُقبل من جسم الطلب.

---

## ٣. الصحة والجاهزية (عامة)

| الطلب | الاستجابة |
|---|---|
| `GET /api/health` | `200 {"status":"ok"}` — العملية تعمل. لا يلمس قاعدة البيانات. |
| `GET /api/ready` | `200 {"status":"ready"}` عند نجاح الاتصال بالقاعدة وعدم وجود ترحيلات معلّقة، وإلا `503` مع عدد الترحيلات المعلّقة فقط (أسماؤها عبر `npm run migrate -- status`). |

---

## ٤. المصادقة `/api/auth`

| الطلب | عام؟ | الوصف |
|---|---|---|
| `POST /login` | نعم | `{ identifier, password }` (الهاتف أو البريد). يرجع `{ token, user, permissions, mustChangePassword }` و`refreshToken` في الجسم للأندرويد أو في الكوكي للويب. رسالة واحدة لكل حالات الفشل، بما فيها الحساب الموقوف مؤقتاً. |
| `POST /refresh` | نعم | `{ refreshToken }` (أو كوكي الويب مع `X-Client: web`) ⇒ توكنات جديدة في نفس الجلسة. إعادة استخدام توكن مُدوَّر تُنهي الجلسة كلها، عدا نافذة 30 ثانية لكوكي الويب (تبويبان معاً). |
| `POST /logout` | نعم | يُنهي الجلسة فوراً: توكن الوصول يتوقف ويُلغى توكن التجديد. يُقرأ من الجسم أو الكوكي أو ترويسة `Authorization`. |
| `POST /register` | نعم | طلب انضمام: `{ name, phone, email?, password, roleKey, notes?, ... }`. الحساب يُنشأ `pending` ويرجع `requestCode` بالشكل `REQ-YYYY-XXXXXXXX`. `roleKey` طلب فقط (`assistant` / `teacher` / `committee_head` / `auditor`، وأي قيمة أخرى تصبح `assistant`). |
| `GET /join-status/:code` | نعم | حالة طلب الانضمام فقط: `{ status, interviewDate? }`. |
| `GET /me` | لا | `{ user, permissions, mustChangePassword }`. `permissions.actions` خريطة `إجراء ⇒ true/false`، و`committeeScope` و`exams` كما في القسم ٢. |
| `POST /change-password` | لا | `{ currentPassword, newPassword }` ⇒ جلسة جديدة، وتُنهى كل الجلسات الأخرى ويُلغى طلب تغيير كلمة المرور. |

أرقام الهاتف تُقبل بالأرقام العربية (٠-٩) أو اللاتينية، مع مسافات أو شرطات، وتُخزَّن بأرقام لاتينية فقط (في التسجيل والدخول).
كلمة المرور: 8 أحرف على الأقل، وفيها حروف وأرقام.

مدة توكن الوصول 15 دقيقة افتراضياً (`ACCESS_TOKEN_TTL`)، ويحمل معرّف الجلسة (`sid`). تغيير الدور أو الصلاحيات أو اللجان
أو الحالة أو كلمة المرور يُنهي كل جلسات المستخدم من الطلب التالي مباشرة.

بعد إعادة تعيين كلمة المرور من المشرف العام (`mustChangePassword: true`) لا يعمل إلا `GET /me` و`POST /change-password`
و`POST /logout`؛ غيرها ⇒ 403 `password_change_required` (يُعطَّل بـ `ENFORCE_PASSWORD_CHANGE=false`).

---

## ٥. الموارد

### اللجان `/api/committees`

| الطلب | الإجراء | ملاحظات |
|---|---|---|
| `GET /` | `committees.read` | `{ committees, total, hasMore }`، مرتبة برقم اللجنة. |
| `POST /` | `committees.create` لجديد، `committees.update` لموجود | لجنة كاملة. `courseId` **مطلوب** ويجب أن يكون دورة موجودة. `committeeNumber` فريد داخل الدورة (409). |
| `POST /bulk` | نفس السابق لكل عنصر | `{ committees: [...] }` في معاملة واحدة: إما الكل أو لا شيء. |
| `PATCH /:id` | حسب الحقول | تعديل جزئي (للعملاء القدامى). `stages` تُدمج مرحلة بمرحلة بوقت الخادم؛ المستندات الكاملة تحتاج `expectedUpdatedAt`. |
| `POST /:id/actions` | حسب الإجراء | `{ action, expectedUpdatedAt? }` حيث `action.type` أحد: `receive`, `cancelReception`, `approveReadiness`, `revokeReadiness` (`committees.reception`)؛ `completeStage`, `reopenStage` مع `stage` (إجراء المرحلة؛ **بالترتيب**: لا تُتم مرحلة قبل سابقتها ولا تُلغى قبل لاحقتها ⇒ 400)؛ `updateQuestion` (`questionId`, `completed?`, `scorers?`, `score?`, `notes?`)، `updateAggregation` (`committees.scoring`)؛ `scheduleCeremony` (`ceremonyDate` بصيغة `YYYY-MM-DD` أو `null`، `committees.finalize`). الخادم يضع المنفّذ والوقت، ويُنشئ/ينقل/يحذف مهمة التقويم الوحيدة للحفل (`task-ceremony-<id>`) ويُتمها مع مرحلة الحفل. |
| `DELETE /:id` | `committees.delete` | |

### الدورات `/api/courses`

`GET /` (`courses.read`)، `POST /` (`courses.write`، upsert؛ دورة افتراضية واحدة فقط)، `DELETE /:id` (`courses.write`؛ يُرفض بـ 409 إذا كانت لها لجان).

### الامتحانات `/api/exams`

| الطلب | الإجراء | ملاحظات |
|---|---|---|
| `GET /` | `exams.read` | بيانات فقط مع `hasFile` وحجم الملف؛ **لا يرجع محتوى الملف أبداً**. |
| `GET /:id` | `exams.read` | امتحان واحد. |
| `POST /` | `exams.write` | upsert. `uploadedAt` يُتجاهل؛ الخادم يضعه، ويحدّثه عند رفع الملف. |
| `PUT /:id/file` | `exams.write` | جسم الطلب = ملف PDF خام، `Content-Type: application/pdf`. يجب أن يبدأ بـ `%PDF-`، والحد 20 ميجابايت. |
| `GET /:id/file` | `exams.file` | تنزيل الملف (المديرون، ضمن قائمة الامتحانات المسموحة). اسم ملف غير صالح في `X-File-Name` عند الرفع ⇒ 400. |
| `DELETE /:id/file` | `exams.write` | حذف الملف فقط. |
| `DELETE /:id` | `exams.delete` | |

### المهام `/api/tasks`

`GET /` (`tasks.read`، يدعم الترقيم)، `POST /` (`tasks.write`؛ `date` تاريخ حقيقي بصيغة `YYYY-MM-DD` إلزامي؛ اللجنة
والمكلف **بالمعرّف**: `committeeId` و`assignedAssistantId`، والخادم يضع الرقم والاسم ويرسل تنبيهاً للمكلف. المستخدم المحكوم
باللجان لا يكتب مهمة لجنة خارج نطاقه ولا يكلف شخصاً خارجه)، `PATCH /:id/toggle` (`{ completed }`؛ للمكلف أو لصاحب
`tasks.write` ضمن نطاقه؛ يضع السيرفر `completedAt`)، `DELETE /:id` (`tasks.delete`).

### المستخدمون `/api/users`

| الطلب | الإجراء | ملاحظات |
|---|---|---|
| `GET /` | `users.read` | بدون كلمات المرور. رئيس اللجنة يرى نفسه والمتقدمين ومعاوني لجانه فقط. |
| `GET /assignable` | `tasks.write` | `{ users: [{ id, name, role }] }`: من يمكن تكليفه بمهمة، ضمن لجان المستخدم. |
| `POST /` | المستخدم لنفسه، أو `users.manage` | upsert مع `expectedUpdatedAt`. الحقول غير المرسلة تبقى. لا أحد يغيّر دوره أو صلاحياته أو لجانه أو حالته بنفسه. الدور والصلاحيات و`allCommitteesAllowed` و`allExamsAllowed` و`allowedExamIds` و`profileId` (تطبيق بروفايل ينسخ إعداداته) تتطلب `users.grant`. المدير غير المشرف العام يدير المعاونين والمتقدمين فقط، ويسند لجاناً من نطاقه فقط، ولا يكتب رقم الجواز. الحساب الجديد يحتاج كلمة مرور أولية ويُطلب تغييرها عند أول دخول. |
| `POST /:id/reset-password` | `users.grant` | `{ password }` كلمة مؤقتة؛ تُنهى جلسات المستخدم ويُطلب منه اختيار كلمة جديدة. |
| `DELETE /:id` | `users.delete` | |

### الإشعارات `/api/notifications`

`GET /` (لكل مستخدم: العامة والموجهة له، مع حالة القراءة الخاصة به)، `POST /` (`notifications.create`)،
`PATCH /:id/read`، `POST /read-all`. حالة القراءة لكل مستخدم على حدة.

### رصد الدرجات `/api/scoring`

`GET /` (`scoring.read`)، `POST /` و`DELETE /:id` (`scoring.write`، مقيّد باللجنة؛ اسم المصحح من التوكن).

### كشف الدورة `/api/summer-course-rows`

`GET /?courseId=` (`summerRows.read`)، `POST /` و`POST /bulk` و`DELETE /:id` (`summerRows.write`). `bulk` في معاملة واحدة
(حتى 1000 صف)، واستبدال كشف دورة كاملاً (`replaceCourseId`) للمشرف العام فقط.

حذف دورة لها صفوف كشف يرجع 409 حتى يُرسل `?deleteSheetRows=true`.

### الإعدادات المشتركة

| المسار | قراءة | كتابة وحذف |
|---|---|---|
| `/api/books` | `books.read` | `books.write` |
| `/api/permission-profiles` | `profiles.read` | `profiles.write` |
| `/api/custom-permissions` | أي مستخدم معتمد | `profiles.write` (تسميات عرض فقط، لا تمنح صلاحية) |

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
- الأندرويد: القراءة من Room بعد المزامنة؛ الكتابة تمر بطابور `pending_ops` بالترتيب، وكل كتابة تحمل `Idempotency-Key`
  ومعرّف المستخدم الذي أنشأها، ومع `expectedUpdatedAt` للجان والمستخدمين. لا يُرسل الطابور إلا مستخدمُه. انتهاء الجلسة
  أو الخروج لا يحذف الكتابات غير المرسلة إلا بموافقة المستخدم. 4xx تبقى «مرفوضة» مع رسالة الخادم حتى يعيد المستخدم
  الإرسال أو يحذفها؛ 5xx تُعاد حتى 5 مرات ثم تُركن. قفل واحد للتطبيق وWorkManager يمنع الإرسال المزدوج.
- اختبار العقد: `tests/contract/` في هذا المستودع يعيد إرسال طلبات الأندرويد المسجّلة (`android-payloads.json` من
  `ContractPayloadTest` في مستودع التطبيق) ويشغّل كود الويب الحقيقي ضد الخادم.
