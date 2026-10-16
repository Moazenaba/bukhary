# 🎨 وثيقة التصميم ونظام الهوية البصرية (DESIGN.md)
## Bukhari Competition Mobile App - Complete Design System & UI Specification

هذا الملف يحتوي على كافة تفاصيل الهوية البصرية، الألوان، الخطوط، التدرجات، الأشكال، الظلال، وأبعاد العناصر والحركات والتفاعلات لتطبيق الموبايل ليكون متطابقاً 100% مع واجهة النظام.

---

## 1. فلسفة التصميم (Design Philosophy)
- **الطابع العام**: إسلامي علمي راقٍ، نظيف وعصري (Modern Islamic Academic & Executive).
- **الاتجاه الأساسي**: من اليمين إلى اليسار (RTL - Right to Left) مع دعم كامل للغة العربية.
- **التفاعل واللمس**: تفاعلات فيزيائية رشيقة (Micro-interactions, Active scaling `scale(0.97)`, Haptic feedback).
- **التباين والوضوح**: وضوح تام في البطاقات، والشارات الملونة لكل مرحلة لسهولة التمييز الميداني السريع.

---

## 2. لوحة الألوان الرسمية (Color Palette)

### 🌿 الألوان الأساسية (Brand Primary - Emerald & Teal):
| اللون | كود HEX | الاستخدام |
| :--- | :--- | :--- |
| **Primary 900** | `#00201d` | النصوص الرئيسية العميقة، العناوين الحساسة |
| **Primary 800** | `#003833` | خلفيات العناوين العلوية الداكنة |
| **Primary 700 (Brand Deep)** | `#005c55` | اللون الرسمي للمسجد، الأزرار الأساسية، التحديد النشط |
| **Primary 600 (Brand Medium)** | `#0f766e` | الأزرار الثانوية، الروابط، النصوص الفرعية المؤكدة |
| **Primary 500** | `#14b8a6` | عناصر التأكيد، المؤشرات النشطة |
| **Primary 200** | `#99f6e4` | الحدود الفاتحة والتركيز (Focus) |
| **Primary 100** | `#ccfbf1` | خلفيات الأيقونات وحالات التفعيل الفاتحة |
| **Primary 50 (Soft BG)** | `#f0fdfa` | خلفيات الشارات والبطاقات المميزة |

### 🏛️ الخلفيات والحياديات (Backgrounds & Neutrals):
| اللون | كود HEX | الاستخدام |
| :--- | :--- | :--- |
| **App Background** | `#f8f9ff` | خلفية التطبيق العامة المريحة للعين |
| **Surface Pure** | `#ffffff` | خلفيات البطاقات، الحوارات، والنوافذ السفلية |
| **Surface Subtle** | `#f1f5f9` | خلفيات المدخلات (Inputs) والشرائط الفاصلة |
| **Text Main** | `#0d1c2e` | النص الأساسي فائق الوضوح |
| **Text Muted** | `#64748b` | النصوص الوصفية الثانوية والتوقيتات |
| **Border Soft** | `#e2e8f0` | حدود البطاقات والعناصر |
| **Border Active** | `#cbd5e1` | الحدود عند الضغط والتركيز |

---

## 3. ألوان المراحل التسع للجان (The 9 Stages Colors & Badges)

لكل مرحلة لون مميز ورمز تعبيري موحد في كامل التطبيق:

```dart
// تعريف المراحل وألوانها
const stagesTheme = {
  'registration': {
    'name': 'التسجيل',
    'activeLabel': 'تم التسجيل',
    'emoji': '📝',
    'bg': Color(0xFFF1F5F9), // slate-100
    'text': Color(0xFF334155), // slate-700
    'border': Color(0xFFCBD5E1), // slate-300
    'dot': Color(0xFF94A3B8), // slate-400
  },
  'exam': {
    'name': 'الامتحان',
    'activeLabel': 'جاري الامتحان الآن',
    'emoji': '🟦',
    'bg': Color(0xFFEFF6FF), // blue-50
    'text': Color(0xFF1D4ED8), // blue-700
    'border': Color(0xFFBFDBFE), // blue-200
    'dot': Color(0xFF3B82F6), // blue-500
  },
  'scoring': {
    'name': 'التصحيح',
    'activeLabel': 'في التصحيح',
    'emoji': '🟠',
    'bg': Color(0xFFFFFBEB), // amber-50
    'text': Color(0xFFB45309), // amber-700
    'border': Color(0xFFFDE68A), // amber-200
    'dot': Color(0xFFF59E0B), // amber-500
  },
  'aggregation': {
    'name': 'تجميع الدرجات',
    'activeLabel': 'في التجميع',
    'emoji': '🔵',
    'bg': Color(0xFFEEF2FF), // indigo-50
    'text': Color(0xFF4338CA), // indigo-700
    'border': Color(0xFFC7D2FE), // indigo-200
    'dot': Color(0xFF6366F1), // indigo-500
  },
  'review': {
    'name': 'المراجعة',
    'activeLabel': 'في المراجعة والتدقيق',
    'emoji': '🟡',
    'bg': Color(0xFFFEFCE8), // yellow-50
    'text': Color(0xFF854D0E), // yellow-800
    'border': Color(0xFFFEF08A), // yellow-300
    'dot': Color(0xFFEAB308), // yellow-500
  },
  'sheet': {
    'name': 'كتابة الكشف',
    'activeLabel': 'كتابة الكشف',
    'emoji': '🟣',
    'bg': Color(0xFFFAF5FF), // purple-50
    'text': Color(0xFF7E22CE), // purple-700
    'border': Color(0xFFE9D5FF), // purple-200
    'dot': Color(0xFFA855F7), // purple-500
  },
  'accreditation': {
    'name': 'الاعتمادية',
    'activeLabel': 'قيد الاعتمادية',
    'emoji': '📜',
    'bg': Color(0xFFECFDF5), // emerald-50
    'text': Color(0xFF065F46), // emerald-800
    'border': Color(0xFFA7F3D0), // emerald-300
    'dot': Color(0xFF059669), // emerald-600
  },
  'announcement': {
    'name': 'إعلان النتيجة',
    'activeLabel': 'إعلان النتيجة',
    'emoji': '📢',
    'bg': Color(0xFFECFEFF), // cyan-50
    'text': Color(0xFF0E7490), // cyan-700
    'border': Color(0xFFA5F3FC), // cyan-200
    'dot': Color(0xFF06B6D4), // cyan-500
  },
  'ceremony': {
    'name': 'الحفل',
    'activeLabel': 'تم الحفل والتكريم',
    'emoji': '🟢',
    'bg': Color(0xFFF0FDF4), // green-50
    'text': Color(0xFF15803D), // green-700
    'border': Color(0xFFBBF7D0), // green-200
    'dot': Color(0xFF22C55E), // green-500
  },
};
```

---

## 4. نظام الخطوط والطباعة (Typography)

- **الخط الأساسي للتطبيق**: **Cairo** (أو **Tajawal** كبديل مدعوم، أو **IBM Plex Sans Arabic**).
- **الخط الشرفي للعناوين الخاصة والشهادات**: **Amiri**.

### المقياس الطباعي (Type Scale):
| النمط | الحجم | الوزن (Weight) | ارتفاع السطر (Line Height) | الاستخدام |
| :--- | :--- | :--- | :--- | :--- |
| **Hero Title** | 24sp / pt | Black (900) | 1.2 | عناوين الشاشات الرئيسية وشاشة الدخول |
| **Section Heading** | 18sp / pt | ExtraBold (800) | 1.3 | عناوين الأقسام والبطاقات الكبيرة |
| **Card Title** | 16sp / pt | Bold (700) | 1.35 | اسم اللجنة، اسم الدورة، عنوان الامتحان |
| **Body Regular** | 14sp / pt | Medium (500) | 1.5 | النصوص العادية والملاحظات |
| **Body Bold** | 14sp / pt | Bold (700) | 1.4 | الأزرار والروابط المهمة |
| **Caption / Meta** | 12sp / pt | SemiBold (600) | 1.4 | التوقيتات، اسم الشيخ، عدد الطلاب |
| **Badge Micro** | 10sp / pt | Bold (700) | 1.2 | شارات المراحل وحالات الإنجاز |

---

## 5. الأشكال والحواف والظلال (Shapes & Elevation)

### 🔘 حواف العناصر (Border Radius):
- **الأزرار والمدخلات**: `12px` (Medium Radius `rounded-xl`).
- **البطاقات والحاويات (Cards)**: `16px` إلى `20px` (Large Radius `rounded-2xl`).
- **القوائم السفلية والنوافذ المنبثقة (Bottom Sheets / Modals)**: `24px` للحواف العلوية (`rounded-3xl`).
- **الشارات والأيقونات الدائرية**: `9999px` (`rounded-full`).

### 🌫️ الظلال (Elevation / Shadows):
- **Card Shadow**: `0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)`
- **Floating Button / Bottom Bar**: `0 10px 25px -5px rgba(0, 92, 85, 0.2)`
- **Modal Shadow**: `0 25px 50px -12px rgba(0, 0, 0, 0.25)`

---

## 6. الحركات والتفاعلات (Motion & Animations)

1. **الضغط على الأزرار والبطاقات**:
   - تقليص طفيف: `transform: scale(0.97)` خلال `120ms` مع اهتزاز لمسي خفيف (Light Haptic).
2. **الانتقال بين الشاشات**:
   - انزلاق ناعم مع تلاشي (Slide & Fade Transition): `duration: 250ms, curve: Curves.easeOutCubic`.
3. **فتح الـ Bottom Sheet**:
   - صعود سلس من الأسفل: `duration: 300ms, curve: Curves.fastOutSlowIn`.
4. **تحديث حالة مرحلة (Toggle Stage)**:
   - وميض نبضي لطيف وتغيير لون الشارة فورياً مع عرض Toast نجاح منبثق من الأعلى أو الأسفل.

---

## 7. الهيكل التفاعلي لشاشات الموبايل (Mobile Navigation Architecture)

```
[ شاشة الدخول المركزية CentralLoginPortal ]
                  │
                  ▼
[ الهيكل الأساسي للتطبيق مع Bottom Navigation Bar ]
 ├── 1. 🏠 الرئيسية (Home Dashboard)
 ├── 2. 📋 كشف الدورات (Summer Course Tracker Matrix)
 ├── 3. 👥 اللجان والمراحل (Committees & Stages)
 ├── 4. 📚 الامتحانات (Exams Bank)
 └── 5. 📅 التقويم والمهام (Schedule & Calendar)
                  │
        [ الشريط الجانبي / القائمة العلوية ]
         ├── 🎓 حفلات التكريم (Ceremonies)
         ├── 📊 الإحصائيات الشاملة (Statistics)
         ├── 🚨 التنبيهات اليومية (Daily Alerts)
         ├── 👮 المعاونون والصلاحيات (Assistants & RBAC)
         └── 🗄️ قاعدة بيانات Supabase (Live Inspector)
```
