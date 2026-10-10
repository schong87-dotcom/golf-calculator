// 앱 모음의 퀴즈게임 진입과 로그인 없는 첫 화면을 검증한다 (Supabase는 가짜)
import { test, expect } from '@playwright/test';
import { mockSupabase, seedSession } from './fake-supabase.mjs';

test('로그인 후 앱 모음에서 퀴즈게임 카드를 연다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);
  await page.goto('/');
  const link = page.getByRole('link', { name: /퀴즈게임/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/quiz/');
});

test('로그인하지 않고 /quiz/ 를 열면 입장코드로 참여하거나 앱 모음에서 로그인하라고 안내한다', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/quiz/');
  await expect(page).toHaveTitle('퀴즈게임');
  await expect(page.getByLabel('입장코드')).toBeVisible();
  await expect(page.getByRole('link', { name: '앱 모음에서 로그인' })).toHaveAttribute('href', '/');
  await page.getByLabel('입장코드').fill('123456');
  await page.getByRole('button', { name: '참여' }).click();
  await expect(page).toHaveURL(/\/quiz\/\?c=123456$/);
});
