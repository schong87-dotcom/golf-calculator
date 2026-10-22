// 노션 비서 화면 계산(오늘 통계, 기한별 묶음, 일정표, 주간 습관)을 검증하는 단위 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayStats, taskGroups, agenda, overdueTasks, eventsOn, weekKeys, weekCount, applyHabitLog } from '../src/assistant/model.js';

process.env.TZ = 'Asia/Seoul';
const NOW = new Date('2026-10-23T09:00:00+09:00');
const T = '2026-10-23';
let n = 0;
const it = (over) => ({ id: `i${++n}`, title: `항목${n}`, type: 'task', start: null, end: null, done: false, ...over });

const items = [
  it({ title: '밀린 일', start: '2026-10-20' }),
  it({ title: '오늘 끝낸 일', start: T, done: true }),
  it({ title: '오늘 할 일', start: T }),
  it({ title: '내일 할 일', start: '2026-10-24' }),
  it({ title: '이번 주 일요일', start: '2026-10-25' }),
  it({ title: '다음 주', start: '2026-10-28' }),
  it({ title: '기한 없음' }),
  it({ type: 'event', title: '오후 회의', start: `${T}T15:00:00+09:00`, end: `${T}T16:00:00+09:00` }),
  it({ type: 'event', title: '종일 행사', start: T }),
  it({ type: 'event', title: '사흘 출장', start: '2026-10-22', end: '2026-10-24' }),
  it({ type: 'someday', title: '언젠가' }),
];
const habits = [{ id: 'h1', active: true }, { id: 'h2', active: true }, { id: 'h3', active: false }];
const logs = [{ habitId: 'h1', date: T, done: true }, { habitId: 'h1', date: '2026-10-19', done: true }, { habitId: 'h2', date: '2026-10-18', done: true }];

test('오늘 통계는 노션 점수와 같은 식(할 일 60%, 습관 40%)', () => {
  const s = todayStats({ items, habits, habitLogs: logs, todayKey: T });
  assert.deepEqual([s.tasksTotal, s.tasksDone, s.habitsTotal, s.habitsDone, s.overdue], [2, 1, 2, 1, 1]);
  assert.equal(s.events, 3);
  assert.equal(s.score, 50);
});

test('오늘 일정은 종일 먼저(먼저 시작한 여러 날 일정이 앞), 그다음 시각 순', () => {
  assert.deepEqual(eventsOn(items, T).map((e) => e.title), ['사흘 출장', '종일 행사', '오후 회의']);
  assert.deepEqual(eventsOn(items, '2026-10-25').map((e) => e.title), []);
});

test('할 일 기한별 묶음', () => {
  const { groups, done } = taskGroups(items, NOW);
  assert.deepEqual(groups.map((g) => [g.key, g.items.map((i) => i.title)]), [
    ['overdue', ['밀린 일']],
    ['today', ['오늘 할 일']],
    ['tomorrow', ['내일 할 일']],
    ['week', ['이번 주 일요일']],
    ['later', ['다음 주']],
    ['none', ['기한 없음']],
  ]);
  assert.deepEqual(done.map((i) => i.title), ['오늘 끝낸 일']);
  assert.deepEqual(overdueTasks(items, T).map((i) => i.title), ['밀린 일']);
});

test('일정표는 오늘부터 날짜별로 묶고 지난 날짜는 뺀다', () => {
  const days = agenda(items, NOW, 7);
  assert.equal(days[0].label, '오늘');
  assert.equal(days[1].label, '내일');
  assert.ok(days[1].items.some((i) => i.title === '사흘 출장'));
  assert.ok(!days.some((d) => d.key < T));
});

test('주간 칸은 월요일부터, 이번 주 횟수와 체크 토글', () => {
  assert.deepEqual(weekKeys(T).map((d) => d.key), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(weekCount(logs, 'h1', T), 2);
  assert.equal(weekCount(logs, 'h2', T), 0);
  const on = applyHabitLog(logs, 'h2', T, true);
  assert.equal(weekCount(on, 'h2', T), 1);
  assert.equal(weekCount(applyHabitLog(on, 'h2', T, false), 'h2', T), 0);
});
