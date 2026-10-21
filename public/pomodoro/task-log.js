// 집중 기록(할 일, 시작과 끝 시각, 완료 여부)을 이 기기에 남기고 구글 태스크와 노션으로 보낸다.
(() => {
  const recordsKey = 'pomodoro-dial-records-v1';
  const googleKey = 'pomodoro-dial-google-v1';
  const googleClientId = '450177760064-6g9lk2lcmi6lm0tvgs40pva4n517u1sr.apps.googleusercontent.com';
  const googleScope = 'openid email https://www.googleapis.com/auth/tasks';
  const tasksApi = 'https://tasks.googleapis.com/tasks/v1';
  const taskListTitle = '뽀모도로';
  const notionEndpoint = '/api/pomodoro-notion';
  const statuses = ['진행중', '완료'];
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const byId = (id) => document.getElementById(id);
  const two = (value) => String(Math.floor(Math.abs(value))).padStart(2, '0');

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  const savedRecords = read(recordsKey, []);
  const records = Array.isArray(savedRecords) ? savedRecords : [];
  const google = { accessToken: '', expiresAt: 0, email: '', listId: '', notion: 'unknown', ...read(googleKey, {}) };
  let syncChain = Promise.resolve();
  let syncMessage = '';

  const save = () => localStorage.setItem(recordsKey, JSON.stringify(records));
  const saveGoogle = () => localStorage.setItem(googleKey, JSON.stringify(google));
  const tokenValid = () => Boolean(google.accessToken) && google.expiresAt > Date.now() + 60_000;
  const findRecord = (id) => records.find((record) => record.id === id) || null;

  // 노션과 구글이 시간대를 잃지 않도록 기기 시간대 오프셋을 붙인 ISO 문자열로 남긴다.
  function localIso(date) {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}${sign}${two(offset / 60)}:${two(offset % 60)}`;
  }

  const clockText = (iso) => {
    const date = new Date(iso);
    return `${two(date.getHours())}:${two(date.getMinutes())}`;
  };
  const dayText = (iso) => {
    const date = new Date(iso);
    return `${date.getMonth() + 1}월 ${date.getDate()}일(${weekdays[date.getDay()]})`;
  };
  const stampText = (iso) => `${iso.slice(0, 10)} ${clockText(iso)}`;

  function newId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function changed(record, interactive) {
    record.dirty = { google: true, notion: true };
    save();
    render();
    requestSync(interactive);
  }

  function start({ task, plannedMinutes, now = new Date() }) {
    records.forEach((record) => { record.awaitingAnswer = false; });
    const record = {
      id: newId(),
      task: String(task || '').trim() || '할 일 미입력',
      plannedMinutes,
      startAt: localIso(now),
      endAt: null,
      focusMinutes: null,
      status: '진행중',
      awaitingAnswer: false,
      googleTaskId: null,
      googleTaskUrl: null,
      notionPageId: null,
      notionUrl: null,
    };
    records.push(record);
    changed(record, true);
    return record.id;
  }

  function finish(id, { focusSeconds, now = new Date(), ask = false }) {
    const record = findRecord(id);
    if (!record || record.endAt) return;
    record.endAt = localIso(now);
    record.focusMinutes = Math.round(Math.max(0, focusSeconds) / 6) / 10;
    record.awaitingAnswer = ask;
    changed(record, false);
  }

  function setStatus(id, status) {
    const record = findRecord(id);
    if (!record || !statuses.includes(status)) return;
    record.status = status;
    record.awaitingAnswer = false;
    changed(record, true);
  }

  function requestToken(prompt) {
    return new Promise((resolve, reject) => {
      const oauth = window.google?.accounts?.oauth2;
      if (!oauth) {
        reject(new Error('구글 로그인 스크립트를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
        return;
      }
      oauth.initTokenClient({
        client_id: googleClientId,
        scope: googleScope,
        prompt,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error('구글 연결을 허락받지 못했습니다.'));
            return;
          }
          google.accessToken = response.access_token;
          google.expiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
          saveGoogle();
          resolve();
        },
        error_callback: () => reject(new Error('구글 연결 창이 닫혔습니다.')),
      }).requestAccessToken();
    });
  }

  function queue(task) {
    syncChain = syncChain.then(task).catch((error) => {
      syncMessage = error.message || '보내지 못했습니다.';
      render();
    });
    return syncChain;
  }

  // 브라우저는 사용자가 누른 순간에만 로그인 창을 허락한다. 그래서 누른 동작에서만 토큰을 새로 받는다.
  function requestSync(interactive) {
    if (!google.email) return;
    if (tokenValid()) {
      queue(syncAll);
    } else if (interactive) {
      const tokenReady = requestToken('');
      queue(() => tokenReady.then(syncAll));
    }
  }

  async function googleFetch(path, options = {}) {
    const response = await fetch(`${tasksApi}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${google.accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const error = new Error(`구글 태스크 요청 실패 (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  async function taskListId() {
    if (google.listId) return google.listId;
    const { items = [] } = await googleFetch('/users/@me/lists?maxResults=100');
    const existing = items.find((item) => item.title === taskListTitle);
    google.listId = existing
      ? existing.id
      : (await googleFetch('/users/@me/lists', { method: 'POST', body: JSON.stringify({ title: taskListTitle }) })).id;
    saveGoogle();
    return google.listId;
  }

  function taskBody(record) {
    const lines = [`시작 ${stampText(record.startAt)}`];
    if (record.endAt) lines.push(`종료 ${stampText(record.endAt)}`);
    lines.push(`계획 ${record.plannedMinutes}분${record.focusMinutes === null ? '' : `, 실제 집중 ${record.focusMinutes}분`}`);
    lines.push(`상태 ${record.status}`);
    const body = {
      title: record.task,
      notes: lines.join('\n'),
      due: `${record.startAt.slice(0, 10)}T00:00:00.000Z`,
      status: record.status === '완료' ? 'completed' : 'needsAction',
    };
    if (record.status !== '완료') body.completed = null;
    return body;
  }

  async function syncGoogle(record) {
    const listId = await taskListId();
    if (record.googleTaskId) {
      try {
        const task = await googleFetch(`/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(record.googleTaskId)}`, {
          method: 'PATCH',
          body: JSON.stringify(taskBody(record)),
        });
        record.googleTaskUrl = task?.webViewLink || record.googleTaskUrl;
        return;
      } catch (error) {
        if (error.status !== 404) throw error;
        record.googleTaskId = null;
      }
    }
    let task;
    try {
      task = await googleFetch(`/lists/${encodeURIComponent(listId)}/tasks`, { method: 'POST', body: JSON.stringify(taskBody(record)) });
    } catch (error) {
      // 「뽀모도로」 목록을 지웠으면 다시 만들어 넣는다.
      if (error.status !== 404) throw error;
      google.listId = '';
      task = await googleFetch(`/lists/${encodeURIComponent(await taskListId())}/tasks`, { method: 'POST', body: JSON.stringify(taskBody(record)) });
    }
    record.googleTaskId = task.id;
    record.googleTaskUrl = task.webViewLink || null;
  }

  async function notionRequest(payload) {
    const response = await fetch(notionEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${google.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 403 && result.reason === 'not-owner') {
      google.notion = 'off';
      saveGoogle();
      return null;
    }
    if (!response.ok) {
      const error = new Error(result.error || `노션 요청 실패 (${response.status})`);
      error.status = response.status;
      throw error;
    }
    google.notion = 'on';
    saveGoogle();
    return result;
  }

  async function syncNotion(record) {
    const result = await notionRequest({
      pageId: record.notionPageId,
      record: {
        id: record.id,
        task: record.task,
        status: record.status,
        startAt: record.startAt,
        endAt: record.endAt,
        plannedMinutes: record.plannedMinutes,
        focusMinutes: record.focusMinutes,
        googleTaskUrl: record.googleTaskUrl,
      },
    });
    if (!result) return;
    record.notionPageId = result.pageId;
    record.notionUrl = result.url;
  }

  async function syncAll() {
    syncMessage = '';
    for (const record of records.filter((item) => item.dirty?.google || item.dirty?.notion)) {
      if (!tokenValid()) break;
      record.syncError = '';
      for (const [target, send] of [['google', syncGoogle], ['notion', syncNotion]]) {
        if (!record.dirty[target]) continue;
        if (target === 'notion' && google.notion === 'off') {
          record.dirty.notion = false;
          continue;
        }
        try {
          await send(record);
          record.dirty[target] = false;
        } catch (error) {
          record.syncError = error.message;
          if (error.status === 401) {
            google.accessToken = '';
            google.expiresAt = 0;
            saveGoogle();
          }
        }
      }
      save();
      render();
    }
    render();
  }

  function connectGoogle() {
    const tokenReady = requestToken(google.email ? '' : 'consent');
    syncMessage = '구글 연결 창에서 계정을 고르고 허용을 눌러 주세요.';
    render();
    queue(async () => {
      await tokenReady;
      const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${google.accessToken}` },
      }).then((response) => response.json());
      if (profile.email !== google.email) {
        google.listId = '';
        google.notion = 'unknown';
      }
      google.email = profile.email || '';
      saveGoogle();
      if (google.notion !== 'on') await notionRequest({ check: true }).catch(() => { google.notion = 'error'; });
      await syncAll();
    });
  }

  function disconnectGoogle() {
    if (google.accessToken) window.google?.accounts?.oauth2?.revoke?.(google.accessToken, () => {});
    Object.assign(google, { accessToken: '', expiresAt: 0, email: '', listId: '', notion: 'unknown' });
    saveGoogle();
    syncMessage = '';
    render();
  }

  function syncLabel(record) {
    const mark = (target, name) => {
      if (!google.email) return '';
      if (target === 'notion' && google.notion === 'off') return '';
      return `${name} ${record.dirty?.[target] ? (record.syncError ? '실패' : '대기') : '✓'}`;
    };
    return [mark('google', '구글'), mark('notion', '노션')].filter(Boolean).join(' ');
  }

  function renderStatus() {
    const pending = records.filter((record) => record.dirty?.google || (record.dirty?.notion && google.notion !== 'off')).length;
    const button = byId('google-connect');
    let text;
    if (!google.email) {
      text = '구글을 연결하면 기록이 구글 태스크와 노션에 함께 들어갑니다.';
    } else {
      const notionText = {
        on: '노션 「집중 기록」',
        off: '노션은 주인 계정만 기록',
        error: '노션 연결 확인 실패',
        unknown: '노션 확인 전',
      }[google.notion] || '노션 확인 전';
      text = `${google.email} 연결됨. 구글 태스크 「${taskListTitle}」 목록, ${notionText}.`;
      if (pending) text += tokenValid() ? ` 보내는 중 ${pending}개.` : ` 보낼 기록 ${pending}개는 다음에 시작하거나 상태를 바꿀 때 보냅니다.`;
    }
    byId('sync-status').textContent = syncMessage || text;
    button.textContent = google.email ? '연결 끊기' : '구글 연결';
    button.setAttribute('aria-label', google.email ? '구글 연결 끊기' : '구글 연결');
  }

  function statusControl(record) {
    const select = document.createElement('select');
    select.className = 'log-status';
    select.setAttribute('aria-label', `${record.task} 상태`);
    statuses.forEach((status) => select.append(new Option(status, status, false, record.status === status)));
    select.addEventListener('change', () => setStatus(record.id, select.value));
    return select;
  }

  function renderList() {
    const list = byId('log-list');
    list.replaceChildren();
    let lastDay = '';
    [...records].sort((a, b) => b.startAt.localeCompare(a.startAt)).forEach((record) => {
      const day = dayText(record.startAt);
      if (day !== lastDay) {
        const heading = document.createElement('li');
        heading.className = 'log-day';
        heading.textContent = day;
        list.append(heading);
        lastDay = day;
      }
      const item = document.createElement('li');
      item.className = 'log-item';
      item.dataset.status = record.status;
      item.dataset.recordId = record.id;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'log-check';
      check.checked = record.status === '완료';
      check.setAttribute('aria-label', `${record.task} 완료`);
      check.addEventListener('change', () => setStatus(record.id, check.checked ? '완료' : '진행중'));

      const main = document.createElement('div');
      main.className = 'log-main';
      const task = document.createElement('span');
      task.className = 'log-task';
      task.textContent = record.task;
      const time = document.createElement('span');
      time.className = 'log-time';
      const end = record.endAt ? clockText(record.endAt) : '진행 중';
      const minutes = record.focusMinutes === null ? `계획 ${record.plannedMinutes}분` : `${record.focusMinutes}분 집중`;
      time.textContent = `${clockText(record.startAt)} ~ ${end}, ${minutes}`;
      main.append(task, time);

      const sync = document.createElement('span');
      sync.className = 'log-sync';
      sync.textContent = syncLabel(record);
      if (record.syncError) sync.title = record.syncError;

      item.append(check, main, statusControl(record), sync);
      list.append(item);
    });
    byId('log-empty').hidden = records.length > 0;
  }

  function renderResult() {
    const record = [...records].reverse().find((item) => item.awaitingAnswer);
    byId('task-result').hidden = !record;
    if (!record) return;
    byId('task-result').dataset.recordId = record.id;
    byId('task-result-text').textContent = `「${record.task}」 어떻게 됐나요?`;
  }

  function render() {
    renderStatus();
    renderList();
    renderResult();
  }

  byId('google-connect').addEventListener('click', () => {
    if (google.email) disconnectGoogle();
    else connectGoogle();
  });
  byId('mark-done').addEventListener('click', () => setStatus(byId('task-result').dataset.recordId, '완료'));
  byId('mark-progress').addEventListener('click', () => setStatus(byId('task-result').dataset.recordId, '진행중'));

  const gis = document.createElement('script');
  gis.src = 'https://accounts.google.com/gsi/client';
  gis.async = true;
  document.head.append(gis);

  window.pomodoroLog = { start, finish, setStatus, find: findRecord, localIso };
  render();
  if (google.email && tokenValid()) queue(syncAll);
})();
