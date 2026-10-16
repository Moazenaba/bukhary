import React, { useState, useRef, useEffect } from 'react';


interface ImageWorkbenchProps {
  onExtract: (imageBase64: string, customNotes: string) => Promise<void>;
  isExtracting: boolean;
}

export const ImageWorkbench: React.FC<ImageWorkbenchProps> = ({
  onExtract,
  isExtracting,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [isCropMode, setIsCropMode] = useState<boolean>(false);
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 5,
    y: 5,
    width: 90,
    height: 90,
  });
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [isDraggingCrop, setIsDraggingCrop] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);



  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
      setRotation(0);
      setIsCropMode(false);
      setCropBox({ x: 5, y: 5, width: 90, height: 90 });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const rotateRight = () => setRotation((prev) => (prev + 90) % 360);
  const rotateLeft = () => setRotation((prev) => (prev - 90 + 360) % 360);

  // Generate processed final image (applying rotation, high contrast, and crop)
  const getProcessedImageDataUrl = async (): Promise<string> => {
    if (!imageSrc) return '';

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageSrc);
          return;
        }

        const rads = (rotation * Math.PI) / 180;
        const isOrthogonal = rotation % 180 !== 0;

        const originalWidth = img.naturalWidth;
        const originalHeight = img.naturalHeight;

        // Temporary canvas for rotation
        const rotCanvas = document.createElement('canvas');
        const rotCtx = rotCanvas.getContext('2d');
        if (!rotCtx) {
          resolve(imageSrc);
          return;
        }

        rotCanvas.width = isOrthogonal ? originalHeight : originalWidth;
        rotCanvas.height = isOrthogonal ? originalWidth : originalHeight;

        rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        rotCtx.rotate(rads);
        rotCtx.drawImage(img, -originalWidth / 2, -originalHeight / 2);

        // Apply crop if enabled
        if (isCropMode) {
          const cropX = (cropBox.x / 100) * rotCanvas.width;
          const cropY = (cropBox.y / 100) * rotCanvas.height;
          const cropW = (cropBox.width / 100) * rotCanvas.width;
          const cropH = (cropBox.height / 100) * rotCanvas.height;

          canvas.width = Math.max(50, cropW);
          canvas.height = Math.max(50, cropH);

          if (highContrast) {
            ctx.filter = 'contrast(135%) brightness(105%)';
          }

          ctx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
        } else {
          canvas.width = rotCanvas.width;
          canvas.height = rotCanvas.height;

          if (highContrast) {
            ctx.filter = 'contrast(135%) brightness(105%)';
          }

          ctx.drawImage(rotCanvas, 0, 0);
        }

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = imageSrc;
    });
  };

  const handleStartExtraction = async () => {
    if (!imageSrc || isExtracting) return;
    const finalImage = await getProcessedImageDataUrl();
    await onExtract(finalImage, customNotes);
  };

  // Crop drag handling
  const handleCropMouseDown = (e: React.MouseEvent) => {
    if (!isCropMode) return;
    setIsDraggingCrop(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingCrop || !dragStart || !previewContainerRef.current) return;

    const rect = previewContainerRef.current.getBoundingClientRect();
    const deltaXPercent = ((e.clientX - dragStart.x) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - dragStart.y) / rect.height) * 100;

    setCropBox((prev) => {
      const newX = Math.min(Math.max(0, prev.x + deltaXPercent), 100 - prev.width);
      const newY = Math.min(Math.max(0, prev.y + deltaYPercent), 100 - prev.height);
      return { ...prev, x: newX, y: newY };
    });

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleCropMouseUp = () => {
    setIsDraggingCrop(false);
    setDragStart(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8 transition-all">
      {/* Header bar */}
      <div className="px-5 py-4 bg-gradient-to-l from-slate-900 to-[#004d47] text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
            <span className="material-symbols-outlined text-2xl text-emerald-300">document_scanner</span>
          </div>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <span>مسح واستخراج الجدول اليدوي عبر الذكاء الاصطناعي</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                استخراج آلي بالذكاء الاصطناعي
              </span>
            </h2>
            <p className="text-xs text-slate-300">
              ارفع صورة أو التقط بالكاميرا لجدول الكشف، وسيقوم النموذج بقراءة الخط اليدوي وتفريغه في الجدول
            </p>
          </div>
        </div>

        {/* Action Buttons Top */}
        <div className="flex items-center gap-2 flex-wrap">


          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />

          <input
            type="file"
            ref={cameraInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            capture="environment"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isExtracting}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">photo_camera</span>
            <span>تصوير بالكاميرا</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-900 hover:bg-slate-100 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm text-brand">upload_file</span>
            <span>رفع صورة الكشف</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5">
        {!imageSrc ? (
          // Empty State Prompt
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-brand rounded-2xl p-8 sm:p-12 text-center bg-slate-50/70 hover:bg-emerald-50/30 transition-all cursor-pointer group"
          >
            <div className="w-16 h-16 rounded-2xl bg-white shadow-xs border border-slate-200 group-hover:scale-105 group-hover:border-emerald-300 flex items-center justify-center mx-auto mb-4 text-brand transition-all">
              <span className="material-symbols-outlined text-3xl">add_photo_alternate</span>
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1.5">
              اسحب وأفلت صورة جدول الكشف هنا، أو اضغط للتصفح
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4 leading-relaxed">
              يدعم النموذج الصور المائلة والخطوط اليدوية المختلفة. يمكنك تدوير الصورة وقص الأطراف قبل إرسالها للتحليل.
            </p>

          </div>
        ) : (
          // Image Preview & Manipulation Workbench
          <div className="space-y-4">
            {/* Toolbar for image adjustments */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-100/80 rounded-xl border border-slate-200 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-slate-700 ml-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-base text-brand">tune</span>
                  <span>معالجة وضبط الصورة:</span>
                </span>

                <button
                  type="button"
                  onClick={rotateLeft}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                  title="تدوير 90 درجة لليسار"
                >
                  <span className="material-symbols-outlined text-sm">rotate_left</span>
                  <span>تدوير يساراً</span>
                </button>

                <button
                  type="button"
                  onClick={rotateRight}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                  title="تدوير 90 درجة لليمين"
                >
                  <span className="material-symbols-outlined text-sm">rotate_right</span>
                  <span>تدوير يميناً</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCropMode(!isCropMode)}
                  className={`px-2.5 py-1.5 rounded-lg border font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs ${
                    isCropMode
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                  title="قص وتحديد منطقة الجدول فقط"
                >
                  <span className="material-symbols-outlined text-sm">crop</span>
                  <span>{isCropMode ? 'إلغاء وضع القص' : 'قص وتحديد'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHighContrast(!highContrast)}
                  className={`px-2.5 py-1.5 rounded-lg border font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs ${
                    highContrast
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                  title="زيادة التباين لجعل خط القلم أوضح"
                >
                  <span className="material-symbols-outlined text-sm">contrast</span>
                  <span>تعزيز وضوح الحبر</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImageSrc(null);
                    setRotation(0);
                    setIsCropMode(false);
                  }}
                  className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-all"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                  <span>إزالة الصورة</span>
                </button>
              </div>
            </div>

            {/* Image Canvas Preview Display */}
            <div
              ref={previewContainerRef}
              onMouseDown={handleCropMouseDown}
              onMouseMove={handleCropMouseMove}
              onMouseUp={handleCropMouseUp}
              className="relative w-full max-h-[500px] min-h-[260px] bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center p-3 select-none"
            >
              <img
                ref={imageElementRef}
                src={imageSrc}
                alt="كشف الدورة العلمية"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  filter: highContrast ? 'contrast(135%) brightness(105%)' : 'none',
                  maxHeight: '460px',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  transition: 'transform 0.2s ease',
                }}
                className="rounded shadow-md pointer-events-none"
              />

              {/* Crop Overlay Bounding Box */}
              {isCropMode && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${cropBox.y}%`,
                    left: `${cropBox.x}%`,
                    width: `${cropBox.width}%`,
                    height: `${cropBox.height}%`,
                  }}
                  className="border-2 border-emerald-400 bg-emerald-500/10 cursor-move rounded ring-4 ring-black/40 flex flex-col justify-between p-2"
                >
                  <div className="flex justify-between items-center text-xs font-bold text-white bg-slate-900/80 px-2 py-0.5 rounded backdrop-blur-xs w-max">
                    <span className="material-symbols-outlined text-xs text-emerald-400 ml-1">crop</span>
                    <span>منطقة الاستخراج المحددة (اسحب للتحريك)</span>
                  </div>

                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCropBox((prev) => ({
                          ...prev,
                          width: Math.min(100 - prev.x, prev.width + 5),
                          height: Math.min(100 - prev.y, prev.height + 5),
                        }))
                      }
                      className="w-6 h-6 rounded bg-black/60 text-white flex items-center justify-center hover:bg-black text-xs font-bold"
                      title="تكبير مساحة التحديد"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCropBox((prev) => ({
                          ...prev,
                          width: Math.max(20, prev.width - 5),
                          height: Math.max(20, prev.height - 5),
                        }))
                      }
                      className="w-6 h-6 rounded bg-black/60 text-white flex items-center justify-center hover:bg-black text-xs font-bold"
                      title="تصغير مساحة التحديد"
                    >
                      -
                    </button>
                  </div>
                </div>
              )}

              {/* Extracting Loading Overlay */}
              {isExtracting && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 z-20">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center animate-spin mb-4">
                    <span className="material-symbols-outlined text-3xl text-emerald-400">autorenew</span>
                  </div>
                  <h4 className="text-base font-bold mb-1">جاري قراءة الصورة وتفريغ البيانات...</h4>
                  <p className="text-xs text-slate-300 text-center max-w-sm">
                    يتم تحليل أسماء المشايخ، الأماكن، المتون، وحالات التسليم والتصحيح بدقة
                  </p>
                </div>
              )}
            </div>

            {/* Custom Notes & Extraction Action Row */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <div className="flex-1 w-full">
                <input
                  type="text"
                  placeholder="تعليمات أو ملاحظات إضافية للنموذج (اختياري، مثلاً: ركز على أسماء كتب الفقه، أو تجاهل السطر الأخير)"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-brand focus:bg-white transition-all"
                />
              </div>

              <button
                type="button"
                onClick={handleStartExtraction}
                disabled={isExtracting}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs bg-brand hover:bg-brand-deep text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isExtracting ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                    <span>جاري الاستخراج والتحليل...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base text-emerald-300">magic_button</span>
                    <span>استخراج البيانات من الصورة (AI)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
