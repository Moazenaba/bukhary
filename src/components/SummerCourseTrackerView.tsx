import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_ROOT_KEY } from '../data/queries';
import { todayISO } from '../utils/stageUtils';
import {
  Sparkles,
  Plus,
  Trash2,
  FileSpreadsheet,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  MapPin,
  UserCheck,
  CheckSquare,
  Square,
  Check,
  PartyPopper,
  Megaphone,
  ClipboardCheck,
  PackageCheck,
  Layers,
  Filter,
  ArrowUpDown,
  MoreVertical,
  HelpCircle,
  Eye,
  Camera,
  Upload,
  Users,
  GraduationCap,
  Calendar,
  Tag,
  PlusCircle,
  X,
} from 'lucide-react';
import { SummerCourseRow, CourseFilterStatus, SummerCourseStats } from '../types/summerCourse';

const NO_ROWS: SummerCourseRow[] = [];
import { Committee, StageKey, Course, AppUser } from '../types';
import { mergeRowsWithCommittees, ROW_STAGE } from '../utils/committeeSync';
import { MergeConfirmModal } from './MergeConfirmModal';
import { exportCourseRowsToExcel, exportCourseRowsToCSV, parseCourseRowsFromFile } from '../utils/summerCourseExport';
import { DataService } from '../services/DataService';
import { errorMessage } from '../services/api';
import { AuthService } from '../services/AuthService';
import { toast } from './Toasts';
import { ImageWorkbench } from './ImageWorkbench';
import { NewCourseModal } from './course-sheet/NewCourseModal';
import { NewSheetRowModal } from './course-sheet/NewSheetRowModal';
import { sheetRowsPdfTable } from '../utils/reportExport';
import { deliverPdf } from '../utils/pdf';
import { TableScroll } from './ui/TableScroll';
import { PageHeader, primaryAction, quietAction } from './ui/PageHeader';

const FILTER_LABEL: Record<CourseFilterStatus, string> = {
  all: '', not_delivered: 'في انتظار الامتحان', delivered: 'تم الامتحان', corrected: 'تم التصحيح', reviewed: 'تمت المراجعة',
  announced: 'تم الإعلان', no_ceremony: 'لم يتم الحفل', ceremony: 'تم الحفل', uncertain: 'يحتاج تدقيق', struck_out: 'صفوف مشطوبة',
};


interface SummerCourseTrackerViewProps {
  committees?: Committee[];
  courses?: Course[];
  /** The course every screen is showing; the sheet shows that course's rows only. */
  currentCourseId?: string;
  onSelectCourse?: (courseId: string) => void;
  currentUser?: AppUser;
  /** Sets (not toggles) one stage of a committee on the server. */
  onSetCommitteeStage?: (committeeId: string, stageKey: StageKey, completed: boolean) => unknown;
  onAddCommitteeFromRow?: (newComm: Committee) => Promise<Committee | undefined>;
  onUpdateCommitteeCourse?: (committeeId: string, courseId: string, courseName: string) => void;
  /** Saves edited fields on the committee itself (sheikh name, place, book, students). */
  onUpdateCommitteeFields?: (committeeId: string, patch: Partial<Committee>) => Promise<boolean> | unknown;
  onAddCourse?: (newCourse: Omit<Course, 'id' | 'createdAt'>) => Promise<Course | undefined>;
  onNavigateToCommittees?: () => void;
  onOpenCommitteeDetails?: (row: SummerCourseRow) => void;
}

export const SummerCourseTrackerView: React.FC<SummerCourseTrackerViewProps> = ({
  committees = [],
  courses = [],
  currentCourseId,
  onSelectCourse,
  currentUser,
  onSetCommitteeStage,
  onAddCommitteeFromRow,
  onUpdateCommitteeCourse,
  onUpdateCommitteeFields,
  onAddCourse,
  onNavigateToCommittees,
  onOpenCommitteeDetails,
}) => {
  // Saved rows live in the query cache like every other server list, so they refresh with the rest
  // of the data and other users' edits show up (WEB-15). What is displayed merges them with committees.
  const queryClient = useQueryClient();
  const rowsKey = [...DATA_ROOT_KEY, 'summerRows', currentUser?.id] as const;
  const rowsQuery = useQuery({ queryKey: rowsKey, queryFn: () => DataService.getSummerCourseRows() });
  const savedRows = rowsQuery.data ?? NO_ROWS;
  const isLoading = rowsQuery.isLoading;
  const setSavedRows = (update: SummerCourseRow[] | ((prev: SummerCourseRow[]) => SummerCourseRow[])) =>
    queryClient.setQueryData<SummerCourseRow[]>(rowsKey, (prev) => (typeof update === 'function' ? update(prev ?? []) : update));
  const loadRows = () => rowsQuery.refetch();
  useEffect(() => {
    if (rowsQuery.error) toast.error(errorMessage(rowsQuery.error));
  }, [rowsQuery.error]);
  const rows = useMemo(() => mergeRowsWithCommittees(savedRows, committees), [savedRows, committees]);
  const canEdit = AuthService.can('summerRows.write');

  const upsertSaved = (row: SummerCourseRow) =>
    setSavedRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row]));

  /** Saves a row. A virtual row (a committee without a sheet row) becomes a real, linked row. */
  const saveRowToDb = async (row: SummerCourseRow): Promise<SummerCourseRow | undefined> => {
    const { virtual, ...rest } = row;
    const toSave = virtual ? { ...rest, id: `row-${crypto.randomUUID()}` } : rest;
    try {
      const saved = await DataService.saveSummerCourseRow(toSave);
      upsertSaved(saved);
      return saved;
    } catch (err) {
      toast.error(errorMessage(err));
      return undefined;
    }
  };

  // Import / Modal states
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingExtractedRows, setPendingExtractedRows] = useState<
    Omit<SummerCourseRow, 'id'>[] | null
  >(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsedRows = await parseCourseRowsFromFile(file);
      if (parsedRows.length === 0) {
        showToast('لم يتم العثور على أي صفوف في الملف المحدد.');
        return;
      }
      handleDataExtracted(parsedRows);
    } catch (err: any) {
      console.error('File import error:', err);
      showToast('تعذر قراءة ملف الإكسيل. يرجى التأكد من صيغة الملف.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<CourseFilterStatus>('all');
  const [selectedBook, setSelectedBook] = useState<string>('all');
  const [selectedPlace, setSelectedPlace] = useState<string>('all');

  // Course & Row Modals state
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState<boolean>(false);
  const [isAddRowModalOpen, setIsAddRowModalOpen] = useState<boolean>(false);

  // New Course Form State
  // New Row Form State
  const [newRowNextNumber, setNewRowNextNumber] = useState(1);

  // The course on screen: the app's current course (courses never mix on one sheet).
  const activeDefaultCourse = useMemo(() => {
    if (!courses || courses.length === 0) return undefined;
    return courses.find((c) => c.id === currentCourseId) || courses.find((c) => c.status === 'active' || c.isDefault) || courses[0];
  }, [courses, currentCourseId]);
  const selectedCourseFilter = activeDefaultCourse?.id ?? 'all';
  const setSelectedCourseFilter = (id: string) => onSelectCourse?.(id);

  const showToast = (msg: string) => toast.success(msg);

  // Table extraction from a photo of a handwritten/printed sheet (server-side OCR).
  const [isOcrOpen, setIsOcrOpen] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const handleOcrExtract = async (imageBase64: string) => {
    setIsExtracting(true);
    try {
      const mimeType = imageBase64.match(/^data:(image\/[a-z]+);/)?.[1] ?? 'image/jpeg';
      const { rows: extracted } = await DataService.extractTable(imageBase64, mimeType);
      const mapped: Omit<SummerCourseRow, 'id'>[] = extracted.map((r: any) => ({
        number: Number(r.number) || 0,
        sheikh_name: String(r.sheikh_name ?? ''),
        place: String(r.place ?? ''),
        book: String(r.book ?? ''),
        students_count: Number(r.students_count) || 0,
        delivered: Boolean(r.delivered),
        corrected: Boolean(r.corrected),
        reviewed: Boolean(r.reviewed),
        announced: Boolean(r.announced),
        ceremony: Boolean(r.ceremony),
        struck_out: false,
        // Read by a machine: flagged so a person checks every row before relying on it.
        uncertain: true,
        notes: String(r.notes ?? ''),
      }));
      if (mapped.length === 0) {
        toast.error('لم يتم العثور على صفوف في الصورة');
        return;
      }
      setIsOcrOpen(false);
      await handleDataExtracted(mapped);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsExtracting(false);
    }
  };

  // Statistics calculation
  const stats: SummerCourseStats = useMemo(() => {
    const total = rows.length;
    let delivered = 0;
    let corrected = 0;
    let reviewed = 0;
    let announced = 0;
    let ceremony = 0;
    let uncertain = 0;
    let struck = 0;
    let totalStudents = 0;

    rows.forEach((r) => {
      if (r.students_count) totalStudents += Number(r.students_count) || 0;
      if (r.struck_out) struck++;
      if (r.uncertain) uncertain++;
      if (r.delivered) delivered++;
      if (r.corrected) corrected++;
      if (r.reviewed) reviewed++;
      if (r.announced) announced++;
      if (r.ceremony) ceremony++;
    });

    return {
      totalRows: total,
      activeRows: total - struck,
      deliveredCount: delivered,
      correctedCount: corrected,
      reviewedCount: reviewed,
      announcedCount: announced,
      ceremonyCount: ceremony,
      uncertainCount: uncertain,
      struckCount: struck,
      totalStudentsCount: totalStudents,
    };
  }, [rows]);

  // Distinct lists for filtering
  const distinctBooks = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.book && r.book.trim()) set.add(r.book.trim());
    });
    return Array.from(set).sort();
  }, [rows]);

  const distinctPlaces = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.place && r.place.trim()) set.add(r.place.trim());
    });
    return Array.from(set).sort();
  }, [rows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // Search text match
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchName = (r.sheikh_name || '').toLowerCase().includes(query);
        const matchPlace = (r.place || '').toLowerCase().includes(query);
        const matchBook = (r.book || '').toLowerCase().includes(query);
        const matchNotes = (r.notes || '').toLowerCase().includes(query);
        const matchNum = String(r.number).includes(query);
        if (!matchName && !matchPlace && !matchBook && !matchNotes && !matchNum) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === 'not_delivered' && r.delivered) return false;
      if (statusFilter === 'no_ceremony' && r.ceremony) return false;
      if (statusFilter === 'delivered' && !r.delivered) return false;
      if (statusFilter === 'corrected' && !r.corrected) return false;
      if (statusFilter === 'reviewed' && !r.reviewed) return false;
      if (statusFilter === 'announced' && !r.announced) return false;
      if (statusFilter === 'ceremony' && !r.ceremony) return false;
      if (statusFilter === 'uncertain' && !r.uncertain) return false;
      if (statusFilter === 'struck_out' && !r.struck_out) return false;

      // Book filter
      if (selectedBook !== 'all' && (r.book || '').trim() !== selectedBook) {
        return false;
      }

      // Place filter
      if (selectedPlace !== 'all' && (r.place || '').trim() !== selectedPlace) {
        return false;
      }

      // Course filter
      if (selectedCourseFilter !== 'all') {
        const rowCourseId = r.courseId || activeDefaultCourse?.id;
        if (rowCourseId !== selectedCourseFilter) {
          return false;
        }
      }

      return true;
    });
  }, [rows, searchQuery, statusFilter, selectedBook, selectedPlace, selectedCourseFilter, activeDefaultCourse]);

  const targetCourseForImport = () =>
    selectedCourseFilter !== 'all' ? selectedCourseFilter : activeDefaultCourse?.id;

  const saveImported = async (incoming: SummerCourseRow[], replace: boolean) => {
    const courseId = targetCourseForImport();
    if (!courseId) {
      toast.error('اختر الدورة التي تريد استيراد الكشف إليها أولاً');
      return false;
    }
    try {
      const saved = await DataService.saveSummerCourseRowsBulk(
        incoming.map((r) => ({ ...r, courseId })),
        replace ? courseId : undefined
      );
      await loadRows();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };

  // Handle data returned from the file import
  const handleDataExtracted = async (extracted: Omit<SummerCourseRow, 'id'>[]) => {
    if (savedRows.length === 0) {
      const formatted = extracted.map((r) => ({ ...r, id: `row-${crypto.randomUUID()}` }));
      if (await saveImported(formatted, false)) showToast(`تم إدراج ${formatted.length} صفاً وحفظها في قاعدة البيانات.`);
    } else {
      setPendingExtractedRows(extracted);
      setIsMergeModalOpen(true);
    }
  };

  const executeMerge = async () => {
    if (!pendingExtractedRows) return;
    const existingNumbers = new Set(rows.map((r) => r.number));
    let nextAvailableNumber = rows.reduce((max, r) => Math.max(max, r.number || 0), 0) + 1;
    const formatted = pendingExtractedRows.map((r) => {
      let finalNumber = r.number;
      if (!finalNumber || existingNumbers.has(finalNumber)) finalNumber = nextAvailableNumber++;
      existingNumbers.add(finalNumber);
      return { ...r, id: `row-${crypto.randomUUID()}`, number: finalNumber };
    });
    if (await saveImported(formatted, false)) showToast(`تم دمج ${formatted.length} صفاً جديداً وحفظها في قاعدة البيانات.`);
    setPendingExtractedRows(null);
  };

  const executeReplace = async () => {
    if (!pendingExtractedRows) return;
    let nextAvailableNumber = 1;
    const formatted = pendingExtractedRows.map((r) => ({ ...r, id: `row-${crypto.randomUUID()}`, number: r.number || nextAvailableNumber++ }));
    // The server deletes this course's old rows in the same transaction.
    if (await saveImported(formatted, true)) showToast(`تم استبدال كشف الدورة بالكامل (${formatted.length} صفاً).`);
    setPendingExtractedRows(null);
  };

  // Row update handlers
  const updateRowField = async <K extends keyof SummerCourseRow>(id: string, field: K, value: SummerCourseRow[K]) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    await saveRowToDb({ ...row, [field]: value });
  };

  /**
   * Edits a text/number cell. On a row linked to a committee the committee itself is updated, so the
   * same data shows everywhere (committee details, ceremonies, phone app). Nothing is deleted.
   */
  const editRowField = async (row: SummerCourseRow, field: 'sheikh_name' | 'place' | 'book' | 'students_count', value: string | number) => {
    if (row[field] === value) return;
    const committee = row.committeeId ? committees.find((c) => c.id === row.committeeId) : undefined;
    // A row linked to a committee shows the committee's data, which lives in one place: the committee.
    if (committee && !AuthService.canOnCommittee('committees.update', committee)) {
      toast.error('بيانات هذه اللجنة تُعدَّل من اللجنة نفسها، وتحتاج صلاحية تعديل اللجان');
      return;
    }
    if (committee && onUpdateCommitteeFields) {
      const text = typeof value === 'string' ? value.trim() : value;
      const patch: Partial<Committee> =
        field === 'sheikh_name' ? { sheikhName: (text as string) || undefined }
        : field === 'place' ? { sheikhCountry: (text as string) || undefined }
        : field === 'book' ? { competitionBook: text as string }
        : { studentsCount: Number(text) || 0 };
      await onUpdateCommitteeFields(committee.id, patch);
      return;
    }
    await saveRowToDb({ ...row, [field]: value });
  };

  const toggleRowCheckbox = async (id: string, field: 'delivered' | 'corrected' | 'reviewed' | 'announced' | 'ceremony') => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newChecked = !row[field];
    const committee = row.committeeId ? committees.find((c) => c.id === row.committeeId) : undefined;
    if (committee) {
      // Linked rows reflect the committee's stages; change the stage itself.
      const stage = ROW_STAGE[field];
      if (!newChecked && !committee.stages[stage]?.completed) {
        toast.error('هذه الخانة مكتملة لأن مرحلة لاحقة في اللجنة مكتملة؛ ألغِ المرحلة اللاحقة أولاً من تفاصيل اللجنة');
        return;
      }
      await onSetCommitteeStage?.(committee.id, stage, newChecked);
      return;
    }
    await saveRowToDb({ ...row, [field]: newChecked });
  };

  // Change the course of a row (and of its committee, if linked)
  const handleRowCourseChange = async (rowId: string, newCourseId: string) => {
    const targetCourse = courses.find((c) => c.id === newCourseId);
    const targetRow = rows.find((r) => r.id === rowId);
    if (!targetCourse || !targetRow) return;
    if (targetRow.committeeId && onUpdateCommitteeCourse) {
      onUpdateCommitteeCourse(targetRow.committeeId, targetCourse.id, targetCourse.name);
      return;
    }
    const saved = await saveRowToDb({ ...targetRow, courseId: targetCourse.id, courseName: targetCourse.name });
    if (saved) showToast(`تم نقل الصف #${targetRow.number} إلى دورة (${targetCourse.name}).`);
  };

  // Open Add Row Modal
  const handleOpenAddRowModal = () => {
    const maxRowNumber = rows.reduce((max, r) => Math.max(max, r.number || 0), 0);
    const maxCommNumber = committees.reduce((max, c) => Math.max(max, c.committeeNumber || 0), 0);
    setNewRowNextNumber(Math.max(maxRowNumber, maxCommNumber) + 1);
    setIsAddRowModalOpen(true);
  };



  const handleAddNewRow = async (customCourseId?: string | React.MouseEvent) => {
    const effectiveCourseId =
      (typeof customCourseId === 'string' ? customCourseId : undefined) ||
      (selectedCourseFilter !== 'all' ? selectedCourseFilter : activeDefaultCourse?.id);
    const targetCourse = courses.find((c) => c.id === effectiveCourseId);
    if (!targetCourse) {
      toast.error('اختر الدورة أولاً');
      return;
    }
    const inCourse = committees.filter((c) => c.courseId === targetCourse.id);
    const nextNum = inCourse.reduce((max, c) => Math.max(max, c.committeeNumber || 0), 0) + 1;
    const now = new Date();
    await onAddCommitteeFromRow?.({
      id: `comm-${crypto.randomUUID()}`,
      committeeNumber: nextNum,
      committeeName: `لجنة #${nextNum}`,
      branch: '',
      competitionBook: '',
      studentsCount: 0,
      courseId: targetCourse.id,
      courseName: targetCourse.name,
      members: [],
      generalNotes: '',
      stages: {
        registration: { completed: true, completedAt: now.toISOString() },
        exam: { completed: false },
        scoring: { completed: false },
        aggregation: { completed: false },
        review: { completed: false },
        sheet: { completed: false },
        accreditation: { completed: false },
        announcement: { completed: false },
        ceremony: { completed: false },
      },
      createdDate: todayISO(now),
      createdAtTime: now.toISOString().slice(11, 16),
    });
  };

  const handleDeleteRow = async (id: string, num: number) => {
    const row = rows.find((r) => r.id === id);
    if (row?.virtual) {
      toast.info('هذا الصف يعرض لجنة مسجلة؛ احذف اللجنة من شاشة اللجان إن أردت إزالتها.');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف الصف رقم ${num}؟`)) return;
    try {
      await DataService.deleteSummerCourseRow(id);
      setSavedRows((prev) => prev.filter((r) => r.id !== id));
      showToast(`تم حذف الصف رقم ${num}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // PDF of the rows on screen (after search and filters): pick «لم يتم الحفل» or «تم الحفل» first
  // to get that list, laid out like the sheet.
  const [sheetPdfBusy, setSheetPdfBusy] = useState<'export' | 'share' | null>(null);
  const handleSheetPdf = async (mode: 'export' | 'share') => {
    const job = sheetRowsPdfTable(filteredRows, FILTER_LABEL[statusFilter], activeDefaultCourse?.name);
    if (job.count === 0) {
      toast.info('لا توجد صفوف معروضة للتصدير');
      return;
    }
    setSheetPdfBusy(mode);
    try {
      const result = await deliverPdf(job.table, job.filename, mode);
      if (result === 'downloaded') showToast(`تم تصدير ${job.count} صف PDF`);
      if (result === 'fallback') toast.info('المشاركة غير متاحة في هذا المتصفح؛ تم تنزيل ملف PDF لترسله بنفسك');
    } catch {
      toast.error('تعذر إنشاء ملف PDF');
    } finally {
      setSheetPdfBusy(null);
    }
  };

  // Deletes the saved sheet rows of the selected course (committees are not touched).
  const handleClearAll = async () => {
    const courseId = targetCourseForImport();
    if (!courseId) {
      toast.error('اختر الدورة التي تريد تفريغ كشفها أولاً');
      return;
    }
    if (!confirm('سيتم حذف صفوف الكشف المحفوظة لهذه الدورة (اللجان نفسها لن تُحذف). هل أنت متأكد؟')) return;
    if (await saveImported([], true)) showToast('تم تفريغ صفوف الكشف المحفوظة لهذه الدورة.');
  };

  return (
    <div className="space-y-6">

      {/* One header: the page's name, the course, and its actions (no banner, no repeated counts) */}
      <PageHeader
        icon="table_chart"
        title="الكشوفات"
        subtitle={`${activeDefaultCourse?.name || 'الدورة العلمية'} ${activeDefaultCourse?.year || ''}`.trim()}
        actions={
          <>
            {/* Hidden file input for Excel/CSV */}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
            <button type="button" onClick={handleOpenAddRowModal} className={primaryAction} title="إضافة صف جديد وتحديد الدورة المقررة">
              <Plus className="w-4 h-4" />
              <span>إضافة صف</span>
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className={quietAction} title="استيراد كشف من ملف إكسيل أو CSV">
              <Upload className="w-4 h-4" />
              <span>استيراد كشف</span>
            </button>
            {AuthService.can('ocr.use') && (
              <button type="button" onClick={() => setIsOcrOpen(true)} className={quietAction} title="استخراج كشف من صورة">
                <Camera className="w-4 h-4" />
                <span>من صورة</span>
              </button>
            )}
            <button type="button" onClick={() => setIsAddCourseModalOpen(true)} className={quietAction} title="إضافة دورة جديدة للمسابقات وربط اللجان بها">
              <Plus className="w-4 h-4" />
              <span>دورة جديدة</span>
            </button>
          </>
        }
      />

      {/* Courses Navigation & Selector Bar (only useful with more than one course) */}
      <div className={`${courses.length <= 1 ? 'hidden' : ''} bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-right`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 ml-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>عرض حسب الدورة:</span>
          </div>

          {courses.map((crs) => {
            const countInCourse = rows.filter(
              (r) => (r.courseId || activeDefaultCourse?.id) === crs.id
            ).length;
            const isSelected = selectedCourseFilter === crs.id;
            return (
              <button
                key={crs.id}
                type="button"
                onClick={() => setSelectedCourseFilter(crs.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title={crs.description || crs.name}
              >
                <span>{crs.name}</span>
                {crs.status === 'active' && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-extrabold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    نشطة
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded-full text-xs bg-black/10 font-mono">
                  {countInCourse}
                </span>
              </button>
            );
          })}
        </div>

      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3 [&>div]:max-sm:p-3 [&_.h-1\.5]:max-sm:hidden [&_svg]:max-sm:hidden [&>div>div:first-child]:max-sm:mb-0.5 [&>div>div:last-child:not(:first-child)]:max-sm:hidden">
        {/* Total Committees */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">عدد اللجان</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-800 font-mono">
              {stats.totalRows}
            </span>
            <span className="text-xs text-slate-500">لجنة</span>
          </div>
          {stats.struckCount > 0 && (
            <span className="text-xs text-rose-600 font-semibold mt-1">
              ({stats.struckCount} مشطوب)
            </span>
          )}
        </div>

        {/* Total Students (إجمالي عدد الطلاب) */}
        <div className="bg-gradient-to-br from-emerald-50 via-teal-50/60 to-white rounded-xl p-4 border border-emerald-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-800 mb-2">
            <span className="text-xs font-bold">مجموع عدد الطلاب</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-emerald-800 font-mono">
              {stats.totalStudentsCount.toLocaleString('ar-EG')}
            </span>
            <span className="text-xs text-emerald-700 font-bold">طالب</span>
          </div>
          <div className="text-xs text-emerald-600/90 font-medium mt-1">
            إجمالي طلاب الدورة العلمية
          </div>
        </div>

        {/* Delivered / Exam */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">تم الامتحان</span>
            <PackageCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-emerald-700 font-mono">
              {stats.deliveredCount}
            </span>
            <span className="text-xs text-slate-500">
              ({stats.totalRows ? Math.round((stats.deliveredCount / stats.totalRows) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{
                width: `${stats.totalRows ? (stats.deliveredCount / stats.totalRows) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Corrected */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">تم التصحيح</span>
            <ClipboardCheck className="w-4 h-4 text-teal-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-teal-700 font-mono">
              {stats.correctedCount}
            </span>
            <span className="text-xs text-slate-500">
              ({stats.totalRows ? Math.round((stats.correctedCount / stats.totalRows) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-teal-500 h-full rounded-full transition-all"
              style={{
                width: `${stats.totalRows ? (stats.correctedCount / stats.totalRows) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Reviewed */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">تمت المراجعة</span>
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-blue-700 font-mono">
              {stats.reviewedCount}
            </span>
            <span className="text-xs text-slate-500">
              ({stats.totalRows ? Math.round((stats.reviewedCount / stats.totalRows) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all"
              style={{
                width: `${stats.totalRows ? (stats.reviewedCount / stats.totalRows) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Announced */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">تم الإعلان</span>
            <Megaphone className="w-4 h-4 text-teal-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-teal-700 font-mono">
              {stats.announcedCount}
            </span>
            <span className="text-xs text-slate-500">
              ({stats.totalRows ? Math.round((stats.announcedCount / stats.totalRows) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-teal-500 h-full rounded-full transition-all"
              style={{
                width: `${stats.totalRows ? (stats.announcedCount / stats.totalRows) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Ceremony */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">تم إقامة الحفل</span>
            <PartyPopper className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-amber-700 font-mono">
              {stats.ceremonyCount}
            </span>
            <span className="text-xs text-slate-500">
              ({stats.totalRows ? Math.round((stats.ceremonyCount / stats.totalRows) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all"
              style={{
                width: `${stats.totalRows ? (stats.ceremonyCount / stats.totalRows) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Review Warning Banner if any uncertain rows exist */}
      {stats.uncertainCount > 0 && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs sm:text-sm font-semibold">
              يوجد <strong className="font-bold">{stats.uncertainCount}</strong> صفاً تم تمييزها
              بلون أصفر لوجود كلمات أو كتابة غير واضحة بالصورة يُرجى تدقيقها واعتمادها.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter('uncertain')}
            className="text-xs font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors shrink-0 mr-2"
          >
            عرض الصفوف غير المؤكدة فقط
          </button>
        </div>
      )}

      {/* Toolbar: Search, Filters & Export */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث برقم الصف، اسم الشيخ، المسجد، الكتاب المقرر..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm outline-none transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                مسح
              </button>
            )}
          </div>

          {/* Export & Sync Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleSheetPdf('export')}
              disabled={filteredRows.length === 0 || sheetPdfBusy !== null}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              title="تصدير الصفوف المعروضة PDF (اختر «لم يتم الحفل» أو «تم الحفل» أولاً لكشفها)"
              aria-label="تصدير الكشف المعروض PDF"
            >
              <FileText className="w-4 h-4" />
              <span>{sheetPdfBusy === 'export' ? 'جاري الإنشاء...' : `PDF${FILTER_LABEL[statusFilter] ? ` (${FILTER_LABEL[statusFilter]})` : ''}`}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSheetPdf('share')}
              disabled={filteredRows.length === 0 || sheetPdfBusy !== null}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              aria-label="مشاركة الكشف المعروض PDF"
            >
              <span>{sheetPdfBusy === 'share' ? 'جاري التجهيز...' : 'مشاركة PDF'}</span>
            </button>
            {committees.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  loadRows();
                  showToast(`تمت مزامنة ${committees.length} لجنة مع كشف الدورة بنجاح ✓`);
                }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-teal-50 text-teal-900 hover:bg-teal-100 border border-teal-200 text-xs font-bold transition-colors"
                title="إعادة مزامنة اللجان والمراحل مع الجدول فوراً"
              >
                <RotateCcw className="w-4 h-4 text-teal-700" />
                <span>مزامنة اللجان ({committees.length})</span>
              </button>
            )}

          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="font-bold text-slate-500 ml-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>تصفية الحالة:</span>
          </span>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            الكل ({rows.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('not_delivered')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              statusFilter === 'not_delivered'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            في انتظار الامتحان ({rows.filter((r) => !r.delivered).length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('delivered')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              statusFilter === 'delivered'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            تم الامتحان ({stats.deliveredCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('corrected')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              statusFilter === 'corrected'
                ? 'bg-teal-700 text-white'
                : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200'
            }`}
          >
            تم التصحيح ({stats.correctedCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('reviewed')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              statusFilter === 'reviewed'
                ? 'bg-blue-700 text-white'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            تمت المراجعة ({stats.reviewedCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('announced')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              statusFilter === 'announced'
                ? 'bg-teal-700 text-white'
                : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200'
            }`}
          >
            تم الإعلان ({stats.announcedCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('no_ceremony')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              statusFilter === 'no_ceremony'
                ? 'bg-orange-600 text-white'
                : 'bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200'
            }`}
          >
            لم يتم الحفل ({rows.length - stats.ceremonyCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('ceremony')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              statusFilter === 'ceremony'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            تم الحفل ({stats.ceremonyCount})
          </button>

          {stats.uncertainCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('uncertain')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                statusFilter === 'uncertain'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
              }`}
            >
              ⚠️ يحتاج تدقيق ({stats.uncertainCount})
            </button>
          )}

          {stats.struckCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('struck_out')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                statusFilter === 'struck_out'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ⛔ صفوف مشطوبة ({stats.struckCount})
            </button>
          )}

          {/* Book Dropdown */}
          {distinctBooks.length > 0 && (
            <select
              value={selectedBook}
              onChange={(e) => setSelectedBook(e.target.value)}
              className="mr-auto px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs outline-none focus:border-emerald-500 font-semibold"
            >
              <option value="all">كافة الكتب المقررة</option>
              {distinctBooks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}

          {/* Place Dropdown */}
          {distinctPlaces.length > 0 && (
            <select
              value={selectedPlace}
              onChange={(e) => setSelectedPlace(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs outline-none focus:border-emerald-500 font-semibold"
            >
              <option value="all">كافة الأماكن والمساجد</option>
              {distinctPlaces.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Interactive Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-bold text-slate-800 mb-2">
              لا توجد صفوف في الكشف بعد
            </h4>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
              أضف الصفوف مباشرة أو استورد ملف إكسيل. اللجان المسجلة تظهر هنا تلقائياً.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleAddNewRow}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة أول صف جديد (+)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold border border-slate-300 transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                <span>استيراد كشف Excel / CSV</span>
              </button>
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-700 mb-1">
              لا توجد صفوف تطابق معايير البحث أو التصفية
            </h4>
            <p className="text-xs text-slate-500 mb-6">
              جرّب تغيير كلمات البحث أو إعادة ضبط خيارات التصفية بالأعلى.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setSelectedBook('all');
                  setSelectedPlace('all');
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                إلغاء التصفية
              </button>
              <button
                type="button"
                onClick={handleAddNewRow}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold"
              >
                إضافة صف جديد
              </button>
            </div>
          </div>
        ) : (
          <TableScroll label="كشف الدورة">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-extrabold select-none">
                  <th className="py-3 px-3 w-12 text-center sticky right-0 z-[2] bg-slate-100">م</th>
                  <th className="py-3 px-3 min-w-[130px]">الدورة المقررة</th>
                  <th className="py-3 px-3 min-w-[150px]">اسم الشيخ</th>
                  <th className="py-3 px-3 min-w-[140px]">المكان</th>
                  <th className="py-3 px-3 min-w-[160px]">الكتاب المقرر</th>
                  <th className="py-3 px-2 w-20 text-center text-slate-800 bg-slate-100/70 border-x border-slate-200/60 font-black">
                    عدد الطلاب
                  </th>
                  <th className="py-3 px-2 w-24 text-center text-emerald-900 bg-emerald-50/50">
                    تم الامتحان
                  </th>
                  <th className="py-3 px-2 w-20 text-center text-teal-900 bg-teal-50/50">
                    تم التصحيح
                  </th>
                  <th className="py-3 px-2 w-20 text-center text-blue-900 bg-blue-50/50">
                    تم المراجعة
                  </th>
                  <th className="py-3 px-2 w-20 text-center text-teal-900 bg-teal-50/50">
                    تم الإعلان
                  </th>
                  <th className="py-3 px-2 w-20 text-center text-amber-900 bg-amber-50/50">
                    تم الحفل
                  </th>
                  <th className="py-3 px-2 w-20 text-center text-teal-900 bg-teal-100/70 border-x border-teal-200 font-black">
                    تفاصيل اللجنة
                  </th>
                  <th className="py-3 px-3 w-28 text-center sticky left-12 z-[2] bg-slate-100">الحالة / تدقيق</th>
                  <th className="py-3 px-2 w-12 text-center sticky left-0 z-[2] bg-slate-100">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, rIdx) => {
                  const isStruck = row.struck_out;
                  const isUncertain = row.uncertain;
                  const rowKey = row.id ? `${row.id}-${rIdx}` : `comm-row-${rIdx}`;
                  // Cells that stay in view while the rest scrolls need a solid background of their own.
                  const stickyBg = isUncertain ? 'bg-amber-50' : isStruck ? 'bg-slate-50' : 'bg-white group-hover:bg-slate-50';

                  return (
                    <tr
                      key={rowKey}
                      className={`transition-colors duration-150 group ${
                        isUncertain
                          ? 'bg-amber-50/80 hover:bg-amber-100/60'
                          : isStruck
                          ? 'bg-slate-50/80 hover:bg-slate-100/80 opacity-75'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* 1) Serial Number & Committee Link Badge */}
                      <td className={`py-2.5 px-3 text-center font-mono font-bold text-slate-600 sticky right-0 z-[1] ${stickyBg}`}>
                        <div className="flex flex-col items-center justify-center gap-1">
                          <input
                            type="number"
                            value={row.number}
                            onChange={(e) =>
                              updateRowField(row.id, 'number', parseInt(e.target.value) || 0)
                            }
                            className="w-10 text-center font-mono font-bold bg-transparent border-b border-transparent focus:border-emerald-500 focus:bg-white rounded outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => onOpenCommitteeDetails && onOpenCommitteeDetails(row)}
                            className="text-xs font-bold text-teal-900 bg-teal-100/90 hover:bg-teal-200 px-1.5 py-0.5 rounded border border-teal-300 select-none cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center gap-0.5 shadow-2xs"
                            title="اضغط لفتح بطاقة تفاصيل اللجنة وبياناتها الكاملة"
                          >
                            <Eye className="w-2.5 h-2.5 text-teal-700" />
                            <span>لجنة #{row.number}</span>
                          </button>
                        </div>
                      </td>

                      {/* 1.5) Course Selection Dropdown */}
                      <td className="py-2.5 px-3 min-w-[130px]">
                        <select
                          value={row.courseId || activeDefaultCourse?.id || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__new__') {
                              setIsAddCourseModalOpen(true);
                            } else {
                              handleRowCourseChange(row.id, val);
                            }
                          }}
                          className="w-full text-xs font-bold text-teal-950 bg-teal-50/70 hover:bg-white focus:bg-white border border-teal-200/90 hover:border-teal-400 focus:border-emerald-600 rounded-lg py-1 px-2 outline-none transition-all cursor-pointer shadow-2xs"
                          title="اختر الدورة لربط اللجنة بها تلقائياً في قاعدة البيانات"
                        >
                          <option value="">(اختر الدورة...)</option>
                          {courses.map((crs) => (
                            <option key={crs.id} value={crs.id}>
                              {crs.name} {crs.isDefault ? '⭐' : ''}
                            </option>
                          ))}
                          <option value="__new__">➕ إضافة دورة جديدة...</option>
                        </select>
                      </td>

                      {/* 2) Sheikh Name */}
                      <td className="py-2.5 px-3">
                        <CellInput
                          value={row.sheikh_name}
                          onCommit={(v) => editRowField(row, 'sheikh_name', v)}
                          disabled={!canEdit}
                          placeholder="اسم الشيخ الفاضل..."
                          className={`w-full py-1 px-2 rounded-lg bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-emerald-500 font-semibold outline-none transition-all ${
                            isStruck ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        />
                      </td>

                      {/* 3) Place */}
                      <td className="py-2.5 px-3">
                        <CellInput
                          value={row.place}
                          onCommit={(v) => editRowField(row, 'place', v)}
                          disabled={!canEdit}
                          placeholder="المسجد / القاعة..."
                          className={`w-full py-1 px-2 rounded-lg bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-emerald-500 text-slate-700 outline-none transition-all ${
                            isStruck ? 'line-through text-slate-400' : ''
                          }`}
                        />
                      </td>

                      {/* 4) Book */}
                      <td className="py-2.5 px-3">
                        <CellInput
                          value={row.book}
                          onCommit={(v) => editRowField(row, 'book', v)}
                          disabled={!canEdit}
                          placeholder="الكتاب أو المتن المقرر..."
                          className={`w-full py-1 px-2 rounded-lg bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-emerald-500 text-emerald-950 font-medium outline-none transition-all ${
                            isStruck ? 'line-through text-slate-400' : ''
                          }`}
                        />
                      </td>

                      {/* 4.5) Students Count (عدد الطلاب) */}
                      <td className="py-2.5 px-2 text-center bg-slate-50/40 border-x border-slate-100">
                        <div className="inline-flex items-center justify-center">
                          <CellInput
                            type="number"
                            value={String(row.students_count ?? '')}
                            onCommit={(v) => editRowField(row, 'students_count', Math.max(0, parseInt(v, 10) || 0))}
                            disabled={!canEdit}
                            placeholder="0"
                            className={`w-16 py-1 px-1.5 text-center rounded-lg bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 font-mono font-bold text-slate-800 text-xs outline-none transition-all shadow-2xs ${
                              isStruck ? 'line-through text-slate-400' : ''
                            }`}
                            title="عدد الطلاب في هذه اللجنة"
                          />
                        </div>
                      </td>

                      {/* 5) Delivered (Checkbox) */}
                      <td className="py-2.5 px-2 text-center bg-emerald-50/20">
                        <button
                          type="button"
                          onClick={() => toggleRowCheckbox(row.id, 'delivered')}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                            row.delivered
                              ? 'bg-emerald-600 text-white shadow-xs scale-105'
                              : 'bg-white border-2 border-slate-300 text-transparent hover:border-emerald-400'
                          }`}
                          title={row.delivered ? 'تم الامتحان (✓)' : 'لم يتم الامتحان بعد'}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </button>
                      </td>

                      {/* 6) Corrected (Checkbox) */}
                      <td className="py-2.5 px-2 text-center bg-teal-50/20">
                        <button
                          type="button"
                          onClick={() => toggleRowCheckbox(row.id, 'corrected')}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                            row.corrected
                              ? 'bg-teal-600 text-white shadow-xs scale-105'
                              : 'bg-white border-2 border-slate-300 text-transparent hover:border-teal-400'
                          }`}
                          title={row.corrected ? 'تم التصحيح (✓)' : 'لم يتم التصحيح'}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </button>
                      </td>

                      {/* 7) Reviewed (Checkbox) */}
                      <td className="py-2.5 px-2 text-center bg-blue-50/20">
                        <button
                          type="button"
                          onClick={() => toggleRowCheckbox(row.id, 'reviewed')}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                            row.reviewed
                              ? 'bg-blue-600 text-white shadow-xs scale-105'
                              : 'bg-white border-2 border-slate-300 text-transparent hover:border-blue-400'
                          }`}
                          title={row.reviewed ? 'تمت المراجعة (✓)' : 'لم تتم المراجعة'}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </button>
                      </td>

                      {/* 8) Announced (Checkbox) */}
                      <td className="py-2.5 px-2 text-center bg-teal-50/20">
                        <button
                          type="button"
                          onClick={() => toggleRowCheckbox(row.id, 'announced')}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                            row.announced
                              ? 'bg-teal-600 text-white shadow-xs scale-105'
                              : 'bg-white border-2 border-slate-300 text-transparent hover:border-teal-400'
                          }`}
                          title={row.announced ? 'تم الإعلان (✓)' : 'لم يتم الإعلان'}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </button>
                      </td>

                      {/* 9) Ceremony (Checkbox) */}
                      <td className="py-2.5 px-2 text-center bg-amber-50/20">
                        <button
                          type="button"
                          onClick={() => toggleRowCheckbox(row.id, 'ceremony')}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                            row.ceremony
                              ? 'bg-amber-600 text-white shadow-xs scale-105'
                              : 'bg-white border-2 border-slate-300 text-transparent hover:border-amber-400'
                          }`}
                          title={row.ceremony ? 'تم الحفل (✓)' : 'لم يتم الحفل'}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </button>
                      </td>

                      {/* 10) Committee Details Action Button */}
                      <td className="py-2.5 px-2 text-center bg-teal-50/30 border-x border-teal-100/50">
                        <button
                          type="button"
                          onClick={() => onOpenCommitteeDetails && onOpenCommitteeDetails(row)}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-xs active:scale-95 transition-all cursor-pointer hover:shadow-md"
                          title="عرض بطاقة تفاصيل اللجنة، المعاونين، ومراحل الاختبار بالكامل"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>التفاصيل</span>
                        </button>
                      </td>

                      {/* Status Badges & Toggle */}
                      <td className={`py-2.5 px-3 text-center sticky left-12 z-[1] ${stickyBg}`}>
                        <div className="flex flex-col items-center gap-1">
                          {isUncertain ? (
                            <button
                              type="button"
                              onClick={() => {
                                updateRowField(row.id, 'uncertain', false);
                                showToast(`تم اعتماد وتأكيد الصف رقم ${row.number}`);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold hover:bg-emerald-200 hover:text-emerald-900 transition-colors"
                              title="اضغط لاعتماد القراءة وإزالة علامة الشك"
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-700" />
                              <span>تدقيق ✓</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                updateRowField(row.id, 'uncertain', true)
                              }
                              className="text-xs text-slate-400 hover:text-amber-600 transition-colors"
                              title="تحديد الصف كصف يحتاج مراجعة"
                            >
                              تمييز للتدقيق
                            </button>
                          )}

                          {isStruck ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateRowField(row.id, 'struck_out', false)
                              }
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-xs font-bold"
                              title="إلغاء الشطب وإعادة تفعيل الصف"
                            >
                              <span>مشطوب (إلغاء)</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                updateRowField(row.id, 'struck_out', true)
                              }
                              className="text-xs text-slate-400 hover:text-rose-600 transition-colors"
                              title="تحديد الصف كصف مشطوب"
                            >
                              شطب
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Delete */}
                      <td className={`py-2.5 px-2 text-center sticky left-0 z-[1] ${stickyBg}`}>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id, row.number)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="حذف هذا الصف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}

        {/* Table Footer with Quick Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2.5">
            <span>
              عرض <strong className="font-bold text-slate-900">{filteredRows.length}</strong> من أصل{' '}
              <strong className="font-bold text-slate-900">{rows.length}</strong> لجنة.
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-emerald-800 font-bold flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              مجموع الطلاب: <strong className="font-mono text-emerald-950 font-black">{stats.totalStudentsCount.toLocaleString('ar-EG')}</strong> طالب
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-emerald-700 font-semibold">
              كل تعديل بيتحفظ على السيرفر فوراً ✓
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold hover:underline"
            >
              مسح الكل
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {isOcrOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 overflow-y-auto" role="dialog" aria-modal="true" aria-label="استخراج كشف من صورة">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto p-4 relative">
            <button
              type="button"
              onClick={() => setIsOcrOpen(false)}
              aria-label="إغلاق"
              className="absolute top-3 left-3 w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              ✕
            </button>
            <ImageWorkbench onExtract={(img) => handleOcrExtract(img)} isExtracting={isExtracting} />
          </div>
        </div>
      )}

      <MergeConfirmModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        newRowCount={pendingExtractedRows?.length || 0}
        existingRowCount={rows.length}
        onMerge={executeMerge}
        onReplace={executeReplace}
      />

      {isAddCourseModalOpen && (
        <NewCourseModal
          onClose={() => setIsAddCourseModalOpen(false)}
          onAddCourse={onAddCourse}
          onCreated={(created) => setSelectedCourseFilter(created.id)}
        />
      )}

      {isAddRowModalOpen && (
        <NewSheetRowModal
          courses={courses}
          defaultCourseId={selectedCourseFilter !== 'all' ? selectedCourseFilter : activeDefaultCourse?.id}
          nextNumber={newRowNextNumber}
          onClose={() => setIsAddRowModalOpen(false)}
          onAddCommittee={onAddCommitteeFromRow}
          onOpenNewCourse={() => setIsAddCourseModalOpen(true)}
        />
      )}
    </div>
  );
};

/**
 * A sheet cell that saves when the person leaves it (or presses Enter), not on every key press,
 * so a half-typed name is never sent and each edit is one save.
 */
function CellInput({
  value,
  onCommit,
  type = 'text',
  disabled,
  ...rest
}: {
  value: string;
  onCommit: (value: string) => unknown;
  type?: 'text' | 'number';
  disabled?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [draft, setDraft] = useState(value ?? '');
  const focused = React.useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value ?? '');
  }, [value]);
  const cancelled = React.useRef(false);
  const commit = () => {
    focused.current = false;
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (draft.trim() !== (value ?? '').trim()) onCommit(draft);
  };
  return (
    <input
      {...rest}
      type={type}
      min={type === 'number' ? 0 : undefined}
      inputMode={type === 'number' ? 'numeric' : undefined}
      value={draft}
      readOnly={disabled}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value ?? '');
          cancelled.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
