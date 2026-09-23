// 모임 정산의 작업본(current_meeting)과 저장 목록(meetings)을 Supabase에 읽고 쓴다. 골프의 storage.js와 같은 구조다.
import { supabase } from './supabase'

// ─── Current Meeting (임시 작업본) ─────────────────────────────────────────

// 글자를 칠 때마다 저장이 불리는데, 요청을 동시에 보내면 먼저 출발한 옛 요청이 나중에 도착해
// 옛 내용이 최종 작업본으로 남을 수 있다(E2E에서 실제로 재현됨). 그래서 한 번에 하나씩만 보내고,
// 앞 요청을 기다리는 동안 들어온 것은 가장 마지막 것만 보낸다.
let latest = null
let inFlight = null

export function saveMeeting(meeting) {
  latest = meeting
  if (!inFlight) inFlight = flushLatest()
  return inFlight
}

async function flushLatest() {
  try {
    while (latest) {
      const meeting = latest
      latest = null
      await writeCurrentMeeting(meeting)
    }
  } finally {
    inFlight = null
  }
}

async function writeCurrentMeeting(meeting) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('current_meeting')
    .upsert({ user_id: user.id, data: meeting, updated_at: new Date().toISOString() })
}

export async function loadMeeting() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('current_meeting')
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle()

  return data?.data || null
}

// ─── Meeting History ────────────────────────────────────────────────────────

export async function saveMeetingToHistory(meeting) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const payload = {
    user_id: user.id,
    meeting_date: meeting.date || null,
    title: meeting.title || null,
    participants: meeting.participants || [],
    items: meeting.items || [],
    saved_at: new Date().toISOString(),
  }

  if (meeting.dbId) {
    const { data } = await supabase
      .from('meetings')
      .update(payload)
      .eq('id', meeting.dbId)
      .eq('user_id', user.id)
      .select()
    if (data?.length) return data[0].id
  }

  const { data } = await supabase.from('meetings').insert(payload).select()
  return data?.[0]?.id
}

export async function getSavedMeetings() {
  const { data } = await supabase
    .from('meetings')
    .select('*')
    .order('saved_at', { ascending: false })
    .limit(20)

  return (data || []).map(r => ({
    dbId: r.id,
    date: r.meeting_date || '',
    title: r.title || '',
    participants: r.participants || [],
    items: r.items || [],
    savedAt: r.saved_at,
  }))
}

export async function deleteMeetingFromHistory(dbId) {
  await supabase.from('meetings').delete().eq('id', dbId)
}
