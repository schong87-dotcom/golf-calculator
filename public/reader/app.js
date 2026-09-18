// 파일 선택과 보기 설정을 연결해 읽기 화면을 운영하는 브라우저 앱.

import { clamp, formatBytes, getFileKind, renderMarkdown } from './reader-core.js';

const SAMPLE_TEXT = `# 이북리더기

읽고 싶은 텍스트나 Markdown 파일을 이 화면에 올려보세요.

## 읽는 동안 필요한 것만

- 글자 크기는 양쪽 버튼으로 조절합니다.
- 보기 설정에서 글자 색과 라이트모드 배경을 바꿉니다.
- 오른쪽 위 달 아이콘으로 어두운 화면으로 전환합니다.

파일은 서버로 전송하지 않고, 지금 사용 중인 브라우저 안에서만 읽습니다.`;

const LIGHT_TEXT = '#2c2925';
const DARK_TEXT = '#ebe5da';
const DEFAULTS = {
  theme: 'light',
  paper: '#f7f4ed',
  fontSize: 19,
  textColor: LIGHT_TEXT,
};

const state = {
  ...DEFAULTS,
  fileName: '환영합니다',
  fileSize: '읽기 안내',
  fileKind: 'sample',
  content: SAMPLE_TEXT,
};

const elements = {
  root: document.documentElement,
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
};

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
  const characters = state.content.length.toLocaleString('ko-KR');
  const paragraphs = state.content.split(/\n\s*\n/).filter(Boolean).length;
  elements.readingStats.textContent = `${characters}자 · ${paragraphs}개 문단`;
}

function render() {
  const isDark = state.theme === 'dark';
  elements.root.dataset.theme = state.theme;
  elements.root.style.setProperty('--reader-bg', isDark ? '#1b1a17' : state.paper);
  elements.root.style.setProperty('--reader-text', state.textColor);
  elements.root.style.setProperty('--reader-font-size', `${state.fontSize}px`);
  elements.fontSizeValue.textContent = `${state.fontSize}px`;
  elements.textColor.value = state.textColor;
  elements.textColorValue.textContent = state.textColor.toUpperCase();
  elements.themeIcon.textContent = isDark ? '☀' : '☾';
  elements.themeToggle.setAttribute('aria-label', isDark ? '라이트모드로 전환' : '다크모드로 전환');
  elements.themeToggle.setAttribute('aria-pressed', String(isDark));
  elements.fileType.textContent = state.fileKind === 'markdown' ? 'MARKDOWN' : state.fileKind === 'text' ? 'TEXT' : 'SAMPLE';
  elements.fileName.textContent = state.fileName;
  elements.fileSize.textContent = state.fileSize;
  elements.readingContent.classList.toggle('plain-content', state.fileKind === 'text');
  elements.readingContent.classList.toggle('markdown-content', state.fileKind !== 'text');
  elements.readingContent.innerHTML = state.fileKind === 'text' ? escapePlainText(state.content) : renderMarkdown(state.content);
  document.querySelectorAll('.paper-swatch').forEach(swatch => {
    const selected = swatch.dataset.paper === state.paper;
    swatch.classList.toggle('is-selected', selected);
    swatch.setAttribute('aria-pressed', String(selected));
  });
  updateReadingStats();
}

function escapePlainText(value) {
  const wrapper = document.createElement('div');
  wrapper.textContent = value;
  return wrapper.innerHTML;
}

function toggleTheme() {
  const previousTheme = state.theme;
  state.theme = previousTheme === 'light' ? 'dark' : 'light';
  if (state.textColor === LIGHT_TEXT && state.theme === 'dark') state.textColor = DARK_TEXT;
  if (state.textColor === DARK_TEXT && state.theme === 'light') state.textColor = LIGHT_TEXT;
  savePreferences();
  render();
}

async function openFile(file) {
  if (!file) return;
  const kind = getFileKind(file.name);
  state.content = await file.text();
  state.fileName = file.name;
  state.fileSize = formatBytes(file.size);
  state.fileKind = kind;
  render();
}

function handleDrop(event) {
  event.preventDefault();
  elements.dropZone.classList.remove('is-dragging');
  const [file] = event.dataTransfer.files;
  if (file) openFile(file);
}

elements.fileInput.addEventListener('change', event => openFile(event.target.files[0]));
elements.themeToggle.addEventListener('click', toggleTheme);
elements.settingsToggle.addEventListener('click', () => {
  const isOpen = !elements.settingsPanel.hidden;
  elements.settingsPanel.hidden = isOpen;
  elements.settingsToggle.setAttribute('aria-expanded', String(!isOpen));
});
elements.fontDecrease.addEventListener('click', () => {
  state.fontSize = clamp(state.fontSize - 1, 16, 28);
  savePreferences();
  render();
});
elements.fontIncrease.addEventListener('click', () => {
  state.fontSize = clamp(state.fontSize + 1, 16, 28);
  savePreferences();
  render();
});
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

loadPreferences();
render();
