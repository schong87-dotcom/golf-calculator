// 뽀모도로 시간, 화면 설정과 알람을 관리한다.
const modeInfo = {
  focus: { label: '집중', description: '집중 시간', minutes: 25 },
  short: { label: '짧은 휴식', description: '짧은 휴식', minutes: 5 },
  long: { label: '긴 휴식', description: '긴 휴식', minutes: 15 },
};

const durationKey = 'pomodoro-dial-durations-v1';
const preferenceKey = 'pomodoro-dial-preferences-v1';
const timerKey = 'pomodoro-dial-timer-v1';
const presetSounds = ['chime', 'bell', 'digital', 'soft'];
const byId = (id) => document.getElementById(id);
const body = document.body;
const modeTabs = [...document.querySelectorAll('.mode-tab')];

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function wholeMinutes(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(60, Math.round(parsed))) : fallback;
}

const durations = Object.fromEntries(
  Object.entries(modeInfo).map(([key, mode]) => [key, wholeMinutes(readStorage(durationKey, {})[key], mode.minutes)]),
);
const savedPreferences = readStorage(preferenceKey, {});
const selectedSound = savedPreferences.sound;
const preferences = {
  accent: savedPreferences.accent === 'green' ? 'green' : 'red',
  theme: savedPreferences.theme === 'dark' ? 'dark' : 'light',
  sound: presetSounds.includes(selectedSound) || selectedSound === 'custom' || /^mac-\d+$/.test(selectedSound || '') ? selectedSound : 'chime',
  volume: Math.max(0, Math.min(100, Number(savedPreferences.volume ?? 70))),
};
const savedTimer = readStorage(timerKey, {});
let mode = modeInfo[savedTimer.mode] ? savedTimer.mode : 'focus';
let timer = { status: 'idle', endAt: null, remaining: durations[mode] * 60 };
const customSounds = new Map();
let audioContext = null;
let audioBufferSource = null;
let wakeLock = null;
let floatingWindow = null;
let alarmSequenceId = 0;
let startNote = '';

if (savedTimer.status === 'paused') {
  timer = { status: 'paused', endAt: null, remaining: Math.max(0, Number(savedTimer.remaining) || 0) };
} else if (savedTimer.status === 'running' && Number.isFinite(Number(savedTimer.endAt))) {
  const remaining = Math.ceil((Number(savedTimer.endAt) - Date.now()) / 1000);
  timer = remaining > 0
    ? { status: 'running', endAt: Number(savedTimer.endAt), remaining }
    : { status: 'done', endAt: null, remaining: 0 };
  if (remaining <= 0) startNote = '시간이 끝났습니다. 소리 들어보기를 눌러 알람을 다시 들을 수 있어요.';
}

function saveDurations() {
  localStorage.setItem(durationKey, JSON.stringify(durations));
}

function savePreferences() {
  localStorage.setItem(preferenceKey, JSON.stringify(preferences));
}

function saveTimer() {
  const remaining = timer.status === 'running'
    ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000))
    : timer.remaining;
  localStorage.setItem(timerKey, JSON.stringify({ mode, status: timer.status, endAt: timer.endAt, remaining }));
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function customSoundId(value) {
  const match = /^mac-(\d+)$/.exec(value || '');
  return match ? Number(match[1]) : null;
}

function activeRemaining() {
  return timer.status === 'running'
    ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000))
    : timer.remaining;
}

function setDialMarks() {
  const tickGroup = byId('dial-ticks');
  const labelGroup = byId('dial-labels');
  for (let minute = 0; minute < 60; minute += 1) {
    const angle = (minute / 60) * Math.PI * 2 - Math.PI / 2;
    const major = minute % 5 === 0;
    const innerRadius = major ? 31.4 : 33.2;
    const outerRadius = major ? 35.3 : 35.1;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(50 + Math.cos(angle) * innerRadius));
    line.setAttribute('y1', String(50 + Math.sin(angle) * innerRadius));
    line.setAttribute('x2', String(50 + Math.cos(angle) * outerRadius));
    line.setAttribute('y2', String(50 + Math.sin(angle) * outerRadius));
    line.setAttribute('class', `dial-tick${major ? ' is-major' : ''}`);
    tickGroup.append(line);

    if (major) {
      const labelRadius = 42.3;
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(50 + Math.cos(angle) * labelRadius));
      label.setAttribute('y', String(50 + Math.sin(angle) * labelRadius));
      label.setAttribute('class', 'dial-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.textContent = String(minute);
      labelGroup.append(label);
    }
  }
}

function sectorPath(minutes) {
  const value = Math.max(0, Math.min(60, minutes));
  if (value <= 0) return '';
  if (value >= 60) return 'M 50 14 A 36 36 0 1 1 50 86 A 36 36 0 1 1 50 14 Z';
  const angle = (value / 60) * Math.PI * 2;
  const x = 50 + Math.sin(angle) * 36;
  const y = 50 - Math.cos(angle) * 36;
  const longArc = value > 30 ? 1 : 0;
  return `M 50 50 L 50 14 A 36 36 0 ${longArc} 1 ${x} ${y} Z`;
}

function setDialHandle(svg, minutes) {
  const handle = svg.querySelector('#dial-handle');
  if (!handle) return;
  const angle = (Math.max(0, Math.min(60, minutes)) / 60) * Math.PI * 2 - Math.PI / 2;
  handle.setAttribute('cx', String(50 + Math.cos(angle) * 36));
  handle.setAttribute('cy', String(50 + Math.sin(angle) * 36));
}

function minutesAtDialPointer(event, svg) {
  const bounds = svg.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const x = ((event.clientX - bounds.left) / bounds.width) * 100;
  const y = ((event.clientY - bounds.top) / bounds.height) * 100;
  const radius = Math.hypot(x - 50, y - 50);
  if (radius < 29 || radius > 48.5) return null;
  const angle = (Math.atan2(y - 50, x - 50) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  const minutes = Math.round((angle / (Math.PI * 2)) * 60);
  return minutes || 60;
}

function attachDialDrag(svg) {
  let pointerId = null;
  const applyPointerTime = (event) => {
    const minutes = minutesAtDialPointer(event, svg);
    if (minutes === null || minutes === durations[mode]) return;
    adjustDuration(minutes - durations[mode]);
  };

  svg.addEventListener('pointerdown', (event) => {
    if (timer.status === 'running' || !event.isPrimary || event.button !== 0) return;
    if (minutesAtDialPointer(event, svg) === null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    svg.setPointerCapture(pointerId);
    svg.classList.add('is-dragging');
    applyPointerTime(event);
  });
  svg.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointerId) applyPointerTime(event);
  });
  const finishDrag = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    svg.classList.remove('is-dragging');
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  };
  svg.addEventListener('pointerup', finishDrag);
  svg.addEventListener('pointercancel', finishDrag);
}

function noteForStatus() {
  if (startNote) return startNote;
  if (timer.status === 'running') return mode === 'focus' ? '집중 중입니다. 지금 하던 일에만 머물러 보세요.' : '편안하게 쉬어 가세요.';
  if (timer.status === 'paused') return '잠시 멈췄습니다. 준비되면 다시 시작하세요.';
  if (timer.status === 'done') return '시간이 끝났습니다. 잠깐 숨을 고르세요.';
  return mode === 'focus' ? '지금 하는 일 하나에 집중해 보세요.' : '잠깐 쉬고 다음 시간에 다시 시작하세요.';
}

function render() {
  const remaining = activeRemaining();
  const currentMode = modeInfo[mode];
  const minutesLeft = remaining / 60;
  byId('time-display').textContent = formatTime(remaining);
  byId('clock-mode').textContent = currentMode.label;
  byId('duration-label').textContent = currentMode.description;
  byId('duration-value').textContent = `${durations[mode]}분`;
  byId('phase-note').textContent = noteForStatus();
  byId('dial-sector').setAttribute('d', sectorPath(minutesLeft));
  setDialHandle(byId('dial-svg'), minutesLeft);
  byId('dial-svg').setAttribute('aria-label', `${currentMode.label}, ${formatTime(remaining)} 남음. 바깥 눈금을 드래그해 시간을 조절할 수 있습니다.`);
  byId('timer-toggle').setAttribute('aria-label', timer.status === 'running' ? '일시정지' : timer.status === 'done' ? '다시 시작' : '타이머 시작');
  byId('timer-toggle-label').textContent = timer.status === 'running' ? '일시정지' : timer.status === 'done' ? '다시 시작' : '시작';
  byId('toggle-glyph').textContent = timer.status === 'running' ? 'Ⅱ' : '▶';
  byId('decrease-time').disabled = timer.status === 'running' || durations[mode] <= 1;
  byId('increase-time').disabled = timer.status === 'running' || durations[mode] >= 60;
  modeTabs.forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-pressed', String(selected));
  });
  saveTimer();
  updateFloatingClock();
}

function applyPreferences() {
  body.dataset.accent = preferences.accent;
  body.dataset.theme = preferences.theme;
  document.querySelector(`#accent-${preferences.accent}`).checked = true;
  byId('theme-toggle').setAttribute('aria-pressed', String(preferences.theme === 'dark'));
  byId('theme-toggle').setAttribute('aria-label', preferences.theme === 'dark' ? '라이트 모드 켜기' : '다크 모드 켜기');
  byId('theme-description').textContent = preferences.theme === 'dark' ? '어두운 배경' : '밝은 배경';
  byId('sound-select').value = preferences.sound;
  byId('volume-control').value = String(preferences.volume);
  byId('volume-value').textContent = `${preferences.volume}%`;
  document.querySelector('meta[name="theme-color"]').content = preferences.theme === 'dark' ? '#171817' : '#fffdf9';
  updateFloatingClock();
}

function updateFloatingButton() {
  const isOpen = Boolean(floatingWindow && !floatingWindow.closed);
  byId('floating-button-label').textContent = isOpen ? '최상위 모드 닫기' : '최상위 모드';
  byId('floating-button').setAttribute('aria-label', isOpen ? '최상위 모드 닫기' : '최상위 모드');
}

function updateFloatingClock() {
  if (!floatingWindow || floatingWindow.closed) return;
  const pipDocument = floatingWindow.document;
  const remaining = activeRemaining();
  const currentMode = modeInfo[mode];
  const pipSvg = pipDocument.getElementById('pip-dial-svg');
  if (!pipSvg) return;
  pipDocument.body.dataset.accent = preferences.accent;
  pipDocument.body.dataset.theme = preferences.theme;
  pipDocument.getElementById('pip-sector').setAttribute('d', sectorPath(remaining / 60));
  setDialHandle(pipSvg, remaining / 60);
  pipSvg.setAttribute('aria-label', `${currentMode.label}, ${formatTime(remaining)} 남음`);
  pipDocument.getElementById('pip-mode').textContent = currentMode.label;
  pipDocument.getElementById('pip-time').textContent = formatTime(remaining);
}

async function openFloatingClock() {
  const pictureInPicture = window.documentPictureInPicture;
  if (!pictureInPicture) return;
  const size = Math.round(Math.min(300, Math.max(180, (screen.availWidth || 1920) * 0.12)));
  const pipWindow = await pictureInPicture.requestWindow({ width: size, height: size });
  try { pipWindow.resizeTo(size, size); } catch { /* 브라우저에 따라 문서 창 크기 변경을 지원하지 않는다. */ }
  floatingWindow = pipWindow;
  const pipDocument = pipWindow.document;
  pipDocument.title = '뽀모도로 최상위 모드';
  const viewport = pipDocument.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1';
  const stylesheet = pipDocument.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./styles.css', document.baseURI).href;
  pipDocument.head.append(viewport, stylesheet);

  const clock = pipDocument.createElement('main');
  clock.className = 'pip-clock';
  clock.setAttribute('aria-label', '항상 위에 표시하는 뽀모도로 시계');
  clock.innerHTML = '<div class="pip-dial-shell"></div><div class="pip-center"><span class="pip-mode" id="pip-mode"></span><time class="pip-time" id="pip-time"></time></div>';
  const pipSvg = byId('dial-svg').cloneNode(true);
  pipSvg.id = 'pip-dial-svg';
  pipSvg.querySelector('#dial-sector').id = 'pip-sector';
  clock.querySelector('.pip-dial-shell').append(pipSvg);
  pipDocument.body.className = 'pip-body';
  pipDocument.body.dataset.accent = preferences.accent;
  pipDocument.body.dataset.theme = preferences.theme;
  pipDocument.body.replaceChildren(clock);
  attachDialDrag(pipSvg);
  pipWindow.addEventListener('pagehide', () => {
    if (floatingWindow === pipWindow) floatingWindow = null;
    updateFloatingButton();
  });
  updateFloatingButton();
  updateFloatingClock();
}

function selectMode(nextMode) {
  if (!modeInfo[nextMode] || nextMode === mode) return;
  releaseWakeLock();
  mode = nextMode;
  timer = { status: 'idle', endAt: null, remaining: durations[mode] * 60 };
  startNote = '';
  render();
}

function adjustDuration(amount) {
  if (timer.status === 'running') return;
  durations[mode] = wholeMinutes(durations[mode] + amount, modeInfo[mode].minutes);
  timer = { status: 'idle', endAt: null, remaining: durations[mode] * 60 };
  startNote = '';
  saveDurations();
  render();
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || timer.status !== 'running') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) void wakeLock.release().catch(() => {});
  wakeLock = null;
}

function completeTimer(playSound = true) {
  timer = { status: 'done', endAt: null, remaining: 0 };
  startNote = '';
  releaseWakeLock();
  render();
  if (playSound) {
    void playAlarm(3).then((completed) => {
      if (!completed) return;
      try {
        if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
          const announcement = new SpeechSynthesisUtterance(noteForStatus());
          announcement.lang = 'ko-KR';
          announcement.volume = preferences.volume / 100;
          window.speechSynthesis.speak(announcement);
        }
      } catch {
        // 음성 안내를 쓸 수 없어도 타이머 종료와 PiP 정리는 계속한다.
      }
      if (floatingWindow && !floatingWindow.closed) floatingWindow.close();
    });
  }
}

function updateCountdown() {
  if (timer.status !== 'running') return;
  timer.remaining = activeRemaining();
  if (timer.remaining <= 0) completeTimer(true);
  else render();
}

function getAudioContext() {
  if (!audioContext) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error('이 브라우저에서는 알람 재생을 지원하지 않습니다.');
    audioContext = new Context();
  }
  return audioContext;
}

function presetTones(name) {
  if (name === 'bell') return [784, 988, 1175];
  if (name === 'digital') return [880, 0, 880, 0, 1047];
  if (name === 'soft') return [523, 659, 784];
  return [659, 831, 1047];
}

function playPreset(name) {
  const context = getAudioContext();
  const master = context.createGain();
  master.gain.value = preferences.volume / 100;
  master.connect(context.destination);
  const tones = presetTones(name);
  const spacing = name === 'digital' ? 0.22 : 0.2;
  return new Promise((resolve) => {
    let pendingTones = tones.filter(Boolean).length;
    tones.forEach((frequency, index) => {
      if (!frequency) return;
      const start = context.currentTime + 0.04 + index * spacing;
      const duration = name === 'digital' ? 0.12 : 0.48;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = name === 'digital' ? 'square' : name === 'soft' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(name === 'digital' ? 0.28 : 0.22, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.onended = () => {
        pendingTones -= 1;
        if (pendingTones === 0) {
          master.disconnect();
          resolve();
        }
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    });
  });
}

function fourCC(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function extendedSampleRate(view, offset) {
  const exponentWord = view.getUint16(offset, false);
  const exponent = (exponentWord & 0x7fff) - 16383;
  const mantissa = view.getBigUint64(offset + 2, false);
  const normalized = Number(mantissa) / (2 ** 63);
  return Math.round(normalized * (2 ** exponent) * (exponentWord & 0x8000 ? -1 : 1));
}

function aiffToWav(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const formType = fourCC(bytes, 8);
  if (fourCC(bytes, 0) !== 'FORM' || !['AIFF', 'AIFC'].includes(formType)) {
    throw new Error('이 브라우저에서 읽을 수 없는 오디오 형식입니다.');
  }

  let channels = 0;
  let frameCount = 0;
  let sampleBits = 0;
  let sampleRate = 0;
  let compression = 'NONE';
  let sampleOffset = 0;
  let sampleBytes = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkType = fourCC(bytes, offset);
    const chunkSize = view.getUint32(offset + 4, false);
    const chunkStart = offset + 8;
    if (chunkStart + chunkSize > bytes.length) throw new Error('오디오 파일의 내용이 올바르지 않습니다.');
    if (chunkType === 'COMM') {
      channels = view.getUint16(chunkStart, false);
      frameCount = view.getUint32(chunkStart + 2, false);
      sampleBits = view.getUint16(chunkStart + 6, false);
      sampleRate = extendedSampleRate(view, chunkStart + 8);
      if (formType === 'AIFC') compression = fourCC(bytes, chunkStart + 18);
    }
    if (chunkType === 'SSND') {
      const soundOffset = view.getUint32(chunkStart, false);
      sampleOffset = chunkStart + 8 + soundOffset;
      sampleBytes = chunkSize - 8 - soundOffset;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  const littleEndian = compression === 'sowt';
  const floatSamples = compression.toLowerCase() === 'fl32';
  if (!channels || !frameCount || !sampleRate || !sampleBytes || sampleOffset + sampleBytes > bytes.length) {
    throw new Error('오디오 파일의 내용을 읽지 못했습니다.');
  }
  if (!['NONE', 'twos', 'sowt', 'fl32'].includes(compression) || ![8, 16, 24, 32].includes(sampleBits)) {
    throw new Error('지원하지 않는 AIFF 압축 형식입니다.');
  }

  const bytesPerSample = sampleBits / 8;
  const sampleCount = Math.min(frameCount * channels, Math.floor(sampleBytes / bytesPerSample));
  const dataLength = sampleCount * 2;
  const wav = new ArrayBuffer(44 + dataLength);
  const wavBytes = new Uint8Array(wav);
  const wavView = new DataView(wav);
  const writeTag = (tag, offset) => wavBytes.set(new TextEncoder().encode(tag), offset);
  writeTag('RIFF', 0);
  wavView.setUint32(4, 36 + dataLength, true);
  writeTag('WAVE', 8);
  writeTag('fmt ', 12);
  wavView.setUint32(16, 16, true);
  wavView.setUint16(20, 1, true);
  wavView.setUint16(22, channels, true);
  wavView.setUint32(24, sampleRate, true);
  wavView.setUint32(28, sampleRate * channels * 2, true);
  wavView.setUint16(32, channels * 2, true);
  wavView.setUint16(34, 16, true);
  writeTag('data', 36);
  wavView.setUint32(40, dataLength, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const offset = sampleOffset + index * bytesPerSample;
    let sample;
    if (floatSamples) {
      sample = Math.max(-1, Math.min(1, view.getFloat32(offset, false))) * 32767;
    } else if (sampleBits === 8) {
      sample = view.getInt8(offset) * 256;
    } else if (sampleBits === 16) {
      sample = view.getInt16(offset, littleEndian);
    } else if (sampleBits === 24) {
      const first = bytes[offset + (littleEndian ? 2 : 0)];
      const middle = bytes[offset + 1];
      const last = bytes[offset + (littleEndian ? 0 : 2)];
      let value = (first << 16) | (middle << 8) | last;
      if (value & 0x800000) value -= 0x1000000;
      sample = value >> 8;
    } else {
      sample = view.getInt32(offset, littleEndian) / 65536;
    }
    wavView.setInt16(44 + index * 2, Math.max(-32768, Math.min(32767, Math.round(sample))), true);
  }
  return wav;
}

async function decodeImportedAudio(blob) {
  const context = getAudioContext();
  const data = await blob.arrayBuffer();
  try {
    return await context.decodeAudioData(data.slice(0));
  } catch {
    return context.decodeAudioData(aiffToWav(data));
  }
}

async function playAlarm(repeatCount = 1) {
  const sequenceId = ++alarmSequenceId;
  if (audioBufferSource) {
    try { audioBufferSource.stop(); } catch { /* 이미 끝난 알람의 재생 중지는 무시한다. */ }
    audioBufferSource = null;
  }
  try {
    const selectedCustomSound = customSoundId(preferences.sound);
    let customSound = null;
    if (selectedCustomSound !== null) {
      if (!customSounds.has(selectedCustomSound)) await loadSoundLibrary();
      customSound = customSounds.get(selectedCustomSound);
      if (!customSound) throw new Error('가져온 소리를 찾을 수 없습니다.');
    }
    const context = getAudioContext();
    await context.resume();
    for (let repetition = 0; repetition < repeatCount; repetition += 1) {
      if (sequenceId !== alarmSequenceId) return false;
      if (customSound) {
        await new Promise((resolve, reject) => {
          const source = context.createBufferSource();
          const gain = context.createGain();
          source.buffer = customSound.buffer;
          gain.gain.value = preferences.volume / 100;
          source.connect(gain);
          gain.connect(context.destination);
          source.onended = () => {
            if (audioBufferSource === source) audioBufferSource = null;
            resolve();
          };
          audioBufferSource = source;
          try { source.start(); } catch (error) { reject(error); }
        });
      } else {
        await playPreset(preferences.sound);
      }
      if (repetition < repeatCount - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 320));
      }
    }
    return true;
  } catch (error) {
    byId('sound-status').textContent = error.message || '알람을 재생하지 못했습니다.';
    byId('sound-status').dataset.error = 'true';
    return false;
  }
}

function openSoundDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('이 브라우저에서는 소리를 저장할 수 없습니다.'));
      return;
    }
    const request = indexedDB.open('pomodoro-dial-sounds', 2);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains('library')) {
        database.createObjectStore('library', { keyPath: 'id', autoIncrement: true });
      }
      if (event.oldVersion === 1 && database.objectStoreNames.contains('sounds')) {
        const legacy = request.transaction.objectStore('sounds').get('custom');
        legacy.onsuccess = () => {
          if (legacy.result?.blob) request.transaction.objectStore('library').add(legacy.result);
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('소리 저장소를 열지 못했습니다.'));
  });
}

function addSoundOption(record) {
  const option = document.createElement('option');
  option.value = `mac-${record.id}`;
  option.textContent = record.name;
  option.dataset.soundId = String(record.id);
  byId('sound-select').append(option);
}

async function readSoundRecords() {
  const database = await openSoundDatabase();
  const records = await new Promise((resolve, reject) => {
    const request = database.transaction('library').objectStore('library').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('저장한 소리를 읽지 못했습니다.'));
  });
  database.close();
  return records;
}

async function loadSoundLibrary() {
  const records = await readSoundRecords();
  for (const record of records) {
    const id = Number(record.id);
    if (customSounds.has(id)) continue;
    try {
      const buffer = await decodeImportedAudio(record.blob);
      customSounds.set(id, { buffer, name: record.name });
      addSoundOption({ id, name: record.name });
    } catch {
      continue;
    }
  }
  if (preferences.sound === 'custom' && records.length) preferences.sound = `mac-${records[0].id}`;
  if (preferences.sound === 'custom' && !records.length) preferences.sound = 'chime';
  if (customSoundId(preferences.sound) !== null && !customSounds.has(customSoundId(preferences.sound))) {
    preferences.sound = 'chime';
  }
  savePreferences();
  byId('sound-select').value = preferences.sound;
  const selected = customSounds.get(customSoundId(preferences.sound));
  if (selected) byId('sound-status').textContent = `${selected.name}을(를) 불러왔습니다.`;
}

async function saveCustomSound(file) {
  const buffer = await decodeImportedAudio(file);
  const database = await openSoundDatabase();
  const id = await new Promise((resolve, reject) => {
    const transaction = database.transaction('library', 'readwrite');
    const request = transaction.objectStore('library').add({ blob: file, name: file.name, type: file.type });
    let key;
    request.onsuccess = () => { key = request.result; };
    transaction.oncomplete = () => resolve(Number(key));
    transaction.onerror = () => reject(transaction.error || new Error('소리를 저장하지 못했습니다.'));
    transaction.onabort = () => reject(transaction.error || new Error('소리를 저장하지 못했습니다.'));
  });
  database.close();
  customSounds.set(id, { buffer, name: file.name });
  addSoundOption({ id, name: file.name });
  preferences.sound = `mac-${id}`;
  savePreferences();
  byId('sound-select').value = preferences.sound;
  byId('sound-status').textContent = `${file.name}을(를) 가져왔습니다. 이 기기에 저장했습니다.`;
  delete byId('sound-status').dataset.error;
}

byId('timer-toggle').addEventListener('click', async () => {
  startNote = '';
  if (timer.status === 'running') {
    timer = { status: 'paused', endAt: null, remaining: activeRemaining() };
    releaseWakeLock();
  } else {
    if (timer.status === 'done') timer.remaining = durations[mode] * 60;
    if (timer.status === 'idle') timer.remaining = durations[mode] * 60;
    timer.endAt = Date.now() + timer.remaining * 1000;
    timer.status = 'running';
    void getAudioContext().resume().catch(() => {});
    await requestWakeLock();
  }
  render();
});

byId('decrease-time').addEventListener('click', () => adjustDuration(-1));
byId('increase-time').addEventListener('click', () => adjustDuration(1));
byId('reset-button').addEventListener('click', () => {
  releaseWakeLock();
  startNote = '';
  timer = { status: 'idle', endAt: null, remaining: durations[mode] * 60 };
  render();
});
modeTabs.forEach((tab) => tab.addEventListener('click', () => selectMode(tab.dataset.mode)));

document.querySelectorAll('input[name="accent"]').forEach((input) => {
  input.addEventListener('change', () => {
    preferences.accent = input.value;
    savePreferences();
    applyPreferences();
  });
});

byId('theme-toggle').addEventListener('click', () => {
  preferences.theme = preferences.theme === 'dark' ? 'light' : 'dark';
  savePreferences();
  applyPreferences();
});

byId('sound-select').addEventListener('change', (event) => {
  preferences.sound = event.target.value;
  savePreferences();
  const customSound = customSounds.get(customSoundId(preferences.sound));
  byId('sound-status').textContent = customSound
    ? `${customSound.name}을(를) 선택했습니다.`
    : '소리를 바꾸면 다음 알람부터 적용됩니다.';
  delete byId('sound-status').dataset.error;
});

byId('sound-test').addEventListener('click', () => {
  startNote = '';
  void playAlarm();
});

byId('floating-button').addEventListener('click', async () => {
  if (floatingWindow && !floatingWindow.closed) {
    floatingWindow.close();
    return;
  }
  try {
    await openFloatingClock();
  } catch {
    byId('phase-note').textContent = '최상위 모드를 열지 못했습니다. 브라우저의 PiP 창 설정을 확인해 주세요.';
  }
});

byId('custom-sound-file').addEventListener('change', async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    await saveCustomSound(file);
  } catch {
    byId('sound-status').textContent = '이 파일을 재생할 수 없습니다. 다른 오디오 파일을 선택해 주세요.';
    byId('sound-status').dataset.error = 'true';
  }
  event.target.value = '';
});

byId('volume-control').addEventListener('input', (event) => {
  preferences.volume = Number(event.target.value);
  byId('volume-value').textContent = `${preferences.volume}%`;
  savePreferences();
});

byId('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    syncFullscreenState();
  } catch {
    byId('phase-note').textContent = '브라우저에서 전체화면을 허용해 주세요.';
  }
});

byId('fullscreen-exit').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    syncFullscreenState();
  } catch {
    byId('phase-note').textContent = '전체화면을 닫을 수 없습니다. Escape 키를 눌러 종료해 주세요.';
  }
});

function syncFullscreenState() {
  body.dataset.fullscreen = String(Boolean(document.fullscreenElement));
}

document.addEventListener('fullscreenchange', syncFullscreenState);
document.addEventListener('keyup', (event) => {
  if (event.key === 'Escape') syncFullscreenState();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    updateCountdown();
    void requestWakeLock();
  }
});

window.addEventListener('pagehide', saveTimer);
setInterval(() => {
  syncFullscreenState();
  updateCountdown();
}, 250);

const floatingButton = byId('floating-button');
const floatingModeSupported = 'documentPictureInPicture' in window;
const compactViewport = window.matchMedia('(max-width: 720px)');
floatingButton.disabled = !floatingModeSupported;
floatingButton.hidden = compactViewport.matches;
if (!floatingModeSupported) floatingButton.title = '최상위 모드는 데스크톱 Chrome 또는 Edge에서 사용할 수 있습니다.';
compactViewport.addEventListener('change', (event) => { floatingButton.hidden = event.matches; });
attachDialDrag(byId('dial-svg'));
applyPreferences();
setDialMarks();
render();
void loadSoundLibrary().catch(() => {
  byId('sound-status').textContent = '저장한 소리를 불러오지 못했습니다.';
  byId('sound-status').dataset.error = 'true';
});
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
