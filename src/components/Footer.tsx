import React, { useState } from 'react';

export const Footer: React.FC = () => {
  const [modalContent, setModalContent] = useState<string | null>(null);

  return (
    <>
      <footer className="mt-12 bg-white border-t border-[#bdc9c6]/30 py-6 text-center text-right">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[#005c55] text-[16px] font-bold">
            <span className="material-symbols-outlined">mosque</span>
            <span>مسابقات مسجد البخاري العلمية</span>
          </div>

          <p className="text-[12px] sm:text-[13px] text-[#3e4947]">
            نظام إدارة لجان الاختبار والتصحيح لمتون العقيدة والكتب الشرعية © 1445هـ — جميع الحقوق محفوظة
          </p>

          <div className="flex items-center gap-3 sm:gap-4 text-[#3e4947] text-[11px] sm:text-[12px] font-medium">
            <button
              onClick={() => setModalContent('guide')}
              className="hover:text-[#005c55] transition-colors cursor-pointer"
            >
              دليل لجان مسجد البخاري
            </button>
            <span>•</span>
            <button
              onClick={() => setModalContent('standards')}
              className="hover:text-[#005c55] transition-colors cursor-pointer"
            >
              ضوابط الاختبار والتصحيح
            </button>
            <span>•</span>
            <button
              onClick={() => setModalContent('sheets')}
              className="hover:text-[#005c55] transition-colors cursor-pointer"
            >
              قاعدة بيانات Google Sheets
            </button>
          </div>
        </div>
      </footer>

      {/* Info Modals */}
      {modalContent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-[#bdc9c6]/40 text-right animate-in fade-in">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#bdc9c6]/30">
              <h3 className="font-bold text-base text-[#005c55]">
                {modalContent === 'guide'
                  ? 'دليل لجان مسابقات مسجد البخاري'
                  : modalContent === 'standards'
                  ? 'ضوابط تصحيح واختبار متون العقيدة'
                  : 'ربط ومزامنة Google Sheets'}
              </h3>
              <button
                onClick={() => setModalContent(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="text-xs text-[#3e4947] space-y-3 leading-relaxed">
              {modalContent === 'guide' && (
                <>
                  <p>
                    <strong>1. تسجيل اللجان:</strong> يتم تسجيل كل لجنة باسمها المحدد وكتاب المسابقة (مثل كتاب الأصول الثلاثة، كتاب التوحيد، القواعد الأربع) مع تعيين أعضاء اللجنة.
                  </p>
                  <p>
                    <strong>2. تسلسل المراحل:</strong> تمر اللجنة بالمراحل التالية: التسجيل ⬅️ جاري الامتحان ⬅️ التصحيح ⬅️ تجميع الدرجات ⬅️ كتابة الكشف ⬅️ المراجعة ⬅️ إعلان النتيجة ⬅️ الحفل.
                  </p>
                  <p>
                    <strong>3. التوثيق الزمني التلقائي:</strong> يتم توثيق تاريخ وساعة إتمام كل مرحلة آلياً عند تحويل مفتاح التبديل إلى "تم".
                  </p>
                </>
              )}

              {modalContent === 'standards' && (
                <>
                  <p>
                    <strong>• اختبار حفظ المتن:</strong> الدقة في استحضار عبارات المتن وألفاظ المصنف بدون تقديم أو تأخير.
                  </p>
                  <p>
                    <strong>• اختبار فهم المسائل وشرح الأصول:</strong> استيعاب القواعد والمسائل العقدية المقررة في الكتاب.
                  </p>
                  <p>
                    <strong>• اعتماد الكشوفات:</strong> يتم توقيع أعضاء اللجنة وإحالة الكشف للمراجعة والاعتماد النهائي قبل الإعلان.
                  </p>
                </>
              )}

              {modalContent === 'sheets' && (
                <>
                  <p>
                    ترتبط المنصة مباشرة بجدول Google Sheets، وكل إضافة لجنة أو تغيير لمرحلة أو كتابة ملاحظة يتم تحديثها فورياً في خلايا وصفوف الملف.
                  </p>
                  <div className="bg-[#f8f9ff] p-3 rounded-xl border border-[#bdc9c6]/40 space-y-1">
                    <p>• البيانات تحفظ لحظياً في متصفحك (LocalStorage)</p>
                    <p>• يمكنك استخراج ملف CSV متوافق تماماً مع Google Sheets و Excel</p>
                    <p>• إمكانية ربط Webhook آلي لإرسال الصفوف مباشرة إلى Google Sheets</p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-[#bdc9c6]/30 flex justify-end">
              <button
                onClick={() => setModalContent(null)}
                className="px-4 py-1.5 rounded-xl bg-[#005c55] text-white text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
