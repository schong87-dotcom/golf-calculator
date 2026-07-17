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

export async function logout() {
  await supabase.auth.signOut()
}

// 로그인/로그아웃/OAuth 리다이렉트 복귀를 모두 이 구독으로 감지한다.
// callback은 로그인 시 { username }, 로그아웃 시 null을 받는다.
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) return callback(null)
    const meta = session.user.user_metadata || {}
    const username = meta.full_name || meta.name || session.user.email?.split('@')[0]
    callback({ username })
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
