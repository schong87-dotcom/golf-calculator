// 노션 비서 빠른 입력 해석기(한 줄 → 종류, 날짜, 시간, 영역)를 검증하는 단위 테스트. TZ=Asia/Seoul 에서 돈다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickInput } from '../src/assistant/parse.js';

process.env.TZ = 'Asia/Seoul';
// 2026-10-23 금요일 오전 9시
const NOW = new Date('2026-10-23T09:00:00+09:00');
const AREAS = [
  { id: 'a-work', name: '업무' },
  { id: 'a-health', name: '건강' },
];
const parse = (text) => parseQuickInput(text, NOW, { areas: AREAS });

test('시각이 있으면 일정이고 끝은 한 시간 뒤다', () => {
  const r = parse('내일 오후 3시 치과');
  assert.equal(r.type, 'event');
  assert.equal(r.title, '치과');
  assert.equal(r.start, '2026-10-24T15:00:00+09:00');
  assert.equal(r.end, '2026-10-24T16:00:00+09:00');
});

test('「까지」는 기한이 있는 할 일이다', () => {
  const r = parse('금요일까지 보고서 제출');
  assert.equal(r.type, 'task');
  assert.equal(r.title, '보고서 제출');
  assert.equal(r.start, '2026-10-23');
  assert.equal(r.end, null);
});

test('다음 주 요일과 영역 태그', () => {
  const r = parse('다음 주 월요일 10시 팀 회의 #업무');
  assert.equal(r.type, 'event');
  assert.equal(r.title, '팀 회의');
  assert.equal(r.start, '2026-10-26T10:00:00+09:00');
  assert.deepEqual(r.areaIds, ['a-work']);
});

test('이번 주 요일이 지났으면 그 주 날짜 그대로, 그냥 요일은 다가오는 날', () => {
  assert.equal(parse('이번 주 수요일 정리').start, '2026-10-21');
  assert.equal(parse('수요일 정리').start, '2026-10-28');
  assert.equal(parse('토요일 대청소').start, '2026-10-24');
});

test('언젠가로 시작하면 언젠가 목록', () => {
  const r = parse('언젠가 제주도 한 달 살기');
  assert.equal(r.type, 'someday');
  assert.equal(r.title, '제주도 한 달 살기');
  assert.equal(r.start, null);
});

test('메모로 시작하면 정보', () => {
  const r = parse('메모: 회사 와이파이 비번 jabez1234');
  assert.equal(r.type, 'info');
  assert.equal(r.title, '회사 와이파이 비번 jabez1234');
});

test('날짜도 단서도 없으면 기한 없는 할 일', () => {
  const r = parse('우유 사기');
  assert.equal(r.type, 'task');
  assert.equal(r.title, '우유 사기');
  assert.equal(r.start, null);
});

test('저녁이라는 말이 있으면 7시는 19시, @ 뒤는 장소', () => {
  const r = parse('10/30 7시 저녁 약속 @강남역');
  assert.equal(r.type, 'event');
  assert.equal(r.start, '2026-10-30T19:00:00+09:00');
  assert.equal(r.place, '강남역');
  assert.equal(r.title, '저녁 약속');
});

test('오전 오후가 없으면 1시에서 6시는 오후로 본다', () => {
  const r = parse('3시 반에 은행');
  assert.equal(r.start, '2026-10-23T15:30:00+09:00');
  assert.equal(r.title, '은행');
});

test('시작과 끝 시각 범위', () => {
  const r = parse('모레 9시부터 11시까지 워크숍');
  assert.equal(r.type, 'event');
  assert.equal(r.start, '2026-10-25T09:00:00+09:00');
  assert.equal(r.end, '2026-10-25T11:00:00+09:00');
  assert.equal(r.title, '워크숍');
});

test('24시간 표기와 길이', () => {
  const r = parse('14:30 고객 미팅 2시간');
  assert.equal(r.start, '2026-10-23T14:30:00+09:00');
  assert.equal(r.end, '2026-10-23T16:30:00+09:00');
  assert.equal(r.title, '고객 미팅');
});

test('생일처럼 하루 종일인 행사는 종일 일정', () => {
  const r = parse('11월 5일 아내 생일');
  assert.equal(r.type, 'event');
  assert.equal(r.start, '2026-11-05');
  assert.equal(r.allDay, true);
  assert.equal(r.title, '아내 생일');
});

test('지난 월일은 내년으로 넘긴다', () => {
  assert.equal(parse('3월 2일 개학').start, '2027-03-02');
});

test('느낌표 둘은 중요하고 급함, 하나는 중요', () => {
  const a = parse('!! 세금 신고 10월 31일까지');
  assert.equal(a.important, true);
  assert.equal(a.urgent, true);
  assert.equal(a.type, 'task');
  assert.equal(a.start, '2026-10-31');
  assert.equal(a.title, '세금 신고');
  const b = parse('기획서 다듬기 !');
  assert.equal(b.important, true);
  assert.equal(b.urgent, false);
  assert.equal(b.title, '기획서 다듬기');
});

test('급하다는 말은 긴급 표시', () => {
  const r = parse('급하게 견적서 회신');
  assert.equal(r.urgent, true);
});

test('주소만 있으면 정보, 링크로 분리', () => {
  const r = parse('https://example.com/a?b=1 좋은 글');
  assert.equal(r.type, 'info');
  assert.equal(r.link, 'https://example.com/a?b=1');
  assert.equal(r.title, '좋은 글');
});

test('n일 뒤와 다음 주 같은 상대 표현', () => {
  assert.equal(parse('3일 뒤 택배 반품').start, '2026-10-26');
  assert.equal(parse('2주 후 정기 검진').start, '2026-11-06');
});

test('영역에 없는 해시태그는 태그로 남긴다', () => {
  const r = parse('비타민 주문 #건강 #쇼핑');
  assert.deepEqual(r.areaIds, ['a-health']);
  assert.deepEqual(r.tags, ['쇼핑']);
  assert.equal(r.title, '비타민 주문');
});

test('빈 입력은 제목이 비어 있다', () => {
  const r = parse('   ');
  assert.equal(r.title, '');
});

test('정오와 밤 시각', () => {
  assert.equal(parse('내일 정오 점심 약속').start, '2026-10-24T12:00:00+09:00');
  assert.equal(parse('밤 10시 통화').start, '2026-10-23T22:00:00+09:00');
});

test('날짜 없이 아침 시각만 지났으면 내일로 잡는다', () => {
  // 지금은 9시. 「8시 운동」은 이미 지났으니 내일 8시.
  assert.equal(parse('8시 운동').start, '2026-10-24T08:00:00+09:00');
});
