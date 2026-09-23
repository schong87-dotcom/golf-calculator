// 모임 정산의 데이터 모양과 인원 추가·삭제·이름 수정 규칙 (화면과 무관한 순수 함수)
// 항목의 결제자·제외자 체크는 골프 정산과 같이 참가자 이름 문자열로 저장한다.
// 그래서 이름을 고치거나 사람을 지우면 체크도 함께 옮기거나 지워야 계산이 조용히 틀어지지 않는다.

export const MIN_PARTICIPANTS = 2;

export function makeDefaultMeeting(now = Date.now()) {
  return {
    id: now,
    dbId: null,
    date: '',
    title: '',
    participants: ['', '', '', ''],
    items: [{ id: 1, name: '', amount: '', payers: [], excluded: [] }],
  };
}

export function addParticipant(meeting) {
  return { ...meeting, participants: [...meeting.participants, ''] };
}

export function removeParticipant(meeting, index) {
  if (meeting.participants.length <= MIN_PARTICIPANTS) return meeting;
  const removed = meeting.participants[index];
  const participants = meeting.participants.filter((_, i) => i !== index);
  // 같은 이름이 아직 남아 있으면 그 사람의 체크이므로 건드리지 않는다
  const items = removed.trim() && !participants.includes(removed)
    ? replaceName(meeting.items, removed, null)
    : meeting.items;
  return { ...meeting, participants, items };
}

export function renameParticipant(meeting, index, value) {
  const old = meeting.participants[index];
  const participants = meeting.participants.map((p, i) => (i === index ? value : p));
  const isOnlyOwner = old.trim() && meeting.participants.filter(p => p === old).length === 1;
  const items = isOnlyOwner && old !== value
    ? replaceName(meeting.items, old, value.trim() ? value : null)
    : meeting.items;
  return { ...meeting, participants, items };
}

// 앞뒤 공백을 뺀 이름이 두 번 이상 나오면 겹친 것으로 본다. 빈칸은 세지 않는다.
export function findDuplicateNames(participants) {
  const seen = new Set();
  const dup = new Set();
  for (const p of participants) {
    const name = p.trim();
    if (!name) continue;
    if (seen.has(name)) dup.add(name);
    seen.add(name);
  }
  return [...dup];
}

// to가 null이면 이름을 체크에서 뺀다
function replaceName(items, from, to) {
  const swap = list => [...new Set(list.map(p => (p === from ? to : p)).filter(p => p !== null))];
  return items.map(item => ({ ...item, payers: swap(item.payers), excluded: swap(item.excluded) }));
}
