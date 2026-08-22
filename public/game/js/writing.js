// 쓰기게임 화면 — 각 항목명을 직접 타이핑해서 완성
(function(){
  const WritingView = {};

  let S = null;

  // ---------- 상태 ----------
  function initState(gameId) {
    const { baseId } = window.parseGameId(gameId);
    const def = window.GAMES[baseId];
    if (!def) return false;
    S = {
      gameId,                // 'write:income-statement' 등 (기록 키)
      def,                   // 원본 게임 정의 (items, title 등 재사용)
      filled: def.items.map(() => false),
      started: false,
      startAt: null,
      elapsed: 0,
      timerHandle: null,
      finished: false,
      lastRun: null,
    };
    return true;
  }

  function startTimer() {
    if (!S || S.started || S.finished) return;
    S.started = true;
    S.startAt = Date.now();
    S.timerHandle = setInterval(() => {
      S.elapsed = Math.floor((Date.now() - S.startAt) / 1000);
      const el = document.getElementById('timer-display');
      if (el) el.textContent = UI.formatElapsed(S.elapsed);
    }, 250);
    renderGame();
    setTimeout(() => {
      const first = document.querySelector('input[data-write-idx]:not([readonly])');
      if (first) first.focus();
    }, 50);
  }

  function stopTimer() {
    if (S && S.timerHandle) {
      clearInterval(S.timerHandle);
      S.timerHandle = null;
    }
  }

  // ---------- 입력 처리 ----------
  function onInputChange(idx, value) {
    if (!S || !S.started || S.finished || S.filled[idx]) return;
    const v = (value || '').trim();
    const item = S.def.items[idx];
    const accepts = item.accepts || [item.name];
    const inp = document.querySelector(`input[data-write-idx="${idx}"]`);
    if (!inp) return;

    if (accepts.includes(v)) {
      S.filled[idx] = true;
      inp.value = item.name;  // 잠근 후엔 정식 명칭으로 표시 (학습 목적)
      inp.readOnly = true;
      inp.classList.remove('bg-white','border-gray-200','focus:border-blue-500','focus:ring-blue-100','border-red-300','bg-red-50');
      inp.classList.add('bg-emerald-50','border-emerald-400','text-emerald-700','font-bold');
      const countEl = document.getElementById('progress-count');
      if (countEl) {
        const n = S.filled.filter(x=>x).length;
        countEl.textContent = `${n} / ${S.def.items.length}`;
      }
      focusNextEmpty(idx);
      if (S.filled.every(x => x)) finishGame();
    } else {
      // 가장 긴 정답 길이 이상으로 입력했는데 일치 안 하면 잘못 입력 → 빨간 테두리 (수정 가능)
      const maxLen = Math.max.apply(null, accepts.map(a => a.length));
      if (v.length >= maxLen) {
        inp.classList.add('border-red-300','bg-red-50');
        inp.classList.remove('border-gray-200');
      } else {
        inp.classList.remove('border-red-300','bg-red-50');
        if (!inp.classList.contains('border-emerald-400')) inp.classList.add('border-gray-200');
      }
    }
  }

  function focusNextEmpty(fromIdx) {
    const total = S.def.items.length;
    for (let i = 1; i <= total; i++) {
      const next = (fromIdx + i) % total;
      if (!S.filled[next]) {
        const inp = document.querySelector(`input[data-write-idx="${next}"]`);
        if (inp) inp.focus();
        return;
      }
    }
  }

  // ---------- 완료 처리 ----------
  function finishGame() {
    S.finished = true;
    stopTimer();
    const user = Auth.getUser();
    const res = Records.save(user.name, S.gameId, S.elapsed);
    S.lastRun = { timeSec: S.elapsed, improved: res.improved, prevBest: res.prevBest };
    renderGame();
    launchConfetti();
  }

  function launchConfetti() {
    const colors = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
    const layer = document.createElement('div');
    layer.className = 'pointer-events-none fixed inset-0 overflow-hidden';
    layer.style.zIndex = '45';
    for (let i = 0; i < 90; i++) {
      const d = document.createElement('div');
      d.className = 'confetti-piece';
      const size = Math.random() * 10 + 6;
      d.style.left = (Math.random() * 100) + '%';
      d.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      d.style.width = size + 'px';
      d.style.height = size + 'px';
      d.style.animationDuration = (Math.random() * 2 + 2.2) + 's';
      d.style.animationDelay = (Math.random() * 0.6) + 's';
      d.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      layer.appendChild(d);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 4500);
    setTimeout(() => {
      const banner = document.getElementById('success-banner');
      if (!banner) return;
      for (let i = 0; i < 8; i++) {
        const s = document.createElement('span');
        s.textContent = ['✨','🎉','⭐','💫','🎊'][i % 5];
        s.className = 'sparkle absolute text-2xl';
        s.style.left = (Math.random() * 90 + 5) + '%';
        s.style.top = (Math.random() * 70 + 10) + '%';
        s.style.animationDelay = (i * 0.08) + 's';
        banner.appendChild(s);
        setTimeout(() => s.remove(), 1300);
      }
    }, 100);
  }

  // ---------- 이탈 방지 ----------
  function confirmLeave(title, message, action) {
    UI.modal({
      title, message,
      buttons: [
        { label: '계속 하기', variant: 'secondary' },
        { label: '확인', variant: 'primary', onClick: action },
      ],
    });
  }

  // ---------- 렌더링 ----------
  function successBannerHTML() {
    const r = S.lastRun;
    const best = Records.best(Auth.getUser().name, S.gameId);
    const isBest = r.improved;
    return `
      <div id="success-banner"
           class="relative overflow-hidden bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-300 text-gray-900 rounded-2xl shadow-xl ring-2 ring-amber-200 p-4 sm:p-6 mb-3 pulse-success">
        <div class="flex items-center justify-center gap-2 text-sm sm:text-base font-semibold text-amber-900/80 mb-1">
          ${UI.icon('trophy','w-5 h-5 text-amber-700')}
          <span>${isBest ? '🎉 새로운 최고 기록!' : '완료!'}</span>
        </div>
        <div class="text-center">
          <div class="inline-flex items-baseline gap-2 count-pop">
            <span class="text-5xl sm:text-6xl font-black tabular-nums text-gray-900 drop-shadow">${UI.formatElapsed(r.timeSec)}</span>
            <span class="text-xl sm:text-2xl font-bold text-amber-900/80">만에 완료</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-2 mt-3 text-xs sm:text-sm">
          <span class="inline-flex items-center gap-1 bg-white/70 backdrop-blur px-3 py-1 rounded-full font-semibold text-amber-900">
            ${UI.icon('trophy','w-3.5 h-3.5')} 최고 기록 ${best ? UI.formatElapsed(best.timeSec) : '-'}
          </span>
          ${isBest && r.prevBest ? `<span class="inline-flex items-center gap-1 bg-emerald-600 text-white px-3 py-1 rounded-full font-semibold">이전 ${UI.formatElapsed(r.prevBest.timeSec)} 단축!</span>` : ''}
        </div>
        <div class="flex flex-wrap items-center justify-center gap-2 mt-4">
          <button id="btn-play-again" class="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg shadow-sm transition-all">
            ${UI.icon('refresh','w-4 h-4')} 다시 하기
          </button>
          <button id="btn-go-select" class="inline-flex items-center gap-1.5 bg-white/80 hover:bg-white text-gray-800 font-semibold px-5 py-2 rounded-lg transition-all">
            ${UI.icon('chevronLeft','w-4 h-4')} 게임 선택
          </button>
        </div>
      </div>
    `;
  }

  function historyHTML({ compact } = {}) {
    const user = Auth.getUser();
    const list = Records.listFor(user.name, S.gameId);
    const best = Records.best(user.name, S.gameId);
    if (list.length === 0) {
      return `
        <div class="bg-white/70 backdrop-blur rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 mb-3">
          아직 완료한 기록이 없습니다. 첫 기록을 세워보세요!
        </div>
      `;
    }
    const bestIdx = best ? list.findIndex(r => r.at === best.at && r.timeSec === best.timeSec) : -1;
    const visible = compact ? list.slice(0, 5) : list;
    return `
      <section class="${compact ? 'mb-4' : 'mt-5 sm:mt-6'}">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <h3 class="text-sm sm:text-base font-bold text-gray-800">내 기록 히스토리</h3>
            <span class="text-[11px] sm:text-xs text-gray-500">(${list.length}회)</span>
          </div>
          ${best ? `
            <span class="inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              ${UI.icon('trophy','w-3.5 h-3.5')} 최고 ${UI.formatElapsed(best.timeSec)}
            </span>
          ` : ''}
        </div>
        <ol class="bg-white/80 backdrop-blur rounded-xl ring-1 ring-gray-200 divide-y divide-gray-100 overflow-hidden">
          ${visible.map((r) => {
            const origIdx = list.indexOf(r);
            const isBest = (origIdx === bestIdx);
            const isLatest = (origIdx === 0);
            return `
              <li class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 ${isLatest ? 'bg-blue-50/50' : ''}">
                <span class="w-6 sm:w-7 text-right text-[11px] sm:text-xs tabular-nums ${isLatest ? 'text-blue-700 font-bold' : 'text-gray-400'}">#${origIdx+1}</span>
                <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span class="text-lg sm:text-xl font-extrabold tabular-nums ${isBest ? 'text-amber-600' : 'text-gray-800'}">${UI.formatElapsed(r.timeSec)}</span>
                  ${isLatest ? `<span class="text-[10px] sm:text-xs font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">최신</span>` : ''}
                  ${isBest ? `<span class="text-[10px] sm:text-xs font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">최고</span>` : ''}
                </div>
                <div class="text-right shrink-0">
                  <div class="text-[11px] sm:text-xs text-gray-600">${formatDateTime(r.at)}</div>
                  <div class="text-[10px] sm:text-[11px] text-gray-400">${relativeTime(r.at)}</div>
                </div>
              </li>
            `;
          }).join('')}
        </ol>
        ${compact && list.length > visible.length ? `<p class="text-[11px] text-gray-400 text-right mt-1">+ ${list.length - visible.length}개 더 (게임 완료 후 아래쪽에서 전체 확인)</p>` : ''}
        ${!compact ? `
          <div class="flex justify-end mt-2">
            <button id="btn-clear-history" class="text-[11px] sm:text-xs text-gray-400 hover:text-red-600 transition-colors">기록 전체 삭제</button>
          </div>
        ` : ''}
      </section>
    `;
  }

  function formatDateTime(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function relativeTime(ts) {
    const diff = Date.now() - ts;
    const sec = Math.floor(diff/1000);
    if (sec < 60) return '방금 전';
    const min = Math.floor(sec/60); if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min/60);  if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr/24);  if (day < 30) return `${day}일 전`;
    const mo = Math.floor(day/30);  if (mo < 12) return `${mo}개월 전`;
    return `${Math.floor(mo/12)}년 전`;
  }

  function renderGame() {
    const root = document.getElementById('root');
    const def = S.def;
    const tone = window.TONE[def.tone];
    const showTimer = S.started;
    const isReady = !S.started && !S.finished;
    const isPlaying = S.started && !S.finished;
    const total = def.items.length;
    const filledCount = S.filled.filter(x=>x).length;

    root.innerHTML = `
      <div class="bg-app flex flex-col" style="min-height:100dvh">
        <header class="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-20">
          <div class="max-w-3xl mx-auto px-2 sm:px-4 py-1.5 sm:py-2.5 flex items-center justify-between gap-2">
            <button id="btn-back" aria-label="게임 선택으로"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-800 font-semibold text-xs sm:text-sm transition-colors shrink-0">
              ${UI.icon('chevronLeft','w-4 h-4')}<span>게임 선택</span>
            </button>
            <h1 class="text-sm sm:text-base font-bold text-gray-800 truncate text-center flex-1 mx-1">${def.title} · 쓰기</h1>
            <div class="flex items-center gap-1.5 shrink-0">
              ${isPlaying ? `
                <div class="hidden sm:flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  <span id="progress-count" class="text-amber-700 font-bold tabular-nums text-xs">${filledCount} / ${total}</span>
                </div>` : ''}
              ${showTimer ? `
                <div class="flex items-center gap-1 ${S.finished ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'} border rounded-full px-2.5 py-1">
                  ${UI.icon('clock', 'w-3.5 h-3.5 ' + (S.finished ? 'text-emerald-500' : 'text-blue-500'))}
                  <span id="timer-display" class="${S.finished ? 'text-emerald-700' : 'text-blue-700'} font-bold tabular-nums text-xs">${UI.formatElapsed(S.elapsed)}</span>
                </div>` : ''}
              <button id="btn-new" class="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors font-medium">새게임</button>
            </div>
          </div>
        </header>

        <main class="max-w-3xl w-full mx-auto px-2 sm:px-4 py-1.5 sm:py-3 flex-1">
          ${S.finished ? successBannerHTML() : ''}

          ${isReady ? `
            <div class="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-5 sm:p-6 mb-3 text-center">
              <div class="text-3xl mb-1">⌨️</div>
              <p class="text-sm sm:text-base text-gray-700 leading-relaxed mb-1">
                각 빈칸에 항목명을 정확히 입력하세요.
              </p>
              <p class="text-xs sm:text-sm text-gray-500 leading-relaxed mb-3">
                정확히 일치하면 자동으로 다음 칸으로 넘어갑니다 (총 ${total}개)
              </p>
              <button id="btn-start" class="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-sm transition-all">
                시작 ${UI.icon('play','w-4 h-4')}
              </button>
            </div>
            ${historyHTML({ compact: true })}
          ` : ''}

          ${!isReady ? `
            <!-- 모바일 진행 표시 -->
            ${isPlaying ? `
              <div class="sm:hidden flex items-center justify-center gap-2 mb-2">
                <div class="flex-1 max-w-xs h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div class="h-full bg-amber-500 transition-all" style="width:${(filledCount/total*100).toFixed(1)}%"></div>
                </div>
                <span class="text-xs font-bold text-amber-700 tabular-nums shrink-0">${filledCount} / ${total}</span>
              </div>
            ` : ''}

            <div class="bg-white rounded-xl ring-1 ring-gray-200 p-2.5 sm:p-4">
              <div class="flex flex-col gap-1.5 sm:gap-2">
                ${def.items.map((item, i) => {
                  const level = def.hasLevels ? (item.level||0) : 0;
                  const pad = level * 14;
                  const isFilled = S.filled[i];
                  return `
                    <div class="flex items-center gap-2">
                      <span class="w-6 sm:w-7 text-right text-[11px] sm:text-xs font-bold ${isFilled ? 'text-emerald-600' : tone.text} tabular-nums shrink-0">${i+1}</span>
                      <div class="flex items-center gap-1 flex-1 min-w-0" style="padding-left:${pad}px">
                        ${level > 0 ? `<span class="text-gray-300 text-xs sm:text-sm shrink-0">└</span>` : ''}
                        <input
                          type="text"
                          data-write-idx="${i}"
                          autocomplete="off"
                          autocapitalize="off"
                          autocorrect="off"
                          spellcheck="false"
                          inputmode="text"
                          ${isFilled ? `value="${item.name}" readonly` : ''}
                          class="flex-1 min-w-0 px-2.5 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg border-2 transition-colors
                                 ${isFilled
                                   ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-bold'
                                   : 'bg-white border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-gray-800'}"
                          placeholder="${isFilled ? '' : '항목명 입력'}" />
                        ${isFilled ? `<span class="text-emerald-500 shrink-0">${UI.icon('check','w-4 h-4')}</span>` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          ${isPlaying ? `
            <div class="mt-2 sm:mt-3 text-center">
              <p class="text-[11px] sm:text-xs text-gray-500 leading-relaxed">
                💡 ${def.hasLevels ? '들여쓰기는 계층 힌트입니다 · ' : ''}정확히 일치하면 다음 칸으로 자동 이동
              </p>
            </div>
          ` : ''}

          ${S.finished ? historyHTML() : ''}

          <div class="h-2 sm:h-6"></div>
        </main>
      </div>
    `;

    bindGameEvents(isPlaying);
  }

  function bindGameEvents(isPlaying) {
    document.getElementById('btn-back').addEventListener('click', () => {
      if (isPlaying) {
        confirmLeave(
          '게임을 중단하고 나갈까요?',
          '진행 상황은 저장되지 않습니다. 타이머가 멈추고 게임 선택 화면으로 돌아갑니다.',
          () => { stopTimer(); window.App.goto('select', { mode: 'write' }); }
        );
      } else {
        stopTimer(); window.App.goto('select', { mode: 'write' });
      }
    });

    document.getElementById('btn-new').addEventListener('click', () => {
      if (isPlaying) {
        confirmLeave(
          '새 게임을 시작할까요?',
          '현재 게임은 포기되고 처음부터 다시 시작합니다.',
          () => { stopTimer(); initState(S.gameId); renderGame(); }
        );
      } else {
        stopTimer(); initState(S.gameId); renderGame();
      }
    });

    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.addEventListener('click', startTimer);

    const btnAgain = document.getElementById('btn-play-again');
    if (btnAgain) btnAgain.addEventListener('click', () => { stopTimer(); initState(S.gameId); renderGame(); });
    const btnSelect = document.getElementById('btn-go-select');
    if (btnSelect) btnSelect.addEventListener('click', () => { stopTimer(); window.App.goto('select', { mode: 'write' }); });

    const btnClear = document.getElementById('btn-clear-history');
    if (btnClear) btnClear.addEventListener('click', () => {
      UI.modal({
        title: '기록 전체 삭제',
        message: '이 게임의 모든 기록을 삭제할까요? 되돌릴 수 없습니다.',
        buttons: [
          { label: '취소', variant:'secondary' },
          { label: '삭제', variant:'primary', onClick: () => {
            Records.clear(Auth.getUser().name, S.gameId);
            UI.toast('기록이 삭제되었습니다', 'info');
            renderGame();
          }},
        ],
      });
    });

    // input 핸들러 — 한글 IME 호환을 위해 input·compositionend 모두 청취
    document.querySelectorAll('input[data-write-idx]').forEach(inp => {
      const idx = parseInt(inp.dataset.writeIdx);
      const handler = (e) => onInputChange(idx, e.target.value);
      inp.addEventListener('input', handler);
      inp.addEventListener('compositionend', handler);
    });
  }

  WritingView.render = function(gameId) {
    if (!initState(gameId)) return window.App.goto('select', { mode: 'write' });
    renderGame();
  };
  WritingView.cleanup = function() {
    stopTimer();
    S = null;
  };
  window.WritingView = WritingView;
})();
