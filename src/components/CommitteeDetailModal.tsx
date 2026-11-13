import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { toast } from './Toasts';
import {
  Committee,
  StageKey,
  STAGES_LIST,
  QuestionScoringItem,
  ScoringStageDetails,
  AggregationStageDetails,
  CeremonyStageDetails,
  AppUser,
  Course,
} from '../types';
import {
  calculateCurrentStage,
  createDefaultQuestions,
  getScoringProgress,
  todayISO,
} from '../utils/stageUtils';
import { STAGE_ACTION } from '../utils/committeeChanges';
import { AuthService } from '../services/AuthService';
import { CommitteeStaffPanel } from './StaffAssignment';
import { useSettings } from '../data/queries';
import { CommitteeHistory } from './CommitteeHistory';

interface CommitteeDetailModalProps {
  committee: Committee | null;
  onClose: () => void;
  /** Saves the edited committee; resolves to false when the server refused (the form then rolls back). */
  onSaveCommittee: (updated: Committee) => Promise<boolean> | boolean | void;
  currentUser?: AppUser;
  courses?: Course[];
  onReceiveCommittee?: (committeeId: string, cancel?: boolean) => unknown;
  onApproveExamReadiness?: (committeeId: string, revoke?: boolean) => unknown;
  /** The server returned a newer committee (staff added or removed). */
  onCommitteeChanged?: (committee: Committee) => void;
  /** Opened from an «تعديل» button: scroll straight to the data form. */
  startInEdit?: boolean;
}

/** Server times are ISO; older records may hold display text, shown as it is. */
function formatWhen(value?: string) {
  if (!value) return '';
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
}

// The form keeps its own editing state, so it is remounted (key) for each committee;
// otherwise switching committees would show — and save — the previous one's values.
export const CommitteeDetailModal: React.FC<CommitteeDetailModalProps> = (props) =>
  props.committee ? <CommitteeDetailForm key={props.committee.id} {...props} committee={props.committee} /> : null;

const CommitteeDetailForm: React.FC<CommitteeDetailModalProps & { committee: Committee }> = ({
  committee,
  onClose,
  onSaveCommittee,
  courses = [],
  onReceiveCommittee,
  onApproveExamReadiness,
  onCommitteeChanged,
  startInEdit = false,
}) => {
  useEscapeKey(onClose);
  // Suggested names come from «إعدادات النظام» (they used to be written in this file).
  const { settings } = useSettings();
  const editSectionRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (startInEdit) editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [startInEdit]);

  // Controls follow what the server will accept: the action and this committee's scope (WEB-09).
  const can = (action: string) => AuthService.canOnCommittee(action, committee);
  const canEditBase = can('committees.update');
  const canScore = can('committees.scoring');
  const canFinalize = can('committees.finalize');
  const canReception = can('committees.reception');
  const canStage = (k: StageKey) => can(STAGE_ACTION[k]);

  // Local state for stages and notes
  const [stages, setStages] = useState(committee.stages);
  const [generalNotes, setGeneralNotes] = useState(committee.generalNotes || '');
  const [committeeNumber, setCommitteeNumber] = useState<number | ''>(committee.committeeNumber);
  const [committeeName, setCommitteeName] = useState(committee.committeeName);
  const [branch, setBranch] = useState(committee.branch);
  const [associationName, setAssociationName] = useState(committee.associationName || '');
  const [competitionBook, setCompetitionBook] = useState(committee.competitionBook);
  const [courseId, setCourseId] = useState<string>(
    committee.courseId || courses.find((c) => c.isDefault)?.id || ''
  );
  const [isWomenCommittee, setIsWomenCommittee] = useState<boolean>(committee.isWomenCommittee || false);
  const [sheikhName, setSheikhName] = useState<string>(committee.sheikhName || '');
  const [sheikhPhone, setSheikhPhone] = useState<string>(committee.sheikhPhone || '');
  const [sheikhCountry, setSheikhCountry] = useState<string>(committee.sheikhCountry || '');
  const [examDate, setExamDate] = useState<string>(committee.examDate || '');
  const [studentsCount, setStudentsCount] = useState<number | ''>(committee.studentsCount ?? '');
  const [members, setMembers] = useState<string[]>(committee.members || []);
  const [newMemberInput, setNewMemberInput] = useState('');
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [pending, setPending] = useState(false);

  // Scoring state
  const [scoringDetails, setScoringDetails] = useState<ScoringStageDetails>(() => {
    return (
      committee.scoringDetails || {
        scorerName: committee.members[0] || '',
        scoringReviewerName: committee.members[1] || '',
        questions: createDefaultQuestions(5),
      }
    );
  });

  // Aggregation state
  const [aggregationDetails, setAggregationDetails] = useState<AggregationStageDetails>(() => {
    return (
      committee.aggregationDetails || {
        aggregatorName: committee.members[1] || committee.members[0] || '',
        scoringReviewerName: committee.scoringDetails?.scoringReviewerName || '',
        aggregationReviewerName: committee.members[2] || '',
        reviewConfirmed: committee.stages.aggregation?.completed || false,
      }
    );
  });

  // State to expand/collapse special stage details
  const [isScoringExpanded, setIsScoringExpanded] = useState(true);
  const [isAggregationExpanded, setIsAggregationExpanded] = useState(true);
  const [isCeremonyExpanded, setIsCeremonyExpanded] = useState(true);
  const [newScorerInputs, setNewScorerInputs] = useState<Record<string, string>>({});
  const [newSheikhInput, setNewSheikhInput] = useState('');

  // Sheet stage state & Excel import
  const [isSheetExpanded, setIsSheetExpanded] = useState(Boolean(committee.stages?.sheet?.completed || committee.stages?.sheet?.notes));
  const [sheetStudents, setSheetStudents] = useState<Array<{ number: number; name: string; score?: string | number; grade?: string; notes?: string }>>([]);
  const [sheetFileName, setSheetFileName] = useState<string>(() => {
    const n = committee.stages?.sheet?.notes || '';
    const match = n.match(/كشف إكسيل:\s*([^\(]+)/);
    return match ? match[1].trim() : '';
  });
  const sheetFileInputRef = useRef<HTMLInputElement>(null);

  // Ceremony stage state
  const [ceremonyDetails, setCeremonyDetails] = useState<CeremonyStageDetails>(() => {
    return (
      committee.ceremonyDetails || {
        honoredStudentsCount: committee.studentsCount || undefined,
        attendingSheikhs: committee.sheikhName ? [committee.sheikhName] : [],
        ceremonyDate: '',
        ceremonyTime: '',
        ceremonyPlace: '',
        notes: '',
      }
    );
  });

  // Sections the user actually edited. The form fills in defaults for display (e.g. the members'
  // names as scorers); a section that was not edited is sent back exactly as the server had it,
  // so saving one thing never writes those defaults as if someone had entered them.
  const edited = useRef({ scoring: false, aggregation: false, ceremony: false });
  const editScoring = (v: ScoringStageDetails) => {
    edited.current.scoring = true;
    setScoringDetails(v);
  };
  const editAggregation = (v: AggregationStageDetails) => {
    edited.current.aggregation = true;
    setAggregationDetails(v);
  };
  const editCeremony = (v: CeremonyStageDetails) => {
    edited.current.ceremony = true;
    setCeremonyDetails(v);
  };

  /** The committee as currently edited in the form, with optional overrides. */
  const buildCommittee = (overrides: Partial<Committee> = {}): Committee => {
    const selCourse = courses.find((c) => c.id === courseId);
    return {
      ...committee,
      committeeNumber: typeof committeeNumber === 'number' && committeeNumber > 0 ? committeeNumber : committee.committeeNumber,
      committeeName: committeeName.trim() || committee.committeeName,
      branch,
      associationName: associationName.trim() || undefined,
      competitionBook,
      generalNotes,
      courseId,
      courseName: selCourse?.name || committee.courseName,
      sheikhName: sheikhName.trim() || undefined,
      sheikhPhone: sheikhPhone.trim() || undefined,
      sheikhCountry: sheikhCountry.trim() || undefined,
      // null clears it on the server (undefined would keep the stored date).
      examDate: examDate || null,
      members: members.map((m) => m.trim()).filter(Boolean),
      studentsCount: typeof studentsCount === 'number' && !isNaN(studentsCount) ? studentsCount : undefined,
      isWomenCommittee,
      stages,
      scoringDetails: edited.current.scoring ? scoringDetails : committee.scoringDetails,
      aggregationDetails: edited.current.aggregation ? aggregationDetails : committee.aggregationDetails,
      ceremonyDetails: edited.current.ceremony ? ceremonyDetails : committee.ceremonyDetails,
      ...overrides,
    };
  };

  /**
   * Sends the change and waits for the server. "Saved" appears only after it confirmed; when it
   * refused, `revert` puts the form back (the error is shown by the app).
   */
  const save = async (next: Committee, revert: () => void) => {
    setPending(true);
    const ok = await Promise.resolve(onSaveCommittee(next));
    setPending(false);
    if (ok === false) {
      revert();
      return;
    }
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2000);
  };

  const saveCeremony = (updated: CeremonyStageDetails) => {
    if (!canFinalize) return;
    edited.current.ceremony = true;
    const before = ceremonyDetails;
    setCeremonyDetails(updated);
    void save(buildCommittee({ ceremonyDetails: updated }), () => setCeremonyDetails(before));
  };

  const handleAddSheikh = () => {
    const trimmed = newSheikhInput.trim();
    if (!trimmed) return;
    if (!ceremonyDetails.attendingSheikhs.includes(trimmed)) {
      saveCeremony({ ...ceremonyDetails, attendingSheikhs: [...ceremonyDetails.attendingSheikhs, trimmed] });
    }
    setNewSheikhInput('');
  };

  const handleRemoveSheikh = (index: number) => {
    saveCeremony({ ...ceremonyDetails, attendingSheikhs: ceremonyDetails.attendingSheikhs.filter((_, i) => i !== index) });
  };

  const saveScoring = (updatedScoring: ScoringStageDetails, nextStages = stages) => {
    if (!canScore) return;
    edited.current.scoring = true;
    const before = { scoring: scoringDetails, stages };
    setScoringDetails(updatedScoring);
    setStages(nextStages);
    void save(buildCommittee({ scoringDetails: updatedScoring, stages: nextStages }), () => {
      setScoringDetails(before.scoring);
      setStages(before.stages);
    });
  };

  // Scorer management per question
  const handleAddScorerToQuestion = (qId: string, scorerName: string) => {
    const trimmed = scorerName.trim();
    if (!trimmed) return;
    const updatedQuestions = scoringDetails.questions.map((q) =>
      q.id === qId && !(q.scorers || []).includes(trimmed) ? { ...q, scorers: [...(q.scorers || []), trimmed] } : q
    );
    setNewScorerInputs((prev) => ({ ...prev, [qId]: '' }));
    saveScoring({ ...scoringDetails, questions: updatedQuestions });
  };

  const handleRemoveScorerFromQuestion = (qId: string, scorerToRemove: string) => {
    const updatedQuestions = scoringDetails.questions.map((q) =>
      q.id === qId ? { ...q, scorers: (q.scorers || []).filter((s) => s !== scorerToRemove) } : q
    );
    saveScoring({ ...scoringDetails, questions: updatedQuestions });
  };

  // Stages change through the server's workflow: in order, with the server's time (API-10).
  const handleToggleStage = (key: StageKey) => {
    if (!canStage(key) || pending) return;
    const isCurrentlyDone = Boolean(stages[key]?.completed);
    const before = stages;
    const updatedStages = { ...stages, [key]: { ...(stages[key] ?? {}), completed: !isCurrentlyDone } };
    setStages(updatedStages);
    void save(buildCommittee({ stages: updatedStages }), () => setStages(before));
  };

  // Toggle individual question in scoring
  const handleToggleQuestion = (qId: string) => {
    if (pending) return;
    const updatedQuestions = scoringDetails.questions.map((q) => (q.id === qId ? { ...q, completed: !q.completed } : q));
    const allDone = updatedQuestions.every((q) => q.completed);
    // When every question is scored the scoring stage is completed too (and reopened otherwise).
    const nextStages =
      allDone !== Boolean(stages.scoring?.completed) && canStage('scoring')
        ? { ...stages, scoring: { ...(stages.scoring ?? {}), completed: allDone } }
        : stages;
    saveScoring({ ...scoringDetails, questions: updatedQuestions }, nextStages);
  };

  // Add new question to scoring list
  const handleAddQuestion = () => {
    const nextNum = scoringDetails.questions.length + 1;
    const arabicNumbers = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
    const newQ: QuestionScoringItem = {
      id: `q-${crypto.randomUUID()}`,
      questionNumber: nextNum,
      label: `السؤال ${arabicNumbers[nextNum - 1] || nextNum}`,
      completed: false,
    };
    saveScoring({ ...scoringDetails, questions: [...scoringDetails.questions, newQ] });
  };

  // Delete question
  const handleDeleteQuestion = (qId: string) => {
    if (scoringDetails.questions.length <= 1) return;
    saveScoring({ ...scoringDetails, questions: scoringDetails.questions.filter((q) => q.id !== qId) });
  };

  // Explicit save for base data, notes, scorer names and aggregation details.
  const handleSave = () => {
    void save(buildCommittee(), () => {
      setGeneralNotes(committee.generalNotes || '');
      setScoringDetails(committee.scoringDetails ?? scoringDetails);
      setAggregationDetails(committee.aggregationDetails ?? aggregationDetails);
    });
  };

  // Excel import for committee score sheet (stage 6: sheet)
  const handleSheetExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (rawRows.length === 0) {
        toast.error('الملف المحدد لا يحتوي على صفوف أو بيانات مقروءة.');
        return;
      }

      const parsedStudents = rawRows.map((row, idx) => {
        const getVal = (keys: string[]) => {
          for (const k of keys) {
            if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim();
          }
          return '';
        };

        const numVal = parseInt(getVal(['م', 'الرقم', 'رقم', 'id', 'number']), 10);
        const name = getVal(['اسم الطالب', 'الطالب', 'الاسم', 'student_name', 'name', 'اسم الشيخ', 'الشيخ']);
        const score = getVal(['الدرجة', 'المجموع', 'الدرجة النهائية', 'النسبة', 'score', 'total', 'mark']);
        const grade = getVal(['التقدير', 'الحالة', 'النتيجة', 'grade', 'status', 'result']);
        const notes = getVal(['ملاحظات', 'ملاحظة', 'notes']);

        return {
          number: !isNaN(numVal) && numVal > 0 ? numVal : idx + 1,
          name: name || `طالب ${idx + 1}`,
          score: score || '—',
          grade: grade || '',
          notes: notes || '',
        };
      });

      setSheetStudents(parsedStudents);
      setSheetFileName(file.name);
      setIsSheetExpanded(true);

      const noteText = `كشف إكسيل: ${file.name} (${parsedStudents.length} طالب)`;
      const nowIso = new Date().toISOString();
      const nextStages = {
        ...stages,
        sheet: {
          ...(stages.sheet ?? {}),
          completed: true,
          completedAt: nowIso,
          notes: noteText,
        },
      };
      setStages(nextStages);
      const nextStudentsCount: number | undefined =
        parsedStudents.length > 0 && (!studentsCount || studentsCount === 0)
          ? parsedStudents.length
          : typeof studentsCount === 'number' && !isNaN(studentsCount)
          ? studentsCount
          : undefined;
      if (parsedStudents.length > 0 && (!studentsCount || studentsCount === 0)) {
        setStudentsCount(parsedStudents.length);
      }

      void save(
        buildCommittee({
          stages: nextStages,
          studentsCount: nextStudentsCount,
        }),
        () => setStages(stages)
      );

      toast.success(`تم استيراد كشف الإكسيل بنجاح (${parsedStudents.length} طالب).`);
    } catch (err: any) {
      console.error('Error reading Excel file:', err);
      toast.error('تعذر قراءة ملف الإكسيل، يرجى التأكد من اختيار ملف .xlsx أو .xls أو .csv صالح.');
    } finally {
      if (sheetFileInputRef.current) sheetFileInputRef.current.value = '';
    }
  };

  const handleDownloadSheetTemplate = () => {
    const templateData = [
      { 'م': 1, 'اسم الطالب': 'أحمد محمد علي', 'الدرجة': 98, 'التقدير': 'ممتاز مرتفع', 'ملاحظات': 'حفظ متقن ومتميز' },
      { 'م': 2, 'اسم الطالب': 'عبد الرحمن خالد', 'الدرجة': 92, 'التقدير': 'ممتاز', 'ملاحظات': 'أداء متقن' },
      { 'م': 3, 'اسم الطالب': 'عمر يوسف إبراهيم', 'الدرجة': 85, 'التقدير': 'جيد جداً', 'ملاحظات': '' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!views'] = [{ RTL: true }];
    ws['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 12 }, { wch: 16 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'نموذج كشف درجات');
    XLSX.writeFile(wb, `نموذج_كشف_درجات_لجنة_${committee.committeeNumber}.xlsx`);
  };

  const handleExportCommitteeSheet = () => {
    try {
      const exportData = (sheetStudents.length > 0 ? sheetStudents : Array.from({ length: Number(studentsCount) || 1 }, (_, i) => ({
        number: i + 1,
        name: `طالب ${i + 1}`,
        score: '—',
        grade: '—',
        notes: '',
      }))).map((s) => ({
        'رقم اللجنة': `#${committee.committeeNumber}`,
        'اسم اللجنة': committee.committeeName,
        'الدورة': committee.courseName || '—',
        'الكتاب المقرر': committee.competitionBook,
        'الفرع': committee.branch,
        'الشيخ المرسل إليه': committee.sheikhName || '—',
        'م': s.number,
        'اسم الطالب': s.name,
        'الدرجة': s.score,
        'التقدير': s.grade,
        'ملاحظات': s.notes,
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!views'] = [{ RTL: true }];
      ws['!cols'] = [
        { wch: 12 }, // رقم اللجنة
        { wch: 22 }, // اسم اللجنة
        { wch: 18 }, // الدورة
        { wch: 24 }, // الكتاب المقرر
        { wch: 16 }, // الفرع
        { wch: 20 }, // الشيخ
        { wch: 6 },  // م
        { wch: 25 }, // اسم الطالب
        { wch: 12 }, // الدرجة
        { wch: 14 }, // التقدير
        { wch: 24 }, // ملاحظات
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'كشف درجات اللجنة');
      XLSX.writeFile(wb, `كشف_درجات_لجنة_${committee.committeeNumber}_${todayISO()}.xlsx`);
      toast.success(`تم تصدير كشف الدرجات إلى ملف Excel بنجاح.`);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('تعذر تصدير الملف، يرجى المحاولة مرة أخرى.');
    }
  };

  const canSaveAnything = canEditBase || canScore || canFinalize;

  const currentStatus = calculateCurrentStage(stages);
  const scoringProgress = getScoringProgress(scoringDetails);

  return (
    <div role="dialog" aria-modal="true" aria-label="تفاصيل اللجنة" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-line/50 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in duration-150 text-right">
        {/* Header */}
        <div className="px-5 py-4 bg-canvas border-b border-line/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold text-base">
              #{committee.committeeNumber}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-ink">
                  {committee.committeeName}
                </h2>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${currentStatus.badgeClass}`}
                >
                  {currentStatus.emoji} {currentStatus.label}
                </span>

                {isWomenCommittee && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-50 text-rose-800 border border-rose-200">
                    🧕 لجنة نسائية
                  </span>
                )}

                {studentsCount !== '' && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-800 border border-blue-200 font-mono">
                    👥 {studentsCount} {isWomenCommittee ? 'طالبة' : 'طالباً'}
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-soft mt-0.5">
                {committee.competitionBook} • {committee.branch}
              </p>
            </div>
          </div>

          <button
            aria-label="إغلاق"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-line/40 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {/* Quick Info Grid */}
          <div className="bg-canvas p-4 rounded-xl border border-line/40 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-muted block font-semibold mb-0.5">مسار المسابقة / الكتاب:</span>
              <span className="font-bold text-brand">{committee.competitionBook}</span>
            </div>
            <div>
              <span className="text-muted block font-semibold mb-0.5">الفرع:</span>
              <span className="font-bold text-ink">{committee.branch}</span>
            </div>
            <div>
              <span className="text-muted block font-semibold mb-0.5">الجمعية:</span>
              <span className="font-bold text-ink">
                {committee.associationName || '—'}
              </span>
            </div>
            <div>
              <span className="text-muted block font-semibold mb-0.5">الدورة التابعة لها:</span>
              {canEditBase && courses && courses.length > 0 ? (
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full bg-white border border-line rounded-lg px-2 py-1 text-xs font-bold text-brand outline-none"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.status === 'active' ? '⚡' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-bold text-brand">
                  {committee.courseName || courses.find((c) => c.id === committee.courseId)?.name || '—'}
                </span>
              )}
            </div>

            {/* عدد الطلاب باللجنة */}
            <div>
              <span className="text-muted block font-semibold mb-0.5">عدد الطلاب باللجنة:</span>
              <span className="font-bold font-mono text-ink">
                {studentsCount ? `${studentsCount} ${isWomenCommittee ? 'طالبة' : 'طالباً'}` : 'غير محدد'}
              </span>
            </div>

            {/* تصنيف اللجنة في حال كانت نسائية فقط */}
            {isWomenCommittee && (
              <div>
                <span className="text-muted block font-semibold mb-0.5">التصنيف:</span>
                <span className="font-bold text-rose-700 inline-flex items-center gap-1">
                  <span>🧕</span>
                  <span>لجنة نسائية</span>
                </span>
              </div>
            )}

            {/* بيانات الشيخ المرسل إليه */}
            <div>
              <span className="text-muted block font-semibold mb-0.5">الشيخ المرسل إليه:</span>
              <span className="font-bold text-brand">
                {sheikhName || 'لم يُحدد'}
              </span>
            </div>

            <div>
              <span className="text-muted block font-semibold mb-0.5">رقم هاتف الشيخ:</span>
              {sheikhPhone ? (
                <a
                  href={`tel:${sheikhPhone}`}
                  className="font-bold font-mono text-brand hover:underline inline-flex items-center gap-1"
                  dir="ltr"
                >
                  <span>📞</span>
                  <span>{sheikhPhone}</span>
                </a>
              ) : (
                <span className="text-gray-400">غير مسجل</span>
              )}
            </div>

            <div>
              <span className="text-muted block font-semibold mb-0.5">مكان الشيخ (المسجد / القاعة / البلد):</span>
              <span className="font-bold text-ink">
                {sheikhCountry || 'غير محدد'}
              </span>
            </div>

            <div className="sm:col-span-3 pt-2 border-t border-line/20">
              <span className="text-muted font-semibold">أعضاء اللجنة: </span>
              <span className="font-bold text-ink">{(members.length > 0 ? members : committee.members).join(' — ')}</span>
            </div>
          </div>

          {/* Reception and exam readiness (WEB-06): recorded by the server with who and when */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className={`p-3.5 rounded-xl border ${committee.receivedByAssistant ? 'bg-emerald-50/70 border-emerald-200' : 'bg-canvas border-line/40'}`}>
              <span className="font-bold text-ink flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-700 text-base">inventory</span>
                <span>استلام اللجنة</span>
              </span>
              <p className="mt-1 text-ink-soft">
                {committee.receivedByAssistant
                  ? `استلمها ${committee.receivedByAssistant.assistantName} — ${formatWhen(committee.receivedByAssistant.receivedAt)}`
                  : 'لم يُوثَّق الاستلام بعد'}
              </p>
              {canReception && onReceiveCommittee && (
                <button
                  type="button"
                  onClick={() => onReceiveCommittee(committee.id, Boolean(committee.receivedByAssistant))}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 font-bold cursor-pointer hover:bg-emerald-50"
                >
                  {committee.receivedByAssistant ? 'إلغاء توثيق الاستلام' : 'توثيق الاستلام'}
                </button>
              )}
            </div>
            <div className={`p-3.5 rounded-xl border ${committee.examApprovedBy ? 'bg-blue-50/70 border-blue-200' : 'bg-canvas border-line/40'}`}>
              <span className="font-bold text-ink flex items-center gap-1.5">
                <span className="material-symbols-outlined text-blue-700 text-base">verified</span>
                <span>جاهزية وتوزيع الامتحان</span>
              </span>
              <p className="mt-1 text-ink-soft">
                {committee.examApprovedBy
                  ? `اعتمدها ${committee.examApprovedBy.assistantName} — ${formatWhen(committee.examApprovedBy.approvedAt)}`
                  : 'غير معتمدة بعد'}
              </p>
              {canReception && onApproveExamReadiness && (
                <button
                  type="button"
                  onClick={() => onApproveExamReadiness(committee.id, Boolean(committee.examApprovedBy))}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-blue-900 font-bold cursor-pointer hover:bg-blue-50"
                >
                  {committee.examApprovedBy ? 'إلغاء الاعتماد' : 'اعتماد الجاهزية'}
                </button>
              )}
            </div>
          </div>

          <CommitteeStaffPanel committee={committee} onChanged={onCommitteeChanged} />

          {/* Section: Stages Progression with Special Scoring & Aggregation Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-ink flex items-center gap-1.5">
                <span className="material-symbols-outlined text-brand">timeline</span>
                <span>مراحل عمل اللجنة (تبديل الحالة وتوثيق الوقت):</span>
              </h3>
              <span className="text-xs text-muted">
                الخادم يسجل الوقت ومن قام بالإتمام، وتُتم المراحل بالترتيب
              </span>
            </div>

            <div className="space-y-3">
              {STAGES_LIST.map((stageItem) => {
                const stageData = stages[stageItem.key];
                const isCompleted = stageData?.completed;
                const isScoring = stageItem.key === 'scoring';
                const isAggregation = stageItem.key === 'aggregation';

                // SPECIAL STAGE: SCORING (حالة التصحيح بخطوات الأسئلة)
                if (isScoring) {
                  return (
                    <div
                      key={stageItem.key}
                      className="rounded-2xl border-2 border-amber-300/80 bg-amber-50/30 overflow-hidden shadow-xs"
                    >
                      {/* Scoring Stage Header */}
                      <div className="p-4 bg-gradient-to-l from-amber-100/70 to-amber-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl shrink-0">🟠</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-amber-950">
                                حالة التصحيح (تفصيل تصحيح الأسئلة)
                              </span>
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : scoringProgress.completed > 0
                                    ? 'bg-amber-200 text-amber-900 border-amber-300'
                                    : 'bg-gray-100 text-gray-700 border-gray-300'
                                }`}
                              >
                                {isCompleted
                                  ? 'تم التصحيح بالكامل'
                                  : `تم ${scoringProgress.completed} من ${scoringProgress.total} أسئلة (${scoringProgress.percentage}%)`}
                              </span>
                            </div>

                            {stageData?.completedAt && (
                              <div className="flex items-center gap-1 text-xs text-amber-800 mt-1">
                                <span className="material-symbols-outlined text-xs">schedule</span>
                                <span>تاريخ إتمام التصحيح: {formatWhen(stageData.completedAt)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Toggle all */}
                          <button
                            type="button"
                            onClick={() => handleToggleStage('scoring')}
                            disabled={!canStage('scoring') || pending}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                              isCompleted
                                ? 'bg-emerald-700 text-white'
                                : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100'
                            }`}
                          >
                            {isCompleted ? '✓ تم اعتماد التصحيح' : 'اعتماد يدوي'}
                          </button>

                          <button
                            type="button"
                            onClick={() => setIsScoringExpanded(!isScoringExpanded)}
                            className="p-1.5 text-amber-900 hover:bg-amber-200/50 rounded-lg cursor-pointer"
                            title="عرض / إخفاء تفاصيل الأسئلة والمصححين"
                          >
                            <span className="material-symbols-outlined text-lg">
                              {isScoringExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Scoring Details */}
                      {isScoringExpanded && (
                        <div className="p-4 space-y-4 border-t border-amber-200/70 bg-white">
                          {/* 1. Scorer & Reviewer Inputs */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-amber-50/50 p-3 rounded-xl border border-amber-200/50">
                            <div>
                              <label className="block font-bold text-ink mb-1">
                                ✍️ اسم المصحح:
                              </label>
                              <input
                                type="text"
                                placeholder="اكتب اسم المصحح المعتمد..."
                                value={scoringDetails.scorerName || ''}
                                onChange={(e) =>
                                  editScoring({
                                    ...scoringDetails,
                                    scorerName: e.target.value,
                                  })
                                }
                                className="w-full bg-white border border-line rounded-xl px-3 py-1.5 text-xs outline-none focus:border-amber-600 font-semibold"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-ink mb-1">
                                🔍 اسم مراجع التصحيح:
                              </label>
                              <input
                                type="text"
                                placeholder="اكتب اسم مراجع التصحيح والدرجات..."
                                value={scoringDetails.scoringReviewerName || ''}
                                onChange={(e) =>
                                  editScoring({
                                    ...scoringDetails,
                                    scoringReviewerName: e.target.value,
                                  })
                                }
                                className="w-full bg-white border border-line rounded-xl px-3 py-1.5 text-xs outline-none focus:border-amber-600 font-semibold"
                              />
                            </div>
                          </div>

                          {/* 2. Questions Step-by-Step Checklist */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-ink flex items-center gap-1">
                                <span className="material-symbols-outlined text-amber-600 text-sm">
                                  checklist
                                </span>
                                <span>خطوات تصحيح الأسئلة (سؤال بسؤال):</span>
                              </span>
                              <button
                                type="button"
                                onClick={handleAddQuestion}
                                disabled={!canScore || pending}
                                className="text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <span className="material-symbols-outlined text-xs">add</span>
                                <span>إضافة سؤال</span>
                              </button>
                            </div>

                            {/* Question Progress bar */}
                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-amber-500 h-full transition-all duration-300 rounded-full"
                                style={{ width: `${scoringProgress.percentage}%` }}
                              />
                            </div>

                            <div className="space-y-3 pt-1">
                              {scoringDetails.questions.map((q) => {
                                const questionScorers = q.scorers || [];
                                const currentInput = newScorerInputs[q.id] || '';

                                return (
                                  <div
                                    key={q.id}
                                    className={`p-3.5 rounded-xl border transition-all ${
                                      q.completed
                                        ? 'bg-emerald-50/60 border-emerald-300 shadow-2xs'
                                        : 'bg-canvas border-line/60 hover:bg-amber-50/40'
                                    }`}
                                  >
                                    {/* Top Row: Checkbox, Label, Timestamp, Delete */}
                                    <div className="flex items-center justify-between pb-2 border-b border-line/30">
                                      <div
                                        role="checkbox"
                                        aria-checked={q.completed}
                                        aria-disabled={!canScore || pending}
                                        tabIndex={canScore ? 0 : -1}
                                        onClick={() => canScore && handleToggleQuestion(q.id)}
                                        onKeyDown={(e) => {
                                          if (canScore && (e.key === ' ' || e.key === 'Enter')) {
                                            e.preventDefault();
                                            handleToggleQuestion(q.id);
                                          }
                                        }}
                                        className={`flex items-center gap-2.5 select-none ${canScore ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                                      >
                                        <span
                                          className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                                            q.completed
                                              ? 'bg-emerald-600 text-white shadow-2xs'
                                              : 'border border-gray-400 bg-white'
                                          }`}
                                        >
                                          {q.completed ? '✓' : ''}
                                        </span>
                                        <span
                                          className={`text-xs ${
                                            q.completed
                                              ? 'text-emerald-950 font-bold'
                                              : 'text-ink font-semibold'
                                          }`}
                                        >
                                          {q.completed ? `تم تصحيح ${q.label}` : `تصحيح ${q.label}`}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {q.completed && q.completedAt ? (
                                          <span className="text-xs text-emerald-800 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            <span className="material-symbols-outlined text-xs">
                                              schedule
                                            </span>
                                            <span>{q.completedAt.split(' - ')[1] || q.completedAt}</span>
                                          </span>
                                        ) : (
                                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md font-medium">
                                            قيد التصحيح
                                          </span>
                                        )}

                                        {scoringDetails.questions.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteQuestion(q.id)}
                                            disabled={!canScore || pending}
                                            className="text-gray-400 hover:text-red-500 p-1 rounded-md"
                                            title="حذف هذا السؤال"
                                          >
                                            <span className="material-symbols-outlined text-sm">
                                              close
                                            </span>
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Scorers Section for this Question (مصححو هذا السؤال - يدعم أكثر من مصحح) */}
                                    <div className="mt-2.5 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-ink flex items-center gap-1">
                                          <span className="material-symbols-outlined text-xs text-amber-700">
                                            edit_note
                                          </span>
                                          <span>مصحح (أو مصححو) هذا السؤال:</span>
                                        </span>
                                        <span className="text-xs text-muted">
                                          (يمكن إضافة أكثر من مصحح شاركوا في تصحيح السؤال)
                                        </span>
                                      </div>

                                      {/* Assigned Scorers Badges */}
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {questionScorers.length > 0 ? (
                                          questionScorers.map((scorerName, sIdx) => (
                                            <span
                                              key={sIdx}
                                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300/80 text-xs font-bold shadow-2xs"
                                            >
                                              <span className="material-symbols-outlined text-xs text-amber-800">
                                                person
                                              </span>
                                              <span>{scorerName}</span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleRemoveScorerFromQuestion(q.id, scorerName)
                                                }
                                                className="text-amber-700 hover:text-red-600 rounded-full p-0.5 cursor-pointer leading-none"
                                                title="إزالة هذا المصحح"
                                              >
                                                ✕
                                              </button>
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-xs text-gray-400 italic">
                                            لم يُحدد مصحح لهذا السؤال بعد (اضغط لإضافة مصحح)
                                          </span>
                                        )}
                                      </div>

                                      {/* Quick Add from Committee Members + Custom Input */}
                                      <div className="pt-1.5 flex flex-wrap items-center gap-2 text-xs">
                                        {/* Quick Member Suggestions */}
                                        {committee.members.map((member, mIdx) => {
                                          const isAssigned = questionScorers.includes(member);
                                          if (isAssigned) return null;
                                          return (
                                            <button
                                              key={mIdx}
                                              type="button"
                                              onClick={() =>
                                                handleAddScorerToQuestion(q.id, member)
                                              }
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-line text-ink-soft hover:bg-amber-50 hover:text-amber-900 text-xs font-semibold transition-colors cursor-pointer"
                                              title={`تعيين ${member} كمصحح لهذا السؤال`}
                                            >
                                              <span className="text-amber-600 text-xs">+</span>
                                              <span>{member}</span>
                                            </button>
                                          );
                                        })}

                                        {/* Custom Scorer Name Input */}
                                        <div className="inline-flex items-center gap-1 mt-1 sm:mt-0">
                                          <input
                                            type="text"
                                            placeholder="أو اكتب اسم مصحح آخر..."
                                            value={currentInput}
                                            onChange={(e) =>
                                              setNewScorerInputs((prev) => ({
                                                ...prev,
                                                [q.id]: e.target.value,
                                              }))
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddScorerToQuestion(q.id, currentInput);
                                              }
                                            }}
                                            className="bg-white border border-line rounded-lg px-2.5 py-1 text-xs outline-none focus:border-amber-600 w-36 sm:w-44 text-ink"
                                          />
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleAddScorerToQuestion(q.id, currentInput)
                                            }
                                            disabled={!currentInput.trim()}
                                            className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer transition-all shrink-0"
                                          >
                                            إضافة
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // SPECIAL STAGE: AGGREGATION (تجميع الدرجات ومراجع التجميع)
                if (isAggregation) {
                  return (
                    <div
                      key={stageItem.key}
                      className="rounded-2xl border-2 border-teal-200 bg-teal-50/20 overflow-hidden shadow-xs"
                    >
                      <div className="p-4 bg-gradient-to-l from-teal-100/60 to-teal-50/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl shrink-0">🔵</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-teal-950">
                                تجميع الدرجات وتدقيق المجموع
                              </span>
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-gray-100 text-gray-700 border-gray-300'
                                }`}
                              >
                                {isCompleted ? 'تم التجميع والتدقيق' : 'قيد التجميع'}
                              </span>
                            </div>

                            {stageData?.completedAt && (
                              <div className="flex items-center gap-1 text-xs text-teal-800 mt-1">
                                <span className="material-symbols-outlined text-xs">schedule</span>
                                <span>تاريخ إتمام التجميع: {formatWhen(stageData.completedAt)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!isCompleted}
                              disabled={!canStage('aggregation') || pending}
                              onChange={() => handleToggleStage('aggregation')}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-700"></div>
                          </label>

                          <button
                            type="button"
                            onClick={() => setIsAggregationExpanded(!isAggregationExpanded)}
                            className="p-1.5 text-teal-900 hover:bg-teal-200/50 rounded-lg cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-lg">
                              {isAggregationExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Aggregation Details */}
                      {isAggregationExpanded && (
                        <div className="p-4 space-y-3 border-t border-teal-200/70 bg-white">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-teal-50/40 p-3 rounded-xl border border-teal-200/40">
                            <div>
                              <label className="block font-bold text-ink mb-1">
                                📊 مراجع ومجمع الدرجات في التجميع:
                              </label>
                              <input
                                type="text"
                                placeholder="اسم المكلف بالتجميع..."
                                value={aggregationDetails.aggregatorName || ''}
                                onChange={(e) =>
                                  editAggregation({
                                    ...aggregationDetails,
                                    aggregatorName: e.target.value,
                                  })
                                }
                                className="w-full bg-white border border-line rounded-xl px-3 py-1.5 text-xs outline-none focus:border-teal-600 font-semibold"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-ink mb-1">
                                🔍 مراجع الدرجات ومطابقتها في التصحيح:
                              </label>
                              <input
                                type="text"
                                placeholder="اسم مراجع الدرجات في التصحيح..."
                                value={aggregationDetails.scoringReviewerName || ''}
                                onChange={(e) =>
                                  editAggregation({
                                    ...aggregationDetails,
                                    scoringReviewerName: e.target.value,
                                  })
                                }
                                className="w-full bg-white border border-line rounded-xl px-3 py-1.5 text-xs outline-none focus:border-teal-600 font-semibold"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // 3. SPECIAL STAGE: CEREMONY (مرحلة الحفل والتكريم وتوزيع الجوائز)
                if (stageItem.key === 'ceremony') {
                  return (
                    <div
                      key={stageItem.key}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isCompleted
                          ? 'bg-emerald-50/40 border-emerald-300 shadow-xs'
                          : 'bg-amber-50/30 border-amber-300 shadow-xs'
                      }`}
                    >
                      {/* Top Banner Row */}
                      <div className="p-4 flex items-center justify-between gap-3 bg-gradient-to-l from-amber-50/70 via-white to-amber-50/30">
                        <div className="flex items-center gap-3">
                          <span className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-xl shrink-0 shadow-2xs">
                            🎉
                          </span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-ink">
                                مرحلة الحفل والتكريم وتوزيع الجوائز
                              </span>
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {isCompleted ? '✓ تم الحفل والتكريم' : '⏳ قيد الترتيب والجدولة'}
                              </span>
                            </div>

                            {isCompleted && stageData?.completedAt && (
                              <div className="flex items-center gap-1 text-xs text-emerald-800 mt-1 font-mono">
                                <span className="material-symbols-outlined text-xs">schedule</span>
                                <span>تاريخ التمام: {formatWhen(stageData.completedAt)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleStage('ceremony')}
                            disabled={!canStage('ceremony') || pending}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                              isCompleted
                                ? 'bg-emerald-700 text-white shadow-2xs'
                                : 'bg-brand text-white hover:bg-brand-deep shadow-2xs'
                            }`}
                          >
                            {isCompleted ? '✓ تم اعتماد الحفل' : 'إتمام الحفل الآن'}
                          </button>

                          <button
                            type="button"
                            onClick={() => setIsCeremonyExpanded(!isCeremonyExpanded)}
                            className="p-1.5 text-amber-900 hover:bg-amber-200/50 rounded-lg cursor-pointer"
                            title="عرض / إخفاء تفاصيل الحفل"
                          >
                            <span className="material-symbols-outlined text-lg">
                              {isCeremonyExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Ceremony Details Form */}
                      {isCeremonyExpanded && (
                        <div className="p-4 space-y-4 border-t border-amber-200/70 bg-white">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            {/* 1. عدد الطلاب الذين سيتم تكريمهم */}
                            <div className="bg-amber-50/40 p-3 rounded-xl border border-amber-200/50 space-y-1">
                              <label className="block font-bold text-ink">
                                🏆 عدد الطلاب الذين سيتم تكريمهم:
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={ceremonyDetails.honoredStudentsCount ?? ''}
                                disabled={!canFinalize}
                                onChange={(e) => editCeremony({ ...ceremonyDetails, honoredStudentsCount: e.target.value === '' ? undefined : Number(e.target.value) })}
                                onBlur={() => saveCeremony(ceremonyDetails)}
                                placeholder="اكتب عدد الطلاب المكرمين..."
                                className="w-full bg-white border border-line rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none focus:border-amber-600"
                              />
                              <span className="text-xs text-slate-500 block leading-tight">
                                * يحدد يدوياً لتوثيق الناجحين فقط (إجمالي طلاب اللجنة: {studentsCount || 0} طالب)
                              </span>
                            </div>

                            {/* 2. موعد الحفل بالتاريخ والوقت */}
                            <div className="bg-amber-50/40 p-3 rounded-xl border border-amber-200/50 space-y-2">
                              <div>
                                <label className="block font-bold text-ink mb-1">
                                  📅 موعد الحفل بالتاريخ:
                                </label>
                                <input
                                  type="date"
                                  value={ceremonyDetails.ceremonyDate || ''}
                                  disabled={!canFinalize}
                                  onChange={(e) => saveCeremony({ ...ceremonyDetails, ceremonyDate: e.target.value })}
                                  className="w-full bg-white border border-line rounded-xl px-3 py-1.5 text-xs font-mono font-bold outline-none focus:border-amber-600"
                                />
                              </div>

                              <div>
                                <label className="block font-bold text-ink mb-1">
                                  ⏰ موعد الحفل بالوقت (اكتبه بيدك):
                                </label>
                                <input
                                  type="text"
                                  placeholder="مثال: 4 العصر، 4 المغرب، 08:00 م بعد العشاء..."
                                  value={ceremonyDetails.ceremonyTime || ''}
                                  disabled={!canFinalize}
                                onChange={(e) => editCeremony({ ...ceremonyDetails, ceremonyTime: e.target.value })}
                                onBlur={() => saveCeremony(ceremonyDetails)}
                                  className="w-full bg-white border border-line rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-amber-600"
                                />
                              </div>
                            </div>
                          </div>

                          {/* 3. أسماء المشايخ الذين سيحضرون الحفل (إضافة أكثر من شيخ) */}
                          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <label className="font-bold text-xs text-ink flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm text-brand">
                                  person_add
                                </span>
                                <span>أسماء المشايخ والضيوف الحاضرين للحفل:</span>
                              </label>
                              <span className="text-xs font-bold text-slate-500 font-mono">
                                ({ceremonyDetails.attendingSheikhs.length}) مشايخ مضافين
                              </span>
                            </div>

                            {/* Preset Sheikhs Quick Selection */}
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-bold text-slate-600 block">
                                اختر من المشايخ والفضلاء الأساسيين للحفل (انقر للاختيار أو الإلغاء):
                              </span>
                              {settings.ceremony_sheikhs.length === 0 && (
                                <span className="text-[11px] text-slate-500 block">لا توجد أسماء مقترحة بعد؛ يضيفها الأدمن من «إعدادات النظام».</span>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap max-h-40 overflow-y-auto p-1.5 bg-white rounded-xl border border-slate-200">
                                {settings.ceremony_sheikhs.map((sheikhName) => {
                                  const isSelected = ceremonyDetails.attendingSheikhs.includes(sheikhName);
                                  return (
                                    <button
                                      key={sheikhName}
                                      type="button"
                                      disabled={!canFinalize}
                                      onClick={() => {
                                        if (isSelected) {
                                          saveCeremony({
                                            ...ceremonyDetails,
                                            attendingSheikhs: ceremonyDetails.attendingSheikhs.filter((s) => s !== sheikhName),
                                          });
                                        } else {
                                          saveCeremony({
                                            ...ceremonyDetails,
                                            attendingSheikhs: [...ceremonyDetails.attendingSheikhs, sheikhName],
                                          });
                                        }
                                      }}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                        isSelected
                                          ? 'bg-brand text-white shadow-2xs'
                                          : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 border border-slate-200'
                                      }`}
                                    >
                                      <span>{isSelected ? '✓' : '+'}</span>
                                      <span>{sheikhName}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Added Sheikhs chips */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {ceremonyDetails.attendingSheikhs.map((sheikh, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs"
                                >
                                  <span>{sheikh}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSheikh(idx)}
                                    className="w-4 h-4 rounded-full hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center cursor-pointer text-slate-400"
                                    title="حذف الشيخ"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>

                            {/* Input + Button to add custom sheikh */}
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                type="text"
                                value={newSheikhInput}
                                onChange={(e) => setNewSheikhInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddSheikh();
                                  }
                                }}
                                placeholder="أو اكتب اسم شيخ إضافي غير موجود بالقائمة..."
                                className="flex-1 bg-white border border-line rounded-xl px-3 py-1.5 text-xs outline-none focus:border-brand font-semibold"
                              />
                              <button
                                type="button"
                                onClick={handleAddSheikh}
                                disabled={!canFinalize}
                                className="px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              >
                                <span className="material-symbols-outlined text-sm">add</span>
                                <span>+ إضافة شيخ</span>
                              </button>
                            </div>
                          </div>

                          {/* 4. مكان الحفل وملاحظات */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <label className="block font-bold text-ink mb-1">
                                📍 مكان إقامة الحفل:
                              </label>
                              <input
                                type="text"
                                placeholder="مثال: القاعة الكبرى - مسجد الإمام البخاري..."
                                value={ceremonyDetails.ceremonyPlace || ''}
                                disabled={!canFinalize}
                                onChange={(e) => editCeremony({ ...ceremonyDetails, ceremonyPlace: e.target.value })}
                                onBlur={() => saveCeremony(ceremonyDetails)}
                                className="w-full bg-white border border-line rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-amber-600"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-ink mb-1">
                                📝 ملاحظات وترتيبات وتجهيزات:
                              </label>
                              <input
                                type="text"
                                placeholder="مثال: تجهيز أجهزة الصوت والدروع وشهادات التقدير..."
                                value={ceremonyDetails.notes || ''}
                                disabled={!canFinalize}
                                onChange={(e) => editCeremony({ ...ceremonyDetails, notes: e.target.value })}
                                onBlur={() => saveCeremony(ceremonyDetails)}
                                className="w-full bg-white border border-line rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-amber-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // SPECIAL STAGE: SHEET (كتابة كشف الدرجات واستيراد ملف الإكسيل)
                if (stageItem.key === 'sheet') {
                  return (
                    <div
                      key={stageItem.key}
                      className={`rounded-2xl border-2 transition-all overflow-hidden ${
                        isCompleted
                          ? 'border-purple-300 bg-purple-50/20 shadow-xs'
                          : 'border-purple-200 bg-purple-50/10 shadow-xs'
                      }`}
                    >
                      {/* Hidden Excel / CSV file input */}
                      <input
                        ref={sheetFileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={handleSheetExcelUpload}
                      />

                      {/* Header */}
                      <div className="p-4 bg-gradient-to-l from-purple-100/70 to-purple-50/40 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl shrink-0">🟣</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-purple-950">
                                مرحلة كتابة كشف الدرجات الرسمي والمسودة
                              </span>
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-purple-100 text-purple-800 border-purple-200'
                                }`}
                              >
                                {isCompleted ? '✓ تم اعتماد الكشف' : 'قيد كتابة / استيراد الكشف'}
                              </span>
                            </div>

                            <div className="text-xs text-purple-900/80 mt-1 flex items-center gap-2 flex-wrap">
                              {stageData?.notes && (
                                <span className="font-semibold text-purple-950 bg-white/70 px-2 py-0.5 rounded-md border border-purple-200">
                                  {stageData.notes}
                                </span>
                              )}
                              {stageData?.completedAt && (
                                <span className="flex items-center gap-1 text-purple-800">
                                  <span className="material-symbols-outlined text-xs">schedule</span>
                                  <span>تاريخ الإتمام: {formatWhen(stageData.completedAt)}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Controls: Quick Export, Quick Import, Toggle, Expand */}
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          {/* Quick Export Button */}
                          <button
                            type="button"
                            onClick={handleExportCommitteeSheet}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
                            title="تصدير كشف درجات الطلاب واللجنة إلى ملف Excel (.xlsx)"
                          >
                            <span className="material-symbols-outlined text-sm">file_download</span>
                            <span>تصدير كشف Excel</span>
                          </button>

                          {/* Quick Import Button */}
                          <button
                            type="button"
                            onClick={() => sheetFileInputRef.current?.click()}
                            disabled={!canStage('sheet') || pending}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-800 hover:bg-purple-900 text-white flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                            title="استيراد كشف درجات الطلاب من ملف Excel أو CSV"
                          >
                            <span className="material-symbols-outlined text-sm">upload_file</span>
                            <span>استيراد كشف Excel</span>
                          </button>

                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!isCompleted}
                              disabled={!canStage('sheet') || pending}
                              aria-label="كتابة الكشف"
                              onChange={() => handleToggleStage('sheet')}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-700"></div>
                          </label>

                          <button
                            type="button"
                            onClick={() => setIsSheetExpanded(!isSheetExpanded)}
                            className="p-1.5 text-purple-900 hover:bg-purple-200/50 rounded-lg cursor-pointer"
                            title="عرض / إخفاء تفاصيل الكشف والطلاب"
                          >
                            <span className="material-symbols-outlined text-lg">
                              {isSheetExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Sheet Details: Actions, Template, Preview Table */}
                      {isSheetExpanded && (
                        <div className="p-4 space-y-4 border-t border-purple-200/70 bg-white">
                          {/* Action Toolbar */}
                          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-purple-50/50 border border-purple-200/60">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => sheetFileInputRef.current?.click()}
                                disabled={!canStage('sheet') || pending}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#004d47] hover:bg-brand text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                              >
                                <span className="material-symbols-outlined text-base">table_view</span>
                                <span>اختر ملف إكسيل لاستيراده (.xlsx / .csv)</span>
                              </button>

                              <button
                                type="button"
                                onClick={handleDownloadSheetTemplate}
                                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-purple-50 text-purple-900 border border-purple-300 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              >
                                <span className="material-symbols-outlined text-sm">download</span>
                                <span>تنزيل نموذج إكسيل فارغ للكشف</span>
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={handleExportCommitteeSheet}
                              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                            >
                              <span className="material-symbols-outlined text-sm">file_download</span>
                              <span>تصدير هذا الكشف إلى Excel</span>
                            </button>
                          </div>

                          {/* Preview of Imported Students */}
                          {sheetStudents.length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-sm text-purple-700">groups</span>
                                  <span>كشف درجات الطلاب المستورد من الإكسيل ({sheetStudents.length} طالب):</span>
                                </span>
                                {sheetFileName && (
                                  <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    {sheetFileName}
                                  </span>
                                )}
                              </div>

                              <div className="max-h-60 overflow-y-auto border border-purple-200/80 rounded-xl overflow-hidden shadow-2xs">
                                <table className="w-full text-right text-xs">
                                  <thead className="bg-purple-100/70 text-purple-950 font-bold border-b border-purple-200">
                                    <tr>
                                      <th className="p-2 w-12 text-center">م</th>
                                      <th className="p-2">اسم الطالب</th>
                                      <th className="p-2 w-24 text-center">الدرجة</th>
                                      <th className="p-2 w-28 text-center">التقدير</th>
                                      <th className="p-2">ملاحظات</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-purple-100 bg-white">
                                    {sheetStudents.map((s, idx) => (
                                      <tr key={idx} className="hover:bg-purple-50/40">
                                        <td className="p-2 text-center font-mono font-bold text-slate-600">{s.number}</td>
                                        <td className="p-2 font-bold text-slate-900">{s.name}</td>
                                        <td className="p-2 text-center font-mono font-bold text-brand">{s.score}</td>
                                        <td className="p-2 text-center font-semibold text-slate-700">{s.grade || '—'}</td>
                                        <td className="p-2 text-slate-500">{s.notes || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 rounded-xl border border-dashed border-purple-300 bg-purple-50/30 text-center space-y-1.5">
                              <span className="material-symbols-outlined text-2xl text-purple-600 block mx-auto">
                                upload_file
                              </span>
                              <p className="text-xs font-bold text-purple-950">
                                يمكنك استيراد كشف درجات الطلاب واللجنة مباشرة من ملف إكسيل أو CSV
                              </p>
                              <p className="text-xs text-purple-800/80">
                                يتعرف النظام تلقائياً على أعمدة: (اسم الطالب، الدرجة، التقدير، الملاحظات) ويحدث حالة كتابة الكشف وعدد الطلاب تلقائياً.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                // STANDARD STAGES (التسجيل، الامتحان، المراجعة، الإعلان)
                return (
                  <div
                    key={stageItem.key}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                      isCompleted
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-white border-line/40 hover:bg-canvas'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl shrink-0">{stageItem.emoji}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold text-xs ${
                              isCompleted ? 'text-emerald-900' : 'text-ink'
                            }`}
                          >
                            {stageItem.label}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {isCompleted ? 'تمت' : 'لم يتم'}
                          </span>
                        </div>

                        {/* Helper descriptions for review, sheet, and accreditation */}
                        {stageItem.key === 'review' && (
                          <span className="text-xs text-muted block mt-0.5">
                            مراجعة وتدقيق الدرجات (قبل كتابة الكشف)
                          </span>
                        )}
                        {stageItem.key === 'accreditation' && (
                          <span className="text-xs text-emerald-700 font-semibold block mt-0.5">
                            الاعتمادية الرسمية وتوقيع النتيجة بعد كتابة الكشف
                          </span>
                        )}

                        {/* Exact timestamp if completed */}
                        {isCompleted && stageData?.completedAt && (
                          <div className="flex items-center gap-1 text-xs text-emerald-700 mt-0.5">
                            <span className="material-symbols-outlined text-xs">schedule</span>
                            <span>تاريخ الإتمام: {formatWhen(stageData.completedAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!isCompleted}
                          disabled={!canStage(stageItem.key) || pending}
                          aria-label={stageItem.label}
                          onChange={() => handleToggleStage(stageItem.key)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <CommitteeHistory committeeId={committee.id} />

          {/* Section: Sheikh, Students & Committee Type Edit */}
          {canEditBase && (
            <div ref={editSectionRef} id="committee-edit-section" className={`bg-canvas p-4 rounded-xl border space-y-3 scroll-mt-4 ${startInEdit ? 'border-brand ring-2 ring-brand/20' : 'border-line/40'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">edit</span>
                  <span>تعديل بيانات اللجنة (كما أُدخلت عند الإضافة):</span>
                </span>
                <span className="text-xs text-muted">
                  (اضغط حفظ بالأسفل لاعتماد التعديلات)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <label className="block">
                  <span className="block text-xs font-bold text-ink mb-1">رقم اللجنة</span>
                  <input
                    type="number" min={1} value={committeeNumber} aria-label="رقم اللجنة"
                    onChange={(e) => setCommitteeNumber(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono outline-none focus:border-brand"
                  />
                </label>
                <label className="block sm:col-span-1 lg:col-span-3">
                  <span className="block text-xs font-bold text-ink mb-1">اسم اللجنة</span>
                  <input
                    type="text" value={committeeName} aria-label="اسم اللجنة"
                    onChange={(e) => setCommitteeName(e.target.value)}
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-xs font-bold text-ink mb-1">الكتاب المقرر / المسابقة</span>
                  <input
                    type="text" value={competitionBook} aria-label="الكتاب المقرر"
                    onChange={(e) => setCompetitionBook(e.target.value)}
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-ink mb-1">الفرع</span>
                  <input
                    type="text" value={branch} aria-label="الفرع"
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-ink mb-1">ميعاد امتحان اللجنة</span>
                  <input
                    type="date" value={examDate} aria-label="ميعاد امتحان اللجنة"
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-brand"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-ink mb-1">الجمعية (اختياري)</span>
                  <input
                    type="text" value={associationName} aria-label="الجمعية"
                    onChange={(e) => setAssociationName(e.target.value)}
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    عدد الطلاب في اللجنة
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={studentsCount}
                    onChange={(e) =>
                      setStudentsCount(e.target.value === '' ? '' : parseInt(e.target.value) || 0)
                    }
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono outline-none focus:border-brand"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-1.5 rounded-lg border border-line bg-white hover:bg-gray-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isWomenCommittee}
                      onChange={(e) => setIsWomenCommittee(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-700 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-ink flex items-center gap-1">
                      <span>🧕</span>
                      <span>لجنة نسائية (اختياري)</span>
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    اسم الشيخ المرسل إليه
                  </label>
                  <input
                    type="text"
                    value={sheikhName}
                    onChange={(e) => setSheikhName(e.target.value)}
                    placeholder=""
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    رقم هاتف الشيخ
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={sheikhPhone}
                    onChange={(e) => setSheikhPhone(e.target.value)}
                    placeholder=""
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-brand text-right"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-xs font-bold text-ink mb-1">
                    مكان الشيخ (المسجد / القاعة / البلد)
                  </label>
                  <input
                    type="text"
                    value={sheikhCountry}
                    onChange={(e) => setSheikhCountry(e.target.value)}
                    placeholder=""
                    className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                </div>
              </div>

              {/* Committee Members / Exam Observers Section */}
              <div className="pt-3 border-t border-line/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-ink flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-brand">groups</span>
                    <span>أعضاء اللجنة (مراقبي الامتحانات):</span>
                  </label>
                  <span className="text-xs font-bold text-slate-500 font-mono">
                    ({members.length}) أعضاء محددين
                  </span>
                </div>

                {/* Preset Chips Box */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    اختر من أعضاء ومراقبي الامتحانات (انقر للاختيار أو الإلغاء):
                  </span>
                  {settings.observers.length === 0 && (
                    <span className="text-[11px] text-slate-500 block">لا توجد أسماء مقترحة بعد؛ يضيفها الأدمن من «إعدادات النظام».</span>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap max-h-36 overflow-y-auto p-2 bg-white rounded-xl border border-line/50">
                    {settings.observers.map((name) => {
                      const isAdded = members.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            if (isAdded) {
                              setMembers(members.filter((m) => m !== name));
                            } else {
                              setMembers([...members, name]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            isAdded
                              ? 'bg-brand text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 border border-slate-200'
                          }`}
                        >
                          <span>{isAdded ? '✓' : '+'}</span>
                          <span>{name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Members Chips */}
                {members.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {members.map((member, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs"
                      >
                        <span>{member}</span>
                        <button
                          type="button"
                          onClick={() => setMembers(members.filter((_, i) => i !== idx))}
                          className="w-4 h-4 rounded-full hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center cursor-pointer text-slate-400"
                          title="حذف العضو"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Add Custom Member Field */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newMemberInput}
                    onChange={(e) => setNewMemberInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const trimmed = newMemberInput.trim();
                        if (trimmed && !members.includes(trimmed)) {
                          setMembers([...members, trimmed]);
                          setNewMemberInput('');
                        }
                      }
                    }}
                    placeholder="أو اكتب اسم عضو إضافي غير موجود بالقائمة..."
                    className="flex-1 bg-white border border-line rounded-xl px-3 py-1.5 text-xs outline-none focus:border-brand font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = newMemberInput.trim();
                      if (trimmed && !members.includes(trimmed)) {
                        setMembers([...members, trimmed]);
                        setNewMemberInput('');
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    <span>+ إضافة عضو</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section: General Notes for the Committee */}
          <div className="bg-canvas p-4 rounded-xl border border-line/40 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-ink">
                الملاحظات العامة على اللجنة
              </label>
              <span className="text-xs text-muted">
                {canEditBase ? '(تُحفظ بزر الحفظ بالأسفل)' : '(للاطلاع فقط)'}
              </span>
            </div>
            <textarea
              rows={3}
              value={generalNotes}
              readOnly={!canEditBase}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder=""
              className="w-full bg-white border border-line rounded-xl p-3 text-xs text-ink outline-none focus:border-brand leading-relaxed"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-canvas border-t border-line/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isSavedToast && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full flex items-center gap-1 animate-in fade-in">
                <span className="material-symbols-outlined text-sm">check</span>
                تم الحفظ على الخادم
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label="إغلاق"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-soft border border-line hover:bg-white cursor-pointer"
            >
              إغلاق
            </button>

            {canSaveAnything && (
              <button
                onClick={handleSave}
                disabled={pending}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-brand hover:bg-success shadow-xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-sm">save</span>
                <span>{pending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
