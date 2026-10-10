// 퀴즈게임 문제 모델: 새 문제 만들기, 저장 전 검사, 입장코드 (순수 함수, 난수와 id 는 주입 가능)

export const TYPE_LABELS = {
  choice: '객관식',
  yesno: '예/아니오',
  text: '주관식',
  list: '목록형',
  multi: '여러 개 고르기',
};

export const MAX_SLOTS = 30;

export function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function newQuestion(type, makeId = randomId) {
  const base = { id: makeId(), type, prompt: '', points: 1 };
  if (type === 'choice' || type === 'multi') {
    const options = [1, 2, 3, 4].map(() => ({ id: makeId(), label: '', correct: false }));
    return type === 'multi' ? { ...base, options, pick: 2 } : { ...base, options };
  }
  if (type === 'yesno') return { ...base, answer: null };
  if (type === 'list') return { ...base, slots: 10, answers: [] };
  return { ...base, answers: [] };
}

// 유형을 바꿔도 문제 문장과 배점은 남긴다
export function changeType(question, type, makeId = randomId) {
  return { ...newQuestion(type, makeId), id: question.id, prompt: question.prompt, points: question.points };
}

export function validateQuiz(quiz) {
  const errors = [];
  if (!quiz.questions?.length) errors.push('문제를 하나 이상 넣어 주세요.');
  (quiz.questions || []).forEach((q, i) => {
    const n = `${i + 1}번`;
    if (!q.prompt?.trim()) errors.push(`${n} 문제 문장이 비어 있습니다.`);
    if (!(Number(q.points) >= 0)) errors.push(`${n} 배점이 숫자가 아닙니다.`);
    if (q.type === 'choice' || q.type === 'multi') {
      const filled = (q.options || []).filter(o => o.label.trim());
      if (filled.length < 2) errors.push(`${n} 보기를 2개 이상 채워 주세요.`);
      if ((q.options || []).some(o => o.correct && !o.label.trim())) errors.push(`${n} 정답 보기가 비어 있습니다.`);
      if (q.type === 'multi' && !(Number(q.pick) >= 1 && Number(q.pick) <= filled.length)) {
        errors.push(`${n} 고를 개수는 1부터 채운 보기 수(${filled.length})까지입니다.`);
      }
    }
    if (q.type === 'list' && !(q.slots >= 1 && q.slots <= MAX_SLOTS)) {
      errors.push(`${n} 칸 수는 1부터 ${MAX_SLOTS}까지입니다.`);
    }
  });
  return errors;
}

// 저장할 때 빈 보기와 빈 정답을 걷어 낸다
export function cleanQuiz(quiz) {
  return {
    ...quiz,
    title: quiz.title.trim(),
    questions: quiz.questions.map(q => {
      const c = { ...q, prompt: q.prompt.trim(), points: Number(q.points) || 0 };
      if (q.type === 'choice' || q.type === 'multi') {
        c.options = q.options.filter(o => o.label.trim()).map(o => ({ ...o, label: o.label.trim() }));
      }
      if (q.type === 'multi') c.pick = Number(q.pick);
      if (q.type === 'text' || q.type === 'list') {
        c.answers = q.answers
          .map(a => ({ value: a.value.trim(), aliases: splitAliases(a) }))
          .filter(a => a.value);
      }
      if (q.type === 'list') c.slots = Number(q.slots);
      return c;
    }),
  };
}

// 편집기에서는 다른 표기를 쉼표로 이어 쓴 글(aliasText)로 다룬다
function splitAliases(a) {
  const list = a.aliasText != null ? a.aliasText.split(',') : (a.aliases || []);
  return list.map(s => s.trim()).filter(Boolean);
}

export function toEditable(quiz) {
  return {
    ...quiz,
    questions: (quiz.questions || []).map(q => (q.answers
      ? { ...q, answers: q.answers.map(a => ({ value: a.value, aliasText: (a.aliases || []).join(', ') })) }
      : q)),
  };
}

// 여러 개 고르기: 누른 순서대로 쌓고(번호 = 자리 + 1), 다시 누르면 빼서 뒤 번호가 당겨진다. max 개를 넘으면 그대로
export function toggleSelection(selected, id, max) {
  if (selected.includes(id)) return selected.filter(x => x !== id);
  return selected.length >= max ? selected : [...selected, id];
}

export function makeCode(random = Math.random) {
  return String(Math.floor(random() * 1e6)).padStart(6, '0');
}
