// 노션 비서 서버 함수 테스트용 가짜 노션 API와 가짜 Supabase 인증. fetch 자리에 넣으면 메모리에서 페이지를 만들고 걸러 준다.
import { SOURCES } from '../api/assistant.js';

const OWNER = 'owner@example.com';
export const TOKENS = {
  owner: { email: OWNER, is_anonymous: false },
  stranger: { email: 'someone@example.com', is_anonymous: false },
  guest: { email: '', is_anonymous: true },
};

export const ENV = {
  VITE_SUPABASE_URL: 'https://supa.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  NOTION_POMODORO_TOKEN: 'secret_test',
  POMODORO_OWNER_EMAILS: OWNER,
  ASSISTANT_TIMEZONE: 'Asia/Seoul',
};

const text = (value) => [{ type: 'text', text: { content: value }, plain_text: value }];
let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function propValue(prop) {
  if (!prop) return undefined;
  if (prop.title) return prop.title.map((t) => t.text?.content ?? t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map((t) => t.text?.content ?? t.plain_text).join('');
  if ('checkbox' in prop) return prop.checkbox;
  if ('date' in prop) return prop.date?.start ?? null;
  if ('relation' in prop) return prop.relation.map((r) => r.id);
  if ('select' in prop) return prop.select?.name ?? null;
  if ('number' in prop) return prop.number;
  return undefined;
}

function matches(page, filter) {
  if (!filter) return true;
  if (filter.or) return filter.or.some((f) => matches(page, f));
  if (filter.and) return filter.and.every((f) => matches(page, f));
  if (filter.timestamp === 'last_edited_time') return page.last_edited_time.slice(0, 10) >= filter.last_edited_time.on_or_after;
  const value = propValue(page.properties[filter.property]);
  if (filter.checkbox) return Boolean(value) === filter.checkbox.equals;
  if (filter.rich_text) return (value || '') === filter.rich_text.equals;
  if (filter.relation) return (value || []).includes(filter.relation.contains);
  if (filter.date) {
    const day = value ? value.slice(0, 10) : null;
    if ('equals' in filter.date) return day === filter.date.equals;
    if ('on_or_after' in filter.date) return Boolean(day) && day >= filter.date.on_or_after;
  }
  throw new Error(`가짜 노션이 모르는 필터: ${JSON.stringify(filter)}`);
}

export function fakeBackend({ now = () => new Date() } = {}) {
  const pages = new Map();
  const calls = [];

  function put(source, properties, extra = {}) {
    const id = newId();
    const at = now().toISOString();
    const page = {
      object: 'page', id, url: `https://www.notion.so/${id.replaceAll('-', '')}`,
      parent: { type: 'data_source_id', data_source_id: source },
      properties: structuredClone(properties), created_time: at, last_edited_time: at, in_trash: false, ...extra,
    };
    pages.set(id, page);
    return page;
  }

  // 기본 행: 타임 매트릭스 4칸과 활성 습관 2개, 꺼진 습관 1개
  for (const code of ['A', 'B', 'C', 'D']) put(SOURCES.quadrants, { '사분면': { title: text(`${code}칸`) }, '코드': { select: { name: code } } });
  const water = put(SOURCES.habits, { '습관': { title: text('물 마시기') }, '아이콘': { rich_text: text('💧') }, '활성': { checkbox: true }, '주간 목표': { number: 7 } });
  put(SOURCES.habits, { '습관': { title: text('걷기') }, '활성': { checkbox: true } });
  put(SOURCES.habits, { '습관': { title: text('쉬는 습관') }, '활성': { checkbox: false } });

  const json = (status, body) => ({ status, ok: status < 400, json: async () => body });

  async function fetch(url, options = {}) {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, method: options.method || 'GET', body });
    if (url.startsWith(ENV.VITE_SUPABASE_URL)) {
      const token = /^Bearer (.+)$/.exec(options.headers?.Authorization || '')?.[1];
      return TOKENS[token] ? json(200, TOKENS[token]) : json(401, { msg: 'bad jwt' });
    }
    const path = url.replace('https://api.notion.com/v1', '');
    let m;
    if ((m = /^\/data_sources\/([^/]+)\/query$/.exec(path))) {
      const results = [...pages.values()].filter((p) => p.parent.data_source_id === m[1] && !p.in_trash && matches(p, body.filter));
      return json(200, { object: 'list', results: results.slice(0, body.page_size || 100), has_more: false, next_cursor: null });
    }
    if (path === '/pages' && options.method === 'POST') {
      return json(200, put(body.parent.data_source_id, body.properties, body.icon ? { icon: body.icon } : {}));
    }
    if ((m = /^\/pages\/([^/]+)$/.exec(path))) {
      const page = pages.get(m[1]);
      if (!page) return json(404, { message: 'Could not find page' });
      if (options.method === 'PATCH') {
        Object.assign(page.properties, structuredClone(body.properties || {}));
        if ('in_trash' in body) page.in_trash = body.in_trash;
        page.last_edited_time = now().toISOString();
      }
      return json(200, page);
    }
    return json(400, { message: `가짜 노션이 모르는 요청 ${options.method} ${path}` });
  }

  return { fetch, pages, calls, put, water, text };
}

// Vercel 함수의 request, response 를 흉내 낸다
export async function invoke(handler, { method = 'POST', token = 'owner', body, query } = {}) {
  const request = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body, query };
  let status = 200;
  let payload;
  const response = { status(code) { status = code; return this; }, json(data) { payload = data; return this; } };
  await handler(request, response);
  return { status, body: payload };
}
