// 파일 열기·쪽 넘김·목차·이어 읽기·메모·드라이브 저장을 연결해 읽기 화면을 운영하는 브라우저 앱.

import {
  FULL_SWIPE_MS,
  TAP_SLOP,
  bookTitle,
  buildMemoMarkdown,
  clamp,
  classifyGesture,
  describeTextLocation,
  findAnchor,
  formatBytes,
  getFileKind,
  memoFileName,
  mergeMemos,
  pageAction,
  renderDocument,
  trimRange,
} from './reader-core.js';
import { loadLastBook, saveLastBook } from './book-store.js';
import { DRIVE_FOLDER_NAME, DRIVE_SCOPE, createDrive, syncBookMemos } from './drive-sync.js';
import { GOOGLE_CLIENT_ID } from './drive-config.js';
import { getPdfToc, openPdf, renderPdfPage } from './pdf-view.js';

const SAMPLE_TEXT = `# 이북리더기

읽고 싶은 텍스트·Markdown·PDF 파일을 이 화면에 올려보세요.

## 쪽 넘기기

- 화면 오른쪽이나 아래쪽을 누르면 다음 쪽으로 넘어갑니다.
- 왼쪽이나 위쪽을 누르면 이전 쪽으로 돌아갑니다.
- 손가락으로 휙 넘겨도 됩니다. 왼쪽→오른쪽은 다음 쪽, 오른쪽→왼쪽은 이전 쪽입니다.
- 위의 「목차」에서 원하는 장으로 바로 이동합니다.

## 메모

- 글자 위에 손가락을 대고 옆으로 천천히 끌면 형광펜이 칠해지고 바로 저장됩니다.
- 이어서 나오는 「내 생각」 칸에 떠오른 생각을 적어 두세요.
- 구글 드라이브를 연결하면 「이북리더기_메모」 폴더에 메모_책제목.md 로 저장됩니다.

## 보기 설정

- 글자 크기는 양쪽 버튼으로 조절합니다.
- 보기 설정에서 글자 색과 라이트모드 배경을 바꿉니다.
- 오른쪽 위 달 아이콘으로 어두운 화면으로 전환합니다.

책 파일은 서버로 보내지 않고, 지금 사용 중인 브라우저 안에서만 읽습니다.`;

const LIGHT_TEXT = '#2c2925';
const DARK_TEXT = '#ebe5da';
const DEFAULTS = {
  theme: 'light',
  paper: '#f7f4ed',
  fontSize: 19,
  textColor: LIGHT_TEXT,
};
const LAST_KEY = 'ebook-reader-last';
const TOKEN_KEY = 'ebook-reader-drive-token';
const FOLDER_KEY = 'ebook-reader-drive-folder';
const memoKey = bookId => `ebook-reader-memos:${bookId}`;

const state = {
  ...DEFAULTS,
  fileName: '환영합니다',
  fileSize: '읽기 안내',
  fileKind: 'sample',
  content: SAMPLE_TEXT,
  bookId: null,
  page: 0,
  pageCount: 1,
  anchor: 0,
  toc: [],
  tocOffsets: [],
  memos: [],
  driveFileId: null,
  pdf: null,
};

const drive = {
  token: null,
  expiresAt: 0,
  folderId: null,
  status: 'idle',
  message: '',
};

const elements = {
  root: document.documentElement,
  app: document.querySelector('.reader-app'),
  fileInput: document.querySelector('#file-input'),
  themeToggle: document.querySelector('#theme-toggle'),
  themeIcon: document.querySelector('#theme-icon'),
  settingsToggle: document.querySelector('#settings-toggle'),
  settingsPanel: document.querySelector('#settings-panel'),
  fontDecrease: document.querySelector('#font-decrease'),
  fontIncrease: document.querySelector('#font-increase'),
  fontSizeValue: document.querySelector('#font-size-value'),
  textColor: document.querySelector('#text-color'),
  textColorValue: document.querySelector('#text-color-value'),
  fileType: document.querySelector('#file-type'),
  fileName: document.querySelector('#file-name'),
  fileSize: document.querySelector('#file-size'),
  readingStats: document.querySelector('#reading-stats'),
  readingContent: document.querySelector('#reading-content'),
  dropZone: document.querySelector('#drop-zone'),
  pageViewport: document.querySelector('#page-viewport'),
  pdfStage: document.querySelector('#pdf-stage'),
  dragLayer: document.querySelector('#drag-layer'),
  pageIndicator: document.querySelector('#page-indicator'),
  tocToggle: document.querySelector('#toc-toggle'),
  tocDialog: document.querySelector('#toc-dialog'),
  tocList: document.querySelector('#toc-list'),
  tocEmpty: document.querySelector('#toc-empty'),
  memoList: document.querySelector('#memo-list'),
  memoEmpty: document.querySelector('#memo-empty'),
  memoCount: document.querySelector('#memo-count'),
  memoDialog: document.querySelector('#memo-dialog'),
  memoQuote: document.querySelector('#memo-quote'),
  memoWhere: document.querySelector('#memo-where'),
  memoThought: document.querySelector('#memo-thought'),
  memoDelete: document.querySelector('#memo-delete'),
  memoDone: document.querySelector('#memo-done'),
  resumeDialog: document.querySelector('#resume-dialog'),
  resumeDetail: document.querySelector('#resume-detail'),
  resumeYes: document.querySelector('#resume-yes'),
  resumeNo: document.querySelector('#resume-no'),
};

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없어도 읽기는 계속한다.
  }
}

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('ebook-reader-preferences') || '{}');
    if (saved.theme === 'light' || saved.theme === 'dark') state.theme = saved.theme;
    if (typeof saved.paper === 'string') state.paper = saved.paper;
    if (Number.isFinite(saved.fontSize)) state.fontSize = clamp(saved.fontSize, 16, 28);
    if (typeof saved.textColor === 'string') state.textColor = saved.textColor;
  } catch {
    // 저장된 설정이 없거나 브라우저 저장소를 사용할 수 없어도 기본값으로 읽기를 계속한다.
  }
}

function savePreferences() {
  try {
    localStorage.setItem('ebook-reader-preferences', JSON.stringify({
      theme: state.theme,
      paper: state.paper,
      fontSize: state.fontSize,
      textColor: state.textColor,
    }));
  } catch {
    // 개인 설정 저장은 선택 기능이므로 읽기 동작을 막지 않는다.
  }
}

function updateReadingStats() {
  if (state.fileKind === 'pdf') {
    elements.readingStats.textContent = `PDF · ${state.pageCount}쪽`;
    return;
  }
  const characters = state.content.length.toLocaleString('ko-KR');
  const paragraphs = state.content.split(/\n\s*\n/).filter(Boolean).length;
  elements.readingStats.textContent = `${characters}자 · ${paragraphs}개 문단`;
}

function render() {
  const isDark = state.theme === 'dark';
  const isPdf = state.fileKind === 'pdf';
  elements.root.dataset.theme = state.theme;
  elements.root.style.setProperty('--reader-bg', isDark ? '#1b1a17' : state.paper);
  elements.root.style.setProperty('--reader-text', state.textColor);
  elements.root.style.setProperty('--reader-font-size', `${state.fontSize}px`);
  elements.app.classList.toggle('is-reading', state.fileKind !== 'sample');
  elements.fontSizeValue.textContent = `${state.fontSize}px`;
  elements.fontDecrease.disabled = isPdf;
  elements.fontIncrease.disabled = isPdf;
  elements.textColor.value = state.textColor;
  elements.textColorValue.textContent = state.textColor.toUpperCase();
  elements.themeIcon.textContent = isDark ? '☀' : '☾';
  elements.themeToggle.setAttribute('aria-label', isDark ? '라이트모드로 전환' : '다크모드로 전환');
  elements.themeToggle.setAttribute('aria-pressed', String(isDark));
  elements.fileType.textContent = { markdown: 'MARKDOWN', text: 'TEXT', pdf: 'PDF' }[state.fileKind] || 'SAMPLE';
  elements.fileName.textContent = state.fileName;
  elements.fileSize.textContent = state.fileSize;
  document.querySelectorAll('.paper-swatch').forEach(swatch => {
    const selected = swatch.dataset.paper === state.paper;
    swatch.classList.toggle('is-selected', selected);
    swatch.setAttribute('aria-pressed', String(selected));
  });
  updateReadingStats();
}

/* ── 글자 위치(오프셋) 색인 ─────────────────────────────── */

let activeIndex = null;

// 읽기 영역의 글자 노드를 순서대로 모아 「몇 번째 글자」로 위치를 가리킬 수 있게 한다.
function buildTextIndex(root, text = null) {
  const nodes = [];
  const starts = new Map();
  let length = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node, start: length });
    starts.set(node, length);
    length += node.length;
  }
  return { root, nodes, starts, length, text: text ?? root.textContent };
}

function locate(index, offset) {
  let low = 0;
  let high = index.nodes.length - 1;
  if (high < 0) return null;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (index.nodes[mid].start <= offset) low = mid;
    else high = mid - 1;
  }
  const { node, start } = index.nodes[low];
  return { node, local: clamp(offset - start, 0, node.length) };
}

function offsetOf(index, node, local) {
  if (index.starts.has(node)) return index.starts.get(node) + local;
  if (!index.root.contains(node)) return null;
  const range = document.createRange();
  range.setStart(index.root, 0);
  range.setEnd(node, local);
  return range.toString().length;
}

function rangeFor(index, start, end) {
  const from = locate(index, start);
  const to = locate(index, end);
  const range = document.createRange();
  range.setStart(from.node, from.local);
  range.setEnd(to.node, to.local);
  return range;
}

function wrapRange(index, start, end, memoId) {
  const pieces = [];
  for (const { node, start: nodeStart } of index.nodes) {
    const nodeEnd = nodeStart + node.length;
    if (nodeEnd <= start || nodeStart >= end) continue;
    pieces.push({ node, from: Math.max(start - nodeStart, 0), to: Math.min(end - nodeStart, node.length) });
  }
  for (const { node, from, to } of pieces) {
    if (from >= to) continue;
    let target = node;
    if (from > 0) target = target.splitText(from);
    if (to - from < target.length) target.splitText(to - from);
    const mark = document.createElement('mark');
    mark.className = 'memo-mark';
    mark.dataset.memoId = memoId;
    target.parentNode.insertBefore(mark, target);
    mark.append(target);
  }
}

function visibleMemos() {
  return state.memos.filter(item => !item.deleted && item.bookId === state.bookId);
}

// 현재 화면의 형광펜을 모두 지우고 저장된 메모대로 다시 칠한다.
function refreshMarks() {
  const root = state.fileKind === 'pdf' ? elements.pdfStage.querySelector('.textLayer') : elements.readingContent;
  if (!root) {
    activeIndex = null;
    return;
  }
  const oldMarks = root.querySelectorAll('mark.memo-mark');
  oldMarks.forEach(mark => mark.replaceWith(...mark.childNodes));
  if (oldMarks.length) root.normalize();
  let index = buildTextIndex(root);
  const onThisView = item => (state.fileKind === 'pdf' ? item.page === state.page : item.page === null);
  for (const item of visibleMemos().filter(onThisView)) {
    const anchor = findAnchor(index.text, item);
    if (!anchor) continue;
    wrapRange(index, anchor.start, anchor.end, item.id);
    index = buildTextIndex(root, index.text);
  }
  activeIndex = index;
}

/* ── 쪽 나누기 ─────────────────────────────────────────── */

let layout = { vw: 1, gap: 0 };

// 글을 화면 폭만큼의 세로 단(column)으로 흘려 쪽을 만든다. 한 쪽 = 뷰포트 폭 1개.
function layoutText() {
  const flow = elements.readingContent;
  const vw = elements.pageViewport.clientWidth || 1;
  const pad = vw <= 520 ? 22 : Math.round(clamp(vw * 0.08, 36, 96));
  const columnWidth = Math.floor(Math.min(vw - pad * 2, 700));
  const gap = vw - columnWidth;
  layout = { vw, gap };
  flow.style.width = `${columnWidth}px`;
  flow.style.marginLeft = `${Math.floor(gap / 2)}px`;
  flow.style.columnWidth = `${columnWidth}px`;
  flow.style.columnGap = `${gap}px`;
  let last = activeIndex.text.length - 1;
  while (last > 0 && /\s/.test(activeIndex.text[last])) last -= 1;
  state.pageCount = Math.max(1, pageOfOffset(Math.max(last, 0)) + 1);
}

function rectAtOffset(offset) {
  const stop = Math.min(activeIndex.length, offset + 64);
  for (let at = offset; at < stop; at += 1) {
    const position = locate(activeIndex, at);
    if (!position || position.local >= position.node.length) continue;
    const range = document.createRange();
    range.setStart(position.node, position.local);
    range.setEnd(position.node, position.local + 1);
    const rect = range.getClientRects()[0];
    if (rect && (rect.width > 0 || rect.height > 0)) return rect;
  }
  return null;
}

function pageOfOffset(offset) {
  const rect = rectAtOffset(offset);
  if (!rect) return 0;
  const flowLeft = elements.readingContent.getBoundingClientRect().left;
  return Math.max(0, Math.floor((rect.left - flowLeft + layout.gap / 2) / layout.vw));
}

function pageOfElement(element) {
  const rect = element?.getClientRects()[0];
  if (!rect) return 0;
  const flowLeft = elements.readingContent.getBoundingClientRect().left;
  return Math.max(0, Math.floor((rect.left - flowLeft + layout.gap / 2) / layout.vw));
}

function firstOffsetOfPage(page) {
  let low = 0;
  let high = Math.max(activeIndex.length - 1, 0);
  while (low < high) {
    const mid = (low + high) >> 1;
    if (pageOfOffset(mid) >= page) high = mid;
    else low = mid + 1;
  }
  return low;
}

function updatePageIndicator() {
  elements.pageIndicator.textContent = `${state.page + 1} / ${state.pageCount}`;
}

function saveLastPosition() {
  if (!state.bookId) return;
  writeJson(LAST_KEY, {
    bookId: state.bookId,
    fileName: state.fileName,
    page: state.page,
    pageCount: state.pageCount,
    offset: state.fileKind === 'pdf' ? null : state.anchor,
  });
}

function goToPage(page, { save = true } = {}) {
  state.page = clamp(page, 0, state.pageCount - 1);
  if (state.fileKind === 'pdf') {
    renderPdf();
  } else {
    elements.readingContent.style.transform = `translate3d(${-state.page * layout.vw}px, 0, 0)`;
    elements.pageViewport.scrollLeft = 0;
    state.anchor = firstOffsetOfPage(state.page);
  }
  updatePageIndicator();
  if (save) saveLastPosition();
}

// 글자 크기·화면 크기가 바뀌면 지금 읽던 글자가 있는 쪽으로 다시 맞춘다.
function relayout() {
  if (state.fileKind === 'pdf') {
    if (state.pdf) renderPdf();
    return;
  }
  if (!activeIndex) return;
  const anchor = state.anchor;
  layoutText();
  goToPage(pageOfOffset(anchor), { save: false });
  state.anchor = anchor;
  updateReadingStats();
}

/* ── 본문 그리기 ───────────────────────────────────────── */

function renderContent() {
  const isPdf = state.fileKind === 'pdf';
  elements.readingContent.hidden = isPdf;
  elements.pdfStage.hidden = !isPdf;
  elements.pdfStage.replaceChildren();
  if (isPdf) return;
  const { html, toc } = renderDocument(state.content, state.fileKind === 'text' ? 'text' : 'markdown');
  elements.readingContent.classList.toggle('plain-content', state.fileKind === 'text');
  elements.readingContent.classList.toggle('markdown-content', state.fileKind !== 'text');
  elements.readingContent.style.transform = '';
  elements.readingContent.innerHTML = html;
  state.toc = toc;
  refreshMarks();
  state.tocOffsets = toc.map(entry => ({
    title: entry.title,
    offset: offsetOf(activeIndex, document.getElementById(entry.id), 0) ?? 0,
  }));
  layoutText();
}

let pdfRender = null;

async function renderPdf() {
  if (!state.pdf) return;
  pdfRender?.cancel();
  const handle = renderPdfPage(state.pdf, state.page, elements.pdfStage);
  pdfRender = handle;
  try {
    const pageBox = await handle.done;
    if (pdfRender !== handle) return;
    elements.pdfStage.replaceChildren(pageBox);
    refreshMarks();
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') showError('PDF 쪽을 그리지 못했습니다', error);
  }
}

function showError(title, error) {
  console.error(error);
  state.fileKind = 'sample';
  state.bookId = null;
  state.content = `# ${title}\n\n${error?.message || error}`;
  render();
  renderContent();
  goToPage(0, { save: false });
}

/* ── 책 열기·이어 읽기 ─────────────────────────────────── */

async function hashBuffer(buffer, fallback) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].slice(0, 12).map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return fallback;
  }
}

function loadMemos() {
  const saved = readJson(memoKey(state.bookId));
  state.memos = Array.isArray(saved?.memos) ? saved.memos : [];
  state.driveFileId = saved?.driveFileId || null;
}

function saveMemos() {
  writeJson(memoKey(state.bookId), {
    bookId: state.bookId,
    title: bookTitle(state.fileName),
    fileName: state.fileName,
    memos: state.memos,
    driveFileId: state.driveFileId,
  });
}

async function openBook(book, position = null) {
  state.fileName = book.name;
  state.fileSize = formatBytes(book.size);
  state.fileKind = book.kind;
  state.bookId = book.id;
  state.page = 0;
  state.anchor = 0;
  loadMemos();
  if (book.kind === 'pdf') {
    state.content = '';
    elements.readingStats.textContent = 'PDF 불러오는 중…';
    try {
      state.pdf?.destroy();
      state.pdf = await openPdf(book.data);
      state.pageCount = state.pdf.numPages;
      state.toc = await getPdfToc(state.pdf);
    } catch (error) {
      showError('PDF를 열지 못했습니다', error);
      return;
    }
  } else {
    state.pdf?.destroy();
    state.pdf = null;
    state.content = new TextDecoder('utf-8').decode(book.data);
  }
  render();
  renderContent();
  if (book.kind === 'pdf') goToPage(position?.page ?? 0);
  else goToPage(Number.isFinite(position?.offset) ? pageOfOffset(position.offset) : 0);
  renderDriveStatus();
  if (validToken()) syncNow();
}

async function openFile(file) {
  if (!file) return;
  const data = await file.arrayBuffer();
  const book = {
    id: await hashBuffer(data, `${file.name}-${file.size}`),
    name: file.name,
    size: file.size,
    kind: getFileKind(file.name),
    data,
  };
  try {
    await saveLastBook(book);
  } catch {
    // 저장 공간이 없으면 이어 읽기만 빠지고 읽기는 계속한다.
  }
  await openBook(book);
}

let pendingResume = null;

async function offerResume() {
  const last = readJson(LAST_KEY);
  if (!last?.bookId) return;
  let book;
  try {
    book = await loadLastBook();
  } catch {
    return;
  }
  if (!book || book.id !== last.bookId) return;
  pendingResume = { book, last };
  elements.resumeDetail.textContent = `${book.name} · ${last.page + 1} / ${last.pageCount}쪽`;
  elements.resumeDialog.showModal();
}

/* ── 메모 ──────────────────────────────────────────────── */

let openMemoId = null;

function newId() {
  return crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createMemo(from, to) {
  const range = trimRange(activeIndex.text, from, to);
  if (!range) return;
  const now = Date.now();
  const isPdf = state.fileKind === 'pdf';
  const item = {
    id: newId(),
    bookId: state.bookId,
    page: isPdf ? state.page : null,
    start: range.start,
    end: range.end,
    text: activeIndex.text.slice(range.start, range.end),
    thought: '',
    where: isPdf ? `p.${state.page + 1}` : describeTextLocation(range.start, activeIndex.length, state.tocOffsets),
    createdAt: now,
    updatedAt: now,
  };
  state.memos.push(item);
  saveMemos();
  wrapRange(activeIndex, item.start, item.end, item.id);
  activeIndex = buildTextIndex(activeIndex.root, activeIndex.text);
  scheduleSync();
  openMemo(item.id);
}

function openMemo(id) {
  const item = state.memos.find(entry => entry.id === id);
  if (!item) return;
  openMemoId = id;
  elements.memoQuote.textContent = item.text;
  elements.memoWhere.textContent = item.where;
  elements.memoThought.value = item.thought;
  renderDriveStatus();
  if (!elements.memoDialog.open) elements.memoDialog.showModal();
}

function updateThought() {
  const item = state.memos.find(entry => entry.id === openMemoId);
  if (!item || item.thought === elements.memoThought.value) return;
  item.thought = elements.memoThought.value;
  item.updatedAt = Date.now();
  saveMemos();
  scheduleSync();
}

function deleteOpenMemo() {
  const item = state.memos.find(entry => entry.id === openMemoId);
  if (item) {
    item.deleted = true;
    item.updatedAt = Date.now();
    saveMemos();
    refreshMarks();
    scheduleSync(0);
  }
  elements.memoDialog.close();
}

function memoPage(item) {
  if (state.fileKind === 'pdf') return item.page;
  const anchor = findAnchor(activeIndex.text, item);
  return anchor ? pageOfOffset(anchor.start) : 0;
}

/* ── 목차·메모 목록 ────────────────────────────────────── */

function listButton(title, page, detail = '') {
  const button = document.createElement('button');
  button.type = 'button';
  const label = document.createElement('span');
  label.className = 'list-title';
  label.textContent = title;
  const number = document.createElement('span');
  number.className = 'list-page';
  number.textContent = String(page + 1);
  button.append(label, number);
  if (detail) {
    const note = document.createElement('span');
    note.className = 'list-detail';
    note.textContent = detail;
    button.append(note);
  }
  return button;
}

function renderTocList() {
  const items = state.toc.map(entry => {
    const page = state.fileKind === 'pdf' ? entry.page : pageOfElement(document.getElementById(entry.id));
    const item = document.createElement('li');
    item.className = `toc-level-${entry.level}`;
    const button = listButton(entry.title, page);
    button.addEventListener('click', () => {
      elements.tocDialog.close();
      goToPage(page);
    });
    item.append(button);
    return item;
  });
  elements.tocList.replaceChildren(...items);
  elements.tocEmpty.hidden = items.length > 0;
}

function renderMemoList() {
  const memos = visibleMemos();
  elements.memoCount.textContent = String(memos.length);
  elements.memoEmpty.hidden = memos.length > 0;
  elements.memoList.replaceChildren(...memos.map(item => {
    const page = memoPage(item);
    const entry = document.createElement('li');
    const button = listButton(item.text, page, item.thought ? `내 생각 · ${item.thought}` : item.where);
    button.addEventListener('click', async () => {
      elements.tocDialog.close();
      goToPage(page);
      if (state.fileKind === 'pdf') await pdfRender?.done.catch(() => {});
      openMemo(item.id);
    });
    entry.append(button);
    return entry;
  }));
}

function showSheetTab(name) {
  elements.tocDialog.querySelectorAll('.sheet-tab').forEach(tab => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  elements.tocDialog.querySelectorAll('[data-panel]').forEach(panel => {
    panel.hidden = panel.dataset.panel !== name;
  });
}

/* ── 구글 드라이브 ─────────────────────────────────────── */

function validToken() {
  return drive.token && drive.expiresAt > Date.now() ? drive.token : null;
}

function loadDriveState() {
  const token = readJson(TOKEN_KEY);
  if (token?.expiresAt > Date.now()) Object.assign(drive, { token: token.token, expiresAt: token.expiresAt });
  drive.folderId = readJson(FOLDER_KEY);
}

function loadGis() {
  if (!GOOGLE_CLIENT_ID || window.google?.accounts?.oauth2 || document.querySelector('script[data-gis]')) return;
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.dataset.gis = '';
  document.head.append(script);
}

function setDriveStatus(status, message = '') {
  drive.status = status;
  drive.message = message;
  renderDriveStatus();
}

function renderDriveStatus() {
  const fileName = `${DRIVE_FOLDER_NAME}/${memoFileName(bookTitle(state.fileName))}`;
  let text;
  let canConnect = false;
  if (!GOOGLE_CLIENT_ID) {
    text = '저장 위치 — 이 기기(브라우저). 구글 드라이브 저장은 아직 설정되지 않았습니다.';
  } else if (!validToken()) {
    text = drive.message || '저장 위치 — 이 기기(브라우저). 구글 드라이브에도 남기려면 연결하세요.';
    canConnect = true;
  } else if (drive.status === 'saving') {
    text = '저장 위치 — 이 기기 · 구글 드라이브에 저장 중…';
  } else if (drive.status === 'error') {
    text = drive.message;
  } else if (drive.status === 'saved') {
    text = `저장 위치 — 이 기기 · 구글 드라이브에 저장됨 (${fileName})`;
  } else {
    text = `저장 위치 — 이 기기 · 구글 드라이브 연결됨 (${fileName})`;
  }
  document.querySelectorAll('[data-drive-status]').forEach(node => { node.textContent = text; });
  document.querySelectorAll('[data-drive-connect]').forEach(node => { node.hidden = !canConnect; });
  document.querySelectorAll('[data-icloud-save]').forEach(node => { node.hidden = !state.bookId || !visibleMemos().length; });
  document.querySelectorAll('[data-drive-link]').forEach(node => {
    node.hidden = !(validToken() && state.driveFileId);
    if (state.driveFileId) node.href = `https://drive.google.com/file/d/${state.driveFileId}/view`;
  });
}

function connectDrive() {
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) {
    loadGis();
    setDriveStatus('error', '구글 로그인 도구를 불러오는 중입니다. 잠시 후 다시 눌러 주세요.');
    return;
  }
  const client = oauth.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: response => {
      if (response.error || !oauth.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
        setDriveStatus('error', '드라이브 권한이 허용되지 않았습니다. 다시 연결할 때 드라이브 항목을 체크해 주세요.');
        return;
      }
      drive.token = response.access_token;
      drive.expiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
      drive.message = '';
      writeJson(TOKEN_KEY, { token: drive.token, expiresAt: drive.expiresAt });
      syncNow();
    },
    error_callback: () => setDriveStatus('error', '구글 로그인 창이 닫혔습니다. 메모는 이 기기에 남아 있습니다.'),
  });
  client.requestAccessToken();
}

// 아이클라우드 드라이브는 웹앱이 직접 쓸 수 있는 공개 API가 없다.
// 공유 창을 열어 「파일에 저장」 → iCloud Drive 폴더를 고르게 하고, 공유 창이 없으면 내려받기로 대신한다.
function saveToICloud() {
  if (!state.bookId) return;
  updateThought();
  const title = bookTitle(state.fileName);
  const markdown = buildMemoMarkdown({
    title,
    fileName: state.fileName,
    bookId: state.bookId,
    memos: state.memos,
    now: Date.now(),
  });
  const name = memoFileName(title);
  const file = new File([markdown], name, { type: 'text/markdown' });
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(error => {
      if (error?.name !== 'AbortError') downloadFile(file);
    });
    return;
  }
  downloadFile(file);
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

let syncTimer = null;
let syncing = false;
let syncAgain = false;

function scheduleSync(delay = 1200) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}

// 한 번에 하나씩만 보낸다. 보내는 사이 바뀐 내용은 끝난 뒤 한 번 더 보낸다.
async function syncNow(retried = false) {
  clearTimeout(syncTimer);
  if (!state.bookId || !GOOGLE_CLIENT_ID) return;
  const token = validToken();
  if (!token) {
    setDriveStatus('need-auth');
    return;
  }
  if (syncing) {
    syncAgain = true;
    return;
  }
  syncing = true;
  setDriveStatus('saving');
  const bookId = state.bookId;
  let retry = false;
  try {
    const result = await syncBookMemos({
      drive: createDrive({ fetchImpl: window.fetch.bind(window), token }),
      book: { bookId, title: bookTitle(state.fileName), fileName: state.fileName, memos: state.memos },
      folderId: drive.folderId,
      fileId: state.driveFileId,
      now: Date.now(),
    });
    drive.folderId = result.folderId;
    writeJson(FOLDER_KEY, result.folderId);
    if (state.bookId === bookId) {
      const before = JSON.stringify(visibleMemos().map(item => item.id));
      state.memos = mergeMemos(state.memos, result.memos);
      state.driveFileId = result.fileId;
      saveMemos();
      if (JSON.stringify(visibleMemos().map(item => item.id)) !== before) refreshMarks();
    }
    setDriveStatus('saved');
  } catch (error) {
    if (error.status === 401) {
      drive.token = null;
      writeJson(TOKEN_KEY, null);
      setDriveStatus('need-auth', '드라이브 연결 시간이 지났습니다. 다시 연결하면 이어서 저장합니다.');
    } else if (error.status === 404 && !retried) {
      drive.folderId = null;
      state.driveFileId = null;
      retry = true;
    } else {
      setDriveStatus('error', '드라이브 저장에 실패했습니다. 메모는 이 기기에 남아 있습니다.');
    }
  } finally {
    syncing = false;
  }
  if (retry) {
    syncNow(true);
    return;
  }
  if (syncAgain) {
    syncAgain = false;
    syncNow();
  }
}

/* ── 손가락 동작: 누르거나 휙 넘기면 쪽 이동, 글자에서 천천히 끌면 형광펜 ── */

let gesture = null;

function caretOffsetAt(x, y) {
  if (!activeIndex || !state.bookId) return null;
  let node = null;
  let local = 0;
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (position) ({ offsetNode: node, offset: local } = position);
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    if (range) ({ startContainer: node, startOffset: local } = range);
  }
  if (!node || !activeIndex.root.contains(node)) return null;
  return offsetOf(activeIndex, node, local);
}

function drawDragPreview(from, to) {
  const base = elements.pageViewport.getBoundingClientRect();
  const range = rangeFor(activeIndex, Math.min(from, to), Math.max(from, to));
  elements.dragLayer.replaceChildren(...[...range.getClientRects()].map(rect => {
    const box = document.createElement('div');
    box.className = 'drag-rect';
    box.style.left = `${rect.left - base.left}px`;
    box.style.top = `${rect.top - base.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    return box;
  }));
}

// 손가락이 실제 글자 위에 있을 때만 그 글자 위치를 돌려준다. 여백·줄 사이에서 시작하면 null.
function textOffsetAtPoint(x, y) {
  const offset = caretOffsetAt(x, y);
  if (offset === null) return null;
  for (const at of [offset, offset - 1]) {
    const position = at >= 0 ? locate(activeIndex, at) : null;
    if (!position || position.local >= position.node.length) continue;
    const range = document.createRange();
    range.setStart(position.node, position.local);
    range.setEnd(position.node, position.local + 1);
    for (const rect of range.getClientRects()) {
      if (x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 4 && y <= rect.bottom + 4) return offset;
    }
  }
  return null;
}

// 최근 0.1초 동안의 빠르기(px/ms). 손을 떼기 직전에 휙 넘겼는지 본다.
function recentSpeed(samples) {
  const last = samples.at(-1);
  const first = samples.find(sample => last.t - sample.t <= 100) || last;
  const elapsed = last.t - first.t;
  return elapsed > 0 ? Math.hypot(last.x - first.x, last.y - first.y) / elapsed : 0;
}

function onPointerDown(event) {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const now = performance.now();
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    t: now,
    target: event.target,
    start: textOffsetAtPoint(event.clientX, event.clientY),
    end: null,
    axis: null,
    selecting: false,
    samples: [{ x: event.clientX, y: event.clientY, t: now }],
  };
  elements.pageViewport.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  const now = performance.now();
  gesture.samples.push({ x: event.clientX, y: event.clientY, t: now });
  if (gesture.samples.length > 40) gesture.samples.shift();
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  if (!gesture.axis && Math.hypot(dx, dy) >= TAP_SLOP) gesture.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
  const slow = recentSpeed(gesture.samples) <= elements.pageViewport.clientWidth / FULL_SWIPE_MS;
  if (!gesture.selecting && gesture.start !== null && gesture.axis === 'h' && now - gesture.t >= 150 && slow) {
    gesture.selecting = true;
  }
  if (!gesture.selecting) return;
  event.preventDefault();
  const end = caretOffsetAt(event.clientX, event.clientY);
  if (end === null) return;
  gesture.end = end;
  drawDragPreview(gesture.start, end);
}

function onPointerUp(event) {
  const current = gesture;
  gesture = null;
  elements.dragLayer.replaceChildren();
  if (!current || event.pointerId !== current.id) return;
  current.samples.push({ x: event.clientX, y: event.clientY, t: performance.now() });
  const box = elements.pageViewport.getBoundingClientRect();
  const kind = classifyGesture({
    dx: event.clientX - current.x,
    dy: event.clientY - current.y,
    duration: current.samples.at(-1).t - current.t,
    releaseSpeed: recentSpeed(current.samples),
    width: box.width,
    startOnText: current.start !== null,
    axis: current.axis,
  });
  if (kind === 'memo') {
    const end = caretOffsetAt(event.clientX, event.clientY) ?? current.end;
    if (end !== null) createMemo(current.start, end);
    return;
  }
  if (kind === 'next') goToPage(state.page + 1);
  if (kind === 'prev') goToPage(state.page - 1);
  if (kind !== 'tap' || current.target.closest?.('a')) return;
  const mark = current.target.closest?.('mark.memo-mark');
  if (mark) {
    openMemo(mark.dataset.memoId);
    return;
  }
  const action = pageAction(event.clientX - box.left, event.clientY - box.top, box.width, box.height);
  if (action === 'next') goToPage(state.page + 1);
  if (action === 'prev') goToPage(state.page - 1);
}

function onPointerCancel() {
  gesture = null;
  elements.dragLayer.replaceChildren();
}

/* ── 이벤트 연결 ───────────────────────────────────────── */

function toggleTheme() {
  const previousTheme = state.theme;
  state.theme = previousTheme === 'light' ? 'dark' : 'light';
  if (state.textColor === LIGHT_TEXT && state.theme === 'dark') state.textColor = DARK_TEXT;
  if (state.textColor === DARK_TEXT && state.theme === 'light') state.textColor = LIGHT_TEXT;
  savePreferences();
  render();
}

function changeFontSize(step) {
  state.fontSize = clamp(state.fontSize + step, 16, 28);
  savePreferences();
  render();
  relayout();
}

function handleDrop(event) {
  event.preventDefault();
  elements.dropZone.classList.remove('is-dragging');
  const [file] = event.dataTransfer.files;
  if (file) openFile(file);
}

// 배경에서 시작해 배경에서 끝난 누름만 「닫기」로 본다. 쪽 넘김 뒤에 따라오는 합성 클릭에 닫히지 않게 한다.
function closeOnBackdrop(dialog) {
  let pressedOutside = false;
  const outside = event => {
    const box = dialog.getBoundingClientRect();
    return event.target === dialog
      && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
  };
  dialog.addEventListener('pointerdown', event => { pressedOutside = outside(event); });
  dialog.addEventListener('click', event => {
    if (pressedOutside && outside(event)) dialog.close();
    pressedOutside = false;
  });
}

elements.fileInput.addEventListener('change', event => openFile(event.target.files[0]));
elements.themeToggle.addEventListener('click', toggleTheme);
elements.settingsToggle.addEventListener('click', () => {
  const isOpen = !elements.settingsPanel.hidden;
  elements.settingsPanel.hidden = isOpen;
  elements.settingsToggle.setAttribute('aria-expanded', String(!isOpen));
});
elements.fontDecrease.addEventListener('click', () => changeFontSize(-1));
elements.fontIncrease.addEventListener('click', () => changeFontSize(1));
elements.textColor.addEventListener('input', event => {
  state.textColor = event.target.value;
  savePreferences();
  render();
});
document.querySelectorAll('.paper-swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    state.paper = swatch.dataset.paper;
    savePreferences();
    render();
  });
});
elements.dropZone.addEventListener('dragover', event => {
  event.preventDefault();
  elements.dropZone.classList.add('is-dragging');
});
elements.dropZone.addEventListener('dragleave', () => elements.dropZone.classList.remove('is-dragging'));
elements.dropZone.addEventListener('drop', handleDrop);
elements.dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    elements.fileInput.click();
  }
});

elements.pageViewport.addEventListener('pointerdown', onPointerDown);
elements.pageViewport.addEventListener('pointermove', onPointerMove);
elements.pageViewport.addEventListener('pointerup', onPointerUp);
elements.pageViewport.addEventListener('pointercancel', onPointerCancel);
elements.pageViewport.addEventListener('contextmenu', event => event.preventDefault());
// 터치는 위에서 직접 처리했으니 뒤따르는 합성 클릭을 막는다. 링크만 그대로 둔다.
elements.pageViewport.addEventListener('touchend', event => {
  if (!event.target.closest?.('a')) event.preventDefault();
}, { passive: false });
new ResizeObserver(() => requestAnimationFrame(relayout)).observe(elements.pageViewport);

document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || event.target.closest?.('button, a, input, textarea, select, label, .drop-zone')) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
    event.preventDefault();
    goToPage(state.page + 1);
  } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
    event.preventDefault();
    goToPage(state.page - 1);
  }
});

elements.tocToggle.addEventListener('click', () => {
  renderTocList();
  renderMemoList();
  renderDriveStatus();
  showSheetTab('toc');
  elements.tocDialog.showModal();
});
elements.tocDialog.querySelectorAll('.sheet-tab').forEach(tab => {
  tab.addEventListener('click', () => showSheetTab(tab.dataset.tab));
});
elements.tocDialog.querySelector('[data-close]').addEventListener('click', () => elements.tocDialog.close());
closeOnBackdrop(elements.tocDialog);

elements.memoThought.addEventListener('input', updateThought);
elements.memoDone.addEventListener('click', () => elements.memoDialog.close());
elements.memoDelete.addEventListener('click', deleteOpenMemo);
elements.memoDialog.addEventListener('close', () => {
  updateThought();
  openMemoId = null;
});
closeOnBackdrop(elements.memoDialog);
document.querySelectorAll('[data-drive-connect]').forEach(button => button.addEventListener('click', connectDrive));
document.querySelectorAll('[data-icloud-save]').forEach(button => button.addEventListener('click', saveToICloud));

elements.resumeYes.addEventListener('click', () => {
  elements.resumeDialog.close();
  if (pendingResume) openBook(pendingResume.book, pendingResume.last);
  pendingResume = null;
});
elements.resumeNo.addEventListener('click', () => {
  pendingResume = null;
  elements.resumeDialog.close();
});

loadPreferences();
loadDriveState();
loadGis();
render();
renderContent();
goToPage(0, { save: false });
renderDriveStatus();
offerResume();
