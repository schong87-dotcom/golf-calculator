// 퀴즈게임 강사 첫 화면: 내 퀴즈 목록과 진행 중인 세션, 새로 만들기와 진행 시작
import { useCallback, useEffect, useState } from 'react';
import { deleteQuiz, listOpenSessions, listQuizzes, startSession } from './api';
import { validateQuiz } from './model';

function displayName(user) {
  if (user.is_anonymous) return '비회원';
  const meta = user.user_metadata || {};
  return meta.full_name || meta.name || user.email?.split('@')[0] || '';
}

export default function QuizList({ user, go }) {
  const [quizzes, setQuizzes] = useState(null);
  const [open, setOpen] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => Promise.all([listQuizzes(), listOpenSessions()])
    .then(([q, s]) => {
      setQuizzes(q);
      setOpen(s);
    })
    .catch(e => setError(e.message)), []);

  useEffect(() => { load(); }, [load]);

  const start = async quiz => {
    const errors = validateQuiz(quiz);
    if (errors.length) return setError(`「${quiz.title || '제목 없음'}」 ${errors[0]}`);
    setBusy(true);
    try {
      const s = await startSession(quiz);
      go({ run: s.id });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const remove = async quiz => {
    if (!window.confirm(`「${quiz.title || '제목 없음'}」 퀴즈를 지울까요? 지난 진행 기록은 남습니다.`)) return;
    try {
      await deleteQuiz(quiz.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="qz-page">
      <header className="qz-topbar">
        <a className="qz-link" href="/">← 앱 모음</a>
        <span className="qz-muted">{displayName(user)}</span>
      </header>
      <main className="qz-main">
        <div className="qz-head-row">
          <h1>내 퀴즈</h1>
          <button type="button" className="qz-btn qz-primary" onClick={() => go({ edit: 'new' })}>새 퀴즈 만들기</button>
        </div>
        {error && <p className="qz-error" role="alert">{error}</p>}

        {open.length > 0 && (
          <section className="qz-card">
            <h2>진행 중</h2>
            <ul className="qz-list">
              {open.map(s => (
                <li key={s.id} className="qz-row">
                  <span>{s.title || '(제목 없음)'} <span className="qz-muted">입장코드 {s.code}</span></span>
                  <button type="button" className="qz-btn" onClick={() => go({ run: s.id })}>이어서 진행</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {quizzes === null && <p className="qz-muted">불러오는 중...</p>}
        {quizzes?.length === 0 && <p className="qz-muted">아직 만든 퀴즈가 없습니다. 「새 퀴즈 만들기」로 시작하세요.</p>}
        {quizzes?.length > 0 && (
          <ul className="qz-list">
            {quizzes.map(q => (
              <li key={q.id} className="qz-card qz-row">
                <span className="qz-row-title">
                  <strong>{q.title || '(제목 없음)'}</strong>
                  <span className="qz-muted">문제 {q.questions.length}개</span>
                </span>
                <span className="qz-row-actions">
                  <button type="button" className="qz-btn" onClick={() => go({ edit: q.id })}>편집</button>
                  <button type="button" className="qz-btn qz-primary" disabled={busy} onClick={() => start(q)}>진행 시작</button>
                  <button type="button" className="qz-btn qz-ghost" onClick={() => remove(q)}>삭제</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
