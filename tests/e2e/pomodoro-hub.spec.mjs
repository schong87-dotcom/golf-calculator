// 앱 모음의 뽀모도로 진입과 모바일 표시를 검증한다.
import { test, expect } from '@playwright/test';
import { mockSupabase, seedSession } from './fake-supabase.mjs';

test('로그인 후 앱 모음에서 뽀모도로 타이머를 연다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);
  await page.goto('/');

  const timerLink = page.getByRole('link', { name: /뽀모도로 타이머/ });
  await expect(timerLink).toBeVisible();
  await expect(timerLink).toHaveAttribute('href', '/pomodoro/');
  await timerLink.click();
  await expect(page).toHaveTitle('뽀모도로 타이머');
  await expect(page.locator('#time-display')).toHaveText('25:00');
});

test('모바일에서 타이머 경로가 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pomodoro/');
  await expect(page).toHaveTitle('뽀모도로 타이머');

  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
});
