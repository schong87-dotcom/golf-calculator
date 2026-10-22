// 노션 비서의 아래에서 올라오는 편집 창: 항목 편집, 습관 편집, 설정(구글 캘린더 고르기, 노션 바로가기)
import { useEffect, useState } from 'react';
import { TYPES } from './model.js';
import { addDays, isAllDay, timeText, toDate, toLocalISO, ymd } from './dates.js';

export function Sheet({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="nb-sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="nb-sheet-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="nb-sheet">
        <div className="nb-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="nb-icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="nb-sheet-body">{children}</div>
        {footer && <div className="nb-sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

function toForm(item) {
  const start = item.start ? toDate(item.start) : null;
  const end = item.end ? toDate(item.end) : null;
  return {
    ...item,
    date: start ? ymd(start) : '',
    time: item.start && !isAllDay(item.start) ? timeText(item.start) : '',
    endDate: end && ymd(end) !== ymd(start) ? ymd(end) : '',
    endTime: item.end && !isAllDay(item.end) ? timeText(item.end) : '',
    tagsText: (item.tags || []).join(', '),
  };
}

function fromForm(form) {
  let start = null;
  let end = null;
  if (form.date && form.type !== 'info') {
    if (form.time) {
      const s = new Date(`${form.date}T${form.time}`);
      start = toLocalISO(s);
      if (form.type === 'event') {
        if (form.endTime) {
          let e = new Date(`${form.endDate || form.date}T${form.endTime}`);
          if (e <= s) e = addDays(e, 1);
          end = toLocalISO(e);
        } else {
          end = toLocalISO(new Date(s.getTime() + 3_600_000));
        }
      }
    } else {
      start = form.date;
      if (form.type === 'event' && form.endDate && form.endDate > form.date) end = form.endDate;
    }
  }
  const rest = { ...form };
  for (const key of ['date', 'time', 'endDate', 'endTime', 'tagsText']) delete rest[key];
  return {
    ...rest,
    title: form.title.trim(),
    start,
    end,
    tags: form.tagsText.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
  };
}

export function ItemSheet({ item, areas, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => toForm(item));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isNew = !item.id || String(item.id).startsWith('new-');
  const save = (e) => {
    e?.preventDefault();
    if (!form.title.trim()) return;
    const next = fromForm(form);
    if (next.done && !item.done) next.doneAt = toLocalISO(new Date());
    if (!next.done) next.doneAt = null;
    onSave(next);
  };
  return (
    <Sheet
      title={isNew ? '새로 적기' : `${TYPES[form.type].icon} ${TYPES[form.type].label} 편집`}
      onClose={onClose}
      footer={(
        <>
          {!isNew && <button type="button" className="nb-btn is-danger" onClick={() => onDelete(item)}>삭제</button>}
          <span className="nb-grow" />
          {item.url && <a className="nb-btn" href={item.url} target="_blank" rel="noreferrer">노션</a>}
          {item.googleUrl && <a className="nb-btn" href={item.googleUrl} target="_blank" rel="noreferrer">구글</a>}
          <button type="submit" form="nb-item-form" className="nb-btn is-primary" disabled={!form.title.trim()}>저장</button>
        </>
      )}
    >
      <form id="nb-item-form" className="nb-form" onSubmit={save}>
        <label className="nb-field">
          <span>제목</span>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} aria-label="제목" autoFocus={isNew} />
        </label>
        <div className="nb-seg" role="radiogroup" aria-label="종류">
          {Object.entries(TYPES).map(([key, t]) => (
            <button type="button" key={key} role="radio" aria-checked={form.type === key} className={`nb-seg-btn type-${key} ${form.type === key ? 'is-on' : ''}`} onClick={() => set({ type: key })}>{t.icon} {t.label}</button>
          ))}
        </div>
        {form.type !== 'info' && (
          <div className="nb-field-row">
            <label className="nb-field">
              <span>{form.type === 'task' ? '기한' : '날짜'}</span>
              <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} aria-label="날짜" />
            </label>
            <label className="nb-field">
              <span>{form.type === 'event' ? '시작' : '시각'}</span>
              <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} aria-label="시각" />
            </label>
            {form.type === 'event' && (
              <label className="nb-field">
                <span>끝</span>
                <input type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} aria-label="끝 시각" disabled={!form.time} />
              </label>
            )}
            {form.date && <button type="button" className="nb-link" onClick={() => set({ date: '', time: '', endTime: '', endDate: '' })}>날짜 지우기</button>}
          </div>
        )}
        {form.type === 'event' && !form.time && form.date && (
          <label className="nb-field">
            <span>여러 날이면 끝나는 날</span>
            <input type="date" value={form.endDate} min={form.date} onChange={(e) => set({ endDate: e.target.value })} aria-label="끝나는 날" />
          </label>
        )}
        {form.type === 'task' && (
          <div className="nb-toggles">
            <label className={`nb-toggle ${form.important ? 'is-on' : ''}`}><input type="checkbox" checked={form.important} onChange={(e) => set({ important: e.target.checked })} />⭐ 중요</label>
            <label className={`nb-toggle ${form.urgent ? 'is-on' : ''}`}><input type="checkbox" checked={form.urgent} onChange={(e) => set({ urgent: e.target.checked })} />🔥 급함</label>
            <label className={`nb-toggle ${form.done ? 'is-on' : ''}`}><input type="checkbox" checked={form.done} onChange={(e) => set({ done: e.target.checked })} />✓ 완료</label>
          </div>
        )}
        {areas.length > 0 && (
          <div className="nb-field">
            <span>영역</span>
            <div className="nb-chips">
              {areas.map((a) => {
                const on = form.areaIds?.includes(a.id);
                return (
                  <button type="button" key={a.id} aria-pressed={on} className={`nb-chip is-pick ${on ? 'is-on' : ''}`}
                    onClick={() => set({ areaIds: on ? form.areaIds.filter((x) => x !== a.id) : [...(form.areaIds || []), a.id] })}>{a.icon} {a.name}</button>
                );
              })}
            </div>
          </div>
        )}
        {form.type === 'event' && (
          <label className="nb-field"><span>장소</span><input value={form.place} onChange={(e) => set({ place: e.target.value })} aria-label="장소" /></label>
        )}
        <label className="nb-field">
          <span>메모</span>
          <textarea rows={form.type === 'info' ? 6 : 3} value={form.memo} onChange={(e) => set({ memo: e.target.value })} aria-label="메모" />
        </label>
        {(form.type === 'info' || form.link) && (
          <label className="nb-field"><span>링크</span><input type="url" value={form.link} onChange={(e) => set({ link: e.target.value })} aria-label="링크" /></label>
        )}
        {(form.type === 'info' || form.tags?.length > 0) && (
          <label className="nb-field"><span>태그 (쉼표로 구분)</span><input value={form.tagsText} onChange={(e) => set({ tagsText: e.target.value })} aria-label="태그" /></label>
        )}
        {(item.gcalId || item.gtaskId) && <p className="nb-hint">구글 {item.gcalId ? '캘린더' : '할 일'}와 이어져 있어 저장하면 구글에도 반영됩니다.</p>}
      </form>
    </Sheet>
  );
}

const TIMES = ['🌅 아침', '☀️ 낮', '🌙 저녁', '🔁 언제든'];

export function HabitSheet({ habit, onSave, onClose }) {
  const [form, setForm] = useState(() => habit || { name: '', icon: '✅', timeOfDay: '🔁 언제든', weeklyGoal: 7, active: true });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = (e) => {
    e.preventDefault();
    if (form.name.trim()) onSave({ ...form, name: form.name.trim() });
  };
  return (
    <Sheet title={habit ? '습관 편집' : '새 습관'} onClose={onClose}
      footer={(
        <>
          {habit && <button type="button" className="nb-btn" onClick={() => onSave({ ...form, active: !form.active })}>{form.active ? '쉬게 하기' : '다시 시작'}</button>}
          <span className="nb-grow" />
          <button type="submit" form="nb-habit-form" className="nb-btn is-primary" disabled={!form.name.trim()}>저장</button>
        </>
      )}>
      <form id="nb-habit-form" className="nb-form" onSubmit={save}>
        <div className="nb-field-row">
          <label className="nb-field is-narrow"><span>아이콘</span><input value={form.icon} maxLength={4} onChange={(e) => set({ icon: e.target.value })} aria-label="아이콘" /></label>
          <label className="nb-field"><span>습관</span><input value={form.name} onChange={(e) => set({ name: e.target.value })} aria-label="습관 이름" autoFocus={!habit} placeholder="예 스트레칭 10분" /></label>
        </div>
        <div className="nb-seg" role="radiogroup" aria-label="시간대">
          {TIMES.map((t) => <button type="button" key={t} role="radio" aria-checked={form.timeOfDay === t} className={`nb-seg-btn ${form.timeOfDay === t ? 'is-on' : ''}`} onClick={() => set({ timeOfDay: t })}>{t}</button>)}
        </div>
        <label className="nb-field">
          <span>일주일에 몇 번 <b>{form.weeklyGoal}회</b></span>
          <input type="range" min="1" max="7" value={form.weeklyGoal} onChange={(e) => set({ weeklyGoal: Number(e.target.value) })} aria-label="주간 목표" />
        </label>
      </form>
    </Sheet>
  );
}

export function SettingsSheet({ google, calendars, onConnect, onDisconnect, onSaveGoogle, onSync, onClose, home, sync }) {
  const [read, setRead] = useState(google.readCalendars);
  const [write, setWrite] = useState(google.writeCalendar);
  const changed = write !== google.writeCalendar || read.join() !== google.readCalendars.join();
  const writable = calendars.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer');
  const idOf = (c) => (c.primary ? 'primary' : c.id);
  return (
    <Sheet title="설정" onClose={onClose}>
      <div className="nb-form">
        <section className="nb-card">
          <h3>구글</h3>
          {google.email ? (
            <>
              <p>{google.email} 계정과 이어져 있습니다. {google.lastSync && `마지막 동기화 ${new Date(google.lastSync).toLocaleString('ko-KR')}`}</p>
              {calendars.length > 0 ? (
                <>
                  <p className="nb-hint">노션으로 가져올 캘린더</p>
                  <div className="nb-chips">
                    {calendars.map((c) => {
                      const id = idOf(c);
                      const on = read.includes(id);
                      return <button key={c.id} type="button" aria-pressed={on} className={`nb-chip is-pick ${on ? 'is-on' : ''}`} onClick={() => setRead(on ? read.filter((x) => x !== id) : [...read, id])}>{c.summaryOverride || c.summary}</button>;
                    })}
                  </div>
                  <label className="nb-field">
                    <span>앱에서 만든 일정을 넣을 캘린더</span>
                    <select value={write} onChange={(e) => setWrite(e.target.value)} aria-label="일정을 넣을 캘린더">
                      {writable.map((c) => <option key={c.id} value={idOf(c)}>{c.summaryOverride || c.summary}</option>)}
                    </select>
                  </label>
                  <button type="button" className="nb-btn is-primary" disabled={!changed || !read.length} onClick={() => onSaveGoogle({ readCalendars: read, writeCalendar: write })}>캘린더 설정 저장</button>
                </>
              ) : <p className="nb-hint">캘린더 목록은 구글 연결이 살아 있을 때 보입니다.</p>}
              <div className="nb-field-row">
                <button type="button" className="nb-btn" onClick={onSync} disabled={sync.running}>지금 동기화</button>
                <button type="button" className="nb-btn is-danger" onClick={onDisconnect}>연결 끊기</button>
              </div>
            </>
          ) : (
            <>
              <p>구글 캘린더와 구글 할 일을 연결하면 앱과 노션에 적은 것이 구글에도 들어가고, 구글에서 바꾼 것도 노션으로 돌아옵니다.</p>
              <button type="button" className="nb-btn is-primary" onClick={onConnect}>구글 연결</button>
            </>
          )}
        </section>
        <section className="nb-card">
          <h3>노션</h3>
          <p>모든 내용은 노션 「Claude가 만든 노션 비서」 페이지의 데이터베이스 여섯 개에 저장됩니다.</p>
          {home && <a className="nb-btn" href={home} target="_blank" rel="noreferrer">노션 페이지 열기</a>}
          <p className="nb-hint">노션 캘린더에서 보려면 노션 캘린더 설정의 「노션」에서 「모든 항목」 데이터베이스를 추가하세요. 날짜 속성이 그대로 캘린더에 뜹니다.</p>
        </section>
        <section className="nb-card">
          <h3>휴대폰에서 더 빠르게</h3>
          <p>이 주소 뒤에 <code>?add=적을 내용</code>을 붙이면 입력창이 채워진 채로 열립니다. 아이폰 단축어나 홈 화면 바로가기에 넣어 두세요.</p>
          <code className="nb-code">{`${location.origin}/assistant/?add=내일 3시 치과`}</code>
        </section>
      </div>
    </Sheet>
  );
}
