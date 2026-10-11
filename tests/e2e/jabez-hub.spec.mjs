// 앱 모음 맨 아래 카드가 쟈베스 업무관리 시스템 배포 주소로 이어지는지 검증한다 (Supabase는 가짜)
import { test, expect } from '@playwright/test';
import { mockSupabase, seedSession } from './fake-supabase.mjs';

test('앱 모음 맨 아래 카드로 쟈베스 업무관리 시스템을 연다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);
  await page.goto('/');
  const last = page.locator('.hub-cards > .hub-card').last();
  await expect(last).toContainText('쟈베스 업무관리 시스템');
  await expect(last).toHaveAttribute('href', 'https://jabez-workspace.vercel.app/');
  await expect(last.locator('.hub-card-icon')).toHaveText('💼');
});
