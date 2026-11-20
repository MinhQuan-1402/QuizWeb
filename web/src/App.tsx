import { useCallback, useEffect, useRef, useState } from "react";
import { RandomQuizSection } from "./RandomQuizSection";
import { SimilarQuizPanel } from "./SimilarQuizPanel";
import "./App.css";
import type { QuestionsMap } from "./parseQuiz";
import {
  intersectQuestionNumbers,
  parseAnswers,
  parseQuestions,
  setsEqual,
} from "./parseQuiz";
import type { ExamDocument } from "./randomQuizPool";
import {
  bundleFromExamDocument,
  mergeSameQuestionWithBundles,
  parseSameQuestionTxt,
  type ExamQaBundle,
} from "./parseSameQuestionTxt";
import type { SimilarSlide } from "./similarQuestions";

type View = "setup" | "quiz" | "flashcard" | "study" | "similar";

type HomeTab = "single" | "random";

type ExamListItem = { _id: string; examKey: string; updatedAt?: string; questionCount?: number };

type LearnMode = "quiz" | "flashcard" | "study" | "similar";

const STUDY_BATCH_SIZE = 5;
const AUTO_NEXT_DELAY_MS = 4000;

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const CARD_THEMES = [
  { variant: "learning-card--blue", stat: "learning-card__stat-val--blue" },
  { variant: "learning-card--purple", stat: "learning-card__stat-val--purple" },
  { variant: "learning-card--orange", stat: "learning-card__stat-val--orange" },
] as const;

const CARD_BADGE = "BỘ ĐỀ ÔN TẬP";

function examCardDescription(examKey: string): string {
  return `Củng cố kiến thức với bộ câu hỏi và đáp án — ${examKey}.`;
}

function estimateMinutes(questionCount: number | undefined): number {
  const n = questionCount && questionCount > 0 ? questionCount : 25;
  return Math.max(5, Math.round(n * 0.6));
}

function StartArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

function userPickToSet(pick: string[] | undefined): Set<string> {
  return new Set((pick ?? []).map((x) => x.toUpperCase()));
}

function normalizeTfText(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, "");
}

function isTrueFalseQuestion(options: [string, string][]): boolean {
  if (options.length !== 2) return false;
  const texts = new Set(options.map(([, text]) => normalizeTfText(text)));
  return texts.has("true") && texts.has("false");
}

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function extractExamSubject(examKey: string): string | null {
  const m = examKey.match(/\b([A-Za-z]{3}\d{3}[A-Za-z]?)\b/i);
  if (m) return m[1]!.toUpperCase();
  const prefix = examKey.split(/[-_\s]+/)[0]?.trim();
  if (prefix && /^[A-Za-z]{2,5}$/.test(prefix) && !/^(SP|SU|FA|FE|RE)$/i.test(prefix)) {
    return prefix.toUpperCase();
  }
  return null;
}

function extractExamTerm(examKey: string): string | null {
  const m = examKey.match(/\b(SP|SU|FA|SPR|SUM|FAL)\s*[-_]?\s*(\d{2}|\d{4})\b/i);
  if (!m) return null;
  const rawSeason = m[1]!.toUpperCase().slice(0, 2);
  const rawYear = m[2]!;
  const year2 = rawYear.length === 4 ? rawYear.slice(2) : rawYear;
  return `${rawSeason}${year2}`;
}

export default function App({ onActiveExamChange }: { onActiveExamChange?: (name: string | null) => void }) {
  const [activeExamName, setActiveExamName] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<HomeTab>("single");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("setup");

  useEffect(() => {
    onActiveExamChange?.(view === "setup" ? null : activeExamName);
    return () => onActiveExamChange?.(null);
  }, [view, activeExamName, onActiveExamChange]);

  const [serverExams, setServerExams] = useState<ExamListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [serverLoading, setServerLoading] = useState(false);
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);
  const [libraryNotice, setLibraryNotice] = useState('');
  const [learnMode, setLearnMode] = useState<LearnMode>("quiz");
  const [filterQuery, setFilterQuery] = useState("");
  const [filterSubject, setFilterSubject] = useState("ALL");
  const [filterTerm, setFilterTerm] = useState("ALL");
  const [filterCount, setFilterCount] = useState("ALL");
  const examsListReadyRef = useRef(false);

  async function deleteExam(exam: ExamListItem) {
    if (deletingExamId || serverLoading) return;
    if (!window.confirm(`Xóa bộ đề “${exam.examKey}”?\n\nCâu hỏi và đáp án của bộ đề sẽ bị xóa khỏi thư viện. Thao tác này không thể hoàn tác. Các file TXT/CSV gốc trên máy vẫn được giữ lại.`)) return;
    setDeletingExamId(exam._id);
    setLibraryNotice('');
    setError(null);
    try {
      const response = await fetch(apiUrl(`/api/exams/${encodeURIComponent(exam._id)}`), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Không xóa được bộ đề (${response.status}).`);
      }
      setServerExams(items => items.filter(item => item._id !== exam._id));
      setLibraryNotice(`Đã xóa bộ đề “${exam.examKey}” khỏi thư viện.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setDeletingExamId(null);
    }
  }

  const [questions, setQuestions] = useState<QuestionsMap>({});
  const [answerKey, setAnswerKey] = useState<Map<number, Set<string>>>(new Map());
  const [allQNumbers, setAllQNumbers] = useState<number[]>([]);
  const [qNumbers, setQNumbers] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string[]>>({});
  const [trueFalseOnlyActive, setTrueFalseOnlyActive] = useState(false);

  const [flashIdx, setFlashIdx] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [studyRound, setStudyRound] = useState(1);
  const [studyRoundNums, setStudyRoundNums] = useState<number[]>([]);
  const [studyQueue, setStudyQueue] = useState<number[]>([]);
  const [studyWrongInLastRound, setStudyWrongInLastRound] = useState(0);
  const [studyLocked, setStudyLocked] = useState<Record<number, boolean>>({});
  const [autoNextKey, setAutoNextKey] = useState<number | null>(null);

  const [similarSlides, setSimilarSlides] = useState<SimilarSlide[]>([]);

  const applyBundle = useCallback(
    (qText: string, aText: string, answersVirtualFileName: string): number[] | null => {
      const qs = parseQuestions(qText);
      const ans = parseAnswers(aText, answersVirtualFileName);
      const nums = intersectQuestionNumbers(qs, ans);
      if (!nums.length) {
        setError("Không có câu nào khớp giữa đề và đáp án (kiểm tra số thứ tự câu).");
        return null;
      }
      setQuestions(qs);
      setAnswerKey(ans);
      setAllQNumbers(nums);
      setQNumbers(nums);
      setTrueFalseOnlyActive(false);
      setCurrentIdx(0);
      setUserAnswers({});
      setFlashIdx(0);
      setAnswerVisible(false);
      setStudyRound(1);
      setStudyRoundNums([]);
      setStudyQueue([]);
      setStudyWrongInLastRound(0);
      setStudyLocked({});
      setAutoNextKey(null);
      setError(null);
      return nums;
    },
    []
  );

  const startStudySession = useCallback((nums: number[]) => {
    const initialRound = nums.slice(0, STUDY_BATCH_SIZE);
    const rest = nums.slice(initialRound.length);
    setStudyRound(1);
    setStudyRoundNums(initialRound);
    setStudyQueue(rest);
    setStudyWrongInLastRound(0);
    setCurrentIdx(0);
    setUserAnswers({});
    setStudyLocked({});
    setAutoNextKey(null);
    setView("study");
  }, []);

  useEffect(() => {
    if (view !== "setup") return;
    let cancelled = false;
    const showSpinner = !examsListReadyRef.current;
    if (showSpinner) setListLoading(true);
    (async () => {
      try {
        const r = await fetch(apiUrl("/api/exams"));
        if (!r.ok) {
          if (!cancelled) setServerExams([]);
          return;
        }
        const data = (await r.json()) as ExamListItem[];
        if (!cancelled) setServerExams(Array.isArray(data) ? data : []);
        if (!cancelled) examsListReadyRef.current = true;
      } catch {
        if (!cancelled) setServerExams([]);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view]);

  const startExamFromCard = useCallback(
    async (examId: string, mode: Exclude<LearnMode, "similar">) => {
      setServerLoading(true);
      setError(null);
      try {
        const r = await fetch(apiUrl(`/api/exams/${examId}`));
        if (!r.ok) {
          setError(`Không tải được đề (${r.status}).`);
          return;
        }
        const doc = (await r.json()) as {
          examKey: string;
          questionsText: string;
          answersText: string;
          answersExtension?: string;
        };
        const ext = doc.answersExtension === "txt" ? ".txt" : ".csv";
        const nums = applyBundle(doc.questionsText, doc.answersText, `mongo${ext}`);
        if (!nums) return;
        setActiveExamName(doc.examKey);
        if (mode === "quiz") {
          setView("quiz");
        } else if (mode === "flashcard") {
          setFlashIdx(0);
          setAnswerVisible(false);
          setView("flashcard");
        } else {
          startStudySession(nums);
        }
      } catch {
        setError("Lỗi kết nối API (server có chạy không?).");
      } finally {
        setServerLoading(false);
      }
    },
    [applyBundle, startStudySession]
  );

  const startSimilarPractice = useCallback(async () => {
    setServerLoading(true);
    setError(null);
    try {
      const txtUrl = `${import.meta.env.BASE_URL}same-question.txt`;
      const txtRes = await fetch(txtUrl);
      if (!txtRes.ok) {
        setError(
          `Không tải được same-question.txt (${txtRes.status}). Trong thư mục quiz-web chạy: npm run sync-same-question (file nguồn: same-question.txt ở thư mục cha).`
        );
        return;
      }
      const raw = await txtRes.text();
      const parsed = parseSameQuestionTxt(raw);
      if ("error" in parsed) {
        setError(parsed.error);
        return;
      }
      const { rows } = parsed;
      if (!rows.length) {
        setError("same-question.txt không có câu nào.");
        return;
      }

      const listRes = await fetch(apiUrl("/api/exams"));
      if (!listRes.ok) {
        setError(`Không đọc được danh sách đề (${listRes.status}).`);
        return;
      }
      const list = (await listRes.json()) as ExamListItem[];
      if (!Array.isArray(list) || !list.length) {
        setError("Chưa có bộ đề nào trên server — cần API để lấy đáp án theo [tên đề] Qn.");
        return;
      }
      const keyToId = new Map(list.map((e) => [e.examKey, e._id] as const));
      const neededKeys = [...new Set(rows.map((r) => r.examKey))];
      const bundles = new Map<string, ExamQaBundle>();
      for (const examKey of neededKeys) {
        const id = keyToId.get(examKey);
        if (!id) {
          setError(`Đề "${examKey}" có trong same-question.txt nhưng không có trên server (import Mongo).`);
          return;
        }
        const r = await fetch(apiUrl(`/api/exams/${id}`));
        if (!r.ok) {
          setError(`Không tải được đề "${examKey}" (${r.status}).`);
          return;
        }
        const doc = (await r.json()) as ExamDocument;
        bundles.set(examKey, bundleFromExamDocument(doc));
      }

      const merged = mergeSameQuestionWithBundles(rows, bundles);
      if ("error" in merged) {
        setError(merged.error);
        return;
      }
      setSimilarSlides(merged.slides);
      setActiveExamName("Ôn câu tương tự · Nhiều bộ đề");
      setView("similar");
    } catch {
      setError("Lỗi tải same-question.txt hoặc API.");
    } finally {
      setServerLoading(false);
    }
  }, []);

  const activeNumbers = view === "study" ? studyRoundNums : qNumbers;
  const qNum = activeNumbers[currentIdx];
  const currentQ = qNum !== undefined ? questions[qNum] : undefined;
  const currentCorrectSet = qNum !== undefined ? answerKey.get(qNum) ?? new Set<string>() : new Set<string>();
  const trueFalseNumbers = allQNumbers.filter((n) => {
    const data = questions[n];
    return !!data && isTrueFalseQuestion(data.options);
  });

  const triggerAutoNext = () => {
    if (view === "study") {
      setAutoNextKey(Date.now());
      return;
    }
    if (view === "quiz" && currentIdx < activeNumbers.length - 1) {
      setAutoNextKey(Date.now());
    } else {
      setAutoNextKey(null);
    }
  };

  const saveSingle = (letter: string) => {
    if (qNum === undefined) return;
    if (view === "study" && studyLocked[qNum]) return;
    setUserAnswers((prev) => ({ ...prev, [qNum]: letter ? [letter.toUpperCase()] : [] }));
    if (view === "study") {
      setStudyLocked((prev) => ({ ...prev, [qNum]: true }));
    }
    triggerAutoNext();
  };

  const toggleMulti = (letter: string) => {
    if (qNum === undefined) return;
    if (view === "study" && studyLocked[qNum]) return;
    const upper = letter.toUpperCase();
    const chooseCount = currentQ?.chooseCount ?? 1;
    setUserAnswers((prev) => {
      const cur = new Set(prev[qNum] ?? []);
      if (cur.has(upper)) cur.delete(upper);
      else cur.add(upper);
      if (cur.size >= chooseCount) {
        if (view === "study") {
          setStudyLocked((locked) => ({ ...locked, [qNum]: true }));
        }
        triggerAutoNext();
      } else {
        setAutoNextKey(null);
      }
      return { ...prev, [qNum]: [...cur].sort() };
    });
  };

  const goPrev = () => {
    setAutoNextKey(null);
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  };

  const goNext = () => {
    setAutoNextKey(null);
    if (view === "study" && currentIdx >= activeNumbers.length - 1) {
      submitStudyRound();
      return;
    }
    if (currentIdx < activeNumbers.length - 1) setCurrentIdx((i) => i + 1);
  };

  const submitQuiz = () => {
    let correct = 0;
    const wrong: string[] = [];
    for (const num of qNumbers) {
      const user = userPickToSet(userAnswers[num]);
      const key = answerKey.get(num) ?? new Set();
      if (setsEqual(user, key)) correct++;
      else {
        const ut = user.size ? [...user].sort().join(",") : "(trống)";
        const kt = [...key].sort().join(",");
        wrong.push(`Q${num}: bạn chọn ${ut} | đáp án ${kt}`);
      }
    }
    const total = qNumbers.length;
    const score = (correct / total) * 10;
    let msg = `Đúng ${correct}/${total} câu\nĐiểm (thang 10): ${score.toFixed(2)}`;
    if (wrong.length) {
      msg += "\n\nCâu sai:\n- " + wrong.slice(0, 20).join("\n- ");
      if (wrong.length > 20) msg += `\n... và ${wrong.length - 20} câu sai khác`;
    }
    setResultText(msg);
  };

  const submitStudyRound = () => {
    if (!studyRoundNums.length) return;

    const wrongNums: number[] = [];
    for (const num of studyRoundNums) {
      const user = userPickToSet(userAnswers[num]);
      const key = answerKey.get(num) ?? new Set<string>();
      if (!setsEqual(user, key)) wrongNums.push(num);
    }
    setStudyWrongInLastRound(wrongNums.length);

    // Wrong questions come first in the very next round.
    const nextQueue = [...wrongNums, ...studyQueue];
    const finishedAll = nextQueue.length === 0;
    if (finishedAll) {
      const remainUnique = new Set(nextQueue).size;
      const masteredUnique = Math.max(0, qNumbers.length - remainUnique);
      const msg =
        `Hoàn thành toàn bộ đề.\n` +
        `- Lượt cuối sai: ${wrongNums.length} câu\n` +
        `- Nắm chắc: ${masteredUnique}/${qNumbers.length} câu\n` +
        `- Còn cần ôn: ${remainUnique} câu`;
      setResultText(msg);
      return;
    }

    const nextRoundNums = nextQueue.slice(0, STUDY_BATCH_SIZE);
    const rest = nextQueue.slice(nextRoundNums.length);
    setStudyRound((r) => r + 1);
    setStudyRoundNums(nextRoundNums);
    setStudyQueue(rest);
    setCurrentIdx(0);
    setStudyLocked({});
    setAutoNextKey(null);
    setUserAnswers((prev) => {
      const copied = { ...prev };
      for (const n of nextRoundNums) delete copied[n];
      return copied;
    });
  };

  const restartCurrentPractice = () => {
    setAutoNextKey(null);
    if (view === "study") {
      startStudySession(qNumbers);
      setResultText(null);
      return;
    }
    if (view === "quiz") {
      setCurrentIdx(0);
      setUserAnswers({});
      setResultText(null);
    }
  };

  const shuffleCurrentPractice = () => {
    setAutoNextKey(null);
    const shuffled = shuffleArray(qNumbers);
    if (!trueFalseOnlyActive) {
      setAllQNumbers(shuffled);
    }
    setQNumbers(shuffled);
    setResultText(null);

    if (view === "study") {
      startStudySession(shuffled);
      return;
    }
    if (view === "quiz") {
      setCurrentIdx(0);
      setUserAnswers({});
    }
  };

  const useOnlyTrueFalse = () => {
    if (trueFalseNumbers.length <= 5) return;
    setAutoNextKey(null);
    const next = trueFalseOnlyActive ? allQNumbers : trueFalseNumbers;
    setTrueFalseOnlyActive(!trueFalseOnlyActive);
    setQNumbers(next);
    setCurrentIdx(0);
    setUserAnswers({});
    setResultText(null);
    if (view === "study") {
      startStudySession(next);
    }
  };

  useEffect(() => {
    if (autoNextKey === null) return;
    if (view !== "quiz" && view !== "study") {
      setAutoNextKey(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoNextKey(null);
      if (view === "study" && currentIdx >= activeNumbers.length - 1) {
        submitStudyRound();
      } else if (currentIdx < activeNumbers.length - 1) {
        setCurrentIdx((i) => i + 1);
      }
    }, AUTO_NEXT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoNextKey, view, currentIdx, activeNumbers.length, submitStudyRound]);

  useEffect(() => {
    if (view !== "quiz" && view !== "flashcard" && view !== "study") return;
    const navCount = view === "study" ? studyRoundNums.length : qNumbers.length;
    const maxIdx = Math.max(0, navCount - 1);
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (view === "quiz" || view === "study") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setAutoNextKey(null);
          setCurrentIdx((i) => (i > 0 ? i - 1 : i));
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setAutoNextKey(null);
          if (view === "study" && currentIdx >= maxIdx) {
            submitStudyRound();
          } else {
            setCurrentIdx((i) => (i < maxIdx ? i + 1 : i));
          }
        }
        if (view === "study" && e.key === "Enter") {
          e.preventDefault();
          setAutoNextKey(null);
          submitStudyRound();
        }
      }
      if (view === "flashcard") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setFlashIdx((i) => (i > 0 ? i - 1 : i));
          setAnswerVisible(false);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setFlashIdx((i) => (i < maxIdx ? i + 1 : i));
          setAnswerVisible(false);
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setAnswerVisible((v) => !v);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, qNumbers.length, studyRoundNums.length, currentIdx, submitStudyRound]);

  const flashQNum = qNumbers[flashIdx];
  const flashData = flashQNum !== undefined ? questions[flashQNum] : undefined;
  const currentUserSet = qNum !== undefined ? userPickToSet(userAnswers[qNum]) : new Set<string>();
  const showStudyFeedback = view === "study" && qNum !== undefined && studyLocked[qNum];
  const studyAnsweredCorrectly = setsEqual(currentUserSet, currentCorrectSet);

  const availableSubjects = Array.from(
    new Set(
      serverExams
        .map((e) => extractExamSubject(e.examKey))
        .filter((s): s is string => Boolean(s))
    )
  ).sort();

  const availableTerms = Array.from(
    new Set(
      serverExams
        .map((e) => extractExamTerm(e.examKey))
        .filter((t): t is string => Boolean(t))
    )
  ).sort((a, b) => {
    const ya = parseInt(a.slice(2), 10) || 0;
    const yb = parseInt(b.slice(2), 10) || 0;
    if (ya !== yb) return yb - ya;
    const order: Record<string, number> = { FA: 3, SU: 2, SP: 1 };
    return (order[b.slice(0, 2)] ?? 0) - (order[a.slice(0, 2)] ?? 0);
  });

  const availableCounts = Array.from(
    new Set(
      serverExams
        .map((e) => e.questionCount ?? 0)
        .filter((c) => c > 0)
    )
  ).sort((a, b) => a - b);

  const hasActiveFilter =
    filterQuery.trim() !== "" ||
    filterSubject !== "ALL" ||
    filterTerm !== "ALL" ||
    filterCount !== "ALL";

  const filteredExams = serverExams.filter((e) => {
    const q = filterQuery.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      const hay = `${e.examKey} ${e.questionCount ?? ""} ${extractExamTerm(e.examKey) ?? ""} ${extractExamSubject(e.examKey) ?? ""}`.toLowerCase();
      if (!tokens.every((tk) => hay.includes(tk))) return false;
    }
    if (filterSubject !== "ALL" && extractExamSubject(e.examKey) !== filterSubject) {
      return false;
    }
    if (filterTerm !== "ALL" && extractExamTerm(e.examKey) !== filterTerm) {
      return false;
    }
    if (filterCount !== "ALL") {
      const qc = e.questionCount ?? 0;
      if (filterCount === "LE30" && !(qc > 0 && qc <= 30)) return false;
      if (filterCount === "31_50" && !(qc >= 31 && qc <= 50)) return false;
      if (filterCount === "GT50" && !(qc > 50)) return false;
      if (filterCount.startsWith("EXACT_")) {
        const target = parseInt(filterCount.slice(6), 10);
        if (qc !== target) return false;
      }
    }
    return true;
  });

  const resetFilters = () => {
    setFilterQuery("");
    setFilterSubject("ALL");
    setFilterTerm("ALL");
    setFilterCount("ALL");
  };

  return (
    <>
      {view === "setup" && homeTab === "single" && (
        <>
          <header className="path-hero">
            <h1 className="path-hero__title">Hôm nay, bạn muốn học gì?</h1>
            <p className="path-hero__sub">
              Một thư viện, nhiều cách học. Chọn cách ôn tập phù hợp với bạn hôm nay.
            </p>
            <p className="path-hero__sub">
              {learnMode === "similar"
                ? "Nhận biết những câu gần giống nhau và học cách phân biệt. Gợi ý sẽ xuất hiện sau khi bạn trả lời."
                : "Chọn chế độ bên dưới, rồi bấm bắt đầu trên thẻ bộ đề bạn muốn."}
            </p>
          </header>

          <div className="mode-toggle" role="tablist" aria-label="Chế độ học">
            <div className="mode-toggle__inner">
              <button
                type="button"
                role="tab"
                aria-selected={learnMode === "quiz"}
                className={`mode-toggle__btn${learnMode === "quiz" ? " mode-toggle__btn--active" : ""}`}
                onClick={() => setLearnMode("quiz")}
              >
                Làm bài kiểm tra
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={learnMode === "flashcard"}
                className={`mode-toggle__btn${learnMode === "flashcard" ? " mode-toggle__btn--active" : ""}`}
                onClick={() => setLearnMode("flashcard")}
              >
                Thẻ ghi nhớ
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={learnMode === "study"}
                className={`mode-toggle__btn${learnMode === "study" ? " mode-toggle__btn--active" : ""}`}
                onClick={() => setLearnMode("study")}
              >
                Học từng nhóm
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={learnMode === "similar"}
                className={`mode-toggle__btn${learnMode === "similar" ? " mode-toggle__btn--active" : ""}`}
                onClick={() => setLearnMode("similar")}
              >
                Câu gần giống
              </button>
            </div>
          </div>

          <p className="path-hint">
            {learnMode === "similar"
              ? "Ôn theo nhóm để nhận biết những thay đổi nhỏ trong câu hỏi."
              : "Chọn một bộ đề trong thư viện để bắt đầu."}
          </p>

          {listLoading && <div className="path-loading">Đang tải danh sách đề…</div>}
          {libraryNotice && <p className="library-notice" role="status">{libraryNotice}</p>}

          {learnMode !== "similar" && !listLoading && serverExams.length === 0 && (
            <div className="path-empty"><strong>Thư viện đang trống</strong><p>Chọn “Nhập bộ đề” để thêm câu hỏi và đáp án của bạn. Nếu đã nhập đề, hãy kiểm tra kết nối rồi tải lại trang.</p></div>
          )}

          {learnMode !== "similar" && !listLoading && serverExams.length > 0 && (
            <>
              <div className="exam-filter-bar" role="search" aria-label="Bộ lọc bộ đề">
                <div className="exam-filter-bar__search">
                  <input
                    type="search"
                    className="exam-filter-input"
                    placeholder="Tìm theo tên đề, mã môn (HCM202, MLN131…), kỳ (SU26, FA25, B5, C1) hoặc số câu…"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    aria-label="Tìm kiếm theo tên đề, kỳ hoặc số câu"
                  />
                </div>
                <div className="exam-filter-bar__controls">
                  {availableSubjects.length > 0 && (
                    <select
                      className="exam-filter-select"
                      value={filterSubject}
                      onChange={(e) => setFilterSubject(e.target.value)}
                      aria-label="Lọc theo môn"
                    >
                      <option value="ALL">Tất cả môn ({availableSubjects.length})</option>
                      {availableSubjects.map((subj) => (
                        <option key={subj} value={subj}>
                          Môn: {subj}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    className="exam-filter-select"
                    value={filterTerm}
                    onChange={(e) => setFilterTerm(e.target.value)}
                    aria-label="Lọc theo kỳ"
                  >
                    <option value="ALL">Tất cả kỳ</option>
                    {availableTerms.map((term) => (
                      <option key={term} value={term}>
                        Kỳ: {term}
                      </option>
                    ))}
                  </select>
                  <select
                    className="exam-filter-select"
                    value={filterCount}
                    onChange={(e) => setFilterCount(e.target.value)}
                    aria-label="Lọc theo số câu"
                  >
                    <option value="ALL">Mọi số câu</option>
                    {availableCounts.map((c) => (
                      <option key={c} value={`EXACT_${c}`}>
                        Đúng {c} câu
                      </option>
                    ))}
                    <option value="LE30">≤ 30 câu</option>
                    <option value="31_50">31 – 50 câu</option>
                    <option value="GT50">&gt; 50 câu</option>
                  </select>
                  {hasActiveFilter && (
                    <button
                      type="button"
                      className="exam-filter-reset"
                      onClick={resetFilters}
                    >
                      Xóa lọc
                    </button>
                  )}
                </div>
                <div className="exam-filter-bar__meta">
                  <span>
                    Hiển thị <strong>{filteredExams.length}</strong> / {serverExams.length} bộ đề
                  </span>
                  {availableTerms.length > 0 && (
                    <div className="exam-filter-chips" aria-label="Chọn nhanh kỳ học">
                      <button
                        type="button"
                        className={`exam-filter-chip${filterTerm === "ALL" ? " exam-filter-chip--active" : ""}`}
                        onClick={() => setFilterTerm("ALL")}
                      >
                        Tất cả
                      </button>
                      {availableTerms.map((term) => (
                        <button
                          key={term}
                          type="button"
                          className={`exam-filter-chip${filterTerm === term ? " exam-filter-chip--active" : ""}`}
                          onClick={() => setFilterTerm(filterTerm === term ? "ALL" : term)}
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {filteredExams.length === 0 ? (
                <div className="path-empty">
                  <strong>Không tìm thấy bộ đề phù hợp</strong>
                  <p>Không có bộ đề nào khớp với điều kiện lọc hiện tại. Hãy thử từ khóa hoặc bộ lọc khác.</p>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ marginTop: 14 }}
                    onClick={resetFilters}
                  >
                    Đặt lại bộ lọc
                  </button>
                </div>
              ) : (
                <div className="path-grid">
                  {filteredExams.map((e, idx) => {
                    const theme = CARD_THEMES[idx % CARD_THEMES.length]!;
                    const mins = estimateMinutes(e.questionCount);
                    const qc = e.questionCount ?? 0;
                    const termTag = extractExamTerm(e.examKey);
                    const subjectTag = extractExamSubject(e.examKey);
                    return (
                      <article key={e._id} className={`learning-card ${theme.variant}`}>
                        <div className="learning-card__badges">
                          <span className="learning-card__badge">{CARD_BADGE}</span>
                          {subjectTag && <span className="learning-card__tag">{subjectTag}</span>}
                          {termTag && <span className="learning-card__tag learning-card__tag--term">{termTag}</span>}
                        </div>
                        <h2 className="learning-card__title">{e.examKey}</h2>
                        <p className="learning-card__desc">{examCardDescription(e.examKey)}</p>
                        <hr className="learning-card__rule" />
                        <div className="learning-card__stats">
                          <div>
                            <span className={`learning-card__stat-val ${theme.stat}`}>{qc > 0 ? qc : "—"}</span>
                            <span className="learning-card__stat-label">Câu hỏi</span>
                          </div>
                          <div>
                            <span className={`learning-card__stat-val ${theme.stat}`}>~{mins} phút</span>
                            <span className="learning-card__stat-label">Ước lượng</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="learning-card__start"
                          disabled={serverLoading || deletingExamId !== null}
                          onClick={() =>
                            void startExamFromCard(e._id, learnMode as Exclude<LearnMode, "similar">)
                          }
                        >
                          {learnMode === "quiz"
                            ? "Bắt đầu Quiz"
                            : learnMode === "flashcard"
                              ? "Bắt đầu Flashcard"
                              : "Bắt đầu Học"}
                          <StartArrowIcon />
                        </button>
                        <button type="button" className="learning-card__delete"
                          aria-label={`Xóa bộ đề ${e.examKey}`}
                          disabled={serverLoading || deletingExamId !== null}
                          onClick={() => void deleteExam(e)}>
                          {deletingExamId === e._id ? 'Đang xóa…' : 'Xóa bộ đề'}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {learnMode === "similar" && !listLoading && serverExams.length === 0 && (
            <div className="path-empty">
              Chưa có bộ đề trên server — không thể tra đáp án cho same-question.txt. Hãy import dữ liệu (quiz-server).
            </div>
          )}

          {learnMode === "similar" && !listLoading && serverExams.length > 0 && (
            <div className="path-grid path-grid--similar">
              <article className={`learning-card ${CARD_THEMES[0]!.variant}`}>
                <span className="learning-card__badge">Tổng hợp</span>
                <h2 className="learning-card__title">Câu gần giống (mọi đề)</h2>
                <p className="learning-card__desc">
                  Đọc same-question.txt (stem + hint theo nhóm). Đáp án và các lựa chọn A–F lấy từ MongoDB theo đúng [tên đề] Qn
                  trong file. Mỗi lượt 5 câu, câu sai được ôn lại ở lượt sau — giống chế độ Học. Gợi ý chỉ hiện sau khi chọn đáp án.
                </p>
                <hr className="learning-card__rule" />
                <div className="learning-card__stats">
                  <div>
                    <span className={`learning-card__stat-val ${CARD_THEMES[0]!.stat}`}>—</span>
                    <span className="learning-card__stat-label">Số câu</span>
                  </div>
                  <div>
                    <span className={`learning-card__stat-val ${CARD_THEMES[0]!.stat}`}>Học</span>
                    <span className="learning-card__stat-label">Chế độ</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="learning-card__start"
                  disabled={serverLoading}
                  onClick={() => void startSimilarPractice()}
                >
                  Tải &amp; bắt đầu
                  <StartArrowIcon />
                </button>
              </article>
            </div>
          )}

          <div className="path-footer-random">
            <button type="button" onClick={() => setHomeTab("random")}>
              Quiz ngẫu nhiên từ nhiều bộ đề →
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}
        </>
      )}

      {view === "setup" && homeTab === "random" && (
        <>
          <div className="path-back-random">
            <button type="button" onClick={() => setHomeTab("single")}>
              ← Chọn bộ đề
            </button>
          </div>
          <RandomQuizSection apiBase={API_BASE} onActiveExamChange={onActiveExamChange} />
        </>
      )}

      {(view === "quiz" || view === "study") && currentQ && qNum !== undefined && (
        <div className="quiz-panel">
          <div className="back-link quiz-back">
            <button type="button" onClick={() => setView("setup")}>
              ← Chọn bộ đề khác
            </button>
          </div>
          <div className="quiz-header-row">
            <span className="quiz-badge">
              {view === "study"
                ? `Học lượt ${studyRound} · Câu ${currentIdx + 1}/${studyRoundNums.length} · Q${qNum}`
                : `Câu ${currentIdx + 1} / ${qNumbers.length} · Q${qNum}`}
            </span>
            <span className="quiz-percent">
              {view === "study"
                ? `${Math.round(((currentIdx + 1) / Math.max(1, studyRoundNums.length)) * 100)}% lượt này`
                : `${Math.round(((currentIdx + 1) / qNumbers.length) * 100)}% hoàn thành`}
            </span>
          </div>
          {view === "study" && (
            <div className="study-note">
              Sai lượt trước: {studyWrongInLastRound} câu · Còn chờ ôn: {studyQueue.length} câu
            </div>
          )}
          <p className="question-title">{currentQ.question}</p>
          <p className="choose-hint">
            {currentQ.chooseCount === 1 ? "Chọn 1 đáp án" : `Chọn ${currentQ.chooseCount} đáp án`}
          </p>
          <div className="options-list">
            {currentQ.chooseCount === 1
              ? currentQ.options.map(([key, text]) => (
                  <label
                    key={key}
                    className={`option-card${
                      view === "study" && (userAnswers[qNum] ?? []).includes(key)
                        ? currentCorrectSet.has(key)
                          ? " option-card--correct"
                          : " option-card--wrong"
                        : ""
                    }`}
                    htmlFor={`opt-${qNum}-${key}`}
                  >
                    <input
                      type="radio"
                      className="option-input"
                      name={`q-${qNum}`}
                      id={`opt-${qNum}-${key}`}
                      checked={(userAnswers[qNum]?.[0] ?? "") === key}
                      disabled={view === "study" && !!studyLocked[qNum]}
                      onChange={() => saveSingle(key)}
                    />
                    <span className="option-radio-faux" aria-hidden />
                    <span className="option-label-text">
                      {key}. {text}
                    </span>
                    {view === "study" &&
                      (userAnswers[qNum] ?? []).includes(key) &&
                      (currentCorrectSet.has(key) ? (
                        <span className="option-chip option-chip--ok">Đúng</span>
                      ) : (
                        <span className="option-chip option-chip--bad">Sai</span>
                      ))}
                  </label>
                ))
              : currentQ.options.map(([key, text]) => (
                  <label
                    key={key}
                    className={`option-card${
                      view === "study" && (userAnswers[qNum] ?? []).includes(key)
                        ? currentCorrectSet.has(key)
                          ? " option-card--correct"
                          : " option-card--wrong"
                        : ""
                    }`}
                    htmlFor={`cb-${qNum}-${key}`}
                  >
                    <input
                      type="checkbox"
                      className="option-input"
                      id={`cb-${qNum}-${key}`}
                      checked={(userAnswers[qNum] ?? []).includes(key)}
                      disabled={view === "study" && !!studyLocked[qNum]}
                      onChange={() => toggleMulti(key)}
                    />
                    <span className="option-check-faux" aria-hidden />
                    <span className="option-label-text">
                      {key}. {text}
                    </span>
                    {view === "study" &&
                      (userAnswers[qNum] ?? []).includes(key) &&
                      (currentCorrectSet.has(key) ? (
                        <span className="option-chip option-chip--ok">Đúng</span>
                      ) : (
                        <span className="option-chip option-chip--bad">Sai</span>
                      ))}
                  </label>
                ))}
          </div>
          {showStudyFeedback && (
            <div className={studyAnsweredCorrectly ? "study-feedback study-feedback--ok" : "study-feedback study-feedback--bad"}>
              {studyAnsweredCorrectly ? (
                <span>Đúng rồi. Chuyển câu tiếp theo nhé.</span>
              ) : (
                <span>
                  Sai. Đáp án đúng:{" "}
                  {[...currentCorrectSet]
                    .sort()
                    .map((k) => `${k}. ${currentQ.options.find(([opt]) => opt === k)?.[1] ?? ""}`.trim())
                    .join(" | ")}
                </span>
              )}
            </div>
          )}
          {autoNextKey !== null && (
            <div key={autoNextKey} className="auto-next-bar" role="status" aria-live="polite">
              <div className="auto-next-bar__header">
                <span className="auto-next-bar__label">
                  {view === "study" && currentIdx >= activeNumbers.length - 1
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
              <button type="button" className="btn-ghost" onClick={restartCurrentPractice}>
                Làm lại
              </button>
              <button type="button" className="btn-ghost" onClick={shuffleCurrentPractice}>
                Trộn câu hỏi
              </button>
              {trueFalseNumbers.length > 5 && (
                <button
                  type="button"
                  className={`btn-ghost${trueFalseOnlyActive ? " btn-ghost-active" : ""}`}
                  onClick={useOnlyTrueFalse}
                >
                  {trueFalseOnlyActive
                    ? `Đang chỉ True/False (${trueFalseNumbers.length})`
                    : `Chỉ True/False (${trueFalseNumbers.length})`}
                </button>
              )}
              {view !== "study" && (
                <button type="button" className="btn-submit-grade" onClick={submitQuiz}>
                  Nộp bài & chấm điểm
                </button>
              )}
              <button
                type="button"
                className="btn-nav-next"
                onClick={goNext}
                disabled={view !== "study" && currentIdx >= activeNumbers.length - 1}
              >
                Tiếp →
              </button>
            </div>
          </div>
          <div className="quiz-tip">
            <span className="quiz-tip__icon" aria-hidden>
              💡
            </span>
            <span>
              {view === "study"
                ? "Mẹo: Mỗi lượt 5 câu. Nộp lượt sẽ tự gom câu sai sang lượt kế tiếp cho đến khi hết đề."
                : "Mẹo: Dùng phím ← → để chuyển câu; bạn có thể đổi đáp án bất cứ lúc nào trước khi nộp bài."}
            </span>
          </div>
        </div>
      )}

      {view === "similar" && similarSlides.length > 0 && (
        <SimilarQuizPanel
          slides={similarSlides}
          onBack={() => {
            setView("setup");
            setSimilarSlides([]);
            setResultText(null);
          }}
        />
      )}

      {view === "flashcard" && flashData && flashQNum !== undefined && (
        <div className="quiz-panel">
          <div className="back-link quiz-back">
            <button type="button" onClick={() => setView("setup")}>
              ← Chọn bộ đề khác
            </button>
          </div>
          <div className="quiz-header-row">
            <span className="quiz-badge">
              Flashcard {flashIdx + 1} / {qNumbers.length} · Q{flashQNum}
            </span>
            <span className="quiz-percent">
              {Math.round(((flashIdx + 1) / qNumbers.length) * 100)}% hoàn thành
            </span>
          </div>
          <p className="question-title">{flashData.question}</p>
          <p className="choose-hint">Các lựa chọn</p>
          <div className="options-list">
            {flashData.options.map(([k, t]) => (
              <div key={k} className="option-card option-card--readonly">
                <span className="option-label-text">
                  {k}. {t}
                </span>
              </div>
            ))}
          </div>
          <p className="answer-reveal">
            Đáp án:{" "}
            {answerVisible
              ? [...(answerKey.get(flashQNum) ?? new Set())].sort().join(", ")
              : "(ẩn)"}
          </p>
          <div className="quiz-nav-footer">
            <button
              type="button"
              className="btn-nav-prev"
              onClick={() => {
                if (flashIdx > 0) {
                  setFlashIdx((i) => i - 1);
                  setAnswerVisible(false);
                }
              }}
              disabled={flashIdx === 0}
            >
              ← Trước
            </button>
            <div className="quiz-nav-footer__right">
              <button type="button" className="btn-submit-grade" onClick={() => setAnswerVisible((v) => !v)}>
                {answerVisible ? "Ẩn đáp án" : "Hiện đáp án"}
              </button>
              <button
                type="button"
                className="btn-nav-next"
                onClick={() => {
                  if (flashIdx < qNumbers.length - 1) {
                    setFlashIdx((i) => i + 1);
                    setAnswerVisible(false);
                  }
                }}
                disabled={flashIdx >= qNumbers.length - 1}
              >
                Tiếp →
              </button>
            </div>
          </div>
          <div className="quiz-tip">
            <span className="quiz-tip__icon" aria-hidden>
              💡
            </span>
            <span>Mẹo: Phím ← → chuyển thẻ; Enter bật/tắt đáp án.</span>
          </div>
        </div>
      )}

      {resultText && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div className="modal">
            <h2 id="result-title">Kết quả</h2>
            <pre>{resultText}</pre>
            <div className="quiz-nav-footer__right" style={{ marginTop: 16 }}>
              {(view === "quiz" || view === "study") && (
                <button type="button" className="btn-submit-grade" onClick={restartCurrentPractice}>
                  Làm lại
                </button>
              )}
              <button type="button" className="btn-primary" onClick={() => setResultText(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



