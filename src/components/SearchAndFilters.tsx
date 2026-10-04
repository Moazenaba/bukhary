import React, { useRef, useEffect, useState } from 'react';
import { StageKey, STAGES_LIST, Course } from '../types';

interface SearchAndFiltersProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedStage: 'all' | StageKey;
  setSelectedStage: (s: 'all' | StageKey) => void;
  stageCounts: Record<string, number>;
  sortBy: 'newest' | 'oldest' | 'committeeNumber' | 'book';
  setSortBy: (sort: 'newest' | 'oldest' | 'committeeNumber' | 'book') => void;
  courses?: Course[];
  selectedCourseId?: string | 'all';
  setSelectedCourseId?: (id: string | 'all') => void;
  genderFilter?: 'all' | 'men' | 'women';
  setGenderFilter?: (g: 'all' | 'men' | 'women') => void;
}

export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  selectedStage,
  setSelectedStage,
  stageCounts,
  sortBy,
  setSortBy,
  courses = [],
  selectedCourseId = 'all',
  setSelectedCourseId,
  genderFilter = 'all',
  setGenderFilter,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const sortLabels = {
    newest: 'الأحدث تسجيلاً',
    oldest: 'الأقدم تسجيلاً',
    committeeNumber: 'رقم اللجنة تصاعدياً',
    book: 'ترتيب حسب اسم الكتاب',
  };

  return (
    <>
      {/* Search & Actions Toolbar */}
      <section className="bg-white border border-[#bdc9c6]/50 rounded-2xl p-4 mb-6 shadow-xs">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Wide Search Box */}
          <div className="relative w-full md:flex-1">
            <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-[#6e7977]">
              <span className="material-symbols-outlined text-xl">search</span>
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث باسم اللجنة، أو الرقم (#1)، أو اسم الشيخ / العضو، أو اسم الكتاب، أو الفرع..."
              className="w-full bg-[#f8f9ff] border border-[#bdc9c6]/70 focus:border-[#005c55] focus:ring-4 focus:ring-[#005c55]/10 rounded-xl py-3 pr-11 pl-20 sm:pl-24 text-[#0d1c2e] text-[13px] placeholder:text-[#6e7977] transition-all duration-150 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 left-16 sm:left-20 flex items-center pl-2 text-gray-400 hover:text-gray-600"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
            <div className="absolute inset-y-0 left-0 flex items-center pl-3">
              <kbd className="hidden sm:inline-block px-2 py-0.5 text-xs text-[#bdc9c6] bg-[#dce9ff]/60 text-[#3e4947] rounded font-mono border border-[#bdc9c6]/40">
                Ctrl + K
              </kbd>
            </div>
          </div>

          {/* Controls: Women Filter, Course Filter & Sort Controls */}
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
            {/* Optional Women-Only Committees Filter Toggle */}
            {setGenderFilter && (
              <button
                type="button"
                onClick={() => setGenderFilter(genderFilter === 'women' ? 'all' : 'women')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  genderFilter === 'women'
                    ? 'bg-rose-700 text-white border-rose-700 shadow-xs ring-2 ring-rose-200'
                    : 'bg-white border-[#bdc9c6]/70 text-[#3e4947] hover:bg-rose-50 hover:border-rose-300'
                }`}
                title={genderFilter === 'women' ? 'إلغاء التصفية وعرض كافة اللجان' : 'تصفية اللجان النسائية فقط'}
              >
                <span>🧕</span>
                <span>اللجان النسائية</span>
                {genderFilter === 'women' && (
                  <span className="text-[10px] bg-white/25 px-1.5 py-0.2 rounded-full font-mono">مفعل ✓</span>
                )}
              </button>
            )}

            {/* Course Filter Dropdown */}
            {courses.length > 0 && setSelectedCourseId && (
              <div className="flex items-center gap-1.5 bg-[#f8f9ff] border border-[#bdc9c6]/70 rounded-xl px-2.5 py-1.5">
                <span className="material-symbols-outlined text-sm text-[#005c55]">event_repeat</span>
                <span className="text-[11px] font-bold text-[#6e7977] hidden sm:inline">الدورة:</span>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-[#005c55] outline-none cursor-pointer"
                >
                  <option value="all">جميع الدورات ({courses.length})</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name} {course.status === 'active' ? '⚡ (نشطة)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Controls */}
            <div className="relative">
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[#bdc9c6]/70 bg-white text-[#3e4947] hover:bg-[#e6eeff]/40 text-xs font-semibold transition-colors active:scale-[0.98] cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">swap_vert</span>
                <span>{sortLabels[sortBy]}</span>
              </button>

              {showSortDropdown && (
                <div className="absolute left-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-[#bdc9c6]/50 py-1.5 z-30 animate-in fade-in duration-100 text-right">
                  <button
                    onClick={() => {
                      setSortBy('newest');
                      setShowSortDropdown(false);
                    }}
                    className={`w-full text-right px-4 py-2 text-xs font-semibold hover:bg-[#eff4ff] flex items-center justify-between ${
                      sortBy === 'newest' ? 'text-[#005c55] bg-[#eff4ff]' : 'text-[#0d1c2e]'
                    }`}
                  >
                    <span>الأحدث أولاً</span>
                    {sortBy === 'newest' && <span className="material-symbols-outlined text-sm">check</span>}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('oldest');
                      setShowSortDropdown(false);
                    }}
                    className={`w-full text-right px-4 py-2 text-xs font-semibold hover:bg-[#eff4ff] flex items-center justify-between ${
                      sortBy === 'oldest' ? 'text-[#005c55] bg-[#eff4ff]' : 'text-[#0d1c2e]'
                    }`}
                  >
                    <span>الأقدم أولاً</span>
                    {sortBy === 'oldest' && <span className="material-symbols-outlined text-sm">check</span>}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('committeeNumber');
                      setShowSortDropdown(false);
                    }}
                    className={`w-full text-right px-4 py-2 text-xs font-semibold hover:bg-[#eff4ff] flex items-center justify-between ${
                      sortBy === 'committeeNumber' ? 'text-[#005c55] bg-[#eff4ff]' : 'text-[#0d1c2e]'
                    }`}
                  >
                    <span>رقم اللجنة</span>
                    {sortBy === 'committeeNumber' && <span className="material-symbols-outlined text-sm">check</span>}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('book');
                      setShowSortDropdown(false);
                    }}
                    className={`w-full text-right px-4 py-2 text-xs font-semibold hover:bg-[#eff4ff] flex items-center justify-between ${
                      sortBy === 'book' ? 'text-[#005c55] bg-[#eff4ff]' : 'text-[#0d1c2e]'
                    }`}
                  >
                    <span>اسم الكتاب</span>
                    {sortBy === 'book' && <span className="material-symbols-outlined text-sm">check</span>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Horizontal Filter Tabs per Stage */}
      <section className="mb-6 overflow-x-auto pb-2 scrollbar-none">
        <div className="flex items-center gap-2 min-w-max">
          {/* All */}
          <button
            onClick={() => setSelectedStage('all')}
            className={`px-4 py-2 rounded-full text-[13px] font-semibold shadow-xs flex items-center gap-2 transition-all cursor-pointer ${
              selectedStage === 'all'
                ? 'bg-[#005c55] text-white shadow-sm'
                : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:border-[#005c55] hover:text-[#005c55]'
            }`}
          >
            <span>كافة اللجان</span>
            <span
              className={`px-2 py-0.5 text-xs rounded-full ${
                selectedStage === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-[#0d1c2e]'
              }`}
            >
              {stageCounts.all || 0}
            </span>
          </button>

          {/* Dynamic Stages from STAGES_LIST */}
          {STAGES_LIST.slice(1).map((stg) => {
            const isSelected = selectedStage === stg.key;
            const count = stageCounts[stg.key] || 0;

            return (
              <button
                key={stg.key}
                onClick={() => setSelectedStage(stg.key)}
                className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? `${stg.badgeClass} shadow-xs font-bold`
                    : 'bg-white text-[#3e4947] border border-[#bdc9c6]/60 hover:border-[#005c55]'
                }`}
              >
                <span>{stg.emoji}</span>
                <span>{stg.activeLabel}</span>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    isSelected ? 'bg-black/10' : 'bg-gray-100 text-[#0d1c2e]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
};
