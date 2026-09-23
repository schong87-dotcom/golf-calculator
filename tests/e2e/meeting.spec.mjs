// 모임 정산 화면을 실제 브라우저로 조작해 요구사항(인원 추가, 빈 항목, 결제·제외 체크 정산, 저장)을 검증한다
// Supabase는 page.route로 가로채 가짜 세션·가짜 DB로 대체한다. 실제 서버로는 요청이 한 건도 나가지 않는다.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

function supabaseUrl() {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  return env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '');
}

const SUPA = supabaseUrl();
const STORAGE_KEY = `sb-${new URL(SUPA).hostname.split('.')[0]}-auth-token`;
const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tester@example.com',
  user_metadata: { full_name: '테스트 사용자' },
  app_metadata: { provider: 'google' },
  created_at: '2026-09-24T00:00:00Z',
};

function fakeSession() {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, exp, role: 'authenticated' })}.sig`,
    token_type: 'bearer',
    expires_in: 24 * 3600,
    expires_at: exp,
    refresh_token: 'fake-refresh-token',
    user: USER,
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

// 테이블별 행을 메모리에 들고 PostgREST 흉내를 낸다. 테스트는 db를 직접 들여다본다.
async function mockSupabase(page) {
  const db = { current_round: [], rounds: [], current_meeting: [], meetings: [] };
  let seq = 0;
  const reply = (route, status, body) =>
    route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: body === undefined ? '' : JSON.stringify(body),
    });

  await page.route(`${SUPA}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === '/auth/v1/user') return reply(route, 200, USER);

    const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
    if (!table || !(table in db)) return route.abort();
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

async function openMeeting(page) {
  await page.getByRole('button', { name: /모임 정산/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: '모임 정산' })).toBeVisible();
}

const nameInputs = page => page.getByPlaceholder('이름 입력', { exact: true });
const addPersonButton = page => page.getByRole('button', { name: '+ 인원 추가' });
const calcButton = page => page.getByRole('button', { name: /정산 계산하기/ });

async function fillNames(page, names) {
  const current = await nameInputs(page).count();
  for (let k = current; k < names.length; k++) await addPersonButton(page).click();
  for (let k = 0; k < names.length; k++) await nameInputs(page).nth(k).fill(names[k]);
}

async function fillItem(page, index, { name, amount, payers = [], excluded = [] }) {
  const item = page.locator('.cost-item').nth(index);
  await item.getByPlaceholder('항목명 입력').fill(name);
  await item.getByPlaceholder('금액 입력').fill(String(amount));
  const [payerGroup, excludedGroup] = [0, 1].map(n => item.locator('.checker-group').nth(n));
  for (const p of payers) await payerGroup.getByLabel(p, { exact: true }).check();
  for (const p of excluded) await excludedGroup.getByLabel(p, { exact: true }).check();
}

async function readTransfers(page) {
  return page.locator('.transfer-row').evaluateAll(rows => rows.map(r => ({
    from: r.querySelector('.transfer-from > span:last-child').textContent,
    to: r.querySelector('.transfer-to > span:last-child').textContent,
    amount: r.querySelector('.transfer-amount-badge').textContent,
  })));
}

const netOf = (page, name) =>
  page.locator('.balance-card')
    .filter({ has: page.locator('.balance-name', { hasText: name }) })
    .locator('.balance-net');

let db;

test.beforeEach(async ({ page }) => {
  db = await mockSupabase(page);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(fakeSession())]);
  page.on('dialog', d => d.accept());
  await page.goto('/');
});

test('허브에 모임 정산 카드가 있고 누르면 모임 정산 화면이 열린다', async ({ page }) => {
  await expect(page.getByRole('button', { name: /골프 정산/ })).toBeVisible();
  await openMeeting(page);
});

test('참가자 칸은 기본 4개이고, + 인원 추가를 누를 때마다 1칸씩 늘며 새 칸에 커서가 간다', async ({ page }) => {
  await openMeeting(page);
  await expect(nameInputs(page)).toHaveCount(4);
  for (let n = 5; n <= 12; n++) {
    await addPersonButton(page).click();
    await expect(nameInputs(page)).toHaveCount(n);
    await expect(nameInputs(page).nth(n - 1)).toBeFocused();
  }
});

test('비용 항목은 이름이 빈칸으로 시작하고, 직접 써 넣어 쓴다', async ({ page }) => {
  await openMeeting(page);
  const names = page.getByPlaceholder('항목명 입력');
  await expect(names).toHaveCount(1);
  await expect(names.first()).toHaveValue('');
  await expect(page.getByText(/그린피|캐디피/)).toHaveCount(0);

  await names.first().fill('1차 저녁');
  await page.getByRole('button', { name: '+ 비용 항목 추가' }).click();
  await expect(names).toHaveCount(2);
  await expect(names.nth(0)).toHaveValue('1차 저녁');
  await expect(names.nth(1)).toHaveValue('');
});

test('6명 3개 항목 — 결제·제외 체크대로 정산된다 (골프와 같은 방식)', async ({ page }) => {
  await openMeeting(page);
  const people = ['김민수', '이서연', '박지훈', '최유진', '정다은', '한도윤'];
  await fillNames(page, people);
  await expect(page.locator('.cost-item').first().locator('.checker-group').nth(0).locator('input')).toHaveCount(6);

  await fillItem(page, 0, { name: '1차 저녁', amount: 120000, payers: ['김민수'] });
  await page.getByRole('button', { name: '+ 비용 항목 추가' }).click();
  await fillItem(page, 1, { name: '2차 호프', amount: 90000, payers: ['이서연'], excluded: ['정다은', '한도윤'] });
  await page.getByRole('button', { name: '+ 비용 항목 추가' }).click();
  await fillItem(page, 2, { name: '3차 카페', amount: 30000, payers: ['박지훈', '최유진'], excluded: ['김민수'] });

  await calcButton(page).click();
  await expect(netOf(page, '김민수')).toHaveText('+77,500원');
  await expect(netOf(page, '이서연')).toHaveText('+41,500원');
  await expect(netOf(page, '박지훈')).toHaveText('-33,500원');
  await expect(netOf(page, '최유진')).toHaveText('-33,500원');
  await expect(netOf(page, '정다은')).toHaveText('-26,000원');
  await expect(netOf(page, '한도윤')).toHaveText('-26,000원');

  expect(await readTransfers(page)).toEqual([
    { from: '박지훈', to: '김민수', amount: '33,500원' },
    { from: '최유진', to: '김민수', amount: '33,500원' },
    { from: '정다은', to: '김민수', amount: '10,500원' },
    { from: '정다은', to: '이서연', amount: '15,500원' },
    { from: '한도윤', to: '이서연', amount: '26,000원' },
  ]);

  // 5번째 이후 참가자도 색이 있어야 한다 (골프 팔레트는 4색뿐이었다)
  for (const n of [4, 5]) {
    await expect(page.locator('.balance-card').nth(n).locator('.avatar')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await expect(page.getByText('240,000원').first()).toBeVisible();
});

test('3명으로 줄여도 정산되고, 2칸 밑으로는 지울 수 없다', async ({ page }) => {
  await openMeeting(page);
  const removeButtons = page.getByRole('button', { name: /^참가자 \d+ 삭제$/ });
  await expect(removeButtons).toHaveCount(4);

  await page.getByRole('button', { name: '참가자 4 삭제' }).click();
  await expect(nameInputs(page)).toHaveCount(3);
  await fillNames(page, ['김민수', '이서연', '박지훈']);
  await fillItem(page, 0, { name: '점심', amount: 30000, payers: ['김민수'] });
  await calcButton(page).click();
  expect(await readTransfers(page)).toEqual([
    { from: '이서연', to: '김민수', amount: '10,000원' },
    { from: '박지훈', to: '김민수', amount: '10,000원' },
  ]);

  await page.getByRole('button', { name: '참가자 3 삭제' }).click();
  await expect(nameInputs(page)).toHaveCount(2);
  await expect(removeButtons).toHaveCount(0);
});

test('이름을 고쳐도 결제 체크가 유지되고, 지운 사람은 체크 목록에서 빠진다', async ({ page }) => {
  await openMeeting(page);
  await fillNames(page, ['김민수', '이서연', '박지훈', '최유진']);
  await fillItem(page, 0, { name: '저녁', amount: 30000, payers: ['이서연'], excluded: ['최유진'] });

  await nameInputs(page).nth(1).fill('이서연B');
  const item = page.locator('.cost-item').first();
  await expect(item.locator('.checker-group').nth(0).getByLabel('이서연B', { exact: true })).toBeChecked();

  await page.getByRole('button', { name: '참가자 4 삭제' }).click();
  await expect(item.locator('.checker-group').nth(1).getByLabel('최유진', { exact: true })).toHaveCount(0);

  await calcButton(page).click();
  expect(await readTransfers(page)).toEqual([
    { from: '김민수', to: '이서연B', amount: '10,000원' },
    { from: '박지훈', to: '이서연B', amount: '10,000원' },
  ]);
});

test('같은 이름이 있으면 경고하고 계산 버튼이 막힌다', async ({ page }) => {
  await openMeeting(page);
  await fillNames(page, ['김민수', '김민수', '박지훈']);
  await fillItem(page, 0, { name: '저녁', amount: 30000, payers: ['박지훈'] });
  await expect(page.getByText(/이름이 겹칩니다/)).toBeVisible();
  await expect(calcButton(page)).toHaveClass(/disabled/);

  await nameInputs(page).nth(1).fill('김민수B');
  await expect(page.getByText(/이름이 겹칩니다/)).toHaveCount(0);
  await expect(calcButton(page)).not.toHaveClass(/disabled/);
});

test('저장하면 meetings에 한 건 남고, 저장 목록에서 다시 불러온다', async ({ page }) => {
  await openMeeting(page);
  await page.getByPlaceholder('예: 9월 동창회').fill('9월 동창회');
  await page.locator('input[type="date"]').fill('2026-09-24');
  await fillNames(page, ['김민수', '이서연', '박지훈', '최유진', '정다은']);
  await fillItem(page, 0, { name: '1차 저녁', amount: 100000, payers: ['김민수'] });

  await page.locator('.btn-save-bottom').click();
  await expect.poll(() => db.meetings.length).toBe(1);
  expect(db.meetings[0]).toMatchObject({
    user_id: USER.id,
    title: '9월 동창회',
    meeting_date: '2026-09-24',
    participants: ['김민수', '이서연', '박지훈', '최유진', '정다은'],
  });
  expect(db.meetings[0].items[0]).toMatchObject({ name: '1차 저녁', amount: 100000, payers: ['김민수'] });

  await page.getByTitle('초기화').click();
  await expect(nameInputs(page)).toHaveCount(4);
  await expect(page.getByPlaceholder('예: 9월 동창회')).toHaveValue('');

  await page.getByTitle('저장 목록').click();
  await page.locator('.history-item', { hasText: '9월 동창회' }).click();
  await expect(page.getByPlaceholder('예: 9월 동창회')).toHaveValue('9월 동창회');
  await expect(nameInputs(page)).toHaveCount(5);
  await expect(nameInputs(page).nth(4)).toHaveValue('정다은');
});

test('입력 중인 모임은 current_meeting에 남아 새로고침해도 이어진다', async ({ page }) => {
  await openMeeting(page);
  await fillNames(page, ['김민수', '이서연', '박지훈', '최유진', '정다은']);
  await expect.poll(() => db.current_meeting[0]?.data?.participants?.[4]).toBe('정다은');
  expect(db.current_meeting[0].user_id).toBe(USER.id);

  await page.reload();
  await openMeeting(page);
  await expect(nameInputs(page)).toHaveCount(5);
  await expect(nameInputs(page).nth(4)).toHaveValue('정다은');
});

test('골프 정산은 그대로다 — 참가자 4칸, 기본 항목명 4개, 인원 추가 버튼 없음', async ({ page }) => {
  await page.getByRole('button', { name: /골프 정산/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: '골프 정산' })).toBeVisible();
  await expect(nameInputs(page)).toHaveCount(4);
  await expect(addPersonButton(page)).toHaveCount(0);
  const itemNames = await page.getByPlaceholder('항목명 입력').evaluateAll(els => els.map(e => e.value));
  expect(itemNames).toEqual(['그린피 (카트비 포함)', '캐디피', '골프장 식음료', '외부 식사']);
});

test.describe('폰 화면 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('12명·3개 항목 정산까지 가로 스크롤이 생기지 않는다', async ({ page }) => {
    await page.screenshot({ path: test.info().outputPath('hub-mobile-390.png') });
    await openMeeting(page);
    await page.screenshot({ path: test.info().outputPath('meeting-mobile-390-top.png') });
    const people = ['김민수', '이서연', '박지훈', '최유진', '정다은', '한도윤',
      '오세훈', '윤하늘', '장수빈', '임재현', '서지우', '남궁예린'];
    await fillNames(page, people);
    await fillItem(page, 0, { name: '1차 삼겹살', amount: 360000, payers: ['김민수'] });
    await page.getByRole('button', { name: '+ 비용 항목 추가' }).click();
    await fillItem(page, 1, { name: '2차 노래방', amount: 120000, payers: ['이서연'], excluded: ['남궁예린', '서지우'] });
    await calcButton(page).click();
    await expect(page.locator('.transfer-row').first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('meeting-mobile-390.png'), fullPage: true });
  });
});
