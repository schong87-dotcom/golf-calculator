// 노션 비서의 구글 연결. GIS 토큰(한 시간짜리)으로 구글 캘린더와 구글 할 일 API 를 브라우저에서 바로 부른다.
// 같은 OAuth 웹 클라이언트를 앱 모음 로그인, 뽀모도로와 함께 쓴다(승인된 JS 원본은 운영 주소).
export const GOOGLE_CLIENT_ID = '450177760064-6g9lk2lcmi6lm0tvgs40pva4n517u1sr.apps.googleusercontent.com';
const SCOPE = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
].join(' ');
const KEY = 'assistant-google-v1';
const CAL = 'https://www.googleapis.com/calendar/v3';
const TASKS = 'https://tasks.googleapis.com/tasks/v1';

export class GoogleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// tasksList 가 비어 있으면 「노션 비서」 목록을 찾거나 만들어 쓴다(기본 목록은 다른 용도일 수 있어 건드리지 않는다)
const defaults = { accessToken: '', expiresAt: 0, email: '', writeCalendar: 'primary', readCalendars: ['primary'], tasksList: '', lastSync: '' };
export const TASK_LIST_TITLE = '노션 비서';

export function loadGoogleState() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

export function saveGoogleState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장소가 막힌 브라우저에서는 이번 세션에만 기억한다
  }
}

export const tokenValid = (state) => Boolean(state.accessToken) && state.expiresAt > Date.now() + 60_000;

function waitForGis(timeout = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      if (window.google?.accounts?.oauth2) return resolve(window.google.accounts.oauth2);
      if (Date.now() - started > timeout) return reject(new GoogleError(0, '구글 로그인 도구를 불러오지 못했습니다.'));
      setTimeout(poll, 100);
    })();
  });
}

// 사용자가 버튼을 누른 흐름 안에서만 부른다(팝업 차단 방지)
export async function requestToken(state, prompt) {
  const oauth = await waitForGis();
  const response = await new Promise((resolve, reject) => {
    oauth.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      prompt,
      login_hint: state.email || undefined,
      callback: (r) => (r.error || !r.access_token ? reject(new GoogleError(401, r.error_description || r.error || '구글 연결을 취소했습니다.')) : resolve(r)),
      error_callback: (e) => reject(new GoogleError(401, e?.message || '구글 연결 창이 닫혔습니다.')),
    }).requestAccessToken();
  });
  const next = { ...state, accessToken: response.access_token, expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000 };
  if (!next.email) {
    const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${next.accessToken}` } })
      .then((r) => r.json()).catch(() => ({}));
    if (profile.email && profile.email !== state.email) Object.assign(next, { email: profile.email, readCalendars: ['primary'], writeCalendar: 'primary' });
  }
  saveGoogleState(next);
  return next;
}

export function revoke(state) {
  if (state.accessToken) window.google?.accounts?.oauth2?.revoke?.(state.accessToken, () => {});
  const next = { ...defaults };
  saveGoogleState(next);
  return next;
}

export function createGoogleClient(getState) {
  async function request(url, { method = 'GET', body, query } = {}) {
    const state = getState();
    if (!tokenValid(state)) throw new GoogleError(401, '구글 연결이 만료되었습니다.');
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null))}` : '';
    const response = await fetch(`${url}${qs}`, {
      method,
      headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new GoogleError(response.status, data.error?.message || `구글 응답 ${response.status}`);
    return data;
  }

  async function pages(url, query, field) {
    const all = [];
    let pageToken;
    for (let i = 0; i < 10; i += 1) {
      const data = await request(url, { query: { ...query, pageToken } });
      all.push(...(data[field] || []));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return all;
  }

  const cal = (id) => `${CAL}/calendars/${encodeURIComponent(id)}/events`;
  const list = (id) => `${TASKS}/lists/${encodeURIComponent(id)}/tasks`;

  return {
    listCalendars: () => pages(`${CAL}/users/me/calendarList`, { maxResults: 250 }, 'items'),
    listEvents: (calendarId, timeMin, timeMax) => pages(cal(calendarId), {
      timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), singleEvents: true, showDeleted: true, maxResults: 250,
    }, 'items'),
    createEvent: (calendarId, body) => request(cal(calendarId), { method: 'POST', body }),
    patchEvent: (calendarId, id, body) => request(`${cal(calendarId)}/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    deleteEvent: (calendarId, id) => request(`${cal(calendarId)}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => {
      if (e.status !== 404 && e.status !== 410) throw e;
    }),
    // 안 끝난 할 일 전부 + 최근에 바뀐 것(완료, 삭제 포함). completedMin 을 쓰면 안 끝난 할 일이 빠진다(2026-10-23 실측).
    listTasks: async (listId, updatedMin) => {
      const [open, recent] = await Promise.all([
        pages(list(listId), { showCompleted: false, maxResults: 100 }, 'items'),
        pages(list(listId), { showCompleted: true, showHidden: true, showDeleted: true, updatedMin: updatedMin.toISOString(), maxResults: 100 }, 'items'),
      ]);
      const byId = new Map(open.map((t) => [t.id, t]));
      for (const t of recent) byId.set(t.id, t);
      return [...byId.values()];
    },
    listTaskLists: () => pages(`${TASKS}/users/@me/lists`, { maxResults: 100 }, 'items'),
    createTaskList: (title) => request(`${TASKS}/users/@me/lists`, { method: 'POST', body: { title } }),
    createTask: (listId, body) => request(list(listId), { method: 'POST', body }),
    patchTask: (listId, id, body) => request(`${list(listId)}/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    deleteTask: (listId, id) => request(`${list(listId)}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => {
      if (e.status !== 404 && e.status !== 410) throw e;
    }),
  };
}
