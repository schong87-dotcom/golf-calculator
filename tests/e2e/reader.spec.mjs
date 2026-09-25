// 이북리더기(public/reader) 의 PDF·쪽 넘김·목차·이어 읽기·메모·드라이브 저장을 폰 화면에서 확인하는 E2E.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const READER = '/reader/index.html';
const PDF_FIXTURE = new URL('./fixtures/reader-sample.pdf', import.meta.url);

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

function longMarkdown() {
  const paragraph = '재무제표는 기업의 언어다. 숫자 뒤에 있는 이야기를 읽는 연습을 한다. '.repeat(6).trim();
  const parts = ['# 테스트 책'];
  for (let chapter = 1; chapter <= 6; chapter += 1) {
    parts.push(`## ${chapter}장 제목 ${chapter}`);
    for (let index = 0; index < 5; index += 1) parts.push(paragraph);
  }
  return parts.join('\n\n');
}

async function openBook(page, name = '재무제표 쉽게 읽기.md', content = longMarkdown()) {
  await page.goto(READER);
  await page.setInputFiles('#file-input', { name, mimeType: 'text/markdown', buffer: Buffer.from(content) });
  await expect(page.locator('#file-name')).toHaveText(name);
  await expect(page.locator('#page-indicator')).toHaveText(/^1 \/ \d+$/);
}

async function openPdf(page) {
  await page.goto(READER);
  await page.setInputFiles('#file-input', { name: '재무제표 요약.pdf', mimeType: 'application/pdf', buffer: readFileSync(PDF_FIXTURE) });
  await expect(page.locator('#page-indicator')).toHaveText('1 / 3', { timeout: 20_000 });
  await expect(page.locator('#pdf-stage .textLayer')).toContainText('재무상태표', { timeout: 20_000 });
}

async function pageCount(page) {
  return Number((await page.locator('#page-indicator').textContent()).split('/')[1]);
}

async function tapZone(page, fx, fy) {
  const box = await page.locator('#page-viewport').boundingBox();
  await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
}

// 현재 쪽에 보이는 문단에서 앞쪽 몇 글자의 화면 좌표를 구한다.
async function visibleTextSpan(page, rootSelector, chars = 12) {
  return page.evaluate(({ rootSelector, chars }) => {
    const viewport = document.querySelector('#page-viewport').getBoundingClientRect();
    const walker = document.createTreeWalker(document.querySelector(rootSelector), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent.trim().length < chars + 2) continue;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, chars);
      const rect = range.getClientRects()[0];
      if (rect && rect.left >= viewport.left && rect.right <= viewport.right && rect.top > viewport.top && rect.bottom < viewport.bottom) {
        return { x1: rect.left + 2, x2: rect.right - 2, y: rect.top + rect.height / 2, text: range.toString() };
      }
    }
    return null;
  }, { rootSelector, chars });
}

// PDF 텍스트 레이어는 단어마다 따로 있으므로, 본문 첫 줄의 첫 단어에서 넷째 단어 끝까지 잡는다.
async function pdfLineSpan(page) {
  return page.evaluate(() => {
    const spans = [...document.querySelectorAll('#pdf-stage .textLayer span')].filter(span => span.textContent.trim());
    const firstBody = spans.find(span => span.textContent.startsWith('재무상태표는'));
    const line = spans.filter(span => Math.abs(span.getBoundingClientRect().top - firstBody.getBoundingClientRect().top) < 2);
    const a = line[0].getBoundingClientRect();
    const b = line[3].getBoundingClientRect();
    return { x1: a.left + 2, x2: b.right - 2, y: a.top + a.height / 2, text: line.slice(0, 4).map(span => span.textContent).join(' ') };
  });
}

// 글자 위에서 눌러 0.6초 동안 천천히 끈다(메모). 시간이 판정 기준이라 실제로 기다린다.
async function slowDrag(page, span, { ms = 600, dy = 0 } = {}) {
  const steps = 12;
  await page.mouse.move(span.x1, span.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.waitForTimeout(ms / steps);
    await page.mouse.move(span.x1 + ((span.x2 - span.x1) * step) / steps, span.y + (dy * step) / steps);
  }
  await page.mouse.up();
}

// 기다림 없이 휙 넘긴다.
async function flick(page, fromX, toX, y) {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  for (let step = 1; step <= 4; step += 1) await page.mouse.move(fromX + ((toX - fromX) * step) / 4, y);
  await page.mouse.up();
}

async function storedMemos(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(name => name.startsWith('ebook-reader-memos:'));
    return key ? JSON.parse(localStorage.getItem(key)).memos : [];
  });
}

test('pdf opens, renders korean text and turns pages', async ({ page }) => {
  await openPdf(page);
  const inked = await page.evaluate(() => {
    const canvas = document.querySelector('#pdf-stage canvas');
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index] < 128 && data[index + 3] > 0) dark += 1;
    return { width: canvas.width, dark };
  });
  expect(inked.width).toBeGreaterThan(200);
  expect(inked.dark).toBeGreaterThan(100);

  await tapZone(page, 0.9, 0.5);
  await expect(page.locator('#page-indicator')).toHaveText('2 / 3');
  await expect(page.locator('#pdf-stage .textLayer')).toContainText('손익계산서');
  await tapZone(page, 0.1, 0.5);
  await expect(page.locator('#page-indicator')).toHaveText('1 / 3');

  await page.locator('#toc-toggle').click();
  await expect(page.locator('#toc-dialog .toc-list button')).toHaveText([/1장 재무상태표/, /2장 손익계산서/, /3장 현금흐름표/]);
  await page.locator('#toc-dialog .toc-list button', { hasText: '3장 현금흐름표' }).click();
  await expect(page.locator('#page-indicator')).toHaveText('3 / 3');
  await expect(page.locator('#pdf-stage .textLayer')).toContainText('현금흐름표는');
});

test('pdf text can be highlighted', async ({ page }) => {
  await openPdf(page);
  const span = await pdfLineSpan(page);
  await slowDrag(page, span);
  await expect(page.locator('#pdf-stage .textLayer mark.memo-mark').first()).toBeVisible();
  await expect(page.locator('#memo-dialog')).toBeVisible();
  const memos = await storedMemos(page);
  expect(memos).toHaveLength(1);
  expect(memos[0].page).toBe(0);
  expect(memos[0].where).toBe('p.1');
  expect(memos[0].text.startsWith('재무상태표는')).toBe(true);
  expect(memos[0].text.length).toBeGreaterThanOrEqual(10);

  await page.locator('#memo-done').click();
  await tapZone(page, 0.9, 0.5);
  await expect(page.locator('#page-indicator')).toHaveText('2 / 3');
  await expect(page.locator('#pdf-stage .textLayer')).toContainText('손익계산서');
  await expect(page.locator('#pdf-stage mark.memo-mark')).toHaveCount(0);
  await tapZone(page, 0.1, 0.5);
  await expect(page.locator('#pdf-stage mark.memo-mark').first()).toBeVisible();
});

test('tapping page edges turns pages without scrolling', async ({ page }) => {
  await openBook(page);
  expect(await pageCount(page)).toBeGreaterThan(3);
  const indicator = page.locator('#page-indicator');
  await tapZone(page, 0.9, 0.5);
  await expect(indicator).toHaveText(/^2 \//);
  await tapZone(page, 0.1, 0.5);
  await expect(indicator).toHaveText(/^1 \//);
  await tapZone(page, 0.5, 0.92);
  await expect(indicator).toHaveText(/^2 \//);
  await tapZone(page, 0.5, 0.08);
  await expect(indicator).toHaveText(/^1 \//);
  await tapZone(page, 0.5, 0.5);
  await expect(indicator).toHaveText(/^1 \//);

  const layout = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    viewportBottom: document.querySelector('#page-viewport').getBoundingClientRect().bottom,
  }));
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.innerHeight);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
  expect(layout.viewportBottom).toBeLessThanOrEqual(layout.innerHeight);
});

test('font size change keeps reading position', async ({ page }) => {
  await openBook(page);
  await tapZone(page, 0.9, 0.5);
  await tapZone(page, 0.9, 0.5);
  const before = await pageCount(page);
  const firstWords = await page.evaluate(() => {
    const viewport = document.querySelector('#page-viewport').getBoundingClientRect();
    const heading = [...document.querySelectorAll('#reading-content h2')]
      .find(node => node.getBoundingClientRect().left >= viewport.left && node.getBoundingClientRect().right <= viewport.right);
    return heading?.textContent || null;
  });
  await page.locator('#settings-toggle').click();
  for (let step = 0; step < 5; step += 1) await page.locator('#font-increase').click();
  await expect(page.locator('#font-size-value')).toHaveText('24px');
  expect(await pageCount(page)).toBeGreaterThan(before);
  await expect(page.locator('#page-indicator')).not.toHaveText(/^1 \//);
  if (firstWords) {
    const stillVisible = await page.evaluate(text => {
      const viewport = document.querySelector('#page-viewport').getBoundingClientRect();
      const heading = [...document.querySelectorAll('#reading-content h2')].find(node => node.textContent === text);
      const rect = heading.getBoundingClientRect();
      return rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1;
    }, firstWords);
    expect(stillVisible).toBe(true);
  }
});

test('toc jumps to heading page', async ({ page }) => {
  await openBook(page);
  await page.locator('#toc-toggle').click();
  const items = page.locator('#toc-dialog .toc-list button');
  await expect(items).toHaveCount(7);
  await items.filter({ hasText: '4장 제목 4' }).click();
  await expect(page.locator('#toc-dialog')).toBeHidden();
  await expect(page.locator('#page-indicator')).not.toHaveText(/^1 \//);
  const inView = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('#reading-content h2')].find(node => node.textContent === '4장 제목 4');
    const rect = heading.getBoundingClientRect();
    const viewport = document.querySelector('#page-viewport').getBoundingClientRect();
    return rect.left >= viewport.left && rect.right <= viewport.right;
  });
  expect(inView).toBe(true);
});

test('resume prompt returns to last page', async ({ page }) => {
  await openBook(page);
  await tapZone(page, 0.9, 0.5);
  await tapZone(page, 0.9, 0.5);
  await expect(page.locator('#page-indicator')).toHaveText(/^3 \//);
  const total = await pageCount(page);

  await page.reload();
  const dialog = page.locator('#resume-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('마지막에 읽었던 페이지로 이동할까요?');
  await dialog.getByRole('button', { name: '예' }).click();
  await expect(page.locator('#file-name')).toHaveText('재무제표 쉽게 읽기.md');
  await expect(page.locator('#page-indicator')).toHaveText(`3 / ${total}`);
});

test('resume prompt can be declined', async ({ page }) => {
  await openBook(page);
  await tapZone(page, 0.9, 0.5);
  await page.reload();
  const dialog = page.locator('#resume-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '아니오' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#file-name')).toHaveText('환영합니다');
});

test('dragging text saves a highlight', async ({ page }) => {
  await openBook(page);
  const span = await visibleTextSpan(page, '#reading-content');
  await slowDrag(page, span);
  const mark = page.locator('#reading-content mark.memo-mark');
  await expect(mark).toHaveCount(1);
  const marked = (await mark.textContent()).trim();
  expect(marked.length).toBeGreaterThanOrEqual(6);
  expect(span.text).toContain(marked);
  const memos = await storedMemos(page);
  expect(memos).toHaveLength(1);
  expect(memos[0].text).toBe(marked);
  expect(memos[0].where).toMatch(/^1장 제목 1 · \d+%$/);
  await expect(page.locator('#page-indicator')).toHaveText(/^1 \//);
});

test('my thought is saved and highlight survives reload', async ({ page }) => {
  await openBook(page);
  await slowDrag(page, await visibleTextSpan(page, '#reading-content'));
  const dialog = page.locator('#memo-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('내 생각')).toBeVisible();
  await dialog.getByLabel('내 생각').fill('숫자 뒤의 이야기를 찾자');
  await dialog.getByRole('button', { name: '완료' }).click();
  await expect(dialog).toBeHidden();
  expect((await storedMemos(page))[0].thought).toBe('숫자 뒤의 이야기를 찾자');

  await page.reload();
  await page.locator('#resume-dialog').getByRole('button', { name: '예' }).click();
  const mark = page.locator('#reading-content mark.memo-mark');
  await expect(mark).toHaveCount(1);
  const box = await mark.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('내 생각')).toHaveValue('숫자 뒤의 이야기를 찾자');
  await expect(page.locator('#page-indicator')).toHaveText(/^1 \//);
});

test('touch flick turns pages, slow touch drag highlights', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', '터치 이동은 CDP로만 보낼 수 있다');
  await openBook(page);
  const span = await visibleTextSpan(page, '#reading-content');
  const cdp = await page.context().newCDPSession(page);
  const touch = async (fromX, toX, y, ms) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] });
    for (let step = 1; step <= 8; step += 1) {
      if (ms) await page.waitForTimeout(ms / 8);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + ((toX - fromX) * step) / 8, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  await touch(span.x1, span.x2 + 60, span.y, 0);
  await expect(page.locator('#page-indicator')).toHaveText(/^2 \//);
  await touch(span.x2 + 60, span.x1, span.y, 0);
  await expect(page.locator('#page-indicator')).toHaveText(/^1 \//);
  await expect(page.locator('#reading-content mark.memo-mark')).toHaveCount(0);

  await touch(span.x1, span.x2, span.y, 600);
  await expect(page.locator('#reading-content mark.memo-mark')).toHaveCount(1);
  expect(await storedMemos(page)).toHaveLength(1);
  await expect(page.locator('#page-indicator')).toHaveText(/^1 \//);
});

test('fast flick turns pages without highlighting', async ({ page }) => {
  await openBook(page);
  const span = await visibleTextSpan(page, '#reading-content');
  await flick(page, span.x1, span.x2 + 60, span.y);
  await expect(page.locator('#page-indicator')).toHaveText(/^2 \//);
  await flick(page, span.x2 + 60, span.x1, span.y);
  await expect(page.locator('#page-indicator')).toHaveText(/^1 \//);
  await expect(page.locator('#reading-content mark.memo-mark')).toHaveCount(0);
  await expect(page.locator('#memo-dialog')).toBeHidden();
  expect(await storedMemos(page)).toHaveLength(0);
});

test('short upward drag does not highlight', async ({ page }) => {
  await openBook(page);
  const span = await visibleTextSpan(page, '#reading-content');
  await slowDrag(page, { ...span, x2: span.x1 + 4 }, { ms: 300, dy: -30 });
  await expect(page.locator('#reading-content mark.memo-mark')).toHaveCount(0);
  await expect(page.locator('#page-indicator')).toHaveText(/^1 \//);
  expect(await storedMemos(page)).toHaveLength(0);
});

test('slow drag from blank margin does not highlight', async ({ page }) => {
  await openBook(page);
  const span = await visibleTextSpan(page, '#reading-content');
  const viewport = await page.locator('#page-viewport').boundingBox();
  await slowDrag(page, { x1: viewport.x + 6, x2: span.x2, y: span.y });
  await expect(page.locator('#reading-content mark.memo-mark')).toHaveCount(0);
  await expect(page.locator('#page-indicator')).toHaveText(/^1 \//);
  expect(await storedMemos(page)).toHaveLength(0);
});

test('memo syncs to google drive folder', async ({ page }) => {
  const files = new Map();
  let nextId = 1;
  await page.route('**/reader/drive-config.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: "export const GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';",
  }));
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google = { accounts: { oauth2: {
      initTokenClient: config => ({ requestAccessToken: () => setTimeout(() => config.callback({
        access_token: 'fake-token', expires_in: 3599, scope: '${'https://www.googleapis.com/auth/drive.file'}',
      })) }),
      hasGrantedAllScopes: () => true,
    } } };`,
  }));
  await page.route('https://www.googleapis.com/**', async route => {
    const request = route.request();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (request.headers().authorization !== 'Bearer fake-token') return route.fulfill({ status: 401, headers: cors, body: '{}' });
    const url = new URL(request.url());
    const json = body => route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'GET' && url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q');
      return json({ files: [...files.values()].filter(file => q.includes(`name='${file.name}'`)).map(({ id, name }) => ({ id, name })) });
    }
    if (request.method() === 'POST' && url.pathname === '/drive/v3/files') {
      const meta = JSON.parse(request.postData());
      const id = `id-${nextId++}`;
      files.set(id, { id, ...meta, parents: meta.parents || [], content: '' });
      return json({ id });
    }
    if (request.method() === 'POST' && url.pathname === '/upload/drive/v3/files') {
      const body = request.postDataBuffer().toString('utf8');
      const meta = JSON.parse(body.match(/\r\n\r\n(\{.*\})\r\n/)[1]);
      const content = body.split('Content-Type: text/markdown; charset=UTF-8\r\n\r\n')[1].replace(/\r\n--[^\r\n]+--$/, '');
      const id = `id-${nextId++}`;
      files.set(id, { id, ...meta, content });
      return json({ id });
    }
    const file = files.get(url.pathname.split('/').pop());
    if (!file) return route.fulfill({ status: 404, headers: cors, body: '{}' });
    if (request.method() === 'GET') return route.fulfill({ headers: cors, body: file.content });
    file.content = request.postDataBuffer().toString('utf8');
    return json({ id: file.id });
  });

  await openBook(page);
  await slowDrag(page, await visibleTextSpan(page, '#reading-content'));
  const dialog = page.locator('#memo-dialog');
  await dialog.getByRole('button', { name: '구글 드라이브 연결' }).click();
  await expect(dialog.locator('[data-drive-status]')).toContainText('드라이브에 저장됨');
  await dialog.getByLabel('내 생각').fill('드라이브까지 가는 생각');
  await dialog.getByRole('button', { name: '완료' }).click();

  await expect.poll(() => [...files.values()].find(file => file.name === '메모_재무제표 쉽게 읽기.md')?.content || '').toContain('드라이브까지 가는 생각');
  const folder = [...files.values()].find(file => file.mimeType === 'application/vnd.google-apps.folder');
  const memoFile = [...files.values()].find(file => file.name === '메모_재무제표 쉽게 읽기.md');
  expect(folder.name).toBe('이북리더기_메모');
  expect(memoFile.parents).toEqual([folder.id]);
  const marked = (await page.locator('#reading-content mark.memo-mark').textContent()).trim();
  expect(memoFile.content).toContain(`> ${marked}`);
  expect([...files.values()]).toHaveLength(2);
});

test('icloud button shares the memo file', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shared = [];
    navigator.canShare = data => Boolean(data?.files?.length);
    navigator.share = async data => {
      const [file] = data.files;
      window.__shared.push({ name: file.name, type: file.type, text: await file.text() });
    };
  });
  await openBook(page);
  await slowDrag(page, await visibleTextSpan(page, '#reading-content'));
  const dialog = page.locator('#memo-dialog');
  await dialog.getByLabel('내 생각').fill('아이클라우드로 가는 생각');
  await dialog.getByRole('button', { name: '아이클라우드에 저장' }).click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
  const [shared] = await page.evaluate(() => window.__shared);
  const marked = (await page.locator('#reading-content mark.memo-mark').textContent()).trim();
  expect(shared.name).toBe('메모_재무제표 쉽게 읽기.md');
  expect(shared.text).toContain(`> ${marked}`);
  expect(shared.text).toContain('아이클라우드로 가는 생각');
});

test('icloud button falls back to a download', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.canShare = () => false;
  });
  await openBook(page);
  await slowDrag(page, await visibleTextSpan(page, '#reading-content'));
  const dialog = page.locator('#memo-dialog');
  await dialog.getByLabel('내 생각').fill('다운로드로 가는 생각');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '아이클라우드에 저장' }).click();
  const download = await downloading;
  expect(download.suggestedFilename().normalize('NFC')).toBe('메모_재무제표 쉽게 읽기.md');
  const text = readFileSync(await download.path(), 'utf8');
  expect(text).toContain('다운로드로 가는 생각');
});
