// 앱 모음의 유튜브 다운로더 카드가 이 맥에서 도는 다운로더 주소로 이어지는지 검증한다 (Supabase는 가짜)
import { test, expect } from '@playwright/test';
import { mockSupabase, seedSession } from './fake-supabase.mjs';

test('앱 모음에서 유튜브 다운로더 카드로 이 맥의 다운로더를 연다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);
  await page.goto('/');
  const card = page.locator('.hub-cards > .hub-card', { hasText: '유튜브 다운로더' });
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('href', 'http://127.0.0.1:8777/');
  await expect(card).toContainText('이 맥');
  // 개인 도구 묶음 끝, 회사 시스템(쟈베스) 바로 위에 둔다
  const cards = page.locator('.hub-cards > .hub-card');
  const n = await cards.count();
  await expect(cards.nth(n - 2)).toContainText('유튜브 다운로더');
});
