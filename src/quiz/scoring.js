// 퀴즈게임 채점: 표기 정리, 문제별 채점, 공개 화면 명단, 누적 순위 (순수 함수, 강사 화면이 계산해 DB에 올린다)

// 띄어쓰기, 대소문자, 문장부호, 기호를 무시하고 한글은 NFC로 맞춘다
export function normalizeAnswer(text) {
  return String(text ?? '').normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

// 주관식과 목록형의 정답 항목. 원클릭 인정은 item 이 null 이면 새 정답, 숫자면 그 정답의 다른 표기
function answerItems(question, accepts = []) {
  const items = (question.answers || []).map(a => ({
    label: a.value,
    keys: new Set([a.value, ...(a.aliases || [])].map(normalizeAnswer).filter(Boolean)),
  }));
  for (const acc of accepts) {
    const key = normalizeAnswer(acc.value);
    if (!key) continue;
    if (acc.item == null || !items[acc.item]) items.push({ label: acc.value, keys: new Set([key]) });
    else items[acc.item].keys.add(key);
  }
  return items.filter(it => it.keys.size > 0);
}

function findItem(items, key) {
  return items.findIndex(it => it.keys.has(key));
}

export function isScored(question, accepts = []) {
  switch (question.type) {
    case 'choice':
    case 'multi': return (question.options || []).some(o => o.correct);
    case 'yesno': return question.answer === 'yes' || question.answer === 'no';
    case 'text':
    case 'list': return answerItems(question, accepts).length > 0;
    default: return false;
  }
}

// 한 사람의 답을 채점한다. correct 는 채점하지 않는 문제(정답 미지정)면 null
export function gradeAnswer(question, answer, accepts = []) {
  const scored = isScored(question, accepts);
  const points = Number(question.points) || 0;
  const base = { answered: !!answer, correct: scored ? false : null, points: 0, matched: [], unmatched: [] };
  if (!answer) return base;

  if (question.type === 'list') {
    const items = answerItems(question, accepts);
    const inputs = (answer.items || []).slice(0, question.slots || undefined);
    const hit = new Set();
    const missed = new Map();
    for (const raw of inputs) {
      const key = normalizeAnswer(raw);
      if (!key) continue;
      const i = findItem(items, key);
      if (i >= 0) hit.add(i);
      else if (!missed.has(key)) missed.set(key, String(raw).trim());
    }
    const idx = [...hit].sort((a, b) => a - b);
    return {
      ...base,
      correct: scored ? idx.length > 0 : null,
      points: scored ? idx.length * points : 0,
      matched: idx.map(i => items[i].label),
      unmatched: [...missed.values()],
    };
  }

  if (question.type === 'multi') {
    const options = question.options || [];
    const valid = new Set(options.map(o => o.id));
    const chosen = new Set([...new Set(answer.optionIds || [])].filter(id => valid.has(id)).slice(0, question.pick || undefined));
    const hits = options.filter(o => o.correct && chosen.has(o.id));
    return {
      ...base,
      correct: scored ? hits.length > 0 : null,
      points: scored ? hits.length * points : 0,
      matched: hits.map(o => o.label),
    };
  }

  let correct = false;
  let matched = [];
  let unmatched = [];
  if (question.type === 'choice') {
    correct = !!(question.options || []).find(o => o.id === answer.optionId)?.correct;
  } else if (question.type === 'yesno') {
    correct = answer.value === question.answer;
  } else if (question.type === 'text') {
    const key = normalizeAnswer(answer.text);
    const items = answerItems(question, accepts);
    const i = key ? findItem(items, key) : -1;
    correct = i >= 0;
    if (correct) matched = [items[i].label];
    else if (key) unmatched = [String(answer.text).trim()];
  }
  if (!scored) return { ...base, unmatched };
  return { ...base, correct, points: correct ? points : 0, matched, unmatched };
}

// 한 문제를 전원 채점하고 공개 화면에 필요한 명단과 집계를 만든다
export function gradeQuestion(question, participants, responses, accepts = []) {
  const byPid = new Map(responses.filter(r => r.question_id === question.id).map(r => [r.participant_id, r]));
  const results = {};
  const correctNames = [];
  const wrongNames = [];
  const noAnswerNames = [];
  const listRows = [];
  const unmatched = new Map();
  const counts = initialCounts(question, accepts);

  for (const p of participants) {
    const r = byPid.get(p.id);
    const g = gradeAnswer(question, r?.answer, accepts);
    const counted = question.type === 'list' || question.type === 'multi';
    results[p.id] = counted
      ? { correct: g.correct, points: g.points, matched: g.matched }
      : { correct: g.correct, points: g.points };

    if (!r) noAnswerNames.push(p.name);
    else if (g.correct) correctNames.push(p.name);
    else if (g.correct === false) wrongNames.push(p.name);

    if (r) {
      if (question.type === 'choice' && r.answer.optionId in counts) counts[r.answer.optionId] += 1;
      if (question.type === 'yesno' && r.answer.value in counts) counts[r.answer.value] += 1;
      if (question.type === 'multi') {
        for (const id of new Set(r.answer.optionIds || [])) if (id in counts) counts[id] += 1;
      }
      if (question.type === 'text' || question.type === 'list') {
        for (const label of g.matched) if (label in counts) counts[label] += 1;
        for (const raw of g.unmatched) {
          const key = normalizeAnswer(raw);
          const u = unmatched.get(key) || { key, value: raw, count: 0 };
          u.count += 1;
          unmatched.set(key, u);
        }
      }
      if (counted) {
        listRows.push({ id: p.id, name: p.name, count: g.matched.length, submittedAt: r.submitted_at });
      }
    }
  }

  listRows.sort((a, b) => b.count - a.count || String(a.submittedAt).localeCompare(String(b.submittedAt)));
  return {
    results,
    counts,
    correctNames,
    wrongNames,
    noAnswerNames,
    unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ko')),
    listRanking: listRows.map((row, i) => ({ ...row, rank: i + 1 })),
  };
}

function initialCounts(question, accepts) {
  if (question.type === 'choice' || question.type === 'multi') {
    return Object.fromEntries((question.options || []).map(o => [o.id, 0]));
  }
  if (question.type === 'yesno') return { yes: 0, no: 0 };
  return Object.fromEntries(answerItems(question, accepts).map(it => [it.label, 0]));
}

// 공개한 문제들의 점수를 더해 순위를 낸다. 동점은 같은 순위(1, 1, 3)
export function rankParticipants(participants, resultsByPid) {
  const rows = participants.map(p => ({
    id: p.id,
    name: p.name,
    score: Object.values(resultsByPid[p.id] || {}).reduce((s, r) => s + (Number(r?.points) || 0), 0),
  }));
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
  return rows.map(r => ({ ...r, rank: 1 + rows.filter(o => o.score > r.score).length }));
}

// 수강생 폰에 내려갈 공개 내용. 정답만 담고 명단은 넣지 않는다
export function buildReveal(question, accepts = []) {
  const base = { questionId: question.id, type: question.type, scored: isScored(question, accepts) };
  if (question.type === 'choice' || question.type === 'multi') return { ...base, correctOptionIds: (question.options || []).filter(o => o.correct).map(o => o.id) };
  if (question.type === 'yesno') return { ...base, answer: question.answer ?? null };
  return { ...base, answers: answerItems(question, accepts).map(it => it.label) };
}

// 한 문제의 채점 결과를 참가자별 누적 결과에 합치고 순위를 다시 매긴다 (quiz_host_apply 의 p_scores 모양)
export function applyGrade(participants, question, grade) {
  const results = Object.fromEntries(participants.map(p => [p.id, { ...(p.results || {}), [question.id]: grade.results[p.id] }]));
  return rankParticipants(participants, results).map(r => ({ id: r.id, score: r.score, rank: r.rank, results: results[r.id] }));
}
