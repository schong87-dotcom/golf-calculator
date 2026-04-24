import { supabase } from './supabase'

// Supabase Auth는 이메일 필수 → 이름을 이메일로 변환 (내부 처리용)
// 한글 등 비ASCII 문자를 16진수 코드로 변환하여 유효한 이메일 주소 생성
const toEmail = username => {
  const safe = Array.from(username.trim().toLowerCase())
    .map(c => /[a-z0-9]/.test(c) ? c : c.charCodeAt(0).toString(16))
    .join('')
  return `u${safe}@golf-app.local`
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function login(username, password) {
  const email = toEmail(username)

  // 로그인 시도
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

  if (!signInError) return { success: true }

  // 틀린 비밀번호
  if (signInError.message.toLowerCase().includes('invalid')) {
    // 신규 사용자인지 확인: 가입 시도
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
    if (signUpError) {
      const msg = signUpError.message.toLowerCase()
      if (msg.includes('password') || msg.includes('characters')) {
        return { success: false, message: '비밀번호는 최소 6자 이상이어야 합니다.' }
      }
      return { success: false, message: '비밀번호가 올바르지 않습니다.' }
    }
    // 가입 성공 후 로그인
    const { error: reSignInError } = await supabase.auth.signInWithPassword({ email, password })
    if (reSignInError) return { success: false, message: reSignInError.message }
    return { success: true }
  }

  return { success: false, message: signInError.message }
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return null
  const username = data.session.user.user_metadata?.username || data.session.user.email?.split('@')[0]
  return { username }
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
