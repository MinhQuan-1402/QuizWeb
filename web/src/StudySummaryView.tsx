import { useState } from "react";
import type { StudySessionSummary } from "./studyStats";

type StudyLiveBarProps = {
  summary: StudySessionSummary;
  wrongInLastRound: number;
  queueLength: number;
  studyRound: number;
};

export function StudyLiveBar({
  summary,
  wrongInLastRound,
  queueLength,
  studyRound,
}: StudyLiveBarProps) {
  const [expanded, setExpanded] = useState(false);

  const masteredPercent =
    summary.totalQuestions > 0
      ? Math.round((summary.masteredCount / summary.totalQuestions) * 100)
      : 0;

  return (
    <section className="study-live-panel" aria-label="Thống kê lần học hiện tại">
      <div className="study-live-panel__top">
        <div className="study-live-panel__pills">
          <span className="study-pill study-pill--neutral">
            Thuộc: <strong>{summary.masteredCount}/{summary.totalQuestions}</strong> ({masteredPercent}%)
          </span>
          <span className="study-pill study-pill--ok">
            Đúng: <strong>{summary.totalCorrectAttempts}</strong> lượt
          </span>
          <span className="study-pill study-pill--bad">
            Sai: <strong>{summary.everWrongCount}</strong> câu ({summary.totalWrongAttempts} lượt)
          </span>
        </div>
        <button
          type="button"
          className="study-live-panel__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Ẩn chi tiết lần học ▴" : "Xem chi tiết lần học ▾"}
        </button>
      </div>

      <div className="study-live-panel__meta">
        Lượt {studyRound} · Sai lượt trước: {wrongInLastRound} câu · Còn chờ ôn: {queueLength} câu
      </div>

      {expanded && (
        <div className="study-live-panel__body">
          <div className="study-mini-kpis">
            <div className="study-mini-kpi">
              <span className="study-mini-kpi__label">Đúng ngay lần đầu</span>
              <strong className="study-mini-kpi__val study-mini-kpi__val--ok">
                {summary.firstTryCorrectCount} / {summary.totalQuestions}
              </strong>
            </div>
            <div className="study-mini-kpi">
              <span className="study-mini-kpi__label">Số câu từng sai</span>
              <strong
                className={`study-mini-kpi__val${summary.everWrongCount > 0 ? " study-mini-kpi__val--bad" : " study-mini-kpi__val--ok"}`}
              >
                {summary.everWrongCount} câu
              </strong>
            </div>
            <div className="study-mini-kpi">
              <span className="study-mini-kpi__label">Tổng lượt đúng / sai</span>
              <strong className="study-mini-kpi__val">
                {summary.totalCorrectAttempts} đúng · {summary.totalWrongAttempts} sai
              </strong>
            </div>
            <div className="study-mini-kpi">
              <span className="study-mini-kpi__label">Độ chính xác</span>
              <strong className="study-mini-kpi__val">{summary.accuracyPercent}%</strong>
            </div>
          </div>

          <div className="study-live-wrong">
            <div className="study-live-wrong__title">
              Các câu đang làm sai nhiều trong lần học này ({summary.wrongQuestions.length})
            </div>
            {summary.wrongQuestions.length === 0 ? (
              <p className="study-live-wrong__empty">
                Chưa có câu nào sai trong lần học này. Tiếp tục giữ vững nhé!
              </p>
            ) : (
              <ul className="study-wrong-list study-wrong-list--compact">
                {summary.wrongQuestions.map((item) => (
                  <li key={item.id} className="study-wrong-item">
                    <div className="study-wrong-item__head">
                      <span className="study-wrong-item__label">{item.label}</span>
                      <div className="study-wrong-item__badges">
                        <span
                          className={`study-wrong-badge${item.wrongCount >= 2 ? " study-wrong-badge--severe" : ""}`}
                        >
                          Sai {item.wrongCount} lần
                        </span>
                        {item.mastered && (
                          <span className="study-mastered-badge">Đã làm đúng lại</span>
                        )}
                      </div>
                    </div>
                    <p className="study-wrong-item__question">{item.question}</p>
                    {item.wrongPicks.length > 0 && (
                      <p className="study-wrong-item__picks">
                        Đã chọn sai: <span>{item.wrongPicks.join(" → ")}</span>
                      </p>
                    )}
                    <p className="study-wrong-item__answer">
                      Đáp án đúng: <strong>{item.correctAnswers.join(" | ")}</strong>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

type StudySummaryScreenProps = {
  examTitle: string | null;
  totalRounds: number;
  summary: StudySessionSummary;
  backLabel?: string;
  onBack: () => void;
  onRestartAll: () => void;
  onRetryWrong?: () => void;
};

export function StudySummaryScreen({
  examTitle,
  totalRounds,
  summary,
  backLabel = "← Chọn bộ đề khác",
  onBack,
  onRestartAll,
  onRetryWrong,
}: StudySummaryScreenProps) {
  const firstTryPct =
    summary.totalQuestions > 0
      ? Math.round((summary.firstTryCorrectCount / summary.totalQuestions) * 100)
      : 100;
  const wrongQuestionPct = Math.max(0, 100 - firstTryPct);

  return (
    <div className="quiz-panel study-summary">
      <div className="back-link quiz-back">
        <button type="button" onClick={onBack}>
          {backLabel}
        </button>
      </div>

      <div className="study-summary__header">
        <span className="quiz-badge">Hoàn thành lần học · {totalRounds} lượt</span>
        <h2 className="study-summary__title">Tổng kết lần học</h2>
        {examTitle && <p className="study-summary__subtitle">{examTitle}</p>}
      </div>

      <div className="study-summary__kpis">
        <div className="study-kpi-card study-kpi-card--ok">
          <span className="study-kpi-card__label">Câu đúng ngay lần đầu</span>
          <strong className="study-kpi-card__value">
            {summary.firstTryCorrectCount} / {summary.totalQuestions}
          </strong>
          <span className="study-kpi-card__hint">{firstTryPct}% tổng số câu trong đề</span>
        </div>

        <div
          className={`study-kpi-card${summary.everWrongCount > 0 ? " study-kpi-card--bad" : " study-kpi-card--ok"}`}
        >
          <span className="study-kpi-card__label">Tổng số câu làm sai</span>
          <strong className="study-kpi-card__value">{summary.everWrongCount} câu</strong>
          <span className="study-kpi-card__hint">
            {summary.everWrongCount > 0
              ? `${wrongQuestionPct}% số câu từng trả lời sai`
              : "Không sai câu nào"}
          </span>
        </div>

        <div className="study-kpi-card">
          <span className="study-kpi-card__label">Tổng lượt trả lời đúng</span>
          <strong className="study-kpi-card__value">{summary.totalCorrectAttempts}</strong>
          <span className="study-kpi-card__hint">
            Độ chính xác tổng thể: {summary.accuracyPercent}%
          </span>
        </div>

        <div className="study-kpi-card">
          <span className="study-kpi-card__label">Tổng lượt trả lời sai</span>
          <strong className="study-kpi-card__value">{summary.totalWrongAttempts}</strong>
          <span className="study-kpi-card__hint">
            Hoàn thành sau {totalRounds} lượt học
          </span>
        </div>
      </div>

      <div className="study-summary__ratio" aria-label="Tỷ lệ câu đúng lần đầu và câu từng làm sai">
        <div className="study-summary__ratio-labels">
          <span>Đúng lần đầu: {summary.firstTryCorrectCount} câu ({firstTryPct}%)</span>
          <span>Từng làm sai: {summary.everWrongCount} câu ({wrongQuestionPct}%)</span>
        </div>
        <div className="study-summary__ratio-bar">
          <div className="study-summary__ratio-ok" style={{ width: `${firstTryPct}%` }} />
          <div className="study-summary__ratio-bad" style={{ width: `${wrongQuestionPct}%` }} />
        </div>
      </div>

      <section className="study-summary__section">
        <h3 className="study-summary__section-title">
          Các câu làm sai nhiều nhất ({summary.wrongQuestions.length} câu)
        </h3>

        {summary.wrongQuestions.length === 0 ? (
          <div className="study-summary__perfect">
            <strong>Xuất sắc!</strong>
            <p>Bạn đã trả lời đúng tất cả {summary.totalQuestions} câu ngay từ lần đầu mà không sai câu nào.</p>
          </div>
        ) : (
          <ul className="study-wrong-list">
            {summary.wrongQuestions.map((item, idx) => (
              <li key={item.id} className="study-wrong-item">
                <div className="study-wrong-item__head">
                  <div className="study-wrong-item__id-wrap">
                    <span className="study-wrong-item__rank">#{idx + 1}</span>
                    <span className="study-wrong-item__label">{item.label}</span>
                  </div>
                  <div className="study-wrong-item__badges">
                    <span
                      className={`study-wrong-badge${item.wrongCount >= 2 ? " study-wrong-badge--severe" : ""}`}
                    >
                      Sai {item.wrongCount} lần
                    </span>
                    <span className="study-ok-badge">Đúng {item.correctCount} lần</span>
                  </div>
                </div>
                <p className="study-wrong-item__question">{item.question}</p>
                {item.wrongPicks.length > 0 && (
                  <p className="study-wrong-item__picks">
                    Bạn từng chọn sai: <span>{item.wrongPicks.join(" → ")}</span>
                  </p>
                )}
                <p className="study-wrong-item__answer">
                  Đáp án đúng: <strong>{item.correctAnswers.join(" | ")}</strong>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="study-summary__actions">
        {summary.wrongQuestions.length > 0 && onRetryWrong && (
          <button type="button" className="btn-primary" onClick={onRetryWrong}>
            Ôn lại {summary.wrongQuestions.length} câu hay sai
          </button>
        )}
        <button type="button" className="btn-submit-grade" onClick={onRestartAll}>
          Học lại toàn bộ đề
        </button>
        <button type="button" className="btn-ghost" onClick={onBack}>
          {backLabel.replace(/^←\s*/, "")}
        </button>
      </div>
    </div>
  );
}
