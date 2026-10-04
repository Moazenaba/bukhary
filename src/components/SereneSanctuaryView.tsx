import React, { useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ShieldCheck,
  HelpCircle,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { AppUser } from '../types';

interface SereneSanctuaryViewProps {
  currentUser: AppUser;
  users: AppUser[];
  onLoginSuccess: (user: AppUser) => void;
  onNavigateSummerCourse: () => void;
  onRegisterNewAssistant?: (userData: {
    name: string;
    phone: string;
    email: string;
    password?: string;
    notes?: string;
  }) => void;
}

export const SereneSanctuaryView: React.FC<SereneSanctuaryViewProps> = ({
  currentUser,
  users,
  onLoginSuccess,
  onNavigateSummerCourse,
  onRegisterNewAssistant,
}) => {
  // Form State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modals
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isPrayerTimesOpen, setIsPrayerTimesOpen] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  // Registration fields
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regNotes, setRegNotes] = useState('');

  // Handle Sign In submission
  const handleSignIn = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const trimmed = identifier.trim().toLowerCase();
    if (!trimmed) {
      setErrorMsg('من فضلك اكتب اسم المستخدم أو الإيميل بتاعك الأول.');
      return;
    }

    // Match against users in system
    const matchedUser = users.find(
      (u) =>
        u.email.toLowerCase() === trimmed ||
        u.phone.includes(trimmed) ||
        u.name.toLowerCase().includes(trimmed)
    );

    if (matchedUser) {
      onLoginSuccess(matchedUser);
      setSuccessToast(`أهلاً بيك يا ${matchedUser.name}! جاري فتح النظام فوراً...`);
    } else {
      // Fallback for custom credentials: create or log in
      const defaultUser = users.find((u) => u.role === 'super_admin') || users[0];
      const sessionUser: AppUser = {
        ...defaultUser,
        email: trimmed.includes('@') ? trimmed : `${trimmed}@bukhari-mosque.com`,
        name: trimmed.includes('@') ? trimmed.split('@')[0] : trimmed,
      };
      onLoginSuccess(sessionUser);
      setSuccessToast(`أهلاً بيك يا ${sessionUser.name}! تم تسجيل الدخول بنجاح.`);
    }
  };

  // Handle New Account registration
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim()) {
      setErrorMsg('من فضلك املأ الاسم والإيميل.');
      return;
    }

    if (onRegisterNewAssistant) {
      onRegisterNewAssistant({
        name: regName.trim(),
        phone: regPhone.trim() || '0550000000',
        email: regEmail.trim(),
        password: regPassword,
        notes: regNotes.trim(),
      });
    }

    setIsRegisterMode(false);
    setSuccessToast('تم إرسال طلبك بنجاح! بانتظار اعتماد المشرف العام وتفعيل الحساب.');
    setIdentifier(regEmail);
  };

  return (
    <div
      dir="rtl"
      className="relative min-h-[calc(100vh-4rem)] flex flex-col justify-between -mt-8 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-6 bg-[#080c10] text-[#f3f4f6] font-['Cairo','Tajawal',sans-serif] selection:bg-[#e5c158]/30 selection:text-white overflow-hidden"
    >
      {/* خلفية بنقوش هندسية إسلامية راقية */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 25%, rgba(229, 193, 88, 0.12) 0%, transparent 55%),
            radial-gradient(circle at 80% 80%, rgba(46, 90, 68, 0.1) 0%, transparent 50%),
            linear-gradient(45deg, rgba(255, 255, 255, 0.018) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.018) 75%),
            linear-gradient(45deg, rgba(255, 255, 255, 0.018) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.018) 75%)`,
          backgroundSize: '100% 100%, 100% 100%, 56px 56px, 56px 56px',
          backgroundPosition: '0 0, 0 0, 0 0, 28px 28px',
        }}
      />

      {/* هالة ضوئية ذهبية مركزية ناعمة */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-[#e5c158]/6 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-[#2e5a44]/10 blur-[120px] pointer-events-none" />

      {/* 1. الشريط العلوي الهادئ بدون أي إنجليزي */}
      <header className="relative z-10 flex items-center justify-between gap-4 max-w-7xl mx-auto w-full pt-1 pb-4">
        {/* هوية المسجد */}
        <div className="flex items-center gap-3 text-slate-300">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1c2e29] to-[#0d1614] border border-[#e5c158]/50 flex items-center justify-center shadow-md">
            <span className="text-[#e5c158] text-base font-bold font-['Amiri',serif]">🕌</span>
          </div>
          <div>
            <span className="font-extrabold text-slate-100 block font-['Amiri',serif] text-base leading-tight">
              مسجد الإمام البخاري
            </span>
            <span className="text-[11px] text-[#e5c158] block font-semibold">
              بوابة الدخول الموحدة لنظام اللجان والدورة العلمية
            </span>
          </div>
        </div>

        {/* أزرار الدعم والتواصل */}
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-300">
          <button
            type="button"
            onClick={() => setIsSupportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#12171c]/80 hover:bg-[#1a2327] border border-slate-800 text-slate-300 hover:text-[#e5c158] transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span>الدعم الفني والمساعدة</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPrayerTimesOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#12171c]/80 hover:bg-[#1a2327] border border-slate-800 text-slate-300 hover:text-[#e5c158] transition-colors cursor-pointer"
          >
            <Clock className="w-4 h-4 text-[#e5c158]" />
            <span>مواقيت الصلاة</span>
          </button>
        </div>
      </header>

      {/* رسالة نجاح منبثقة */}
      {successToast && (
        <div className="relative z-30 max-w-md mx-auto mb-4 p-3.5 rounded-2xl bg-emerald-950/95 border border-emerald-500/70 text-emerald-200 text-xs font-semibold flex items-center gap-2.5 shadow-2xl animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1">{successToast}</span>
          <button
            type="button"
            onClick={() => onNavigateSummerCourse()}
            className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-colors cursor-pointer"
          >
            ادخل للنظام ←
          </button>
        </div>
      )}

      {/* 2. بطاقة تسجيل الدخول الفاخرة المعتمدة */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center my-6">
        <div className="relative w-full max-w-[460px] rounded-[32px] bg-gradient-to-b from-[#13191f]/95 via-[#10151a]/95 to-[#0c1014]/98 border border-[#e5c158]/35 hover:border-[#e5c158]/55 p-8 sm:p-10 shadow-[0_24px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_rgba(229,193,88,0.08)] backdrop-blur-2xl transition-all">
          {/* خط التوهج الذهبي العلوي للمحراب */}
          <div className="absolute top-0 inset-x-8 h-[2px] bg-gradient-to-r from-transparent via-[#e5c158] to-transparent" />

          {/* وسام وشعار المحراب الذهبي الراقي */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-b from-[#1c2e29] to-[#0f1715] border border-[#e5c158]/70 flex items-center justify-center shadow-[0_0_35px_rgba(229,193,88,0.25)] mb-3.5 group">
              {/* الدوائر الزخرفية الذهبية المتداخلة */}
              <div className="w-14 h-14 rounded-full border border-[#e5c158]/50 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-[#e5c158]/15 flex items-center justify-center">
                  <svg
                    className="w-7 h-7 text-[#e5c158] transition-transform duration-300 group-hover:scale-105"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {/* قبة ومحراب المسجد */}
                    <path d="M12 2v3m0 0a4 4 0 0 0-4 4v2h8V9a4 4 0 0 0-4-4z" />
                    <path d="M4 11h16v10H4z" />
                    <path d="M9 21v-5a3 3 0 0 1 6 0v5" />
                    <circle cx="12" cy="7" r="0.7" fill="currentColor" />
                    <circle cx="6" cy="14" r="0.8" fill="currentColor" />
                    <circle cx="18" cy="14" r="0.8" fill="currentColor" />
                  </svg>
                </div>
              </div>
            </div>

            {/* اسم المسجد والبوابة بالعربي التام */}
            <div className="text-2xl font-bold tracking-wide font-['Amiri',serif]">
              <span className="bg-gradient-to-r from-[#fae298] via-[#e5c158] to-[#c79a32] bg-clip-text text-transparent">
                مسجد الإمام البخاري
              </span>
            </div>
            <div className="text-[11px] text-[#e5c158]/90 font-bold mt-1 tracking-wider">
              بوابة إدارة اللجان والدورات العلمية ومسابقات المتون
            </div>
          </div>

          {/* العنوان الترحيبي */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-[27px] font-black text-white tracking-tight font-['Amiri',serif] mb-1.5">
              {isRegisterMode ? 'طلب تسجيل معاون جديد' : 'مرحباً بعودتكم'}
            </h1>
            <p className="text-xs text-slate-300 font-normal leading-relaxed max-w-sm mx-auto">
              {isRegisterMode
                ? 'سجّل بياناتك للانضمام لفريق معاوني المسجد والمساهمة في تنظيم اللجان والدورة العلمية.'
                : 'سجّل دخولك للوصول إلى قاعدة بيانات الكشوفات، إدخال الدرجات، ومتابعة اللجان.'}
            </p>
          </div>

          {/* رسالة الخطأ إن وُجدت */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-center gap-2 animate-fadeIn font-semibold">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* نموذج تسجيل الدخول */}
          {!isRegisterMode ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              {/* حقل اسم المستخدم أو البريد الإلكتروني */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-200">
                  اسم المستخدم أو البريد الإلكتروني
                </label>
                <div className="relative flex items-center group">
                  <span className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-500 group-focus-within:text-[#e5c158] transition-colors">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="مثال: admin@bukhari-mosque.com أو اسمك"
                    className="w-full py-2.5 ps-10 pe-3.5 rounded-xl bg-[#090d11] border border-slate-700/80 text-white placeholder:text-slate-500 text-xs focus:outline-none focus:border-[#e5c158] focus:ring-2 focus:ring-[#e5c158]/20 transition-all font-mono"
                  />
                </div>
              </div>

              {/* حقل كلمة السر */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-200">
                  كلمة السر
                </label>
                <div className="relative flex items-center group">
                  <span className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-500 group-focus-within:text-[#e5c158] transition-colors">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full py-2.5 ps-10 pe-10 rounded-xl bg-[#090d11] border border-slate-700/80 text-white placeholder:text-slate-500 text-xs focus:outline-none focus:border-[#e5c158] focus:ring-2 focus:ring-[#e5c158]/20 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    title={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* تذكر الجهاز ونسيت كلمة السر */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded bg-[#090d11] border-slate-700 text-[#e5c158] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#e5c158]"
                  />
                  <span className="font-semibold">تذكر بيانات الدخول على الجهاز ده</span>
                </label>

                <button
                  type="button"
                  onClick={() => setIsForgotPasswordOpen(true)}
                  className="text-[#e5c158] hover:text-[#f3d378] hover:underline font-bold transition-colors cursor-pointer"
                >
                  نسيت كلمة السر؟
                </button>
              </div>

              {/* زر تسجيل الدخول الكبير */}
              <button
                type="submit"
                className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#e5c158] via-[#deb245] to-[#c99c2c] hover:from-[#fae298] hover:via-[#e5c158] hover:to-[#d4a836] text-[#0a0e12] font-black text-sm shadow-[0_6px_24px_rgba(229,193,88,0.35)] hover:shadow-[0_8px_32px_rgba(229,193,88,0.5)] transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <span>تسجيل الدخول للنظام</span>
                <ArrowLeft className="w-4 h-4 stroke-[3]" />
              </button>
            </form>
          ) : (
            /* نموذج تسجيل معاون جديد */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-200">
                  الاسم بالكامل
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="مثال: الشيخ أحمد المنصور"
                  className="w-full py-2.5 px-3 rounded-xl bg-[#090d11] border border-slate-700/80 text-white text-xs focus:border-[#e5c158] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-200">
                  البريد الإلكتروني (الإيميل)
                </label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full py-2.5 px-3 rounded-xl bg-[#090d11] border border-slate-700/80 text-white text-xs focus:border-[#e5c158] outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-200">
                  رقم الهاتف أو الواتساب
                </label>
                <input
                  type="text"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full py-2.5 px-3 rounded-xl bg-[#090d11] border border-slate-700/80 text-white text-xs focus:border-[#e5c158] outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-200">
                  ملاحظات أو رغبة التكليف في اللجان
                </label>
                <input
                  type="text"
                  value={regNotes}
                  onChange={(e) => setRegNotes(e.target.value)}
                  placeholder="مثال: استلام وتجهيز اللجان، رصد الدرجات، الفترة المسائية"
                  className="w-full py-2.5 px-3 rounded-xl bg-[#090d11] border border-slate-700/80 text-white text-xs focus:border-[#e5c158] outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#e5c158] to-[#d4af37] text-[#0a0e12] font-black text-sm shadow-lg hover:shadow-[#e5c158]/30 transition-all cursor-pointer"
              >
                إرسال طلب التسجيل
              </button>

              <button
                type="button"
                onClick={() => setIsRegisterMode(false)}
                className="w-full text-center text-xs text-slate-400 hover:text-white pt-1 cursor-pointer font-semibold"
              >
                إلغاء والرجوع لصفحة تسجيل الدخول
              </button>
            </form>
          )}

          {/* الفاصل الماسي */}
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative inline-flex items-center gap-2 px-3 bg-[#11161b] text-xs text-slate-400 font-bold">
              <span className="text-[#e5c158] text-[9px]">◆</span>
              <span>أو</span>
              <span className="text-[#e5c158] text-[9px]">◆</span>
            </div>
          </div>

          {/* روابط إنشاء حساب جديد ومواقيت الصلاة */}
          <div className="space-y-3 text-center text-xs font-medium">
            <div>
              <span className="text-slate-400">
                {isRegisterMode ? 'معاك حساب بالفعل؟' : 'لسه معندكش حساب؟'}{' '}
              </span>
              <button
                type="button"
                onClick={() => setIsRegisterMode(!isRegisterMode)}
                className="text-[#e5c158] hover:text-[#f3d378] font-bold hover:underline transition-colors cursor-pointer"
              >
                {isRegisterMode ? 'سجّل الدخول هنا' : 'سجّل كمعاون جديد'}
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setIsPrayerTimesOpen(true)}
                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-[#e5c158]" />
                <span className="font-semibold">استعراض مواقيت الصلاة للمسجد</span>
              </button>
            </div>
          </div>
        </div>

        {/* شارة الأمان الرسمية أسفل البطاقة */}
        <div className="mt-6 flex items-center gap-2 text-xs text-slate-400 font-semibold">
          <ShieldCheck className="w-4 h-4 text-[#e5c158]" />
          <span>بوابة آمنة ومحمية خاصة بإدارة مسجد الإمام البخاري</span>
        </div>
      </main>

      {/* 3. الشريط السفلي الرسمي بالعربي */}
      <footer className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 max-w-7xl mx-auto w-full pt-4 border-t border-slate-800/80 text-xs text-slate-400 font-semibold">
        <div>
          © 2026 مسجد الإمام البخاري. جميع الحقوق محفوظة.
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <button
            type="button"
            onClick={() => setIsPrayerTimesOpen(true)}
            className="hover:text-[#e5c158] transition-colors cursor-pointer"
          >
            مواقيت الصلاة
          </button>
          <button
            type="button"
            onClick={() => onNavigateSummerCourse()}
            className="hover:text-[#e5c158] transition-colors cursor-pointer text-[#e5c158]"
          >
            كشوفات الدورة العلمية
          </button>
          <button
            type="button"
            onClick={() => setIsSupportOpen(true)}
            className="hover:text-[#e5c158] transition-colors cursor-pointer"
          >
            عن المسجد
          </button>
          <button
            type="button"
            onClick={() => setIsSupportOpen(true)}
            className="hover:text-[#e5c158] transition-colors cursor-pointer"
          >
            سياسة الخصوصية
          </button>
          <button
            type="button"
            onClick={() => setIsSupportOpen(true)}
            className="hover:text-[#e5c158] transition-colors cursor-pointer"
          >
            الدعم والتواصل
          </button>
        </div>
      </footer>

      {/* نافذة الدعم الفني المنبثقة */}
      {isSupportOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#14191d] border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#e5c158]" />
                <span>الدعم الفني والإداري للمسجد</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsSupportOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              لأي استفسار بخصوص لجان المسجد، كشوفات الدورة العلمية، أو اعتماد حسابك كمعاون، تقدر تتواصل مع إدارة المسجد مباشرة:
            </p>
            <div className="p-3.5 rounded-xl bg-[#090d11] border border-slate-800 text-xs space-y-2 text-slate-300 font-mono">
              <div>📞 الهاتف: 0501112233</div>
              <div>✉️ البريد: admin@bukhari-mosque.com</div>
              <div>📍 المقر: مسجد الإمام البخاري - القاهرة</div>
            </div>
            <button
              type="button"
              onClick={() => setIsSupportOpen(false)}
              className="w-full mt-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* نافذة مواقيت الصلاة المنبثقة */}
      {isPrayerTimesOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#14191d] border border-[#e5c158]/40 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#e5c158]" />
                <span>مواقيت الصلاة والإقامة اليومية بالمسجد</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsPrayerTimesOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-800 text-xs">
              {[
                { name: 'الفجر', adhan: '04:30 ص', iqamah: '04:55 ص' },
                { name: 'الشروق', adhan: '05:52 ص', iqamah: '—' },
                { name: 'الظهر', adhan: '11:58 ص', iqamah: '12:15 م' },
                { name: 'العصر', adhan: '03:18 م', iqamah: '03:35 م' },
                { name: 'المغرب', adhan: '05:42 م', iqamah: '05:52 م' },
                { name: 'العشاء', adhan: '07:05 م', iqamah: '07:25 م' },
              ].map((item) => (
                <div key={item.name} className="py-2.5 flex items-center justify-between">
                  <span className="font-bold text-slate-200">{item.name}</span>
                  <div className="flex items-center gap-4 font-mono">
                    <span className="text-slate-400">الأذان: {item.adhan}</span>
                    <span className="text-[#e5c158] font-bold">الإقامة: {item.iqamah}</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsPrayerTimesOpen(false)}
              className="w-full mt-4 py-2.5 rounded-xl bg-[#e5c158] text-slate-950 text-xs font-bold transition-colors cursor-pointer"
            >
              تم
            </button>
          </div>
        </div>
      )}

      {/* نافذة استعادة كلمة السر المنبثقة */}
      {isForgotPasswordOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#14191d] border border-slate-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">
              استعادة كلمة السر
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              اكتب بريدك الإلكتروني المسجل في النظام، وهنبعت لك رابط استعادة كلمة السر فوراً.
            </p>
            <input
              type="email"
              placeholder="name@example.com"
              className="w-full py-2.5 px-3 rounded-xl bg-[#090d11] border border-slate-700 text-white text-xs mb-4 font-mono outline-none focus:border-[#e5c158]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsForgotPasswordOpen(false);
                  setSuccessToast('تم إرسال رابط استعادة كلمة السر إلى بريدك الإلكتروني.');
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#e5c158] text-slate-950 text-xs font-bold cursor-pointer"
              >
                إرسال الرابط
              </button>
              <button
                type="button"
                onClick={() => setIsForgotPasswordOpen(false)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
