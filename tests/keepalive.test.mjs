// api/keepalive.js 의 분기별 동작을 검증한다. 외부 호출은 globalThis.fetch를 갈아끼워 격리한다.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/keepalive.js';

// Vercel의 response 객체를 최소한으로 흉내낸다.
function makeRes() {
  const out = {};
  return {
    status(code) { out.code = code; return this; },
    json(body) { out.body = body; return out; },
    get result() { return out; },
  };
}

const realFetch = globalThis.fetch;
const ENV = { url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY };

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_test';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (ENV.url === undefined) delete process.env.VITE_SUPABASE_URL;
  else process.env.VITE_SUPABASE_URL = ENV.url;
  if (ENV.key === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
  else process.env.VITE_SUPABASE_ANON_KEY = ENV.key;
});

describe('keepalive 엔드포인트', () => {
  test('환경변수가 없으면 500과 함께 원인을 알린다', async () => {
    delete process.env.VITE_SUPABASE_URL;
    const res = makeRes();
    await handler({}, res);
    assert.equal(res.result.code, 500);
    assert.equal(res.result.body.ok, false);
    assert.match(res.result.body.error, /환경변수/);
  });

  test('Supabase가 정상 응답하면 ok:true를 돌려준다', async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200 });
    const res = makeRes();
    await handler({}, res);
    assert.equal(res.result.code, 200);
    assert.equal(res.result.body.ok, true);
    assert.equal(res.result.body.status, 200);
  });

  test('DB에 실제로 질의가 가도록 REST 경로와 인증 헤더를 붙인다', async () => {
    let seen = null;
    globalThis.fetch = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200 }; };
    await handler({}, makeRes());
    assert.equal(seen.url, 'https://example.supabase.co/rest/v1/game_records?select=id&limit=1');
    assert.equal(seen.opts.headers.apikey, 'sb_publishable_test');
    assert.equal(seen.opts.headers.Authorization, 'Bearer sb_publishable_test');
  });

  test('Supabase가 비정상 상태코드를 주면 502로 알린다', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    const res = makeRes();
    await handler({}, res);
    assert.equal(res.result.code, 502);
    assert.equal(res.result.body.ok, false);
  });

  test('연결 자체가 실패하면 503과 함께 수동 복원 안내를 준다', async () => {
    globalThis.fetch = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    const res = makeRes();
    await handler({}, res);
    assert.equal(res.result.code, 503);
    assert.equal(res.result.body.ok, false);
    assert.match(res.result.body.hint, /Restore/);
  });

  test('응답에는 언제 찔렀는지 시각이 들어간다', async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200 });
    const res = makeRes();
    await handler({}, res);
    assert.ok(!Number.isNaN(Date.parse(res.result.body.at)));
  });
});
