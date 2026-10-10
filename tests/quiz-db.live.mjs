// 퀴즈게임 DB 권한과 수강생 함수를 실제 Supabase에서 검증한다 (npm run test:quiz-db)
// 정답 유출 차단(R8), 이름 입장과 같은 이름 거절(R3), 다른 강사 차단(R12), 실시간 알림 전달을 본다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { anonClient, makeHost, cleanupTestUsers, countTestUsers } from './quiz-live.mjs';
import { makeCode } from '../src/quiz/model.js';

const SECRET = '비밀정답_ZQX';
const questions = [
  {
    id: 'q1', type: 'choice', prompt: '고르세요', points: 1,
    options: [{ id: 'a', label: SECRET, correct: true }, { id: 'b', label: '오답보기', correct: false }],
  },
  { id: 'q2', type: 'list', prompt: '쓰세요', points: 1, slots: 3, answers: [{ value: `${SECRET}목록`, aliases: ['별칭_ZQX'] }] },
  {
    id: 'q3', type: 'multi', prompt: '여러 개 고르세요', points: 1, pick: 2,
    options: [{ id: 'm1', label: '가', correct: true }, { id: 'm2', label: '나', correct: false }, { id: 'm3', label: '다', correct: true }],
  },
];

let A, B, anon, quiz, session;

async function rpc(fn, args) {
  const { data, error } = await anon.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
async function rpcError(fn, args) {
  const { error } = await anon.rpc(fn, args);
  return error?.message;
}
async function hostApply(host, patch, scores = null) {
  const { error } = await host.client.rpc('quiz_host_apply', { p_session: session.id, p_patch: patch, p_scores: scores });
  if (error) throw new Error(error.message);
}

before(async () => {
  A = await makeHost('db');
  B = await makeHost('db');
  anon = anonClient();
  const q = await A.client.from('quiz_quizzes').insert({ title: 'DB 시험', questions }).select().single();
  assert.ifError(q.error);
  quiz = q.data;
  const s = await A.client.from('quiz_sessions')
    .insert({ quiz_id: quiz.id, code: makeCode(), title: quiz.title, questions }).select().single();
  assert.ifError(s.error);
  session = s.data;
});

after(() => {
  cleanupTestUsers();
  assert.equal(countTestUsers(), 0);
});

test('익명(수강생)은 퀴즈 테이블을 직접 읽지 못한다', async () => {
  for (const t of ['quiz_quizzes', 'quiz_sessions', 'quiz_participants', 'quiz_responses']) {
    const { data, error } = await anon.from(t).select('*');
    assert.ifError(error);
    assert.deepEqual(data, [], t);
  }
});

test('익명은 강사 함수를 부를 수 없다', async () => {
  const { error } = await anon.rpc('quiz_host_apply', { p_session: session.id, p_patch: { status: 'ended' } });
  assert.ok(error);
});

let token;
test('이름으로 입장하면 토큰을 받고, 같은 이름은 대소문자와 앞뒤 공백이 달라도 거절', async () => {
  const r = await rpc('quiz_join', { p_code: session.code, p_name: ' 홍길동 ' });
  assert.equal(r.name, '홍길동');
  assert.match(r.token, /^[0-9a-f]{64}$/);
  token = r.token;
  assert.equal(await rpcError('quiz_join', { p_code: session.code, p_name: '홍길동' }), 'quiz_name_taken');
  await rpc('quiz_join', { p_code: session.code, p_name: 'Kim' });
  assert.equal(await rpcError('quiz_join', { p_code: session.code, p_name: 'kim ' }), 'quiz_name_taken');
});

test('빈 이름, 21자 이름, 없는 코드는 거절', async () => {
  assert.equal(await rpcError('quiz_join', { p_code: session.code, p_name: '  ' }), 'quiz_bad_name');
  assert.equal(await rpcError('quiz_join', { p_code: session.code, p_name: '가'.repeat(21) }), 'quiz_bad_name');
  assert.equal(await rpcError('quiz_join', { p_code: 'xxxxxx', p_name: '누구' }), 'quiz_not_found');
});

test('대기 중 상태 — 내 이름이 보이고 문제는 없다', async () => {
  const st = await rpc('quiz_player_state', { p_code: session.code, p_token: token });
  assert.equal(st.me.name, '홍길동');
  assert.equal(st.session.status, 'lobby');
  assert.equal(st.session.participants, 2);
  assert.equal(st.question, undefined);
  const stranger = await rpc('quiz_player_state', { p_code: session.code, p_token: 'f'.repeat(64) });
  assert.equal(stranger.me, null);
});

test('문제가 열려도 정답은 내려가지 않는다 (객관식, 목록형, 여러 개 고르기)', async () => {
  await hostApply(A, { status: 'open', current_index: 0 });
  const st = await rpc('quiz_player_state', { p_code: session.code, p_token: token });
  assert.deepEqual(st.question.options, [{ id: 'a', label: SECRET }, { id: 'b', label: '오답보기' }]);
  assert.ok(!JSON.stringify(st).includes('correct'), '객관식 정답 표시가 새면 안 된다');

  await hostApply(A, { current_index: 1 });
  const st2 = await rpc('quiz_player_state', { p_code: session.code, p_token: token });
  assert.equal(st2.question.slots, 3);
  const raw = JSON.stringify(st2);
  assert.ok(!raw.includes(SECRET) && !raw.includes('별칭_ZQX') && !raw.includes('answers'), raw);

  await hostApply(A, { current_index: 2 });
  const st3 = await rpc('quiz_player_state', { p_code: session.code, p_token: token });
  assert.equal(st3.question.pick, 2);
  assert.deepEqual(st3.question.options, [{ id: 'm1', label: '가' }, { id: 'm2', label: '나' }, { id: 'm3', label: '다' }]);
  assert.ok(!JSON.stringify(st3).includes('correct'), '여러 개 고르기 정답 표시가 새면 안 된다');
  await hostApply(A, { current_index: 0 });
});

test('제출 — 다른 문제 id 거절, 한 번만, 토큰 없으면 거절', async () => {
  const args = { p_code: session.code, p_token: token, p_question_id: 'q1', p_answer: { optionId: 'a' } };
  assert.equal(await rpcError('quiz_submit', { ...args, p_question_id: 'q2' }), 'quiz_wrong_question');
  assert.equal(await rpcError('quiz_submit', { ...args, p_token: 'nope' }), 'quiz_not_joined');
  assert.equal(await rpcError('quiz_submit', { ...args, p_answer: ['a'] }), 'quiz_bad_answer');
  assert.deepEqual(await rpc('quiz_submit', args), { ok: true });
  assert.equal(await rpcError('quiz_submit', args), 'quiz_already_answered');
  const st = await rpc('quiz_player_state', { p_code: session.code, p_token: token });
  assert.deepEqual(st.myAnswer, { optionId: 'a' });
});

test('강사는 자기 세션의 참가자와 응답을 본다', async () => {
  const p = await A.client.from('quiz_participants').select('id,name').eq('session_id', session.id).order('joined_at');
  assert.deepEqual(p.data.map(r => r.name), ['홍길동', 'Kim']);
  const r = await A.client.from('quiz_responses').select('question_id,answer').eq('session_id', session.id);
  assert.deepEqual(r.data, [{ question_id: 'q1', answer: { optionId: 'a' } }]);
});

test('공개 뒤에는 정답, 내 결과, 점수와 순위가 내려간다', async () => {
  const { data: ps } = await A.client.from('quiz_participants').select('id,name').eq('session_id', session.id);
  const hong = ps.find(p => p.name === '홍길동');
  const kim = ps.find(p => p.name === 'Kim');
  await hostApply(A,
    { status: 'revealed', revealed: ['q1'], reveal: { questionId: 'q1', correctOptionIds: ['a'] } },
    [
      { id: hong.id, score: 1, rank: 1, results: { q1: { correct: true, points: 1 } } },
      { id: kim.id, score: 0, rank: 2, results: { q1: { correct: false, points: 0 } } },
    ]);
  const st = await rpc('quiz_player_state', { p_code: session.code, p_token: token });
  assert.deepEqual(st.reveal, { questionId: 'q1', correctOptionIds: ['a'] });
  assert.deepEqual(st.myResult, { correct: true, points: 1 });
  assert.deepEqual(st.me, { name: '홍길동', score: 1, rank: 1 });
  assert.equal(await rpcError('quiz_submit', {
    p_code: session.code, p_token: token, p_question_id: 'q1', p_answer: { optionId: 'b' },
  }), 'quiz_not_open');
});

test('다른 강사는 남의 퀴즈, 세션, 참가자, 응답을 읽지도 바꾸지도 못한다', async () => {
  for (const [t, col, val] of [
    ['quiz_quizzes', 'id', quiz.id], ['quiz_sessions', 'id', session.id],
    ['quiz_participants', 'session_id', session.id], ['quiz_responses', 'session_id', session.id],
  ]) {
    const { data } = await B.client.from(t).select('*').eq(col, val);
    assert.deepEqual(data, [], t);
  }
  const upd = await B.client.from('quiz_quizzes').update({ title: '탈취' }).eq('id', quiz.id).select();
  assert.deepEqual(upd.data, []);
  const { error } = await B.client.rpc('quiz_host_apply', { p_session: session.id, p_patch: { status: 'ended' } });
  assert.equal(error?.message, 'quiz_not_owner');
  const mine = await A.client.from('quiz_quizzes').select('title').eq('id', quiz.id).single();
  assert.equal(mine.data.title, 'DB 시험');
});

test('끝난 세션은 입장 불가, 상위 3명이 내려간다', async () => {
  await hostApply(A, { status: 'ended' });
  assert.equal(await rpcError('quiz_join', { p_code: session.code, p_name: '늦은사람' }), 'quiz_ended');
  const st = await rpc('quiz_player_state', { p_code: session.code, p_token: token });
  assert.deepEqual(st.podium.map(p => [p.rank, p.name]), [[1, '홍길동'], [2, 'Kim']]);
});

test('실시간 알림 — 로그인 없는 수강생이 강사의 알림을 받는다', async () => {
  const topic = `quiz-${session.code}`;
  const listener = anonClient();
  const got = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('5초 안에 알림이 오지 않았다')), 5000);
    listener.channel(topic).on('broadcast', { event: 'state' }, msg => { clearTimeout(timer); resolve(msg.payload); })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') await A.client.channel(topic).httpSend('state', { v: 1 });
      });
  });
  assert.deepEqual(await got, { v: 1 });
  await listener.removeAllChannels();
});
