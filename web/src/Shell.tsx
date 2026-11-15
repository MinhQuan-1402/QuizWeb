import { useState } from 'react';
import App from './App';
import ThemePicker from './ThemePicker';

export default function Shell() {
  const [page, setPage] = useState<'learn' | 'import'>('learn');
  const [revision, setRevision] = useState(0);
  const [activeExamName, setActiveExamName] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy) return;
    setBusy(true); setNotice(''); setUploadFailed(false);
    try {
      const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
      const response = await fetch(`${base}/api/exams/upload`, { method: 'POST', body: new FormData(form) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? 'Không nhập được bộ đề.'); }
      setNotice('Đã lưu bộ đề. Bạn có thể bắt đầu học trong Thư viện đề.');
      setRevision(n => n + 1); form.reset();
    } catch (error) { setUploadFailed(true); setNotice(error instanceof Error ? error.message : 'Không kết nối được máy chủ.'); }
    finally { setBusy(false); }
  }
  return <div className="workspace">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="QuizWeb trang chủ"><span className="brand-mark">Q</span>QuizWeb<span className="brand-dot">.</span></a>
      <p className="nav-caption">KHÔNG GIAN HỌC TẬP</p>
      <nav aria-label="Điều hướng chính">
        <button className={page === 'learn' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('learn')}><span>01</span>Thư viện đề</button>
        <button className={page === 'import' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('import')}><span>02</span>Nhập bộ đề</button>
      </nav>
      <div className="sidebar-note"><span>GÓC TẬP TRUNG</span><div className="focus-art" aria-hidden="true">✦</div><h3>Mỗi lần một chút.<br />Mỗi ngày tốt hơn.</h3><p>Dành một khoảng nhỏ hôm nay cho sự tự tin ngày mai.</p></div>
      <div className="sidebar-bottom">QuizWeb / Study workspace</div>
    </aside>
    <main className="workspace-main">
      <header className="topbar"><nav className="topbar-location" aria-label="Vị trí hiện tại"><span>Không gian cá nhân</span><span className="breadcrumb">/ {page === 'learn' ? 'Thư viện đề' : 'Nhập bộ đề'}</span>{page === 'learn' && activeExamName && <span className="breadcrumb active-exam" aria-current="page"><span aria-hidden="true">/ </span>{activeExamName}</span>}</nav><div className="topbar-tools"><ThemePicker /><span className="profile" aria-label="Không gian QuizWeb">QW</span></div></header>
      <div className="workspace-content">
        {page === 'learn' ? <App key={revision} onActiveExamChange={setActiveExamName} /> : <section className="import-page">
          <span className="eyebrow">THƯ VIỆN CỦA BẠN</span><h1>Thêm kiến thức.<br />Sẵn sàng ôn tập.</h1><p className="intro">Đặt tên bộ đề, chọn file câu hỏi và đáp án tương ứng. Mọi thứ đã sẵn sàng cho buổi học tiếp theo.</p>
          <form className="import-form" onSubmit={upload}>
            <label>Tên bộ đề<input name="examKey" required maxLength={512} placeholder="Ví dụ: PMG201c — Ôn tập cuối kỳ" /></label>
            <label>File câu hỏi (.txt)<input name="questions" type="file" accept=".txt" required /></label>
            <label>File đáp án (.txt hoặc .csv)<input name="answers" type="file" accept=".txt,.csv" required /></label>
            <p className="hint">Câu hỏi dùng mốc ===== Q1.webp ===== và lựa chọn A., B., C.… Đáp án TXT dùng Q1: A hoặc Q2: A, C. Tên bộ đề phải khác các bộ đề đã có trong thư viện.</p>
            <button className="btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu vào thư viện →'}</button>
            {notice && <p className={uploadFailed ? 'error-banner' : 'library-notice'} role={uploadFailed ? 'alert' : 'status'}>{notice}</p>}
          </form>
          <div className="import-guide"><h2>Một bộ đề, hai file</h2><p>File câu hỏi chứa nội dung và các lựa chọn. File đáp án ghi số câu tương ứng, ví dụ Q1: A hoặc Q2: A,C khi có nhiều đáp án đúng.</p><p>Kiểm tra số câu của hai file trước khi lưu để bắt đầu ôn tập đầy đủ.</p></div>
        </section>}
      </div>
      <footer className="workspace-footer">QUIZWEB<span>Hiểu kiến thức. Tự tin hơn mỗi ngày.</span></footer>
    </main>
  </div>;
}
