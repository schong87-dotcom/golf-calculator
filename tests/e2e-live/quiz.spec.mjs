// 퀴즈게임 전체 흐름을 실제 Supabase로 검증한다: 강사 1명이 퀴즈를 만들어 진행하고 수강생 5명이 폰 화면으로 참여한다
import { test, expect } from '@playwright/test';
import { makeHost, cleanupTestUsers, countTestUsers, STORAGE_KEY } from '../quiz-live.mjs';

test.describe.configure({ mode: 'serial' });
test.afterAll(() => {
  cleanupTestUsers();
  expect(countTestUsers()).toBe(0);
});

const NAMES = ['가영', '나래', '다솜', '라희', '마루'];
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

// 정답 유출 검사용: 수강생 화면이 받은 RPC 응답 본문을 모은다.
// 검사는 「그 문제 문장이 든 응답」만 본다 — 시각으로 자르면 앞 문제의 공개 화면 응답이 섞인다
const bodies = [];
const bodiesWith = prompt => bodies.filter(b => b.text.includes(prompt)).map(b => b.text);

async function phone(browser) {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  page.on('response', async r => {
    if (!r.url().includes('/rest/v1/rpc/')) return;
    try { bodies.push({ text: await r.text() }); } catch { /* 닫힌 페이지 */ }
  });
  return page;
}

async function choose(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: '제출' }).click();
  await expect(page.getByText('제출했습니다')).toBeVisible();
}

async function writeAnswers(page, values) {
  for (const [i, v] of values.entries()) await page.getByLabel(`답 ${i + 1}`, { exact: true }).fill(v);
  await page.getByRole('button', { name: '제출' }).click();
  await expect(page.getByText('제출했습니다')).toBeVisible();
}

const names = (page, id) => page.getByTestId(id).getByRole('listitem');
const rows = (page, id) => page.getByTestId(id).locator('[data-name]').evaluateAll(
  els => els.map(e => [e.dataset.rank, e.dataset.name, e.dataset.value]),
);

test('강사가 4유형 퀴즈를 만들고 수강생 5명이 QR 주소로 참여해 끝까지 진행한다', async ({ browser }) => {
  test.setTimeout(300_000);
  const host = await makeHost('e2e');
  const hostCtx = await browser.newContext();
  await hostCtx.addInitScript(
    ([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); },
    [STORAGE_KEY, JSON.stringify(host.session)],
  );
  const h = await hostCtx.newPage();

  await test.step('R1 R4 — 편집기로 4유형 문제를 만들고 저장, 새로고침 뒤 그대로', async () => {
    await h.goto('/quiz/');
    await expect(h.getByRole('heading', { name: '내 퀴즈' })).toBeVisible();
    await h.getByRole('button', { name: '새 퀴즈 만들기' }).click();
    await h.getByLabel('퀴즈 제목').fill('E2E 퀴즈');

    await h.getByRole('button', { name: '+ 객관식' }).click();
    const q1 = h.getByRole('region', { name: '1번 문제' });
    await q1.getByLabel('문제', { exact: true }).fill('대한민국 수도는?');
    for (const [i, v] of ['서울', '부산', '대구', '광주'].entries()) {
      await q1.getByLabel(`${i + 1}번 보기`, { exact: true }).fill(v);
    }
    await q1.getByRole('button', { name: '+ 보기 추가' }).click();
    await q1.getByLabel('5번 보기', { exact: true }).fill('인천');
    await q1.getByLabel('1번 보기 정답').check();

    await h.getByRole('button', { name: '+ 예/아니오' }).click();
    const q2 = h.getByRole('region', { name: '2번 문제' });
    await q2.getByLabel('문제', { exact: true }).fill('지구는 둥글다');
    await q2.getByLabel('예', { exact: true }).check();

    await h.getByRole('button', { name: '+ 주관식' }).click();
    const q3 = h.getByRole('region', { name: '3번 문제' });
    await q3.getByLabel('문제', { exact: true }).fill('미국 최대 도시는?');
    await q3.getByRole('button', { name: '+ 정답 추가' }).click();
    await q3.getByLabel('정답 1', { exact: true }).fill('뉴욕');
    await q3.getByLabel('정답 1 다른 표기').fill('New York, NYC, 빅애플');

    await h.getByRole('button', { name: '+ 목록형' }).click();
    const q4 = h.getByRole('region', { name: '4번 문제' });
    await q4.getByLabel('문제', { exact: true }).fill('세계 관광도시를 쓰세요');
    await q4.getByLabel('입력칸 수').fill('4');
    for (const [i, [v, alias]] of [['파리', 'Paris'], ['런던', ''], ['뉴욕', ''], ['도쿄', ''], ['바르셀로나', '']].entries()) {
      await q4.getByRole('button', { name: '+ 정답 추가' }).click();
      await q4.getByLabel(`정답 ${i + 1}`, { exact: true }).fill(v);
      if (alias) await q4.getByLabel(`정답 ${i + 1} 다른 표기`).fill(alias);
    }

    await h.getByRole('button', { name: '저장', exact: true }).click();
    await expect(h.getByText('저장했습니다')).toBeVisible();
    await expect(h).toHaveURL(/\?edit=[0-9a-f-]{36}$/);

    await h.reload();
    const r1 = h.getByRole('region', { name: '1번 문제' });
    await expect(r1.getByLabel('5번 보기', { exact: true })).toHaveValue('인천');
    await expect(r1.getByLabel('1번 보기 정답')).toBeChecked();
    await expect(h.getByRole('region', { name: '2번 문제' }).getByLabel('예', { exact: true })).toBeChecked();
    await expect(h.getByRole('region', { name: '3번 문제' }).getByLabel('정답 1 다른 표기')).toHaveValue('New York, NYC, 빅애플');
    await expect(h.getByRole('region', { name: '4번 문제' }).getByLabel('입력칸 수')).toHaveValue('4');
    await expect(h.getByRole('region', { name: '4번 문제' }).getByLabel('정답 5', { exact: true })).toHaveValue('바르셀로나');
  });

  let joinUrl;
  await test.step('R2 — 진행 시작하면 QR과 6자리 입장코드', async () => {
    await h.getByRole('button', { name: '목록으로' }).click();
    const row = h.getByRole('listitem').filter({ hasText: 'E2E 퀴즈' });
    await expect(row).toContainText('문제 4개');
    await row.getByRole('button', { name: '진행 시작' }).click();
    joinUrl = await h.getByTestId('join-url').textContent();
    expect(joinUrl).toMatch(/\/quiz\/\?c=[0-9]{6}$/);
    await expect(h.getByTestId('join-qr')).toHaveAttribute('data-value', joinUrl);
    await expect(h.getByTestId('join-qr').locator('svg')).toBeVisible();
    await expect(h.getByText(`입장코드 ${joinUrl.slice(-6)}`)).toBeVisible();
  });

  const P = {};
  await test.step('R3 — QR 주소로 들어와 이름 입력, 새로고침 유지, 같은 이름 거절', async () => {
    for (const n of NAMES) {
      P[n] = await phone(browser);
      await P[n].goto(joinUrl);
      await P[n].getByLabel('이름').fill(n);
      await P[n].getByRole('button', { name: '입장' }).click();
      await expect(P[n].getByText(`${n}님, 곧 시작합니다`)).toBeVisible();
    }
    await expect(h.getByText('참가 5명')).toBeVisible();
    await expect(names(h, 'lobby-names')).toHaveText(NAMES);

    await P['가영'].reload();
    await expect(P['가영'].getByText('가영님, 곧 시작합니다')).toBeVisible();

    const dup = await phone(browser);
    await dup.goto(joinUrl);
    await dup.getByLabel('이름').fill('가영');
    await dup.getByRole('button', { name: '입장' }).click();
    await expect(dup.getByText('이미 있는 이름입니다')).toBeVisible();
    await dup.context().close();
  });

  await test.step('R4 R9 — 객관식 5지선다, 마감, 공개, 맞춘 사람과 틀린 사람 명단', async () => {
    await h.getByRole('button', { name: '첫 문제 시작' }).click();
    for (const n of NAMES) await expect(P[n].getByText('대한민국 수도는?')).toBeVisible();
    await expect(P['가영'].getByRole('button', { name: '인천', exact: true })).toBeVisible();
    for (const n of ['가영', '나래', '다솜']) await choose(P[n], '서울');
    await choose(P['라희'], '부산');
    await expect(h.getByText('응답 4 / 5')).toBeVisible();

    await h.getByRole('button', { name: '마감' }).click();
    await expect(P['마루'].getByText('마감되었습니다')).toBeVisible();
    // 수집이 헛돌지 않는지(5명 분 이상 잡혔는지) 보고, 공개 전 응답에 정답 표시가 없는지 본다
    const q1 = bodiesWith('대한민국 수도는?');
    expect(q1.length).toBeGreaterThanOrEqual(5);
    expect(q1.join('\n')).not.toContain('"correct"');

    await h.getByRole('button', { name: '정답 공개' }).click();
    await expect(names(h, 'names-correct')).toHaveText(['가영', '나래', '다솜']);
    await expect(names(h, 'names-wrong')).toHaveText(['라희']);
    await expect(names(h, 'names-none')).toHaveText(['마루']);
    await expect(P['가영'].getByText('정답!')).toBeVisible();
    await expect(P['가영'].getByText('+1점')).toBeVisible();
    await expect(P['라희'].getByText('오답')).toBeVisible();
  });

  await test.step('R5 — 예/아니오, 진행 중 강사 새로고침해도 이어짐', async () => {
    await h.getByRole('button', { name: '다음 문제' }).click();
    for (const n of ['가영', '나래', '라희', '마루']) {
      await expect(P[n].getByText('지구는 둥글다')).toBeVisible();
      await choose(P[n], '예');
    }
    await choose(P['다솜'], '아니오');
    await h.reload();
    await expect(h.getByText('지구는 둥글다')).toBeVisible();
    await expect(h.getByText('응답 5 / 5')).toBeVisible();
    await h.getByRole('button', { name: '정답 공개' }).click();
    await expect(names(h, 'names-correct')).toHaveText(['가영', '나래', '라희', '마루']);
    await expect(names(h, 'names-wrong')).toHaveText(['다솜']);
  });

  await test.step('R6 R8 — 주관식은 띄어쓰기와 대소문자 무시, 공개 전 별칭 유출 없음', async () => {
    await h.getByRole('button', { name: '다음 문제' }).click();
    const typed = { 가영: '뉴 욕', 나래: 'new york', 다솜: '서울', 라희: 'nyc', 마루: '보스턴' };
    for (const [n, v] of Object.entries(typed)) {
      await expect(P[n].getByText('미국 최대 도시는?')).toBeVisible();
      await writeAnswers(P[n], [v]);
    }
    await h.getByRole('button', { name: '마감' }).click();
    await expect(h.getByTestId('unmatched')).toContainText('서울');
    await expect(h.getByTestId('unmatched')).toContainText('보스턴');
    const q3 = bodiesWith('미국 최대 도시는?');
    expect(q3.length).toBeGreaterThanOrEqual(5);
    expect(q3.join('\n')).not.toContain('빅애플');
    expect(q3.join('\n')).not.toContain('"correct"');

    await h.getByRole('button', { name: '정답 공개' }).click();
    await expect(names(h, 'names-correct')).toHaveText(['가영', '나래', '라희']);
    await expect(names(h, 'names-wrong')).toHaveText(['다솜', '마루']);
  });

  await test.step('R7 — 목록형, 같은 답 중복은 1개, 강사 원클릭 인정 뒤 재채점', async () => {
    await h.getByRole('button', { name: '다음 문제' }).click();
    await expect(P['가영'].getByLabel('답 4', { exact: true })).toBeVisible();
    await writeAnswers(P['가영'], ['파리', 'paris', '런던', '서울']);
    await writeAnswers(P['나래'], ['뉴 욕', '도쿄']);
    await writeAnswers(P['다솜'], ['서울']);
    await writeAnswers(P['마루'], ['런던']);
    await h.getByRole('button', { name: '마감' }).click();
    await expect(h.getByTestId('unmatched')).toContainText('서울 2명');
    const q4 = bodiesWith('세계 관광도시를 쓰세요');
    expect(q4.length).toBeGreaterThanOrEqual(5);
    expect(q4.join('\n')).not.toContain('바르셀로나');

    await h.getByRole('button', { name: '정답 공개' }).click();
    // 공개 뒤에는 같은 수집 방법으로 정답이 잡힌다 (검사 방법이 실제로 잡아낼 수 있다는 확인)
    await expect.poll(() => bodiesWith('세계 관광도시를 쓰세요').join('\n')).toContain('바르셀로나');
    // 맞춘 개수 순, 같으면 먼저 낸 사람. 라희는 미응답이라 빠진다
    await expect.poll(() => rows(h, 'list-ranking')).toEqual([
      ['1', '가영', '2'], ['2', '나래', '2'], ['3', '마루', '1'], ['4', '다솜', '0'],
    ]);

    await h.getByTestId('unmatched').getByRole('listitem').filter({ hasText: '서울' })
      .getByRole('button', { name: '새 정답으로 인정' }).click();
    await expect.poll(async () => (await rows(h, 'list-ranking')).find(r => r[1] === '가영')[2]).toBe('3');
    await expect(h.getByTestId('unmatched')).not.toContainText('서울');
    await expect(P['가영'].getByText('+3점')).toBeVisible();
    await expect(P['가영'].getByText('맞춘 답 파리, 런던, 서울 (3개)')).toBeVisible();
  });

  await test.step('R10 — 최종 순위, 동점은 공동 순위, 수강생 폰에 내 점수와 순위', async () => {
    await h.getByRole('button', { name: '최종 결과' }).click();
    await expect.poll(() => rows(h, 'final-ranking')).toEqual([
      ['1', '가영', '6'], ['2', '나래', '5'], ['3', '다솜', '2'], ['3', '라희', '2'], ['3', '마루', '2'],
    ]);
    await expect(P['라희'].getByText('퀴즈가 끝났습니다')).toBeVisible();
    await expect(P['라희'].getByText('내 점수 2점')).toBeVisible();
    await expect(P['라희'].getByText('5명 중 3위')).toBeVisible();
    await expect(P['가영'].getByText('5명 중 1위')).toBeVisible();
  });

  await test.step('수강생 폰 화면은 가로로 넘치지 않는다', async () => {
    const over = await P['가영'].evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
