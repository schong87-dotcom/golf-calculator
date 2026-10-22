// 노션 비서 E2E 용 가짜 구글(GIS 토큰, 캘린더, 할 일)과 가짜 /api/assistant(실제 서버 코드 + 가짜 노션)
import { createHandler } from '../../api/assistant.js';
import { fakeBackend, ENV } from '../fake-notion.mjs';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (route, status, body) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });

// GIS 대신: requestAccessToken 을 부르면 곧바로 가짜 토큰을 준다
const GIS = `
window.__gisRequests = [];
window.google = { accounts: { oauth2: {
  initTokenClient(cfg) { return { requestAccessToken() { window.__gisRequests.push(cfg.prompt); setTimeout(() => cfg.callback({ access_token: 'fake-google-token', expires_in: 3600 }), 20); } }; },
  revoke(token, done) { done && done(); },
} } };`;

export async function mockGoogle(page, { events = [], tasks = [] } = {}) {
  const store = { events: events.map((e) => ({ updated: '2026-10-22T00:00:00.000Z', status: 'confirmed', ...e })), tasks: tasks.map((t) => ({ updated: '2026-10-22T00:00:00.000Z', ...t })), calls: [] };
  let seq = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 23, 1, 0, ++seq)).toISOString();

  await page.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: GIS }));
  await page.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    store.calls.push(`${req.method()} ${url.pathname}`);
    if (url.pathname === '/oauth2/v3/userinfo') return json(route, 200, { email: 'owner@example.com' });
    if (url.pathname === '/calendar/v3/users/me/calendarList') {
      return json(route, 200, { items: [{ id: 'owner@example.com', primary: true, summary: '내 캘린더', accessRole: 'owner' }, { id: 'family', summary: '가족일정', accessRole: 'writer' }] });
    }
    const m = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);
    if (!m) return json(route, 404, { error: { message: 'unknown' } });
    const [, cal, id] = m;
    if (req.method() === 'GET') return json(route, 200, { items: store.events.filter((e) => (e.calendar || 'primary') === decodeURIComponent(cal)) });
    if (req.method() === 'POST') {
      const ev = { ...body, id: `ev${++seq}`, calendar: decodeURIComponent(cal), status: 'confirmed', updated: stamp(), htmlLink: `https://calendar.google.com/event?eid=${seq}` };
      store.events.push(ev);
      return json(route, 200, ev);
    }
    const ev = store.events.find((e) => e.id === decodeURIComponent(id));
    if (!ev) return json(route, 404, { error: { message: 'Not Found' } });
    if (req.method() === 'PATCH') {
      Object.assign(ev, body, { updated: stamp() });
      return json(route, 200, ev);
    }
    if (req.method() === 'DELETE') {
      ev.status = 'cancelled';
      return route.fulfill({ status: 204, headers: CORS });
    }
    return json(route, 405, {});
  });
  await page.route('https://tasks.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    store.calls.push(`${req.method()} ${url.pathname}`);
    const m = /^\/tasks\/v1\/lists\/([^/]+)\/tasks(?:\/([^/]+))?$/.exec(url.pathname);
    if (!m) return json(route, 404, {});
    const id = m[2] && decodeURIComponent(m[2]);
    if (req.method() === 'GET') return json(route, 200, { items: store.tasks });
    if (req.method() === 'POST') {
      const task = { ...body, id: `task${++seq}`, updated: stamp(), webViewLink: `https://tasks.google.com/task/${seq}` };
      store.tasks.push(task);
      return json(route, 200, task);
    }
    const task = store.tasks.find((t) => t.id === id);
    if (!task) return json(route, 404, {});
    if (req.method() === 'PATCH') {
      Object.assign(task, body, { updated: stamp() });
      return json(route, 200, task);
    }
    if (req.method() === 'DELETE') {
      task.deleted = true;
      return route.fulfill({ status: 204, headers: CORS });
    }
    return json(route, 405, {});
  });
  return store;
}

// /api/assistant 를 실제 서버 코드로 처리한다. 노션은 가짜, 로그인 확인은 as 계정으로 본다.
export async function mockAssistantApi(page, { as = 'owner', now = new Date('2026-10-23T09:00:00+09:00') } = {}) {
  const backend = fakeBackend({ now: () => now });
  const handler = createHandler({ fetchImpl: backend.fetch, env: ENV, now: () => now });
  await page.route('**/api/assistant**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const hasToken = /^Bearer .+/.test(req.headers().authorization || '');
    const request = {
      method: req.method(),
      headers: hasToken ? { authorization: `Bearer ${as}` } : {},
      body: req.postData() ? JSON.parse(req.postData()) : undefined,
      query: Object.fromEntries(url.searchParams),
    };
    let status = 200;
    let payload;
    const response = { status(code) { status = code; return this; }, json(data) { payload = data; return this; } };
    await handler(request, response);
    return json(route, status, payload);
  });
  return backend;
}
