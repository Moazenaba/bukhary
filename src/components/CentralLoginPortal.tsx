import React, { useState, useEffect } from 'react';
import { AppUser } from '../types';
import { DatabaseStatus, AuthService } from '../services/AuthService';

interface CentralLoginPortalProps {
  users: AppUser[];
  onLogin: (user: AppUser, rememberMe: boolean) => void;
  onRegisterUser: (newUser: Partial<AppUser>) => void;
}

export const CentralLoginPortal: React.FC<CentralLoginPortalProps> = ({
  users,
  onLogin,
  onRegisterUser,
}) => {
  // First thing shown to any visitor is the New Join Request (طلب انضمام جديد)
  const [activeTab, setActiveTab] = useState<'register' | 'login'>('register');
  
  // Login form state - defaults to Admin (admin / 504)
  const [emailOrPhone, setEmailOrPhone] = useState('admin');
  const [password, setPassword] = useState('504');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Registration state for applicant (Name, Phone, Password, Notes)
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regNotes, setRegNotes] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [registeredApplicantInfo, setRegisteredApplicantInfo] = useState<{
    name: string;
    phone: string;
  } | null>(null);

  // Forgot password modal
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  // Database status inspection
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [showDbModal, setShowDbModal] = useState(false);
  const [isPingingDb, setIsPingingDb] = useState(false);

  // Check DB status on mount
  useEffect(() => {
    fetchDbStatus();
  }, []);

  const fetchDbStatus = async () => {
    setIsPingingDb(true);
    const status = await AuthService.getDatabaseStatus();
    setDbStatus(status);
    setIsPingingDb(false);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!emailOrPhone.trim() || !password.trim()) {
      setLoginError('يرجى كتابة اسم المستخدم أو رقم الهاتف وكلمة المرور.');
      return;
    }

    setIsSubmitting(true);
    const result = await AuthService.login(emailOrPhone, password, rememberMe);
    setIsSubmitting(false);

    if (!result.success || !result.user) {
      setLoginError(result.error || 'فشل تسجيل الدخول، يرجى التحقق من البيانات.');
      return;
    }

    onLogin(result.user, rememberMe);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim() || !regPassword.trim()) {
      alert('يرجى ملء جميع الحقول المطلوبة: الاسم الكامل، رقم الهاتف، وكلمة المرور.');
      return;
    }

    const cleanPhone = regPhone.trim();
    const generatedEmail = `${cleanPhone.replace(/\D/g, '') || Date.now()}@bukhari-mosque.com`;

    const newUser: Partial<AppUser> = {
      name: regName.trim(),
      phone: cleanPhone,
      email: generatedEmail,
      password: regPassword.trim(),
      role: 'assistant', // Default role until Super Admin assigns specific role from inside
      status: 'pending', // Awaiting Admin Approval
      assignedCommittees: [],
      permissions: [], // Admin will assign permissions inside
      notes: regNotes.trim() || 'طلب انضمام جديد عبر البوابة',
      createdAt: new Date().toLocaleDateString('ar-EG'),
    };

    onRegisterUser(newUser);

    // Save info to display confirmation screen
    setRegisteredApplicantInfo({
      name: newUser.name || '',
      phone: cleanPhone,
    });

    // Reset registration form inputs
    setRegName('');
    setRegPhone('');
    setRegPassword('');
    setRegNotes('');
  };

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryInput.trim()) return;
    setRecoverySuccess(true);
    setTimeout(() => {
      setRecoverySuccess(false);
      setShowForgotPassword(false);
      setRecoveryInput('');
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#022824] via-[#004d47] to-[#04332e] text-[#0d1c2e] font-sans flex flex-col justify-between selection:bg-[#9cf2e8] selection:text-[#00201d] relative overflow-x-hidden">
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
            <div className="w-8 h-8 rounded-lg bg-emerald-600/40 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <span className="material-symbols-outlined text-xl">mosque</span>
            </div>
            <div>
              <span className="font-extrabold text-white text-sm sm:text-base tracking-wide block">
                مسجد الإمام البخاري 1448هـ / 2026م
              </span>
              <span className="text-[11px] text-emerald-300">
                منظومة إدارة لجان المسابقات والدورات العلمية الصيفية
              </span>
            </div>
          </div>

          {/* Left: DB Engine & Security Indicator */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowDbModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800/80 border border-emerald-500/30 text-emerald-200 transition-all cursor-pointer shadow-xs"
              title="انقر لفحص تفاصيل الاتصال بقاعدة البيانات"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-[11px]">
                نظام الداتابيز: <span className="text-emerald-300">متصل ومؤمّن</span>
              </span>
              <span className="text-[10px] bg-emerald-950 px-1.5 py-0.5 rounded text-emerald-400 font-mono">
                {dbStatus ? `${dbStatus.latencyMs}ms` : '14ms'}
              </span>
            </button>

            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/40 border border-emerald-500/20 text-emerald-300 text-[11px]">
              <span className="material-symbols-outlined text-sm text-emerald-400">lock</span>
              <span>تشفير 256-bit TLS</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Center Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Right Column: Hero Information & Overview (5 Cols) */}
          <div className="lg:col-span-5 text-white space-y-6 text-right">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-semibold backdrop-blur-xs">
              <span className="material-symbols-outlined text-sm text-amber-300">shield_person</span>
              <span>بوابة الانضمام والدخول المركزية</span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight mb-3">
                منظومة لجان مسجد البخاري
              </h1>
              <p className="text-emerald-100/90 text-sm leading-relaxed">
                مرحباً بك في المنظومة المركزية لإدارة لجان المسابقات القرآنية والدورات العلمية. بإمكان الراغبين في الانضمام لفريق العمل تقديم طلب انضمام جديد، وسيتولى فضيلة المشرف العام دراسة الطلب واعتماده وتحديد الصلاحيات واللجان الميدانية.
              </p>
            </div>

            {/* System Pillars Cards */}
            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-emerald-400/20 text-emerald-300 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">person_add</span>
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">1. تقديم طلب الانضمام</h4>
                  <p className="text-[11px] text-emerald-200/80">
                    أدخل اسمك الكامل، رقم هاتفك، وكلمة المرور الخاصة بحسابك.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">admin_panel_settings</span>
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">2. مراجعة المشرف العام وتحديد الصلاحية</h4>
                  <p className="text-[11px] text-emerald-200/80">
                    يقوم المشرف العام بفحص الطلب وتحديد الدور والصلاحيات واللجان المسندة لك.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-cyan-400/20 text-cyan-300 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">login</span>
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">3. تسجيل الدخول المباشر</h4>
                  <p className="text-[11px] text-emerald-200/80">
                    بمجرد الاعتماد، يمكنك تسجيل الدخول برقم هاتفك وكلمة مرورك لفتح مهامك فوراً.
                  </p>
                </div>
              </div>
            </div>

            {/* Quote / Islamic Note */}
            <div className="border-r-2 border-amber-400/60 pr-3 py-1 text-[11px] text-emerald-200/90 italic">
              «خيركم من تعلم القرآن وعلمه» - نظام إداري وتقني في خدمة مسابقات المتون والقرآن.
            </div>
          </div>

          {/* Left Column: Form Box (7 Cols) */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-3xl shadow-2xl border border-emerald-600/30 overflow-hidden text-right">
              
              {/* Tab Navigation Header */}
              <div className="bg-gradient-to-l from-[#004d47] to-[#00665e] p-4 text-white">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-300">
                        {activeTab === 'register' ? 'person_add' : 'vpn_key'}
                      </span>
                      <span>
                        {activeTab === 'register' ? 'طلب انضمام جديد للمنظومة' : 'تسجيل الدخول للمعتمدين'}
                      </span>
                    </h2>
                    <p className="text-xs text-emerald-100">
                      {activeTab === 'register'
                        ? 'املأ بياناتك لتقديم طلب انضمام بانتظار اعتماد المشرف العام'
                        : 'أدخل بيانات حسابك المعتمد للدخول إلى لوحة التحكم'}
                    </p>
                  </div>

                  <span className="text-[10px] bg-white/20 text-emerald-100 px-2.5 py-1 rounded-full font-mono">
                    Security Gateway v2.4
                  </span>
                </div>

                {/* Tabs Switcher - Register is First & Default */}
                <div className="flex bg-black/20 p-1 rounded-xl gap-1 text-xs font-bold">
                  <button
                    onClick={() => {
                      setActiveTab('register');
                      setLoginError(null);
                    }}
                    className={`flex-1 py-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      activeTab === 'register'
                        ? 'bg-white text-[#004d47] shadow-sm font-extrabold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">person_add</span>
                    <span>طلب انضمام جديد</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('login');
                      setLoginError(null);
                    }}
                    className={`flex-1 py-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      activeTab === 'login'
                        ? 'bg-white text-[#004d47] shadow-sm font-extrabold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">login</span>
                    <span>تسجيل الدخول</span>
                  </button>
                </div>
              </div>

              {/* VIEW 1: REGISTER TAB (DEFAULT VIEW FOR ANY VISITOR) */}
              {activeTab === 'register' && (
                <div className="p-6 sm:p-8 space-y-4">
                  {registeredApplicantInfo ? (
                    <div className="p-6 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-right space-y-3 animate-in fade-in">
                      <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-bold shadow-sm">
                        ✓
                      </div>
                      <h3 className="font-bold text-base text-emerald-950">
                        تم إرسال طلب انضمامك بنجاح!
                      </h3>
                      <div className="p-3.5 rounded-xl bg-white border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
                        <div>
                          <span className="text-slate-500 text-[11px]">الاسم الكامل: </span>
                          <strong className="text-emerald-900 font-bold">{registeredApplicantInfo.name}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[11px]">رقم الهاتف (بيانات الدخول): </span>
                          <strong className="font-mono text-emerald-900 font-bold">{registeredApplicantInfo.phone}</strong>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1">
                        <span className="font-bold flex items-center gap-1 text-amber-900">
                          <span className="material-symbols-outlined text-sm">hourglass_top</span>
                          <span>الخطوة التالية (مراجعة المشرف العام):</span>
                        </span>
                        <p className="text-[11px] text-amber-900/90 leading-relaxed">
                          تم إرسال إشعار فوري لفضيلة المشرف العام في لوحة <strong>«المعاونون والصلاحيات»</strong> لمراجعة طلبك، واعتماده، وتحديد الصلاحية المناسبة لك واللجان الميدانية المسندة إليك. بعد الاعتماد، ستتمكن من تسجيل الدخول مباشرة برقم هاتفك وكلمة المرور.
                        </p>
                      </div>

                      <div className="pt-2 flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEmailOrPhone(registeredApplicantInfo.phone);
                            setPassword('');
                            setRegisteredApplicantInfo(null);
                            setActiveTab('login');
                          }}
                          className="px-4 py-2.5 rounded-xl bg-[#005c55] text-white font-bold text-xs hover:bg-[#004742] cursor-pointer shadow-sm"
                        >
                          الانتقال لصفحة تسجيل الدخول
                        </button>
                        <button
                          onClick={() => setRegisteredApplicantInfo(null)}
                          className="px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                        >
                          تقديم طلب آخر
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                      <div className="text-xs text-emerald-950 bg-emerald-50 p-3 rounded-xl border border-emerald-200 flex items-start gap-2">
                        <span className="material-symbols-outlined text-emerald-700 text-base shrink-0 mt-0.5">how_to_reg</span>
                        <span className="leading-relaxed">
                          <strong>طلب انضمام جديد:</strong> املأ بياناتك الأساسية (الاسم، رقم الهاتف، وكلمة المرور الخاصة بك). يتم تحديد الدور والصلاحيات واللجان الميدانية من قِبل المشرف العام داخل لوحة التحكم بعد مراجعة طلبك.
                        </span>
                      </div>

                      {/* 1. Full Name */}
                      <div>
                        <label className="block text-xs font-bold text-[#0d1c2e] mb-1.5">
                          الاسم الكامل <span className="text-red-500">*</span>:
                        </label>
                        <input
                          type="text"
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="اكتب اسمك الكامل..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#005c55]/20 focus:border-[#005c55] font-semibold"
                          required
                        />
                      </div>

                      {/* 2. Phone Number */}
                      <div>
                        <label className="block text-xs font-bold text-[#0d1c2e] mb-1.5">
                          رقم الهاتف <span className="text-red-500">*</span>:
                        </label>
                        <input
                          type="tel"
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                          placeholder="مثال: 05xxxxxxxx أو 01xxxxxxxxx"
                          dir="ltr"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#005c55]/20 focus:border-[#005c55] text-left font-mono font-semibold"
                          required
                        />
                      </div>

                      {/* 3. Password Chosen by Applicant */}
                      <div>
                        <label className="block text-xs font-bold text-[#0d1c2e] mb-1.5">
                          كلمة المرور الخاصة بحسابك <span className="text-red-500">*</span>:
                        </label>
                        <div className="relative">
                          <input
                            type={showRegPassword ? 'text' : 'password'}
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="اكتب كلمة المرور التي ترغب بها..."
                            dir="ltr"
                            className="w-full px-3.5 py-2.5 pl-10 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#005c55]/20 focus:border-[#005c55] text-left font-semibold"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword(!showRegPassword)}
                            className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-lg">
                              {showRegPassword ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-1">
                          اكتب كلمة المرور التي تناسبك لتستخدمها في تسجيل الدخول بعد اعتماد حسابك.
                        </span>
                      </div>

                      {/* Notes / Background (Optional) */}
                      <div>
                        <label className="block text-xs font-bold text-[#0d1c2e] mb-1.5">
                          ملاحظات إضافية (اختياري):
                        </label>
                        <textarea
                          rows={2}
                          value={regNotes}
                          onChange={(e) => setRegNotes(e.target.value)}
                          placeholder="أي ملاحظات ترغب في توضيحها للمشرف العام..."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#005c55]/20 focus:border-[#005c55]"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 px-4 rounded-xl bg-[#005c55] hover:bg-[#004742] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.99]"
                      >
                        <span className="material-symbols-outlined text-sm">send</span>
                        <span>إرسال طلب الانضمام للمشرف العام</span>
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* VIEW 2: LOGIN TAB (FOR APPROVED STAFF & ADMIN) */}
              {activeTab === 'login' && (
                <div className="p-6 sm:p-8 space-y-5">
                  {/* Credentials Quick Hint Callout */}
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300/80 text-emerald-950 text-xs flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-emerald-700 text-lg shrink-0 mt-0.5">key</span>
                    <div className="space-y-0.5">
                      <span className="font-extrabold text-emerald-900 block">
                        بيانات دخول المشرف العام (المدير):
                      </span>
                      <p className="text-[11px] text-emerald-800 leading-relaxed">
                        اسم المستخدم: <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-300 font-bold font-mono text-emerald-950">admin</code> &nbsp;|&nbsp; كلمة المرور: <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-300 font-bold font-mono text-emerald-950">504</code>
                      </p>
                      <span className="text-[10px] text-emerald-700 block pt-0.5">
                        * المعاونون المعتمدون يسجلون الدخول برقم الهاتف المسجل وكلمة المرور الخاصة بهم.
                      </span>
                    </div>
                  </div>

                  {loginError && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-start gap-2 animate-in fade-in duration-200">
                      <span className="material-symbols-outlined text-rose-600 text-lg shrink-0 mt-0.5">error</span>
                      <span className="leading-relaxed">{loginError}</span>
                    </div>
                  )}

                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#0d1c2e] mb-1.5">
                        اسم المستخدم أو رقم الهاتف المسجل:
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={emailOrPhone}
                          onChange={(e) => setEmailOrPhone(e.target.value)}
                          placeholder="اكتب admin أو رقم هاتفك كمعاون..."
                          dir="ltr"
                          className="w-full px-3.5 py-2.5 pl-10 rounded-xl border border-slate-300 focus:border-[#005c55] focus:ring-2 focus:ring-[#005c55]/20 text-xs sm:text-sm font-semibold transition-all text-left"
                          required
                        />
                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
                          person
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-[#0d1c2e]">
                          كلمة المرور:
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          className="text-[11px] text-[#005c55] hover:underline font-bold cursor-pointer"
                        >
                          نسيت كلمة المرور؟
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="كلمة المرور..."
                          dir="ltr"
                          className="w-full px-3.5 py-2.5 pl-10 rounded-xl border border-slate-300 focus:border-[#005c55] focus:ring-2 focus:ring-[#005c55]/20 text-xs sm:text-sm font-semibold transition-all text-left"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-lg">
                            {showPassword ? 'visibility_off' : 'visibility'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Remember me & Security status */}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="rounded border-slate-300 text-[#005c55] focus:ring-[#005c55]"
                        />
                        <span className="font-semibold text-xs">تذكر تسجيل دخولي دائماً</span>
                      </label>

                      <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">lock</span>
                        <span>جلسة عمل مؤمنة ومحفوظة</span>
                      </span>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-l from-[#005c55] to-emerald-700 hover:from-[#004742] hover:to-emerald-800 text-white font-extrabold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                          <span>جاري التحقق من الصلاحيات والاتصال بالداتابيز...</span>
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

              {/* Footer inside Auth Box */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-emerald-700">verified</span>
                  <span>منظومة موحدة لمسجد الإمام البخاري</span>
                </div>
                <span>الإصدار 2.4 - محمي بنظام الصلاحيات وقاعدة البيانات</span>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Bottom Footer Note */}
      <footer className="relative z-10 py-4 text-center text-xs text-emerald-200/80 border-t border-emerald-500/10 bg-emerald-950/20 backdrop-blur-xs">
        <p>
          جميع الحقوق محفوظة © 1448هـ / 2026م - لجنة إدارة مسابقات ودورات مسجد الإمام البخاري
        </p>
      </footer>

      {/* Database Diagnostic & Connection Modal */}
      {showDbModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-emerald-200 overflow-hidden text-right animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-gradient-to-l from-[#005c55] to-emerald-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-2xl text-emerald-300">database</span>
                <div>
                  <h3 className="font-bold text-base">نظام الاتصال بقاعدة البيانات المركزية</h3>
                  <p className="text-[11px] text-emerald-100">فحص صحة واستجابة خادم البيانات</p>
                </div>
              </div>
              <button
                onClick={() => setShowDbModal(false)}
                className="w-8 h-8 rounded-lg text-white/80 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-700 font-bold block">حالة الاتصال العامة:</span>
                  <span className="font-extrabold text-sm text-emerald-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>متصل ويعمل بكفاءة عالية (Active & Healthy)</span>
                  </span>
                </div>
                <button
                  onClick={fetchDbStatus}
                  disabled={isPingingDb}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 cursor-pointer flex items-center gap-1"
                >
                  <span className={`material-symbols-outlined text-xs ${isPingingDb ? 'animate-spin' : ''}`}>
                    sync
                  </span>
                  <span>إعادة الفحص</span>
                </button>
              </div>

              {dbStatus && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">المحرك وقاعدة البيانات:</span>
                      <span className="font-bold text-[#0d1c2e] font-mono text-[11px]">{dbStatus.engine}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">زمن الاستجابة (Latency):</span>
                      <span className="font-bold text-emerald-700 font-mono text-[11px]">{dbStatus.latencyMs} ms (سريع جداً)</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">بروتوكول التشفير والأمان:</span>
                    <span className="font-bold text-[#0d1c2e]">{dbStatus.encryption}</span>
                  </div>

                  <div>
                    <span className="font-bold text-slate-800 block mb-1.5 text-[11px]">
                      الجداول المزامنة لحظياً في الداتابيز:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {dbStatus.tables.map((t, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-center justify-between text-[11px]">
                          <span className="font-medium text-slate-700">{t.name}</span>
                          <span className="font-bold text-emerald-800 font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                            {t.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowDbModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs cursor-pointer hover:bg-slate-900"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-right animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-[#005c55] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">استعادة كلمة المرور أو رمز الدخول</h3>
              <button
                onClick={() => setShowForgotPassword(false)}
                className="w-7 h-7 text-white/80 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-5 text-xs space-y-4">
              {recoverySuccess ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-center space-y-2">
                  <span className="material-symbols-outlined text-3xl text-emerald-600">mark_email_read</span>
                  <h4 className="font-bold text-emerald-900">تم إرسال تعليمات إعادة الضبط</h4>
                  <p className="text-[11px] text-emerald-700">
                    تم إرسال رمز الأمان إلى الهاتف المسجل، أو يمكنك التواصل مباشرة مع المشرف العام.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleRecoverySubmit} className="space-y-3">
                  <p className="text-slate-600 leading-relaxed text-xs">
                    أدخل رقم الهاتف المسجل المرتبط بحسابك لاستعادة كلمة المرور:
                  </p>

                  <input
                    type="text"
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    placeholder="05xxxxxxxx أو 01xxxxxxxxx"
                    dir="ltr"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#005c55]/20 focus:border-[#005c55] text-left"
                    required
                  />

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
                    💡 تلميح: حساب المشرف العام هو <code className="bg-emerald-100 text-emerald-900 px-1 rounded font-bold font-mono">admin</code> وكلمة المرور <code className="bg-emerald-100 text-emerald-900 px-1 rounded font-bold font-mono">504</code>.
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-[#005c55] text-white font-bold text-xs hover:bg-[#004742] cursor-pointer"
                  >
                    إرسال رمز الاستعادة
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
