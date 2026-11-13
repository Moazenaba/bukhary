import { Committee, StageKey, StageMeta, STAGES_LIST } from '../types';

export const getStageMeta = (key: StageKey): StageMeta => {
  return STAGES_LIST.find((s) => s.key === key) || STAGES_LIST[0];
};

/**
 * The committee's state = the last stage it really completed, so every label tells the truth:
 * «في انتظار الامتحان» (only registered), «تم الامتحان», «تم التصحيح», … «تم الحفل». Each state has
 * its own key, so «تم الامتحان» and «تم التصحيح» are separate filters. (Stages are always
 * completed in order on the server, so the last completed stage is unambiguous.)
 */
export const calculateCurrentStage = (
  stages: Committee['stages']
): { key: StageKey; label: string; emoji: string; badgeClass: string; dotColor: string } => {
  let meta = STAGES_LIST[0];
  for (const s of STAGES_LIST) if (stages?.[s.key]?.completed) meta = s;
  return { key: meta.key, label: meta.activeLabel, emoji: meta.emoji, badgeClass: meta.badgeClass, dotColor: meta.dotColor };
};

/** Committees still waiting for their exam (nothing after registration done). */
export const isAwaitingExam = (stages: Committee['stages']) => calculateCurrentStage(stages).key === 'registration';

/**
 * Returns a formatted Arabic date & time string: "2026/09/25 - 10:30 ص"
 */
/** A date as YYYY-MM-DD in the user's local time zone. (toISOString() would use UTC and be off by a day around midnight.) */
export const todayISO = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
