import { Committee, StageKey, StageMeta, STAGES_LIST } from '../types';

export const getStageMeta = (key: StageKey): StageMeta => {
  return STAGES_LIST.find((s) => s.key === key) || STAGES_LIST[0];
};

/**
 * Calculates current active status of a committee based on its completed stages
 */
export const calculateCurrentStage = (
  stages: Committee['stages']
): { key: StageKey; label: string; emoji: string; badgeClass: string; dotColor: string } => {
  if (stages.ceremony?.completed) {
    return {
      key: 'ceremony',
      label: 'تم الحفل',
      emoji: '🟢',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold',
      dotColor: 'bg-emerald-500',
    };
  }

  if (stages.announcement?.completed) {
    return {
      key: 'announcement',
      label: 'إعلان النتيجة',
      emoji: '📢',
      badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-300 font-semibold',
      dotColor: 'bg-cyan-500',
    };
  }

  if (stages.accreditation?.completed) {
    return {
      key: 'accreditation',
      label: 'الاعتمادية',
      emoji: '📜',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
      dotColor: 'bg-emerald-600',
    };
  }

  if (stages.sheet?.completed) {
    return {
      key: 'sheet',
      label: 'كتابة الكشف',
      emoji: '🟣',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-300 font-semibold',
      dotColor: 'bg-purple-500',
    };
  }

  if (stages.review?.completed) {
    return {
      key: 'review',
      label: 'في المراجعة والتدقيق',
      emoji: '🟡',
      badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-300 font-semibold',
      dotColor: 'bg-yellow-500',
    };
  }

  if (stages.aggregation?.completed) {
    return {
      key: 'aggregation',
      label: 'في التجميع',
      emoji: '🔵',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-300 font-semibold',
      dotColor: 'bg-indigo-500',
    };
  }

  if (stages.scoring?.completed) {
    return {
      key: 'scoring',
      label: 'في التصحيح',
      emoji: '🟠',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-300 font-semibold',
      dotColor: 'bg-amber-500',
    };
  }

  if (stages.exam?.completed) {
    return {
      key: 'scoring',
      label: 'في التصحيح',
      emoji: '🟠',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-300 font-semibold',
      dotColor: 'bg-amber-500',
    };
  }

  // If exam has not completed yet
  return {
    key: 'exam',
    label: 'جاري الامتحان الآن',
    emoji: '🟦',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-300 font-semibold',
    dotColor: 'bg-blue-500',
  };
};

/**
 * Returns a formatted Arabic date & time string: "2026/09/25 - 10:30 ص"
 */
/** A date as YYYY-MM-DD in the user's local time zone. (toISOString() would use UTC and be off by a day around midnight.) */
export const todayISO = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const getCurrentFormattedDateTime = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12 || 12;

  return `${year}/${month}/${day} - ${hours}:${minutes} ${ampm}`;
};

export const createDefaultQuestions = (count = 5): import('../types').QuestionScoringItem[] => {
  const arabicNumbers = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
  return Array.from({ length: count }, (_, i) => ({
    id: `q-${i + 1}`,
    questionNumber: i + 1,
    label: `السؤال ${arabicNumbers[i] || i + 1}`,
    completed: false,
    scorers: [],
  }));
};

export const createDefaultScoringDetails = (
  scorerName = '',
  reviewerName = '',
  questionCount = 5
): import('../types').ScoringStageDetails => ({
  scorerName,
  scoringReviewerName: reviewerName,
  questions: createDefaultQuestions(questionCount),
});

export const createDefaultAggregationDetails = (
  aggregatorName = '',
  scoringReviewer = '',
  aggregationReviewer = ''
): import('../types').AggregationStageDetails => ({
  aggregatorName,
  scoringReviewerName: scoringReviewer,
  aggregationReviewerName: aggregationReviewer,
  reviewConfirmed: false,
});

export const getScoringProgress = (details?: import('../types').ScoringStageDetails) => {
  if (!details || !details.questions || details.questions.length === 0) {
    return { total: 0, completed: 0, percentage: 0 };
  }
  const total = details.questions.length;
  const completed = details.questions.filter((q) => q.completed).length;
  const percentage = Math.round((completed / total) * 100);
  return { total, completed, percentage };
};
