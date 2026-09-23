// 모임 정산 모델(src/utils/meeting.js)과 4명을 넘는 인원의 정산 계산을 검증한다
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeDefaultMeeting, addParticipant, removeParticipant,
  renameParticipant, findDuplicateNames, MIN_PARTICIPANTS,
} from '../src/utils/meeting.js';
import { calculateSettlement } from '../src/utils/settlement.js';

const item = (name, amount, payers = [], excluded = []) =>
  ({ id: name, name, amount, payers, excluded });

const meetingWith = (participants, items = []) =>
  ({ ...makeDefaultMeeting(0), participants, items });

describe('처음 여는 모임', () => {
  test('참가자 칸 4개가 빈칸으로 시작한다', () => {
    assert.deepEqual(makeDefaultMeeting(0).participants, ['', '', '', '']);
  });

  test('비용 항목은 이름이 빈칸이다 — 골프처럼 정해진 항목명이 없다', () => {
    const { items } = makeDefaultMeeting(0);
    assert.ok(items.length >= 1);
    for (const i of items) {
      assert.equal(i.name, '');
      assert.equal(i.amount, '');
      assert.deepEqual(i.payers, []);
      assert.deepEqual(i.excluded, []);
    }
  });
});

describe('인원 추가·삭제', () => {
  test('추가할 때마다 빈칸이 하나씩 늘어난다 — 12명까지', () => {
    let m = makeDefaultMeeting(0);
    for (let n = 5; n <= 12; n++) {
      m = addParticipant(m);
      assert.equal(m.participants.length, n);
      assert.equal(m.participants.at(-1), '');
    }
  });

  test('원본을 바꾸지 않고 새 객체를 돌려준다', () => {
    const m = makeDefaultMeeting(0);
    const next = addParticipant(m);
    assert.equal(m.participants.length, 4);
    assert.notEqual(next, m);
  });

  test('삭제하면 그 칸만 빠지고 나머지 순서는 유지된다', () => {
    const m = removeParticipant(meetingWith(['가', '나', '다', '라']), 1);
    assert.deepEqual(m.participants, ['가', '다', '라']);
  });

  test('삭제한 사람은 항목의 결제자·제외자 체크에서도 빠진다', () => {
    const m = removeParticipant(
      meetingWith(['가', '나', '다'], [item('1차', 30000, ['나', '가'], ['나'])]),
      1,
    );
    assert.deepEqual(m.items[0].payers, ['가']);
    assert.deepEqual(m.items[0].excluded, []);
  });

  test('같은 이름이 둘이면 하나를 지워도 남은 사람의 체크는 그대로다', () => {
    const m = removeParticipant(
      meetingWith(['가', '나', '나'], [item('1차', 30000, ['나'])]),
      2,
    );
    assert.deepEqual(m.items[0].payers, ['나']);
  });

  test(`최소 ${MIN_PARTICIPANTS}칸 아래로는 지워지지 않는다`, () => {
    const m = meetingWith(['가', '나']);
    assert.deepEqual(removeParticipant(m, 0).participants, ['가', '나']);
  });
});

describe('이름 수정', () => {
  test('이름을 고치면 결제자·제외자 체크도 새 이름으로 따라간다', () => {
    const m = renameParticipant(
      meetingWith(['김민', '나'], [item('1차', 30000, ['김민'], ['김민'])]),
      0, '김민수',
    );
    assert.deepEqual(m.participants, ['김민수', '나']);
    assert.deepEqual(m.items[0].payers, ['김민수']);
    assert.deepEqual(m.items[0].excluded, ['김민수']);
  });

  test('한 글자씩 입력해도 체크가 끝까지 따라간다', () => {
    let m = meetingWith(['홍', '나'], [item('1차', 30000, ['홍'])]);
    for (const v of ['홍길', '홍길동']) m = renameParticipant(m, 0, v);
    assert.deepEqual(m.items[0].payers, ['홍길동']);
  });

  test('이름을 지우면 그 사람 체크도 빠진다', () => {
    const m = renameParticipant(meetingWith(['가', '나'], [item('1차', 30000, ['가'])]), 0, '');
    assert.deepEqual(m.items[0].payers, []);
  });

  test('빈칸에 새 이름을 쓰면 기존 체크는 건드리지 않는다', () => {
    const m = renameParticipant(meetingWith(['가', ''], [item('1차', 30000, ['가'])]), 1, '나');
    assert.deepEqual(m.participants, ['가', '나']);
    assert.deepEqual(m.items[0].payers, ['가']);
  });

  test('같은 이름이 둘일 때 하나를 고쳐도 다른 사람의 체크는 남는다', () => {
    const m = renameParticipant(meetingWith(['나', '나'], [item('1차', 30000, ['나'])]), 1, '나2');
    assert.deepEqual(m.items[0].payers, ['나']);
  });
});

describe('겹치는 이름', () => {
  test('겹치는 이름을 찾는다 — 앞뒤 공백은 무시한다', () => {
    assert.deepEqual(findDuplicateNames(['김민수', '이서연', '김민수 ']), ['김민수']);
  });

  test('빈칸은 겹침으로 치지 않는다', () => {
    assert.deepEqual(findDuplicateNames(['', '', '가', ' ']), []);
  });
});

describe('4명을 넘는 정산 — 골프와 같은 계산식', () => {
  // 1차 120,000 (가 결제, 전원) / 2차 90,000 (나 결제, 마·바 제외) / 3차 30,000 (다·라 공동 결제, 가 제외)
  const people = ['가', '나', '다', '라', '마', '바'];
  const items = [
    item('1차 저녁', 120000, ['가']),
    item('2차 호프', 90000, ['나'], ['마', '바']),
    item('3차 카페', 30000, ['다', '라'], ['가']),
  ];

  test('6명 순액이 손계산과 같다', () => {
    const { balances } = calculateSettlement(people, items);
    const net = Object.fromEntries(people.map(p => [p, balances[p].net]));
    assert.deepEqual(net, { 가: 77500, 나: 41500, 다: -33500, 라: -33500, 마: -26000, 바: -26000 });
  });

  test('6명 송금 내역이 손계산과 같다', () => {
    const { transfers } = calculateSettlement(people, items);
    assert.deepEqual(transfers, [
      { from: '다', to: '가', amount: 33500 },
      { from: '라', to: '가', amount: 33500 },
      { from: '마', to: '가', amount: 10500 },
      { from: '마', to: '나', amount: 15500 },
      { from: '바', to: '나', amount: 26000 },
    ]);
  });

  test('3명 — 4명 미만도 정산된다', () => {
    const { transfers } = calculateSettlement(['가', '나', '다'], [item('1차', 30000, ['가'])]);
    assert.deepEqual(transfers, [
      { from: '나', to: '가', amount: 10000 },
      { from: '다', to: '가', amount: 10000 },
    ]);
  });
});
