// 퀴즈게임 채점, 명단, 순위(src/quiz/scoring.js)와 문제 모델(src/quiz/model.js)을 검증한다
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAnswer, gradeAnswer, gradeQuestion, rankParticipants, isScored, buildReveal, applyGrade,
} from '../src/quiz/scoring.js';
import { newQuestion, validateQuiz, makeCode, cleanQuiz, toEditable, toggleSelection } from '../src/quiz/model.js';

const choiceQ = {
  id: 'q1', type: 'choice', prompt: '수도는?', points: 1,
  options: [
    { id: 'a', label: '서울', correct: true },
    { id: 'b', label: '부산', correct: false },
    { id: 'c', label: '대구', correct: false },
  ],
};
const yesnoQ = { id: 'q2', type: 'yesno', prompt: '지구는 둥글다', points: 1, answer: 'yes' };
const textQ = {
  id: 'q3', type: 'text', prompt: '미국 최대 도시', points: 1,
  answers: [{ value: '뉴욕', aliases: ['New York', 'NYC'] }],
};
const listQ = {
  id: 'q4', type: 'list', prompt: '관광도시를 쓰세요', points: 1, slots: 10,
  answers: [
    { value: '파리', aliases: ['Paris'] },
    { value: '런던', aliases: [] },
    { value: '뉴욕', aliases: [] },
    { value: '도쿄', aliases: [] },
    { value: '바르셀로나', aliases: [] },
  ],
};

const P = ['가', '나', '다', '라', '마'].map((name, i) => ({ id: `p${i + 1}`, name }));
const resp = (pid, qid, answer, at = '2026-10-11T10:00:00Z') =>
  ({ participant_id: pid, question_id: qid, answer, submitted_at: at });

describe('표기 정리', () => {
  test('앞뒤 공백과 가운데 띄어쓰기를 없앤다', () => {
    assert.equal(normalizeAnswer('  뉴 욕 '), '뉴욕');
  });
  test('대소문자와 문장부호를 무시한다', () => {
    assert.equal(normalizeAnswer('Paris!'), 'paris');
    assert.equal(normalizeAnswer('New-York.'), 'newyork');
  });
  test('맥에서 들어온 자모 분리형(NFD) 한글도 같은 답으로 본다', () => {
    assert.equal(normalizeAnswer('파리'.normalize('NFD')), normalizeAnswer('파리'));
  });
  test('빈 값과 null 은 빈 문자열', () => {
    assert.equal(normalizeAnswer(null), '');
    assert.equal(normalizeAnswer('   '), '');
  });
});

describe('객관식 채점', () => {
  test('정답 보기를 고르면 배점만큼', () => {
    assert.deepEqual(
      pick(gradeAnswer(choiceQ, { optionId: 'a' })),
      { answered: true, correct: true, points: 1 },
    );
  });
  test('다른 보기는 0점', () => {
    assert.deepEqual(
      pick(gradeAnswer(choiceQ, { optionId: 'b' })),
      { answered: true, correct: false, points: 0 },
    );
  });
  test('응답이 없으면 0점, 미응답', () => {
    assert.deepEqual(pick(gradeAnswer(choiceQ, null)), { answered: false, correct: false, points: 0 });
  });
  test('정답 보기를 지정하지 않은 문제는 채점하지 않는다 (설문)', () => {
    const poll = { ...choiceQ, options: choiceQ.options.map(o => ({ ...o, correct: false })) };
    assert.equal(isScored(poll), false);
    assert.deepEqual(pick(gradeAnswer(poll, { optionId: 'a' })), { answered: true, correct: null, points: 0 });
  });
  test('배점 3점 문제는 3점', () => {
    assert.equal(gradeAnswer({ ...choiceQ, points: 3 }, { optionId: 'a' }).points, 3);
  });
});

describe('예/아니오 채점', () => {
  test('맞으면 배점, 틀리면 0점', () => {
    assert.equal(gradeAnswer(yesnoQ, { value: 'yes' }).correct, true);
    assert.equal(gradeAnswer(yesnoQ, { value: 'no' }).correct, false);
  });
  test('정답을 비워 두면 채점하지 않는다', () => {
    assert.equal(gradeAnswer({ ...yesnoQ, answer: null }, { value: 'yes' }).correct, null);
  });
});

describe('주관식 채점', () => {
  test('띄어쓰기가 달라도 정답', () => {
    assert.equal(gradeAnswer(textQ, { text: '뉴 욕' }).correct, true);
  });
  test('별칭도 정답', () => {
    assert.equal(gradeAnswer(textQ, { text: 'nyc' }).correct, true);
    assert.equal(gradeAnswer(textQ, { text: 'new york' }).correct, true);
  });
  test('목록에 없는 답은 오답, 인정하면 정답', () => {
    assert.equal(gradeAnswer(textQ, { text: '서울' }).correct, false);
    assert.equal(gradeAnswer(textQ, { text: '서울' }, [{ value: '서울', item: null }]).correct, true);
  });
  test('빈 답은 오답', () => {
    assert.equal(gradeAnswer(textQ, { text: '  ' }).correct, false);
  });
});

describe('목록형 시나리오 (기획안 3절)', () => {
  const A = { items: ['파리', 'paris', '런던', '서울'] };
  const B = { items: ['뉴 욕', '도쿄'] };

  test('A — 파리와 paris 는 같은 답이라 1개, 서울은 목록에 없어 맞춘 개수 2', () => {
    const r = gradeAnswer(listQ, A);
    assert.equal(r.points, 2);
    assert.deepEqual(r.matched, ['파리', '런던']);
    assert.deepEqual(r.unmatched, ['서울']);
  });
  test('B — 뉴 욕, 도쿄 2개', () => {
    assert.equal(gradeAnswer(listQ, B).points, 2);
  });
  test('강사가 서울을 새 정답으로 인정하면 A 는 3개, B 는 그대로 2개', () => {
    const accepts = [{ value: '서울', item: null }];
    assert.equal(gradeAnswer(listQ, A, accepts).points, 3);
    assert.equal(gradeAnswer(listQ, B, accepts).points, 2);
  });
  test('오타를 기존 정답의 다른 표기로 묶으면 둘 다 써도 1개', () => {
    const accepts = [{ value: '바르셀로냐', item: 4 }];
    const r = gradeAnswer(listQ, { items: ['바르셀로나', '바르셀로냐'] }, accepts);
    assert.equal(r.points, 1);
    assert.deepEqual(r.matched, ['바르셀로나']);
  });
  test('개당 배점 2점이면 맞춘 개수 × 2', () => {
    assert.equal(gradeAnswer({ ...listQ, points: 2 }, A).points, 4);
  });
  test('칸 수를 넘는 입력은 보지 않는다', () => {
    assert.equal(gradeAnswer({ ...listQ, slots: 2 }, { items: ['파리', '런던', '도쿄'] }).points, 2);
  });
  test('빈칸은 무시한다', () => {
    const r = gradeAnswer(listQ, { items: ['', '  ', '도쿄'] });
    assert.equal(r.points, 1);
    assert.deepEqual(r.unmatched, []);
  });
  test('하나도 못 맞추면 오답', () => {
    assert.equal(gradeAnswer(listQ, { items: ['서울'] }).correct, false);
  });
});

describe('공개 화면 명단', () => {
  const responses = [
    resp('p1', 'q1', { optionId: 'a' }),
    resp('p2', 'q1', { optionId: 'a' }),
    resp('p3', 'q1', { optionId: 'a' }),
    resp('p4', 'q1', { optionId: 'b' }),
  ];
  const g = gradeQuestion(choiceQ, P, responses);

  test('맞춘 사람, 틀린 사람, 미응답이 나뉜다', () => {
    assert.deepEqual(g.correctNames, ['가', '나', '다']);
    assert.deepEqual(g.wrongNames, ['라']);
    assert.deepEqual(g.noAnswerNames, ['마']);
  });
  test('보기별 선택 수', () => {
    assert.deepEqual(g.counts, { a: 3, b: 1, c: 0 });
  });
  test('참가자별 결과가 나온다', () => {
    assert.deepEqual(g.results.p1, { correct: true, points: 1 });
    assert.deepEqual(g.results.p5, { correct: false, points: 0 });
  });

  test('예/아니오 선택 수', () => {
    const y = gradeQuestion(yesnoQ, P, [resp('p1', 'q2', { value: 'yes' }), resp('p2', 'q2', { value: 'no' })]);
    assert.deepEqual(y.counts, { yes: 1, no: 1 });
  });
});

describe('목록에 없는 답 모아 보기 (원클릭 인정 후보)', () => {
  const responses = [
    resp('p1', 'q4', { items: ['서울', '파리'] }),
    resp('p2', 'q4', { items: ['서울 '] }),
    resp('p3', 'q4', { items: ['부산', '서울'] }),
  ];
  test('같은 답은 사람 수로 묶고 많이 쓴 순', () => {
    const g = gradeQuestion(listQ, P, responses);
    assert.deepEqual(g.unmatched.map(u => [u.value, u.count]), [['서울', 3], ['부산', 1]]);
  });
  test('인정한 답은 후보에서 빠진다', () => {
    const g = gradeQuestion(listQ, P, responses, [{ value: '서울', item: null }]);
    assert.deepEqual(g.unmatched.map(u => u.value), ['부산']);
  });
  test('정답 항목별로 맞춘 사람 수', () => {
    const g = gradeQuestion(listQ, P, responses);
    assert.equal(g.counts['파리'], 1);
    assert.equal(g.counts['런던'], 0);
  });
});

describe('목록형 상품 순위 — 맞춘 개수, 같으면 먼저 낸 사람', () => {
  test('개수 순, 동점은 제출 시각 순', () => {
    const responses = [
      resp('p1', 'q4', { items: ['파리'] }, '2026-10-11T10:00:05Z'),
      resp('p2', 'q4', { items: ['파리', '런던'] }, '2026-10-11T10:00:09Z'),
      resp('p3', 'q4', { items: ['도쿄'] }, '2026-10-11T10:00:01Z'),
    ];
    const g = gradeQuestion(listQ, P, responses);
    assert.deepEqual(g.listRanking.map(r => [r.rank, r.name, r.count]), [[1, '나', 2], [2, '다', 1], [3, '가', 1]]);
  });
});

describe('누적 순위', () => {
  test('총점 순, 동점은 공동 순위', () => {
    const results = {
      p1: { q1: { correct: true, points: 1 }, q2: { correct: true, points: 2 } },
      p2: { q1: { correct: true, points: 3 } },
      p3: { q1: { correct: true, points: 1 } },
      p4: {},
    };
    const ranked = rankParticipants(P.slice(0, 4), results);
    assert.deepEqual(ranked.map(r => [r.rank, r.name, r.score]), [[1, '가', 3], [1, '나', 3], [3, '다', 1], [4, '라', 0]]);
  });
});

describe('문제 모델', () => {
  let n = 0;
  const id = () => `id${++n}`;

  test('새 객관식은 보기 4개, 정답 미지정', () => {
    const q = newQuestion('choice', id);
    assert.equal(q.options.length, 4);
    assert.ok(q.options.every(o => o.correct === false));
    assert.equal(q.points, 1);
  });
  test('새 목록형은 10칸', () => {
    assert.equal(newQuestion('list', id).slots, 10);
  });
  test('문제 문장이 비면 오류', () => {
    const q = { ...newQuestion('yesno', id), prompt: '' };
    assert.equal(validateQuiz({ title: 't', questions: [q] }).length, 1);
  });
  test('객관식 보기가 2개 미만이면 오류', () => {
    const q = { ...newQuestion('choice', id), prompt: '문제', options: [{ id: 'x', label: '하나', correct: true }] };
    assert.ok(validateQuiz({ title: 't', questions: [q] }).length >= 1);
  });
  test('문제가 없으면 오류, 정상 퀴즈는 오류 0개', () => {
    assert.ok(validateQuiz({ title: 't', questions: [] }).length >= 1);
    const q = { ...newQuestion('yesno', id), prompt: '문제' };
    assert.deepEqual(validateQuiz({ title: 't', questions: [q] }), []);
  });
  test('입장코드는 6자리 숫자, 난수를 주입할 수 있다', () => {
    assert.equal(makeCode(() => 0), '000000');
    assert.equal(makeCode(() => 0.123456), '123456');
    assert.match(makeCode(), /^[0-9]{6}$/);
  });
});

describe('공개 내용과 점수 반영', () => {
  test('객관식 공개 내용은 정답 보기 id 만', () => {
    assert.deepEqual(buildReveal(choiceQ), { questionId: 'q1', type: 'choice', scored: true, correctOptionIds: ['a'] });
  });
  test('목록형 공개 내용에 인정한 답이 들어가고 별칭은 빠진다', () => {
    const r = buildReveal(listQ, [{ value: '서울', item: null }]);
    assert.deepEqual(r.answers, ['파리', '런던', '뉴욕', '도쿄', '바르셀로나', '서울']);
    assert.ok(!JSON.stringify(r).includes('Paris'));
  });
  test('앞 문제 결과에 이번 문제를 더해 총점과 순위를 낸다', () => {
    const parts = [
      { id: 'p1', name: '가', results: { q1: { correct: true, points: 1 } } },
      { id: 'p2', name: '나', results: {} },
    ];
    const g = gradeQuestion(listQ, parts, [resp('p2', 'q4', { items: ['파리', '런던'] })]);
    assert.deepEqual(applyGrade(parts, listQ, g).map(r => [r.id, r.score, r.rank]), [['p2', 2, 1], ['p1', 1, 2]]);
  });
});

describe('편집기 다른 표기 입력', () => {
  test('쉼표로 쓴 다른 표기를 배열로, 빈 보기와 빈 정답은 저장하지 않는다', () => {
    const q = {
      ...listQ,
      answers: [{ value: ' 뉴욕 ', aliasText: 'New York, NYC ,, ' }, { value: '  ', aliasText: '' }],
    };
    const c = cleanQuiz({ title: ' t ', questions: [q, { ...choiceQ, options: [...choiceQ.options, { id: 'z', label: ' ', correct: false }] }] });
    assert.deepEqual(c.questions[0].answers, [{ value: '뉴욕', aliases: ['New York', 'NYC'] }]);
    assert.equal(c.questions[1].options.length, 3);
    assert.equal(c.title, 't');
  });
  test('불러올 때는 다시 쉼표 글로', () => {
    assert.equal(toEditable({ questions: [textQ] }).questions[0].answers[0].aliasText, 'New York, NYC');
  });
});

const multiQ = {
  id: 'q5', type: 'multi', prompt: '과일 3개를 고르세요', points: 1, pick: 3,
  options: [
    { id: 'o1', label: '사과', correct: true }, { id: 'o2', label: '당근', correct: false },
    { id: 'o3', label: '바나나', correct: true }, { id: 'o4', label: '배추', correct: false },
    { id: 'o5', label: '포도', correct: true }, { id: 'o6', label: '오이', correct: false },
  ],
};

describe('여러 개 고르기 채점', () => {
  test('맞게 고른 개수 × 개당 배점, 맞춘 답은 보기 순서로', () => {
    const r = gradeAnswer(multiQ, { optionIds: ['o5', 'o2', 'o1'] });
    assert.equal(r.points, 2);
    assert.equal(r.correct, true);
    assert.deepEqual(r.matched, ['사과', '포도']);
  });
  test('하나도 못 맞추면 오답 0점', () => {
    assert.deepEqual(pick(gradeAnswer(multiQ, { optionIds: ['o2', 'o4', 'o6'] })), { answered: true, correct: false, points: 0 });
  });
  test('같은 보기 중복, 없는 보기, 고를 개수를 넘는 선택은 세지 않는다', () => {
    const r = gradeAnswer(multiQ, { optionIds: ['o1', 'o1', 'zz', 'o2', 'o3', 'o5'] });
    assert.deepEqual(r.matched, ['사과', '바나나']);
    assert.equal(r.points, 2);
  });
  test('개당 배점 2점이면 3개 맞춰 6점', () => {
    assert.equal(gradeAnswer({ ...multiQ, points: 2 }, { optionIds: ['o1', 'o3', 'o5'] }).points, 6);
  });
  test('정답 보기를 지정하지 않으면 채점하지 않는다', () => {
    const poll = { ...multiQ, options: multiQ.options.map(o => ({ ...o, correct: false })) };
    assert.equal(isScored(poll), false);
    assert.equal(gradeAnswer(poll, { optionIds: ['o1'] }).correct, null);
  });
  test('공개 화면 — 보기별 고른 사람 수, 맞춘 개수 순위(같으면 먼저 낸 사람)', () => {
    const g = gradeQuestion(multiQ, P, [
      resp('p1', 'q5', { optionIds: ['o1', 'o2', 'o4'] }, '2026-10-11T10:00:03Z'),
      resp('p2', 'q5', { optionIds: ['o1', 'o3', 'o5'] }, '2026-10-11T10:00:05Z'),
      resp('p3', 'q5', { optionIds: ['o3', 'o2', 'o6'] }, '2026-10-11T10:00:01Z'),
    ]);
    assert.deepEqual(g.counts, { o1: 2, o2: 2, o3: 2, o4: 1, o5: 1, o6: 1 });
    assert.deepEqual(g.listRanking.map(r => [r.rank, r.name, r.count]), [[1, '나', 3], [2, '다', 1], [3, '가', 1]]);
    assert.deepEqual(g.results.p2, { correct: true, points: 3, matched: ['사과', '바나나', '포도'] });
    assert.deepEqual(g.noAnswerNames, ['라', '마']);
  });
  test('공개 내용은 정답 보기 id 만', () => {
    assert.deepEqual(buildReveal(multiQ), { questionId: 'q5', type: 'multi', scored: true, correctOptionIds: ['o1', 'o3', 'o5'] });
  });
});

describe('여러 개 고르기 선택 번호', () => {
  test('누를 때마다 뒤에 붙어 1, 2, 3 번호가 된다', () => {
    let s = [];
    for (const id of ['a', 'b', 'c']) s = toggleSelection(s, id, 3);
    assert.deepEqual(s, ['a', 'b', 'c']);
  });
  test('정해진 개수를 채우면 더 고르지 않는다', () => {
    assert.deepEqual(toggleSelection(['a', 'b', 'c'], 'd', 3), ['a', 'b', 'c']);
  });
  test('다시 누르면 빠지고 뒤 번호가 하나씩 당겨진다', () => {
    assert.deepEqual(toggleSelection(['a', 'b', 'c'], 'a', 3), ['b', 'c']);
    assert.deepEqual(toggleSelection(['b', 'c'], 'a', 3), ['b', 'c', 'a']);
  });
});

describe('여러 개 고르기 편집', () => {
  let n = 0;
  const id = () => `m${++n}`;
  const filled = () => {
    const q = { ...newQuestion('multi', id), prompt: '고르세요' };
    q.options = q.options.map((o, i) => ({ ...o, label: `보기${i + 1}`, correct: i < 2 }));
    return q;
  };
  test('새 문제는 보기 4개, 고를 개수 2', () => {
    const q = newQuestion('multi', id);
    assert.equal(q.options.length, 4);
    assert.equal(q.pick, 2);
  });
  test('고를 개수가 0이거나 채운 보기 수보다 많으면 오류', () => {
    assert.ok(validateQuiz({ title: 't', questions: [{ ...filled(), pick: 0 }] }).length >= 1);
    assert.ok(validateQuiz({ title: 't', questions: [{ ...filled(), pick: 5 }] }).length >= 1);
    assert.deepEqual(validateQuiz({ title: 't', questions: [{ ...filled(), pick: '4' }] }), []);
  });
  test('저장할 때 빈 보기를 빼고 고를 개수는 숫자로', () => {
    const q = { ...filled(), pick: '2' };
    q.options = [...q.options, { id: 'blank', label: ' ', correct: false }];
    const c = cleanQuiz({ title: 't', questions: [q] }).questions[0];
    assert.equal(c.options.length, 4);
    assert.equal(c.pick, 2);
  });
});

function pick(r) {
  return { answered: r.answered, correct: r.correct, points: r.points };
}
