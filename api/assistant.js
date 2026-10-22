// 노션 비서 서버 함수. 앱 모음 로그인(Supabase)으로 주인 계정만 확인하고, 노션 「Claude가 만든 노션 비서」 데이터베이스 여섯 개를 읽고 쓴다.
/* global process */
const NOTION_VERSION = '2025-09-03';
// 노션 원본 데이터베이스(데이터 소스) ID. 2026-10-23 노션 MCP 로 만들었다. 바꾸려면 같은 이름의 환경변수를 넣는다.
export const SOURCES = {
  items: '3d713532-c3b9-485d-a231-16f1b1d78689',
  days: '6bc029f9-17ab-4081-96a2-78365dff91b5',
  habits: 'dad35725-8145-47ea-8e4a-e08b3f780723',
  habitLogs: 'f99ec8bc-1a1b-4164-9448-b40a40eed1f0',
  areas: 'cc16bcfc-c205-434c-876b-8b6d2e763847',
  quadrants: 'a89079d9-7777-42b6-8e0c-d375baccb2f8',
};
export const HOME_URL = 'https://www.notion.so/401c8b6863878160894afb57955d9ca5';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const TYPE_KO = { task: '할 일', event: '일정', someday: '언젠가', info: '정보' };
export const SOURCE_KO = { app: '앱', notion: '노션', gcal: '구글 캘린더', gtask: '구글 할 일' };
const invert = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
const TYPE_EN = invert(TYPE_KO);
const SOURCE_EN = invert(SOURCE_KO);

// ─── 노션 속성 읽기, 쓰기 ─────────────────────────────────────────────────

const rich = (value) => (value ? [{ type: 'text', text: { content: String(value).slice(0, 2000) } }] : []);
const plain = (prop) => (prop?.title || prop?.rich_text || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');
const num = (prop) => {
  if (!prop) return null;
  if (prop.type === 'number') return prop.number;
  if (prop.type === 'formula') return prop.formula?.number ?? null;
  if (prop.type === 'rollup') return prop.rollup?.number ?? null;
  return null;
};
const str = (prop) => (prop?.type === 'formula' ? prop.formula?.string ?? '' : '');
const ids = (prop) => (prop?.relation || []).map((r) => r.id);

export function dateKeyIn(value, timeZone) {
  if (!value) return null;
  if (value.length === 10) return value;
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function quadrantCode(item) {
  if (item.type !== 'task') return null;
  if (item.important && item.urgent) return 'A';
  if (item.important) return 'B';
  if (item.urgent) return 'C';
  return 'D';
}

export function itemFromPage(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    title: plain(p['이름']),
    type: TYPE_EN[p['종류']?.select?.name] || 'task',
    start: p['날짜']?.date?.start || null,
    end: p['날짜']?.date?.end || null,
    done: Boolean(p['완료']?.checkbox),
    important: Boolean(p['중요']?.checkbox),
    urgent: Boolean(p['긴급']?.checkbox),
    areaIds: ids(p['영역']),
    place: plain(p['장소']),
    memo: plain(p['메모']),
    tags: (p['태그']?.multi_select || []).map((t) => t.name),
    link: p['링크']?.url || '',
    doneAt: p['완료일']?.date?.start || null,
    source: SOURCE_EN[p['출처']?.select?.name] || 'notion',
    gcalId: plain(p['구글 캘린더 ID']) || null,
    gtaskId: plain(p['구글 할 일 ID']) || null,
    googleUrl: p['구글 링크']?.url || '',
    syncState: plain(p['동기화 지문']),
    createdAt: page.created_time,
    editedAt: page.last_edited_time,
  };
}

export function itemProperties(item, { dayId = null, quadrantId = null } = {}) {
  const props = {
    '이름': { title: rich(item.title || '(제목 없음)') },
    '종류': { select: { name: TYPE_KO[item.type] || '할 일' } },
    '날짜': { date: item.start ? { start: item.start, end: item.end || null } : null },
    '완료': { checkbox: Boolean(item.done) },
    '중요': { checkbox: Boolean(item.important) },
    '긴급': { checkbox: Boolean(item.urgent) },
    '장소': { rich_text: rich(item.place) },
    '메모': { rich_text: rich(item.memo) },
    '태그': { multi_select: (item.tags || []).filter(Boolean).slice(0, 20).map((name) => ({ name: String(name).replace(/,/g, ' ').slice(0, 100) })) },
    '링크': { url: item.link || null },
    '완료일': { date: item.done && item.doneAt ? { start: item.doneAt } : null },
    '구글 캘린더 ID': { rich_text: rich(item.gcalId) },
    '구글 할 일 ID': { rich_text: rich(item.gtaskId) },
    '구글 링크': { url: item.googleUrl || null },
    '동기화 지문': { rich_text: rich(item.syncState) },
    '영역': { relation: (item.areaIds || []).map((id) => ({ id })) },
    '일간 기록': { relation: dayId ? [{ id: dayId }] : [] },
    '사분면': { relation: quadrantId ? [{ id: quadrantId }] : [] },
  };
  if (item.source && SOURCE_KO[item.source]) props['출처'] = { select: { name: SOURCE_KO[item.source] } };
  return props;
}

export function dayFromPage(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    date: p['일자']?.date?.start || null,
    mood: p['기분']?.select?.name || '',
    note: plain(p['한 줄 회고']),
    habitTarget: num(p['습관 수']) ?? 0,
    tasks: num(p['할 일']) ?? 0,
    tasksDone: num(p['끝낸 할 일']) ?? 0,
    events: num(p['일정']) ?? 0,
    habitsDone: num(p['습관 체크']) ?? 0,
    score: num(p['점수']) ?? 0,
    summary: str(p['하루 요약']),
  };
}

export function habitFromPage(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    name: plain(p['습관']),
    icon: plain(p['아이콘']) || (page.icon?.type === 'emoji' ? page.icon.emoji : '') || '✅',
    timeOfDay: p['시간대']?.select?.name || '🔁 언제든',
    weeklyGoal: num(p['주간 목표']) || 7,
    active: Boolean(p['활성']?.checkbox),
    order: num(p['순서']) ?? 99,
    streak: num(p['연속 일수']) ?? 0,
    total: num(p['누적 횟수']) ?? 0,
  };
}

export function habitLogFromPage(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    habitId: ids(p['습관'])[0] || null,
    date: p['날짜']?.date?.start?.slice(0, 10) || null,
    done: Boolean(p['완료']?.checkbox),
    key: plain(p['키']),
  };
}

export function areaFromPage(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    name: plain(p['영역']),
    icon: plain(p['아이콘']) || (page.icon?.type === 'emoji' ? page.icon.emoji : '') || '📁',
    order: num(p['순서']) ?? 99,
    total: num(p['전체']) ?? 0,
    doneCount: num(p['끝낸 것']) ?? 0,
    remaining: num(p['남은 할 일']) ?? 0,
    upcoming: num(p['다가오는 일정']) ?? 0,
  };
}

export function quadrantFromPage(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    code: p['코드']?.select?.name || '',
    name: plain(p['사분면']),
    how: plain(p['어떻게']),
    count: num(p['개수']) ?? 0,
    remaining: num(p['남은 일']) ?? 0,
  };
}

// 이날까지 이어진 연속 일수. 오늘을 아직 안 했으면 어제부터 센다.
export function computeStreak(doneDates, todayKey) {
  const set = new Set(doneDates);
  const shift = (key, days) => {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  let cursor = set.has(todayKey) ? todayKey : shift(todayKey, -1);
  let count = 0;
  while (set.has(cursor)) {
    count += 1;
    cursor = shift(cursor, -1);
  }
  return count;
}

// ─── 핸들러 ───────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(status, reason, message) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export function createHandler({ fetchImpl = (...args) => fetch(...args), env = process.env, now = () => new Date() } = {}) {
  const sources = Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, env[`NOTION_ASSISTANT_${k.toUpperCase()}_SOURCE`] || v]));
  const timeZone = env.ASSISTANT_TIMEZONE || 'Asia/Seoul';
  const owners = () => String(env.ASSISTANT_OWNER_EMAILS || env.POMODORO_OWNER_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const token = () => env.NOTION_ASSISTANT_TOKEN || env.NOTION_POMODORO_TOKEN;
  const verified = new Map();
  const dayIds = new Map();
  let quadrantIds = null;

  async function notion(method, path, body) {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchImpl(`https://api.notion.com/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${token()}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(() => ({}));
      // 초당 3회 한도에 걸리면 잠깐 쉬고 다시 보낸다
      if (response.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (response.status >= 400) throw new HttpError(502, 'notion', data.message || `노션 응답 ${response.status}`);
      return data;
    }
  }

  async function queryAll(source, body = {}, maxPages = 5) {
    const results = [];
    let cursor;
    for (let i = 0; i < maxPages; i += 1) {
      const data = await notion('POST', `/data_sources/${source}/query`, { page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) });
      results.push(...(data.results || []));
      if (!data.has_more) break;
      cursor = data.next_cursor;
    }
    return results;
  }

  async function verify(request) {
    const accessToken = /^Bearer (.+)$/.exec(request.headers?.authorization || '')?.[1];
    if (!accessToken) throw new HttpError(401, 'no-token', '앱 모음에서 로그인이 필요합니다.');
    const cached = verified.get(accessToken);
    if (cached && cached.until > Date.now()) return cached.email;
    const response = await fetchImpl(`${env.VITE_SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new HttpError(401, 'bad-token', '로그인이 만료되었습니다. 앱 모음에서 다시 로그인해 주세요.');
    const user = await response.json();
    const email = String(user.email || '').toLowerCase();
    if (user.is_anonymous || !email || !owners().includes(email)) {
      throw new HttpError(403, 'not-owner', '노션 비서는 주인 계정 전용입니다.');
    }
    verified.set(accessToken, { email, until: Date.now() + 5 * 60_000 });
    return email;
  }

  const todayKey = () => dateKeyIn(now().toISOString(), timeZone);

  async function activeHabitCount() {
    const habits = await queryAll(sources.habits, { filter: { property: '활성', checkbox: { equals: true } } }, 1);
    return habits.length;
  }

  // 그날의 일간 기록 줄을 찾고 없으면 만든다
  async function ensureDay(key) {
    if (!key) return null;
    if (dayIds.has(key)) return dayIds.get(key);
    const found = await notion('POST', `/data_sources/${sources.days}/query`, { filter: { property: '일자', date: { equals: key } }, page_size: 1 });
    let id = found.results?.[0]?.id;
    if (!id) {
      const weekday = WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()];
      const created = await notion('POST', '/pages', {
        parent: { type: 'data_source_id', data_source_id: sources.days },
        icon: { type: 'emoji', emoji: '📆' },
        properties: {
          '날짜': { title: rich(`${key} (${weekday})`) },
          '일자': { date: { start: key } },
          '습관 수': { number: key >= todayKey() ? await activeHabitCount() : null },
        },
      });
      id = created.id;
    }
    dayIds.set(key, id);
    return id;
  }

  async function quadrantId(code) {
    if (!code) return null;
    if (!quadrantIds) {
      const rows = await queryAll(sources.quadrants, {}, 1);
      quadrantIds = Object.fromEntries(rows.map(quadrantFromPage).map((q) => [q.code, q.id]));
    }
    return quadrantIds[code] || null;
  }

  async function writeItem(item, pageId) {
    const dayId = item.start ? await ensureDay(dateKeyIn(item.start, timeZone)) : null;
    const properties = itemProperties(item, { dayId, quadrantId: await quadrantId(quadrantCode(item)) });
    const page = pageId
      ? await notion('PATCH', `/pages/${pageId}`, { properties })
      : await notion('POST', '/pages', { parent: { type: 'data_source_id', data_source_id: sources.items }, properties });
    return itemFromPage(page);
  }

  async function ownItem(id) {
    const page = await notion('GET', `/pages/${id}`);
    const parent = page.parent?.data_source_id || page.parent?.database_id;
    if (String(parent || '').replaceAll('-', '') !== sources.items.replaceAll('-', '')) {
      throw new HttpError(403, 'foreign-page', '노션 비서 항목이 아닙니다.');
    }
    return page;
  }

  async function bootstrap() {
    const today = todayKey();
    const back = (days) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - days);
      return d.toISOString().slice(0, 10);
    };
    const [itemPages, areaPages, habitPages, logPages, dayPages, quadrantPages] = await Promise.all([
      queryAll(sources.items, {
        filter: { or: [{ property: '완료', checkbox: { equals: false } }, { timestamp: 'last_edited_time', last_edited_time: { on_or_after: back(30) } }] },
        sorts: [{ property: '날짜', direction: 'ascending' }],
      }),
      queryAll(sources.areas, { sorts: [{ property: '순서', direction: 'ascending' }] }, 1),
      queryAll(sources.habits, { sorts: [{ property: '순서', direction: 'ascending' }] }, 1),
      queryAll(sources.habitLogs, { filter: { and: [{ property: '날짜', date: { on_or_after: back(42) } }, { property: '완료', checkbox: { equals: true } }] } }, 3),
      queryAll(sources.days, { filter: { property: '일자', date: { on_or_after: back(13) } }, sorts: [{ property: '일자', direction: 'ascending' }] }, 1),
      queryAll(sources.quadrants, {}, 1),
    ]);
    const habits = habitPages.map(habitFromPage);
    const days = dayPages.map(dayFromPage);
    // 오늘 줄이 없거나 습관 수가 달라졌으면 맞춰 둔다(일간 기록의 습관 달성률 분모)
    const activeCount = habits.filter((h) => h.active).length;
    const todayRow = days.find((d) => d.date === today);
    if (!todayRow) {
      const id = await ensureDay(today);
      const page = await notion('GET', `/pages/${id}`);
      days.push(dayFromPage(page));
    } else if (todayRow.habitTarget !== activeCount) {
      const page = await notion('PATCH', `/pages/${todayRow.id}`, { properties: { '습관 수': { number: activeCount } } });
      Object.assign(todayRow, dayFromPage(page));
    }
    return {
      today,
      items: itemPages.map(itemFromPage),
      areas: areaPages.map(areaFromPage),
      habits,
      habitLogs: logPages.map(habitLogFromPage),
      days,
      quadrants: quadrantPages.map(quadrantFromPage),
      home: HOME_URL,
    };
  }

  async function toggleHabit({ habitId, date, done, name = '', icon = '' }) {
    if (!habitId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new HttpError(400, 'bad-request', '습관 기록 형식이 올바르지 않습니다.');
    const key = `${habitId.replaceAll('-', '')}:${date}`;
    const dayId = await ensureDay(date);
    const found = await notion('POST', `/data_sources/${sources.habitLogs}/query`, { filter: { property: '키', rich_text: { equals: key } }, page_size: 1 });
    let log = null;
    if (found.results?.[0]) {
      log = await notion('PATCH', `/pages/${found.results[0].id}`, { properties: { '완료': { checkbox: Boolean(done) }, '일간 기록': { relation: [{ id: dayId }] } } });
    } else if (done) {
      const [, m, d] = date.split('-').map(Number);
      log = await notion('POST', '/pages', {
        parent: { type: 'data_source_id', data_source_id: sources.habitLogs },
        properties: {
          '기록': { title: rich(`${icon} ${name} · ${m}/${d}`.trim()) },
          '날짜': { date: { start: date } },
          '완료': { checkbox: true },
          '키': { rich_text: rich(key) },
          '습관': { relation: [{ id: habitId }] },
          '일간 기록': { relation: [{ id: dayId }] },
        },
      });
    }
    const back = new Date(`${date}T00:00:00Z`);
    back.setUTCDate(back.getUTCDate() - 400);
    const logs = await queryAll(sources.habitLogs, {
      filter: { and: [
        { property: '습관', relation: { contains: habitId } },
        { property: '완료', checkbox: { equals: true } },
        { property: '날짜', date: { on_or_after: back.toISOString().slice(0, 10) } },
      ] },
    }, 4);
    const streak = computeStreak(logs.map(habitLogFromPage).map((l) => l.date), todayKey());
    await notion('PATCH', `/pages/${habitId}`, { properties: { '연속 일수': { number: streak } } });
    return { log: log ? habitLogFromPage(log) : null, streak };
  }

  async function saveHabit({ habit }) {
    if (!habit?.name) throw new HttpError(400, 'bad-request', '습관 이름이 필요합니다.');
    const properties = {
      '습관': { title: rich(habit.name) },
      '아이콘': { rich_text: rich(habit.icon || '✅') },
      '시간대': { select: { name: habit.timeOfDay || '🔁 언제든' } },
      '주간 목표': { number: Number(habit.weeklyGoal) || 7 },
      '활성': { checkbox: habit.active !== false },
      '순서': { number: Number(habit.order) || 99 },
    };
    const page = habit.id
      ? await notion('PATCH', `/pages/${habit.id}`, { properties })
      : await notion('POST', '/pages', { parent: { type: 'data_source_id', data_source_id: sources.habits }, icon: { type: 'emoji', emoji: habit.icon || '✅' }, properties: { ...properties, '연속 일수': { number: 0 } } });
    return { habit: habitFromPage(page) };
  }

  async function saveDay({ date, mood, note }) {
    const id = await ensureDay(date);
    const properties = {};
    if (mood !== undefined) properties['기분'] = { select: mood ? { name: mood } : null };
    if (note !== undefined) properties['한 줄 회고'] = { rich_text: rich(note) };
    const page = await notion('PATCH', `/pages/${id}`, { properties });
    return { day: dayFromPage(page) };
  }

  async function runOne(op) {
    if (op.op === 'create') return { item: await writeItem(op.item) };
    if (op.op === 'update') {
      await ownItem(op.item.id);
      return { item: await writeItem(op.item, op.item.id) };
    }
    if (op.op === 'trash') {
      await ownItem(op.id);
      await notion('PATCH', `/pages/${op.id}`, { in_trash: true });
      return { trashed: op.id };
    }
    throw new HttpError(400, 'bad-request', '알 수 없는 작업입니다.');
  }

  const actions = {
    bootstrap,
    createItem: ({ item }) => runOne({ op: 'create', item }),
    updateItem: ({ item }) => runOne({ op: 'update', item }),
    trashItem: ({ id }) => runOne({ op: 'trash', id }),
    // 동기화처럼 여러 건을 한 번에. 하나가 실패해도 나머지는 계속하고 결과에 오류를 담는다.
    batch: async ({ ops = [] }) => {
      const results = [];
      for (const op of ops.slice(0, 40)) {
        try {
          results.push({ ok: true, ...(await runOne(op)) });
        } catch (error) {
          results.push({ ok: false, error: error.message });
        }
      }
      return { results };
    },
    toggleHabit,
    saveHabit,
    saveDay,
  };

  return async function handler(request, response) {
    try {
      await verify(request);
      if (!token()) throw new HttpError(503, 'not-configured', '서버에 노션 연결 설정이 없습니다.');
      const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {};
      const action = request.method === 'GET' ? request.query?.action : body.action;
      if (request.method === 'GET' && action === 'check') return response.status(200).json({ ok: true });
      const run = actions[action];
      if (!run || (request.method === 'GET') !== (action === 'bootstrap')) throw new HttpError(400, 'bad-request', '알 수 없는 요청입니다.');
      return response.status(200).json({ ok: true, ...(await run(body)) });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error('assistant', error.message);
      return response.status(status).json({ ok: false, reason: error.reason || 'server', error: error.message });
    }
  };
}

export default createHandler();
