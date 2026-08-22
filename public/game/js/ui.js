// 공통 UI 유틸리티: 아이콘, 토스트, 모달
(function(){
  window.UI = {};

  // SVG 아이콘
  UI.icon = function(name, cls='w-5 h-5') {
    const svgs = {
      chart: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.5" fill="currentColor"/><rect x="12" y="8" width="3" height="10" rx="0.5" fill="currentColor"/><rect x="17" y="4" width="3" height="14" rx="0.5" fill="currentColor"/></svg>`,
      scale: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M4 21h16"/><path d="M6 7l-3 6a3 3 0 0 0 6 0l-3-6z"/><path d="M18 7l-3 6a3 3 0 0 0 6 0l-3-6z"/><path d="M7 7h10"/></svg>`,
      list: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
      chartApp: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="14" width="3" height="6" rx="0.5" fill="currentColor"/><rect x="10.5" y="9" width="3" height="11" rx="0.5" fill="currentColor"/><rect x="17" y="4" width="3" height="16" rx="0.5" fill="currentColor"/></svg>`,
      arrowRight: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
      arrowLeft: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
      chevronRight: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
      chevronLeft: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
      clock: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      grip: `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>`,
      flag: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
      trophy: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/><path d="M7 4H4v3a3 3 0 003 3M17 4h3v3a3 3 0 01-3 3"/></svg>`,
      logout: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
      refresh: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
      play: `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
      check: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      eye: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
      eyeOff: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
      move: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`,
      keyboard: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></svg>`,
      pencil: `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
    };
    return svgs[name] || '';
  };

  // 토스트
  UI.toast = function(msg, type='info', ms=1800) {
    const root = document.getElementById('toast');
    const colors = {
      info: 'bg-gray-900 text-white',
      success: 'bg-emerald-600 text-white',
      error: 'bg-red-600 text-white',
      warn: 'bg-amber-500 text-white',
    };
    const el = document.createElement('div');
    el.className = `mt-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium pop-in pointer-events-auto ${colors[type] || colors.info}`;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-10px)';
      setTimeout(() => el.remove(), 320);
    }, ms);
  };

  // 모달
  UI.modal = function(opts) {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm';
    wrap.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 pop-in">
        ${opts.icon ? `<div class="mx-auto w-14 h-14 rounded-full ${opts.iconBg||'bg-emerald-100'} ${opts.iconText||'text-emerald-600'} flex items-center justify-center mb-3">${opts.icon}</div>` : ''}
        <h3 class="text-xl font-bold text-center text-gray-900 mb-1.5">${opts.title||''}</h3>
        <p class="text-sm text-center text-gray-600 mb-5 whitespace-pre-line">${opts.message||''}</p>
        <div class="flex flex-col sm:flex-row gap-2">
          ${(opts.buttons||[]).map((b,i)=>`
            <button data-i="${i}" class="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${b.variant==='primary'?'bg-blue-600 text-white hover:bg-blue-700':'bg-gray-100 text-gray-700 hover:bg-gray-200'}">${b.label}</button>
          `).join('')}
        </div>
      </div>`;
    root.appendChild(wrap);
    wrap.querySelectorAll('button[data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.i);
        wrap.remove();
        const action = opts.buttons[i].onClick;
        if (action) action();
      });
    });
    return () => wrap.remove();
  };

  // 초 → "mm:ss" 또는 "N초"
  UI.formatElapsed = function(sec) {
    sec = Math.max(0, Math.floor(sec));
    if (sec < 60) return sec + '초';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  };

  // Fisher-Yates shuffle
  UI.shuffle = function(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
})();
