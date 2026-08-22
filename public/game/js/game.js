// 게임 화면 + Pointer Events 기반 드래그/탭 + 슬롯 스왑 + 이탈 방지
(function(){
  const GameView = {};

  let S = null;       // 현재 게임 상태
  let DRAG = null;    // 활성 드래그 상태
  let ignoreNextClick = false; // 드래그 종료 직후의 click 이벤트 억제
  let globalBound = false;

  // ---------- 상태 ----------
  function initState(gameId) {
    const def = window.GAMES[gameId];
    const shuffled = UI.shuffle(def.items.map((x,i)=>({ ...x, _id:i })));
    S = {
      def,
      left: shuffled,
      slots: def.items.map(()=>null),
      started: false,
      startAt: null,
      elapsed: 0,
      timerHandle: null,
      finished: false,
      lastRun: null,
      selectedLeftId: null,
      selectedSlotIdx: null,
    };
  }

  function startTimer() {
    if (S.started || S.finished) return;
    S.started = true;
    S.startAt = Date.now();
    S.timerHandle = setInterval(() => {
      S.elapsed = Math.floor((Date.now() - S.startAt) / 1000);
      const el = document.getElementById('timer-display');
      if (el) el.textContent = UI.formatElapsed(S.elapsed);
    }, 250);
    renderGame();
  }

  function stopTimer() {
    if (S && S.timerHandle) {
      clearInterval(S.timerHandle);
      S.timerHandle = null;
    }
  }

  // ---------- 완료/오답 처리 ----------
  function checkCompletedIfFull() {
    if (S.slots.some(s => s === null)) return;
    for (let i = 0; i < S.slots.length; i++) {
      if (S.slots[i].name !== S.def.items[i].name) {
        showIncorrect();
        return;
      }
    }
    finishGame();
  }

  function showIncorrect() {
    const container = document.getElementById('slots-container');
    if (!container) return;
    container.classList.add('shake');
    const slotEls = container.querySelectorAll('[data-slot]');
    const wrongIdx = [];
    S.slots.forEach((p, i) => {
      if (p && p.name !== S.def.items[i].name) wrongIdx.push(i);
    });
    wrongIdx.forEach(i => slotEls[i] && slotEls[i].classList.add('slot-wrong'));
    UI.toast('순서가 맞지 않습니다. 잘못된 항목을 목록으로 되돌렸습니다.', 'error', 1600);
    setTimeout(() => {
      container.classList.remove('shake');
      slotEls.forEach(el => el.classList.remove('slot-wrong'));
      wrongIdx.forEach(i => {
        if (S.slots[i]) {
          S.left.push(S.slots[i]);
          S.slots[i] = null;
        }
      });
      renderGame();
    }, 900);
  }

  function finishGame() {
    S.finished = true;
    stopTimer();
    const user = Auth.getUser();
    const res = Records.save(user.name, S.def.id, S.elapsed);
    S.lastRun = { timeSec: S.elapsed, improved: res.improved, prevBest: res.prevBest };
    const flash = document.getElementById('slots-container');
    if (flash) flash.querySelectorAll('[data-slot]').forEach(el => el.classList.add('slot-correct'));
    renderGame();
    launchConfetti();
  }

  // ---------- Confetti ----------
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

  // ---------- 배치/이동 유틸 ----------
  // 좌측 id 항목을 슬롯 slotIdx에 배치. 슬롯이 차 있으면 스왑 (기존 항목을 좌측으로).
  function placeLeftToSlot(leftId, slotIdx) {
    const leftPos = S.left.findIndex(x => x._id === leftId);
    if (leftPos < 0) return false;
    const item = S.left[leftPos];
    if (S.slots[slotIdx] === null) {
      S.left.splice(leftPos, 1);
      S.slots[slotIdx] = item;
    } else {
      const prev = S.slots[slotIdx];
      S.slots[slotIdx] = item;
      S.left.splice(leftPos, 1, prev);
    }
    S.selectedLeftId = null;
    S.selectedSlotIdx = null;
    return true;
  }

  // 두 슬롯 내용 교환 (빈 슬롯이든 채워진 슬롯이든)
  function swapSlots(a, b) {
    if (a === b) return false;
    [S.slots[a], S.slots[b]] = [S.slots[b], S.slots[a]];
    S.selectedLeftId = null;
    S.selectedSlotIdx = null;
    return true;
  }

  function moveSlotToLeft(slotIdx) {
    if (!S.slots[slotIdx]) return false;
    S.left.push(S.slots[slotIdx]);
    S.slots[slotIdx] = null;
    S.selectedLeftId = null;
    S.selectedSlotIdx = null;
    return true;
  }

  function afterMove(mutated) {
    if (!mutated) return renderGame();
    renderGame();
    if (S.slots.every(s => s !== null)) {
      setTimeout(checkCompletedIfFull, 160);
    }
  }

  // ---------- 탭 핸들러 ----------
  function tapLeft(id) {
    if (!S.started || S.finished) return;
    // 슬롯 선택 상태 → 그 슬롯 항목과 좌측 탭한 항목을 스왑
    if (S.selectedSlotIdx !== null) {
      const ok = placeLeftToSlot(id, S.selectedSlotIdx);
      afterMove(ok);
      return;
    }
    // 좌측 선택 토글
    S.selectedLeftId = S.selectedLeftId === id ? null : id;
    renderGame();
  }

  function tapSlot(idx) {
    if (!S.started || S.finished) return;
    // 좌측 선택 상태 → 배치 또는 스왑
    if (S.selectedLeftId !== null) {
      const ok = placeLeftToSlot(S.selectedLeftId, idx);
      afterMove(ok);
      return;
    }
    // 슬롯 선택 상태
    if (S.selectedSlotIdx !== null) {
      if (S.selectedSlotIdx === idx) {
        // 같은 슬롯 재탭 → 좌측으로 복귀
        const ok = moveSlotToLeft(idx);
        afterMove(ok);
        return;
      }
      const ok = swapSlots(S.selectedSlotIdx, idx);
      afterMove(ok);
      return;
    }
    // 아무 선택 없음: 채워진 슬롯이면 선택, 빈 슬롯이면 무시
    if (S.slots[idx]) {
      S.selectedSlotIdx = idx;
      S.selectedLeftId = null;
      renderGame();
    }
  }

  function tapLeftZone() {
    if (!S.started || S.finished) return;
    if (S.selectedSlotIdx !== null) {
      const ok = moveSlotToLeft(S.selectedSlotIdx);
      afterMove(ok);
      return;
    }
    if (S.selectedLeftId !== null) {
      S.selectedLeftId = null;
      renderGame();
    }
  }

  // ---------- Pointer Drag (마우스/펜) ----------
  function onPointerDown(e) {
    if (!S || !S.started || S.finished) return;
    // 마우스/펜은 좌클릭만, 터치는 모두 허용
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const srcEl = e.target.closest('[data-left-id], [data-slot-item]');
    if (!srcEl) return;

    const source = srcEl.hasAttribute('data-left-id')
      ? { kind:'left', id: parseInt(srcEl.dataset.leftId), el: srcEl }
      : { kind:'slot', idx: parseInt(srcEl.dataset.slotItem), el: srcEl };

    const rect = srcEl.getBoundingClientRect();
    DRAG = {
      source,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      started: false,
      ghost: null,
    };
    // 초기에는 preventDefault 안 함 → mouseclick 살아있음(threshold 미달 시 tap 처리)
  }

  function onPointerMove(e) {
    if (!DRAG || e.pointerId !== DRAG.pointerId) return;
    const dx = e.clientX - DRAG.startX;
    const dy = e.clientY - DRAG.startY;

    if (!DRAG.started) {
      // 터치는 손가락 떨림 보정으로 약간 큰 임계값
      const threshold = DRAG.pointerType === 'touch' ? 7 : 4;
      if (Math.hypot(dx, dy) < threshold) return;
      DRAG.started = true;
      createGhost();
      DRAG.source.el.classList.add('drag-source');
      document.body.classList.add('dragging');
      // 시작 즉시 현재 커서 위치로 이동 (첫 프레임에서 점프 방지)
      moveGhost(e.clientX, e.clientY);
    }
    e.preventDefault();
    // 매 pointermove마다 transform만 갱신 → 합성 레이어에서 즉시 반영
    moveGhost(e.clientX, e.clientY);
    // hit-test는 rAF로 배치 — 드래그 추적과 분리
    scheduleHitTest(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (!DRAG || e.pointerId !== DRAG.pointerId) return;
    if (DRAG.started) {
      const target = findDropTarget(e.clientX, e.clientY);
      applyDrop(DRAG.source, target);
      ignoreNextClick = true;
      setTimeout(() => { ignoreNextClick = false; }, 350);
    }
    endDrag();
  }

  function onPointerCancel() {
    endDrag();
  }

  const GHOST_TRANSFORM_SUFFIX = ' rotate(-1deg) scale(1.03)';

  function createGhost() {
    const src = DRAG.source.el;
    const ghost = src.cloneNode(true);
    ghost.classList.add('drag-ghost-el');
    ghost.classList.remove('item-selected','slot-selected','drag-source');
    ghost.style.width = DRAG.width + 'px';
    ghost.style.height = DRAG.height + 'px';
    ghost.style.margin = '0';
    // 초기 위치: 원본 자리에. 이동은 전부 transform으로만
    const initTx = DRAG.startX - DRAG.offsetX;
    const initTy = DRAG.startY - DRAG.offsetY;
    ghost.style.transform = `translate3d(${initTx}px, ${initTy}px, 0)` + GHOST_TRANSFORM_SUFFIX;
    document.body.appendChild(ghost);
    DRAG.ghost = ghost;
    DRAG.lastTx = initTx;
    DRAG.lastTy = initTy;
  }

  function moveGhost(x, y) {
    if (!DRAG || !DRAG.ghost) return;
    const tx = x - DRAG.offsetX;
    const ty = y - DRAG.offsetY;
    // 동일 좌표면 스킵
    if (tx === DRAG.lastTx && ty === DRAG.lastTy) return;
    DRAG.lastTx = tx;
    DRAG.lastTy = ty;
    DRAG.ghost.style.transform = `translate3d(${tx}px, ${ty}px, 0)` + GHOST_TRANSFORM_SUFFIX;
  }

  // rAF 배치: 매 포인터무브가 아니라 프레임당 한 번만 hit-test
  let hitTestRAF = 0;
  let pendingHitX = 0, pendingHitY = 0;
  function scheduleHitTest(x, y) {
    pendingHitX = x; pendingHitY = y;
    if (hitTestRAF) return;
    hitTestRAF = requestAnimationFrame(() => {
      hitTestRAF = 0;
      if (!DRAG || !DRAG.started) return;
      highlightDropTarget(pendingHitX, pendingHitY);
    });
  }

  let lastHoverEl = null;
  function highlightDropTarget(x, y) {
    const t = findDropTarget(x, y);
    const newEl = t ? t.el : null;
    if (newEl === lastHoverEl) return;  // 변경 없으면 DOM 건드리지 않음
    if (lastHoverEl) lastHoverEl.classList.remove('slot-hover','leftzone-hover');
    lastHoverEl = newEl;
    if (!t) return;
    if (t.kind === 'slot') t.el.classList.add('slot-hover');
    if (t.kind === 'leftZone') t.el.classList.add('leftzone-hover');
  }

  function findDropTarget(x, y) {
    // elementsFromPoint로 ghost를 스킵하며 첫 후보를 찾는다 (visibility 토글 없음)
    const list = document.elementsFromPoint(x, y);
    for (const el of list) {
      if (!el || el.nodeType !== 1) continue;
      if (el.classList && el.classList.contains('drag-ghost-el')) continue;
      if (el.closest && el.closest('.drag-ghost-el')) continue;
      const slotEl = el.closest && el.closest('[data-slot]');
      if (slotEl) return { kind:'slot', idx: parseInt(slotEl.dataset.slot), el: slotEl };
      const leftZone = el.closest && el.closest('#left-zone');
      if (leftZone) return { kind:'leftZone', el: leftZone };
    }
    return null;
  }

  function applyDrop(source, target) {
    if (!target) return afterMove(false);
    if (source.kind === 'left') {
      if (target.kind === 'slot') {
        const ok = placeLeftToSlot(source.id, target.idx);
        afterMove(ok);
      } else {
        afterMove(false);
      }
    } else {
      // source.kind === 'slot'
      if (target.kind === 'slot') {
        if (target.idx === source.idx) return afterMove(false);
        if (S.slots[target.idx] === null) {
          S.slots[target.idx] = S.slots[source.idx];
          S.slots[source.idx] = null;
          S.selectedLeftId = null;
          S.selectedSlotIdx = null;
          afterMove(true);
        } else {
          const ok = swapSlots(source.idx, target.idx);
          afterMove(ok);
        }
      } else if (target.kind === 'leftZone') {
        const ok = moveSlotToLeft(source.idx);
        afterMove(ok);
      } else {
        afterMove(false);
      }
    }
  }

  function endDrag() {
    if (hitTestRAF) { cancelAnimationFrame(hitTestRAF); hitTestRAF = 0; }
    if (DRAG) {
      if (DRAG.ghost) DRAG.ghost.remove();
      if (DRAG.source && DRAG.source.el) DRAG.source.el.classList.remove('drag-source');
    }
    if (lastHoverEl) { lastHoverEl.classList.remove('slot-hover','leftzone-hover'); lastHoverEl = null; }
    document.querySelectorAll('.slot-hover, .leftzone-hover').forEach(el => el.classList.remove('slot-hover','leftzone-hover'));
    document.body.classList.remove('dragging');
    DRAG = null;
  }

  function bindGlobalPointer() {
    if (globalBound) return;
    globalBound = true;
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
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
    const best = Records.best(Auth.getUser().name, S.def.id);
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
    const list = Records.listFor(user.name, S.def.id);
    const best = Records.best(user.name, S.def.id);
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
          ${visible.map((r, i) => {
            const origIdx = list.indexOf(r);
            const isBest = (origIdx === bestIdx);
            const isLatest = (origIdx === 0);
            const dateStr = formatDateTime(r.at);
            const relStr = relativeTime(r.at);
            return `
              <li class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 ${isLatest ? 'bg-blue-50/50' : ''}">
                <span class="w-6 sm:w-7 text-right text-[11px] sm:text-xs tabular-nums ${isLatest ? 'text-blue-700 font-bold' : 'text-gray-400'}">#${origIdx+1}</span>
                <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span class="text-lg sm:text-xl font-extrabold tabular-nums ${isBest ? 'text-amber-600' : 'text-gray-800'}">${UI.formatElapsed(r.timeSec)}</span>
                  ${isLatest ? `<span class="text-[10px] sm:text-xs font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">최신</span>` : ''}
                  ${isBest ? `<span class="text-[10px] sm:text-xs font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">최고</span>` : ''}
                </div>
                <div class="text-right shrink-0">
                  <div class="text-[11px] sm:text-xs text-gray-600">${dateStr}</div>
                  <div class="text-[10px] sm:text-[11px] text-gray-400">${relStr}</div>
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

    root.innerHTML = `
      <div class="bg-app flex flex-col" style="min-height:100dvh">
        <header class="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-20">
          <div class="max-w-5xl mx-auto px-2 sm:px-4 py-1.5 sm:py-2.5 flex items-center justify-between gap-2">
            <button id="btn-back" aria-label="게임 선택으로"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-800 font-semibold text-xs sm:text-sm transition-colors shrink-0">
              ${UI.icon('chevronLeft','w-4 h-4')}<span>게임 선택</span>
            </button>
            <h1 class="text-sm sm:text-base font-bold text-gray-800 truncate text-center flex-1 mx-1">${def.title}</h1>
            <div class="flex items-center gap-1.5 shrink-0">
              ${showTimer ? `
                <div class="flex items-center gap-1 ${S.finished ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'} border rounded-full px-2.5 py-1">
                  ${UI.icon('clock', 'w-3.5 h-3.5 ' + (S.finished ? 'text-emerald-500' : 'text-blue-500'))}
                  <span id="timer-display" class="${S.finished ? 'text-emerald-700' : 'text-blue-700'} font-bold tabular-nums text-xs">${UI.formatElapsed(S.elapsed)}</span>
                </div>` : ''}
              <button id="btn-new" class="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium">새게임</button>
            </div>
          </div>
        </header>

        <main class="max-w-5xl w-full mx-auto px-2 sm:px-4 py-1.5 sm:py-3 flex-1">
          ${S.finished ? successBannerHTML() : ''}

          ${isReady ? `
            <div class="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-5 sm:p-6 mb-3 text-center">
              <div class="text-3xl mb-1">🏁</div>
              <p class="text-sm sm:text-base text-gray-700 whitespace-pre-line leading-relaxed mb-3">${def.hint}</p>
              <button id="btn-start" class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-sm transition-all">
                시작 ${UI.icon('play','w-4 h-4')}
              </button>
            </div>
            ${historyHTML({ compact: true })}
          ` : ''}

          ${!isReady ? `
            <div class="grid grid-cols-2 gap-1.5 sm:gap-4">
              <div>
                <div class="text-[10px] sm:text-xs font-semibold text-gray-400 mb-1 text-center uppercase tracking-wide">항목 목록</div>
                <div id="left-zone" class="rounded-xl border-2 border-dashed border-gray-300 bg-white/60 p-1 sm:p-1.5 transition-colors">
                  <div class="flex flex-col gap-1 sm:gap-2">
                    ${S.left.map(item => `
                      <div data-left-id="${item._id}"
                           class="left-item flex items-center gap-1.5 bg-white rounded-lg border-2 px-2 sm:px-3 py-1.5 sm:py-2.5 select-none transition-all
                                  ${S.selectedLeftId===item._id ? 'item-selected border-blue-500' : 'border-gray-200 ' + tone.hoverBorder + ' hover:shadow'}
                                  ${isPlaying ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}">
                        <span class="text-gray-300 shrink-0 hidden sm:inline">${UI.icon('grip','w-3.5 h-3.5')}</span>
                        <span class="text-[13px] sm:text-base font-semibold text-gray-800 leading-tight break-keep">${item.name}</span>
                      </div>
                    `).join('')}
                  </div>
                  ${S.left.length === 0 ? `<div class="text-xs text-gray-400 text-center py-4">${S.finished ? '🎉 모두 정답!' : '모두 배치됨'}</div>` : ''}
                </div>
              </div>

              <div>
                <div class="text-[10px] sm:text-xs font-semibold text-gray-400 mb-1 text-center uppercase tracking-wide">정답 순서</div>
                <div id="slots-container" class="flex flex-col gap-1 sm:gap-2">
                  ${S.slots.map((slot, i) => {
                    const level = def.hasLevels && slot ? (slot.level||0) : 0;
                    const pad = level * 10;
                    const selSlot = S.selectedSlotIdx === i;
                    return `
                      <div data-slot="${i}"
                           class="slot rounded-lg border-2 ${slot ? `bg-white ${tone.border}` : 'border-dashed border-gray-300 bg-white/40'} ${selSlot ? 'slot-selected' : ''} px-2 sm:px-3 py-1.5 sm:py-2.5 flex items-center gap-1.5 transition-all min-h-[36px] sm:min-h-[44px]">
                        <span class="text-[10px] sm:text-xs font-bold ${slot ? tone.text : 'text-gray-400'} tabular-nums shrink-0 w-4 sm:w-5 text-center">${i+1}</span>
                        ${slot ? `
                          <div data-slot-item="${i}" class="flex items-center gap-1 flex-1 min-w-0 ${isPlaying ? 'cursor-grab active:cursor-grabbing' : ''}" style="padding-left:${pad}px">
                            ${level>0 ? `<span class="text-gray-300 text-xs">└</span>` : ''}
                            <span class="text-[13px] sm:text-base font-semibold text-gray-800 truncate">${slot.name}</span>
                          </div>
                        ` : `
                          <span class="text-[11px] sm:text-sm text-gray-400 italic">여기에 놓으세요</span>
                        `}
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          ` : ''}

          ${isPlaying ? `
            <div class="mt-2 sm:mt-3 text-center">
              <p class="text-[11px] sm:text-xs text-gray-500 leading-relaxed">
                💡 드래그로 이동 · 슬롯끼리 드래그로 순서 교환 · 좌측으로 끌면 복귀
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
    // 뒤로가기: 진행 중이면 confirm
    document.getElementById('btn-back').addEventListener('click', () => {
      if (isPlaying) {
        confirmLeave(
          '게임을 중단하고 나갈까요?',
          '진행 상황은 저장되지 않습니다. 타이머가 멈추고 선택 화면으로 돌아갑니다.',
          () => { stopTimer(); window.App.goto('select', { mode: 'drag' }); }
        );
      } else {
        stopTimer(); window.App.goto('select', { mode: 'drag' });
      }
    });

    // 새게임: 진행 중이면 confirm
    document.getElementById('btn-new').addEventListener('click', () => {
      if (isPlaying) {
        confirmLeave(
          '새 게임을 시작할까요?',
          '현재 게임은 포기되고 처음부터 다시 시작합니다.',
          () => { stopTimer(); initState(S.def.id); renderGame(); }
        );
      } else {
        stopTimer(); initState(S.def.id); renderGame();
      }
    });

    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.addEventListener('click', startTimer);

    const btnAgain = document.getElementById('btn-play-again');
    if (btnAgain) btnAgain.addEventListener('click', () => { stopTimer(); initState(S.def.id); renderGame(); });
    const btnSelect = document.getElementById('btn-go-select');
    if (btnSelect) btnSelect.addEventListener('click', () => { stopTimer(); window.App.goto('select', { mode: 'drag' }); });

    const btnClear = document.getElementById('btn-clear-history');
    if (btnClear) btnClear.addEventListener('click', () => {
      UI.modal({
        title: '기록 전체 삭제',
        message: '이 게임의 모든 기록을 삭제할까요? 되돌릴 수 없습니다.',
        buttons: [
          { label: '취소', variant:'secondary' },
          { label: '삭제', variant:'primary', onClick: () => {
            Records.clear(Auth.getUser().name, S.def.id);
            UI.toast('기록이 삭제되었습니다', 'info');
            renderGame();
          }},
        ],
      });
    });

    // 클릭(탭) 이벤트 — pointer drag가 끝난 직후는 억제
    document.querySelectorAll('.left-item').forEach(el => {
      const id = parseInt(el.dataset.leftId);
      el.addEventListener('click', () => {
        if (ignoreNextClick) { ignoreNextClick = false; return; }
        tapLeft(id);
      });
    });
    document.querySelectorAll('[data-slot]').forEach(el => {
      const idx = parseInt(el.dataset.slot);
      el.addEventListener('click', (e) => {
        if (ignoreNextClick) { ignoreNextClick = false; return; }
        // 슬롯 내부 클릭은 자신의 tapSlot으로
        tapSlot(idx);
      });
    });
    const leftZone = document.getElementById('left-zone');
    if (leftZone) {
      leftZone.addEventListener('click', (e) => {
        if (ignoreNextClick) { ignoreNextClick = false; return; }
        if (e.target.closest('[data-left-id]')) return; // 개별 항목이 처리
        tapLeftZone();
      });
    }
  }

  GameView.render = function(gameId) {
    if (!window.GAMES[gameId]) return window.App.goto('select', { mode: 'drag' });
    bindGlobalPointer();
    initState(gameId);
    renderGame();
  };
  GameView.cleanup = function() {
    stopTimer();
    endDrag();
    S = null;
  };
  window.GameView = GameView;
})();
