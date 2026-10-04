import React, { useState, useRef, useEffect } from 'react';
import { CourseTableRow, ExtractedTableData } from '../types/tableTypes';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyExtractedRows: (rows: CourseTableRow[], mode: 'merge' | 'replace') => void;
  existingCount: number;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  isOpen,
  onClose,
  onApplyExtractedRows,
  existingCount,
}) => {
  if (!isOpen) return null;

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [contrastBoost, setContrastBoost] = useState<boolean>(false);
  const [cropTrim, setCropTrim] = useState<{ top: number; bottom: number; left: number; right: number }>({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });
  const [isCropMode, setIsCropMode] = useState<boolean>(false);

  // Extraction states
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<string>('');
  const [extractedData, setExtractedData] = useState<ExtractedTableData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reset states when closed/opened
  useEffect(() => {
    if (!isOpen) {
      setImageSrc(null);
      setRotation(0);
      setContrastBoost(false);
      setCropTrim({ top: 0, bottom: 0, left: 0, right: 0 });
      setIsCropMode(false);
      setIsExtracting(false);
      setExtractedData(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (JPG, PNG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageSrc(e.target?.result as string);
      setRotation(0);
      setCropTrim({ top: 0, bottom: 0, left: 0, right: 0 });
      setExtractedData(null);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRotate = (angle: number) => {
    setRotation((prev) => (prev + angle + 360) % 360);
  };

  // Generate processed canvas data URL (applying rotation and cropping)
  const getProcessedImageBase64 = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!imageSrc) return reject('No image loaded');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Canvas context not available');

        const rads = (rotation * Math.PI) / 180;
        const isSideways = rotation === 90 || rotation === 270;
        const origW = img.width;
        const origH = img.height;

        const canvasW = isSideways ? origH : origW;
        const canvasH = isSideways ? origW : origH;

        canvas.width = canvasW;
        canvas.height = canvasH;

        ctx.translate(canvasW / 2, canvasH / 2);
        ctx.rotate(rads);
        ctx.drawImage(img, -origW / 2, -origH / 2);

        // Apply crop if set
        if (cropTrim.top > 0 || cropTrim.bottom > 0 || cropTrim.left > 0 || cropTrim.right > 0) {
          const trimL = (canvasW * cropTrim.left) / 100;
          const trimR = (canvasW * cropTrim.right) / 100;
          const trimT = (canvasH * cropTrim.top) / 100;
          const trimB = (canvasH * cropTrim.bottom) / 100;

          const croppedW = Math.max(50, canvasW - trimL - trimR);
          const croppedH = Math.max(50, canvasH - trimT - trimB);

          const croppedCanvas = document.createElement('canvas');
          croppedCanvas.width = croppedW;
          croppedCanvas.height = croppedH;
          const cropCtx = croppedCanvas.getContext('2d');
          if (cropCtx) {
            if (contrastBoost) {
              cropCtx.filter = 'contrast(135%) brightness(95%)';
            }
            cropCtx.drawImage(canvas, trimL, trimT, croppedW, croppedH, 0, 0, croppedW, croppedH);
            return resolve(croppedCanvas.toDataURL('image/jpeg', 0.92));
          }
        }

        if (contrastBoost) {
          // Re-draw with contrast
          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = canvasW;
          finalCanvas.height = canvasH;
          const fCtx = finalCanvas.getContext('2d');
          if (fCtx) {
            fCtx.filter = 'contrast(135%) brightness(95%)';
            fCtx.drawImage(canvas, 0, 0);
            return resolve(finalCanvas.toDataURL('image/jpeg', 0.92));
          }
        }

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => reject('Failed to load image');
      img.src = imageSrc;
    });
  };

  const handleStartExtraction = async () => {
    if (!imageSrc) return;
    setIsExtracting(true);
    setErrorMessage(null);
    setExtractionProgress('جاري تهيئة الصورة ومعالجة التدوير والتباين...');

    try {
      const processedBase64 = await getProcessedImageBase64();

      setExtractionProgress('جاري إرسال الصورة لنموذج Gemini 2.5 Flash Vision...');

      const response = await fetch('/api/extract-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: processedBase64,
          mimeType: 'image/jpeg',
        }),
      });

      setExtractionProgress('جاري فك تشفير خط اليد العربي وتدقيق علامات الصح (✓)...');

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.details || `خطأ من الخادم (${response.status})`);
      }

      const resData = await response.json();
      if (!resData.success || !resData.data?.rows) {
        throw new Error('لم يتمكن الذكاء الاصطناعي من استخراج صفوف واضحة من الصورة.');
      }

      setExtractedData(resData.data);
      setExtractionProgress('');
    } catch (err: any) {
      console.error('Extraction error:', err);
      setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء استخراج البيانات من الصورة');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirmApplication = (mode: 'merge' | 'replace') => {
    if (!extractedData || !extractedData.rows) return;

    const newRows: CourseTableRow[] = extractedData.rows.map((r, idx) => ({
      id: `row-ocr-${Date.now()}-${idx + 1}`,
      number: r.number || idx + 1,
      sheikh_name: r.sheikh_name || 'غير محدد',
      place: r.place || 'مسجد الإمام البخاري',
      book: r.book || 'متن مقرر',
      delivered: !!r.delivered,
      corrected: !!r.corrected,
      reviewed: !!r.reviewed,
      announced: !!r.announced,
      ceremony: !!r.ceremony,
      struck_out: !!r.struck_out,
      uncertain: !!r.uncertain,
      notes: r.notes || '',
      updatedAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    }));

    onApplyExtractedRows(newRows, mode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-[#bdc9c6]/50 flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in duration-200 text-right">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#f8f9ff] border-b border-[#bdc9c6]/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#005c55]/10 text-[#005c55] flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">document_scanner</span>
            </span>
            <div>
              <h2 className="text-base font-bold text-[#0d1c2e] flex items-center gap-2">
                <span>استخراج جدول خط اليد بـ Gemini 2.5 Flash Vision</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                  AI OCR
                </span>
              </h2>
              <p className="text-xs text-[#6e7977]">
                التقط صورة الجدول المكتوب باليد أو ارفعها، واضبط زاوية الميلان ليقوم الذكاء الاصطناعي بقراءتها بدقة
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-[#bdc9c6]/40 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* 1. Upload & Camera Dropzone when no image is loaded */}
          {!imageSrc ? (
            <div className="border-2 border-dashed border-[#bdc9c6] hover:border-[#005c55] rounded-2xl p-8 bg-[#f8f9ff] text-center transition-all flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-[#005c55] flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-4xl">cloud_upload</span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#0d1c2e] mb-1">
                  اسحب صورة الجدول المكتوب باليد إلى هنا أو اخترها
                </h3>
                <p className="text-xs text-[#6e7977] max-w-md mx-auto">
                  يدعم صور كاميرا الهاتف أو المستندات الممسوحة ضوئياً لجداول مسابقات مسجد الإمام البخاري (JPG, PNG, WebP)
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap justify-center pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-[#005c55] text-white hover:bg-[#1b6b51] text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">photo_library</span>
                  <span>اختيار صورة من الجهاز</span>
                </button>

                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-white border border-[#bdc9c6] text-[#005c55] hover:bg-emerald-50 text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">photo_camera</span>
                  <span>التقاط بالكاميرا مباشرة</span>
                </button>
              </div>

              {/* Hidden file & camera inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
          ) : (
            /* 2. Image Loaded: Preview, Rotate, Crop & Extract Toolbar */
            <div className="space-y-4">
              {/* Image Toolbar */}
              <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-[#f8f9ff] border border-[#bdc9c6]/60 rounded-xl text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Rotate Buttons */}
                  <button
                    type="button"
                    onClick={() => handleRotate(90)}
                    className="px-2.5 py-1.5 bg-white border border-[#bdc9c6] hover:bg-gray-100 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    title="تدوير 90 درجة لليمين"
                  >
                    <span className="material-symbols-outlined text-sm">rotate_right</span>
                    <span>تدوير لليمين</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRotate(-90)}
                    className="px-2.5 py-1.5 bg-white border border-[#bdc9c6] hover:bg-gray-100 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    title="تدوير 90 درجة لليسار"
                  >
                    <span className="material-symbols-outlined text-sm">rotate_left</span>
                    <span>تدوير لليسار</span>
                  </button>

                  {/* Contrast enhancer */}
                  <button
                    type="button"
                    onClick={() => setContrastBoost(!contrastBoost)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 cursor-pointer transition-colors ${
                      contrastBoost
                        ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                        : 'bg-white border-[#bdc9c6] text-[#3e4947] hover:bg-gray-100'
                    }`}
                    title="تحسين تباين الخط اليدوي للورقة"
                  >
                    <span className="material-symbols-outlined text-sm">contrast</span>
                    <span>{contrastBoost ? 'التباين العالي: مفعل' : 'تعزيز التباين'}</span>
                  </button>

                  {/* Crop Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsCropMode(!isCropMode)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 cursor-pointer transition-colors ${
                      isCropMode
                        ? 'bg-[#005c55] text-white border-[#005c55]'
                        : 'bg-white border-[#bdc9c6] text-[#3e4947] hover:bg-gray-100'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">crop</span>
                    <span>{isCropMode ? 'إنهاء القص' : 'تحديد وقص الجدول'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImageSrc(null);
                      setExtractedData(null);
                    }}
                    className="px-2.5 py-1.5 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    تغيير الصورة
                  </button>
                </div>
              </div>

              {/* Crop Sliders when crop mode is active */}
              {isCropMode && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      قص من الأعلى ({cropTrim.top}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={cropTrim.top}
                      onChange={(e) => setCropTrim({ ...cropTrim, top: Number(e.target.value) })}
                      className="w-full accent-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      قص من الأسفل ({cropTrim.bottom}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={cropTrim.bottom}
                      onChange={(e) => setCropTrim({ ...cropTrim, bottom: Number(e.target.value) })}
                      className="w-full accent-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      قص من اليمين ({cropTrim.left}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={cropTrim.left}
                      onChange={(e) => setCropTrim({ ...cropTrim, left: Number(e.target.value) })}
                      className="w-full accent-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      قص من اليسار ({cropTrim.right}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={cropTrim.right}
                      onChange={(e) => setCropTrim({ ...cropTrim, right: Number(e.target.value) })}
                      className="w-full accent-amber-700"
                    />
                  </div>
                </div>
              )}

              {/* Image Preview Canvas Display */}
              <div className="relative bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center p-4 min-h-[300px] max-h-[480px]">
                <img
                  src={imageSrc}
                  alt="جدول خط اليد"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    filter: contrastBoost ? 'contrast(135%) brightness(95%)' : 'none',
                    clipPath:
                      cropTrim.top || cropTrim.bottom || cropTrim.left || cropTrim.right
                        ? `inset(${cropTrim.top}% ${cropTrim.right}% ${cropTrim.bottom}% ${cropTrim.left}%)`
                        : 'none',
                  }}
                  className="max-h-[440px] max-w-full object-contain rounded-lg shadow-md transition-transform duration-200"
                />

                {/* Badge angle */}
                {rotation !== 0 && (
                  <span className="absolute bottom-3 left-3 bg-black/70 text-white text-[10px] font-mono px-2 py-1 rounded-md">
                    زاوية التدوير: {rotation}°
                  </span>
                )}
              </div>

              {/* Extraction Trigger / Progress */}
              {!extractedData && (
                <div className="pt-2">
                  {isExtracting ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 border-3 border-[#005c55] border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs font-bold text-[#005c55]">
                          {extractionProgress || 'جاري قراءة خط اليد العربي وتحليله بالذكاء الاصطناعي...'}
                        </span>
                      </div>
                      <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#005c55] h-full w-2/3 animate-pulse"></div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartExtraction}
                      className="w-full py-3 bg-[#005c55] hover:bg-[#1b6b51] text-white rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
                    >
                      <span className="material-symbols-outlined text-lg">auto_awesome</span>
                      <span>استخراج وتحويل الجدول تلقائياً بـ Gemini 2.5 Flash</span>
                    </button>
                  )}
                </div>
              )}

              {/* Error Alert */}
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-rose-600">error</span>
                    <span>{errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartExtraction}
                    className="px-2.5 py-1 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 text-[11px] cursor-pointer"
                  >
                    إعادة المحاولة
                  </button>
                </div>
              )}

              {/* 3. Extracted Rows Confirmation & Merge / Replace Dialog */}
              {extractedData && (
                <div className="p-4 bg-emerald-50/80 border border-emerald-300 rounded-2xl space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-700 text-xl">task_alt</span>
                      <h4 className="text-xs font-bold text-emerald-950">
                        نجح الاستخراج! تم التعرف على {extractedData.rows.length} صفوف من خط اليد
                      </h4>
                    </div>
                    {extractedData.title && (
                      <span className="text-[11px] font-bold text-emerald-800 bg-white px-2.5 py-0.5 rounded-full border border-emerald-200">
                        {extractedData.title}
                      </span>
                    )}
                  </div>

                  {/* Quick table preview of extracted rows */}
                  <div className="max-h-44 overflow-y-auto border border-emerald-200 rounded-xl bg-white">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-emerald-100/60 text-emerald-950 sticky top-0 border-b border-emerald-200 font-bold">
                        <tr>
                          <th className="p-2 w-10">م</th>
                          <th className="p-2">اسم الشيخ</th>
                          <th className="p-2">المكان</th>
                          <th className="p-2">الكتاب</th>
                          <th className="p-2 text-center">التسليم</th>
                          <th className="p-2 text-center">التصحيح</th>
                          <th className="p-2 text-center">المراجعة</th>
                          <th className="p-2 text-center">الإعلان</th>
                          <th className="p-2 text-center">الحفل</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {extractedData.rows.map((r, i) => (
                          <tr
                            key={i}
                            className={`hover:bg-gray-50 ${r.uncertain ? 'bg-amber-50/70' : ''} ${
                              r.struck_out ? 'line-through text-gray-400 bg-gray-50' : ''
                            }`}
                          >
                            <td className="p-2 font-mono font-bold">{r.number || i + 1}</td>
                            <td className="p-2 font-semibold">
                              {r.sheikh_name}
                              {r.uncertain && (
                                <span className="mr-1 text-[10px] text-amber-700 font-bold bg-amber-100 px-1 rounded">
                                  غير مؤكد
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-gray-600">{r.place}</td>
                            <td className="p-2 text-[#005c55] font-semibold">{r.book}</td>
                            <td className="p-2 text-center">{r.delivered ? '✓' : '-'}</td>
                            <td className="p-2 text-center">{r.corrected ? '✓' : '-'}</td>
                            <td className="p-2 text-center">{r.reviewed ? '✓' : '-'}</td>
                            <td className="p-2 text-center">{r.announced ? '✓' : '-'}</td>
                            <td className="p-2 text-center">{r.ceremony ? '✓' : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Merge or Replace Choice */}
                  <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-semibold text-emerald-900">
                      كيف ترغب في إدراج البيانات في المنظومة؟ (يوجد حالياً {existingCount} صفاً)
                    </span>

                    <div className="flex items-center gap-2">
                      {existingCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleConfirmApplication('merge')}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">merge_type</span>
                          <span>دمج مع الجدول الحالي (+{extractedData.rows.length})</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleConfirmApplication('replace')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 ${
                          existingCount > 0
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-[#005c55] hover:bg-[#1b6b51] text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {existingCount > 0 ? 'restart_alt' : 'check'}
                        </span>
                        <span>
                          {existingCount > 0 ? 'استبدال الجدول الحالي بالكامل' : 'اعتماد وإدراج في الجدول'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#f8f9ff] border-t border-[#bdc9c6]/40 flex items-center justify-between">
          <span className="text-[11px] text-[#6e7977]">
            نموذج الذكاء الاصطناعي: Gemini 2.5 Flash Vision المخصص للمخطوطات العربية
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#3e4947] border border-[#bdc9c6] hover:bg-white cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
