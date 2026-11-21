import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { setsEqual } from "./parseQuiz";
import type { SimilarSlide } from "./similarQuestions";
import { StudyLiveBar, StudySummaryScreen } from "./StudySummaryView";
import {
  computeStudySummary,
  createInitialStudyStats,
  recordStudyAttemptInMap,
  type StudyQuestionMeta,
  type StudyStatsMap,
} from "./studyStats";

const SIMILAR_BATCH_SIZE = 5;
const AUTO_NEXT_DELAY_MS = 4000;

type Props = {
  slides: SimilarSlide[];
  onBack: () => void;
};

function userPickToSet(pick: string[] | undefined): Set<string> {
  return new Set((pick ?? []).map((x) => x.toUpperCase()));
}

function buildSimilarMeta(slide: SimilarSlide, order: number): StudyQuestionMeta {
  const it = slide.item;
  const correctAnswers = [...it.answer]
    .sort()
    .map((k) => {
      const optText = it.options.find(([opt]) => opt === k)?.[1] ?? "";
      return optText ? `${k}. ${optText}` : k;
    });
  return {
    id: it.id,
    label: `[${it.sourceExam}] Q${it.qNum}`,
    question: it.question,
    correctAnswers,
    order,
  };
}

export function SimilarQuizPanel({ slides, onBack }: Props) {
  const [studyRound, setStudyRound] = useState(1);
  const [deckSlides, setDeckSlides] = useState<SimilarSlide[]>([]);
  const [roundSlides, setRoundSlides] = useState<SimilarSlide[]>([]);
  const [queue, setQueue] = useState<SimilarSlide[]>([]);
  const [wrongInLastRound, setWrongInLastRound] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string[]>>({});
  const userAnswersRef = useRef(userAnswers);
  userAnswersRef.current = userAnswers;
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const [studyStats, setStudyStats] = useState<StudyStatsMap>({});
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(completed);
  completedRef.current = completed;
  const recordedInRoundRef = useRef<Record<string, boolean>>({});
  const metaMapRef = useRef<Record<string, StudyQuestionMeta>>({});
  const [autoNextKey, setAutoNextKey] = useState<number | null>(null);

  const roundRef = useRef(roundSlides);
  roundRef.current = roundSlides;
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const initSession = useCallback((targetSlides: SimilarSlide[]) => {
    const metas = targetSlides.map((s, idx) => buildSimilarMeta(s, idx));
    const map: Record<string, StudyQuestionMeta> = {};
    for (const m of metas) map[m.id] = m;
    metaMapRef.current = map;
    const first = targetSlides.slice(0, SIMILAR_BATCH_SIZE);
    const rest = targetSlides.slice(first.length);
    setDeckSlides(targetSlides);
    setRoundSlides(first);
    setQueue(rest);
    setStudyRound(1);
    setWrongInLastRound(0);
    setCurrentIdx(0);
    setUserAnswers({});
    setLocked({});
    setStudyStats(createInitialStudyStats(metas));
    setCompleted(false);
    completedRef.current = false;
    recordedInRoundRef.current = {};
    setAutoNextKey(null);
  }, []);

  const deckSigRef = useRef("");
  useLayoutEffect(() => {
    const sig = slides.map((s) => s.item.id).join("|");
    if (!sig || sig === deckSigRef.current) return;
    deckSigRef.current = sig;
    initSession(slides);
  }, [slides, initSession]);

  const recordAttempt = useCallback((s: SimilarSlide, pickedLetters: string[]) => {
    const id = s.item.id;
    if (recordedInRoundRef.current[id]) return;
    recordedInRoundRef.current[id] = true;
    const user = userPickToSet(pickedLetters);
    const isCorrect = setsEqual(user, s.item.answer);
    const pickedLabel =
      pickedLetters.length > 0 ? [...pickedLetters].sort().join(", ") : "(bỏ trống)";
    const meta = metaMapRef.current[id] ?? buildSimilarMeta(s, 0);
    setStudyStats((prev) => recordStudyAttemptInMap(prev, meta, isCorrect, pickedLabel));
  }, []);

  const slide = roundSlides[currentIdx];
  const item = slide?.item;
  const currentCorrectSet = item?.answer ?? new Set<string>();
  const currentUserSet = item ? userPickToSet(userAnswers[item.id]) : new Set<string>();
  const isLocked = item ? !!locked[item.id] : false;
  const showFeedback = item ? isLocked : false;
  const answeredCorrectly = item ? setsEqual(currentUserSet, currentCorrectSet) : false;

  const submitSimilarRound = useCallback(() => {
    if (completedRef.current) return;
    const round = roundRef.current;
    const qrest = queueRef.current;
    if (!round.length) return;

    const wrongSlides: SimilarSlide[] = [];
    for (const s of round) {
      const picked = userAnswersRef.current[s.item.id] ?? [];
      if (!recordedInRoundRef.current[s.item.id]) {
        recordAttempt(s, picked);
      }
      const user = userPickToSet(picked);
      if (!setsEqual(user, s.item.answer)) wrongSlides.push(s);
    }
    setWrongInLastRound(wrongSlides.length);

    const nextQueue = [...wrongSlides, ...qrest];
    const finishedAll = nextQueue.length === 0;
    if (finishedAll) {
      setAutoNextKey(null);
      setCompleted(true);
      completedRef.current = true;
      return;
    }

    const nextRound = nextQueue.slice(0, SIMILAR_BATCH_SIZE);
    const rest = nextQueue.slice(nextRound.length);
    recordedInRoundRef.current = {};
    setStudyRound((r) => r + 1);
    setRoundSlides(nextRound);
    setQueue(rest);
    setCurrentIdx(0);
    setLocked({});
    setAutoNextKey(null);
    setUserAnswers((prev) => {
      const copied = { ...prev };
      for (const s of nextRound) delete copied[s.item.id];
      return copied;
    });
  }, [recordAttempt]);

  const restartSession = useCallback(() => {
    initSession(slides);
  }, [slides, initSession]);

  const saveSingle = useCallback(
    (letter: string) => {
      const curSlide = roundSlides[currentIdx];
      const it = curSlide?.item;
      if (!curSlide || !it || lockedRef.current[it.id]) return;
      const picked = letter ? [letter.toUpperCase()] : [];
      setUserAnswers((prev) => ({
        ...prev,
        [it.id]: picked,
      }));
      setLocked((prev) => ({ ...prev, [it.id]: true }));
      recordAttempt(curSlide, picked);
      setAutoNextKey(Date.now());
    },
    [roundSlides, currentIdx, recordAttempt]
  );

  const toggleMulti = useCallback(
    (letter: string) => {
      const curSlide = roundSlides[currentIdx];
      const it = curSlide?.item;
      if (!curSlide || !it || lockedRef.current[it.id]) return;
      const upper = letter.toUpperCase();
      const chooseCount = it.chooseCount ?? 1;
      const cur = new Set(userAnswersRef.current[it.id] ?? []);
      if (cur.has(upper)) cur.delete(upper);
      else cur.add(upper);
      const nextList = [...cur].sort();
      setUserAnswers((prev) => ({ ...prev, [it.id]: nextList }));
      if (cur.size >= chooseCount) {
        setLocked((lk) => ({ ...lk, [it.id]: true }));
        recordAttempt(curSlide, nextList);
        setAutoNextKey(Date.now());
      } else {
        setAutoNextKey(null);
      }
    },
    [roundSlides, currentIdx, recordAttempt]
  );

  const goPrev = () => {
    setAutoNextKey(null);
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  };

  const goNext = useCallback(() => {
    setAutoNextKey(null);
    if (currentIdx >= roundSlides.length - 1) {
      submitSimilarRound();
      return;
    }
    setCurrentIdx((i) => i + 1);
  }, [currentIdx, roundSlides.length, submitSimilarRound]);

  useEffect(() => {
    if (autoNextKey === null || completed) return;
    const timer = window.setTimeout(() => {
      goNext();
    }, AUTO_NEXT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoNextKey, completed, goNext]);

  useEffect(() => {
    if (!roundSlides.length || completed) return;
    const maxIdx = roundSlides.length - 1;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setAutoNextKey(null);
        setCurrentIdx((i) => (i > 0 ? i - 1 : i));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setAutoNextKey(null);
        setCurrentIdx((i) => {
          if (i >= maxIdx) {
            submitSimilarRound();
            return i;
          }
          return i + 1;
        });
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setAutoNextKey(null);
        submitSimilarRound();
      }
      const char = (e.key.length === 1 ? e.key : "").toUpperCase();
      if (char >= "A" && char <= "F") {
        const it = roundSlides[currentIdx]?.item;
        if (!it || lockedRef.current[it.id]) return;
        const valid = new Set(it.options.map(([k]) => k));
        if (!valid.has(char)) return;
        e.preventDefault();
        if (it.chooseCount === 1) saveSingle(char);
        else toggleMulti(char);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roundSlides, completed, currentIdx, submitSimilarRound, saveSingle, toggleMulti]);

  const summary = useMemo(
    () => computeStudySummary(studyStats, deckSlides.length || slides.length),
    [studyStats, deckSlides.length, slides.length]
  );

  const retryWrongSlides = useCallback(() => {
    const slideById = new Map(slides.map((s) => [s.item.id, s] as const));
    const wrongSlides = summary.wrongQuestions
      .map((w) => slideById.get(w.id))
      .filter((s): s is SimilarSlide => Boolean(s));
    if (!wrongSlides.length) return;
    initSession(wrongSlides);
  }, [slides, summary.wrongQuestions, initSession]);

  if (completed) {
    return (
      <StudySummaryScreen
        examTitle="Ôn câu tương tự · Nhiều bộ đề"
        totalRounds={studyRound}
        summary={summary}
        backLabel="← Chọn chế độ khác"
        onBack={onBack}
        onRestartAll={restartSession}
        onRetryWrong={retryWrongSlides}
      />
    );
  }

  if (!item || !slide || !roundSlides.length) return null;

  return (
    <div className="quiz-panel">
      <div className="back-link quiz-back">
        <button type="button" onClick={onBack}>
          ← Chọn chế độ khác
        </button>
      </div>
      <div className="quiz-header-row">
        <span className="quiz-badge">
          Học lượt {studyRound} · Câu {currentIdx + 1}/{roundSlides.length} · Nhóm {slide.groupIndex} ({slide.indexInGroup}/
          {slide.groupSize}) · [{item.sourceExam}] Q{item.qNum}
        </span>
        <span className="quiz-percent">
          {Math.round(((currentIdx + 1) / Math.max(1, roundSlides.length)) * 100)}% lượt này
        </span>
      </div>
      <StudyLiveBar
        summary={summary}
        wrongInLastRound={wrongInLastRound}
        queueLength={queue.length}
        studyRound={studyRound}
      />
      <p className="question-title">{item.question}</p>
      <p className="choose-hint">
        {item.chooseCount === 1 ? "Chọn 1 đáp án" : `Chọn ${item.chooseCount} đáp án`}
      </p>
      <div className="options-list">
        {item.chooseCount === 1
          ? item.options.map(([key, text]) => (
              <label
                key={key}
                className={`option-card${
                  isLocked && (userAnswers[item.id] ?? []).includes(key)
                    ? currentCorrectSet.has(key)
                      ? " option-card--correct"
                      : " option-card--wrong"
                    : ""
                }`}
                htmlFor={`sim-opt-${item.id}-${key}`}
              >
                <input
                  type="radio"
                  className="option-input"
                  name={`sim-${item.id}`}
                  id={`sim-opt-${item.id}-${key}`}
                  checked={(userAnswers[item.id]?.[0] ?? "") === key}
                  disabled={isLocked}
                  onChange={() => saveSingle(key)}
                />
                <span className="option-radio-faux" aria-hidden />
                <span className="option-label-text">
                  {key}. {text}
                </span>
                {isLocked &&
                  (userAnswers[item.id] ?? []).includes(key) &&
                  (currentCorrectSet.has(key) ? (
                    <span className="option-chip option-chip--ok">Đúng</span>
                  ) : (
                    <span className="option-chip option-chip--bad">Sai</span>
                  ))}
              </label>
            ))
          : item.options.map(([key, text]) => (
              <label
                key={key}
                className={`option-card${
                  isLocked && (userAnswers[item.id] ?? []).includes(key)
                    ? currentCorrectSet.has(key)
                      ? " option-card--correct"
                      : " option-card--wrong"
                    : ""
                }`}
                htmlFor={`sim-cb-${item.id}-${key}`}
              >
                <input
                  type="checkbox"
                  className="option-input"
                  id={`sim-cb-${item.id}-${key}`}
                  checked={(userAnswers[item.id] ?? []).includes(key)}
                  disabled={isLocked}
                  onChange={() => toggleMulti(key)}
                />
                <span className="option-check-faux" aria-hidden />
                <span className="option-label-text">
                  {key}. {text}
                </span>
                {isLocked &&
                  (userAnswers[item.id] ?? []).includes(key) &&
                  (currentCorrectSet.has(key) ? (
                    <span className="option-chip option-chip--ok">Đúng</span>
                  ) : (
                    <span className="option-chip option-chip--bad">Sai</span>
                  ))}
              </label>
            ))}
      </div>
      {showFeedback && (
        <div className={answeredCorrectly ? "study-feedback study-feedback--ok" : "study-feedback study-feedback--bad"}>
          {answeredCorrectly ? (
            <span>Đúng rồi. Chuyển câu tiếp theo nhé.</span>
          ) : (
            <span>
              Sai. Đáp án đúng:{" "}
              {[...currentCorrectSet]
                .sort()
                .map((k) => `${k}. ${item.options.find(([opt]) => opt === k)?.[1] ?? ""}`.trim())
                .join(" | ")}
            </span>
          )}
        </div>
      )}
      {isLocked && (
        <div className="similar-hint-box" role="note">
          <strong>Gợi ý khác biệt</strong> (so với câu mẫu trong nhóm): {slide.hint}
        </div>
      )}
      {autoNextKey !== null && (
        <div key={autoNextKey} className="auto-next-bar" role="status" aria-live="polite">
          <div className="auto-next-bar__header">
            <span className="auto-next-bar__label">
              {currentIdx >= roundSlides.length - 1
                ? "Tự động qua lượt tiếp theo sau 4 giây…"
                : "Tự động chuyển sang câu tiếp theo sau 4 giây…"}
            </span>
            <button type="button" className="auto-next-bar__cancel" onClick={() => setAutoNextKey(null)}>
              Dừng
            </button>
          </div>
          <div className="auto-next-bar__track">
            <div
              className="auto-next-bar__fill"
              style={{ animationDuration: `${AUTO_NEXT_DELAY_MS}ms` }}
            />
          </div>
        </div>
      )}
      <div className="quiz-nav-footer">
        <button type="button" className="btn-nav-prev" onClick={goPrev} disabled={currentIdx === 0}>
          ← Trước
        </button>
        <div className="quiz-nav-footer__right">
          <button type="button" className="btn-ghost" onClick={restartSession}>
            Làm lại
          </button>
          <button type="button" className="btn-nav-next" onClick={goNext}>
            Tiếp →
          </button>
        </div>
      </div>
      <div className="quiz-tip">
        <span className="quiz-tip__icon" aria-hidden>
          💡
        </span>
        <span>
          Mỗi lượt {SIMILAR_BATCH_SIZE} câu (same-question.txt). Ở câu cuối lượt, bấm Tiếp hoặc Enter để nộp lượt — câu sai
          được ưu tiên ở lượt sau. Sau khi chọn đáp án mới hiện gợi ý khác biệt.
        </span>
      </div>
    </div>
  );
}
