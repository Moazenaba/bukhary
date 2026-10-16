import React, { useState } from 'react';
import { AppUser } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser;
  users: AppUser[];
  onSelectUser: (user: AppUser) => void;
  onRegisterAssistant: (name: string, phone: string, email: string, notes?: string) => void;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  users,
  onSelectUser,
  onRegisterAssistant,
  onLogout,
}) => {
  if (!isOpen) return null;

  const [mode, setMode] = useState<'switch' | 'register'>('switch');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regNotes, setRegNotes] = useState('');
  const [regSuccessMessage, setRegSuccessMessage] = useState(false);

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim()) return;

    onRegisterAssistant(
      regName.trim(),
      regPhone.trim(),
      regEmail.trim() || `${Date.now()}@bukhari.org`,
      regNotes.trim() || 'طلب تسجيل معاون جديد عبر بوابة التسجيل'
    );

    setRegSuccessMessage(true);
    setTimeout(() => {
      setRegSuccessMessage(false);
      setMode('switch');
      setRegName('');
      setRegPhone('');
      setRegEmail('');
      setRegNotes('');
    }, 3500);
  };

  const superAdminUser = users.find((u) => u.role === 'super_admin') || users[0];
  const approvedStaff = users.filter((u) => u.role !== 'super_admin' && u.status === 'approved');
  const pendingUsers = users.filter((u) => u.status === 'pending');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto text-right">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-[#bdc9c6]/50 overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-l from-[#005c55] to-emerald-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">admin_panel_settings</span>
            </span>
            <div>
              <h3 className="font-bold text-base sm:text-lg">
                إدارة الحسابات وصلاحيات المنظومة
              </h3>
              <p className="text-[11px] text-teal-100">
                الحساب النشط، تبديل الصلاحيات المعتمدة، أو تسجيل الخروج
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-white/80 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#bdc9c6]/40 bg-[#f8f9ff]">
          <button
            onClick={() => setMode('switch')}
            className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              mode === 'switch'
                ? 'border-[#005c55] text-[#005c55] bg-white'
                : 'border-transparent text-[#6e7977] hover:text-[#0d1c2e]'
            }`}
          >
            تبديل الحساب النشط
          </button>

          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              mode === 'register'
                ? 'border-[#005c55] text-[#005c55] bg-white'
                : 'border-transparent text-[#6e7977] hover:text-[#0d1c2e]'
            }`}
          >
            + تقديم طلب اعتماد حساب جديد
          </button>
        </div>

        <div className="p-5">
          {/* MODE 1: SWITCH / CURRENT ACCOUNT */}
          {mode === 'switch' && (
            <div className="space-y-4 text-xs">
              {/* Current Active Account Box */}
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-800 font-bold block mb-0.5">
                    الحساب المسجل به حالياً:
                  </span>
                  <span className="font-bold text-sm text-[#0d1c2e] block">
                    {currentUser.name}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    {currentUser.role === 'super_admin' ? '👑 المشرف العام (مدير النظام بكامل الصلاحيات)' :
                     currentUser.role === 'committee_head' ? '👨‍🏫 رئيس لجنة واختبارات' :
                     currentUser.role === 'teacher' ? '📖 معلم ومقرئ معتمد' :
                     currentUser.role === 'auditor' ? '🔍 مراجع ومدقق جودة' : '👤 معاون ميداني معتمد'}
                  </span>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-xs bg-emerald-600 text-white font-bold px-2.5 py-0.5 rounded-full">
                    نشط الآن
                  </span>
                  <button
                    onClick={() => {
                      onLogout();
                      onClose();
                    }}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xs" aria-hidden="true">logout</span>
                    <span>تسجيل الخروج للبوابة</span>
                  </button>
                </div>
              </div>

              {/* 1. Super Admin Account */}
              <div>
                <span className="font-bold text-[#0d1c2e] block mb-2 text-xs flex items-center gap-1">
                  <span>👑 حساب المشرف العام:</span>
                </span>

                <button
                  onClick={() => {
                    onSelectUser(superAdminUser);
                    onClose();
                  }}
                  className={`w-full p-3 rounded-xl border text-right flex items-center justify-between transition-all cursor-pointer ${
                    currentUser.id === superAdminUser.id
                      ? 'bg-[#005c55]/10 border-[#005c55] font-bold text-[#005c55]'
                      : 'bg-white border-[#bdc9c6]/60 hover:bg-[#eff4ff]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-sm">
                      👑
                    </span>
                    <div>
                      <span className="font-bold text-xs block text-[#0d1c2e]">
                        {superAdminUser.name}
                      </span>
                      <span className="text-[11px] text-[#6e7977]">
                        إدارة شاملة، قبول المعاونين، اعتماد المراحل، تصدير الكشوف
                      </span>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-[#005c55] bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    دخول كمشرف
                  </span>
                </button>
              </div>

              {/* 2. Staff and Assistants */}
              <div className="pt-2">
                <span className="font-bold text-[#0d1c2e] block mb-2 text-xs flex items-center gap-1">
                  <span>👥 المعلمون والمعاونون والمدققون:</span>
                </span>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {approvedStaff.map((staff) => {
                    const isSelected = currentUser.id === staff.id;
                    return (
                      <button
                        key={staff.id}
                        onClick={() => {
                          onSelectUser(staff);
                          onClose();
                        }}
                        className={`w-full p-2.5 rounded-xl border text-right flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#005c55]/10 border-[#005c55] text-[#005c55] font-bold'
                            : 'bg-white border-[#bdc9c6]/60 hover:bg-[#eff4ff]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            staff.role === 'committee_head' ? 'bg-blue-100 text-blue-800' :
                            staff.role === 'teacher' ? 'bg-indigo-100 text-indigo-800' :
                            staff.role === 'auditor' ? 'bg-purple-100 text-purple-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            <span className="material-symbols-outlined text-base" aria-hidden="true">
                              {staff.role === 'auditor' ? 'policy' : 'person'}
                            </span>
                          </span>
                          <div>
                            <span className="font-bold text-xs block text-[#0d1c2e]">
                              {staff.name}
                            </span>
                            <span className="text-[10px] text-[#6e7977]">
                              {staff.role === 'committee_head' ? 'رئيس لجنة' :
                               staff.role === 'teacher' ? 'معلم مقرأة' :
                               staff.role === 'auditor' ? 'مدقق جودة' : 'معاون ميداني'}
                              {staff.assignedCommittees.length > 0 && ` • لجان: ${staff.assignedCommittees.map(c => `#${c}`).join(', ')}`}
                            </span>
                          </div>
                        </div>

                        <span className="text-[11px] font-semibold text-[#005c55] bg-white border border-[#bdc9c6] px-2 py-0.5 rounded-lg">
                          تبديل
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Pending Notice */}
              {pendingUsers.length > 0 && (
                <div className="pt-2">
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-amber-900 text-xs">
                    <span className="font-bold block mb-1">
                      ⚠️ طلبات انضمام معلقة ({pendingUsers.length}):
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      هناك طلبات انضمام بانتظار موافقة المشرف العام من تبويب «المعاونون والصلاحيات». لا يمكنهم تسجيل الدخول الفعلي حتى يتم اعتمادهم.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: REGISTER NEW ASSISTANT (WAITING FOR APPROVAL) */}
          {mode === 'register' && (
            <div className="space-y-4 text-xs">
              {regSuccessMessage ? (
                <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-300 text-center space-y-2 animate-in fade-in">
                  <span className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto text-2xl font-bold">
                    ✓
                  </span>
                  <h4 className="font-bold text-base text-emerald-950">
                    تم إرسال طلب تسجيلك كمعاون بنجاح!
                  </h4>
                  <p className="text-xs text-emerald-800 leading-relaxed max-w-md mx-auto">
                    طلبك الآن معروض في لوحة **المشرف العام لمسجد البخاري**. بعد مراجعة الطلب والموافقة عليه، سيتم تفعيل حسابك وتحديد اللجان الميدانية المسندة إليك فوراً.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                    <span className="material-symbols-outlined text-base text-amber-600 shrink-0" aria-hidden="true">info</span>
                    <span>
                      <strong>نظام الاعتماد:</strong> تسجيل الحساب هنا يعتبر طلب انضمام كمعاون، ولن يتم تفعيل الحساب أو منحه صلاحيات استلام اللجان إلا بعد موافقة المشرف العام للمسجد.
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-[#0d1c2e] mb-1">
                      الاسم الكامل (ثلاثياً) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="اكتب اسمك الثلاثي..."
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55] font-semibold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-[#0d1c2e] mb-1">
                        رقم الجوال / الواتساب <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="05xxxxxxxx"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-[#0d1c2e] mb-1">البريد الإلكتروني</label>
                      <input
                        type="email"
                        placeholder="name@example.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-[#0d1c2e] mb-1">
                      نبذة أو رغبة التكليف (مثال: معاون في قاعة 1 أو رصد درجات)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="اكتب رغبتك أو المواعيد المناسبة لك للمساعدة في المسابقات..."
                      value={regNotes}
                      onChange={(e) => setRegNotes(e.target.value)}
                      className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl p-2.5 text-xs outline-none focus:border-[#005c55]"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('switch')}
                      className="px-4 py-2 rounded-xl text-gray-600 border border-gray-300 hover:bg-gray-50 cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-[#005c55] hover:bg-[#1b6b51] text-white font-bold cursor-pointer shadow-xs active:scale-[0.98]"
                    >
                      إرسال طلب الانضمام للمشرف العام
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
