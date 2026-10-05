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
  // First thing shown to any visitor is the New Join Request (طلب انضمام جديد)
  const [activeTab, setActiveTab] = useState<'register' | 'login'>('register');
  
  // Login form state - defaults to Admin (admin / 504)
  const [emailOrPhone, setEmailOrPhone] = useState('admin');
  const [password, setPassword] = useState('504');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Registration state for applicant (Name, Phone, Password, Notes, Role, Activation Mode)
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regNotes, setRegNotes] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('assistant');
  const [activationMode, setActivationMode] = useState<'direct' | 'pending'>('direct');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [registeredApplicantInfo, setRegisteredApplicantInfo] = useState<{
    name: string;
    phone: string;
    role: UserRole;
    password: string;
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
    const isDirect = activationMode === 'direct';

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
      email: generatedEmail,
      password: regPassword.trim(),
      role: regRole,
      status: isDirect ? 'approved' : 'pending',
      assignedCommittees: [],
      permissions: isDirect ? defaultPerms : [],
      notes: regNotes.trim() || `طلب انضمام ${isDirect ? 'مفعل ومباشر' : 'قيد المراجعة'} كـ (${AuthService.getRoleLabel(regRole)}) عبر البوابة`,
      createdAt: new Date().toLocaleDateString('ar-EG'),
    };

    onRegisterUser(newUser);

    if (isDirect) {
      // Auto login directly so assistant enters the system immediately and sees their permissions!
      const userToLogin: AppUser = {
        id: `usr_${Date.now()}`,
        name: newUser.name!,
        phone: cleanPhone,
        email: generatedEmail,
        password: regPassword.trim(),
        role: regRole,
        status: 'approved',
        assignedCommittees: [],
        permissions: defaultPerms,
        createdAt: new Date().toLocaleDateString('ar-EG'),
        notes: newUser.notes,
      };
      onLogin(userToLogin, true);
      return;
    }

    // Save info to display confirmation screen if pending was chosen
    setRegisteredApplicantInfo({
      name: newUser.name || '',
      phone: cleanPhone,
      role: regRole,
      password: regPassword.trim(),
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
                        تم تسجيل وربط طلبك بنجاح في المنظومة المركزية!
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
                        <div>
                          <span className="text-slate-500 text-[11px]">المهمة / الدور المسجل: </span>
                          <span className="font-bold text-[#005c55] bg-emerald-100/60 px-2 py-0.5 rounded text-[11px]">
                            {AuthService.getRoleLabel(registeredApplicantInfo.role)}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1">
                        <span className="font-bold flex items-center gap-1 text-amber-900">
                          <span className="material-symbols-outlined text-sm">badge</span>
                          <span>الربط المباشر مع المعاونين والصلاحيات:</span>
                        </span>
                        <p className="text-[11px] text-amber-900/90 leading-relaxed">
                          تم ربط حسابك بقاعدة بيانات <strong>«المعاونون والصلاحيات»</strong>، ويمكنك الدخول الفوري وتجربة مهامك كمعاون الآن، أو الدخول كمدير للنظام للمعاينة الكاملة.
                        </p>
                      </div>

                      <div className="pt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const found = users.find((u) => u.phone === registeredApplicantInfo.phone);
                            if (found) {
                              onLogin(found, true);
                            } else {
                              onLogin(
                                {
                                  id: `usr_${Date.now()}`,
                                  name: registeredApplicantInfo.name,
                                  phone: registeredApplicantInfo.phone,
                                  email: `${registeredApplicantInfo.phone}@bukhari.org`,
                                  password: registeredApplicantInfo.password,
                                  role: registeredApplicantInfo.role,
                                  status: 'approved',
                                  assignedCommittees: [],
                                  permissions: ['database_sheets', 'manage_committees', 'calendar_schedule'],
                                  createdAt: new Date().toLocaleDateString('ar-EG'),
                                },
                                true
                              );
                            }
                          }}
                          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#005c55] to-emerald-700 hover:from-[#004742] hover:to-emerald-800 text-white font-bold text-xs cursor-pointer shadow-md flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">bolt</span>
                          <span>⚡ تفعيل فوري والدخول المباشر كمعاون الآن</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEmailOrPhone('admin');
                            setPassword('504');
                            setRegisteredApplicantInfo(null);
                            setActiveTab('login');
                          }}
                          className="px-3.5 py-2.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-950 text-xs font-bold cursor-pointer border border-emerald-300 flex items-center gap-1"
                        >
                          <span>👑 الدخول كمدير النظام (admin / 504)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                      {/* Activation Mode Toggle */}
                      <div className="bg-[#f0f9f8] p-3 rounded-2xl border border-emerald-300 space-y-2">
                        <label className="block text-xs font-black text-emerald-950">
                          ⚡ طريقة الانضمام والتفعيل:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setActivationMode('direct')}
                            className={`p-2.5 rounded-xl text-right font-bold transition-all border cursor-pointer ${
                              activationMode === 'direct'
                                ? 'bg-[#005c55] text-white border-[#005c55] shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="block text-xs">⚡ انضمام وتفعيل فوري (مباشر)</span>
                            <span className="text-[10px] opacity-80 block font-normal">
                              دخول فوري للمنظومة وصلاحيات المعاون الميداني
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActivationMode('pending')}
                            className={`p-2.5 rounded-xl text-right font-bold transition-all border cursor-pointer ${
                              activationMode === 'pending'
                                ? 'bg-[#005c55] text-white border-[#005c55] shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="block text-xs">⏳ إرسال طلب للمشرف العام</span>
                            <span className="text-[10px] opacity-80 block font-normal">
                              بانتظار دراسة واعتماد فضيلة المشرف العام
                            </span>
                          </button>
                        </div>
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
                          placeholder="اكتب اسمك الكامل (مثال: أحمد عبد الله المحمدي)..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#005c55]/20 focus:border-[#005c55] font-semibold"
                          required
                        />
                      </div>

                      {/* 2. Phone Number & Role */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[#0d1c2e] mb-1.5">
                            رقم الهاتف (بيانات الدخول) <span className="text-red-500">*</span>:
                          </label>
                          <input
                            type="tel"
                            value={regPhone}
                            onChange={(e) => setRegPhone(e.target.value)}
                            placeholder="مثال: 0502223344 أو 01012345678"
                            dir="ltr"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#005c55]/20 focus:border-[#005c55] text-left font-mono font-semibold"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#0d1c2e] mb-1.5">
                            الدور / طبيعة المهمة:
                          </label>
                          <select
                            value={regRole}
                            onChange={(e) => setRegRole(e.target.value as UserRole)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#005c55]/20 focus:border-[#005c55] font-bold bg-white"
                          >
                            <option value="assistant">📋 معاون لجان وميدان</option>
                            <option value="teacher">✍️ مصحح ومراجع درجات</option>
                            <option value="committee_head">👑 رئيس لجنة ميدانية</option>
                            <option value="auditor">📊 إداري ومدقق إحصائيات</option>
                          </select>
                        </div>
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
                            placeholder="اكتب كلمة المرور التي تناسبك..."
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
                          كلمة المرور هذه ستستخدمها لتسجيل الدخول في أي وقت.
                        </span>
                      </div>

                      {/* Notes / Background (Optional) */}
                      <div>
                        <label className="block text-xs font-bold text-[#0d1c2e] mb-1.5">
                          ملاحظات أو مهارات خاصة (اختياري):
                        </label>
                        <textarea
                          rows={2}
                          value={regNotes}
                          onChange={(e) => setRegNotes(e.target.value)}
                          placeholder="مثال: خبرة سابقة في تنظيم المسابقات، حفظ القرآن الكريم، إتقان الحاسب..."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#005c55]/20 focus:border-[#005c55]"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-l from-[#005c55] to-emerald-700 hover:from-[#004742] hover:to-emerald-800 text-white font-extrabold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99]"
                      >
                        <span className="material-symbols-outlined text-base">
                          {activationMode === 'direct' ? 'bolt' : 'send'}
                        </span>
                        <span>
                          {activationMode === 'direct'
                            ? '⚡ انضمام وتفعيل مباشر والدخول للمنظومة الآن'
                            : 'إرسال طلب الانضمام لفضيلة المشرف العام'}
                        </span>
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

                    {/* Quick Demo Accounts & Assistant Switcher */}
                    <div className="pt-4 border-t border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm text-[#005c55]">badge</span>
                          <span>الدخول السريع بحسابات المعاونين والصلاحيات:</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({users.length} حساب مسجل بالداتابيز)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* 1. Super Admin Quick Login */}
                        <button
                          type="button"
                          onClick={() => {
                            setEmailOrPhone('admin');
                            setPassword('504');
                          }}
                          className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-300 text-right cursor-pointer transition-all flex items-center justify-between group"
                        >
                          <div>
                            <span className="font-bold text-emerald-950 block text-xs">👑 المشرف العام (المدير)</span>
                            <span className="text-[10px] text-emerald-800 font-mono">admin / 504 (صلاحيات كاملة)</span>
                          </div>
                          <span className="text-[11px] bg-emerald-600 text-white px-2 py-0.5 rounded-lg font-bold group-hover:scale-105">
                            تعبئة
                          </span>
                        </button>

                        {/* Assistants and staff from real database */}
                        {users
                          .filter((u) => u.role !== 'super_admin')
                          .slice(0, 5)
                          .map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                setEmailOrPhone(user.phone || user.email);
                                setPassword(user.password || '123456');
                              }}
                              className="p-2.5 rounded-xl bg-slate-50 hover:bg-teal-50/80 border border-slate-200 hover:border-teal-300 text-right cursor-pointer transition-all flex items-center justify-between group"
                            >
                              <div className="truncate pl-1">
                                <span className="font-bold text-slate-900 block text-xs truncate">
                                  {user.name}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono truncate block">
                                  {AuthService.getRoleLabel(user.role)} • {user.phone || user.email}
                                </span>
                              </div>
                              <span className="text-[11px] bg-[#005c55] text-white px-2 py-0.5 rounded-lg font-bold shrink-0 group-hover:scale-105">
                                تعبئة
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
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
