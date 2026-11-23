# خطة تنفيذ: الصلاحيات الست وفلو اللجنة والحفلة

> **لأي موديل أو مطوّر يكمّل الشغل:** الملف ده هو المرجع. اقرأه كله قبل ما تلمس الكود.
>
> - كل القرارات اللي في الجزء 1 **اتفق عليها صاحب المشروع** في المحادثة، فما تفتحش فيها نقاش تاني.
> - علّم على المهام اللي بتخلّصها في الجزء 6 (`[x]`)، واكتب في **سجل التقدم** (الجزء 9) آخر حاجة عملتها.
> - البرانش: `claude/serene-goldberg-7deeyz`.
> - ماتعملش Pull Request غير لو صاحب المشروع طلب.

---

## 0. السياق في سطور

- الريبو ده فيه **السيرفر (Express + PostgreSQL)** و**موقع الويب (React)**.
- **أبلكيشن الأندرويد** في ريبو منفصل اسمه `bukharyApp`، ومش موجود في السيشن دي. هيتعدّل بعد السيرفر والويب (الجزء 8).
- مصدر الصلاحيات الوحيد هو `server/policy.ts`. والـ `GET /api/auth/me` بيرجّع الصلاحيات محسوبة للويب والموبايل.
- الإشعارات بتتعمل من `notify()` في `server/routes/notifications.ts`، وبتتبعت push عن طريق FCM من `server/push.ts`.
- كل تعديل لازم يتسجل بـ `audit()` (`server/audit.ts`) جوه نفس الـ transaction.
- الـ migrations في `migrations/NNN_name.sql`. بعد إضافة أي migration شغّل `npm run migrations:lock`. **أي migration اتنشر ممنوع يتعدّل.** آخر رقم موجود هو `024`، فاللي جاي يبدأ من `025`.
- الاختبارات محتاجة Postgres مؤقت (شوف README). أوامر الفحص: `npm run lint` و`npm test` و`npm run test:unit`.

## 0.1 الوضع الحالي (قبل التنفيذ)

| الموضوع | الموجود |
|---|---|
| أدوار الحساب | `super_admin`، `admin`، `committee_head`، `sheikh` |
| نطاق اللجان | `app_users.assigned_committee_ids` (JSON) و`all_committees` |
| المراقبين | جدول `committee_assignments` (`task = exam / ceremony`، وفيه تواريخ)، والإشعار بيتبعت **فورًا** |
| مدعوين الحفلة | `committees.ceremony_details.attendees` |
| رئيس لجنة مؤقت | جدول `committee_head_grants` (migration 024) |
| مراحل اللجنة | 9 مراحل في `stages` (`registration` … `ceremony`)، والقواعد في `server/workflow.ts` |
| يوم اللجنة | `committees.exam_date` |
| الحفلة | جوه اللجنة: `ceremony_details` (التاريخ، والوقت، والمكان، وعدد المكرّمين…) |
| سجل التدقيق | `audit.read` للسوبر أدمن **بس** |
| إرسال تنبيه يدوي | للكل أو لناس لجنة معينة بس |
| غير موجود خالص | مدير إدارة الحفلات، والسواق، والتفعيل، وتحذير التعارض، والمتاحين، والاعتذار، والدخول بعين المستخدم |

---

## 1. القرارات المتفق عليها (مرجع نهائي)

### 1.1 الصلاحيات الست

| # | الصلاحية | نوعها في الكود | بتعمل إيه |
|---|---|---|---|
| 1 | السوبر أدمن | دور حساب `super_admin` | يشوف ويعمل كل حاجة. **محدش يشوفه أو يعرف إنه موجود**: مش هيظهر في القوايم ولا الإرسال ولا السجل اللي الأدمن بيشوفه |
| 2 | الأدمن | دور حساب `admin` | أكسس على كل حاجة. **ينشئ اللجان والحفلات**، ويعيّن شيخ اللجنة، ويعتمد، ويبعت تنبيهات، ويدخل بعين أي مستخدم |
| 3 | مدير إدارة الحفلات والامتحانات | دور حساب **جديد** `exams_manager` | يشوف كل اللجان اللي اتبعتت له. **يعيّن المراقبين** (بعد سماح الأدمن)، ويفعّل اللجنة، ويحط السواق، ويعيّن مشايخ الحفلة، ويدي صاحب اللجنة صلاحية التعيين |
| 4 | شيخ اللجنة (صاحبها) | دور **على مستوى اللجنة** `owner` | **مشرف بس**. يشوف كل الناس اللي في لجنته ومرحلتها. **ما يعيّنش** غير لو المدير اداله `can_assign` |
| 5 | المراقب | دور **على مستوى اللجنة** `observer` | يشوف المكان ورقم شيخ اللجنة والمراقبين اللي معاه والسواق. **ما يشوفش مشايخ الحفلة** |
| 6 | شيخ الحفلة | دور **على مستوى اللجنة** `ceremony_sheikh` | يشوف تفاصيل الحفلة (المكان، والميعاد، ودوره، والإحصائيات، والسواق) والمشايخ اللي معاه في نفس الحفلة |

**قرار تصميم (D1):** الصلاحيات 4 و5 و6 **تتحدد لكل لجنة لوحدها**، مش على الحساب. نفس الشخص ممكن يبقى صاحب لجنة في لجنة، ومراقب في لجنة تانية، وشيخ حفلة في تالتة.

- أدوار الحساب هتبقى: `super_admin`، و`admin`، و`exams_manager`، و`committee_head`، و`sheikh`.
- `committee_head` و`sheikh` على مستوى الحساب هيبقوا **مجرد تصنيف** (اسم بيظهر في القوايم)، والأكسس الفعلي هيجي من جدول `committee_staff`.

### 1.2 مراحل دورة حياة اللجنة (`lifecycle`)

| المرحلة | القيمة | مين يحرّكها | اللي يحصل |
|---|---|---|---|
| إنشاء | `draft` | الأدمن (وهو بيعمل اللجنة) | الأدمن يحط يوم اللجنة (`exam_date`) والمكان، و**لازم شيخ لجنة**. محدش غير الأدمن والسوبر أدمن يشوفها |
| مُرسلة للمدير | `sent_to_manager` | الأدمن (زرار «إرسال للمدير») | إشعار لكل مستخدمين `exams_manager`، واللجنة تظهر لهم |
| مسموح بالمراقبين | `observers_open` | الأدمن (زرار «السماح بإضافة مراقبين») | إشعار للمدير: «الأدمن سمح لك تضيف مراقبين في لجنة X». المدير يضيف المراقبين والسواق، و**لسه مفيش إشعارات للأعضاء** |
| مفعّلة | `active` | المدير (أو الأدمن) | **دلوقتي بس** كل الأعضاء يوصلهم push، واللجنة تظهر لهم. أي حد يتضاف بعد كده يوصله الإشعار على طول |
| تمت المراقبة / جاري التصحيح | `observed` | الأدمن أو المدير | المراقبين **يفضوا** (مبقوش مشغولين). مراحل التصحيح القديمة تفضل شغالة جوه |
| معتمدة | `accredited` | الأدمن | إشعار للمدير: «يلا عيّن مشايخ للحفلة». من هنا بس ينفع نعيّن مشايخ الحفلة |
| تمت الحفلة | `ceremony_done` | الأدمن أو المدير (أو مرحلة `ceremony` القديمة) | نهاية اللجنة |

القواعد:

- **الحركة لقدّام بس، مرحلة مرحلة.** الرجوع خطوة لورا مسموح للأدمن بس، وبيتسجل في السجل.
- **العلاقة بالمراحل التسعة القديمة (D2):** المراحل التسعة تفضل زي ما هي للتفاصيل الداخلية (التصحيح، والتجميع، والكشف…)، والـ `lifecycle` يتربط بيها:
  - التحويل لـ `observed` يكمّل `registration` و`exam` لو مش متكملين.
  - إكمال `accreditation` من المراحل القديمة يحوّل الـ `lifecycle` لـ `accredited`، والعكس صحيح.
  - إكمال `ceremony` يحوّله لـ `ceremony_done`.
  - مراحل التصحيح (`scoring` … `sheet`) ما ينفعش تتكمّل قبل `observed`.
- **الحفلة:** كل حفلة تبع **لجنة واحدة**، وتفضل في `ceremony_details`. الحفلة لازم **تتنشئ** من الأدمن أو المدير بمكان وتاريخ ووقت. هنضيف `ceremony_details.createdAt/createdBy` عشان نفرّق بين "اتنشئت" و"لسه". ما بتتعملش تلقائي.

### 1.3 مين يعيّن مين

| التعيين | مين يقدر |
|---|---|
| شيخ اللجنة (`owner`) | الأدمن (وهو بينشئ اللجنة، أو بيعدّلها بعدين) |
| المراقبين (`observer`) | المدير، **بعد** `observers_open`. وصاحب اللجنة لو معاه `can_assign` |
| مشايخ الحفلة (`ceremony_sheikh`) | الأدمن أو المدير، **بعد** `accredited`. وصاحب اللجنة لو معاه `can_assign` |
| صلاحية التعيين لصاحب اللجنة (`can_assign`) | المدير أو الأدمن |
| السواق (اسم ورقم، اختياري) | المدير أو الأدمن |

- التعيين **تلقائي**: مفيش قبول ولا رفض.
- الشخص يقدر **يعتذر** من الأبلكيشن، ومعاه سبب. ساعتها يتبعت إشعار للمدير وصاحب اللجنة.
- الأدمن ليه الأكسس كله، فيقدر يعمل أي تعيين في أي وقت. لكن الترتيب بتاع المراحل بيمشي عليه هو كمان عشان الإشعارات تطلع صح: لو عيّن مراقبين وهي لسه `draft`، الإشعارات تفضل محبوسة لحد التفعيل.

### 1.4 قواعد الرؤية جوه اللجنة

| مين | يشوف إيه |
|---|---|
| الأدمن والسوبر أدمن | كل حاجة |
| المدير | أي لجنة من أول `sent_to_manager`: صاحبها، والمراقبين، والمشايخ، والمرحلة، والسواق |
| صاحب اللجنة | من أول `active`: كل اللي في لجنته (المراقبين، ومشايخ الحفلة، والسواق) |
| المراقب | من أول `active`: المكان، ويوم اللجنة، واسم ورقم صاحب اللجنة، و**المراقبين بس**، والسواق |
| شيخ الحفلة | من وقت تعيينه بعد `accredited`: تفاصيل الحفلة، و**مشايخ الحفلة بس**، واسم ورقم صاحب اللجنة، والسواق، وعدد الطلبة/المكرّمين |

قبل `active` الأعضاء **ما يشوفوش اللجنة خالص** (لا في القايمة ولا في الإشعارات ولا في `/auth/me`).

### 1.5 الانشغال والتعارض

- **المراقب** مشغول في `exam_date` بتاع اللجنة، طول ما اللجنة في `observers_open` أو `active`. لما تتحوّل `observed` يبقى متاح.
- **شيخ الحفلة** مشغول في `ceremony_details.ceremonyDate`.
- **التعارض بيحذّر، مش بيمنع:**
  1. السيرفر يرجّع `409` ومعاه `code: 'schedule_conflict'` وتفاصيل التعارض (اللجنة/الحفلة التانية، والتاريخ، والوقت).
  2. الويب يعرض التحذير.
  3. لو المدير أكّد، الطلب يتبعت تاني بـ `confirmConflicts: true`، وممكن يكون معاه `note`.
  4. الـ `note` بتتخزن على التعيين وتتبعت مع الإشعار، زي "لجنتك دي الساعة 10".
- **قايمة المتاحين:** بتختار يوم، فيظهر لك:
  - **متاح:** مش مشغول اليوم ده.
  - **بدون مهام:** معندوش أي تعيين شغال خالص.
  - **مشغول:** ومعاه هو مشغول في إيه.

### 1.6 التنبيهات

- كل تعيين بيبعت إشعاره **أوتوماتيك** (مع احترام قاعدة الحبس لحد التفعيل).
- **الإرسال اليدوي** للأدمن (والمدير كمان، للناس اللي يقدر يشوفهم). الجمهور ممكن يكون:
  - شخص أو مجموعة أشخاص (`userIds`).
  - الكل (`all`).
  - دور حساب، زي كل المديرين (`accountRole`).
  - دور لجنة على مستوى المنظومة، زي كل المراقبين أو كل مشايخ الحفلات (`staffRole`).
  - ناس لجنة أو حفلة معينة، كلهم أو رول معين جواها (`committee` + `committeeRoles`).
  - المتاحين في يوم معين (`available` + `date`).
- السوبر أدمن **ما يظهرش** أبدًا في الإرسال، والإشعار ما يوصلوش غير لو هو اللي باعته لنفسه.

### 1.7 الدخول بعين المستخدم (Impersonation)

- الأدمن يضغط على اسم أي مستخدم، فتتفتح له واجهته بالظبط، و**يقدر يعدّل ويعمل أي حاجة** (مش read-only).
- **الدخول نفسه ما بيبعتش أي إشعار.** الأكشنز اللي يعملها جوه **بتبعت إشعاراتها العادية**، زي ما الشخص نفسه عملها.
- **السجل الداخلي:** يتسجل إن الأدمن الفلاني دخل على فلان في الوقت الفلاني، وكل أكشن عمله وهو جوه بيتسجل باسم الاتنين. **الأدمن والسوبر أدمن** يقدروا يشوفوا السجل ده.
- **الحدود:**
  - الأدمن ما يدخلش بعين سوبر أدمن ولا أدمن.
  - السوبر أدمن يدخل بعين أي حد إلا نفسه.
- **ممنوع وهو داخل بعين حد** (عشان الأمان):
  - تسجيل جهاز للـ push (`/api/devices`)، وإلا موبايل الأدمن هيستقبل إشعارات الشخص.
  - تغيير الباسورد، والخروج من كل الأجهزة.
  - إن الأدمن يبدأ دخول تاني جوه الدخول ده.

### 1.8 السجل

- `audit.read` يتفتح للأدمن.
- الأدمن **ما يشوفش** السجلات اللي عملها سوبر أدمن (`user_role = 'super_admin'`)، ولا السجلات الخاصة بحسابات الأدمن.

---

## 2. نموذج البيانات (Migrations)

> كل migration في ملف منفصل. بعد ما تضيفه شغّل `npm run migrations:lock`.

### 025_exams_manager_role.sql
- `chk_app_users_role` يبقى `('super_admin','admin','exams_manager','committee_head','sheikh')`.

### 026_committee_lifecycle.sql
```sql
ALTER TABLE committees ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE committees ADD CONSTRAINT chk_committee_lifecycle CHECK (lifecycle IN
  ('draft','sent_to_manager','observers_open','active','observed','accredited','ceremony_done'));
ALTER TABLE committees ADD COLUMN lifecycle_history JSONB NOT NULL DEFAULT '[]'::jsonb; -- [{to, at, byId, byName}]
ALTER TABLE committees ADD COLUMN place TEXT;              -- مكان اللجنة (لو مش موجود في الأعمدة الحالية؛ راجع branch/association_name قبل ما تضيفه)
ALTER TABLE committees ADD COLUMN driver_name TEXT;
ALTER TABLE committees ADD COLUMN driver_phone TEXT;
CREATE INDEX idx_committees_lifecycle ON committees (lifecycle);
-- اللجان الموجودة: محدش يفقد الأكسس بتاعه (قرار صاحب المشروع).
UPDATE committees SET lifecycle = CASE
  WHEN (stages->'ceremony'->>'completed')::boolean THEN 'ceremony_done'
  WHEN (stages->'accreditation'->>'completed')::boolean THEN 'accredited'
  WHEN (stages->'exam'->>'completed')::boolean THEN 'observed'
  ELSE 'active' END;
```

### 027_committee_staff.sql — المصدر الواحد لأدوار اللجنة
```sql
CREATE TABLE committee_staff (
  id VARCHAR(255) PRIMARY KEY,
  committee_id VARCHAR(255) NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','observer','ceremony_sheikh')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','excused','removed')),
  can_assign BOOLEAN NOT NULL DEFAULT false,      -- للـ owner بس
  note TEXT,                                      -- ملاحظة المدير (مثلًا وقت التعارض)
  excuse_reason TEXT,
  notified_at TIMESTAMPTZ,                        -- NULL = الإشعار لسه محبوس لحد التفعيل
  assigned_by VARCHAR(255), assigned_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ, ended_by VARCHAR(255)
);
CREATE UNIQUE INDEX uq_committee_staff_active ON committee_staff (committee_id, user_id, role) WHERE status = 'active';
CREATE UNIQUE INDEX uq_committee_one_owner ON committee_staff (committee_id) WHERE role = 'owner' AND status = 'active';
CREATE INDEX idx_committee_staff_user ON committee_staff (user_id, status);
ALTER TABLE committee_staff ENABLE ROW LEVEL SECURITY;
```

**نقل الداتا الموجودة** (في نفس الـ migration، ومن غير ما نمسح أي حاجة قديمة):
- كل `committee_head` اللي في `assigned_committee_ids` بتاعه لجنة يتعمل له `owner` عليها (`notified_at = NOW()`). لو اللجنة ليها أكتر من رئيس، ناخد أقدم واحد `owner`، والباقيين يتسجلوا في `docs/sql/` كاستعلام مراجعة، ويفضلوا شغالين بالطريقة القديمة لحد ما الأدمن يراجعهم.
- كل `sheikh` اللي في `assigned_committee_ids` بتاعه لجنة يتعمل له `observer`.
- كل `committee_assignments` نشطة: `task = 'exam'` تبقى `observer`، و`task = 'ceremony'` تبقى `ceremony_sheikh`.
- كل `ceremony_details.attendees` تبقى `ceremony_sheikh`.
- `committee_head_grants` النشطة: الـ grant تفضل شغالة زي ما هي (مش هنكسرها)، بس **ما فيش grants جديدة** (الواجهة بتاعتها تتشال في المرحلة 3).
- **التوافق:** `assigned_committee_ids` و`ceremony_details.attendees` يفضلوا **يتحدّثوا من `committee_staff`** (helper واحد اسمه `syncLegacyColumns`) عشان نسخة الأندرويد الحالية تفضل شغالة لحد ما تتحدث.

### 028_audit_impersonation.sql
```sql
ALTER TABLE audit_logs ADD COLUMN impersonator_id VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN impersonator_name TEXT;
CREATE INDEX idx_audit_impersonator ON audit_logs (impersonator_id) WHERE impersonator_id IS NOT NULL;
ALTER TABLE sessions ADD COLUMN impersonator_id VARCHAR(255);   -- سيشن دخول بعين مستخدم
```

### 029_notification_batches.sql
```sql
ALTER TABLE notifications ADD COLUMN batch_id VARCHAR(255);     -- رسالة يدوي واحدة لكذا مستلم
ALTER TABLE notifications ADD COLUMN sent_by VARCHAR(255);
CREATE INDEX idx_notifications_batch ON notifications (batch_id) WHERE batch_id IS NOT NULL;
```

---

## 3. تغييرات السيرفر

### 3.1 `server/policy.ts`
- نضيف `exams_manager` في `ROLES`.
- `isAdminRole` يفضل للأدمن والسوبر أدمن بس.
- نضيف `MANAGER_ROLES = ['super_admin','admin','exams_manager']`.
- نضيف للـ `Principal`:
  ```ts
  staff: { committeeId: string; role: 'owner'|'observer'|'ceremony_sheikh'; canAssign: boolean; lifecycle: Lifecycle }[]
  impersonator?: { id: string; name: string; role: Role }
  ```
- أكشنز جديدة أو معدّلة:

| الأكشن | مين |
|---|---|
| `committees.create` | الأدمن والسوبر أدمن بس (`ADMIN_ROLES`) |
| `committees.lifecycle.send` و`committees.lifecycle.openObservers` و`committees.lifecycle.accredit` | الأدمن |
| `committees.lifecycle.activate` و`committees.lifecycle.observed` و`committees.lifecycle.ceremonyDone` | الأدمن والمدير |
| `committees.owner.set` | الأدمن |
| `staff.observers.manage` | المدير، أو `owner` معاه `canAssign` على نفس اللجنة |
| `staff.ceremony.manage` | الأدمن والمدير، أو `owner` معاه `canAssign` |
| `staff.delegate` (يدّي `can_assign`) | الأدمن والمدير |
| `committees.driver` | الأدمن والمدير |
| `ceremony.create` | الأدمن والمدير |
| `staff.excuse` | صاحب التعيين نفسه |
| `people.availability` | الأدمن والمدير |
| `notifications.create` | الأدمن والمدير (المدير يبعت للناس اللي يقدر يشوفهم بس) |
| `audit.read` | الأدمن (مع فلترة) والسوبر أدمن |
| `users.impersonate` | الأدمن (لغير الأدمنز) والسوبر أدمن |

- `committees.members` و`assignments.manage` القديمين: **نشيل `HEADS` من `grantedToRoles`**. صاحب اللجنة ما يعيّنش غير بـ `canAssign`.
- دالة رؤية جديدة `committeeVisibility(user, committee)`، ترجّع `'none' | 'admin' | 'manager' | 'owner' | 'observer' | 'ceremony_sheikh'` حسب الجدول 1.4 والـ `lifecycle`. **كل** الروتات اللي بتقرأ لجنة لازم تستخدمها.
- `isCommitteeInScope` يتحسب من `staff`، وفيه قاعدة "قبل `active` مفيش أكسس للأعضاء".
- `evaluatedPermissions` يضيف `staff` و`impersonating`، ويفضل يرجّع `committeeScope` و`observing` و`headCommitteeIds` بنفس الشكل القديم، عشان الأندرويد الحالي.

### 3.2 `server/auth.ts`
- `PRINCIPAL_COLUMNS` يحمّل `staff` من `committee_staff`، بشرط `status = 'active'`، ومعاه `lifecycle` بتاع اللجنة.
- **Impersonation:**
  - توكن الوصول ممكن يبقى فيه claim اسمه `imp` (id الأدمن)، وسيشنه في `sessions.impersonator_id`.
  - `authenticate()`: لو فيه `imp`، يحمّل الشخص المستهدف كـ `req.user`، ويحمّل الأدمن ويتأكد إنه لسه معتمد وأدمن، ويحطه في `req.user.impersonator`.
  - مدة التوكن ساعة، و**من غير refresh token**.
  - روتات ممنوعة وهو داخل بعين حد: `/api/devices*`، و`/api/auth/change-password`، و`/api/auth/logout-all`، و`/api/admin/impersonate*` (ماعدا `end`).

### 3.3 `server/audit.ts`
- `audit()` يكتب `impersonator_id` و`impersonator_name` من `req.user.impersonator` تلقائي. التفاصيل تبقى "بواسطة الأدمن X نيابة عن Y".

### 3.4 روتات جديدة
| الروت | الوظيفة |
|---|---|
| `POST /api/committees/:id/lifecycle` `{to, note?}` | يحرّك المرحلة. يتأكد من الترتيب والصلاحية، ويبعت الإشعارات حسب الجزء 4، ويسجّل في `lifecycle_history` والسجل. **عند `active`**: يبعت كل الإشعارات المحبوسة (`notified_at IS NULL`) ويحط `notified_at`. **عند `observed`**: يكمّل `registration` و`exam`. **عند `accredited`**: يكمّل `accreditation` |
| `GET /api/committees/:id/people` | الناس في اللجنة، متفلترين بـ `committeeVisibility` |
| `POST /api/committees/:id/staff` `{userId, role, note?, confirmConflicts?}` | تعيين. يشيّك المرحلة (المراقب بعد `observers_open`، وشيخ الحفلة بعد `accredited`، إلا الأدمن)، ويشيّك التعارض (`409 schedule_conflict`)، ويبعت الإشعار أو يحبسه |
| `DELETE /api/committees/:id/staff/:staffId` | إلغاء التعيين (`status = 'removed'`) وإشعار الشخص، لو كان اتبعت له إشعار قبل كده |
| `POST /api/committees/:id/staff/:staffId/excuse` `{reason}` | اعتذار صاحب التعيين: `status = 'excused'`، وإشعار للمدير وصاحب اللجنة |
| `PATCH /api/committees/:id/owner` `{userId}` | الأدمن يحط أو يغيّر شيخ اللجنة |
| `PATCH /api/committees/:id/owner/can-assign` `{value}` | المدير أو الأدمن، وإشعار لصاحب اللجنة |
| `PATCH /api/committees/:id/driver` `{hasDriver, name?, phone?}` | السواق. لو اللجنة `active`، إشعار للمراقبين ومشايخ الحفلة بالتغيير |
| `POST /api/committees/:id/ceremony` | إنشاء الحفلة أو تعديلها (المكان، والتاريخ، والوقت، والملاحظات). تعديل الميعاد يبعت `urgent` لمشايخ الحفلة |
| `GET /api/people/availability?date=YYYY-MM-DD&role=observer\|ceremony_sheikh` | `{available[], unassigned[], busy[{user, items[]}]}` |
| `POST /api/notifications` (معدّل) | `{title, description, type, audience:{kind, userIds?, accountRole?, staffRole?, committeeId?, committeeRoles?, date?}}`. يحل الجمهور لقايمة مستخدمين (من غير السوبر أدمن)، وبعدين يعمل صف لكل مستلم بنفس `batch_id`، ويبعت push لكل واحد |
| `GET /api/notifications/sent` | الرسايل اليدوي اللي اتبعتت، وعدد المستلمين في كل واحدة |
| `POST /api/admin/impersonate/:userId` | يبدأ الدخول: يرجّع `accessToken` مؤقت، ويسجّل `impersonation.start` |
| `POST /api/admin/impersonate/end` | ينهي سيشن الدخول، ويسجّل `impersonation.end` |
| `GET /api/admin` (السجل، معدّل) | مفتوح للأدمن مع الفلترة اللي في 1.8، وفيه فلتر `impersonatedOnly` |

### 3.5 `notify()` / `push.ts`
- `notify` يفضل زي ما هو.
- نضيف `notifyMany(db, userIds[], payload)`: صف لكل مستلم، وpush واحد يجمع توكنز الأجهزة بتاعتهم (`targetUserIds`).
- `push.deliver` يدعم `targetUserIds: string[]`.
- الإشعارات الداخلية (بتاعة الدومين) تبقى `data.kind` واضح (`staff.assigned`، `lifecycle.sent`…)، عشان الموبايل يفتح الشاشة الصح.

### 3.6 دوال مساعدة جديدة: `server/staff.ts`
- `syncLegacyColumns(db, userIds)`: يحدّث `assigned_committee_ids` و`ceremony_details.attendees` من `committee_staff`.
- `findConflicts(db, userId, role, committee)`: يرجّع قايمة التعارضات حسب 1.5.
- `staffNotice(db, committee, staffRow)`: يبني نص الإشعار (المكان، واليوم، ورقم صاحب اللجنة، والزملاء، والسواق، والملاحظة).
- `releasePendingNotices(db, committeeId)`: بيتنادى عند التفعيل.

---

## 4. مصفوفة الإشعارات (push + داخل الأبلكيشن)

| الحدث | مين يوصله | المحتوى |
|---|---|---|
| الأدمن بعت اللجنة للمدير | كل `exams_manager` | لجنة جديدة رقم X، ويومها ومكانها |
| الأدمن سمح بالمراقبين | كل `exams_manager` | «الأدمن سمح لك تضيف مراقبين في لجنة X» |
| تفعيل اللجنة | صاحب اللجنة | «اتحط لك لجنة X» + اليوم والمكان وعدد المراقبين |
| تفعيل اللجنة | كل مراقب | المكان، واليوم، ورقم صاحب اللجنة، والمراقبين اللي معاه، والسواق، والملاحظة |
| مراقب اتضاف بعد التفعيل | المراقب نفسه + صاحب اللجنة | زي اللي فوق / «اتضاف مراقب: فلان» |
| شيخ لجنة اتعيّن أو اتغيّر بعد التفعيل | الشيخ الجديد (والقديم: إلغاء) | تفاصيل اللجنة |
| `can_assign` اتدّت أو اتشالت | صاحب اللجنة | «تقدر دلوقتي تعيّن ناس في لجنتك» |
| تمت المراقبة | المراقبين + صاحب اللجنة | «تمت المراقبة، شكرًا» (`info`) |
| الاعتماد | كل `exams_manager` | «لجنة X اتعتمدت، عيّن مشايخ للحفلة» (`urgent`) |
| تعيين شيخ حفلة | الشيخ + صاحب اللجنة | المكان، والميعاد، ودوره، والمشايخ اللي معاه، وعدد الطلبة، والسواق |
| تغيير ميعاد أو مكان الحفلة | مشايخ الحفلة + صاحب اللجنة | `urgent` |
| تغيير السواق | المراقبين + مشايخ الحفلة (لو اللجنة مفعّلة) | الاسم والرقم |
| إلغاء تعيين | الشخص (لو كان اتبلّغ قبل كده) | «اتلغى تكليفك في لجنة X» |
| اعتذار | كل `exams_manager` + صاحب اللجنة | «فلان اعتذر عن X، والسبب: …» (`urgent`) |
| إرسال يدوي | الجمهور اللي اتحدد | العنوان والنص |
| دخول بعين مستخدم | **محدش** | — |

---

## 5. تغييرات الويب (`src/`)

| الشاشة / المكوّن | التغيير |
|---|---|
| `AddCommitteeModal.tsx` | الأدمن بس. نضيف يوم اللجنة والمكان واختيار **شيخ اللجنة** (إجباري) |
| `CommitteeCard.tsx` و`SearchAndFilters.tsx` | شارة الـ `lifecycle` بالعربي، وفلتر بيها |
| `CommitteeDetailModal.tsx` | شريط مراحل الـ `lifecycle` بالزراير، ويظهر بس اللي الصلاحية تسمح بيه. وقسم **الناس** (من `/people`)، وقسم **السواق**، وقسم **الحفلة** |
| `StaffAssignment.tsx` و`Assignments.tsx` | يتحولوا لمكوّن واحد `CommitteeStaffPanel`: تعيين مراقب أو شيخ حفلة، وتحذير التعارض مع خانة ملاحظة، وإلغاء، و`can_assign` |
| `HeadGrants.tsx` | تتشال من القايمة (الـ grants القديمة تفضل ظاهرة للقراءة بس لحد ما تخلص) |
| جديد: `AvailabilityView.tsx` | اختيار يوم ورول، وتلات تابات: متاح / بدون مهام / مشغول |
| `NotificationComposer.tsx` | اختيار الجمهور (الأنواع اللي في 1.6)، ومعاينة عدد المستلمين، وتاب «المُرسلة» |
| `AssistantsView.tsx` / `users/` | زرار «الدخول بعين المستخدم»، ودور `exams_manager` في اختيار الأدوار (للأدمن) |
| جديد: `ImpersonationBanner.tsx` | شريط ثابت فوق: «أنت داخل بحساب: فلان»، وزرار «رجوع لحسابي». التوكن الأصلي يتحفظ في الذاكرة / `sessionStorage` ويرجع لما الدخول يخلص |
| `AuditLogView.tsx` | تتفتح للأدمن، وفيها فلتر «عمليات بعين مستخدم» وعمود «نيابة عن» |
| «لجاني» للأعضاء | المراقب يشوف كارت: المكان، واليوم، ورقم الشيخ، والزملاء، والسواق، وزرار **اعتذار**. وشيخ الحفلة نفس الكلام لحفلته |
| `src/services/api.ts` و`src/data/queries.ts` | الدوال الجديدة |
| `src/types/index.ts` | `Lifecycle` و`StaffRole` و`CommitteeStaff` و`exams_manager` |
| `tests/contract/rules.json` | نضيف `lifecycleOrder` و`lifecycleLabels` (لازم يتنسخ للأندرويد) |

---

## 6. مراحل التنفيذ والمهام

> كل مرحلة = commit واحد أو أكتر، وبعدها push. لازم `npm run lint` يعدّي واختبارات المرحلة تنجح قبل ما ننتقل للي بعدها.

### المرحلة 1: الأدوار والصلاحيات
- [x] migration `025` (دور `exams_manager`).
- [x] migration `027` (`committee_staff`) + نقل الداتا + `syncLegacyColumns`.
- [x] `policy.ts`: الدور الجديد، و`staff` في الـ Principal، وشيل `HEADS` من صلاحيات التعيين، و`canAssign`.
- [x] `auth.ts`: تحميل `staff`.
- [x] `users.ts`: الأدمن يقدر يدّي دور `exams_manager`، وهو بيظهر للأدمن (مش مستخبي زي الأدمنز).
- [x] الروتات: `PATCH owner` و`owner/can-assign`.
- [x] تحويل `PUT /committees/:id/members` و`/api/assignments` إنهم يكتبوا في `committee_staff` (ونفس الشكل القديم للأندرويد).
- [x] اختبارات: `tests/roles-six.test.ts` (مين يقدر يعيّن مين، وصاحب اللجنة من غير `canAssign` بياخد 403، ومعاها ينجح، ونقل الداتا).

### المرحلة 2: دورة حياة اللجنة والسواق وحبس الإشعارات
- [x] migration `026` (`lifecycle`، والسواق، والمكان) مع تحديد اللجان الموجودة.
- [x] `POST /committees/:id/lifecycle` + الربط بالمراحل التسعة في `workflow.ts`.
- [x] `committees.create` للأدمن بس، واللجنة تبدأ `draft`، وشيخ اللجنة إجباري.
- [x] `committeeVisibility` وتطبيقها على `GET /committees`، و`/:id`، و`/notifications`، و`push.deliver`.
- [x] حبس الإشعارات (`notified_at`) و`releasePendingNotices` عند التفعيل.
- [x] `PATCH driver`.
- [x] الويب: شريط المراحل، والشارة، والفلتر، وقسم السواق، وتعديل `AddCommitteeModal`.
- [x] `rules.json`: `lifecycleOrder`.
- [x] اختبارات: `tests/lifecycle.test.ts` (الترتيب، والصلاحيات، ومفيش إشعار قبل التفعيل، والإشعارات المحبوسة بتتبعت عند التفعيل، والأعضاء ما يشوفوش اللجنة قبل `active`، و`observed` بتكمّل المراحل القديمة، ومراحل التصحيح ممنوعة قبل `observed`).

### المرحلة 3: التعيينات والتعارض والاعتذار والرؤية
- [x] `POST/DELETE /committees/:id/staff` بشروط المراحل.
- [x] `findConflicts` و`409 schedule_conflict` و`confirmConflicts` و`note`.
- [x] `POST .../excuse`.
- [x] `GET /committees/:id/people` بقواعد 1.4.
- [x] `POST /committees/:id/ceremony` (الإنشاء والتعديل، وإشعار `urgent` عند التغيير).
- [x] نصوص الإشعارات (`staffNotice`) حسب الجزء 4.
- [x] الويب: `CommitteeStaffPanel`، وكروت «لجاني» للمراقب وشيخ الحفلة، وزرار الاعتذار، وشيل `HeadGrants` من القايمة.
- [x] اختبارات: `tests/staff-assign.test.ts` (التعارض بيحذّر وبعدين ينجح بالتأكيد، والملاحظة بتوصل في الإشعار، والمراقب ما يشوفش مشايخ الحفلة، ومشايخ الحفلة يشوفوا بعض، والاعتذار بيبلّغ المدير، وشيخ الحفلة ممنوع قبل الاعتماد).

### المرحلة 4: التنبيهات الشاملة والمتاحين
- [x] migration `029`.
- [x] `notifyMany` + `push.deliver(targetUserIds)`.
- [x] `POST /notifications` بالجمهور الجديد + `GET /notifications/sent`.
- [x] `GET /people/availability`.
- [x] الويب: `NotificationComposer` و`AvailabilityView`.
- [x] اختبارات: `tests/notifications-audience.test.ts` (كل نوع جمهور، والسوبر أدمن عمره ما يتحسب في المستلمين، والمدير يبعت في حدوده بس)، و`tests/availability.test.ts`.

### المرحلة 5: الدخول بعين المستخدم والسجل
- [x] migration `028`.
- [x] `POST /admin/impersonate/:userId` و`/end`، والـ claim `imp` في `authenticate`، والروتات الممنوعة.
- [x] `audit()` يكتب `impersonator_*`.
- [x] `audit.read` للأدمن مع الفلترة.
- [x] الويب: زرار الدخول، و`ImpersonationBanner`، والرجوع للحساب، وفلتر السجل.
- [x] اختبارات: `tests/impersonation.test.ts` (الأدمن ما يدخلش بعين أدمن أو سوبر أدمن، والدخول ما بيبعتش إشعار، والأكشن جوه بيتسجل باسم الاتنين، وتسجيل الجهاز ممنوع، والأدمن ما يشوفش سجلات السوبر أدمن).

### المرحلة 6: التنظيف والتوثيق
- [x] تحديث `SYSTEM_DOCUMENTATION.md` و`API_CONTRACT.md` و`mobile_spec/ROLES_AND_PERMISSIONS.md` و`mobile_spec/API_SPECIFICATION.md`.
- [x] `npm run lint` و`npm test` و`npm run test:unit` و`npm run build` كلهم ينجحوا.
- [x] push، وتقرير لصاحب المشروع بالمرحلة الجاية (الأندرويد).

---

## 7. ملاحظات ومخاطر

1. **التوافق مع أبلكيشن الأندرويد الحالي:** ماتشيلش ولا تغيّر شكل أي field موجود في `/auth/me` أو `/committees` أو `/assignments`. ضيف بس. `syncLegacyColumns` هو اللي بيحافظ على الأعمدة القديمة.
2. `committee_head_grants`: ما تمسحش الجدول ولا الكود بتاعه. وقّف إنشاء grants جديدة بس (`POST /api/grants` يرجّع 410 بعد المرحلة 3).
3. **الـ migrations:** متعدّلش أي ملف قديم. اختبار `tests/migrations-safety.test.ts` هيفشل لو عدّلت.
4. **أي query بيرجّع مستخدمين للأدمن** لازم يستبعد `super_admin`، ولو مش سوبر أدمن يستبعد `admin` كمان (`canSeeRole`).
5. **الوقت:** كل حسابات "اليوم" بتوقيت القاهرة (`localDate` في `workflow.ts`).
6. **المكان:** قبل ما تضيف عمود `place` بص على الأعمدة الموجودة (`branch` و`association_name` و`general_notes`). لو فيه عمود بيستخدم كمكان، استخدمه وماتعملش جديد.

## 8. أبلكيشن الأندرويد (`bukharyApp`، بعد ما السيرفر والويب يخلصوا)

- يتضاف الريبو للسيشن: `add_repo` لـ `Moazenaba/bukharyApp`.
- الشغل المطلوب:
  - قراءة `staff` و`lifecycle` من `/auth/me` و`/committees`.
  - شاشة «لجاني» بتفاصيل المراقب وشيخ الحفلة، وزرار الاعتذار.
  - فتح الشاشة الصح من `data.kind` بتاع الإشعار.
  - شاشات المدير: التعيين، والتعارض، والسواق.
  - نسخ `rules.json` الجديد.
- كل ده بيعتمد على الـ API اللي في الجزء 3، ومفيش أي حاجة هتتكسر في النسخة القديمة.

## 9. سجل التقدم

| التاريخ | المرحلة | اللي اتعمل | الخطوة الجاية |
|---|---|---|---|
| 2026-11-23 | تخطيط | كتابة الخطة دي بعد ما صاحب المشروع وافق على كل القرارات | المرحلة 1 |
| 2026-11-23 | 1–5 (سيرفر) | migrations `025_six_roles_and_lifecycle` و`026_impersonation_and_batches` (اتدمجت فيهم الـ migrations اللي كانت مخططة 025–029)، و`server/staff.ts`، و`server/routes/staff.ts`، و`server/routes/impersonation.ts`، والتنبيهات بالجمهور. اختبارات: `tests/six-roles-flow.test.ts` و`tests/migration-025.test.ts` و`tests/notifications-impersonation.test.ts` | — |
| 2026-11-23 | ويب | `CommitteeFlowPanel` و`NotificationComposer` الجديد و`AvailabilityView` و`ImpersonationBanner`، وشارة المرحلة، واختيار شيخ اللجنة عند الإنشاء، وعمود «بواسطة» في السجل. اتجرّب في متصفح حقيقي (أدمن، ومدير، ومراقب على موبايل) | — |
| 2026-11-23 | أندرويد | برانش `claude/serene-goldberg-7deeyz` في `bukharyApp`: `CommitteeFlowSection` في الواجهات التلاتة، ودور المدير، والضغط على الإشعار بيفتح اللجنة | دمج الريبوهين، ثم زرار Publish Android |

### قرارات اتاخدت أثناء التنفيذ (مهم للي يكمّل)
- **المكان** = العمود الموجود `sheikh_country` (كان بيستخدم كمكان قبل كده)، فمفيش عمود جديد.
- **`committee_head_grants`** (رئيس لجنة مؤقت) فضلت شغالة زي ما هي، ومتوقفتش.
- **التكليفات القديمة** (`/api/assignments`) بقت بتكتب في `committee_staff` وبترجع نفس الشكل القديم، والتواريخ بقت بتتقبل وتتجاهل (المرحلة هي اللي بتحدد الانشغال).
- **صاحب اللجنة** بيعمل شغل المراحل (الاستلام، والتصحيح…) في لجنته زي الأول، لكن **الاعتماد** للأدمن بس.
- مراحل اللجنة القديمة والـ `lifecycle` ماشيين مع بعض: إكمال «الامتحان» = تمت المراقبة، وإكمال «الاعتمادية» = معتمدة، وإكمال «الحفل» = تمت الحفلة (لما اللجنة تكون مفعّلة).
- **الملاحظة** على التعيين بيشوفها صاحبها، والإدارة، وشيخ اللجنة بس.
- **اختبار فاشل من قبل الشغل ده:** `tests/users-exams.test.ts` («a user editing themself…»). القاعدة الحالية بتقول إن تعديل الاسم محتاج مراجعة المشرف، والاختبار ما اتحدّثش معاها، ومش متعلق بالخطة دي.
