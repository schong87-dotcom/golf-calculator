// 노션 비서(/assistant/) 브라우저 테스트. 서버 함수는 실제 코드, 노션과 구글은 가짜다. 시계는 2026-10-23(금) 09:00 한국 시각.
import { test, expect } from '@playwright/test';
import { mockSupabase, seedSession, GUEST } from './fake-supabase.mjs';
import { mockGoogle, mockAssistantApi } from './fake-google.mjs';
import { SOURCES } from '../../api/assistant.js';

const NOW = new Date('2026-10-23T09:00:00+09:00');
test.use({ timezoneId: 'Asia/Seoul', locale: 'ko-KR' });

const rows = (backend, source) => [...backend.pages.values()].filter((p) => p.parent.data_source_id === source && !p.in_trash);
const prop = (page, name) => {
  const p = page.properties[name];
  if (p?.title) return p.title.map((t) => t.text?.content ?? t.plain_text).join('');
  if (p?.rich_text) return p.rich_text.map((t) => t.text?.content ?? t.plain_text).join('');
  if (p?.select !== undefined) return p.select?.name ?? null;
  if (p && 'checkbox' in p) return p.checkbox;
  if (p && 'date' in p) return p.date;
  if (p?.relation) return p.relation.map((r) => r.id);
  return p;
};
const itemNamed = (backend, title) => rows(backend, SOURCES.items).find((p) => prop(p, '이름') === title);

async function open(page, { as = 'owner', google } = {}) {
  await page.clock.setFixedTime(NOW);
  await mockSupabase(page);
  await seedSession(page);
  const backend = await mockAssistantApi(page, { as, now: NOW });
  const g = await mockGoogle(page, google);
  await page.goto('/assistant/');
  return { backend, g };
}

test('앱 모음에 노션 비서 카드가 있다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /노션 비서/ })).toHaveAttribute('href', '/assistant/');
});

test('로그인하지 않았으면 앱 모음 로그인으로 안내한다', async ({ page }) => {
  await mockSupabase(page);
  await mockAssistantApi(page);
  await page.goto('/assistant/');
  await expect(page.getByRole('heading', { name: '앱 모음에서 로그인해 주세요' })).toBeVisible();
  await expect(page.getByRole('link', { name: '앱 모음에서 로그인' })).toHaveAttribute('href', '/');
});

test('주인이 아닌 계정은 막는다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page, GUEST);
  await mockAssistantApi(page, { as: 'guest' });
  await page.goto('/assistant/');
  await expect(page.getByRole('heading', { name: '주인 계정 전용입니다' })).toBeVisible();
});

test('처음 열면 노션에서 습관을 읽고 오늘 일간 기록을 만든다', async ({ page }) => {
  const { backend } = await open(page);
  await expect(page.getByText('10월 23일 금요일')).toBeVisible();
  await expect(page.getByRole('button', { name: /물 마시기/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /쉬는 습관/ })).toHaveCount(0);
  await expect.poll(() => rows(backend, SOURCES.days).map((d) => prop(d, '날짜'))).toEqual(['2026-10-23 (금)']);
});

test('한 줄 입력: 미리보기에 실제 날짜가 보이고, 추가하면 노션 일정이 되어 일정 탭에 뜬다', async ({ page }) => {
  const { backend } = await open(page);
  const input = page.getByLabel('빠른 입력');
  await input.fill('내일 오후 3시 치과 @강남');
  await expect(page.getByRole('radio', { name: /일정/ }).first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.nb-quick-preview')).toContainText('내일 15:00~16:00');
  await expect(page.locator('.nb-quick-preview')).toContainText('📍 강남');
  await input.press('Enter');
  await expect(page.getByRole('status')).toContainText('일정에 넣었어요');
  await expect.poll(() => itemNamed(backend, '치과') && prop(itemNamed(backend, '치과'), '날짜')).toEqual({ start: '2026-10-24T15:00:00+09:00', end: '2026-10-24T16:00:00+09:00' });
  const page1 = itemNamed(backend, '치과');
  expect(prop(page1, '종류')).toBe('일정');
  expect(prop(page1, '장소')).toBe('강남');
  await page.getByRole('button', { name: /일정/ }).last().click();
  await expect(page.locator('.nb-main')).toContainText('치과');
});

test('미리보기에서 종류를 바꾸면 그 종류로 들어간다', async ({ page }) => {
  const { backend } = await open(page);
  await page.getByLabel('빠른 입력').fill('제주도 한 달 살기');
  await page.locator('.nb-quick-preview').getByRole('radio', { name: /언젠가/ }).click();
  await page.getByRole('button', { name: '추가' }).click();
  await expect.poll(() => itemNamed(backend, '제주도 한 달 살기') && prop(itemNamed(backend, '제주도 한 달 살기'), '종류')).toBe('언젠가');
  await expect(page.locator('.nb-main')).toContainText('제주도 한 달 살기');
});

test('오늘 할 일을 체크하면 노션에 완료와 완료일이 들어가고 점수가 오른다', async ({ page }) => {
  const { backend } = await open(page);
  await page.getByLabel('빠른 입력').fill('오늘 보고서 제출 !');
  await page.getByLabel('빠른 입력').press('Enter');
  const check = page.getByRole('button', { name: '보고서 제출 완료' });
  await expect(check).toBeEnabled();
  await expect(page.getByRole('img', { name: '오늘 점수 0점' })).toBeVisible();
  await check.click();
  await expect.poll(() => prop(itemNamed(backend, '보고서 제출'), '완료')).toBe(true);
  expect(prop(itemNamed(backend, '보고서 제출'), '완료일')?.start).toMatch(/^2026-10-23T09:00/);
  expect(prop(itemNamed(backend, '보고서 제출'), '중요')).toBe(true);
  expect(prop(itemNamed(backend, '보고서 제출'), '사분면').length).toBe(1);
  await expect(page.getByRole('img', { name: '오늘 점수 60점' })).toBeVisible();
});

test('습관을 체크하면 노션 습관 기록이 생기고 일간 기록과 이어진다', async ({ page }) => {
  const { backend } = await open(page);
  await page.getByRole('button', { name: /물 마시기/ }).click();
  await expect(page.getByRole('button', { name: /물 마시기/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => rows(backend, SOURCES.habitLogs).length).toBe(1);
  const [log] = rows(backend, SOURCES.habitLogs);
  expect(prop(log, '기록')).toBe('💧 물 마시기 · 10/23');
  expect(prop(log, '일간 기록')).toEqual([rows(backend, SOURCES.days)[0].id]);
  await page.getByRole('button', { name: /습관/ }).last().click();
  await expect(page.getByRole('button', { name: '물 마시기 금요일 체크 해제' })).toBeVisible();
});

test('구글을 연결하면 양쪽을 맞춘다: 구글 일정과 할 일은 노션으로, 노션 일정은 구글 캘린더로', async ({ page }) => {
  const { backend, g } = await open(page, {
    google: {
      events: [{ id: 'g-lunch', summary: '점심 약속', start: { dateTime: '2026-10-23T12:00:00+09:00' }, end: { dateTime: '2026-10-23T13:00:00+09:00' }, location: '을지로' }],
      tasks: [{ id: 'g-milk', title: '우유 사기', status: 'needsAction' }],
    },
  });
  await page.getByLabel('빠른 입력').fill('내일 오후 3시 치과');
  await page.getByLabel('빠른 입력').press('Enter');
  await expect.poll(() => Boolean(itemNamed(backend, '치과'))).toBe(true);

  await page.getByRole('button', { name: '구글 연결' }).first().click();
  await expect(page.getByRole('status')).toContainText('구글과 맞췄어요');

  const lunch = itemNamed(backend, '점심 약속');
  expect(prop(lunch, '출처')).toBe('구글 캘린더');
  expect(prop(lunch, '구글 캘린더 ID')).toBe('g-lunch');
  expect(prop(lunch, '장소')).toBe('을지로');
  expect(prop(itemNamed(backend, '우유 사기'), '출처')).toBe('구글 할 일');
  const dentist = g.events.find((e) => e.summary === '치과');
  expect(dentist.start.dateTime).toBe('2026-10-24T15:00:00+09:00');
  expect(dentist.extendedProperties.private.notionPageId).toBe(itemNamed(backend, '치과').id.replaceAll('-', ''));
  expect(prop(itemNamed(backend, '치과'), '구글 캘린더 ID')).toBe(dentist.id);
  await expect(page.locator('.nb-main')).toContainText('점심 약속');

  // 다시 동기화해도 두 번 만들지 않는다
  await page.locator('.nb-sync').click();
  await expect(page.getByRole('status')).toContainText(/구글과 이미 같아요|구글과 맞췄어요/);
  expect(g.events.filter((e) => e.summary === '치과')).toHaveLength(1);
  expect(rows(backend, SOURCES.items).filter((p) => prop(p, '이름') === '점심 약속')).toHaveLength(1);
});

test('구글이 연결된 상태에서 할 일을 적고 끝내면 구글 할 일도 완료가 된다', async ({ page }) => {
  const { backend, g } = await open(page);
  await page.getByRole('button', { name: '구글 연결' }).first().click();
  await expect(page.getByRole('status')).toContainText(/구글과/);
  await page.getByLabel('빠른 입력').fill('오늘 은행 들르기');
  await page.getByLabel('빠른 입력').press('Enter');
  await expect.poll(() => g.tasks.find((t) => t.title === '은행 들르기')?.due).toBe('2026-10-23T00:00:00.000Z');
  await expect.poll(() => prop(itemNamed(backend, '은행 들르기'), '구글 할 일 ID')).toMatch(/^task/);
  await page.getByRole('button', { name: '은행 들르기 완료' }).click();
  await expect.poll(() => g.tasks.find((t) => t.title === '은행 들르기').status).toBe('completed');
});

test('항목을 열어 고치고, 삭제는 되돌릴 수 있고 5초 뒤 노션 휴지통으로 간다', async ({ page }) => {
  const { backend } = await open(page);
  await page.getByLabel('빠른 입력').fill('메모: 회사 와이파이 비번 jabez1234');
  await page.getByLabel('빠른 입력').press('Enter');
  await page.getByRole('button', { name: /정보/ }).last().click();
  await page.getByRole('button', { name: /회사 와이파이 비번/ }).click();
  await page.getByLabel('메모').fill('3층 회의실은 jabez-5G');
  await page.getByRole('button', { name: '저장' }).click();
  await expect.poll(() => prop(itemNamed(backend, '회사 와이파이 비번 jabez1234'), '메모')).toBe('3층 회의실은 jabez-5G');

  await page.getByRole('button', { name: /회사 와이파이 비번/ }).click();
  await page.getByRole('button', { name: '삭제' }).click();
  await expect(page.locator('.nb-main')).not.toContainText('회사 와이파이');
  await page.getByRole('button', { name: '되돌리기' }).click();
  await expect(page.locator('.nb-main')).toContainText('회사 와이파이');
  await page.getByRole('button', { name: /회사 와이파이 비번/ }).click();
  await page.getByRole('button', { name: '삭제' }).click();
  await expect.poll(() => itemNamed(backend, '회사 와이파이 비번 jabez1234'), { timeout: 9000 }).toBeUndefined();
});

test('밀린 할 일은 오늘 화면 맨 위에 모이고 「모두 오늘로」로 옮긴다', async ({ page }) => {
  const { backend } = await open(page);
  await page.getByLabel('빠른 입력').fill('10월 20일 세금계산서 발행');
  await page.getByLabel('빠른 입력').press('Enter');
  await expect.poll(() => Boolean(itemNamed(backend, '세금계산서 발행'))).toBe(true);
  await page.getByRole('button', { name: /오늘/ }).last().click();
  const section = page.locator('.nb-section.tone-warn');
  await expect(section).toContainText('세금계산서 발행');
  await expect(section).toContainText('3일 지남');
  await section.getByRole('button', { name: '모두 오늘로' }).click();
  await expect.poll(() => prop(itemNamed(backend, '세금계산서 발행'), '날짜')?.start).toBe('2026-10-23');
});

test('노션 「앱에서 보기」 링크(?item=)로 열면 그 항목 편집 창이 뜬다', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockSupabase(page);
  await seedSession(page);
  const backend = await mockAssistantApi(page, { now: NOW });
  await mockGoogle(page);
  const item = backend.put(SOURCES.items, { '이름': { title: [{ text: { content: '노션에서 만든 일' } }] }, '종류': { select: { name: '할 일' } } });
  await page.goto(`/assistant/?item=${item.id.replaceAll('-', '')}`);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('제목')).toHaveValue('노션에서 만든 일');
});

test('휴대폰 너비에서 가로로 넘치지 않고 아래 탭 여섯 개가 다 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByText('10월 23일 금요일')).toBeVisible();
  const width = await page.evaluate(() => ({ body: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
  expect(width.body).toBeLessThanOrEqual(width.view);
  for (const label of ['오늘', '일정', '할 일', '언젠가', '정보', '습관']) {
    await expect(page.locator('.nb-nav').getByRole('button', { name: new RegExp(label) })).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/assistant-mobile.png', fullPage: true });
});
