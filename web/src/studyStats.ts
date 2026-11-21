export type StudyQuestionMeta = {
  id: string;
  label: string;
  question: string;
  correctAnswers: string[];
  order: number;
};

export type StudyQuestionStat = StudyQuestionMeta & {
  correctCount: number;
  wrongCount: number;
  firstAttemptCorrect: boolean | null;
  wrongPicks: string[];
  mastered: boolean;
};

export type StudyStatsMap = Record<string, StudyQuestionStat>;

export type StudySessionSummary = {
  totalQuestions: number;
  answeredQuestions: number;
  masteredCount: number;
  firstTryCorrectCount: number;
  everWrongCount: number;
  totalCorrectAttempts: number;
  totalWrongAttempts: number;
  accuracyPercent: number;
  wrongQuestions: StudyQuestionStat[];
};

export function createInitialStudyStats(items: StudyQuestionMeta[]): StudyStatsMap {
  const map: StudyStatsMap = {};
  for (const item of items) {
    map[item.id] = {
      ...item,
      correctCount: 0,
      wrongCount: 0,
      firstAttemptCorrect: null,
      wrongPicks: [],
      mastered: false,
    };
  }
  return map;
}

export function recordStudyAttemptInMap(
  prev: StudyStatsMap,
  meta: StudyQuestionMeta,
  isCorrect: boolean,
  pickedLabel?: string
): StudyStatsMap {
  const existing: StudyQuestionStat = prev[meta.id] ?? {
    ...meta,
    correctCount: 0,
    wrongCount: 0,
    firstAttemptCorrect: null,
    wrongPicks: [],
    mastered: false,
  };

  const firstAttemptCorrect =
    existing.firstAttemptCorrect === null ? isCorrect : existing.firstAttemptCorrect;

  const nextWrongPicks =
    !isCorrect && pickedLabel
      ? [...existing.wrongPicks, pickedLabel]
      : existing.wrongPicks;

  return {
    ...prev,
    [meta.id]: {
      ...existing,
      correctCount: existing.correctCount + (isCorrect ? 1 : 0),
      wrongCount: existing.wrongCount + (isCorrect ? 0 : 1),
      firstAttemptCorrect,
      wrongPicks: nextWrongPicks,
      mastered: isCorrect,
    },
  };
}

export function computeStudySummary(
  statsMap: StudyStatsMap,
  totalQuestionsOverride?: number
): StudySessionSummary {
  const list = Object.values(statsMap);
  const totalQuestions =
    totalQuestionsOverride !== undefined ? totalQuestionsOverride : list.length;

  let answeredQuestions = 0;
  let masteredCount = 0;
  let firstTryCorrectCount = 0;
  let everWrongCount = 0;
  let totalCorrectAttempts = 0;
  let totalWrongAttempts = 0;

  for (const s of list) {
    if (s.firstAttemptCorrect !== null) answeredQuestions++;
    if (s.mastered) masteredCount++;
    if (s.firstAttemptCorrect === true) firstTryCorrectCount++;
    if (s.wrongCount > 0) everWrongCount++;
    totalCorrectAttempts += s.correctCount;
    totalWrongAttempts += s.wrongCount;
  }

  const totalAttempts = totalCorrectAttempts + totalWrongAttempts;
  const accuracyPercent =
    totalAttempts > 0 ? Math.round((totalCorrectAttempts / totalAttempts) * 100) : 100;

  const wrongQuestions = list
    .filter((s) => s.wrongCount > 0)
    .sort((a, b) => {
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      return a.order - b.order;
    });

  return {
    totalQuestions,
    answeredQuestions,
    masteredCount,
    firstTryCorrectCount,
    everWrongCount,
    totalCorrectAttempts,
    totalWrongAttempts,
    accuracyPercent,
    wrongQuestions,
  };
}
