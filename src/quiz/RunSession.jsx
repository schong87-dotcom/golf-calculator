// 퀴즈게임 진행 화면(빔프로젝터용): QR 대기실 → 문제 열기, 마감, 정답 공개, 원클릭 인정 → 다음 문제 → 최종 순위
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { hostApply, loadParticipants, loadResponses, loadSession } from './api';
import { hostTopic, ping, stateTopic, useLive, useSerial } from './live';
import { applyGrade, buildReveal, gradeQuestion, isScored, rankParticipants } from './scoring';
import { TYPE_LABELS } from './model';

export default function RunSession({ id, onExit }) {
  const [session, setSession] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [responses, setResponses] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRanking, setShowRanking] = useState(false);

  const refresh = useSerial(async () => {
    try {
      const s = await loadSession(id);
      const q = s.questions[s.current_index];
      const [ps, rs] = await Promise.all([loadParticipants(id), q ? loadResponses(id, q.id) : []]);
      setSession(s);
      setParticipants(ps);
      setResponses(rs);
    } catch (e) {
      setError(e.message);
    }
  });

  useEffect(() => { refresh(); }, [refresh]);
  useLive(session ? hostTopic(session.code) : null, 'activity', refresh, { fast: 2000, slow: 5000 });

  if (!session) return <p className="qz-loading">{error || '불러오는 중...'}</p>;

  const q = session.questions[session.current_index];
  const accepts = (q && session.accepts[q.id]) || [];
  const total = session.questions.length;
  const joinUrl = `${window.location.origin}/quiz/?c=${session.code}`;

  // 버튼 하나의 처리: 바꾸고 → 수강생 폰에 신호 → 화면 다시 읽기
  const run = fn => async () => {
    setBusy(true);
    setError('');
    try {
      await fn();
      ping(stateTopic(session.code), 'state');
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const apply = (patch, scores) => hostApply(id, patch, scores);

  // 마지막 순간 제출까지 다시 읽어 채점하고, 점수와 공개 내용을 한 번에 올린다
  const publish = async (question, acc, patch) => {
    const [ps, rs] = await Promise.all([loadParticipants(id), loadResponses(id, question.id)]);
    const grade = gradeQuestion(question, ps, rs, acc);
    const revealed = session.revealed.includes(question.id) ? session.revealed : [...session.revealed, question.id];
    await apply({ ...patch, revealed, reveal: buildReveal(question, acc) }, applyGrade(ps, question, grade));
  };

  const next = run(() => {
    setShowRanking(false);
    return apply({ status: 'open', current_index: session.current_index + 1, reveal: null });
  });
  const close = run(() => apply({ status: 'closed' }));
  const reveal = run(() => publish(q, accepts, { status: 'revealed' }));
  const changeAccepts = list => run(() => {
    const patch = { accepts: { ...session.accepts, [q.id]: list } };
    return session.status === 'revealed' ? publish(q, list, patch) : apply(patch);
  })();
  const finish = run(async () => {
    const ps = await loadParticipants(id);
    const results = Object.fromEntries(ps.map(p => [p.id, p.results || {}]));
    const scores = rankParticipants(ps, results).map(r => ({ id: r.id, score: r.score, rank: r.rank, results: results[r.id] }));
    await apply({ status: 'ended' }, scores);
  });
  const endNow = () => {
    if (window.confirm('퀴즈를 지금 끝낼까요? 정답을 공개하지 않은 문제는 점수에 들어가지 않습니다.')) finish();
  };

  return (
    <div className="qz-run">
      <header className="qz-run-head">
        <button type="button" className="qz-link" onClick={onExit}>목록으로</button>
        <strong className="qz-run-title">{session.title}</strong>
        <span className="qz-run-code">입장코드 {session.code}</span>
        <span className="qz-run-count">참가 {participants.length}명</span>
        {session.status !== 'lobby' && session.status !== 'ended' && (
          <span className="qz-run-qr" title={joinUrl}><QRCodeSVG value={joinUrl} size={64} marginSize={1} /></span>
        )}
        {session.status !== 'ended' && (
          <button type="button" className="qz-link" disabled={busy} onClick={endNow}>종료</button>
        )}
      </header>
      {error && <p className="qz-error" role="alert">{error}</p>}

      <main className="qz-run-main">
        {session.status === 'lobby' && (
          <section className="qz-lobby">
            <div className="qz-lobby-qr" data-testid="join-qr" data-value={joinUrl}>
              <QRCodeSVG value={joinUrl} size={320} marginSize={2} />
            </div>
            <div className="qz-lobby-info">
              <p className="qz-lobby-lead">휴대폰 카메라로 QR을 찍어 들어오세요</p>
              <p className="qz-lobby-url" data-testid="join-url">{joinUrl}</p>
              <p className="qz-lobby-code">{session.code}</p>
              <h2>들어온 사람</h2>
              {participants.length === 0
                ? <p className="qz-muted">아직 아무도 없습니다</p>
                : <ul className="qz-names" data-testid="lobby-names">{participants.map(p => <li key={p.id}>{p.name}</li>)}</ul>}
              <button type="button" className="qz-btn qz-primary qz-big-btn" disabled={busy || total === 0} onClick={next}>
                첫 문제 시작
              </button>
            </div>
          </section>
        )}

        {q && ['open', 'closed', 'revealed'].includes(session.status) && (
          <Stage
            session={session} q={q} accepts={accepts} participants={participants} responses={responses}
            busy={busy} showRanking={showRanking}
            actions={{
              close, reveal, next, finish, changeAccepts,
              toggleRanking: () => setShowRanking(v => !v),
            }}
          />
        )}

        {session.status === 'ended' && (
          <section className="qz-final">
            <h1>최종 순위</h1>
            <Ranking participants={participants} testid="final-ranking" />
            <button type="button" className="qz-btn" onClick={onExit}>목록으로</button>
          </section>
        )}
      </main>
    </div>
  );
}

function Stage({ session, q, accepts, participants, responses, busy, showRanking, actions }) {
  const status = session.status;
  const revealed = status === 'revealed';
  const grade = gradeQuestion(q, participants, responses, accepts);
  const scored = isScored(q, accepts);
  const isLast = session.current_index >= session.questions.length - 1;
  const labels = (q.answers || []).map(a => a.value);

  return (
    <section className="qz-stage">
      <p className="qz-stage-meta">
        <span>{session.current_index + 1} / {session.questions.length}</span>
        <span>{TYPE_LABELS[q.type]}</span>
        <span>{q.type === 'list' ? `개당 ${q.points}점` : `${q.points}점`}</span>
      </p>
      <h1 className="qz-stage-prompt">{q.prompt}</h1>

      {q.type === 'choice' && (
        <ol className="qz-stage-options">
          {q.options.map(o => (
            <li key={o.id} className={revealed && o.correct ? 'is-correct' : ''}>
              <span>{o.label}</span>
              {revealed && <span className="qz-count">{grade.counts[o.id]}명</span>}
            </li>
          ))}
        </ol>
      )}
      {q.type === 'yesno' && (
        <ol className="qz-stage-options qz-two">
          {[['yes', '예'], ['no', '아니오']].map(([v, label]) => (
            <li key={v} className={revealed && q.answer === v ? 'is-correct' : ''}>
              <span>{label}</span>
              {revealed && <span className="qz-count">{grade.counts[v]}명</span>}
            </li>
          ))}
        </ol>
      )}
      {q.type === 'list' && <p className="qz-muted qz-center">입력칸 {q.slots}개</p>}

      {status !== 'revealed' && (
        <p className="qz-stage-count">응답 {responses.length} / {participants.length}{status === 'closed' && ' (마감됨)'}</p>
      )}

      {revealed && (q.type === 'text' || q.type === 'list') && scored && (
        <div className="qz-card">
          <h2>정답</h2>
          <ul className="qz-chips">
            {Object.entries(grade.counts).map(([label, n]) => <li key={label}>{label} <span className="qz-count">{n}명</span></li>)}
          </ul>
        </div>
      )}

      {revealed && !scored && <p className="qz-muted qz-center">정답을 정하지 않은 문제라 채점하지 않습니다.</p>}

      {revealed && scored && q.type !== 'list' && (
        <div className="qz-namelists">
          <NameList title="맞춘 사람" testid="names-correct" names={grade.correctNames} tone="good" />
          <NameList title="틀린 사람" testid="names-wrong" names={grade.wrongNames} tone="bad" />
          <NameList title="미응답" testid="names-none" names={grade.noAnswerNames} />
        </div>
      )}

      {revealed && scored && q.type === 'list' && (
        <div className="qz-namelists">
          <div className="qz-card qz-grow">
            <h2>맞춘 개수 순위</h2>
            <ol className="qz-rank" data-testid="list-ranking">
              {grade.listRanking.map(r => (
                <li key={r.id} data-rank={r.rank} data-name={r.name} data-value={r.count}>
                  <span className="qz-rank-no">{r.rank}위</span> <span>{r.name}</span> <span className="qz-count">{r.count}개</span>
                </li>
              ))}
            </ol>
          </div>
          <NameList title="미응답" testid="names-none" names={grade.noAnswerNames} />
        </div>
      )}

      {(status === 'closed' || revealed) && (q.type === 'text' || q.type === 'list') && (
        <div className="qz-card qz-accept">
          <div data-testid="unmatched">
            <h2>정답 목록에 없는 답</h2>
            {grade.unmatched.length === 0 ? <p className="qz-muted">없습니다</p> : (
              <ul className="qz-list">
                {grade.unmatched.map(u => (
                  <li key={u.key} className="qz-row">
                    <span>{`${u.value} ${u.count}명`}</span>
                    <span className="qz-row-actions">
                      <button type="button" className="qz-btn" disabled={busy} onClick={() => actions.changeAccepts([...accepts, { value: u.value, item: null }])}>
                        새 정답으로 인정
                      </button>
                      {q.type === 'list' && labels.length > 0 && (
                        <select
                          aria-label={`${u.value} 다른 표기로 묶기`} value="" disabled={busy}
                          onChange={e => actions.changeAccepts([...accepts, { value: u.value, item: Number(e.target.value) }])}
                        >
                          <option value="">다른 표기로 묶기</option>
                          {labels.map((l, i) => <option key={i} value={i}>{l}</option>)}
                        </select>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {accepts.length > 0 && (
            <div data-testid="accepted">
              <h3>인정한 답</h3>
              <ul className="qz-list">
                {accepts.map((a, i) => (
                  <li key={i} className="qz-row">
                    <span>{a.value}{a.item != null && ` (${labels[a.item]}의 다른 표기)`}</span>
                    <button type="button" className="qz-btn qz-ghost" disabled={busy} onClick={() => actions.changeAccepts(accepts.filter((_, j) => j !== i))}>
                      인정 취소
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="qz-stage-actions">
        {status === 'open' && <button type="button" className="qz-btn" disabled={busy} onClick={actions.close}>마감</button>}
        {status !== 'revealed' && <button type="button" className="qz-btn qz-primary" disabled={busy} onClick={actions.reveal}>정답 공개</button>}
        {revealed && (
          <button type="button" className="qz-btn" onClick={actions.toggleRanking}>{showRanking ? '순위 닫기' : '순위 보기'}</button>
        )}
        {revealed && (
          <button type="button" className="qz-btn qz-primary" disabled={busy} onClick={isLast ? actions.finish : actions.next}>
            {isLast ? '최종 결과' : '다음 문제'}
          </button>
        )}
      </div>

      {revealed && showRanking && (
        <div className="qz-card">
          <h2>지금까지 순위</h2>
          <Ranking participants={participants} testid="ranking" />
        </div>
      )}
    </section>
  );
}

function NameList({ title, testid, names, tone = '' }) {
  return (
    <div className={`qz-card qz-namelist ${tone}`}>
      <h2>{title} ({names.length})</h2>
      <ul data-testid={testid}>{names.map(n => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

function Ranking({ participants, testid }) {
  const rows = [...participants].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name, 'ko'));
  return (
    <ol className="qz-rank" data-testid={testid}>
      {rows.map(p => (
        <li key={p.id} data-rank={p.rank ?? ''} data-name={p.name} data-value={p.score} className={p.rank && p.rank <= 3 ? 'is-top' : ''}>
          <span className="qz-rank-no">{p.rank ? `${p.rank}위` : '-'}</span> <span>{p.name}</span> <span className="qz-count">{p.score}점</span>
        </li>
      ))}
    </ol>
  );
}
