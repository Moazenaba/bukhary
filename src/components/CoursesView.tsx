import React, { useState } from 'react';
import { Course, Committee, AppUser } from '../types';

interface CoursesViewProps {
  courses: Course[];
  committees: Committee[];
  currentUser: AppUser;
  onAddCourse: (course: Omit<Course, 'id' | 'createdAt'>) => void;
  onUpdateCourse: (course: Course) => void;
  onDeleteCourse: (courseId: string) => void;
  onSetDefaultCourse: (courseId: string) => void;
  onNavigateCommitteesByCourse: (courseId: string) => void;
}

export const CoursesView: React.FC<CoursesViewProps> = ({
  courses,
  committees,
  currentUser,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  onSetDefaultCourse,
  onNavigateCommitteesByCourse,
}) => {
  const isSuperAdmin = currentUser.role === 'super_admin';
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed' | 'upcoming'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [season, setSeason] = useState('صيفية');
  const [year, setYear] = useState('1447هـ / 2026م');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [targetCommitteesCount, setTargetCommitteesCount] = useState<number>(30);
  const [status, setStatus] = useState<'active' | 'completed' | 'upcoming'>('active');

  const filteredCourses = courses.filter((c) => {
    if (filterStatus === 'all') return true;
    return c.status === filterStatus;
  });

  const getCourseCommittees = (courseId: string) => {
    return committees.filter((c) => c.courseId === courseId || (!c.courseId && courseId === 'course-summer-1447'));
  };

  const handleOpenAdd = () => {
    setName('');
    setSeason('صيفية');
    setYear('1448هـ / 2026م');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setDescription('');
    setTargetCommitteesCount(30);
    setStatus('active');
    setIsAddModalOpen(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onAddCourse({
      name: name.trim(),
      season,
      year: year.trim(),
      startDate: startDate || new Date().toISOString().split('T')[0],
      endDate: endDate || '',
      status,
      description: description.trim(),
      targetCommitteesCount: Number(targetCommitteesCount) || 30,
      isDefault: status === 'active',
    });

    setIsAddModalOpen(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    onUpdateCourse(editingCourse);
    setEditingCourse(null);
  };

  return (
    <div className="space-y-6 text-right">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-[#005c55] to-teal-800 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-white/20 text-white">
              <span className="material-symbols-outlined text-2xl">event_repeat</span>
            </span>
            <h2 className="text-xl sm:text-2xl font-bold">
              إدارة الدورات والمسابقات الموسمية
            </h2>
          </div>
          <p className="text-xs text-teal-100 mt-1 max-w-2xl leading-relaxed">
            تنظيم مسابقات مسجد البخاري على مستوى الدورات (دورة الصيف، دورة الشتاء، الدورات المكثفة).
            تُربط اللجان بكل دورة تلقائياً، وتُحفظ الدورات المكتملة بأرشيفها وسجلاتها الدائمة.
          </p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-[#005c55] hover:bg-emerald-50 text-xs sm:text-sm font-bold shadow-md active:scale-[0.98] transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-xl text-emerald-600">add_circle</span>
            <span>+ إضافة دورة جديدة</span>
          </button>
        )}
      </div>

      {/* Filter Tabs & Counter */}
      <div className="flex items-center justify-between border-b border-[#bdc9c6]/40 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-[#005c55] text-white shadow-xs'
                : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:bg-[#eff4ff]'
            }`}
          >
            جميع الدورات ({courses.length})
          </button>
          <button
            onClick={() => setFilterStatus('active')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'active'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:bg-emerald-50'
            }`}
          >
            الدورات النشطة ({courses.filter((c) => c.status === 'active').length})
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'completed'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:bg-gray-100'
            }`}
          >
            المكتملة والمؤرشفة ({courses.filter((c) => c.status === 'completed').length})
          </button>
          <button
            onClick={() => setFilterStatus('upcoming')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'upcoming'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:bg-blue-50'
            }`}
          >
            الدورات القادمة ({courses.filter((c) => c.status === 'upcoming').length})
          </button>
        </div>

        <span className="text-[11px] text-[#6e7977]">
          إجمالي اللجان المسجلة بالمنظومة: <strong>{committees.length} لجنة</strong>
        </span>
      </div>

      {/* Courses Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCourses.map((course) => {
          const courseComms = getCourseCommittees(course.id);
          const completedComms = courseComms.filter((c) => c.stages.ceremony?.completed).length;

          return (
            <div
              key={course.id}
              className={`bg-white rounded-2xl border p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative ${
                course.isDefault
                  ? 'border-emerald-500 ring-2 ring-emerald-400/30'
                  : 'border-[#bdc9c6]/60'
              }`}
            >
              <div>
                {/* Status Badges Header */}
                <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-[#bdc9c6]/30">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                        course.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : course.status === 'completed'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">
                        {course.status === 'active'
                          ? 'local_fire_department'
                          : course.status === 'completed'
                          ? 'inventory_2'
                          : 'upcoming'}
                      </span>
                    </span>

                    <div>
                      <span className="text-[11px] font-bold text-[#6e7977] block">
                        {course.season} • {course.year}
                      </span>
                      <h3 className="font-bold text-sm sm:text-base text-[#0d1c2e] leading-snug">
                        {course.name}
                      </h3>
                    </div>
                  </div>

                  {course.isDefault && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
                      الدورة الحالية
                    </span>
                  )}
                </div>

                {/* Description */}
                {course.description && (
                  <p className="text-xs text-[#3e4947] bg-[#f8f9ff] p-3 rounded-xl border border-[#bdc9c6]/30 mb-4 leading-relaxed">
                    {course.description}
                  </p>
                )}

                {/* Statistics Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                  <div className="bg-[#f8f9ff] p-2.5 rounded-xl border border-[#bdc9c6]/30">
                    <span className="text-[10px] text-[#6e7977] block font-semibold">اللجان المرتبطة:</span>
                    <span className="text-base font-bold text-[#005c55] font-mono">
                      {courseComms.length} لجنة
                    </span>
                    <span className="text-[10px] text-gray-500 block">
                      (الهدف: {course.targetCommitteesCount || 30})
                    </span>
                  </div>

                  <div className="bg-[#f8f9ff] p-2.5 rounded-xl border border-[#bdc9c6]/30">
                    <span className="text-[10px] text-[#6e7977] block font-semibold">المراحل المكتملة:</span>
                    <span className="text-base font-bold text-emerald-700 font-mono">
                      {completedComms} من {courseComms.length}
                    </span>
                    <span className="text-[10px] text-gray-500 block">
                      {courseComms.length > 0 ? Math.round((completedComms / courseComms.length) * 100) : 0}% إنجاز
                    </span>
                  </div>
                </div>

                {/* Date range */}
                <div className="text-[11px] text-[#6e7977] flex items-center justify-between mb-2">
                  <span>الفترة الزمنية:</span>
                  <span className="font-mono text-[#0d1c2e] font-semibold">
                    {course.startDate} {course.endDate ? `إلى ${course.endDate}` : '(مفتوحة)'}
                  </span>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-[#bdc9c6]/30 space-y-2">
                <button
                  type="button"
                  onClick={() => onNavigateCommitteesByCourse(course.id)}
                  className="w-full py-2 px-3 rounded-xl bg-[#005c55] hover:bg-[#1b6b51] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.98] transition-all"
                >
                  <span className="material-symbols-outlined text-sm">groups</span>
                  <span>عرض لجان هذه الدورة ({courseComms.length})</span>
                </button>

                {isSuperAdmin && (
                  <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                    {!course.isDefault && (
                      <button
                        type="button"
                        onClick={() => onSetDefaultCourse(course.id)}
                        className="text-[#005c55] hover:underline font-bold text-[11px] cursor-pointer"
                      >
                        ✓ تعيين كدورة نشطة
                      </button>
                    )}

                    <div className="flex items-center gap-2 ms-auto">
                      <button
                        type="button"
                        onClick={() => setEditingCourse(course)}
                        className="text-amber-800 hover:text-amber-950 font-semibold text-[11px] cursor-pointer"
                      >
                        تعديل
                      </button>

                      {courses.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteCourse(course.id)}
                          className="text-red-500 hover:text-red-700 font-semibold text-[11px] cursor-pointer"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ADD COURSE MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#bdc9c6]/50 overflow-hidden animate-in fade-in duration-150">
            <div className="px-5 py-4 bg-gradient-to-l from-emerald-50 to-[#eff4ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-[#005c55] text-white flex items-center justify-center font-bold shadow-xs">
                  <span className="material-symbols-outlined text-xl">event_repeat</span>
                </span>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#0d1c2e]">
                    إضافة دورة مسابقات جديدة
                  </h3>
                  <p className="text-[11px] text-[#6e7977]">
                    تخصيص دورة جديدة وربط اللجان بها تلقائياً
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1">
                  اسم الدورة المسابقاتية <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: دورة الشتاء 1448هـ، دورة المتون المكثفة..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#005c55] font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">الموسم / النوع</label>
                  <select
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  >
                    <option value="صيفية">دورة صيفية</option>
                    <option value="شتوية">دورة شتوية</option>
                    <option value="رمضانية">دورة رمضانية</option>
                    <option value="مكثفة">دورة مكثفة</option>
                    <option value="سنوية">مسابقة سنوية</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">العام / السنة</label>
                  <input
                    type="text"
                    placeholder="1448هـ / 2026م"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">تاريخ البداية</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">تاريخ النهاية المتوقع</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">حالة الدورة</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  >
                    <option value="active">نشطة حالياً (جارية)</option>
                    <option value="upcoming">قادمة (مستقبلية)</option>
                    <option value="completed">مكتملة ومؤرشفة</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">عدد اللجان المتوقع</label>
                  <input
                    type="number"
                    value={targetCommitteesCount}
                    onChange={(e) => setTargetCommitteesCount(Number(e.target.value))}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1">وصف الدورة والأهداف</label>
                <textarea
                  rows={3}
                  placeholder="وصف المسار، شروط الالتحاق، القاعات المخصصة..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl p-2.5 text-xs outline-none focus:border-[#005c55]"
                />
              </div>

              <div className="pt-3 border-t border-[#bdc9c6]/30 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-gray-600 border border-gray-300 hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#005c55] hover:bg-[#1b6b51] text-white font-bold cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  إنشاء الدورة وربط اللجان بها
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT COURSE MODAL */}
      {editingCourse && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto text-right">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#bdc9c6]/50 overflow-hidden animate-in fade-in duration-150">
            <div className="px-5 py-4 bg-gradient-to-l from-amber-50 to-[#eff4ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <span className="material-symbols-outlined text-xl">edit</span>
                </span>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#0d1c2e]">
                    تعديل بيانات: {editingCourse.name}
                  </h3>
                  <p className="text-[11px] text-[#6e7977]">
                    تحديث الحالة، التواريخ، أو إنهاء وأرشفة الدورة
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingCourse(null)}
                className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1">
                  اسم الدورة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingCourse.name}
                  onChange={(e) => setEditingCourse({ ...editingCourse, name: e.target.value })}
                  className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#005c55] font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">الموسم</label>
                  <input
                    type="text"
                    value={editingCourse.season || ''}
                    onChange={(e) => setEditingCourse({ ...editingCourse, season: e.target.value })}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">العام</label>
                  <input
                    type="text"
                    value={editingCourse.year}
                    onChange={(e) => setEditingCourse({ ...editingCourse, year: e.target.value })}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">حالة الدورة</label>
                  <select
                    value={editingCourse.status}
                    onChange={(e) => setEditingCourse({ ...editingCourse, status: e.target.value as any })}
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55]"
                  >
                    <option value="active">نشطة حالياً</option>
                    <option value="completed">مكتملة ومؤرشفة (دورة سابقة)</option>
                    <option value="upcoming">قادمة (مستقبلية)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#0d1c2e] mb-1">عدد اللجان المستهدف</label>
                  <input
                    type="number"
                    value={editingCourse.targetCommitteesCount || 30}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        targetCommitteesCount: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 text-xs outline-none focus:border-[#005c55] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#0d1c2e] mb-1">الوصف</label>
                <textarea
                  rows={3}
                  value={editingCourse.description || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                  className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl p-2.5 text-xs outline-none focus:border-[#005c55]"
                />
              </div>

              <div className="pt-3 border-t border-[#bdc9c6]/30 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCourse(null)}
                  className="px-4 py-2 rounded-xl text-gray-600 border border-gray-300 hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
