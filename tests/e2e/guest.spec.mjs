// 「비회원으로 입장하기」(Supabase 익명 로그인)를 실제 브라우저로 눌러 네 앱을 로그인 없이 쓸 수 있는지 검증한다
// Supabase는 fake-supabase.mjs가 가짜로 대체한다. 게임 화면만 CDN(Tailwind·supabase-js)을 실제로 내려받는다.
import { test, expect } from '@playwright/test';
import { USER, GUEST, mockSupabase, seedSession } from './fake-supabase.mjs';

const googleButton = page => page.getByRole('button', { name: /구글로 로그인/ });
const guestButton = page => page.getByRole('button', { name: /비회원으로 입장하기/ });
const hubUserName = page => page.locator('.hub-user-name');

async function enterAsGuest(page) {
  await guestButton(page).click();
  await expect(page.getByRole('heading', { name: '어떤 앱을 여시겠어요?' })).toBeVisible();
}

test('로그인 화면에 구글 로그인과 「비회원으로 입장하기」가 함께 있다', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');
  await expect(googleButton(page)).toBeVisible();
  await expect(guestButton(page)).toBeVisible();
});

test('비회원으로 입장하면 구글 로그인 없이 허브가 열리고 이름은 「비회원」이다', async ({ page }) => {
  const db = await mockSupabase(page);
  await page.goto('/');
  await enterAsGuest(page);
  await expect(hubUserName(page)).toHaveText('비회원');
  expect(db.signups).toBe(1);
  await expect(page.getByRole('button', { name: /골프 정산/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /모임 정산/ })).toBeVisible();
});

test('비회원도 모임 정산을 저장하면 자기 익명 계정으로 저장된다', async ({ page }) => {
  const db = await mockSupabase(page);
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await enterAsGuest(page);

  await page.getByRole('button', { name: /모임 정산/ }).click();
  const names = page.getByPlaceholder('이름 입력', { exact: true });
  await names.nth(0).fill('김민수');
  await names.nth(1).fill('이서연');
  await page.getByPlaceholder('항목명 입력').fill('저녁');
  await page.getByPlaceholder('금액 입력').fill('20000');
  await page.locator('.cost-item .checker-group').nth(0).getByLabel('김민수', { exact: true }).check();
  await page.getByRole('button', { name: /정산 계산하기/ }).click();
  await expect(page.locator('.transfer-amount-badge')).toHaveText('10,000원');

  await page.locator('.btn-save-bottom').click();
  await expect.poll(() => db.meetings.length).toBe(1);
  expect(db.meetings[0].user_id).toBe(GUEST.id);
  await expect.poll(() => db.current_meeting[0]?.user_id).toBe(GUEST.id);
});

test('비회원도 골프 정산을 쓰고, 작업본이 익명 계정으로 저장된다', async ({ page }) => {
  const db = await mockSupabase(page);
  await page.goto('/');
  await enterAsGuest(page);
  await page.getByRole('button', { name: /골프 정산/ }).click();
  await expect(page.getByPlaceholder('이름 입력', { exact: true })).toHaveCount(4);
  await page.getByPlaceholder('이름 입력', { exact: true }).first().fill('박지훈');
  await expect.poll(() => db.current_round[0]?.user_id).toBe(GUEST.id);
});

test('새로고침해도 비회원 상태가 이어진다 (다시 가입하지 않는다)', async ({ page }) => {
  const db = await mockSupabase(page);
  await page.goto('/');
  await enterAsGuest(page);
  await page.reload();
  await expect(hubUserName(page)).toHaveText('비회원');
  expect(db.signups).toBe(1);
});

test('비회원이 로그아웃하면 경고가 뜨고, 취소하면 남고 확인하면 로그인 화면으로 간다', async ({ page }) => {
  const db = await mockSupabase(page);
  await page.goto('/');
  await enterAsGuest(page);

  let message = '';
  page.once('dialog', d => { message = d.message(); d.dismiss(); });
  await page.getByRole('button', { name: /로그아웃/ }).click();
  await expect.poll(() => message).toMatch(/비회원은 로그아웃하면/);
  await expect(hubUserName(page)).toHaveText('비회원');
  expect(db.logouts).toBe(0);

  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: /로그아웃/ }).click();
  await expect(guestButton(page)).toBeVisible();
  expect(db.logouts).toBe(1);
});

test('구글 사용자는 로그아웃할 때 지금처럼 확인창 없이 나간다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page, USER);
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto('/');
  await expect(hubUserName(page)).toHaveText('테스트 사용자');
  await page.getByRole('button', { name: /로그아웃/ }).click();
  await expect(googleButton(page)).toBeVisible();
  expect(dialogs).toEqual([]);
});

test('비회원으로 재무제표 게임에 들어가면 허브로 튕기지 않고 「비회원」으로 표시된다', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');
  await enterAsGuest(page);
  await page.getByRole('link', { name: /재무제표 학습 게임/ }).click();

  await expect(page.getByRole('heading', { name: '게임 모드를 선택하세요' })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/game\/?$/);
  await expect(page.getByText('비회원', { exact: true })).toBeVisible();

  await page.locator('#btn-logout').click();
  await expect(page.getByText(/비회원은 로그아웃하면/)).toBeVisible();
});

test('Supabase에서 익명 로그인이 꺼져 있으면 오류를 보여 주고 로그인 화면에 남는다', async ({ page }) => {
  await mockSupabase(page, { anonymousEnabled: false });
  await page.goto('/');
  await guestButton(page).click();
  await expect(page.getByText(/비회원 입장에 실패했습니다/)).toBeVisible();
  await expect(guestButton(page)).toBeEnabled();
  await expect(googleButton(page)).toBeVisible();
});
