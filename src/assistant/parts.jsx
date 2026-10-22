// 노션 비서 공통 화면 부품: 머리글, 빠른 입력, 항목 한 줄, 진행 고리, 알림, 아래 탭
import { useEffect, useMemo, useRef, useState } from 'react';
import { timeText, whenText, WEEKDAYS, dayDiff, dayKey, toDate, ymd } from './dates.js';
import { parseQuickInput } from './parse.js';
import { TABS, TYPES, greeting } from './model.js';

export function Ring({ value, size = 64, stroke = 7, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} className="ring-value" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring-text">{pct}</text>
    </svg>
  );
}

export function Header({ now, stats, sync, google, onSync, onSettings, home }) {
  const date = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일`;
  const left = stats.tasksTotal - stats.tasksDone;
  const parts = [
    stats.events ? `일정 ${stats.events}개` : '',
    left ? `할 일 ${left}개 남음` : stats.tasksTotal ? '오늘 할 일 끝' : '',
    stats.overdue ? `밀린 일 ${stats.overdue}개` : '',
  ].filter(Boolean);
  let syncLabel = '구글 연결';
  if (sync.running) syncLabel = sync.text || '동기화 중';
  else if (google.email && !google.valid) syncLabel = '구글 동기화';
  else if (google.email) syncLabel = sync.at ? `동기화 ${sync.at}` : '구글 동기화';
  return (
    <header className="nb-header">
      <div className="nb-topbar">
        <a className="nb-back" href="/">‹ 앱 모음</a>
        <div className="nb-top-actions">
          <button type="button" className={`nb-sync ${sync.running ? 'is-running' : ''} ${sync.error ? 'is-error' : ''}`} onClick={onSync} disabled={sync.running} title={sync.error || ''}>
            <span className="nb-sync-dot" aria-hidden="true" />
            {syncLabel}
          </button>
          {home && <a className="nb-icon-btn" href={home} target="_blank" rel="noreferrer" aria-label="노션에서 열기" title="노션에서 열기">N</a>}
          <button type="button" className="nb-icon-btn" onClick={onSettings} aria-label="설정">⚙︎</button>
        </div>
      </div>
      <div className="nb-hero">
        <div>
          <p className="nb-date">{date}</p>
          <h1 className="nb-greeting">{greeting(now)}</h1>
          <p className="nb-sub">{parts.length ? parts.join(' · ') : '오늘은 비어 있어요. 아래에 한 줄로 적어 보세요.'}</p>
        </div>
        <div className="nb-score">
          <Ring value={stats.score} label={`오늘 점수 ${stats.score}점`} />
          <div className="nb-score-lines">
            <span>할 일 <b>{stats.tasksDone}/{stats.tasksTotal}</b></span>
            <span>습관 <b>{stats.habitsDone}/{stats.habitsTotal}</b></span>
          </div>
        </div>
      </div>
    </header>
  );
}

const EXAMPLES = ['내일 오후 3시 치과 @강남', '금요일까지 보고서 #업무 !', '언젠가 제주도 한 달 살기', '메모: 회사 와이파이 비번', '다음 주 월요일 10시 팀 회의'];

export function QuickAdd({ now, areas, onAdd, initial = '' }) {
  const [text, setText] = useState(initial);
  const [type, setType] = useState(null);
  const [hint, setHint] = useState(0);
  const input = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setHint((h) => (h + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(t);
  }, []);
  const parsed = useMemo(() => parseQuickInput(text, now, { areas }), [text, now, areas]);
  const effective = type || parsed.type;
  const submit = (e) => {
    e.preventDefault();
    if (!parsed.title) return;
    onAdd({ ...parsed, type: effective, ...(effective !== parsed.type ? retype(parsed, effective) : {}) });
    setText('');
    setType(null);
    input.current?.focus();
  };
  const areaNames = parsed.areaIds.map((id) => areas.find((a) => a.id === id)).filter(Boolean);
  return (
    <form className="nb-quick" onSubmit={submit}>
      <div className="nb-quick-row">
        <span className="nb-quick-plus" aria-hidden="true">＋</span>
        <input
          ref={input}
          value={text}
          onChange={(e) => { setText(e.target.value); if (!e.target.value) setType(null); }}
          placeholder={EXAMPLES[hint]}
          aria-label="빠른 입력"
          enterKeyHint="done"
          autoComplete="off"
        />
        <button type="submit" className="nb-quick-go" disabled={!parsed.title}>추가</button>
      </div>
      {text.trim() && (
        <div className="nb-quick-preview" aria-live="polite">
          <div className="nb-seg" role="radiogroup" aria-label="종류">
            {Object.entries(TYPES).map(([key, t]) => (
              <button
                type="button" key={key} role="radio" aria-checked={effective === key}
                className={`nb-seg-btn type-${key} ${effective === key ? 'is-on' : ''}`}
                onClick={() => setType(key)}
              >{t.icon} {t.label}</button>
            ))}
          </div>
          <div className="nb-chips">
            {parsed.title && <span className="nb-chip is-title">{parsed.title}</span>}
            {parsed.start && <span className="nb-chip">📅 {whenText(parsed.start, parsed.end, now)}{parsed.deadline ? ' 까지' : ''}</span>}
            {parsed.important && <span className="nb-chip is-warn">⭐ 중요</span>}
            {parsed.urgent && <span className="nb-chip is-warn">🔥 급함</span>}
            {parsed.place && <span className="nb-chip">📍 {parsed.place}</span>}
            {areaNames.map((a) => <span key={a.id} className="nb-chip">{a.icon} {a.name}</span>)}
            {parsed.tags.map((t) => <span key={t} className="nb-chip">#{t}</span>)}
            {parsed.link && <span className="nb-chip">🔗 링크</span>}
          </div>
        </div>
      )}
    </form>
  );
}

// 미리보기에서 종류를 바꿨을 때 날짜 모양을 맞춘다(할 일은 끝 없음, 언젠가는 날짜 없음)
function retype(parsed, type) {
  if (type === 'task') return { end: null };
  if (type === 'someday' || type === 'info') return { start: null, end: null };
  return {};
}

export function ItemRow({ item, now, areas = [], onToggle, onOpen, showDate = true, extra = null }) {
  const area = (item.areaIds || []).map((id) => areas.find((a) => a.id === id)).filter(Boolean);
  const overdue = item.type === 'task' && !item.done && item.start && dayKey(item.start) < ymd(now);
  const diff = item.start ? dayDiff(now, toDate(item.start)) : null;
  const meta = [
    showDate && item.start ? whenText(item.start, item.end, now) : (!showDate && timeText(item.start) && item.type === 'task' ? timeText(item.start) : ''),
    item.place ? `📍 ${item.place}` : '',
    ...area.map((a) => `${a.icon} ${a.name}`),
    ...(item.tags || []).map((t) => `#${t}`),
  ].filter(Boolean);
  return (
    <li className={`nb-row type-${item.type} ${item.done ? 'is-done' : ''} ${item.pending ? 'is-pending' : ''}`}>
      {item.type === 'task' ? (
        <button
          type="button" className="nb-check" onClick={() => onToggle(item)} disabled={item.pending}
          aria-label={`${item.title} ${item.done ? '완료 취소' : '완료'}`} aria-pressed={item.done}
        >{item.done ? '✓' : ''}</button>
      ) : item.type === 'event' ? (
        <span className="nb-time">{item.start && timeText(item.start) ? timeText(item.start) : '종일'}</span>
      ) : (
        <span className="nb-kind" aria-hidden="true">{TYPES[item.type].icon}</span>
      )}
      <button type="button" className="nb-row-main" onClick={() => onOpen(item)} disabled={item.pending}>
        <span className="nb-row-title">
          {item.important && <span className="nb-flag" title="중요">⭐</span>}
          {item.urgent && <span className="nb-flag" title="급함">🔥</span>}
          {item.title}
        </span>
        {meta.length > 0 && <span className="nb-row-meta">{meta.join(' · ')}</span>}
        {item.type === 'info' && item.memo && <span className="nb-row-memo">{item.memo}</span>}
      </button>
      <span className="nb-row-side">
        {overdue && <span className="nb-badge is-warn">{-diff}일 지남</span>}
        {!overdue && item.type === 'task' && !item.done && diff === 0 && showDate && <span className="nb-badge is-today">오늘</span>}
        {(item.gcalId || item.gtaskId) && <span className="nb-g" title="구글에 연동됨">G</span>}
        {item.pending && <span className="nb-spin" aria-label="저장 중" />}
        {extra}
      </span>
    </li>
  );
}

export function Section({ title, count, action, children, tone }) {
  return (
    <section className={`nb-section ${tone ? `tone-${tone}` : ''}`}>
      <div className="nb-section-head">
        <h2>{title}{count !== undefined && <span className="nb-count">{count}</span>}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon = '🌤', children }) {
  return <p className="nb-empty"><span aria-hidden="true">{icon}</span> {children}</p>;
}

export function Toast({ toast, onUndo, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, toast.undo ? 5000 : 3200);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className={`nb-toast ${toast.error ? 'is-error' : ''}`} role="status">
      <span>{toast.text}</span>
      {toast.undo && <button type="button" onClick={onUndo}>되돌리기</button>}
    </div>
  );
}

export function BottomNav({ tab, onTab, counts }) {
  return (
    <nav className="nb-nav" aria-label="화면">
      {TABS.map((t) => (
        <button key={t.key} type="button" className={tab === t.key ? 'is-on' : ''} aria-current={tab === t.key ? 'page' : undefined} onClick={() => onTab(t.key)}>
          <span className="nb-nav-icon" aria-hidden="true">{t.icon}</span>
          <span className="nb-nav-label">{t.label}</span>
          {counts[t.key] ? <span className="nb-nav-count">{counts[t.key]}</span> : null}
        </button>
      ))}
    </nav>
  );
}

