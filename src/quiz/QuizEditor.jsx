// 퀴즈게임 편집기: 제목과 문제(객관식, 예/아니오, 주관식, 목록형)를 만들고 정답을 미리 넣어 저장한다
import { useEffect, useState } from 'react';
import { loadQuiz, saveQuiz } from './api';
import {
  MAX_SLOTS, TYPE_LABELS, changeType, cleanQuiz, newQuestion, randomId, toEditable, validateQuiz,
} from './model';

export default function QuizEditor({ id, go }) {
  const [quiz, setQuiz] = useState(id ? null : { id: null, title: '', questions: [] });
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadQuiz(id).then(q => setQuiz(toEditable(q))).catch(e => setErrors([e.message]));
  }, [id]);

  if (!quiz) return <p className="qz-loading">{errors[0] || '불러오는 중...'}</p>;

  const update = fn => {
    setQuiz(fn);
    setDirty(true);
    setStatus('');
  };
  const updateQuestion = (i, fn) => update(q => ({ ...q, questions: q.questions.map((x, j) => (j === i ? fn(x) : x)) }));
  const addQuestion = type => update(q => ({ ...q, questions: [...q.questions, newQuestion(type)] }));
  const move = (i, d) => update(q => {
    const list = [...q.questions];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    return { ...q, questions: list };
  });
  const remove = i => update(q => ({ ...q, questions: q.questions.filter((_, j) => j !== i) }));

  const save = async () => {
    const errs = validateQuiz(quiz);
    setErrors(errs);
    if (errs.length) return;
    setStatus('저장 중...');
    try {
      const saved = await saveQuiz(cleanQuiz(quiz));
      setQuiz(toEditable(saved));
      setDirty(false);
      setStatus('저장했습니다');
      if (!quiz.id) go({ edit: saved.id }, { replace: true });
    } catch (e) {
      setStatus('');
      setErrors([e.message]);
    }
  };

  const back = () => {
    if (dirty && !window.confirm('저장하지 않은 내용이 있습니다. 목록으로 갈까요?')) return;
    go({});
  };

  return (
    <div className="qz-page">
      <header className="qz-topbar">
        <button type="button" className="qz-link" onClick={back}>목록으로</button>
        <span className="qz-status" role="status">{status}</span>
        <button type="button" className="qz-btn qz-primary" onClick={save}>저장</button>
      </header>
      <main className="qz-main qz-editor">
        <div className="qz-field">
          <label htmlFor="qz-title">퀴즈 제목</label>
          <input
            id="qz-title" className="qz-input" value={quiz.title} placeholder="예 신입사원 교육 퀴즈"
            onChange={e => { const title = e.target.value; update(q => ({ ...q, title })); }}
          />
        </div>
        {errors.length > 0 && (
          <ul className="qz-error" role="alert">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        )}

        {quiz.questions.map((q, i) => (
          <QuestionEditor
            key={q.id} q={q} index={i} total={quiz.questions.length}
            onChange={patch => updateQuestion(i, x => ({ ...x, ...patch }))}
            onType={type => updateQuestion(i, x => changeType(x, type))}
            onMove={d => move(i, d)} onRemove={() => remove(i)}
          />
        ))}

        <div className="qz-add-row">
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <button key={type} type="button" className="qz-btn" onClick={() => addQuestion(type)}>+ {label}</button>
          ))}
        </div>
      </main>
    </div>
  );
}

function QuestionEditor({ q, index, total, onChange, onType, onMove, onRemove }) {
  const n = index + 1;
  return (
    <section className="qz-card qz-qedit" aria-label={`${n}번 문제`}>
      <div className="qz-qedit-head">
        <strong>{n}번 문제</strong>
        <label htmlFor={`${q.id}-type`} className="qz-small">유형</label>
        <select id={`${q.id}-type`} value={q.type} onChange={e => onType(e.target.value)}>
          {Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select>
        <label htmlFor={`${q.id}-points`} className="qz-small">{q.type === 'list' || q.type === 'multi' ? '개당 배점' : '배점'}</label>
        <input
          id={`${q.id}-points`} className="qz-num" type="number" min="0" value={q.points}
          onChange={e => onChange({ points: e.target.value })}
        />
        <span className="qz-qedit-tools">
          <button type="button" aria-label={`${n}번 문제 위로`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" aria-label={`${n}번 문제 아래로`} disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" className="qz-ghost" onClick={onRemove}>문제 삭제</button>
        </span>
      </div>
      <div className="qz-field">
        <label htmlFor={`${q.id}-prompt`}>문제</label>
        <textarea
          id={`${q.id}-prompt`} className="qz-input" rows={2} value={q.prompt}
          onChange={e => onChange({ prompt: e.target.value })}
        />
      </div>
      {(q.type === 'choice' || q.type === 'multi') && <ChoiceEditor q={q} onChange={onChange} />}
      {q.type === 'yesno' && <YesNoEditor q={q} onChange={onChange} />}
      {(q.type === 'text' || q.type === 'list') && <AnswersEditor q={q} onChange={onChange} />}
    </section>
  );
}

// 객관식(정답 하나, 동그라미)과 여러 개 고르기(정답 여러 개, 네모 + 고를 개수)가 같이 쓴다
function ChoiceEditor({ q, onChange }) {
  const multi = q.type === 'multi';
  const setOption = (j, patch) => onChange({ options: q.options.map((o, k) => (k === j ? { ...o, ...patch } : o)) });
  const setCorrect = j => onChange({
    options: q.options.map((o, k) => (multi ? (k === j ? { ...o, correct: !o.correct } : o) : { ...o, correct: k === j })),
  });
  const hasCorrect = q.options.some(o => o.correct);
  const correctCount = q.options.filter(o => o.correct).length;
  return (
    <div className="qz-options">
      {multi && (
        <div className="qz-inline">
          <label htmlFor={`${q.id}-pick`}>고를 개수</label>
          <input
            id={`${q.id}-pick`} className="qz-num" type="number" min="1" max={q.options.length} value={q.pick}
            onChange={e => onChange({ pick: e.target.value })}
          />
          <span className="qz-small">정답으로 체크한 보기 {correctCount}개</span>
        </div>
      )}
      {q.options.map((o, j) => (
        <div key={o.id} className="qz-option-row">
          <input
            type={multi ? 'checkbox' : 'radio'} name={`${q.id}-correct`} aria-label={`${j + 1}번 보기 정답`}
            checked={o.correct} onChange={() => setCorrect(j)}
          />
          <input
            className="qz-input" aria-label={`${j + 1}번 보기`} placeholder={`보기 ${j + 1}`} value={o.label}
            onChange={e => setOption(j, { label: e.target.value })}
          />
          <button
            type="button" aria-label={`${j + 1}번 보기 삭제`} disabled={q.options.length <= 2}
            onClick={() => onChange({ options: q.options.filter((_, k) => k !== j) })}
          >×</button>
        </div>
      ))}
      <div className="qz-option-tools">
        <button
          type="button" className="qz-btn"
          onClick={() => onChange({ options: [...q.options, { id: randomId(), label: '', correct: false }] })}
        >+ 보기 추가</button>
        {hasCorrect && (
          <button type="button" className="qz-btn qz-ghost" onClick={() => onChange({ options: q.options.map(o => ({ ...o, correct: false })) })}>
            정답 지우기
          </button>
        )}
      </div>
      <p className="qz-hint">
        {multi
          ? '정답 보기를 모두 체크합니다. 수강생은 고를 개수만큼 누른 순서대로 번호를 붙여 고르고, 맞게 고른 개수만큼 점수를 받습니다. 고른 순서는 점수에 들어가지 않습니다.'
          : '왼쪽 동그라미로 정답을 고릅니다.'}
        {' '}정답을 고르지 않으면 채점하지 않고 응답만 모읍니다.
      </p>
    </div>
  );
}

function YesNoEditor({ q, onChange }) {
  const options = [['yes', '예'], ['no', '아니오'], [null, '정답 없음']];
  return (
    <fieldset className="qz-yesno">
      <legend>정답</legend>
      {options.map(([value, label]) => {
        const id = `${q.id}-yn-${value ?? 'none'}`;
        return (
          <span key={label} className="qz-radio">
            <input id={id} type="radio" name={`${q.id}-yn`} checked={q.answer === value} onChange={() => onChange({ answer: value })} />
            <label htmlFor={id}>{label}</label>
          </span>
        );
      })}
    </fieldset>
  );
}

function AnswersEditor({ q, onChange }) {
  const setAnswer = (k, patch) => onChange({ answers: q.answers.map((a, j) => (j === k ? { ...a, ...patch } : a)) });
  return (
    <div className="qz-answers">
      {q.type === 'list' && (
        <div className="qz-inline">
          <label htmlFor={`${q.id}-slots`}>입력칸 수</label>
          <input
            id={`${q.id}-slots`} className="qz-num" type="number" min="1" max={MAX_SLOTS} value={q.slots}
            onChange={e => onChange({ slots: e.target.value })}
          />
        </div>
      )}
      <p className="qz-hint">
        {q.type === 'list'
          ? '수강생이 쓴 답 중 아래 정답과 같은 것의 개수만큼 점수를 줍니다. 같은 답을 두 번 써도 하나로 셉니다.'
          : '아래 정답 중 하나와 같으면 정답입니다.'}
        {' '}띄어쓰기, 대소문자, 문장부호는 무시합니다. 정답을 비워 두면 채점하지 않고 응답만 모읍니다.
      </p>
      {q.answers.map((a, k) => (
        <div key={k} className="qz-answer-row">
          <input
            className="qz-input" aria-label={`정답 ${k + 1}`} placeholder="정답" value={a.value}
            onChange={e => setAnswer(k, { value: e.target.value })}
          />
          <input
            className="qz-input" aria-label={`정답 ${k + 1} 다른 표기`} placeholder="다른 표기, 쉼표로 구분 (예 Paris, 빠리)"
            value={a.aliasText ?? ''} onChange={e => setAnswer(k, { aliasText: e.target.value })}
          />
          <button
            type="button" aria-label={`정답 ${k + 1} 삭제`}
            onClick={() => onChange({ answers: q.answers.filter((_, j) => j !== k) })}
          >×</button>
        </div>
      ))}
      <button
        type="button" className="qz-btn"
        onClick={() => onChange({ answers: [...q.answers, { value: '', aliasText: '' }] })}
      >+ 정답 추가</button>
    </div>
  );
}
