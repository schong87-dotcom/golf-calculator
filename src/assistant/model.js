// 노션 비서 화면이 쓰는 계산(오늘 통계, 기한별 묶음, 일정표, 주간 습관 칸). 순수 함수라 today 와 now 를 주입한다.
import { addDays, dayDiff, dayKey, dayLabel, isAllDay, startOfWeek, toDate, ymd, WEEKDAYS } from './dates.js';

export const TYPES = {
  task: { label: '할 일', icon: '✅' },
  event: { label: '일정', icon: '📅' },
  someday: { label: '언젠가', icon: '💭' },
  info: { label: '정보', icon: '💡' },
};

export const QUADRANTS = {
  A: { label: '지금 하기', hint: '중요하고 급한 일' },
  B: { label: '계획하기', hint: '중요하지만 급하지 않은 일' },
  C: { label: '줄이거나 맡기기', hint: '급하지만 중요하지 않은 일' },
  D: { label: '덜어내기', hint: '급하지도 중요하지도 않은 일' },
};

export const TABS = [
  { key: 'today', label: '오늘', icon: '☀️' },
  { key: 'agenda', label: '일정', icon: '📅' },
  { key: 'tasks', label: '할 일', icon: '✅' },
  { key: 'someday', label: '언젠가', icon: '💭' },
  { key: 'info', label: '정보', icon: '💡' },
  { key: 'habits', label: '습관', icon: '🌱' },
];

export const quadrantOf = (item) => (item.important && item.urgent ? 'A' : item.important ? 'B' : item.urgent ? 'C' : 'D');

const byStart = (a, b) => (toDate(a.start) - toDate(b.start)) || a.title.localeCompare(b.title, 'ko');
const timeOrder = (a, b) => {
  const allA = isAllDay(a.start);
  const allB = isAllDay(b.start);
  if (allA !== allB) return allA ? -1 : 1;
  return toDate(a.start) - toDate(b.start);
};

// 그날 걸쳐 있는 일정(여러 날짜 일정 포함)
export function eventsOn(items, key) {
  return items
    .filter((i) => i.type === 'event' && i.start && dayKey(i.start) <= key && (dayKey(i.end || i.start) >= key))
    .sort(timeOrder);
}

export function tasksDueOn(items, key) {
  return items.filter((i) => i.type === 'task' && i.start && dayKey(i.start) === key).sort(timeOrder);
}

export const overdueTasks = (items, todayKey) =>
  items.filter((i) => i.type === 'task' && !i.done && i.start && dayKey(i.start) < todayKey).sort(byStart);

export const habitDone = (logs, habitId, key) => logs.some((l) => l.habitId === habitId && l.date === key && l.done);

export function todayStats({ items, habits, habitLogs, todayKey }) {
  const tasks = tasksDueOn(items, todayKey);
  const active = habits.filter((h) => h.active);
  const tasksDone = tasks.filter((t) => t.done).length;
  const habitsDone = active.filter((h) => habitDone(habitLogs, h.id, todayKey)).length;
  const taskRate = tasks.length ? tasksDone / tasks.length : 0;
  const habitRate = active.length ? habitsDone / active.length : 0;
  // 노션 「일간 기록」의 점수 포뮬러와 같은 식(할 일 60%, 습관 40%)
  const score = Math.round(100 * (tasks.length && active.length ? taskRate * 0.6 + habitRate * 0.4 : tasks.length ? taskRate : active.length ? habitRate : 0));
  return {
    tasksTotal: tasks.length, tasksDone, habitsTotal: active.length, habitsDone,
    events: eventsOn(items, todayKey).length, overdue: overdueTasks(items, todayKey).length, score,
  };
}

// 할 일 탭의 기한별 묶음. 완료한 것은 따로 돌려준다.
export function taskGroups(items, now) {
  const todayKey = ymd(now);
  const weekEnd = ymd(addDays(startOfWeek(now), 6));
  const open = items.filter((i) => i.type === 'task' && !i.done);
  const groups = [
    { key: 'overdue', label: '지난 기한', items: [] },
    { key: 'today', label: '오늘', items: [] },
    { key: 'tomorrow', label: '내일', items: [] },
    { key: 'week', label: '이번 주', items: [] },
    { key: 'later', label: '나중에', items: [] },
    { key: 'none', label: '기한 없음', items: [] },
  ];
  const pick = (key) => groups.find((g) => g.key === key).items;
  for (const item of open) {
    const day = dayKey(item.start);
    if (!day) pick('none').push(item);
    else if (day < todayKey) pick('overdue').push(item);
    else if (day === todayKey) pick('today').push(item);
    else if (day === ymd(addDays(now, 1))) pick('tomorrow').push(item);
    else if (day <= weekEnd) pick('week').push(item);
    else pick('later').push(item);
  }
  for (const g of groups) g.items.sort(g.key === 'none' ? (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) : byStart);
  const done = items.filter((i) => i.type === 'task' && i.done)
    .sort((a, b) => String(b.doneAt || b.editedAt).localeCompare(String(a.doneAt || a.editedAt)));
  return { groups: groups.filter((g) => g.items.length), done };
}

// 일정 탭: 오늘부터 days 일 동안 날짜별로 일정과 기한 있는 할 일
export function agenda(items, now, days = 31) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(now, i);
    const key = ymd(date);
    const list = [...eventsOn(items, key), ...tasksDueOn(items, key)];
    if (list.length) out.push({ key, label: dayLabel(key, now), weekday: WEEKDAYS[date.getDay()], items: list });
  }
  return out;
}

export function weekStrip(now, length = 14) {
  return Array.from({ length }, (_, i) => {
    const date = addDays(now, i);
    return { key: ymd(date), day: date.getDate(), weekday: WEEKDAYS[date.getDay()], diff: dayDiff(now, date) };
  });
}

export function weekKeys(todayKey) {
  const monday = startOfWeek(toDate(todayKey));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { key: ymd(date), label: WEEKDAYS[date.getDay()], day: date.getDate() };
  });
}

export function weekCount(logs, habitId, todayKey) {
  const keys = new Set(weekKeys(todayKey).map((d) => d.key));
  return logs.filter((l) => l.habitId === habitId && l.done && keys.has(l.date)).length;
}

export function applyHabitLog(logs, habitId, date, done) {
  const rest = logs.filter((l) => !(l.habitId === habitId && l.date === date));
  return done ? [...rest, { id: `tmp-${habitId}-${date}`, habitId, date, done: true }] : rest;
}

export function upsert(items, item, replaceId = item.id) {
  const index = items.findIndex((i) => i.id === replaceId);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
}

export function search(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => [i.title, i.memo, i.place, i.link, ...(i.tags || [])].join(' ').toLowerCase().includes(q));
}

export function itemFromParsed(parsed, now = new Date()) {
  return {
    id: `tmp-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    title: parsed.title,
    type: parsed.type,
    start: parsed.start,
    end: parsed.end,
    done: false,
    important: parsed.important,
    urgent: parsed.urgent,
    areaIds: parsed.areaIds,
    place: parsed.place,
    memo: '',
    tags: parsed.tags,
    link: parsed.link,
    doneAt: null,
    source: 'app',
    gcalId: null,
    gtaskId: null,
    googleUrl: '',
    syncState: '',
    createdAt: now.toISOString(),
    editedAt: now.toISOString(),
    pending: true,
  };
}

export function greeting(now) {
  const h = now.getHours();
  if (h < 5) return '늦은 밤이에요';
  if (h < 11) return '좋은 아침이에요';
  if (h < 14) return '점심 맛있게 드세요';
  if (h < 18) return '오후도 힘내요';
  return '오늘 하루 수고했어요';
}
