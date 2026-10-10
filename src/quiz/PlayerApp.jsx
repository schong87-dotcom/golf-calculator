// 퀴즈게임 수강생 화면: 이름 입장 → 대기 → 문제 풀기 → 정답 확인과 내 순위 (로그인 없이 이 기기의 토큰으로 참여)
import { useEffect, useState } from 'react';
import { joinQuiz, playerState, submitAnswer } from './api';
import { hostTopic, ping, stateTopic, useLive, useSerial } from './live';
import { toggleSelection } from './model';

function readToken(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeToken(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* 저장이 막힌 브라우저는 새로고침하면 다시 이름을 넣는다 */ }
}

// 제출을 다시 시도할 필요 없이 화면만 새로 읽으면 되는 오류
const STALE = ['quiz_already_answered', 'quiz_not_open', 'quiz_wrong_question'];

export default function PlayerApp({ code }) {
  const key = `quiz-token-${code}`;
  const [token, setToken] = useState(() => readToken(key));
  const [state, setState] = useState(null);
  const [missing, setMissing] = useState(false);

  const refresh = useSerial(async () => {
    try {
      const s = await playerState(code, token);
      if (token && !s.me) {
        writeToken(key, null);
        setToken(null);
      }
      setState(s);
    } catch (e) {
      if (e.code === 'quiz_not_found') setMissing(true);
    }
  });

  useEffect(() => { refresh(); }, [refresh, token]);
  useLive(stateTopic(code), 'state', refresh);

  const onJoined = newToken => {
    writeToken(key, newToken);
    setToken(newToken);
    ping(hostTopic(code), 'activity');
  };

  const onSubmit = async answer => {
    try {
      await submitAnswer(code, token, state.question.id, answer);
      setState(s => ({ ...s, myAnswer: answer }));
      ping(hostTopic(code), 'activity');
    } catch (e) {
      if (!STALE.includes(e.code)) throw e;
    }
    refresh();
  };

  if (missing) {
    return (
      <Shell>
        <p className="qz-big">입장코드 {code}를 찾을 수 없습니다.</p>
        <a className="qz-btn" href="/quiz/">입장코드 다시 입력</a>
      </Shell>
    );
  }
  if (!state) return <Shell><p className="qz-muted">불러오는 중...</p></Shell>;

  const { session, me, question } = state;
  if (!me) return <Shell title={session.title}><JoinForm code={code} session={session} onJoined={onJoined} /></Shell>;

  return (
    <Shell title={session.title} me={me}>
      {session.status === 'lobby' && (
        <div className="qz-center">
          <p className="qz-big">{me.name}님, 곧 시작합니다</p>
          <p className="qz-muted">참가 {session.participants}명</p>
        </div>
      )}
      {question && session.status !== 'ended' && (
        <>
          <p className="qz-progress">{session.index + 1}번 문제 ({session.index + 1} / {session.total})</p>
          <h1 className="qz-prompt">{question.prompt}</h1>
          {session.status === 'open' && !state.myAnswer && (
            <AnswerForm key={question.id} question={question} onSubmit={onSubmit} />
          )}
          {session.status === 'open' && state.myAnswer && (
            <div className="qz-center">
              <p className="qz-big">제출했습니다</p>
              <p className="qz-muted">정답 공개를 기다리는 중입니다.</p>
              <MyAnswer question={question} answer={state.myAnswer} />
            </div>
          )}
          {session.status === 'closed' && (
            <div className="qz-center">
              <p className="qz-big">마감되었습니다</p>
              <MyAnswer question={question} answer={state.myAnswer} />
            </div>
          )}
          {session.status === 'revealed' && <Result state={state} />}
        </>
      )}
      {session.status === 'ended' && (
        <div className="qz-center">
          <p className="qz-big">퀴즈가 끝났습니다</p>
          <MyScore me={me} session={session} />
          <ol className="qz-podium">
            {(state.podium || []).map(p => <li key={p.name}>{p.rank}위 {p.name} {p.score}점</li>)}
          </ol>
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, me, children }) {
  return (
    <div className="qz-player">
      <header className="qz-player-head">
        <span className="qz-player-title">{title || '퀴즈게임'}</span>
        {me && <span className="qz-player-me">{me.name} {me.score}점</span>}
      </header>
      <main className="qz-player-main">{children}</main>
    </div>
  );
}

function JoinForm({ code, session, onJoined }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session.status === 'ended') return <p className="qz-big">이미 끝난 퀴즈입니다.</p>;

  const join = async e => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await joinQuiz(code, name);
      onJoined(r.token);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="qz-join" onSubmit={join}>
      <p className="qz-muted">입장코드 {code}</p>
      <label htmlFor="qz-name" className="qz-join-label">이름</label>
      <input
        id="qz-name" className="qz-input" value={name} maxLength={20} autoComplete="name"
        placeholder="화면에 보일 이름" onChange={e => setName(e.target.value)}
      />
      <button type="submit" className="qz-btn qz-primary qz-wide" disabled={!name.trim() || busy}>입장</button>
      {error && <p className="qz-error" role="alert">{error}</p>}
    </form>
  );
}

function AnswerForm({ question, onSubmit }) {
  const slots = question.type === 'list' ? question.slots : 1;
  const [choice, setChoice] = useState(null);
  const [picked, setPicked] = useState([]);
  const [full, setFull] = useState(false);
  const [texts, setTexts] = useState(() => Array(slots).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  let answer = null;
  if (question.type === 'choice' && choice) answer = { optionId: choice };
  if (question.type === 'yesno' && choice) answer = { value: choice };
  if (question.type === 'text' && texts[0].trim()) answer = { text: texts[0] };
  if (question.type === 'list' && texts.some(t => t.trim())) answer = { items: texts };
  if (question.type === 'multi' && picked.length === question.pick) answer = { optionIds: picked };

  // 다시 누르면 빠지고 번호가 당겨진다. 다 고른 뒤 새 보기를 누르면 그대로 두고 안내만 띄운다
  const tap = id => {
    const next = toggleSelection(picked, id, question.pick);
    setFull(next === picked);
    setPicked(next);
  };

  const submit = async e => {
    e.preventDefault();
    if (!answer || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(answer);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const choices = question.type === 'choice'
    ? question.options.map(o => [o.id, o.label])
    : question.type === 'yesno' ? [['yes', '예'], ['no', '아니오']] : null;

  return (
    <form className="qz-answer" onSubmit={submit}>
      {choices && (
        <div className="qz-choices">
          {choices.map(([value, label]) => (
            <button
              key={value} type="button" aria-pressed={choice === value}
              className={`qz-choice ${choice === value ? 'is-selected' : ''}`} onClick={() => setChoice(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {question.type === 'multi' && (
        <>
          <p className="qz-pick-count">선택 {picked.length} / {question.pick}</p>
          <div className="qz-choices qz-grid">
            {question.options.map(o => {
              const n = picked.indexOf(o.id) + 1;
              return (
                <button
                  key={o.id} type="button" aria-label={o.label} aria-pressed={n > 0} data-order={n || ''}
                  className={`qz-choice qz-multi ${n ? 'is-selected' : ''}`} onClick={() => tap(o.id)}
                >
                  <span className="qz-order" aria-hidden="true">{n || ''}</span>
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>
          {full && (
            <p className="qz-hint" role="status">{question.pick}개까지 고를 수 있습니다. 바꾸려면 고른 것을 다시 눌러 빼세요.</p>
          )}
        </>
      )}
      {!choices && question.type !== 'multi' && texts.map((t, i) => (
        <input
          key={i} className="qz-input" aria-label={`답 ${i + 1}`} value={t} maxLength={100}
          placeholder={slots > 1 ? `${i + 1}번째 답` : '답을 쓰세요'}
          onChange={e => setTexts(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
        />
      ))}
      <button type="submit" className="qz-btn qz-primary qz-wide" disabled={!answer || busy}>제출</button>
      {error && <p className="qz-error" role="alert">{error}</p>}
    </form>
  );
}

function answerLabel(question, answer) {
  if (!answer) return '';
  if (question.type === 'choice') return question.options.find(o => o.id === answer.optionId)?.label ?? '';
  if (question.type === 'yesno') return answer.value === 'yes' ? '예' : '아니오';
  if (question.type === 'text') return answer.text;
  if (question.type === 'multi') {
    return (answer.optionIds || []).map(id => question.options.find(o => o.id === id)?.label).filter(Boolean).join(', ');
  }
  return answer.items.filter(s => s.trim()).join(', ');
}

function MyAnswer({ question, answer }) {
  if (!answer) return <p className="qz-muted">답을 내지 않았습니다.</p>;
  return <p className="qz-myanswer">내 답 {answerLabel(question, answer)}</p>;
}

function correctText(question, reveal) {
  if (question.type === 'choice' || question.type === 'multi') {
    return question.options.filter(o => reveal.correctOptionIds.includes(o.id)).map(o => o.label).join(', ');
  }
  if (question.type === 'yesno') return reveal.answer === 'yes' ? '예' : '아니오';
  return (reveal.answers || []).join(', ');
}

function Result({ state }) {
  const { question, reveal, myResult, myAnswer, me, session } = state;
  if (!reveal) return <p className="qz-muted">정답을 불러오는 중...</p>;
  let verdict = '오답';
  if (!reveal.scored) verdict = '채점하지 않는 문제입니다';
  else if (!myAnswer) verdict = '응답하지 않았습니다';
  else if (myResult?.correct) verdict = '정답!';
  const matched = myResult?.matched || [];

  return (
    <div className="qz-center">
      <p className={`qz-verdict ${myResult?.correct ? 'is-correct' : ''}`}>{verdict}</p>
      {reveal.scored && myAnswer && <p className="qz-points">+{myResult?.points ?? 0}점</p>}
      {reveal.scored && <p className="qz-correct">정답 {correctText(question, reveal)}</p>}
      {(question.type === 'list' || question.type === 'multi') && myAnswer && (
        <p className="qz-matched">맞춘 답 {matched.length ? matched.join(', ') : '없음'} ({matched.length}개)</p>
      )}
      <MyAnswer question={question} answer={myAnswer} />
      <MyScore me={me} session={session} />
    </div>
  );
}

function MyScore({ me, session }) {
  return (
    <p className="qz-score">내 점수 {me.score}점, {session.participants}명 중 {me.rank ?? '-'}위</p>
  );
}
