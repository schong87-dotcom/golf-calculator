// 노션 비서 서버 함수(api/assistant.js)를 가짜 노션과 가짜 Supabase 로 검증하는 단위 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, computeStreak, dateKeyIn, SOURCES, itemFromPage } from '../api/assistant.js';
import { fakeBackend, invoke, ENV } from './fake-notion.mjs';

const NOW = new Date('2026-10-23T09:00:00+09:00');
const setup = () => {
  const backend = fakeBackend({ now: () => NOW });
  const handler = createHandler({ fetchImpl: backend.fetch, env: ENV, now: () => NOW });
  return { backend, handler };
};
const rowsOf = (backend, source) => [...backend.pages.values()].filter((p) => p.parent.data_source_id === source && !p.in_trash);
const value = (page, name) => {
  const prop = page.properties[name];
  if (prop?.title) return prop.title.map((t) => t.text.content).join('');
  if (prop?.rich_text) return prop.rich_text.map((t) => t.text.content).join('');
  if (prop?.relation) return prop.relation.map((r) => r.id);
  if (prop && 'checkbox' in prop) return prop.checkbox;
  if (prop && 'number' in prop) return prop.number;
  if (prop?.select) return prop.select.name;
  if (prop && 'date' in prop) return prop.date;
  return prop;
};

test('로그인 토큰이 없거나, 주인이 아니거나, 비회원이면 거절한다', async () => {
  const { handler } = setup();
  assert.equal((await invoke(handler, { token: null, body: { action: 'createItem' } })).status, 401);
  assert.equal((await invoke(handler, { token: 'expired', body: { action: 'createItem' } })).status, 401);
  assert.equal((await invoke(handler, { token: 'stranger', body: { action: 'createItem' } })).body.reason, 'not-owner');
  assert.equal((await invoke(handler, { token: 'guest', body: { action: 'createItem' } })).status, 403);
});

test('노션 토큰이 없으면 설정 없음으로 알린다', async () => {
  const backend = fakeBackend({ now: () => NOW });
  const handler = createHandler({ fetchImpl: backend.fetch, env: { ...ENV, NOTION_POMODORO_TOKEN: '' }, now: () => NOW });
  const res = await invoke(handler, { body: { action: 'createItem', item: { title: 'x' } } });
  assert.equal(res.status, 503);
  assert.equal(res.body.reason, 'not-configured');
});

test('일정을 만들면 그날 일간 기록을 새로 만들어 관계로 잇는다', async () => {
  const { backend, handler } = setup();
  const res = await invoke(handler, {
    body: { action: 'createItem', item: { title: '치과', type: 'event', start: '2026-10-24T15:00:00+09:00', end: '2026-10-24T16:00:00+09:00', source: 'app' } },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [day] = rowsOf(backend, SOURCES.days);
  assert.equal(value(day, '날짜'), '2026-10-24 (토)');
  assert.deepEqual(value(day, '일자'), { start: '2026-10-24' });
  const [page] = rowsOf(backend, SOURCES.items);
  assert.equal(value(page, '종류'), '일정');
  assert.equal(value(page, '출처'), '앱');
  assert.deepEqual(value(page, '일간 기록'), [day.id]);
  assert.deepEqual(value(page, '사분면'), []);
  assert.equal(res.body.item.title, '치과');
});

test('자정 직후 한국 시각은 한국 날짜의 일간 기록으로 간다', () => {
  assert.equal(dateKeyIn('2026-10-24T00:30:00+09:00', 'Asia/Seoul'), '2026-10-24');
  assert.equal(dateKeyIn('2026-10-23T15:30:00.000Z', 'Asia/Seoul'), '2026-10-24');
});

test('중요한 할 일은 타임 매트릭스 B칸에 잇고, 같은 날 두 번째 항목은 일간 기록을 다시 만들지 않는다', async () => {
  const { backend, handler } = setup();
  await invoke(handler, { body: { action: 'createItem', item: { title: '보고서', type: 'task', start: '2026-10-23', important: true } } });
  await invoke(handler, { body: { action: 'createItem', item: { title: '전화', type: 'task', start: '2026-10-23', urgent: true, important: true } } });
  const quadrant = (code) => rowsOf(backend, SOURCES.quadrants).find((q) => value(q, '코드') === code).id;
  const [a, b] = rowsOf(backend, SOURCES.items);
  assert.deepEqual(value(a, '사분면'), [quadrant('B')]);
  assert.deepEqual(value(b, '사분면'), [quadrant('A')]);
  assert.equal(rowsOf(backend, SOURCES.days).length, 1);
  assert.deepEqual(value(a, '일간 기록'), value(b, '일간 기록'));
});

test('고치기는 노션 비서 항목만 허용한다', async () => {
  const { backend, handler } = setup();
  const habit = backend.water;
  const res = await invoke(handler, { body: { action: 'updateItem', item: { id: habit.id, title: '해킹' } } });
  assert.equal(res.status, 403);
  assert.equal(res.body.reason, 'foreign-page');
});

test('완료로 고치면 완료일이 들어가고, 날짜를 옮기면 일간 기록도 옮긴다', async () => {
  const { backend, handler } = setup();
  const created = (await invoke(handler, { body: { action: 'createItem', item: { title: '장보기', type: 'task', start: '2026-10-23' } } })).body.item;
  const res = await invoke(handler, {
    body: { action: 'updateItem', item: { ...created, start: '2026-10-25', done: true, doneAt: '2026-10-23T10:00:00+09:00' } },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const page = backend.pages.get(created.id);
  assert.equal(value(page, '완료'), true);
  assert.deepEqual(value(page, '완료일'), { start: '2026-10-23T10:00:00+09:00' });
  const day25 = rowsOf(backend, SOURCES.days).find((d) => value(d, '일자').start === '2026-10-25');
  assert.deepEqual(value(page, '일간 기록'), [day25.id]);
});

test('휴지통으로 보내면 목록에서 빠진다', async () => {
  const { backend, handler } = setup();
  const created = (await invoke(handler, { body: { action: 'createItem', item: { title: '지울 것', type: 'info' } } })).body.item;
  assert.equal((await invoke(handler, { body: { action: 'trashItem', id: created.id } })).status, 200);
  assert.equal(backend.pages.get(created.id).in_trash, true);
});

test('처음 열면 오늘 일간 기록을 만들고 습관 수에 활성 습관 개수를 넣는다', async () => {
  const { backend, handler } = setup();
  const res = await invoke(handler, { method: 'GET', query: { action: 'bootstrap' } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.today, '2026-10-23');
  assert.equal(res.body.habits.length, 3);
  assert.equal(res.body.quadrants.length, 4);
  const [day] = rowsOf(backend, SOURCES.days);
  assert.equal(value(day, '습관 수'), 2);
  assert.equal(res.body.days.at(-1).date, '2026-10-23');
});

test('습관 체크는 키로 한 줄만 만들고, 끄면 완료만 해제하며, 연속 일수를 다시 센다', async () => {
  const { backend, handler } = setup();
  const habitId = backend.water.id;
  const key = (d) => `${habitId.replaceAll('-', '')}:${d}`;
  for (const d of ['2026-10-21', '2026-10-22']) {
    backend.put(SOURCES.habitLogs, {
      '날짜': { date: { start: d } }, '완료': { checkbox: true }, '키': { rich_text: [{ text: { content: key(d) } }] }, '습관': { relation: [{ id: habitId }] },
    });
  }
  const on = await invoke(handler, { body: { action: 'toggleHabit', habitId, date: '2026-10-23', done: true, name: '물 마시기', icon: '💧' } });
  assert.equal(on.status, 200, JSON.stringify(on.body));
  assert.equal(on.body.streak, 3);
  assert.equal(value(backend.water, '연속 일수'), 3);
  const today = rowsOf(backend, SOURCES.habitLogs).filter((l) => value(l, '키') === key('2026-10-23'));
  assert.equal(today.length, 1);
  assert.equal(value(today[0], '기록'), '💧 물 마시기 · 10/23');
  const off = await invoke(handler, { body: { action: 'toggleHabit', habitId, date: '2026-10-23', done: false } });
  assert.equal(off.body.streak, 2);
  assert.equal(rowsOf(backend, SOURCES.habitLogs).length, 3);
  assert.equal(value(today[0], '완료'), false);
});

test('연속 일수 계산', () => {
  assert.equal(computeStreak(['2026-10-23', '2026-10-22', '2026-10-20'], '2026-10-23'), 2);
  assert.equal(computeStreak(['2026-10-22', '2026-10-21'], '2026-10-23'), 2);
  assert.equal(computeStreak(['2026-10-20'], '2026-10-23'), 0);
  assert.equal(computeStreak(['2026-10-01', '2026-09-30'], '2026-10-01'), 2);
});

test('여러 건 처리는 하나가 실패해도 나머지를 계속한다', async () => {
  const { handler } = setup();
  const res = await invoke(handler, {
    body: { action: 'batch', ops: [
      { op: 'create', item: { title: '하나', type: 'task' } },
      { op: 'trash', id: '99999999-0000-4000-8000-000000000000' },
      { op: 'create', item: { title: '둘', type: 'someday' } },
    ] },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results.map((r) => r.ok), [true, false, true]);
});

test('노션 페이지를 앱 항목으로 읽는다', () => {
  const item = itemFromPage({
    id: 'p1', url: 'u', created_time: 'c', last_edited_time: 'e',
    properties: {
      '이름': { title: [{ plain_text: '회의' }] },
      '종류': { select: { name: '일정' } },
      '날짜': { date: { start: '2026-10-24T10:00:00.000+09:00', end: null } },
      '태그': { multi_select: [{ name: '업무' }] },
      '출처': { select: { name: '구글 캘린더' } },
      '구글 캘린더 ID': { rich_text: [{ plain_text: 'ev1' }] },
    },
  });
  assert.equal(item.type, 'event');
  assert.equal(item.source, 'gcal');
  assert.equal(item.gcalId, 'ev1');
  assert.deepEqual(item.tags, ['업무']);
});

test('일정, 습관 기록 외 알 수 없는 요청은 400', async () => {
  const { handler } = setup();
  assert.equal((await invoke(handler, { body: { action: 'dropDatabase' } })).status, 400);
  assert.equal((await invoke(handler, { method: 'GET', query: { action: 'createItem' } })).status, 400);
});
