// 이북리더기의 파일 분류와 안전한 Markdown 표시를 담당하는 순수 함수 모음.

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getFileKind(fileName = '') {
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

export function renderMarkdown(markdown = '') {
  const lines = String(markdown).replaceAll('\r\n', '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = [];
  let orderedList = [];
  let quote = [];
  let code = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
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
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
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
