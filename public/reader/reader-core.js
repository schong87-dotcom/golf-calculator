// 이북리더기의 파일 분류와 안전한 Markdown 표시를 담당하는 순수 함수 모음.

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getFileKind(fileName = '') {
  if (/\.pdf$/i.test(fileName)) return 'pdf';
  return /\.(md|markdown)$/i.test(fileName) ? 'markdown' : 'text';
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderInline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  return html;
}

const CHAPTER_PATTERNS = [
  /^제\s*[0-9０-９一二三四五六七八九十百]+\s*[장부편화절권막]/,
  /^[0-9]{1,3}\s*[장부편](\s|$)/,
  /^(chapter|part|book)\s+([0-9]+|[ivxlc]+)\b/i,
  /^(프롤로그|에필로그|서문|서장|머리말|맺음말|들어가며|나가며|들어가는 말|나오는 말|작가의 말|작가 후기|후기|prologue|epilogue)$/i,
];

// 목차로 쓸 만한 장 제목 줄인지 판단한다. 긴 문장은 제목으로 보지 않는다.
export function isChapterLine(line = '') {
  const text = line.trim();
  if (!text || text.length > 40) return false;
  return CHAPTER_PATTERNS.some(pattern => pattern.test(text));
}

function plainInline(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`|\*|_)/g, '')
    .trim();
}

function hasMarkdownHeading(lines) {
  let inCode = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    else if (!inCode && /^\s*#{1,3}\s+\S/.test(line)) return true;
  }
  return false;
}

// toc 배열을 넘기면 목차 항목을 모으고 해당 제목에 id를 붙인다.
export function renderMarkdown(markdown = '', toc = null) {
  const lines = String(markdown).replaceAll('\r\n', '\n').split('\n');
  const chapterFallback = toc && !hasMarkdownHeading(lines);
  const blocks = [];
  const addToc = (level, title) => {
    const id = `toc-${toc.length}`;
    toc.push({ id, level, title });
    return id;
  };
  const paragraphLine = line => {
    const bold = line.trim().match(/^\*\*([^*]+)\*\*$/);
    if (chapterFallback && (isChapterLine(line) || (bold && bold[1].length <= 40))) {
      return `<span class="toc-anchor" id="${addToc(1, plainInline(line))}">${renderInline(line)}</span>`;
    }
    return renderInline(line);
  };
  let paragraph = [];
  let list = [];
  let orderedList = [];
  let quote = [];
  let code = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.map(paragraphLine).join('<br>')}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length) {
      blocks.push(`<ul>${list.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      list = [];
    }
    if (orderedList.length) {
      blocks.push(`<ol>${orderedList.map(item => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      orderedList = [];
    }
  };

  const flushQuote = () => {
    if (quote.length) {
      blocks.push(`<blockquote>${quote.map(renderInline).join('<br>')}</blockquote>`);
      quote = [];
    }
  };

  const flushCode = () => {
    if (code.length) {
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      code = [];
    }
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      flushQuote();
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const quoteLine = line.match(/^\s*>\s?(.*)$/);

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
    } else if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      const level = heading[1].length;
      const id = toc && level <= 3 ? ` id="${addToc(level, plainInline(heading[2]))}"` : '';
      blocks.push(`<h${level}${id}>${renderInline(heading[2])}</h${level}>`);
    } else if (unordered) {
      flushParagraph();
      flushQuote();
      if (orderedList.length) flushList();
      list.push(unordered[1]);
    } else if (ordered) {
      flushParagraph();
      flushQuote();
      if (list.length) flushList();
      orderedList.push(ordered[1]);
    } else if (quoteLine) {
      flushParagraph();
      flushList();
      quote.push(quoteLine[1]);
    } else if (/^\s*((---+)|(\*\s*\*\s*\*)|(___+))\s*$/.test(line)) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push('<hr>');
    } else {
      flushList();
      flushQuote();
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  flushQuote();
  flushCode();
  return blocks.join('');
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// TXT는 글자를 그대로 두고 장 제목 줄에만 목차용 id를 붙인다.
export function renderPlainText(text = '', toc = []) {
  return String(text).replaceAll('\r\n', '\n').split('\n').map(line => {
    if (!isChapterLine(line)) return escapeHtml(line);
    const id = `toc-${toc.length}`;
    toc.push({ id, level: 1, title: line.trim() });
    return `<span class="toc-anchor" id="${id}">${escapeHtml(line)}</span>`;
  }).join('\n');
}

export function renderDocument(content = '', kind = 'markdown') {
  const toc = [];
  const html = kind === 'text' ? renderPlainText(content, toc) : renderMarkdown(content, toc);
  return { html, toc };
}

// 읽기 화면을 3×3으로 나눈다. 좌·우 열이 먼저, 가운데 열은 위·아래로 넘긴다.
export function pageAction(x, y, width, height) {
  if (x < width / 3) return 'prev';
  if (x > (width * 2) / 3) return 'next';
  if (y < height / 3) return 'prev';
  if (y > (height * 2) / 3) return 'next';
  return null;
}

export function bookTitle(fileName = '') {
  return String(fileName).replace(/\.[^.]+$/, '') || '제목 없음';
}

export function memoFileName(title) {
  return `메모_${title}.md`;
}

export function formatStamp(ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function byReadingOrder(a, b) {
  return (a.page ?? 0) - (b.page ?? 0) || a.start - b.start || a.createdAt - b.createdAt;
}

const DATA_START = '<!-- ebook-reader-data';

// 사람이 읽는 본문과, 다른 기기에서 되읽을 데이터 블록을 한 파일에 쓴다.
export function buildMemoMarkdown({ title, fileName, bookId, memos, now }) {
  const visible = memos.filter(item => !item.deleted).sort(byReadingOrder);
  const lines = [
    '---',
    `책: ${JSON.stringify(title)}`,
    `원본파일: ${JSON.stringify(fileName)}`,
    `메모수: ${visible.length}`,
    `수정: ${JSON.stringify(formatStamp(now))}`,
    '---',
    '',
    `# ${title} — 메모`,
    '',
    '*이북리더기가 자동으로 쓰는 파일입니다. 여기서 고친 내용은 앱에서 다시 저장할 때 덮어써집니다.*',
    '',
  ];
  visible.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.where || '위치 없음'}`, '');
    lines.push(...item.text.split('\n').map(line => `> ${line}`), '');
    lines.push('**내 생각**', item.thought.trim() ? item.thought : '_(아직 적지 않음)_', '');
    lines.push(`*${formatStamp(item.updatedAt)}*`, '');
  });
  const data = JSON.stringify({ version: 1, bookId, title, fileName, memos }).replaceAll('--', '-\\u002d');
  lines.push(DATA_START, data, '-->', '');
  return lines.join('\n');
}

export function parseMemoData(markdown = '') {
  const start = markdown.lastIndexOf(DATA_START);
  if (start < 0) return null;
  const end = markdown.indexOf('-->', start);
  try {
    const data = JSON.parse(markdown.slice(start + DATA_START.length, end < 0 ? undefined : end));
    return Array.isArray(data.memos) ? data : null;
  } catch {
    return null;
  }
}

// 같은 메모가 양쪽에 있으면 나중에 고친 쪽을 남긴다. 지운 메모도 표시째 남겨 되살아나지 않게 한다.
export function mergeMemos(local = [], remote = []) {
  const merged = new Map();
  for (const item of [...local, ...remote]) {
    const current = merged.get(item.id);
    if (!current || item.updatedAt > current.updatedAt) merged.set(item.id, item);
  }
  return [...merged.values()].sort(byReadingOrder);
}

// 저장된 위치의 글자가 달라졌으면 인용문으로 가장 가까운 자리를 다시 찾는다.
export function findAnchor(fullText, memoItem) {
  const { start, end, text } = memoItem;
  if (fullText.slice(start, end) === text) return { start, end };
  let best = -1;
  for (let at = fullText.indexOf(text); at >= 0; at = fullText.indexOf(text, at + 1)) {
    if (best < 0 || Math.abs(at - start) < Math.abs(best - start)) best = at;
  }
  return best < 0 ? null : { start: best, end: best + text.length };
}

export function trimRange(text, from, to) {
  let start = Math.min(from, to);
  let end = Math.max(from, to);
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return end - start >= 2 ? { start, end } : null;
}

export function describeTextLocation(offset, length, tocWithOffsets = []) {
  const percent = `${Math.floor((offset / Math.max(length, 1)) * 100)}%`;
  const chapter = tocWithOffsets.filter(entry => entry.offset <= offset).at(-1);
  return chapter ? `${chapter.title} · ${percent}` : percent;
}
