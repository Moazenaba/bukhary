import React, { useState } from 'react';
import { UserRole } from '../types';
import { AuthService } from '../services/AuthService';
import { errorMessage } from '../services/api';

interface JoinReceipt {
  requestCode: string;
  name: string;
  phone: string;
  role: UserRole;
  quranLevel?: string;
}

/** Same rule as the server (server/routes/users.ts passwordSchema). */
function passwordProblem(p: string): string | null {
  if (p.length < 8) return 'كلمة المرور يجب ألا تقل عن 8 أحرف.';
  if (!/[A-Za-z\u0600-\u06FF]/.test(p) || !/[0-9]/.test(p)) return 'كلمة المرور يجب أن تحتوي على حروف وأرقام (0-9).';
  return null;
}

/** Phone typed with Arabic or Latin digits, spaces or dashes; the server normalises it. */
const PHONE_PATTERN = /^\+?[0-9\u0660-\u0669\u06F0-\u06F9\s-]{6,30}$/;

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد مراجعة المشرف العام',
  interview: 'تم تحديد موعد مقابلة شخصية',
  approved: 'تم اعتماد الحساب، يمكنك تسجيل الدخول',
  rejected: 'تم الاعتذار عن قبول الطلب',
};

/** Login, join request and request tracking. Every outcome comes from the server. */
export const CentralLoginPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'register' | 'track' | 'login'>('login');

  // Login form state
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Join request form
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regWhatsapp, setRegWhatsapp] = useState('');
  const [regNationalId, setRegNationalId] = useState('');
  const [regQuranLevel, setRegQuranLevel] = useState('');
  const [regQualification, setRegQualification] = useState('');
  const [regExperience, setRegExperience] = useState('');
  const [regAvailability, setRegAvailability] = useState('');
  const [regPreferredCommitteesText, setRegPreferredCommitteesText] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('assistant');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regNotes, setRegNotes] = useState('');
  const [regError, setRegError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [submittedReceipt, setSubmittedReceipt] = useState<JoinReceipt | null>(null);

  // Tracking by the server-issued request code
  const [trackQuery, setTrackQuery] = useState('');
  const [trackResult, setTrackResult] = useState<{ status: string; interviewDate?: string } | null>(null);
  const [trackSearched, setTrackSearched] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);

  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!emailOrPhone.trim() || !password) {
      setLoginError('يرجى كتابة رقم الهاتف أو البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setIsSubmitting(true);
    const result = await AuthService.login(emailOrPhone, password);
    setIsSubmitting(false);
    // On success AuthService notifies App, which switches to the main screen.
    if (!result.success) setLoginError(result.error || 'فشل تسجيل الدخول، يرجى التحقق من البيانات.');
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    if (!regName.trim() || !regPhone.trim() || !regPassword) {
      setRegError('يرجى ملء الحقول الإلزامية: الاسم الكامل، رقم الهاتف، وكلمة المرور.');
      return;
    }
    if (!PHONE_PATTERN.test(regPhone.trim())) {
      setRegError('رقم الهاتف غير صحيح.');
      return;
    }
    const pwProblem = passwordProblem(regPassword);
    if (pwProblem) {
      setRegError(pwProblem);
      return;
    }
    const preferredCommittees = regPreferredCommitteesText
      .split(/[,،\s]+/)
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);
    setIsRegistering(true);
    try {
      const requestCode = await AuthService.submitJoinRequest({
        name: regName.trim(),
        phone: regPhone.trim(),
        whatsapp: regWhatsapp.trim() || undefined,
        nationalId: regNationalId.trim() || undefined,
        role: regRole,
        password: regPassword,
        quranLevel: regQuranLevel.trim() || undefined,
        qualification: regQualification.trim() || undefined,
        experience: regExperience.trim() || undefined,
        availability: regAvailability || undefined,
        preferredCommittees,
        notes: regNotes.trim() || undefined,
      });
      setSubmittedReceipt({ requestCode, name: regName.trim(), phone: regPhone.trim(), role: regRole, quranLevel: regQuranLevel.trim() });
      setTrackQuery(requestCode);
      setRegPassword('');
    } catch (err) {
      setRegError(errorMessage(err));
    } finally {
      setIsRegistering(false);
    }
  };

  const resetJoinForm = () => {
    setSubmittedReceipt(null);
    setRegName('');
    setRegPhone('');
    setRegWhatsapp('');
    setRegNationalId('');
    setRegQuranLevel('');
    setRegQualification('');
    setRegExperience('');
    setRegAvailability('');
    setRegPreferredCommitteesText('');
    setRegRole('assistant');
    setRegPassword('');
    setRegNotes('');
    setRegError(null);
  };

  const [codeCopied, setCodeCopied] = useState(false);
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } catch {
      // Clipboard blocked: the code stays on screen to copy by hand.
    }
  };

  const lookUp = async (code: string) => {
    setTrackError(null);
    setTrackSearched(true);
    try {
      setTrackResult(await AuthService.trackJoinRequest(code));
    } catch (err) {
      setTrackResult(null);
      setTrackError(errorMessage(err));
    }
  };

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackQuery.trim()) lookUp(trackQuery);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#022824] via-[#004d47] to-[#04332e] text-ink font-sans flex flex-col justify-between selection:bg-brand-light selection:text-[#00201d] relative overflow-x-hidden">
      {/* Background Islamic Pattern Ambient Overlay */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `radial-gradient(circle at 25px 25px, rgba(255, 255, 255, 0.4) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(255, 255, 255, 0.4) 2%, transparent 0%)`,
          backgroundSize: '100px 100px',
        }}
      />

      {/* Top Database Status & Security Bar */}
      <header className="relative z-10 border-b border-emerald-500/20 bg-emerald-950/40 backdrop-blur-md px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-100">
          {/* Right: Mosque Title & System Badge */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/40 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-sm">
              <span className="material-symbols-outlined text-2xl">mosque</span>
            </div>
            <div>
              <span className="font-black text-white text-sm sm:text-base tracking-wide block">
                بوابة مسجد الإمام البخاري الرقمية
              </span>
              <span className="text-xs text-emerald-300 font-medium">
                منظومة إدارة لجان المسابقات القرآنية والدورات العلمية
              </span>
            </div>
          </div>


        </div>
      </header>

      {/* Main Center Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-3 sm:p-6 lg:p-8">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          
          {/* Right Column: Hero Information & Overview (4 Cols) */}
          <div className="lg:col-span-4 text-white space-y-5 text-right hidden lg:block">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-semibold backdrop-blur-xs">
              <span className="material-symbols-outlined text-sm text-amber-300">verified_user</span>
              <span>بوابة الانضمام وإدارة اللجان</span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight mb-2.5">
                فريق عمل لجان مسجد البخاري
              </h1>
              <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed">
                مرحباً بك في المنظومة الرقمية لإدارة لجان المسابقات القرآنية والدورات العلمية. بإمكان الراغبين في الانضمام لفريق العمل تقديم طلب انضمام رسمي، ودراسة الطلب من المشرف العام وتوزيع اللجان الميدانية.
              </p>
            </div>

            {/* Workflow Steps */}
            <div className="space-y-2.5 pt-1">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-emerald-400/20 text-emerald-300 flex items-center justify-center shrink-0 font-bold text-xs">
                  ١
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">تقديم طلب الانضمام</h4>
                  <p className="text-xs text-emerald-200/80">
                    تسجيل البيانات، مقدار الحفظ، المؤهل، واللجان المرغوبة.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0 font-bold text-xs">
                  ٢
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">المراجعة والمقابلة والاعتماد</h4>
                  <p className="text-xs text-emerald-200/80">
                    مراجعة المشرف العام وتحديد موعد المقابلة وإسناد اللجان.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-cyan-400/20 text-cyan-300 flex items-center justify-center shrink-0 font-bold text-xs">
                  ٣
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">استلام اللجان وبدء المهام</h4>
                  <p className="text-xs text-emerald-200/80">
                    تسجيل الدخول ومتابعة كشوفات الطلاب ورصد الدرجات.
                  </p>
                </div>
              </div>
            </div>

            {/* Quote / Islamic Note */}
            <div className="border-r-2 border-amber-400/60 pr-3 py-1 text-xs text-emerald-200/90 italic">
              «خيركم من تعلم القرآن وعلمه» - خدمة أهل القرآن شرف ومسؤولية.
            </div>
          </div>

          {/* Left Column: Form & Interaction Hub (8 Cols) */}
          <div className="lg:col-span-8 w-full">
            <div className="bg-white rounded-3xl shadow-2xl border border-emerald-600/30 overflow-hidden text-right">
              
              {/* Tab Navigation Header */}
              <div className="bg-gradient-to-l from-[#004d47] to-[#00665e] p-4 sm:p-5 text-white">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-300">
                        {activeTab === 'register' ? 'how_to_reg' : activeTab === 'track' ? 'travel_explore' : 'vpn_key'}
                      </span>
                      <span>
                        {activeTab === 'register'
                          ? 'استمارة تقديم طلب انضمام جديد'
                          : activeTab === 'track'
                          ? 'تتبع حالة طلب الانضمام والاستعلام'
                          : 'تسجيل الدخول للمعتمدين'}
                      </span>
                    </h2>
                    <p className="text-xs text-emerald-100 mt-0.5">
                      {activeTab === 'register'
                        ? 'املأ بياناتك لتقديم طلب انضمام رسمي لفريق لجان مسجد البخاري'
                        : activeTab === 'track'
                        ? 'استعلم بكود الطلب لمعرفة حالة الاعتماد'
                        : 'أدخل بيانات حسابك المعتمد للدخول إلى لوحة التحكم'}
                    </p>
                  </div>

                  <span className="text-xs bg-white/20 text-emerald-100 px-3 py-1 rounded-full font-mono shrink-0">
                    Bukhari Portal {new Date().getFullYear()}
                  </span>
                </div>

                {/* Tabs Switcher: 3 Clear Modes */}
                <div role="tablist" aria-label="خيارات الدخول" className="grid grid-cols-3 bg-black/25 p-1 rounded-xl gap-1 text-xs font-bold">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'register'}
                    onClick={() => {
                      setActiveTab('register');
                      setLoginError(null);
                    }}
                    className={`py-2 sm:py-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      activeTab === 'register'
                        ? 'bg-white text-[#004d47] shadow-sm font-black'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">person_add</span>
                    <span>طلب انضمام</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'track'}
                    onClick={() => {
                      setActiveTab('track');
                      setLoginError(null);
                    }}
                    className={`py-2 sm:py-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      activeTab === 'track'
                        ? 'bg-white text-[#004d47] shadow-sm font-black'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">search_check</span>
                    <span>تتبع الطلب</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'login'}
                    onClick={() => {
                      setActiveTab('login');
                      setLoginError(null);
                    }}
                    className={`py-2 sm:py-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      activeTab === 'login'
                        ? 'bg-white text-[#004d47] shadow-sm font-black'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">login</span>
                    <span>تسجيل الدخول</span>
                  </button>
                </div>
              </div>

              {/* TAB 1: JOIN REQUEST FORM (طلب انضمام جديد متكامل) */}
              {activeTab === 'register' && (
                <div className="p-5 sm:p-7 space-y-5">
                  {submittedReceipt ? (
                    <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-400 text-right space-y-4 animate-in fade-in">
                      <div className="flex items-center justify-between gap-3 border-b border-emerald-200 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xl font-bold shadow-xs">
                            ✓
                          </div>
                          <div>
                            <h3 className="font-black text-sm sm:text-base text-emerald-950">
                              تم تسجيل طلب الانضمام بنجاح!
                            </h3>
                            <p className="text-xs text-emerald-800">
                              وصل طلبك لإدارة لجان مسجد البخاري وهو قيد الدراسة والاعتماد.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span dir="ltr" className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 select-all">
                            {submittedReceipt.requestCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyCode(submittedReceipt.requestCode)}
                            className="px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-amber-900 text-xs font-bold cursor-pointer"
                          >
                            {codeCopied ? 'تم النسخ ✓' : 'نسخ الكود'}
                          </button>
                        </div>
                      </div>
                      <p role="note" className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        احتفظ بكود الطلب: هو الطريقة الوحيدة لمتابعة حالة طلبك، ولن يظهر مرة أخرى بعد مغادرة هذه الصفحة.
                      </p>

                      {/* Applicant Summary Card */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-white border border-emerald-200 text-xs">
                        <div>
                          <span className="text-slate-500 block text-xs">اسم المتقدم:</span>
                          <strong className="text-emerald-950 font-bold">{submittedReceipt.name}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-xs">رقم الجوال المسجل:</span>
                          <strong className="font-mono text-emerald-950 font-bold">{submittedReceipt.phone}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-xs">الدور والمهمة المطلوبة:</span>
                          <strong className="text-brand font-bold">{AuthService.getRoleLabel(submittedReceipt.role)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-xs">مقدار حفظ القرآن:</span>
                          <strong className="text-slate-800 font-bold">{submittedReceipt.quranLevel || 'غير محدد'}</strong>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-500 block text-xs">حالة الطلب الآن:</span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold text-xs mt-1 border border-amber-300">
                            <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                            <span>قيد مراجعة المشرف العام وتوزيع اللجان الميدانية</span>
                          </span>
                        </div>
                      </div>

                      {/* Instructions & Next Steps */}
                      <div className="p-3.5 rounded-xl bg-emerald-900/10 border border-emerald-300 text-xs text-emerald-950 space-y-1.5">
                        <strong className="font-bold flex items-center gap-1 text-emerald-900">
                          <span className="material-symbols-outlined text-sm">info</span>
                          <span>ماذا سيحدث بعد إرسال الطلب؟</span>
                        </strong>
                        <p className="text-xs text-emerald-900 leading-relaxed">
                          1. سيقوم فضيلة المشرف العام بمراجعة مؤهلاتك وحفظك للقرآن الكريم.
                          <br />
                          2. سيتم إسناد اللجان الميدانية وتفعيل صلاحيات الدخول، أو جدولة مقابلة شخصية.
                          <br />
                          3. يمكنك تتبع حالة طلبك في أي لحظة باستخدام كود الطلب الظاهر أعلاه في تبويب <strong>«تتبع الطلب»</strong>.
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setTrackQuery(submittedReceipt.requestCode);
                            setActiveTab('track');
                            lookUp(submittedReceipt.requestCode);
                          }}
                          className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold text-xs cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">search</span>
                          <span>متابعة وتتبع حالة هذا الطلب الآن</span>
                        </button>

                        <button
                          type="button"
                          onClick={resetJoinForm}
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-950 font-bold text-xs cursor-pointer"
                        >
                          تقديم طلب انضمام آخر
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                      
                      {/* Section 1: Personal & Contact Details */}
                      <div className="p-4 rounded-2xl bg-[#f8fafc] border border-slate-200 space-y-3">
                        <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                          <span className="material-symbols-outlined text-sm text-brand">badge</span>
                          <span>١. البيانات الشخصية ومعلومات التواصل:</span>
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              الاسم الرباعي الكامل <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              autoComplete="name"
                              maxLength={200}
                              placeholder="مثال: معاذ بن سعد العتيبي"
                              value={regName}
                              onChange={(e) => setRegName(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              رقم الجوال (اسم الدخول) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="tel"
                              required
                              autoComplete="tel"
                              inputMode="tel"
                              maxLength={30}
                              placeholder="مثال: 0501234567"
                              value={regPhone}
                              onChange={(e) => setRegPhone(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand font-mono text-left"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              رقم الواتساب (للتواصل السريع)
                            </label>
                            <input
                              type="tel"
                              placeholder="نفس رقم الجوال أو رقم آخر..."
                              value={regWhatsapp}
                              onChange={(e) => setRegWhatsapp(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand font-mono text-left"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              رقم الهوية الوطنية / الإقامة (اختياري)
                            </label>
                            <input
                              type="text"
                              placeholder="رقم الهوية..."
                              value={regNationalId}
                              onChange={(e) => setRegNationalId(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand font-mono text-left"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Qualifications & Quran Level */}
                      <div className="p-4 rounded-2xl bg-[#f8fafc] border border-slate-200 space-y-3">
                        <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                          <span className="material-symbols-outlined text-sm text-brand">menu_book</span>
                          <span>٢. المؤهل العلمي ومقدار حفظ القرآن الكريم والخبرات:</span>
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              مقدار حفظ القرآن الكريم والإجازات
                            </label>
                            <select
                              value={regQuranLevel}
                              onChange={(e) => setRegQuranLevel(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                            >
                              <option value="">اختر مقدار الحفظ...</option>
                              <option value="حفظ القرآن كاملاً مع إجازة بالقراءات">حفظ القرآن كاملاً مع إجازة بالقراءات</option>
                              <option value="حفظ القرآن كاملاً مع إجازة برواية حفص">حفظ القرآن كاملاً مع إجازة برواية حفص</option>
                              <option value="حفظ القرآن الكريم كاملاً">حفظ القرآن الكريم كاملاً</option>
                              <option value="حفظ عشرين جزءاً فأكثر">حفظ عشرين جزءاً فأكثر</option>
                              <option value="حفظ خمسة عشر جزءاً">حفظ خمسة عشر جزءاً</option>
                              <option value="حفظ عشرة أجزاء">حفظ عشرة أجزاء</option>
                              <option value="حفظ خمسة أجزاء">حفظ خمسة أجزاء</option>
                              <option value="طالب علم وإداري تقني">طالب علم وإداري تقني</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              المؤهل العلمي والتخصص
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: بكالوريوس شريعة / أصول دين / حاسب..."
                              value={regQualification}
                              onChange={(e) => setRegQualification(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              الخبرات السابقة في لجان المساجد والمسابقات القرآنية
                            </label>
                            <input
                              type="text"
                              placeholder="اذكر خبراتك السابقة في التنظيم، الاختبارات، أو التحكيم..."
                              value={regExperience}
                              onChange={(e) => setRegExperience(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Role, Shifts, Committees & Password */}
                      <div className="p-4 rounded-2xl bg-[#f8fafc] border border-slate-200 space-y-3">
                        <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                          <span className="material-symbols-outlined text-sm text-brand">tune</span>
                          <span>٣. الدور المطلوب، أوقات التفرغ، وكلمة المرور:</span>
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              الدور المطلوب
                            </label>
                            <select
                              value={regRole}
                              onChange={(e) => setRegRole(e.target.value as UserRole)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand font-bold text-brand"
                            >
                              <option value="assistant">معاون ميداني معتمد (استلام اللجان ومتابعة الطلاب)</option>
                              <option value="teacher">معلم ومقرئ (اختبار الطلاب والتحكيم)</option>
                              <option value="committee_head">رئيس لجنة ومقرئ (إدارة الاختبارات والاعتماد)</option>
                              <option value="auditor">مراجع ومدقق جودة (رقابة ورصد الدرجات)</option>
                            </select>
                            <span className="text-xs text-slate-500 block mt-0.5">
                              هذا طلب فقط؛ الدور النهائي يحدده المشرف العام عند الاعتماد.
                            </span>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              أوقات التفرغ المتاحة
                            </label>
                            <select
                              value={regAvailability}
                              onChange={(e) => setRegAvailability(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                            >
                              <option value="">اختر أوقات التفرغ...</option>
                              <option value="طوال فترة المسابقة (الفترة المسائية)">طوال فترة المسابقة (الفترة المسائية)</option>
                              <option value="طوال فترة المسابقة (الفترة الصباحية)">طوال فترة المسابقة (الفترة الصباحية)</option>
                              <option value="الفترتين الصباحية والمسائية">الفترتين الصباحية والمسائية</option>
                              <option value="يوم الجمعة وأيام العطل فقط">يوم الجمعة وأيام العطل فقط</option>
                              <option value="أيام الاختبارات النهائية فقط">أيام الاختبارات النهائية فقط</option>
                            </select>
                          </div>

                          {/* Preferred Committees */}
                          <div className="sm:col-span-2">
                            <label htmlFor="reg-preferred" className="block text-xs font-bold text-slate-700 mb-1">
                              أرقام اللجان المفضلة للعمل بها (اختياري، افصل بينها بفاصلة)
                            </label>
                            <input
                              id="reg-preferred"
                              type="text"
                              inputMode="numeric"
                              placeholder="مثال: 3، 7"
                              value={regPreferredCommitteesText}
                              onChange={(e) => setRegPreferredCommitteesText(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                            />
                          </div>

                          {/* Password */}
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              كلمة المرور للحساب <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <input
                                type={showRegPassword ? 'text' : 'password'}
                                required
                                autoComplete="new-password"
                                minLength={8}
                                maxLength={128}
                                placeholder="اختر كلمة مرور للحساب..."
                                value={regPassword}
                                onChange={(e) => setRegPassword(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl pr-3 pl-9 py-2 text-xs outline-none focus:border-brand font-mono text-left"
                              />
                              <button
                                type="button"
                                aria-label={showRegPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                onClick={() => setShowRegPassword(!showRegPassword)}
                                className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 hover:text-slate-600"
                              >
                                <span className="material-symbols-outlined text-sm">
                                  {showRegPassword ? 'visibility_off' : 'visibility'}
                                </span>
                              </button>
                            </div>
                            <span className="text-xs text-slate-500 block mt-0.5">
                              8 أحرف على الأقل، وتحتوي على حروف وأرقام. ستستخدمها مع رقم جوالك للدخول بعد الاعتماد.
                            </span>
                          </div>

                          {/* Notes */}
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              ملاحظات وتزكيات المشايخ (اختياري)
                            </label>
                            <input
                              type="text"
                              placeholder="تزكيات أو ملاحظات خاصة..."
                              value={regNotes}
                              onChange={(e) => setRegNotes(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
                            />
                          </div>
                        </div>
                      </div>

                      {regError && (
                        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                          {regError}
                        </div>
                      )}

                      {/* Submit Action */}
                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={isRegistering}
                          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-brand via-emerald-700 to-brand-deep hover:opacity-95 text-white font-black text-sm cursor-pointer shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-lg">
                            {isRegistering ? 'sync' : 'send'}
                          </span>
                          <span>
                            {isRegistering ? 'جاري إرسال الطلب...' : 'إرسال طلب الانضمام لفضيلة المشرف العام'}
                          </span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 2: TRACK JOIN REQUEST (تتبع حالة طلب الانضمام) */}
              {activeTab === 'track' && (
                <div className="p-5 sm:p-7 space-y-5">
                  <div className="p-4 rounded-2xl bg-tint border border-blue-200 text-xs text-blue-950 space-y-2">
                    <strong className="font-bold flex items-center gap-1.5 text-blue-900 text-xs">
                      <span className="material-symbols-outlined text-base">travel_explore</span>
                      <span>منظومة تتبع طلبات الانضمام الفورية:</span>
                    </strong>
                    <p className="text-xs leading-relaxed text-blue-900">
                      أدخل كود الطلب الذي ظهر لك عند التسجيل (مثل <code>REQ-2026-XXXXXXXX</code>) للاستعلام عن حالة طلبك.
                    </p>
                  </div>

                  {/* Search input form */}
                  <form onSubmit={handleTrackSubmit} className="flex flex-col sm:flex-row items-center gap-2">
                    <div className="relative flex-1 w-full">
                      <span className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400">
                        <span className="material-symbols-outlined text-lg">search</span>
                      </span>
                      <input
                        type="text"
                        required
                        dir="ltr"
                        maxLength={40}
                        aria-label="كود الطلب"
                        placeholder="كود الطلب REQ-XXXX..."
                        value={trackQuery}
                        onChange={(e) => setTrackQuery(e.target.value)}
                        className="w-full bg-white border-2 border-emerald-300 rounded-2xl pr-11 pl-4 py-3 text-xs sm:text-sm font-mono outline-none focus:border-brand"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-brand hover:bg-brand-deep text-white font-bold text-xs sm:text-sm cursor-pointer shadow-md transition-all shrink-0 flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">search_check</span>
                      <span>استعلام عن الطلب</span>
                    </button>
                  </form>



                  {/* Track Result Display */}
                  {trackSearched && (
                    <div className="space-y-3" aria-live="polite">
                      {trackError ? (
                        <div role="alert" className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">{trackError}</div>
                      ) : trackResult ? (
                        <div className="p-5 rounded-2xl bg-white border border-emerald-200 space-y-2 text-right">
                          <span className="text-slate-500 text-xs block">حالة الطلب:</span>
                          <strong className="text-sm text-emerald-950 block">{STATUS_LABEL[trackResult.status] ?? trackResult.status}</strong>
                          {trackResult.status === 'interview' && trackResult.interviewDate && (
                            <p className="text-xs text-slate-700">موعد المقابلة: {trackResult.interviewDate}</p>
                          )}
                          {trackResult.status === 'approved' && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('login')}
                              className="mt-2 px-4 py-2 rounded-xl bg-brand text-white font-bold text-xs cursor-pointer"
                            >
                              الانتقال لتسجيل الدخول
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center space-y-2">
                          <h4 className="font-bold text-sm text-slate-800">لم يتم العثور على طلب بهذا الكود</h4>
                          <p className="text-xs text-slate-500">تأكد من كتابة كود الطلب كما ظهر لك بعد التسجيل.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: AUTHORIZED LOGIN FORM */}
              {activeTab === 'login' && (
                <div className="p-5 sm:p-7 space-y-4">
                  {loginError && (
                    <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-rose-600">error</span>
                      <span>{loginError}</span>
                    </div>
                  )}

                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="login-identifier" className="block text-xs font-bold text-slate-700 mb-1">
                        رقم الهاتف أو البريد الإلكتروني
                      </label>
                      <input
                        id="login-identifier"
                        type="text"
                        required
                        autoComplete="username"
                        maxLength={200}
                        disabled={isSubmitting}
                        dir="ltr"
                        placeholder="البريد الإلكتروني أو رقم الهاتف..."
                        value={emailOrPhone}
                        onChange={(e) => setEmailOrPhone(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm outline-none focus:border-brand focus:bg-white transition-all font-mono text-left"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="login-password" className="block text-xs font-bold text-slate-700">كلمة المرور</label>
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          className="text-xs text-brand hover:underline cursor-pointer"
                        >
                          نسيت كلمة المرور؟
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          maxLength={128}
                          disabled={isSubmitting}
                          dir="ltr"
                          placeholder="كلمة المرور..."
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-3.5 pl-10 py-2.5 text-xs sm:text-sm outline-none focus:border-brand focus:bg-white transition-all font-mono text-left"
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 left-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                          <span className="material-symbols-outlined text-base">
                            {showPassword ? 'visibility_off' : 'visibility'}
                          </span>
                        </button>
                      </div>
                    </div>



                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold text-sm cursor-pointer shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="material-symbols-outlined text-base animate-spin">sync</span>
                          <span>جاري تسجيل الدخول...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-base">login</span>
                          <span>تسجيل الدخول للمنظومة</span>
                        </>
                      )}
                    </button>
                  </form>


                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 px-4 text-center text-xs text-emerald-200/80 border-t border-emerald-500/20 bg-emerald-950/40 backdrop-blur-md">
        <span>جامع الإمام البخاري • منظومة إدارة المسابقات القرآنية والدورات العلمية {new Date().getFullYear()}م</span>
      </footer>

      {/* Forgot password: there is no self-service reset; an admin resets it. */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 id="forgot-title" className="font-bold text-sm text-slate-900">نسيت كلمة المرور؟</h3>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                aria-label="إغلاق"
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              تواصل مع المشرف العام. يعيد تعيين كلمة المرور من شاشة «المعاونون والصلاحيات» ← تعديل حسابك ← «إعادة تعيين كلمة
              المرور»، ويعطيك كلمة مؤقتة. سجّل الدخول بها، وسيطلب منك النظام اختيار كلمة مرور جديدة قبل المتابعة.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={() => setShowForgotPassword(false)} className="px-4 py-2 rounded-xl bg-brand text-white font-bold text-xs cursor-pointer">
                حسناً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
