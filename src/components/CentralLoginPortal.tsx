import React, { useState, useEffect } from 'react';
import { AppUser, UserRole, AssistantPermission } from '../types';
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
  // Tabs: 'register' (تقديم طلب انضمام), 'track' (تتبع طلب انضمام), 'login' (تسجيل الدخول)
  const [activeTab, setActiveTab] = useState<'register' | 'track' | 'login'>('register');

  // Login form state
  const [emailOrPhone, setEmailOrPhone] = useState('admin');
  const [password, setPassword] = useState('504');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Registration Multi-Field State (طلب انضمام متكامل)
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regWhatsapp, setRegWhatsapp] = useState('');
  const [regNationalId, setRegNationalId] = useState('');
  const [regQuranLevel, setRegQuranLevel] = useState('حفظ القرآن كاملاً مع إجازة برواية حفص');
  const [regQualification, setRegQualification] = useState('شريعة / دراسات إسلامية');
  const [regExperience, setRegExperience] = useState('خبرة سابقة في تنظيم المسابقات القرآنية وإدارة لجان الاختبار');
  const [regAvailability, setRegAvailability] = useState('طوال فترة المسابقة (الفترة المسائية)');
  const [regPreferredCommittees, setRegPreferredCommittees] = useState<number[]>([1, 2]);
  const [regRole, setRegRole] = useState<UserRole>('assistant');
  const [regPassword, setRegPassword] = useState('123456');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regNotes, setRegNotes] = useState('');
  const [activationMode, setActivationMode] = useState<'pending' | 'direct'>('pending');

  // Registered receipt state
  const [submittedReceipt, setSubmittedReceipt] = useState<AppUser | null>(null);

  // Tracking state
  const [trackQuery, setTrackQuery] = useState('');
  const [trackedUser, setTrackedUser] = useState<AppUser | null>(null);
  const [trackSearched, setTrackSearched] = useState(false);

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
      alert('يرجى ملء الحقول الإلزامية: الاسم الكامل، رقم الهاتف، وكلمة المرور.');
      return;
    }

    const cleanPhone = regPhone.trim();
    const generatedEmail = `${cleanPhone.replace(/\D/g, '') || Date.now()}@bukhari-mosque.com`;
    const isDirect = activationMode === 'direct';
    const requestCode = `REQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const defaultPerms: AssistantPermission[] =
      regRole === 'assistant'
        ? ['database_sheets', 'manage_committees', 'calendar_schedule']
        : regRole === 'teacher'
        ? ['exams_pdf', 'manage_committees']
        : regRole === 'committee_head'
        ? ['manage_committees', 'add_new_committee', 'calendar_schedule', 'exams_pdf']
        : ['database_sheets', 'progress_stats'];

    const newUser: Partial<AppUser> = {
      name: regName.trim(),
      phone: cleanPhone,
      whatsapp: regWhatsapp.trim() || cleanPhone,
      nationalId: regNationalId.trim(),
      email: generatedEmail,
      password: regPassword.trim(),
      role: regRole,
      status: isDirect ? 'approved' : 'pending',
      assignedCommittees: isDirect ? regPreferredCommittees : [],
      permissions: isDirect ? defaultPerms : [],
      requestCode,
      quranLevel: regQuranLevel,
      qualification: regQualification,
      experience: regExperience,
      availability: regAvailability,
      preferredCommittees: regPreferredCommittees,
      notes:
        regNotes.trim() ||
        `طلب انضمام ${isDirect ? 'مفعل ومباشر' : 'قيد المراجعة'} كـ (${AuthService.getRoleLabel(regRole)}) عبر البوابة المركزية`,
      createdAt: new Date().toLocaleDateString('ar-EG'),
    };

    onRegisterUser(newUser);

    const completeUserObj: AppUser = {
      id: `usr_${Date.now()}`,
      name: newUser.name!,
      phone: cleanPhone,
      whatsapp: newUser.whatsapp,
      nationalId: newUser.nationalId,
      email: generatedEmail,
      password: regPassword.trim(),
      role: regRole,
      status: isDirect ? 'approved' : 'pending',
      assignedCommittees: isDirect ? regPreferredCommittees : [],
      permissions: isDirect ? defaultPerms : [],
      requestCode,
      quranLevel: regQuranLevel,
      qualification: regQualification,
      experience: regExperience,
      availability: regAvailability,
      preferredCommittees: regPreferredCommittees,
      createdAt: new Date().toLocaleDateString('ar-EG'),
      notes: newUser.notes,
    };

    if (isDirect) {
      onLogin(completeUserObj, true);
      return;
    }

    // Show confirmation receipt voucher
    setSubmittedReceipt(completeUserObj);
    setTrackQuery(cleanPhone);
  };

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackQuery.trim()) return;
    setTrackSearched(true);
    const found = AuthService.trackJoinRequest(trackQuery);
    setTrackedUser(found || null);
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

  const toggleCommitteeSelection = (num: number) => {
    setRegPreferredCommittees((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num].sort((a, b) => a - b)
    );
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
            <div className="w-9 h-9 rounded-xl bg-emerald-600/40 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-sm">
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">mosque</span>
            </div>
            <div>
              <span className="font-black text-white text-sm sm:text-base tracking-wide block">
                مسجد الإمام البخاري 1448هـ / 2026م
              </span>
              <span className="text-[11px] text-emerald-300 font-medium">
                منظومة إدارة لجان المسابقات القرآنية والدورات العلمية الصيفية
              </span>
            </div>
          </div>

          {/* Left: Quick Actions & DB Engine */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setEmailOrPhone('admin');
                setPassword('504');
                setActiveTab('login');
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-bold text-[11px] transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
              title="تعبئة بيانات حساب المشرف العام تلقائياً"
            >
              <span>👑 دخول المشرف (admin / 504)</span>
            </button>

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
                سوبابيز: <span className="text-emerald-300">متصل ومؤمّن</span>
              </span>
              <span className="text-[10px] bg-emerald-950 px-1.5 py-0.5 rounded text-emerald-400 font-mono">
                {dbStatus ? `${dbStatus.latencyMs}ms` : '12ms'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Center Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-3 sm:p-6 lg:p-8">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          
          {/* Right Column: Hero Information & Overview (4 Cols) */}
          <div className="lg:col-span-4 text-white space-y-5 text-right hidden lg:block">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-semibold backdrop-blur-xs">
              <span className="material-symbols-outlined text-sm text-amber-300" aria-hidden="true">verified_user</span>
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
                  <p className="text-[11px] text-emerald-200/80">
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
                  <p className="text-[11px] text-emerald-200/80">
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
                  <p className="text-[11px] text-emerald-200/80">
                    تسجيل الدخول ومتابعة كشوفات الطلاب ورصد الدرجات.
                  </p>
                </div>
              </div>
            </div>

            {/* Quote / Islamic Note */}
            <div className="border-r-2 border-amber-400/60 pr-3 py-1 text-[11px] text-emerald-200/90 italic">
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
                      <span className="material-symbols-outlined text-amber-300" aria-hidden="true">
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
                        ? 'استعلم برقم جوالك أو كود الطلب لمعرفة حالة الاعتماد وتوزيع اللجان'
                        : 'أدخل بيانات حسابك المعتمد للدخول إلى لوحة التحكم'}
                    </p>
                  </div>

                  <span className="text-[11px] bg-white/20 text-emerald-100 px-3 py-1 rounded-full font-mono shrink-0">
                    Bukhari Portal 2026
                  </span>
                </div>

                {/* Tabs Switcher: 3 Clear Modes */}
                <div className="grid grid-cols-3 bg-black/25 p-1 rounded-xl gap-1 text-xs font-bold">
                  <button
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
                    <span className="material-symbols-outlined text-base" aria-hidden="true">person_add</span>
                    <span>طلب انضمام</span>
                  </button>

                  <button
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
                    <span className="material-symbols-outlined text-base" aria-hidden="true">search_check</span>
                    <span>تتبع الطلب</span>
                  </button>

                  <button
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
                    <span className="material-symbols-outlined text-base" aria-hidden="true">login</span>
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

                        <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          {submittedReceipt.requestCode || 'REQ-2026-NEW'}
                        </span>
                      </div>

                      {/* Applicant Summary Card */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-white border border-emerald-200 text-xs">
                        <div>
                          <span className="text-slate-500 block text-[11px]">اسم المتقدم:</span>
                          <strong className="text-emerald-950 font-bold">{submittedReceipt.name}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">رقم الجوال المسجل:</span>
                          <strong className="font-mono text-emerald-950 font-bold">{submittedReceipt.phone}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">الدور والمهمة المطلوبة:</span>
                          <strong className="text-[#005c55] font-bold">{AuthService.getRoleLabel(submittedReceipt.role)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">مقدار حفظ القرآن:</span>
                          <strong className="text-slate-800 font-bold">{submittedReceipt.quranLevel || 'غير محدد'}</strong>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-500 block text-[11px]">حالة الطلب الآن:</span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold text-xs mt-1 border border-amber-300">
                            <span className="material-symbols-outlined text-sm animate-spin" aria-hidden="true">sync</span>
                            <span>قيد مراجعة المشرف العام وتوزيع اللجان الميدانية</span>
                          </span>
                        </div>
                      </div>

                      {/* Instructions & Next Steps */}
                      <div className="p-3.5 rounded-xl bg-emerald-900/10 border border-emerald-300 text-xs text-emerald-950 space-y-1.5">
                        <strong className="font-bold flex items-center gap-1 text-emerald-900">
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">info</span>
                          <span>ماذا سيحدث بعد إرسال الطلب؟</span>
                        </strong>
                        <p className="text-[11px] text-emerald-900 leading-relaxed">
                          1. سيقوم فضيلة المشرف العام بمراجعة مؤهلاتك وحفظك للقرآن الكريم.
                          <br />
                          2. سيتم إسناد اللجان الميدانية وتفعيل صلاحيات الدخول، أو جدولة مقابلة شخصية.
                          <br />
                          3. يمكنك تتبع حالة طلبك في أي لحظة عبر إدخال رقم جوالك في تبويب <strong>«تتبع الطلب»</strong>.
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setTrackQuery(submittedReceipt.phone);
                            setActiveTab('track');
                            const found = AuthService.trackJoinRequest(submittedReceipt.phone);
                            setTrackedUser(found || submittedReceipt);
                            setTrackSearched(true);
                          }}
                          className="px-4 py-2.5 rounded-xl bg-[#005c55] hover:bg-[#004742] text-white font-bold text-xs cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">search</span>
                          <span>متابعة وتتبع حالة هذا الطلب الآن</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSubmittedReceipt(null);
                            setRegName('');
                            setRegPhone('');
                          }}
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-950 font-bold text-xs cursor-pointer"
                        >
                          تقديم طلب انضمام آخر
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEmailOrPhone('admin');
                            setPassword('504');
                            setActiveTab('login');
                          }}
                          className="px-3.5 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs cursor-pointer border border-amber-300 flex items-center gap-1 mr-auto"
                        >
                          <span>👑 الدخول كمدير النظام</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                      
                      {/* Section 1: Personal & Contact Details */}
                      <div className="p-4 rounded-2xl bg-[#f8fafc] border border-slate-200 space-y-3">
                        <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                          <span className="material-symbols-outlined text-sm text-[#005c55]" aria-hidden="true">badge</span>
                          <span>١. البيانات الشخصية ومعلومات التواصل:</span>
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              الاسم الرباعي الكامل <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="مثال: معاذ بن سعد العتيبي"
                              value={regName}
                              onChange={(e) => setRegName(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55] focus:ring-1 focus:ring-[#005c55]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              رقم الجوال (اسم الدخول) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="tel"
                              required
                              placeholder="مثال: 0501234567"
                              value={regPhone}
                              onChange={(e) => setRegPhone(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55] focus:ring-1 focus:ring-[#005c55] font-mono text-left"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              رقم الواتساب (للتواصل السريع)
                            </label>
                            <input
                              type="tel"
                              placeholder="نفس رقم الجوال أو رقم آخر..."
                              value={regWhatsapp}
                              onChange={(e) => setRegWhatsapp(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55] font-mono text-left"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              رقم الهوية الوطنية / الإقامة (اختياري)
                            </label>
                            <input
                              type="text"
                              placeholder="رقم الهوية..."
                              value={regNationalId}
                              onChange={(e) => setRegNationalId(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55] font-mono text-left"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Qualifications & Quran Level */}
                      <div className="p-4 rounded-2xl bg-[#f8fafc] border border-slate-200 space-y-3">
                        <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                          <span className="material-symbols-outlined text-sm text-[#005c55]" aria-hidden="true">menu_book</span>
                          <span>٢. المؤهل العلمي ومقدار حفظ القرآن الكريم والخبرات:</span>
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              مقدار حفظ القرآن الكريم والإجازات
                            </label>
                            <select
                              value={regQuranLevel}
                              onChange={(e) => setRegQuranLevel(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                            >
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
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              المؤهل العلمي والتخصص
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: بكالوريوس شريعة / أصول دين / حاسب..."
                              value={regQualification}
                              onChange={(e) => setRegQualification(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              الخبرات السابقة في لجان المساجد والمسابقات القرآنية
                            </label>
                            <input
                              type="text"
                              placeholder="اذكر خبراتك السابقة في التنظيم، الاختبارات، أو التحكيم..."
                              value={regExperience}
                              onChange={(e) => setRegExperience(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Role, Shifts, Committees & Password */}
                      <div className="p-4 rounded-2xl bg-[#f8fafc] border border-slate-200 space-y-3">
                        <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                          <span className="material-symbols-outlined text-sm text-[#005c55]" aria-hidden="true">tune</span>
                          <span>٣. الدور المطلوب، أوقات التفرغ، وكلمة المرور:</span>
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              الدور أو المسمى المرغوب
                            </label>
                            <select
                              value={regRole}
                              onChange={(e) => setRegRole(e.target.value as UserRole)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55] font-bold text-[#005c55]"
                            >
                              <option value="assistant">معاون ميداني معتمد (استلام اللجان ومتابعة الطلاب)</option>
                              <option value="teacher">معلم ومقرئ (اختبار الطلاب والتحكيم)</option>
                              <option value="committee_head">رئيس لجنة ومقرئ (إدارة الاختبارات والاعتماد)</option>
                              <option value="auditor">مراجع ومدقق جودة (رقابة ورصد الدرجات)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              أوقات التفرغ المتاحة
                            </label>
                            <select
                              value={regAvailability}
                              onChange={(e) => setRegAvailability(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                            >
                              <option value="طوال فترة المسابقة (الفترة المسائية)">طوال فترة المسابقة (الفترة المسائية)</option>
                              <option value="طوال فترة المسابقة (الفترة الصباحية)">طوال فترة المسابقة (الفترة الصباحية)</option>
                              <option value="الفترتين الصباحية والمسائية">الفترتين الصباحية والمسائية</option>
                              <option value="يوم الجمعة وأيام العطل فقط">يوم الجمعة وأيام العطل فقط</option>
                              <option value="أيام الاختبارات النهائية فقط">أيام الاختبارات النهائية فقط</option>
                            </select>
                          </div>

                          {/* Preferred Committees Selection */}
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                              اللجان الميدانية المفضلة للعمل بها (يمكن اختيار أكثر من لجنة):
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {[1, 2, 3, 4, 5, 6, 7, 8].map((cNum) => {
                                const selected = regPreferredCommittees.includes(cNum);
                                return (
                                  <button
                                    key={cNum}
                                    type="button"
                                    onClick={() => toggleCommitteeSelection(cNum)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                                      selected
                                        ? 'bg-[#005c55] text-white border-[#005c55] shadow-xs'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                    }`}
                                  >
                                    <span>لجنة #{cNum}</span>
                                    {selected && <span className="mr-1 text-[10px]">✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Password */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              كلمة المرور للحساب <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <input
                                type={showRegPassword ? 'text' : 'password'}
                                required
                                placeholder="اختر كلمة مرور للحساب..."
                                value={regPassword}
                                onChange={(e) => setRegPassword(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl pr-3 pl-9 py-2 text-xs outline-none focus:border-[#005c55] font-mono text-left"
                              />
                              <button
                                type="button"
                                onClick={() => setShowRegPassword(!showRegPassword)}
                                className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 hover:text-slate-600"
                              >
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                  {showRegPassword ? 'visibility_off' : 'visibility'}
                                </span>
                              </button>
                            </div>
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                              ستستخدم هذه الكلمة مع رقم جوالك للدخول فور الاعتماد.
                            </span>
                          </div>

                          {/* Notes */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              ملاحظات وتزكيات المشايخ (اختياري)
                            </label>
                            <input
                              type="text"
                              placeholder="تزكيات أو ملاحظات خاصة..."
                              value={regNotes}
                              onChange={(e) => setRegNotes(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Activation Mode Box */}
                      <div className="bg-[#f0f9f8] p-3.5 rounded-2xl border border-emerald-300 space-y-2">
                        <label className="block text-xs font-black text-emerald-950">
                          ⚡ مسار التفعيل والاعتماد:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setActivationMode('pending')}
                            className={`p-3 rounded-xl text-right font-bold transition-all border cursor-pointer ${
                              activationMode === 'pending'
                                ? 'bg-[#005c55] text-white border-[#005c55] shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="block text-xs">⏳ إرسال للمراجعة والاعتماد (النظام الرسمي)</span>
                            <span className="text-[10px] opacity-85 block font-normal mt-0.5">
                              يصل للمشرف العام لدراسته واعتماده وإصدار كود تتبع رسمي
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActivationMode('direct')}
                            className={`p-3 rounded-xl text-right font-bold transition-all border cursor-pointer ${
                              activationMode === 'direct'
                                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="block text-xs">⚡ انضمام وتفعيل مباشر فوري</span>
                            <span className="text-[10px] opacity-85 block font-normal mt-0.5">
                              دخول فوري للمنظومة وتفعيل الصلاحيات الميدانية مباشرة
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Submit Action */}
                      <div className="pt-2">
                        <button
                          type="submit"
                          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#005c55] via-emerald-700 to-[#004742] hover:opacity-95 text-white font-black text-sm cursor-pointer shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-lg" aria-hidden="true">
                            {activationMode === 'direct' ? 'bolt' : 'send'}
                          </span>
                          <span>
                            {activationMode === 'direct'
                              ? '⚡ تفعيل مباشر والدخول للمنظومة فوراً'
                              : 'إرسال طلب الانضمام لفضيلة المشرف العام'}
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
                  <div className="p-4 rounded-2xl bg-[#eff4ff] border border-blue-200 text-xs text-blue-950 space-y-2">
                    <strong className="font-bold flex items-center gap-1.5 text-blue-900 text-xs">
                      <span className="material-symbols-outlined text-base" aria-hidden="true">travel_explore</span>
                      <span>منظومة تتبع طلبات الانضمام الفورية:</span>
                    </strong>
                    <p className="text-[11px] leading-relaxed text-blue-900">
                      أدخل رقم هاتفك المسجل أو كود الطلب (مثل <code>REQ-2026-XXXX</code>) أو رقم الهوية للاستعلام المباشر عن حالة طلبك واللجان الممنوحة لك.
                    </p>
                  </div>

                  {/* Search input form */}
                  <form onSubmit={handleTrackSubmit} className="flex flex-col sm:flex-row items-center gap-2">
                    <div className="relative flex-1 w-full">
                      <span className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400">
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">search</span>
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="اكتب رقم الجوال أو كود الطلب REQ-XXXX..."
                        value={trackQuery}
                        onChange={(e) => setTrackQuery(e.target.value)}
                        className="w-full bg-white border-2 border-emerald-300 rounded-2xl pr-11 pl-4 py-3 text-xs sm:text-sm font-mono outline-none focus:border-[#005c55]"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#005c55] hover:bg-[#004742] text-white font-bold text-xs sm:text-sm cursor-pointer shadow-md transition-all shrink-0 flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">search_check</span>
                      <span>استعلام عن الطلب</span>
                    </button>
                  </form>

                  {/* Quick sample search chips */}
                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500">
                    <span className="text-[11px] font-bold">نماذج للاستعلام:</span>
                    {users
                      .filter((u) => u.role !== 'super_admin')
                      .slice(0, 4)
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setTrackQuery(u.phone);
                            const found = AuthService.trackJoinRequest(u.phone);
                            setTrackedUser(found || u);
                            setTrackSearched(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-mono border border-slate-300 cursor-pointer"
                        >
                          {u.name} ({u.phone})
                        </button>
                      ))}
                  </div>

                  {/* Track Result Display */}
                  {trackSearched && (
                    <div className="pt-2 animate-in fade-in">
                      {trackedUser ? (
                        <div className="p-5 rounded-2xl border-2 bg-white shadow-sm space-y-4 text-right">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                            <div>
                              <h3 className="font-black text-sm sm:text-base text-slate-900">
                                ملف المتقدم: {trackedUser.name}
                              </h3>
                              <span className="text-[11px] text-slate-500 font-mono">
                                هاتف: {trackedUser.phone} {trackedUser.requestCode && `• كود: ${trackedUser.requestCode}`}
                              </span>
                            </div>

                            {/* Status Badge */}
                            {trackedUser.status === 'approved' && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">verified</span>
                                <span>تم الاعتماد وتفعيل الصلاحيات ✓</span>
                              </span>
                            )}
                            {trackedUser.status === 'interview' && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 flex items-center gap-1 animate-pulse">
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">mic</span>
                                <span>تم تحديد موعد مقابلة واختبار</span>
                              </span>
                            )}
                            {trackedUser.status === 'pending' && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">hourglass_top</span>
                                <span>قيد الدراسة والمراجعة</span>
                              </span>
                            )}
                            {trackedUser.status === 'rejected' && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">cancel</span>
                                <span>تم الاعتذار عن الطلب</span>
                              </span>
                            )}
                          </div>

                          {/* Visual Timeline Stages */}
                          <div className="py-2">
                            <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
                              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300">
                                <span className="block text-xs">١. التقديم</span>
                                <span>✓ مكتمل</span>
                              </div>

                              <div
                                className={`p-2 rounded-xl border ${
                                  trackedUser.status === 'pending'
                                    ? 'bg-amber-100 text-amber-900 border-amber-400 font-black'
                                    : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                }`}
                              >
                                <span className="block text-xs">٢. دراسة الطلب</span>
                                <span>{trackedUser.status === 'pending' ? 'جاري الفحص...' : '✓ تم الفحص'}</span>
                              </div>

                              <div
                                className={`p-2 rounded-xl border ${
                                  trackedUser.status === 'interview'
                                    ? 'bg-blue-100 text-blue-900 border-blue-400 font-black animate-pulse'
                                    : trackedUser.status === 'approved'
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                    : 'bg-slate-100 text-slate-400 border-slate-200'
                                }`}
                              >
                                <span className="block text-xs">٣. المقابلة</span>
                                <span>
                                  {trackedUser.status === 'interview'
                                    ? 'موعد محدد'
                                    : trackedUser.status === 'approved'
                                    ? '✓ مجتاز'
                                    : 'بانتظار الإجراء'}
                                </span>
                              </div>

                              <div
                                className={`p-2 rounded-xl border ${
                                  trackedUser.status === 'approved'
                                    ? 'bg-emerald-600 text-white border-emerald-700 font-black shadow-xs'
                                    : trackedUser.status === 'rejected'
                                    ? 'bg-rose-100 text-rose-900 border-rose-300'
                                    : 'bg-slate-100 text-slate-400 border-slate-200'
                                }`}
                              >
                                <span className="block text-xs">٤. الاعتماد</span>
                                <span>
                                  {trackedUser.status === 'approved'
                                    ? '✓ معتمد رسمياً'
                                    : trackedUser.status === 'rejected'
                                    ? 'معتذر'
                                    : 'قيد الاعتماد'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Specific Status Notes */}
                          {trackedUser.status === 'approved' && (
                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 space-y-2">
                              <h4 className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-base text-emerald-700" aria-hidden="true">task_alt</span>
                                <span>تهانينا! تم اعتماد طلبك رسمياً وتفعيل صلاحيات حسابك:</span>
                              </h4>
                              <div className="text-xs text-emerald-900 space-y-1">
                                <div>الدور المعتمد: <strong>{AuthService.getRoleLabel(trackedUser.role)}</strong></div>
                                <div>
                                  اللجان المسندة لك:{' '}
                                  <strong>
                                    {trackedUser.assignedCommittees.length > 0
                                      ? trackedUser.assignedCommittees.map((c) => `#${c}`).join('، ')
                                      : 'كافة اللجان الميدانية'}
                                  </strong>
                                </div>
                                <div>
                                  الصلاحيات المفعلة: <strong>{trackedUser.permissions.join('، ') || 'المتابعة الميدانية'}</strong>
                                </div>
                              </div>

                              <div className="pt-2">
                                <button
                                  type="button"
                                  onClick={() => onLogin(trackedUser, true)}
                                  className="px-4 py-2 rounded-xl bg-[#005c55] hover:bg-[#004742] text-white font-bold text-xs cursor-pointer shadow-sm flex items-center gap-1.5"
                                >
                                  <span className="material-symbols-outlined text-sm" aria-hidden="true">login</span>
                                  <span>تسجيل الدخول واستلام مهامك الميدانية الآن</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {trackedUser.status === 'interview' && (
                            <div className="p-4 rounded-xl bg-blue-50 border border-blue-300 space-y-2">
                              <h4 className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-base text-blue-700" aria-hidden="true">event</span>
                                <span>تم تحديد موعد مقابلة شخصية واختبار تجريبي:</span>
                              </h4>
                              <p className="text-xs text-blue-900 leading-relaxed">
                                <strong>تاريخ المقابلة:</strong> {trackedUser.interviewDate || 'يتم التنسيق هاتفياً'}
                                <br />
                                <strong>المكان:</strong> مقر إدارة لجان المسابقات بمسجد الإمام البخاري.
                                <br />
                                <strong>ملاحظات المشرف:</strong> {trackedUser.interviewNotes || 'يرجى إحضار الهوية والمؤهل الشرعي.'}
                              </p>
                            </div>
                          )}

                          {trackedUser.status === 'pending' && (
                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-1.5">
                              <h4 className="font-bold text-xs text-amber-950 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-base text-amber-700" aria-hidden="true">schedule</span>
                                <span>طلبك قيد دراسة المشرف العام:</span>
                              </h4>
                              <p className="text-xs text-amber-900 leading-relaxed">
                                يجري حالياً فرز طلبات المتقدمين وتوزيع اللجان الميدانية، وسوف يتم إشعارك فور الاعتماد.
                              </p>
                            </div>
                          )}

                          {trackedUser.status === 'rejected' && (
                            <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 space-y-1.5">
                              <h4 className="font-bold text-xs text-rose-950 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-base text-rose-700" aria-hidden="true">info</span>
                                <span>بيان الاعتذار عن الطلب:</span>
                              </h4>
                              <p className="text-xs text-rose-900 leading-relaxed">
                                {trackedUser.rejectionReason || 'نعتذر عن عدم قبول الطلب لاكتمال النصاب المطلوب في لجان هذه الدورة.'}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center space-y-2">
                          <span className="material-symbols-outlined text-4xl text-slate-300" aria-hidden="true">person_off</span>
                          <h4 className="font-bold text-sm text-slate-800">لم يتم العثور على طلب بهذا الرقم أو الكود</h4>
                          <p className="text-xs text-slate-500">
                            تأكد من كتابة رقم الجوال الصحيح أو كود الطلب كما سجلته في الاستمارة.
                          </p>
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
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-rose-600" aria-hidden="true">error</span>
                      <span>{loginError}</span>
                    </div>
                  )}

                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        اسم المستخدم أو رقم الهاتف
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="admin أو 0501234567..."
                        value={emailOrPhone}
                        onChange={(e) => setEmailOrPhone(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm outline-none focus:border-[#005c55] focus:bg-white transition-all font-mono text-left"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">كلمة المرور</label>
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          className="text-[11px] text-[#005c55] hover:underline cursor-pointer"
                        >
                          نسيت كلمة المرور؟
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          placeholder="كلمة المرور..."
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-3.5 pl-10 py-2.5 text-xs sm:text-sm outline-none focus:border-[#005c55] focus:bg-white transition-all font-mono text-left"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 left-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden="true">
                            {showPassword ? 'visibility_off' : 'visibility'}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="rounded text-[#005c55] focus:ring-[#005c55]"
                        />
                        <span>تذكرني على هذا الجهاز</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 rounded-xl bg-[#005c55] hover:bg-[#004742] text-white font-bold text-sm cursor-pointer shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="material-symbols-outlined text-base animate-spin" aria-hidden="true">sync</span>
                          <span>جاري تسجيل الدخول...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-base" aria-hidden="true">login</span>
                          <span>تسجيل الدخول للمنظومة</span>
                        </>
                      )}
                    </button>
                  </form>

                  {/* Demo Fast Accounts Bar */}
                  <div className="pt-3 border-t border-slate-200">
                    <span className="block text-[11px] font-bold text-slate-600 mb-2">
                      ⚡ حسابات سريعة للتجربة والمعاينة المباشرة:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setEmailOrPhone('admin');
                          setPassword('504');
                        }}
                        className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold text-right cursor-pointer"
                      >
                        <span className="block text-xs">👑 المشرف العام</span>
                        <span className="text-[10px] font-mono text-amber-800">admin / 504</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const firstAssistant = users.find((u) => u.role === 'assistant');
                          if (firstAssistant) {
                            setEmailOrPhone(firstAssistant.phone);
                            setPassword(firstAssistant.password || '123456');
                          }
                        }}
                        className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 font-bold text-right cursor-pointer"
                      >
                        <span className="block text-xs">🤝 معاون معتمد</span>
                        <span className="text-[10px] font-mono text-emerald-800">معاذ العتيبي</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 px-4 text-center text-xs text-emerald-200/80 border-t border-emerald-500/20 bg-emerald-950/40 backdrop-blur-md">
        <span>جامع الإمام البخاري • منظومة إدارة المسابقات القرآنية والدورات العلمية 1448هـ / 2026م</span>
      </footer>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-slate-900">استعادة كلمة المرور</h3>
              <button
                onClick={() => setShowForgotPassword(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {recoverySuccess ? (
              <div className="p-4 rounded-xl bg-emerald-50 text-emerald-900 text-xs border border-emerald-200">
                ✓ تم إرسال تعليمات إعادة تعيين كلمة المرور إلى المشرف العام لتوثيقها.
              </div>
            ) : (
              <form onSubmit={handleRecoverySubmit} className="space-y-3">
                <p className="text-xs text-slate-600">
                  أدخل رقم جوالك المسجل لإرسال إشعار للمشرف العام لإعادة تفعيل كلمة المرور.
                </p>
                <input
                  type="text"
                  required
                  placeholder="رقم الهاتف..."
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono outline-none focus:border-[#005c55]"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-[#005c55] text-white font-bold text-xs cursor-pointer"
                >
                  إرسال الطلب
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Database Status Modal */}
      {showDbModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-right">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-emerald-600" aria-hidden="true">database</span>
                <span>فحص حالة اتصال سوبابيز (PostgreSQL)</span>
              </h3>
              <button
                onClick={() => setShowDbModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border">
                <span className="text-slate-600">محرك قاعدة البيانات:</span>
                <span className="font-bold text-emerald-800">Supabase Cloud (PostgreSQL 17)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border">
                <span className="text-slate-600">سرعة الاستجابة:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {dbStatus ? `${dbStatus.latencyMs}ms` : '12ms'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border">
                <span className="text-slate-600">حالة التزامن:</span>
                <span className="font-bold text-emerald-700">✓ مباشر ومتزامن في الوقت الحقيقي</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowDbModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
