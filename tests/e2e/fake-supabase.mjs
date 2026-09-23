// E2E 테스트용 가짜 Supabase. page.route로 인증·REST 요청을 가로채 메모리 DB로 응답한다.
// 실제 서버로는 요청이 한 건도 나가지 않는다(처리하지 않는 요청은 abort).
import { readFileSync } from 'node:fs';

function supabaseUrl() {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  return env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
}

export const SUPA = supabaseUrl();
export const STORAGE_KEY = `sb-${new URL(SUPA).hostname.split('.')[0]}-auth-token`;

export const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tester@example.com',
  is_anonymous: false,
  user_metadata: { full_name: '테스트 사용자' },
  app_metadata: { provider: 'google' },
  created_at: '2026-09-24T00:00:00Z',
};

// 익명 로그인(signInAnonymously)이 만들어 주는 사용자 모양 — 이메일·이름이 없다
export const GUEST = {
  id: '00000000-0000-4000-8000-0000000000a1',
  aud: 'authenticated',
  role: 'authenticated',
  email: '',
  phone: '',
  is_anonymous: true,
  user_metadata: {},
  app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
  created_at: '2026-09-24T00:00:00Z',
};

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');

export function fakeSession(user = USER) {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp, role: 'authenticated' })}.sig`,
    token_type: 'bearer',
    expires_in: 24 * 3600,
    expires_at: exp,
    refresh_token: `fake-refresh-${user.id}`,
    user,
  };
}

// 구글로 로그인해 둔 상태를 흉내 낸다 — 페이지가 뜨기 전에 세션을 localStorage에 넣는다
export async function seedSession(page, user = USER) {
  await page.addInitScript(
    ([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); },
    [STORAGE_KEY, JSON.stringify(fakeSession(user))],
  );
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

// 테이블별 행을 메모리에 들고 PostgREST·GoTrue 흉내를 낸다. 테스트는 db를 직접 들여다본다.
// anonymousEnabled=false 면 Supabase에서 익명 로그인이 꺼져 있을 때의 응답을 돌려준다.
export async function mockSupabase(page, { anonymousEnabled = true } = {}) {
  const db = {
    current_round: [], rounds: [], current_meeting: [], meetings: [], game_records: [],
    signups: 0, logouts: 0,
  };
  const users = { [USER.id]: USER, [GUEST.id]: GUEST };
  let seq = 0;
  const reply = (route, status, body) =>
    route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: body === undefined ? '' : JSON.stringify(body),
    });
  const userOf = req => {
    const token = (req.headers().authorization || '').replace(/^Bearer /, '');
    try {
      return users[JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub] || null;
    } catch {
      return null;
    }
  };

  await page.route(`${SUPA}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    if (url.pathname === '/auth/v1/user') {
      const user = userOf(req);
      return user ? reply(route, 200, user) : reply(route, 401, { code: 'bad_jwt', msg: 'invalid JWT' });
    }
    if (url.pathname === '/auth/v1/signup' && method === 'POST') {
      if (!anonymousEnabled) {
        return reply(route, 422, { code: 'anonymous_provider_disabled', msg: 'Anonymous sign-ins are disabled' });
      }
      db.signups++;
      return reply(route, 200, fakeSession(GUEST));
    }
    if (url.pathname === '/auth/v1/logout') {
      db.logouts++;
      return reply(route, 204);
    }

    const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
    if (!table || !Array.isArray(db[table])) return route.abort();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');

    if (method === 'GET') {
      const rows = [...db[table]].sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)));
      return reply(route, 200, rows);
    }
    if (method === 'POST' && table.startsWith('current_')) {
      db[table] = [Array.isArray(body) ? body[0] : body];
      return reply(route, 201);
    }
    if (method === 'POST') {
      const row = { ...(Array.isArray(body) ? body[0] : body), id: `row-${++seq}` };
      db[table].push(row);
      return reply(route, 201, [row]);
    }
    if (method === 'PATCH') {
      db[table] = db[table].map(r => (r.id === idFilter ? { ...r, ...body } : r));
      return reply(route, 200, db[table].filter(r => r.id === idFilter));
    }
    if (method === 'DELETE') {
      db[table] = db[table].filter(r => r.id !== idFilter);
      return reply(route, 204);
    }
    return route.abort();
  });
  return db;
}
