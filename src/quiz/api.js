// 퀴즈게임 Supabase 호출 모음: 강사는 테이블과 quiz_host_apply, 수강생은 quiz_join, quiz_player_state, quiz_submit
import { supabase } from '../utils/supabase';
import { makeCode } from './model';

const MESSAGES = {
  quiz_not_found: '입장코드를 찾을 수 없습니다.',
  quiz_ended: '이미 끝난 퀴즈입니다.',
  quiz_bad_name: '이름을 1자에서 20자 사이로 써 주세요.',
  quiz_full: '참가 인원이 가득 찼습니다.',
  quiz_name_taken: '이미 있는 이름입니다. 구분되게 바꿔 주세요 (예 김철수B).',
  quiz_not_joined: '참가 정보가 없습니다. 이름을 다시 입력해 주세요.',
  quiz_not_open: '지금은 답을 낼 수 없습니다.',
  quiz_wrong_question: '문제가 바뀌었습니다.',
  quiz_already_answered: '이미 제출했습니다.',
  quiz_bad_answer: '답 형식이 올바르지 않습니다.',
  quiz_not_owner: '이 진행을 바꿀 권한이 없습니다.',
};

export class QuizError extends Error {
  constructor(code) {
    super(MESSAGES[code] || code);
    this.code = code;
  }
}

function check({ data, error }) {
  if (error) throw new QuizError(error.message);
  return data;
}

// ─── 수강생 ────────────────────────────────────────────────────────────────

export async function joinQuiz(code, name) {
  return check(await supabase.rpc('quiz_join', { p_code: code, p_name: name }));
}

export async function playerState(code, token) {
  return check(await supabase.rpc('quiz_player_state', { p_code: code, p_token: token || null }));
}

export async function submitAnswer(code, token, questionId, answer) {
  return check(await supabase.rpc('quiz_submit', {
    p_code: code, p_token: token, p_question_id: questionId, p_answer: answer,
  }));
}

// ─── 강사 ──────────────────────────────────────────────────────────────────

export async function listQuizzes() {
  return check(await supabase.from('quiz_quizzes').select('id,title,questions,updated_at').order('updated_at', { ascending: false }));
}

export async function listOpenSessions() {
  return check(await supabase.from('quiz_sessions').select('id,code,title,status,created_at')
    .neq('status', 'ended').order('created_at', { ascending: false }).limit(5));
}

export async function loadQuiz(id) {
  return check(await supabase.from('quiz_quizzes').select('id,title,questions').eq('id', id).single());
}

export async function saveQuiz({ id, title, questions }) {
  const row = { title, questions, updated_at: new Date().toISOString() };
  const q = id
    ? supabase.from('quiz_quizzes').update(row).eq('id', id)
    : supabase.from('quiz_quizzes').insert(row);
  return check(await q.select('id,title,questions').single());
}

export async function deleteQuiz(id) {
  check(await supabase.from('quiz_quizzes').delete().eq('id', id));
}

// 입장코드가 겹치면(23505) 새 코드로 다시 시도한다
export async function startSession(quiz, random = Math.random) {
  for (let i = 0; i < 5; i += 1) {
    const { data, error } = await supabase.from('quiz_sessions')
      .insert({ quiz_id: quiz.id, code: makeCode(random), title: quiz.title, questions: quiz.questions })
      .select('id').single();
    if (!error) return data;
    if (error.code !== '23505') throw new QuizError(error.message);
  }
  throw new QuizError('입장코드를 만들지 못했습니다. 다시 시도해 주세요.');
}

export async function loadSession(id) {
  return check(await supabase.from('quiz_sessions')
    .select('id,code,title,questions,status,current_index,revealed,accepts,reveal').eq('id', id).single());
}

export async function loadParticipants(sessionId) {
  return check(await supabase.from('quiz_participants')
    .select('id,name,score,rank,results,joined_at').eq('session_id', sessionId).order('joined_at'));
}

export async function loadResponses(sessionId, questionId) {
  return check(await supabase.from('quiz_responses')
    .select('participant_id,question_id,answer,submitted_at')
    .eq('session_id', sessionId).eq('question_id', questionId).order('submitted_at'));
}

export async function hostApply(sessionId, patch, scores = null) {
  check(await supabase.rpc('quiz_host_apply', { p_session: sessionId, p_patch: patch, p_scores: scores }));
}
