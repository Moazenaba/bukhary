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
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseSeason, setNewCourseSeason] = useState('');
  const [newCourseYear, setNewCourseYear] = useState('');
  const [newCourseStartDate, setNewCourseStartDate] = useState(todayISO());
  const [newCourseEndDate, setNewCourseEndDate] = useState('');
  const [newCourseStatus, setNewCourseStatus] = useState<'active' | 'completed' | 'upcoming'>('active');
  const [newCourseTargetCommittees, setNewCourseTargetCommittees] = useState<number | ''>('');
  const [newCourseDescription, setNewCourseDescription] = useState('');

  // New Row Form State
  const [newRowNumber, setNewRowNumber] = useState<number>(1);
  const [newRowCourseId, setNewRowCourseId] = useState<string>('');
  const [newRowSheikhName, setNewRowSheikhName] = useState<string>('');
  const [newRowPlace, setNewRowPlace] = useState<string>('');
  const [newRowBook, setNewRowBook] = useState<string>('');
  const [newRowStudentsCount, setNewRowStudentsCount] = useState<number>(0);
  const [newRowDelivered, setNewRowDelivered] = useState<boolean>(false);
  const [newRowCorrected, setNewRowCorrected] = useState<boolean>(false);
  const [newRowReviewed, setNewRowReviewed] = useState<boolean>(false);
  const [newRowAnnounced, setNewRowAnnounced] = useState<boolean>(false);
  const [newRowCeremony, setNewRowCeremony] = useState<boolean>(false);
  const [newRowNotes, setNewRowNotes] = useState<string>('');

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
    const nextNum = Math.max(maxRowNumber, maxCommNumber) + 1;

    setNewRowNumber(nextNum);
    setNewRowCourseId(
      selectedCourseFilter !== 'all' ? selectedCourseFilter : activeDefaultCourse?.id || ''
    );
    setNewRowSheikhName('');
    setNewRowPlace('');
    setNewRowBook('');
    setNewRowStudentsCount(0);
    setNewRowDelivered(false);
    setNewRowCorrected(false);
    setNewRowReviewed(false);
    setNewRowAnnounced(false);
    setNewRowCeremony(false);
    setNewRowNotes('');
    setIsAddRowModalOpen(true);
  };

  // Submit Add Row Modal: creates the committee; the sheet then shows it.
  const handleAddRowModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCourse = courses.find((c) => c.id === (newRowCourseId || activeDefaultCourse?.id));
    if (!targetCourse) {
      toast.error('اختر الدورة أولاً');
      return;
    }
    if (!onAddCommitteeFromRow) return;
    const now = new Date();
    const created = await onAddCommitteeFromRow({
      id: `comm-${crypto.randomUUID()}`,
      committeeNumber: newRowNumber,
      committeeName: newRowSheikhName.trim() ? `لجنة ${newRowSheikhName.trim()}` : `لجنة #${newRowNumber}`,
      sheikhName: newRowSheikhName.trim() || undefined,
      branch: newRowPlace.trim(),
      competitionBook: newRowBook.trim(),
      studentsCount: Number(newRowStudentsCount) || 0,
      courseId: targetCourse.id,
      courseName: targetCourse.name,
      members: [],
      generalNotes: newRowNotes.trim(),
      stages: {
        registration: { completed: true, completedAt: now.toISOString() },
        exam: { completed: newRowDelivered },
        scoring: { completed: newRowCorrected },
        aggregation: { completed: false },
        review: { completed: newRowReviewed },
        sheet: { completed: false },
        accreditation: { completed: false },
        announcement: { completed: newRowAnnounced },
        ceremony: { completed: newRowCeremony },
      },
      createdDate: todayISO(now),
      createdAtTime: now.toISOString().slice(11, 16),
    });
    if (created) setIsAddRowModalOpen(false);
  };

  // Submit Create Course Modal
  const handleCreateCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) {
      showToast('يرجى إدخال اسم الدورة أولاً.');
      return;
    }

    if (onAddCourse) {
      const created = await onAddCourse({
        name: newCourseName.trim(),
        season: newCourseSeason,
        year: newCourseYear.trim(),
        startDate: newCourseStartDate || todayISO(),
        endDate: newCourseEndDate || '',
        status: newCourseStatus,
        targetCommitteesCount: Number(newCourseTargetCommittees) || undefined,
        description: newCourseDescription.trim(),
        isDefault: newCourseStatus === 'active',
      });
      if (!created) return;
      setSelectedCourseFilter(created.id);
    }

    setIsAddCourseModalOpen(false);
    setNewCourseName('');
    setNewCourseDescription('');
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

      {/* Main Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#003b36] via-brand to-[#04332e] text-white p-6 sm:p-8 shadow-xl border border-emerald-600/30">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-200 text-xs font-bold border border-emerald-400/30 backdrop-blur-sm">
                <BookOpen className="w-3.5 h-3.5 text-emerald-300" />
                <span>نظام المتابعة الإدارية للكشوفات ورصد درجات المتون العلمية</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-200 text-xs font-bold border border-amber-400/30 backdrop-blur-sm">
                <Users className="w-3.5 h-3.5 text-amber-300" />
                <span>مجموع طلاب الدورة: <strong className="font-mono text-white text-sm mx-1">{stats.totalStudentsCount.toLocaleString('ar-EG')}</strong> طالب</span>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
              متابعة {activeDefaultCourse?.name || 'الدورة العلمية'} {activeDefaultCourse?.year || ''}
            </h1>
            <p className="text-emerald-100/90 text-sm max-w-2xl leading-relaxed">
              نظام إدارة ومتابعة دورات مسجد الإمام البخاري العلمية: رصد حالات تم الامتحان،
              التصحيح، المراجعة، الإعلان، وإقامة الحفل، مع التعديل الفوري والحفظ السحابي الآمن.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Hidden file input for Excel/CSV */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Add New Course Button */}
            <button
              type="button"
              onClick={() => setIsAddCourseModalOpen(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-teal-400/20 hover:bg-teal-400/30 text-teal-200 hover:text-white font-bold backdrop-blur-sm border border-teal-400/30 transition-all cursor-pointer shadow-xs"
              title="إضافة دورة جديدة للمسابقات وربط اللجان بها"
            >
              <Plus className="w-4 h-4 text-teal-300" />
              <span>إضافة دورة جديدة</span>
            </button>

            {/* Add New Row Button */}
            <button
              type="button"
              onClick={handleOpenAddRowModal}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold shadow-lg hover:shadow-emerald-400/30 transition-all active:scale-[0.98] cursor-pointer"
              title="إضافة صف جديد وتحديد الدورة المقررة"
            >
              <Plus className="w-5 h-5 text-slate-950" />
              <span>إضافة صف جديد (+)</span>
            </button>

            {/* Import Excel / CSV Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold backdrop-blur-sm border border-white/20 transition-all cursor-pointer"
              title="استيراد كشف من ملف إكسيل أو CSV"
            >
              <Upload className="w-4 h-4 text-emerald-300" />
              <span>استيراد كشف</span>
            </button>

            {AuthService.can('ocr.use') && (
              <button
                type="button"
                onClick={() => setIsOcrOpen(true)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold backdrop-blur-sm border border-white/20 transition-all cursor-pointer"
                title="استخراج كشف من صورة"
              >
                <Camera className="w-4 h-4 text-emerald-300" />
                <span>استخراج من صورة</span>
              </button>
            )}
          </div>
        </div>

        {/* Decorative background Islamic geometry / mesh */}
        <div className="absolute -left-12 -bottom-16 w-64 h-64 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
        <div className="absolute right-0 top-0 w-72 h-72 rounded-full bg-teal-300/10 blur-3xl pointer-events-none" />
      </div>

      {/* Courses Navigation & Selector Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-right">
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

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsAddCourseModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            title="إضافة دورة جديدة للمسابقات"
          >
            <Plus className="w-4 h-4 text-teal-700" />
            <span>➕ إضافة دورة جديدة</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddRowModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-[0.98]"
            title="إضافة صف جديد مع تحديد الدورة"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صف جديد (+)</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
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

            <button
              type="button"
              onClick={() => setIsAddCourseModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-teal-50 text-teal-900 hover:bg-teal-100 border border-teal-200 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              title="إضافة دورة مسابقات جديدة"
            >
              <Plus className="w-4 h-4 text-teal-700" />
              <span>دورة جديدة</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddRowModal}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              title="إضافة صف جديد مع الدورة"
            >
              <Plus className="w-4 h-4" />
              <span>صف جديد (+)</span>
            </button>
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
            لم يُسلّم بعد ({rows.filter((r) => !r.delivered).length})
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
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-extrabold select-none">
                  <th className="py-3 px-3 w-12 text-center">م</th>
                  <th className="py-3 px-3 min-w-[170px]">الدورة المقررة</th>
                  <th className="py-3 px-3 min-w-[190px]">اسم الشيخ</th>
                  <th className="py-3 px-3 min-w-[180px]">المكان</th>
                  <th className="py-3 px-3 min-w-[210px]">الكتاب المقرر</th>
                  <th className="py-3 px-2 w-24 text-center text-slate-800 bg-slate-100/70 border-x border-slate-200/60 font-black">
                    عدد الطلاب
                  </th>
                  <th className="py-3 px-2 w-28 text-center text-emerald-900 bg-emerald-50/50">
                    تم الامتحان
                  </th>
                  <th className="py-3 px-2 w-24 text-center text-teal-900 bg-teal-50/50">
                    تم التصحيح
                  </th>
                  <th className="py-3 px-2 w-24 text-center text-blue-900 bg-blue-50/50">
                    تم المراجعة
                  </th>
                  <th className="py-3 px-2 w-24 text-center text-teal-900 bg-teal-50/50">
                    تم الإعلان
                  </th>
                  <th className="py-3 px-2 w-24 text-center text-amber-900 bg-amber-50/50">
                    تم الحفل
                  </th>
                  <th className="py-3 px-2 w-24 text-center text-teal-900 bg-teal-100/70 border-x border-teal-200 font-black">
                    تفاصيل اللجنة
                  </th>
                  <th className="py-3 px-3 w-28 text-center">الحالة / تدقيق</th>
                  <th className="py-3 px-2 w-12 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, rIdx) => {
                  const isStruck = row.struck_out;
                  const isUncertain = row.uncertain;
                  const rowKey = row.id ? `${row.id}-${rIdx}` : `comm-row-${rIdx}`;

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
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600">
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
                      <td className="py-2.5 px-3 min-w-[170px]">
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
                        <input
                          type="text"
                          value={row.sheikh_name}
                          onChange={(e) =>
                            updateRowField(row.id, 'sheikh_name', e.target.value)
                          }
                          placeholder="اسم الشيخ الفاضل..."
                          className={`w-full py-1 px-2 rounded-lg bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-emerald-500 font-semibold outline-none transition-all ${
                            isStruck ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        />
                      </td>

                      {/* 3) Place */}
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={row.place}
                          onChange={(e) =>
                            updateRowField(row.id, 'place', e.target.value)
                          }
                          placeholder="المسجد / القاعة..."
                          className={`w-full py-1 px-2 rounded-lg bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-emerald-500 text-slate-700 outline-none transition-all ${
                            isStruck ? 'line-through text-slate-400' : ''
                          }`}
                        />
                      </td>

                      {/* 4) Book */}
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={row.book}
                          onChange={(e) =>
                            updateRowField(row.id, 'book', e.target.value)
                          }
                          placeholder="الكتاب أو المتن المقرر..."
                          className={`w-full py-1 px-2 rounded-lg bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-emerald-500 text-emerald-950 font-medium outline-none transition-all ${
                            isStruck ? 'line-through text-slate-400' : ''
                          }`}
                        />
                      </td>

                      {/* 4.5) Students Count (عدد الطلاب) */}
                      <td className="py-2.5 px-2 text-center bg-slate-50/40 border-x border-slate-100">
                        <div className="inline-flex items-center justify-center">
                          <input
                            type="number"
                            min="0"
                            value={row.students_count !== undefined && row.students_count !== null ? row.students_count : ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                              updateRowField(row.id, 'students_count', val);
                            }}
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
                      <td className="py-2.5 px-3 text-center">
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
                      <td className="py-2.5 px-2 text-center">
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
          </div>
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
              الحفظ التلقائي في المتصفح مفعل ✓
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
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl p-4 relative">
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

      {/* Modal: Add New Course (إضافة دورة جديدة) */}
      {isAddCourseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-right">
            <div className="px-5 py-4 bg-gradient-to-l from-emerald-800 to-brand text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-white/20 text-white">
                  <Tag className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold">إضافة دورة مسابقات علمية جديدة</h3>
                  <p className="text-xs text-emerald-100">
                    إنشاء دورة جديدة وربط اللجان والصفوف بها تلقائياً في قاعدة البيانات
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCourseModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-emerald-100 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCourseSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  اسم الدورة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="مثال: دورة الصيف 1448هـ - متون العقيدة"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    الموسم
                  </label>
                  <select
                    value={newCourseSeason}
                    onChange={(e) => setNewCourseSeason(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs font-bold outline-none bg-slate-50 cursor-pointer"
                  >
                    <option value="صيفية">صيفية</option>
                    <option value="شتوية">شتوية</option>
                    <option value="رمضانية">رمضانية</option>
                    <option value="مكثفة">مكثفة</option>
                    <option value="سنوية">سنوية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    العام الهجري / الميلادي
                  </label>
                  <input
                    type="text"
                    value={newCourseYear}
                    onChange={(e) => setNewCourseYear(e.target.value)}
                    placeholder="1448هـ / 2026م"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    حالة الدورة
                  </label>
                  <select
                    value={newCourseStatus}
                    onChange={(e) => setNewCourseStatus(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs font-bold outline-none bg-slate-50 cursor-pointer"
                  >
                    <option value="active">نشطة (الحالية)</option>
                    <option value="upcoming">قادمة</option>
                    <option value="completed">مكتملة ومؤرشفة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    العدد المستهدف للجان
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newCourseTargetCommittees}
                    onChange={(e) => setNewCourseTargetCommittees(parseInt(e.target.value, 10) || 30)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs font-mono font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  وصف وملاحظات الدورة
                </label>
                <textarea
                  rows={2}
                  value={newCourseDescription}
                  onChange={(e) => setNewCourseDescription(e.target.value)}
                  placeholder="وصف مختصر لأهداف وفروع هذه الدورة..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-emerald-600 text-xs outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddCourseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  حفظ وإضافة الدورة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add New Row & Committee with Course Selection */}
      {isAddRowModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-right">
            <div className="px-5 py-4 bg-gradient-to-l from-emerald-800 to-brand text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-white/20 text-white">
                  <PlusCircle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold">إضافة صف ولجنة جديدة إلى الكشف</h3>
                  <p className="text-xs text-emerald-100">
                    تحديد الدورة المقررة وحفظ اللجنة في قاعدة البيانات تلقائياً
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddRowModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-emerald-100 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddRowModalSubmit} className="p-5 space-y-4 text-xs">
              {/* Course Selector in Form */}
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/80">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-700" />
                    <span>الدورة التابعة لها هذه اللجنة:</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddCourseModalOpen(true)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>+ إضافة دورة جديدة</span>
                  </button>
                </div>

                <select
                  value={newRowCourseId || activeDefaultCourse?.id || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__new__') {
                      setIsAddCourseModalOpen(true);
                    } else {
                      setNewRowCourseId(val);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-slate-800 focus:border-emerald-600 outline-none cursor-pointer"
                >
                  {courses.map((crs) => (
                    <option key={crs.id} value={crs.id}>
                      {crs.name} ({crs.season} - {crs.year}) {crs.isDefault ? '⭐' : ''}
                    </option>
                  ))}
                  <option value="__new__">➕ إضافة دورة جديدة...</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم تسلسلي (م)
                  </label>
                  <input
                    type="number"
                    value={newRowNumber}
                    onChange={(e) => setNewRowNumber(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 font-mono font-bold text-center text-xs outline-none"
                    required
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم فضيلة الشيخ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="اسم الشيخ المشرف على اللجنة..."
                    value={newRowSheikhName}
                    onChange={(e) => setNewRowSheikhName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المكان / القاعة
                  </label>
                  <input
                    type="text"
                    value={newRowPlace}
                    onChange={(e) => setNewRowPlace(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الكتاب المقرر
                  </label>
                  <input
                    type="text"
                    value={newRowBook}
                    onChange={(e) => setNewRowBook(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs font-bold text-emerald-800 outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    عدد الطلاب
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newRowStudentsCount}
                    onChange={(e) => setNewRowStudentsCount(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs font-mono font-bold text-center outline-none"
                  />
                </div>
              </div>

              {/* Initial Stages */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                <span className="block text-xs font-bold text-slate-700">
                  مراحل الإنجاز الحالية للجنة:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowDelivered}
                      onChange={(e) => setNewRowDelivered(e.target.checked)}
                      className="rounded accent-emerald-600"
                    />
                    <span className="font-semibold text-emerald-900">1. تم الامتحان</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowCorrected}
                      onChange={(e) => setNewRowCorrected(e.target.checked)}
                      className="rounded accent-teal-600"
                    />
                    <span className="font-semibold text-teal-900">2. تم التصحيح</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowReviewed}
                      onChange={(e) => setNewRowReviewed(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <span className="font-semibold text-blue-900">3. تم المراجعة</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowAnnounced}
                      onChange={(e) => setNewRowAnnounced(e.target.checked)}
                      className="rounded accent-teal-600"
                    />
                    <span className="font-semibold text-teal-900">4. تم الإعلان</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRowCeremony}
                      onChange={(e) => setNewRowCeremony(e.target.checked)}
                      className="rounded accent-amber-600"
                    />
                    <span className="font-semibold text-amber-900">5. تم الحفل</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات
                </label>
                <input
                  type="text"
                  value={newRowNotes}
                  onChange={(e) => setNewRowNotes(e.target.value)}
                  placeholder="أي ملاحظات خاصة باللجنة..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 text-xs outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddRowModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  إضافة الصف واللجنة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
