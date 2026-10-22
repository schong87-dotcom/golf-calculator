// 노션 비서 서버 함수(/api/assistant) 호출. 앱 모음 Supabase 로그인 토큰을 함께 보낸다.
import { supabase } from '../utils/supabase';

export class ApiError extends Error {
  constructor(reason, message, status) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

export async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

async function call(method, payload) {
  const session = await currentSession();
  if (!session) throw new ApiError('no-session', '앱 모음에서 로그인이 필요합니다.', 401);
  const url = method === 'GET' ? `/api/assistant?action=${encodeURIComponent(payload.action)}` : '/api/assistant';
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(payload),
    });
  } catch {
    throw new ApiError('offline', '인터넷 연결을 확인해 주세요.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new ApiError(data.reason || 'server', data.error || `서버 응답 ${response.status}`, response.status);
  return data;
}

export const api = {
  bootstrap: () => call('GET', { action: 'bootstrap' }),
  createItem: (item) => call('POST', { action: 'createItem', item }).then((d) => d.item),
  updateItem: (item) => call('POST', { action: 'updateItem', item }).then((d) => d.item),
  trashItem: (id) => call('POST', { action: 'trashItem', id }),
  batch: (ops) => call('POST', { action: 'batch', ops }).then((d) => d.results),
  toggleHabit: (payload) => call('POST', { action: 'toggleHabit', ...payload }),
  saveHabit: (habit) => call('POST', { action: 'saveHabit', habit }).then((d) => d.habit),
  saveDay: (payload) => call('POST', { action: 'saveDay', ...payload }).then((d) => d.day),
};
