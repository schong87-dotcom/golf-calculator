// 노션 항목과 구글 캘린더, 구글 할 일 사이의 동기화 계획(planSync)과 변환 함수를 검증하는 단위 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planSync, eventBody, eventFields, taskBody, taskFields, stateAfter, stripMark, notionLink,
} from '../src/assistant/sync.js';

process.env.TZ = 'Asia/Seoul';
const NOW = new Date('2026-10-23T09:00:00+09:00');
const ID = '401c8b68-6387-8160-894a-fb57955d9ca5';

const item = (over) => ({
  id: ID, title: '치과', type: 'event', start: '2026-10-24T15:00:00+09:00', end: '2026-10-24T16:00:00+09:00',
  done: false, place: '', memo: '', gcalId: null, gtaskId: null, syncState: '', editedAt: '2026-10-23T00:00:00.000Z', ...over,
});
const kinds = (ops) => ops.map((o) => o.kind);

test('구글 ID 가 없는 일정은 캘린더에 새로 만든다', () => {
  assert.deepEqual(kinds(planSync({ items: [item()], now: NOW })), ['createEvent']);
});

test('완료한 일정과 날짜 없는 일정은 만들지 않는다', () => {
  assert.deepEqual(planSync({ items: [item({ done: true }), item({ id: 'x', start: null })], now: NOW }), []);
});

test('할 일은 날짜가 없어도 구글 할 일에 만든다. 언젠가와 정보는 보내지 않는다', () => {
  const ops = planSync({
    items: [item({ type: 'task', start: null }), item({ id: 's', type: 'someday' }), item({ id: 'i', type: 'info' })],
    now: NOW,
  });
  assert.deepEqual(kinds(ops), ['createTask']);
});

test('동기화 뒤 아무것도 안 바뀌면 할 일이 없다', () => {
  const synced = item({ gcalId: 'ev1' });
  synced.syncState = stateAfter(synced, '2026-10-23T01:00:00.000Z');
  const event = { id: 'ev1', updated: '2026-10-23T01:00:00.000Z', ...eventBody(synced, 'Asia/Seoul') };
  assert.deepEqual(planSync({ items: [synced], events: [event], now: NOW }), []);
});

test('노션에서 제목을 바꾸면 구글 일정을 고친다', () => {
  const synced = item({ gcalId: 'ev1' });
  synced.syncState = stateAfter(synced, 'u1');
  const changed = { ...synced, title: '치과 (스케일링)' };
  const ops = planSync({ items: [changed], events: [{ id: 'ev1', updated: 'u1', summary: '치과' }], now: NOW });
  assert.deepEqual(kinds(ops), ['patchEvent']);
});

test('구글에서 시간을 바꾸면 노션으로 가져온다', () => {
  const synced = item({ gcalId: 'ev1' });
  synced.syncState = stateAfter(synced, 'u1');
  const event = {
    id: 'ev1', updated: '2026-10-23T02:00:00.000Z', summary: '치과',
    start: { dateTime: '2026-10-24T17:00:00+09:00' }, end: { dateTime: '2026-10-24T18:00:00+09:00' },
  };
  const ops = planSync({ items: [synced], events: [event], now: NOW });
  assert.deepEqual(kinds(ops), ['pullEvent']);
  assert.equal(ops[0].fields.start, '2026-10-24T17:00:00+09:00');
});

test('양쪽 다 바뀌면 나중에 고친 쪽이 이긴다', () => {
  const synced = item({ gcalId: 'ev1' });
  synced.syncState = stateAfter(synced, 'u1');
  const local = { ...synced, title: '노션에서 고침', editedAt: '2026-10-23T03:00:00.000Z' };
  const newer = { id: 'ev1', updated: '2026-10-23T04:00:00.000Z', summary: '구글에서 고침' };
  const older = { ...newer, updated: '2026-10-23T02:00:00.000Z' };
  assert.deepEqual(kinds(planSync({ items: [local], events: [newer], now: NOW })), ['pullEvent']);
  assert.deepEqual(kinds(planSync({ items: [local], events: [older], now: NOW })), ['patchEvent']);
});

test('구글에서 취소된 일정은 노션 항목을 휴지통으로 보낸다', () => {
  const ops = planSync({ items: [item({ gcalId: 'ev1' })], events: [{ id: 'ev1', status: 'cancelled' }], now: NOW });
  assert.deepEqual(kinds(ops), ['trashItem']);
});

test('구글에만 있는 일정은 노션으로 가져오고, 거절한 일정과 앱이 만든 일정은 건너뛴다', () => {
  const events = [
    { id: 'g1', summary: '점심', start: { dateTime: '2026-10-23T12:00:00+09:00' }, end: { dateTime: '2026-10-23T13:00:00+09:00' } },
    { id: 'g2', summary: '거절', start: { date: '2026-10-25' }, end: { date: '2026-10-26' }, attendees: [{ self: true, responseStatus: 'declined' }] },
    { id: 'g3', summary: '앱 것', start: { date: '2026-10-25' }, end: { date: '2026-10-26' }, extendedProperties: { private: { notionPageId: 'zzz' } } },
  ];
  const ops = planSync({ items: [], events, now: NOW });
  assert.deepEqual(kinds(ops), ['importEvent']);
  assert.equal(ops[0].fields.title, '점심');
});

test('ID 를 노션에 못 적었던 일정은 표식으로 찾아 다시 잇는다(중복 생성 방지)', () => {
  const event = { id: 'g9', summary: '치과', extendedProperties: { private: { notionPageId: ID.replaceAll('-', '') } } };
  assert.deepEqual(kinds(planSync({ items: [item()], events: [event], now: NOW })), ['linkEvent']);
});

test('종일 일정은 구글의 배타적 끝 날짜를 하루 당긴다', () => {
  assert.deepEqual(eventFields({ summary: '휴가', start: { date: '2026-11-02' }, end: { date: '2026-11-05' } }), {
    title: '휴가', start: '2026-11-02', end: '2026-11-04', place: '', memo: '',
  });
  assert.equal(eventFields({ summary: '생일', start: { date: '2026-11-05' }, end: { date: '2026-11-06' } }).end, null);
});

test('일정 본문에는 노션 표식과 링크가 붙고, 끝이 없으면 한 시간짜리다', () => {
  const body = eventBody(item({ end: null, memo: '스케일링' }), 'Asia/Seoul');
  assert.equal(body.end.dateTime, '2026-10-24T16:00:00+09:00');
  assert.equal(body.extendedProperties.private.notionPageId, ID.replaceAll('-', ''));
  assert.match(body.description, /스케일링\n\n노션 비서: https:\/\/www\.notion\.so\//);
  assert.equal(stripMark(body.description), '스케일링');
  const allDay = eventBody(item({ start: '2026-11-05', end: null }), 'Asia/Seoul');
  assert.deepEqual([allDay.start, allDay.end], [{ date: '2026-11-05' }, { date: '2026-11-06' }]);
});

test('구글 할 일 변환과 완료 상태', () => {
  const body = taskBody(item({ type: 'task', start: '2026-10-31', done: false }));
  assert.equal(body.due, '2026-10-31T00:00:00.000Z');
  assert.equal(body.status, 'needsAction');
  assert.equal(body.completed, null);
  assert.ok(body.notes.includes(notionLink(ID)));
  assert.deepEqual(taskFields({ title: '세금', due: '2026-10-31T00:00:00.000Z', status: 'completed', notes: body.notes }), {
    title: '세금', start: '2026-10-31', done: true, memo: '',
  });
});

test('구글에서 완료한 할 일은 노션에 완료로 가져온다', () => {
  const synced = item({ type: 'task', gtaskId: 't1', start: '2026-10-31', end: null });
  synced.syncState = stateAfter(synced, 'u1');
  const task = { id: 't1', updated: 'u2', title: '치과', due: '2026-10-31T00:00:00.000Z', status: 'completed' };
  const ops = planSync({ items: [synced], tasks: [task], now: NOW });
  assert.deepEqual(kinds(ops), ['pullTask']);
  assert.equal(ops[0].fields.done, true);
});

test('구글 할 일만 있는 것은 가져오고, 오래전에 끝낸 것과 빈 제목은 건너뛴다', () => {
  const tasks = [
    { id: 'a', title: '장보기', status: 'needsAction' },
    { id: 'b', title: '예전 일', status: 'completed', completed: '2026-09-01T00:00:00.000Z' },
    { id: 'c', title: '  ', status: 'needsAction' },
    { id: 'd', title: '지운 것', deleted: true },
  ];
  assert.deepEqual(kinds(planSync({ items: [], tasks, now: NOW })), ['importTask']);
});

test('종류를 일정에서 할 일로 바꾸면 캘린더 일정을 지우고 할 일을 만든다', () => {
  const ops = planSync({ items: [item({ type: 'task', gcalId: 'ev1' })], now: NOW });
  assert.deepEqual(kinds(ops).sort(), ['createTask', 'deleteEvent']);
});
