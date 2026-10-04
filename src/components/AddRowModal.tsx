import React, { useState } from 'react';
import { CourseTableRow } from '../types/tableTypes';

interface AddRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddRow: (row: CourseTableRow) => void;
  nextNumber: number;
}

export const AddRowModal: React.FC<AddRowModalProps> = ({
  isOpen,
  onClose,
  onAddRow,
  nextNumber,
}) => {
  if (!isOpen) return null;

  const [number, setNumber] = useState<number>(nextNumber);
  const [sheikhName, setSheikhName] = useState<string>('');
  const [place, setPlace] = useState<string>('مسجد الإمام البخاري');
  const [book, setBook] = useState<string>('الأصول الثلاثة');
  const [delivered, setDelivered] = useState<boolean>(false);
  const [corrected, setCorrected] = useState<boolean>(false);
  const [reviewed, setReviewed] = useState<boolean>(false);
  const [announced, setAnnounced] = useState<boolean>(false);
  const [ceremony, setCeremony] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheikhName.trim()) {
      alert('يرجى إدخال اسم الشيخ');
      return;
    }

    const newRow: CourseTableRow = {
      id: `row-${Date.now()}`,
      number: Number(number) || nextNumber,
      sheikh_name: sheikhName.trim(),
      place: place.trim() || 'مسجد الإمام البخاري',
      book: book.trim() || 'متن مقرر',
      delivered,
      corrected,
      reviewed,
      announced,
      ceremony,
      struck_out: false,
      uncertain: false,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    };

    onAddRow(newRow);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#bdc9c6]/50 flex flex-col overflow-hidden animate-in fade-in duration-150 text-right">
        {/* Header */}
        <div className="px-5 py-4 bg-[#f8f9ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#005c55]/10 text-[#005c55] flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">add_task</span>
            </span>
            <h3 className="text-sm font-bold text-[#0d1c2e]">إضافة صف جديد إلى الجدول</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white text-gray-400 hover:text-gray-700"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                رقم تسلسلي (م)
              </label>
              <input
                type="number"
                value={number}
                onChange={(e) => setNumber(parseInt(e.target.value) || nextNumber)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 font-mono font-bold outline-none focus:border-[#005c55]"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                اسم الشيخ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={sheikhName}
                onChange={(e) => setSheikhName(e.target.value)}
                placeholder="اسم فضيلة الشيخ..."
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 outline-none focus:border-[#005c55]"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                المكان / القاعة
              </label>
              <input
                type="text"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 outline-none focus:border-[#005c55]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
                الكتاب المقرر
              </label>
              <input
                type="text"
                value={book}
                onChange={(e) => setBook(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 outline-none focus:border-[#005c55] font-semibold text-[#005c55]"
              />
            </div>
          </div>

          {/* 5 Stages Checkboxes */}
          <div className="bg-[#f8f9ff] p-3 rounded-xl border border-[#bdc9c6]/50 space-y-2">
            <span className="block text-[11px] font-bold text-[#005c55]">
              مراحل الإنجاز الحالية للصف:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-[#bdc9c6]/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={delivered}
                  onChange={(e) => setDelivered(e.target.checked)}
                  className="rounded text-blue-600 accent-blue-600"
                />
                <span className="font-semibold text-blue-900">1. التسليم للمقر</span>
              </label>

              <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-[#bdc9c6]/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={corrected}
                  onChange={(e) => setCorrected(e.target.checked)}
                  className="rounded text-amber-600 accent-amber-600"
                />
                <span className="font-semibold text-amber-900">2. تم التصحيح</span>
              </label>

              <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-[#bdc9c6]/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="rounded text-purple-600 accent-purple-600"
                />
                <span className="font-semibold text-purple-900">3. تم المراجعة</span>
              </label>

              <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-[#bdc9c6]/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={announced}
                  onChange={(e) => setAnnounced(e.target.checked)}
                  className="rounded text-indigo-600 accent-indigo-600"
                />
                <span className="font-semibold text-indigo-900">4. تم الإعلان</span>
              </label>

              <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-[#bdc9c6]/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ceremony}
                  onChange={(e) => setCeremony(e.target.checked)}
                  className="rounded text-emerald-600 accent-emerald-600"
                />
                <span className="font-semibold text-emerald-900">5. تم الحفل</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#0d1c2e] mb-1">
              ملاحظات
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات خاصة..."
              className="w-full bg-[#f8f9ff] border border-[#bdc9c6] rounded-xl px-3 py-2 outline-none focus:border-[#005c55]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#bdc9c6]/30">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#3e4947] border border-[#bdc9c6] hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#005c55] hover:bg-[#1b6b51] shadow-xs cursor-pointer"
            >
              إضافة الصف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
