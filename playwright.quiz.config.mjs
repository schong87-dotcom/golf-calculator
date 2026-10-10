// 퀴즈게임 실DB E2E 설정. 실제 Supabase에 테스트 강사(익명, quiz_test 표식)를 만들고 끝나면 지운다 (npm run test:quiz)
import { defineConfig, devices } from '@playwright/test';

const PORT = 5198;

export default defineConfig({
  testDir: './tests/e2e-live',
  timeout: 300_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
