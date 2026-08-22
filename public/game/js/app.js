// 라우팅 및 화면 렌더링: 모드 선택 / 게임 선택 / 개별 게임
// 로그인은 허브(/)가 담당한다. 세션이 없으면 이 화면들은 허브로 되돌려보낸다.
(function(){
  const HUB_URL = '/';
  const root = document.getElementById('root');
  let activeView = null; // 'drag' | 'write' | null

  function cleanupActive() {
    if (activeView === 'drag' && window.GameView) window.GameView.cleanup();
    if (activeView === 'write' && window.WritingView) window.WritingView.cleanup();
    activeView = null;
  }

  // 모드별 모든 게임의 총 기록 횟수와 최고 기록을 합산
  function modeAggregateStats(userName, mode) {
    let total = 0;
    let bestSec = null;
    window.GAME_ORDER.forEach(baseId => {
      const id = mode === 'write' ? window.writeGameId(baseId) : baseId;
      const list = Records.listFor(userName, id);
      total += list.length;
      const best = Records.best(userName, id);
      if (best && (bestSec === null || best.timeSec < bestSec)) bestSec = best.timeSec;
    });
    return { total, bestSec };
  }

  // --- 모드 선택 화면 ---
  function renderModes() {
    const user = Auth.getUser();
    if (!user) return location.replace(HUB_URL);

    root.innerHTML = `
      <div class="min-h-screen bg-app flex flex-col">
        <header class="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-20">
          <div class="max-w-4xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <a href="${HUB_URL}" class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900 font-semibold text-xs sm:text-sm transition-colors shrink-0">
                ${UI.icon('chevronLeft','w-4 h-4')}<span>앱 선택</span>
              </a>
              <div class="w-9 h-9 rounded-xl bg-blue-600 hidden sm:flex items-center justify-center text-white shrink-0">${UI.icon('chartApp','w-5 h-5')}</div>
              <div class="font-bold text-sm sm:text-base text-gray-800 truncate">재무제표 학습 게임</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs sm:text-sm text-gray-600 truncate max-w-[120px]">${user.name}</span>
              <button id="btn-logout" class="flex items-center gap-1 text-xs sm:text-sm text-gray-500 hover:text-red-600 transition-colors">
                ${UI.icon('logout','w-4 h-4')}<span class="hidden sm:inline">로그아웃</span>
              </button>
            </div>
          </div>
        </header>

        <main class="flex-1 max-w-3xl w-full mx-auto px-3 sm:px-4 py-6 sm:py-10">
          <div class="text-center mb-6 sm:mb-8">
            <h1 class="text-2xl sm:text-3xl font-extrabold text-gray-900">게임 모드를 선택하세요</h1>
            <p class="text-sm text-gray-500 mt-1">두 가지 방식으로 같은 재무제표를 익혀볼 수 있어요</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            ${window.MODE_ORDER.map(modeId => {
              const m = window.GAME_MODES[modeId];
              const stats = modeAggregateStats(user.name, modeId);
              return `
                <button data-mode="${modeId}"
                        class="mode-card text-left bg-white rounded-2xl border-2 ${m.border} ${m.hoverBorder} hover:shadow-lg transition-all p-5 sm:p-6 flex flex-col gap-3 active:scale-[0.99]">
                  <div class="flex items-center gap-3">
                    <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl ${m.bg} ${m.text} flex items-center justify-center shrink-0">
                      ${UI.icon(m.icon,'w-6 h-6 sm:w-7 sm:h-7')}
                    </div>
                    <div class="flex-1 min-w-0">
                      <h2 class="font-extrabold text-lg sm:text-xl text-gray-900">${m.title}</h2>
                      <p class="text-xs sm:text-sm text-gray-600 mt-0.5">${m.subtitle}</p>
                    </div>
                  </div>
                  <p class="text-[12px] sm:text-sm text-gray-500 leading-relaxed">${m.description}</p>
                  <div class="flex items-center justify-between text-[11px] sm:text-xs">
                    <span class="text-gray-400">손익계산서 · 재무상태표 1 · 재무상태표 2</span>
                    ${stats.total > 0 ? `
                      <span class="inline-flex items-center gap-1 font-bold ${m.text} ${m.border} border ${modeId==='drag'?'bg-blue-50':'bg-amber-50'} px-2 py-0.5 rounded-full">
                        ${UI.icon('trophy','w-3 h-3')} ${stats.bestSec!==null?UI.formatElapsed(stats.bestSec):''} · ${stats.total}회
                      </span>
                    ` : `
                      <span class="text-gray-300">기록 없음</span>
                    `}
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        </main>
      </div>
    `;

    document.getElementById('btn-logout').addEventListener('click', () => {
      UI.modal({
        title: '로그아웃',
        message: '정말 로그아웃 하시겠어요?',
        buttons: [
          { label: '취소', variant:'secondary' },
          { label: '로그아웃', variant:'primary', onClick: async () => { await Auth.signOut(); location.replace(HUB_URL); } },
        ],
      });
    });

    document.querySelectorAll('.mode-card').forEach(el => {
      el.addEventListener('click', () => {
        goto('select', { mode: el.dataset.mode });
      });
    });
  }

  // --- 게임 선택 화면 (모드별) ---
  function renderSelect(mode) {
    const user = Auth.getUser();
    if (!user) return location.replace(HUB_URL);
    const m = window.GAME_MODES[mode] || window.GAME_MODES.drag;

    root.innerHTML = `
      <div class="min-h-screen bg-app flex flex-col">
        <header class="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-20">
          <div class="max-w-4xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
            <button id="btn-back-mode" class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border ${m.border} bg-white ${m.text} ${m.hoverBorder} font-semibold text-xs sm:text-sm transition-colors shrink-0">
              ${UI.icon('chevronLeft','w-4 h-4')}<span>모드</span>
            </button>
            <div class="flex items-center gap-2 min-w-0 flex-1 justify-center">
              <div class="w-7 h-7 rounded-lg ${m.bg} ${m.text} flex items-center justify-center shrink-0">${UI.icon(m.icon,'w-4 h-4')}</div>
              <div class="font-bold text-sm sm:text-base text-gray-800 truncate">${m.title}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs sm:text-sm text-gray-600 truncate max-w-[100px] hidden sm:inline">${user.name}</span>
              <button id="btn-logout" class="flex items-center gap-1 text-xs sm:text-sm text-gray-500 hover:text-red-600 transition-colors">
                ${UI.icon('logout','w-4 h-4')}<span class="hidden sm:inline">로그아웃</span>
              </button>
            </div>
          </div>
        </header>

        <main class="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-4 py-5 sm:py-8">
          <div class="text-center mb-5 sm:mb-7">
            <h1 class="text-xl sm:text-2xl font-extrabold text-gray-900">게임을 선택하세요</h1>
            <p class="text-sm text-gray-500 mt-1">${m.description}</p>
          </div>

          <div class="flex flex-col gap-3 sm:gap-4">
            ${window.GAME_ORDER.map(baseId => {
              const g = window.GAMES[baseId];
              const fullId = mode === 'write' ? window.writeGameId(baseId) : baseId;
              const tone = window.TONE[g.tone];
              const list = Records.listFor(user.name, fullId);
              const best = Records.best(user.name, fullId);
              const recent = list.slice(0, 3);
              return `
                <button data-game="${fullId}"
                        class="game-card text-left bg-white rounded-2xl border-2 ${tone.border} ${tone.hoverBorder} hover:shadow-lg transition-all p-4 sm:p-5 flex items-center gap-3 sm:gap-4 active:scale-[0.99]">
                  <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl ${tone.bg} ${tone.text} flex items-center justify-center shrink-0">
                    ${UI.icon(g.icon,'w-6 h-6 sm:w-7 sm:h-7')}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                      <h2 class="font-extrabold text-base sm:text-lg text-gray-900">${g.title}</h2>
                      ${best ? `<span class="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold ${tone.text} ${tone.softBg} border ${tone.border} px-2 py-0.5 rounded-full">
                        ${UI.icon('trophy','w-3 h-3')} 최고 ${UI.formatElapsed(best.timeSec)} · ${list.length}회
                      </span>` : ''}
                    </div>
                    <p class="text-xs sm:text-sm text-gray-600 mt-0.5 line-clamp-2">${g.subtitle}</p>
                    <div class="flex items-center gap-1 mt-2 flex-wrap">
                      ${g.preview.map(p => `<span class="text-[10px] sm:text-xs px-2 py-0.5 rounded-full border ${tone.chip}">${p}</span>`).join('')}
                      <span class="text-[10px] sm:text-xs px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">+${g.items.length - g.preview.length}개</span>
                    </div>
                    ${recent.length ? `
                      <div class="mt-2 flex items-center gap-1 text-[11px] sm:text-xs text-gray-500 flex-wrap">
                        <span class="text-gray-400">최근:</span>
                        ${recent.map((r,i) => `<span class="tabular-nums ${i===0?'font-bold text-gray-700':''}">${UI.formatElapsed(r.timeSec)}</span>${i<recent.length-1?'<span class="text-gray-300">·</span>':''}`).join('')}
                      </div>` : ''}
                  </div>
                  <span class="text-gray-300 shrink-0">${UI.icon('chevronRight','w-5 h-5')}</span>
                </button>
              `;
            }).join('')}
          </div>
        </main>
      </div>
    `;

    document.getElementById('btn-back-mode').addEventListener('click', () => goto('mode'));
    document.getElementById('btn-logout').addEventListener('click', () => {
      UI.modal({
        title: '로그아웃',
        message: '정말 로그아웃 하시겠어요?',
        buttons: [
          { label: '취소', variant:'secondary' },
          { label: '로그아웃', variant:'primary', onClick: async () => { await Auth.signOut(); location.replace(HUB_URL); } },
        ],
      });
    });

    document.querySelectorAll('.game-card').forEach(el => {
      el.addEventListener('click', () => {
        goto('game', { id: el.dataset.game });
      });
    });
  }

  // --- 게임 화면 (모드 자동 분기) ---
  function openGame(id) {
    const parsed = window.parseGameId(id);
    if (parsed.mode === 'write') {
      activeView = 'write';
      return window.WritingView.render(id);
    }
    activeView = 'drag';
    return window.GameView.render(id);
  }

  // --- 라우터 ---
  function goto(view, params) {
    cleanupActive();
    if (view === 'mode') return renderModes();
    if (view === 'select') return renderSelect((params && params.mode) || 'drag');
    if (view === 'game') return openGame(params && params.id);
  }

  window.App = { goto };

  // 세션 복원과 기록 적재는 네트워크를 타므로 그동안 잠깐 대기 화면을 보여준다
  function renderBooting() {
    root.innerHTML = `
      <div class="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-400">
        <div class="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin"></div>
        <p class="text-sm">불러오는 중…</p>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    renderBooting();
    const user = await Auth.restore();
    if (!user) return location.replace(HUB_URL);
    goto('mode');
  });
})();
