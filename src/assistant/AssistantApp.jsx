// 노션 비서 화면의 뼈대: 로그인 확인, 노션 데이터 불러오기, 낙관적 저장, 구글 연결과 동기화, 탭 전환
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { createGoogleClient, loadGoogleState, requestToken, revoke, saveGoogleState, tokenValid } from './google.js';
import { pushItem, removeFromGoogle, runFullSync } from './runner.js';
import { applyHabitLog, habitDone, itemFromParsed, overdueTasks, TABS, taskGroups, todayStats, TYPES, upsert } from './model.js';
import { dayKey, isAllDay, timeText, toLocalISO, ymd } from './dates.js';
import { BottomNav, Header, QuickAdd, Toast } from './parts.jsx';
import { AgendaView, HabitsView, InfoView, SomedayView, TasksView, TodayView } from './views.jsx';
import { HabitSheet, ItemSheet, SettingsSheet } from './sheets.jsx';

const CACHE = 'assistant-cache-v1';
const TAB_KEY = 'assistant-tab-v1';
const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 저장소가 막혀도 화면은 그대로 쓴다
    }
  },
};
const forServer = (item) => {
  const copy = { ...item };
  delete copy.pending;
  return copy;
};
// 화면 밖(이벤트 처리, 동기화)에서 최신 값을 읽는 자리. 이 페이지에는 앱이 하나뿐이라 모듈 변수로 둔다.
const live = { data: null, google: loadGoogleState(), lastLoad: 0, deepLink: new URLSearchParams(location.search).get('item') };
const google = createGoogleClient(() => live.google);
const ago = (iso) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  return `${Math.round(min / 60)}시간 전`;
};

function Gate({ status, message }) {
  const text = {
    login: ['🔐', '앱 모음에서 로그인해 주세요', '노션 비서는 앱 모음의 구글 로그인으로 주인 계정을 확인합니다.'],
    forbidden: ['🙅', '주인 계정 전용입니다', message],
    unconfigured: ['🛠', '노션 연결 설정이 없습니다', message],
    error: ['⚠️', '불러오지 못했습니다', message],
  }[status];
  return (
    <div className="nb-gate">
      <p className="nb-gate-icon" aria-hidden="true">{text[0]}</p>
      <h1>{text[1]}</h1>
      <p>{text[2]}</p>
      <div className="nb-gate-actions">
        <a className="nb-btn is-primary" href="/">앱 모음에서 로그인</a>
        {status === 'error' && <button type="button" className="nb-btn" onClick={() => location.reload()}>다시 시도</button>}
      </div>
    </div>
  );
}

export default function AssistantApp() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const cached = useMemo(() => store.get(CACHE, null), []);
  const [status, setStatus] = useState(cached ? 'ready' : 'loading');
  const [message, setMessage] = useState('');
  const [data, setData] = useState(cached);
  const [tab, setTabState] = useState(() => params.get('tab') || store.get(TAB_KEY, 'today'));
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [gstate, setGstate] = useState(() => live.google);
  const [calendars, setCalendars] = useState([]);
  const [sync, setSync] = useState({ running: false, text: '', at: '', error: '' });
  useEffect(() => { live.data = data; }, [data]);
  useEffect(() => { live.google = gstate; }, [gstate]);
  const gValid = tokenValid(gstate);
  const setTab = (key) => {
    setTabState(key);
    store.set(TAB_KEY, key);
    window.scrollTo({ top: 0 });
  };
  const notify = useCallback((text, extra = {}) => setToast({ id: Date.now(), text, ...extra }), []);
  const setItems = (fn) => setData((d) => ({ ...d, items: fn(d.items) }));

  const applyFresh = useCallback((fresh) => {
    live.lastLoad = Date.now();
    const next = { today: fresh.today, items: fresh.items, areas: fresh.areas, habits: fresh.habits, habitLogs: fresh.habitLogs, days: fresh.days, quadrants: fresh.quadrants, home: fresh.home };
    // 저장 중인 임시 항목은 새로 받은 목록에도 남겨 둔다
    const pending = (live.data?.items || []).filter((i) => i.pending);
    next.items = [...next.items, ...pending];
    live.data = next;
    setData(next);
    store.set(CACHE, { ...next, items: next.items.filter((i) => !i.pending) });
    setStatus('ready');
    // 노션 「앱에서 보기」 링크(?item=)로 들어오면 그 항목을 연다
    if (live.deepLink) {
      const found = next.items.find((i) => i.id.replaceAll('-', '') === live.deepLink.replaceAll('-', ''));
      live.deepLink = null;
      history.replaceState(null, '', location.pathname);
      if (found) setSheet({ kind: 'item', item: found });
    }
    return next;
  }, []);

  const failLoad = useCallback((error) => {
    if (error.reason === 'no-session' || error.reason === 'no-token' || error.reason === 'bad-token') setStatus('login');
    else if (error.reason === 'not-owner') { store.set(CACHE, null); setStatus('forbidden'); }
    else if (error.reason === 'not-configured') setStatus('unconfigured');
    else if (!live.data) setStatus('error');
    else notify(`노션을 다시 읽지 못했어요. ${error.message}`, { error: true });
    setMessage(error.message);
    return null;
  }, [notify]);

  const load = useCallback(() => api.bootstrap().then(applyFresh, failLoad), [applyFresh, failLoad]);

  const runSync = useCallback(async ({ interactive = false } = {}) => {
    let state = live.google;
    if (!state.email && !interactive) return;
    try {
      if (!tokenValid(state)) {
        if (!interactive) return;
        state = await requestToken(state, state.email ? '' : 'consent');
        live.google = state;
        setGstate(state);
      }
      setSync((s) => ({ ...s, running: true, text: '동기화 중', error: '' }));
      const latest = (await load()) || live.data;
      const result = await runFullSync({
        items: latest.items.filter((i) => !i.pending),
        google,
        settings: state,
        notion: api,
        onProgress: (text) => setSync((s) => ({ ...s, text })),
      });
      const next = { ...live.google, lastSync: new Date().toISOString() };
      saveGoogleState(next);
      setGstate(next);
      await load();
      const moved = result.created + result.updated + result.trashed + result.pushed;
      setSync({ running: false, text: '', at: ago(next.lastSync), error: result.errors.join('\n') });
      if (result.errors.length) notify(`동기화 중 ${result.errors.length}건을 처리하지 못했어요. ${result.errors[0]}`, { error: true });
      else if (interactive || moved) notify(moved ? `구글과 맞췄어요 · 가져옴 ${result.created}, 고침 ${result.updated}, 보냄 ${result.pushed}` : '구글과 이미 같아요');
    } catch (error) {
      setSync({ running: false, text: '', at: '', error: error.message });
      if (error.status === 401) {
        const expired = { ...live.google, accessToken: '', expiresAt: 0 };
        live.google = expired;
        saveGoogleState(expired);
        setGstate(expired);
      }
      notify(`구글 동기화 실패: ${error.message}`, { error: true });
    }
  }, [load, notify]);

  // 처음 열 때: 노션 읽기 → 구글 연결이 살아 있으면 동기화
  useEffect(() => {
    let alive = true;
    load().then((d) => {
      if (alive && d && tokenValid(live.google)) runSync();
    });
    return () => { alive = false; };
  }, [load, runSync]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(new Date());
      if (Date.now() - live.lastLoad > 120_000) {
        if (tokenValid(live.google)) runSync();
        else load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
  }, [load, runSync]);

  useEffect(() => {
    if (sync.at && !sync.running) {
      const t = setInterval(() => setSync((s) => ({ ...s, at: ago(live.google.lastSync) })), 60_000);
      return () => clearInterval(t);
    }
    return undefined;
  }, [sync.at, sync.running]);

  // 저장: 화면부터 바꾸고 노션, 구글 순으로 쓴다
  const persist = useCallback(async (item, { isNew = false } = {}) => {
    const tempId = item.id;
    setItems((items) => upsert(items, { ...item, pending: true }));
    try {
      let saved = isNew ? await api.createItem(forServer({ ...item, id: undefined })) : await api.updateItem(forServer(item));
      setItems((items) => upsert(items, saved, tempId));
      if (tokenValid(live.google)) {
        try {
          const pushed = await pushItem(saved, google, live.google);
          if (pushed) {
            saved = await api.updateItem(forServer(pushed));
            setItems((items) => upsert(items, saved));
          }
        } catch (error) {
          notify(`노션에는 저장했지만 구글에 못 보냈어요. 다음 동기화 때 다시 보냅니다. (${error.message})`, { error: true });
        }
      }
      return saved;
    } catch (error) {
      if (isNew) setItems((items) => items.filter((i) => i.id !== tempId));
      else setItems((items) => upsert(items, { ...item, pending: false }));
      notify(`저장하지 못했어요. ${error.message}`, { error: true });
      return null;
    }
  }, [notify]);

  const actions = useMemo(() => ({
    open: (item) => setSheet({ kind: 'item', item }),
    add: async (parsed) => {
      const item = itemFromParsed(parsed, new Date());
      const tail = item.type === 'event' ? ' · 구글 캘린더에도' : item.type === 'task' ? ' · 구글 할 일에도' : '';
      notify(`${TYPES[item.type].label}에 넣었어요${tokenValid(live.google) ? tail : ''}`);
      const target = { task: 'tasks', event: 'agenda', someday: 'someday', info: 'info' }[item.type];
      const today = ymd(new Date());
      const showsOnToday = (item.type === 'task' || item.type === 'event') && dayKey(item.start) === today;
      if (!showsOnToday && tab === 'today' && item.type !== 'task') setTab(target);
      await persist(item, { isNew: true });
    },
    toggleDone: (item) => {
      const done = !item.done;
      persist({ ...item, done, doneAt: done ? toLocalISO(new Date()) : null });
      if (done) notify(`「${item.title}」 끝!`, { undo: () => persist({ ...item }) });
    },
    moveToToday: (list) => {
      const today = ymd(new Date());
      list.forEach((item) => {
        const start = isAllDay(item.start) ? today : toLocalISO(new Date(`${today}T${timeText(item.start)}`));
        persist({ ...item, start, end: null });
      });
      notify(`${list.length}개를 오늘로 옮겼어요`);
    },
    schedule: (item) => setSheet({ kind: 'item', item: { ...item, type: 'task', start: ymd(new Date()) } }),
    toggleHabit: async (habit, date) => {
      const done = !habitDone(live.data.habitLogs, habit.id, date);
      setData((d) => ({ ...d, habitLogs: applyHabitLog(d.habitLogs, habit.id, date, done) }));
      try {
        const res = await api.toggleHabit({ habitId: habit.id, date, done, name: habit.name, icon: habit.icon });
        setData((d) => ({ ...d, habits: d.habits.map((h) => (h.id === habit.id ? { ...h, streak: res.streak } : h)) }));
        if (done && res.streak >= 3) notify(`${habit.icon} ${habit.name} ${res.streak}일 연속!`);
      } catch (error) {
        setData((d) => ({ ...d, habitLogs: applyHabitLog(d.habitLogs, habit.id, date, !done) }));
        notify(`습관을 기록하지 못했어요. ${error.message}`, { error: true });
      }
    },
    editHabit: (habit) => setSheet({ kind: 'habit', habit }),
    saveDay: async (patch) => {
      const today = ymd(new Date());
      setData((d) => ({ ...d, days: d.days.map((x) => (x.date === today ? { ...x, ...patch } : x)) }));
      try {
        const day = await api.saveDay({ date: today, ...patch });
        setData((d) => ({ ...d, days: [...d.days.filter((x) => x.date !== today), day] }));
        if (patch.note !== undefined) notify('노션 일간 기록에 남겼어요');
      } catch (error) {
        notify(`기록하지 못했어요. ${error.message}`, { error: true });
      }
    },
    copy: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        notify('복사했어요');
      } catch {
        notify('복사하지 못했어요', { error: true });
      }
    },
    connectGoogle: () => runSync({ interactive: true }),
  }), [notify, persist, runSync, tab]);

  const removeItem = (item) => {
    setSheet(null);
    setItems((items) => items.filter((i) => i.id !== item.id));
    const timer = setTimeout(async () => {
      try {
        if (tokenValid(live.google)) await removeFromGoogle(item, google, live.google);
        await api.trashItem(item.id);
      } catch (error) {
        setItems((items) => upsert(items, item));
        notify(`삭제하지 못했어요. ${error.message}`, { error: true });
      }
    }, 5000);
    notify(`「${item.title}」 삭제`, {
      undo: () => {
        clearTimeout(timer);
        setItems((items) => upsert(items, item));
      },
    });
  };

  useEffect(() => {
    if (sheet?.kind !== 'settings' || !tokenValid(live.google)) return;
    google.listCalendars().then(setCalendars).catch(() => setCalendars([]));
  }, [sheet]);

  if (status === 'loading') return <div className="nb-loading"><span className="nb-spin" /> 노션에서 불러오는 중</div>;
  if (status !== 'ready' || !data) return <Gate status={status === 'ready' ? 'error' : status} message={message} />;

  const today = ymd(now);
  const stats = todayStats({ items: data.items, habits: data.habits, habitLogs: data.habitLogs, todayKey: today });
  const counts = {
    today: stats.tasksTotal - stats.tasksDone + stats.overdue,
    tasks: taskGroups(data.items, now).groups.reduce((n, g) => n + g.items.length, 0),
    someday: data.items.filter((i) => i.type === 'someday' && !i.done).length,
  };
  const View = { today: TodayView, agenda: AgendaView, tasks: TasksView, someday: SomedayView, info: InfoView, habits: HabitsView }[tab] || TodayView;
  const googleInfo = { email: gstate.email, valid: gValid };

  return (
    <div className="nb-app">
      <Header now={now} stats={stats} sync={sync} google={googleInfo} home={data.home}
        onSync={() => runSync({ interactive: true })} onSettings={() => setSheet({ kind: 'settings' })} />
      <QuickAdd now={now} areas={data.areas} onAdd={actions.add} initial={params.get('add') || ''} />
      <main className="nb-main">
        <h2 className="nb-tab-title">{TABS.find((t) => t.key === tab)?.icon} {TABS.find((t) => t.key === tab)?.label}</h2>
        <View data={data} now={now} google={googleInfo} actions={actions} />
        {overdueTasks(data.items, today).length === 0 && tab === 'today' && stats.tasksTotal > 0 && stats.tasksDone === stats.tasksTotal && (
          <p className="nb-cheer">오늘 할 일을 모두 끝냈어요 🎉</p>
        )}
      </main>
      <BottomNav tab={tab} onTab={setTab} counts={counts} />
      <Toast toast={toast} onClose={() => setToast(null)} onUndo={() => { toast?.undo?.(); setToast(null); }} />

      {sheet?.kind === 'item' && (
        <ItemSheet key={sheet.item.id} item={sheet.item} areas={data.areas} onClose={() => setSheet(null)} onDelete={removeItem}
          onSave={(item) => { setSheet(null); persist(item); notify('저장했어요'); }} />
      )}
      {sheet?.kind === 'habit' && (
        <HabitSheet habit={sheet.habit} onClose={() => setSheet(null)} onSave={async (habit) => {
          setSheet(null);
          try {
            const saved = await api.saveHabit({ ...habit, order: habit.order ?? data.habits.length + 1 });
            setData((d) => ({ ...d, habits: upsert(d.habits, saved) }));
            notify(saved.active ? '습관을 저장했어요' : '습관을 쉬게 했어요');
          } catch (error) {
            notify(`습관을 저장하지 못했어요. ${error.message}`, { error: true });
          }
        }} />
      )}
      {sheet?.kind === 'settings' && (
        <SettingsSheet google={gstate} calendars={calendars} home={data.home} sync={sync} onClose={() => setSheet(null)}
          onConnect={() => { setSheet(null); runSync({ interactive: true }); }}
          onSync={() => { setSheet(null); runSync({ interactive: true }); }}
          onDisconnect={() => { setGstate(revoke(gstate)); setCalendars([]); notify('구글 연결을 끊었어요. 노션 기록은 그대로입니다.'); }}
          onSaveGoogle={(patch) => { const next = { ...gstate, ...patch }; saveGoogleState(next); setGstate(next); notify('캘린더 설정을 저장했어요'); }} />
      )}
    </div>
  );
}
