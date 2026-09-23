import { supabase } from './supabase'

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function loginWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) return { success: false, message: error.message }
  return { success: true }
}

// 비회원 입장 = Supabase 익명 로그인. 이메일 없는 임시 계정이 생기고 세션이 이 브라우저에 남는다.
// RLS가 auth.uid() 기준이라 비회원도 자기 기록만 저장·조회한다. 로그아웃하면 그 계정으로 다시 들어올 방법이 없다.
export async function loginAsGuest() {
  const { error } = await supabase.auth.signInAnonymously()
  if (error) return { success: false, message: error.message }
  return { success: true }
}

export async function logout() {
  await supabase.auth.signOut()
}

// 로그인/로그아웃/OAuth 리다이렉트 복귀를 모두 이 구독으로 감지한다.
// callback은 로그인 시 { username, isGuest }, 로그아웃 시 null을 받는다.
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) return callback(null)
    // 익명 계정은 이름·이메일이 없어 username이 비면 로그인 화면에서 넘어가지 못한다
    const isGuest = !!session.user.is_anonymous
    const meta = session.user.user_metadata || {}
    const username = isGuest ? '비회원' : (meta.full_name || meta.name || session.user.email?.split('@')[0])
    callback({ username, isGuest })
  })
  return () => subscription.unsubscribe()
}

// ─── Current Round (임시 작업본) ────────────────────────────────────────────

export async function saveRound(round) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('current_round')
    .upsert({ user_id: user.id, data: round, updated_at: new Date().toISOString() })
}

export async function loadRound() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('current_round')
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle()

  return data?.data || null
}

// ─── Round History ──────────────────────────────────────────────────────────

export async function saveRoundToHistory(round) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const payload = {
    user_id: user.id,
    round_date: round.date || null,
    course: round.course || null,
    participants: round.participants || [],
    items: round.items || [],
    saved_at: new Date().toISOString(),
  }

  if (round.dbId) {
    const { data } = await supabase
      .from('rounds')
      .update(payload)
      .eq('id', round.dbId)
      .eq('user_id', user.id)
      .select()
    if (data?.length) return data[0].id
  }

  const { data } = await supabase.from('rounds').insert(payload).select()
  return data?.[0]?.id
}

export async function getSavedRounds() {
  const { data } = await supabase
    .from('rounds')
    .select('*')
    .order('saved_at', { ascending: false })
    .limit(20)

  return (data || []).map(r => ({
    dbId: r.id,
    date: r.round_date || '',
    course: r.course || '',
    participants: r.participants || [],
    items: r.items || [],
    savedAt: r.saved_at,
  }))
}

export async function deleteRoundFromHistory(dbId) {
  await supabase.from('rounds').delete().eq('id', dbId)
}
