// 노션 비서 탭 화면 여섯 개: 오늘, 일정, 할 일, 언젠가, 정보, 습관
import { useState } from 'react';
import { ItemRow, Section, Empty } from './parts.jsx';
import {
  agenda, eventsOn, habitDone, overdueTasks, QUADRANTS, quadrantOf, search, taskGroups, tasksDueOn, weekCount, weekKeys, weekStrip,
} from './model.js';
import { isAllDay, timeText, toDate, ymd } from './dates.js';

const MOODS = ['😄 최고', '🙂 좋음', '😐 보통', '😣 힘듦'];

function GoogleCard({ google, onConnect }) {
  if (google.email) return null;
  return (
    <div className="nb-card nb-connect">
      <div>
        <b>구글 캘린더와 구글 할 일 연결</b>
        <p>한 번 연결하면 일정은 구글 캘린더에, 할 일은 구글 할 일에 함께 들어가고, 구글에서 고친 것도 노션으로 돌아옵니다.</p>
      </div>
      <button type="button" className="nb-btn is-primary" onClick={onConnect}>구글 연결</button>
    </div>
  );
}

export function TodayView({ data, now, google, actions }) {
  const today = ymd(now);
  const events = eventsOn(data.items, today);
  const tasks = tasksDueOn(data.items, today);
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const overdue = overdueTasks(data.items, today);
  const upcoming = agenda(data.items, now, 8).filter((d) => d.key > today).slice(0, 3);
  const habits = data.habits.filter((h) => h.active);
  const day = data.days.find((d) => d.date === today);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const row = (item, opts) => <ItemRow key={item.id} item={item} now={now} areas={data.areas} onToggle={actions.toggleDone} onOpen={actions.open} {...opts} />;

  return (
    <div className="nb-view">
      <GoogleCard google={google} onConnect={actions.connectGoogle} />

      {overdue.length > 0 && (
        <Section title="밀린 할 일" count={overdue.length} tone="warn" action={<button type="button" className="nb-link" onClick={() => actions.moveToToday(overdue)}>모두 오늘로</button>}>
          <ul className="nb-list">{overdue.map((i) => row(i))}</ul>
        </Section>
      )}

      <Section title="오늘 일정" count={events.length}>
        {events.length ? (
          <ul className="nb-list nb-timeline">
            {events.map((item) => {
              const end = item.end || item.start;
              const past = !isAllDay(item.start) && toDate(end) < now;
              const current = !isAllDay(item.start) && toDate(item.start) <= now && toDate(end) > now;
              return (
                <li key={item.id} className={`nb-tl ${past ? 'is-past' : ''} ${current ? 'is-now' : ''}`}>
                  <span className="nb-tl-time">{isAllDay(item.start) ? '종일' : timeText(item.start)}</span>
                  <button type="button" className="nb-tl-body" onClick={() => actions.open(item)} disabled={item.pending}>
                    <b>{item.title}</b>
                    <span>{[!isAllDay(item.start) && item.end ? `~${timeText(item.end)}` : '', item.place ? `📍 ${item.place}` : '', current ? '지금 진행 중' : ''].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <Empty icon="🗓">오늘 잡힌 일정이 없어요.</Empty>}
        {events.some((e) => !isAllDay(e.start)) && <p className="nb-now">지금 {String(Math.floor(nowMinutes / 60)).padStart(2, '0')}:{String(nowMinutes % 60).padStart(2, '0')}</p>}
      </Section>

      <Section title="오늘 할 일" count={open.length}>
        {tasks.length ? (
          <ul className="nb-list">
            {open.map((i) => row(i, { showDate: false }))}
            {done.map((i) => row(i, { showDate: false }))}
          </ul>
        ) : <Empty icon="✨">오늘까지 할 일이 없어요. 위 입력창에 「오늘 ~」으로 적어 보세요.</Empty>}
      </Section>

      {habits.length > 0 && (
        <Section title="오늘의 습관" count={`${habits.filter((h) => habitDone(data.habitLogs, h.id, today)).length}/${habits.length}`}>
          <div className="nb-habit-chips">
            {habits.map((h) => {
              const on = habitDone(data.habitLogs, h.id, today);
              return (
                <button key={h.id} type="button" className={`nb-habit-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => actions.toggleHabit(h, today)}>
                  <span className="nb-habit-icon">{on ? '✓' : h.icon}</span>
                  <span>{h.name}</span>
                  {h.streak > 1 && <span className="nb-streak">🔥{h.streak}</span>}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="다가오는 날">
          {upcoming.map((d) => (
            <div key={d.key} className="nb-day-block">
              <h3>{d.label} <small>{d.weekday}</small></h3>
              <ul className="nb-list">{d.items.map((i) => row(i, { showDate: false }))}</ul>
            </div>
          ))}
        </Section>
      )}

      <Section title="하루 마무리" tone="evening">
        <div className="nb-moods" role="radiogroup" aria-label="오늘 기분">
          {MOODS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={day?.mood === m} className={day?.mood === m ? 'is-on' : ''} onClick={() => actions.saveDay({ mood: day?.mood === m ? '' : m })}>{m}</button>
          ))}
        </div>
        <ReflectionInput key={day?.id || 'none'} initial={day?.note || ''} onSave={(note) => actions.saveDay({ note })} />
        {day?.summary && <p className="nb-day-summary" title="노션 일간 기록의 하루 요약 포뮬러">{day.summary}</p>}
      </Section>
    </div>
  );
}

function ReflectionInput({ initial, onSave }) {
  const [note, setNote] = useState(initial);
  return (
    <form className="nb-reflect" onSubmit={(e) => { e.preventDefault(); onSave(note.trim()); }}>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="오늘을 한 줄로 남겨 보세요" aria-label="한 줄 회고" />
      <button type="submit" className="nb-btn" disabled={note.trim() === initial.trim()}>저장</button>
    </form>
  );
}

export function AgendaView({ data, now, actions }) {
  const [focus, setFocus] = useState(null);
  const strip = weekStrip(now, 14);
  const days = agenda(data.items, now, 45);
  const shown = focus ? days.filter((d) => d.key === focus) : days;
  const countOn = (key) => eventsOn(data.items, key).length + tasksDueOn(data.items, key).filter((t) => !t.done).length;
  return (
    <div className="nb-view">
      <div className="nb-strip" role="tablist" aria-label="날짜">
        {strip.map((d) => (
          <button key={d.key} type="button" role="tab" aria-selected={focus === d.key}
            className={`${focus === d.key ? 'is-on' : ''} ${d.diff === 0 ? 'is-today' : ''} ${d.weekday === '일' ? 'is-sun' : d.weekday === '토' ? 'is-sat' : ''}`}
            onClick={() => setFocus(focus === d.key ? null : d.key)}>
            <small>{d.weekday}</small>
            <b>{d.day}</b>
            <i>{countOn(d.key) ? '•'.repeat(Math.min(3, countOn(d.key))) : ''}</i>
          </button>
        ))}
      </div>
      {shown.length ? shown.map((d) => (
        <Section key={d.key} title={<>{d.label} <small className="nb-weekday">{d.weekday}요일</small></>}>
          <ul className="nb-list">
            {d.items.map((i) => <ItemRow key={i.id} item={i} now={now} areas={data.areas} onToggle={actions.toggleDone} onOpen={actions.open} showDate={false} />)}
          </ul>
        </Section>
      )) : <Empty icon="🗓">{focus ? '이날은 비어 있어요.' : '앞으로 45일 동안 잡힌 일정이 없어요.'}</Empty>}
    </div>
  );
}

export function TasksView({ data, now, actions }) {
  const [mode, setMode] = useState('due');
  const [showDone, setShowDone] = useState(false);
  const { groups, done } = taskGroups(data.items, now);
  const open = data.items.filter((i) => i.type === 'task' && !i.done);
  const row = (i) => <ItemRow key={i.id} item={i} now={now} areas={data.areas} onToggle={actions.toggleDone} onOpen={actions.open} />;
  return (
    <div className="nb-view">
      <div className="nb-seg is-wide" role="tablist" aria-label="보기">
        {[['due', '기한순'], ['matrix', '타임 매트릭스'], ['area', '영역별']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} className={`nb-seg-btn ${mode === k ? 'is-on' : ''}`} onClick={() => setMode(k)}>{label}</button>
        ))}
      </div>

      {mode === 'due' && (groups.length ? groups.map((g) => (
        <Section key={g.key} title={g.label} count={g.items.length} tone={g.key === 'overdue' ? 'warn' : undefined}
          action={g.key === 'overdue' ? <button type="button" className="nb-link" onClick={() => actions.moveToToday(g.items)}>모두 오늘로</button> : null}>
          <ul className="nb-list">{g.items.map(row)}</ul>
        </Section>
      )) : <Empty icon="🎉">남은 할 일이 없어요.</Empty>)}

      {mode === 'matrix' && (
        <div className="nb-matrix">
          {Object.entries(QUADRANTS).map(([code, q]) => {
            const list = open.filter((i) => quadrantOf(i) === code);
            const notion = data.quadrants.find((x) => x.code === code);
            return (
              <section key={code} className={`nb-quad q-${code}`}>
                <header>
                  <b>{code}. {q.label}</b>
                  <small>{q.hint}{notion ? ` · 노션 롤업 ${notion.count - notion.remaining}/${notion.count} 완료` : ''}</small>
                </header>
                {list.length ? <ul className="nb-list">{list.map(row)}</ul> : <Empty icon="·">비어 있음</Empty>}
              </section>
            );
          })}
        </div>
      )}

      {mode === 'area' && (
        <>
          {data.areas.map((a) => {
            const list = open.filter((i) => i.areaIds?.includes(a.id));
            const rate = a.total ? Math.round((a.doneCount / a.total) * 100) : 0;
            return (
              <Section key={a.id} title={<>{a.icon} {a.name}</>} count={list.length}
                action={<span className="nb-area-rate" title="노션 영역 데이터베이스의 롤업 값">{a.doneCount}/{a.total} 완료 <span className="nb-bar"><i style={{ width: `${rate}%` }} /></span></span>}>
                {list.length ? <ul className="nb-list">{list.map(row)}</ul> : <Empty icon="·">남은 할 일 없음</Empty>}
              </Section>
            );
          })}
          <Section title="영역 없음" count={open.filter((i) => !i.areaIds?.length).length}>
            <ul className="nb-list">{open.filter((i) => !i.areaIds?.length).map(row)}</ul>
          </Section>
        </>
      )}

      {done.length > 0 && (
        <div className="nb-done-toggle">
          <button type="button" className="nb-link" onClick={() => setShowDone(!showDone)}>{showDone ? '완료한 일 숨기기' : `완료한 일 ${done.length}개 보기`}</button>
          {showDone && <ul className="nb-list">{done.slice(0, 50).map(row)}</ul>}
        </div>
      )}
    </div>
  );
}

export function SomedayView({ data, now, actions }) {
  const list = data.items.filter((i) => i.type === 'someday' && !i.done).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return (
    <div className="nb-view">
      <p className="nb-hint">당장은 아니지만 잊고 싶지 않은 것들. 때가 되면 「날짜 잡기」로 할 일이 됩니다.</p>
      {list.length ? (
        <ul className="nb-list">
          {list.map((i) => (
            <ItemRow key={i.id} item={i} now={now} areas={data.areas} onToggle={actions.toggleDone} onOpen={actions.open}
              extra={<button type="button" className="nb-mini" onClick={() => actions.schedule(i)} disabled={i.pending}>날짜 잡기</button>} />
          ))}
        </ul>
      ) : <Empty icon="💭">「언젠가 ~」로 적으면 여기에 모입니다.</Empty>}
    </div>
  );
}

export function InfoView({ data, actions }) {
  const [query, setQuery] = useState('');
  const all = data.items.filter((i) => i.type === 'info').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const list = search(all, query);
  return (
    <div className="nb-view">
      <input className="nb-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`정보 ${all.length}개에서 찾기`} aria-label="정보 검색" />
      {list.length ? (
        <ul className="nb-cards">
          {list.map((i) => (
            <li key={i.id} className="nb-info-card">
              <button type="button" onClick={() => actions.open(i)} disabled={i.pending}>
                <b>{i.title}</b>
                {i.memo && <p>{i.memo}</p>}
                <span className="nb-row-meta">{[i.link ? `🔗 ${safeHost(i.link)}` : '', ...(i.tags || []).map((t) => `#${t}`)].filter(Boolean).join(' · ')}</span>
              </button>
              <button type="button" className="nb-mini" onClick={() => actions.copy([i.title, i.memo, i.link].filter(Boolean).join('\n'))}>복사</button>
            </li>
          ))}
        </ul>
      ) : <Empty icon="💡">{query ? '찾는 정보가 없어요.' : '「메모: ~」로 적으면 여기에 모입니다.'}</Empty>}
    </div>
  );
}

function safeHost(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return link;
  }
}

export function HabitsView({ data, now, actions }) {
  const today = ymd(now);
  const week = weekKeys(today);
  const active = data.habits.filter((h) => h.active);
  const paused = data.habits.filter((h) => !h.active);
  return (
    <div className="nb-view">
      <div className="nb-card nb-habit-grid">
        <div className="nb-hg-row nb-hg-head">
          <span />
          {week.map((d) => <span key={d.key} className={d.key === today ? 'is-today' : ''}>{d.label}<small>{d.day}</small></span>)}
        </div>
        {active.map((h) => (
          <div className="nb-hg-row" key={h.id}>
            <button type="button" className="nb-hg-name" onClick={() => actions.editHabit(h)}>
              <span>{h.icon}</span>
              <span className="nb-hg-text">
                <b>{h.name}</b>
                <small>{weekCount(data.habitLogs, h.id, today)}/{h.weeklyGoal}회{h.streak ? ` · 🔥${h.streak}일` : ''}</small>
              </span>
            </button>
            {week.map((d) => {
              const on = habitDone(data.habitLogs, h.id, d.key);
              const future = d.key > today;
              return (
                <button key={d.key} type="button" disabled={future} aria-pressed={on} aria-label={`${h.name} ${d.label}요일 ${on ? '체크 해제' : '체크'}`}
                  className={`nb-hg-cell ${on ? 'is-on' : ''} ${d.key === today ? 'is-today' : ''}`} onClick={() => actions.toggleHabit(h, d.key)}>
                  {on ? '✓' : ''}
                </button>
              );
            })}
          </div>
        ))}
        {!active.length && <Empty icon="🌱">아직 습관이 없어요.</Empty>}
      </div>
      <button type="button" className="nb-btn is-wide" onClick={() => actions.editHabit(null)}>＋ 습관 추가</button>
      {paused.length > 0 && (
        <Section title="쉬는 습관" count={paused.length}>
          <ul className="nb-list">
            {paused.map((h) => (
              <li key={h.id} className="nb-row">
                <span className="nb-kind">{h.icon}</span>
                <button type="button" className="nb-row-main" onClick={() => actions.editHabit(h)}><span className="nb-row-title">{h.name}</span><span className="nb-row-meta">누적 {h.total}회</span></button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="nb-hint">체크하면 노션 「습관 기록」에 한 줄이 생기고, 「습관」과 「일간 기록」의 롤업이 이번 주 횟수와 하루 점수를 다시 계산합니다.</p>
    </div>
  );
}
