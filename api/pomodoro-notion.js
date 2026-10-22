// 뽀모도로 집중 기록을 노션 「집중 기록」 인라인 데이터베이스에 넣고 고치는 서버 함수. 구글 로그인으로 주인 계정만 쓴다.
/* global process */
// 원본은 드라이브 뽀모도로 폴더의 api/pomodoro-notion.js 다. 앱 모음의 사본은 scripts/sync-to-hub.mjs 로만 바꾼다.
const GOOGLE_CLIENT_ID = '450177760064-6g9lk2lcmi6lm0tvgs40pva4n517u1sr.apps.googleusercontent.com';
const DEFAULT_DATABASE_ID = 'd4ff7cc1-732d-42b4-92d0-7869ce5bac0d';
// 「일별 집중 합계」 DB. 날짜마다 한 줄이고, 집중 기록을 관계로 묶어 합계(분)를 롤업으로 더한다.
const DEFAULT_DAILY_DATABASE_ID = 'fb0b4134-69a6-4a48-93db-6221b52f87e3';
const NOTION_VERSION = '2022-06-28';
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const compactId = (id) => String(id || '').replaceAll('-', '').toLowerCase();
const text = (value) => [{ text: { content: String(value).slice(0, 2000) } }];

export function notionProperties(record) {
  const done = record.status === '완료';
  const minutes = (value) => (Number.isFinite(Number(value)) && value !== null ? Number(value) : null);
  return {
    '할일': { title: text(record.task || '할 일 미입력') },
    '상태': { select: { name: done ? '완료' : '진행중' } },
    '완료': { checkbox: done },
    '시작': { date: record.startAt ? { start: record.startAt } : null },
    '종료': { date: record.endAt ? { start: record.endAt } : null },
    '계획(분)': { number: minutes(record.plannedMinutes) },
    '실제 집중(분)': { number: minutes(record.focusMinutes) },
    '구글 태스크': { url: record.googleTaskUrl || null },
    '기록 ID': { rich_text: text(record.id) },
  };
}

export function createHandler({ fetchImpl = (...args) => fetch(...args), env = process.env } = {}) {
  const fail = (response, code, reason, error) => response.status(code).json({ ok: false, reason, error });

  async function notion(method, path, body) {
    const response = await fetchImpl(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.NOTION_POMODORO_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  }

  // 기록을 시작한 날(기기 시간대 날짜)의 합계 줄을 찾고, 없으면 만든다.
  async function dayPageId(startAt) {
    const day = /^\d{4}-\d{2}-\d{2}/.exec(String(startAt || ''))?.[0];
    if (!day) return null;
    const dailyId = env.NOTION_POMODORO_DAILY_DATABASE_ID || DEFAULT_DAILY_DATABASE_ID;
    const found = await notion('POST', `/databases/${dailyId}/query`, { filter: { property: '일자', date: { equals: day } }, page_size: 1 });
    if (found.status !== 200) throw new Error(`일별 합계 조회 ${found.status}`);
    if (found.data.results?.[0]) return found.data.results[0].id;
    const weekday = weekdays[new Date(`${day}T00:00:00Z`).getUTCDay()];
    const created = await notion('POST', '/pages', {
      parent: { database_id: dailyId },
      properties: { '날짜': { title: text(`${day} (${weekday})`) }, '일자': { date: { start: day } } },
    });
    if (created.status !== 200) throw new Error(`일별 합계 만들기 ${created.status}`);
    return created.data.id;
  }

  return async function handler(request, response) {
    if (request.method !== 'POST') return fail(response, 405, 'method', 'POST 요청만 받습니다.');
    const accessToken = /^Bearer (.+)$/.exec(request.headers?.authorization || '')?.[1];
    if (!accessToken) return fail(response, 401, 'no-token', '구글 연결이 필요합니다.');

    // 구글 접근 토큰이 이 앱(클라이언트 ID)에서 나왔고 주인 계정인지 구글에 직접 묻는다.
    const tokenInfo = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenInfo.ok) return fail(response, 401, 'bad-token', '구글 연결이 만료되었습니다.');
    const claims = await tokenInfo.json();
    if (claims.aud !== GOOGLE_CLIENT_ID && claims.azp !== GOOGLE_CLIENT_ID) return fail(response, 401, 'bad-token', '이 앱의 구글 연결이 아닙니다.');
    const owners = String(env.POMODORO_OWNER_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
    const email = String(claims.email || '').toLowerCase();
    if (String(claims.email_verified) !== 'true' || !owners.includes(email)) {
      return fail(response, 403, 'not-owner', '노션 기록은 주인 계정만 씁니다.');
    }
    if (!env.NOTION_POMODORO_TOKEN) return fail(response, 503, 'not-configured', '서버에 노션 연결 설정이 없습니다.');

    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {};
    if (body.check) return response.status(200).json({ ok: true });
    const record = body.record;
    if (!record || typeof record.id !== 'string' || !record.id) return fail(response, 400, 'bad-record', '기록 형식이 올바르지 않습니다.');

    const databaseId = env.NOTION_POMODORO_DATABASE_ID || DEFAULT_DATABASE_ID;
    let pageId = typeof body.pageId === 'string' ? body.pageId : null;
    if (pageId) {
      // 이 데이터베이스의 줄만 고친다. 다른 노션 페이지는 건드리지 않는다.
      const page = await notion('GET', `/pages/${encodeURIComponent(pageId)}`);
      if (page.status === 404 || page.data.archived || page.data.in_trash) pageId = null;
      else if (page.status !== 200) return fail(response, 502, 'notion', `노션 응답 ${page.status}`);
      else if (compactId(page.data.parent?.database_id) !== compactId(databaseId)) return fail(response, 403, 'foreign-page', '집중 기록 데이터베이스의 줄이 아닙니다.');
    }
    if (!pageId) {
      // 응답을 못 받고 다시 보낸 기록이 두 줄로 생기지 않게 기록 ID 로 먼저 찾는다.
      const found = await notion('POST', `/databases/${databaseId}/query`, {
        filter: { property: '기록 ID', rich_text: { equals: record.id } },
        page_size: 1,
      });
      if (found.status !== 200) return fail(response, 502, 'notion', `노션 응답 ${found.status}`);
      pageId = found.data.results?.[0]?.id || null;
    }

    const properties = notionProperties(record);
    // 합계 줄을 못 찾아도 기록 자체는 남긴다. 실패는 응답의 daily 로 알린다.
    let daily = null;
    try {
      const dayId = await dayPageId(record.startAt);
      if (dayId) properties['일별 합계'] = { relation: [{ id: dayId }] };
    } catch (error) {
      console.error('pomodoro-notion daily', error.message);
      daily = 'error';
    }
    const saved = pageId
      ? await notion('PATCH', `/pages/${pageId}`, { properties })
      : await notion('POST', '/pages', { parent: { database_id: databaseId }, properties });
    if (saved.status !== 200) return fail(response, 502, 'notion', saved.data.message || `노션 응답 ${saved.status}`);
    return response.status(200).json({ ok: true, pageId: saved.data.id, url: saved.data.url, ...(daily ? { daily } : {}) });
  };
}

export default createHandler();
