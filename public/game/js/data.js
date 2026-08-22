// 게임 데이터 정의 — 각 게임의 정답 순서와 들여쓰기(level) 정보
window.GAMES = {
  'income-statement': {
    id: 'income-statement',
    title: '손익계산서 게임',
    shortTitle: '손익계산서',
    subtitle: '매출액부터 당기순이익까지 10개 항목을 순서대로 맞추세요',
    tone: 'blue',
    icon: 'chart',
    hasLevels: false,
    hint: '항목을 좌측에서 우측으로 드래그하세요.\n시작 버튼을 누르면 타이머가 시작됩니다.',
    items: [
      { name: '매출액',        level: 0 },
      { name: '매출원가',      level: 0 },
      { name: '매출총이익',    level: 0 },
      { name: '판매비와관리비', level: 0 },
      { name: '영업이익',      level: 0 },
      { name: '영업외수익',    level: 0 },
      { name: '영업외비용',    level: 0 },
      { name: '세전순이익',    level: 0 },
      { name: '법인세',        level: 0, accepts: ['법인세', '법인세등'] },
      { name: '당기순이익',    level: 0 },
    ],
    preview: ['매출액', '영업이익', '당기순이익'],
  },

  'balance-sheet-1': {
    id: 'balance-sheet-1',
    title: '재무상태표 게임 1',
    shortTitle: '재무상태표 1',
    subtitle: '자산·부채·자본 11개 항목을 수준에 맞게 배열하세요',
    tone: 'green',
    icon: 'scale',
    hasLevels: true,
    hint: '항목을 좌측에서 우측으로 드래그하세요.\n드래그하면 들여쓰기 수준이 자동으로 적용됩니다.\n시작 버튼을 누르면 타이머가 시작됩니다.',
    items: [
      { name: '자산',       level: 0 },
      { name: '유동자산',   level: 1 },
      { name: '비유동자산', level: 1 },
      { name: '부채',       level: 0 },
      { name: '유동부채',   level: 1 },
      { name: '비유동부채', level: 1 },
      { name: '자본',       level: 0 },
      { name: '자본금',     level: 1 },
      { name: '자본잉여금', level: 1 },
      { name: '이익잉여금', level: 1 },
      { name: '기타자본',   level: 1, accepts: ['기타자본', '기타자본항목'] },
    ],
    preview: ['자산', '부채', '자본'],
  },

  'balance-sheet-2': {
    id: 'balance-sheet-2',
    title: '재무상태표 게임 2',
    shortTitle: '재무상태표 2',
    subtitle: '3단계 계층 구조로 17개 항목을 순서와 수준까지 맞추세요',
    tone: 'purple',
    icon: 'list',
    hasLevels: true,
    hint: '항목을 좌측에서 우측으로 드래그하세요.\n드래그하면 들여쓰기 수준이 자동으로 적용됩니다.\n시작 버튼을 누르면 타이머가 시작됩니다.',
    items: [
      { name: '자산',           level: 0 },
      { name: '유동자산',       level: 1 },
      { name: '당좌자산',       level: 2 },
      { name: '재고자산',       level: 2 },
      { name: '비유동자산',     level: 1 },
      { name: '투자자산',       level: 2 },
      { name: '유형자산',       level: 2 },
      { name: '무형자산',       level: 2 },
      { name: '기타비유동자산', level: 2 },
      { name: '부채',           level: 0 },
      { name: '유동부채',       level: 1 },
      { name: '비유동부채',     level: 1 },
      { name: '자본',           level: 0 },
      { name: '자본금',         level: 1 },
      { name: '자본잉여금',     level: 1 },
      { name: '이익잉여금',     level: 1 },
      { name: '기타자본항목',   level: 1, accepts: ['기타자본항목', '기타자본'] },
    ],
    preview: ['유동자산', '비유동자산', '자본잉여금'],
  },
};

window.GAME_ORDER = ['income-statement', 'balance-sheet-1', 'balance-sheet-2'];

// 게임 모드 정의 (드래그앤드롭 / 쓰기게임)
window.GAME_MODES = {
  drag: {
    id: 'drag',
    title: '드래그앤드롭',
    subtitle: '항목을 끌어다 정해진 순서·위치에 배치하세요',
    description: '드래그 또는 탭으로 항목을 옮겨 재무제표를 완성합니다.',
    icon: 'move',
    bg: 'bg-blue-100', text: 'text-blue-600',
    border: 'border-blue-200', hoverBorder: 'hover:border-blue-400',
  },
  write: {
    id: 'write',
    title: '쓰기게임',
    subtitle: '각 항목명을 직접 타이핑해서 완성하세요',
    description: '빈칸에 항목명을 키보드로 입력합니다. 정확히 일치하면 다음 칸으로 자동 이동.',
    icon: 'keyboard',
    bg: 'bg-amber-100', text: 'text-amber-600',
    border: 'border-amber-200', hoverBorder: 'hover:border-amber-400',
  },
};
window.MODE_ORDER = ['drag', 'write'];

// 쓰기게임용 게임 ID는 'write:'를 prefix로 사용 (드래그 게임 기록과 분리)
window.WRITE_PREFIX = 'write:';
window.writeGameId = function(baseId) { return window.WRITE_PREFIX + baseId; };
window.parseGameId = function(id) {
  if (id && id.indexOf(window.WRITE_PREFIX) === 0) {
    return { mode: 'write', baseId: id.slice(window.WRITE_PREFIX.length) };
  }
  return { mode: 'drag', baseId: id };
};

// 톤별 색상 매핑
window.TONE = {
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-600',   ring: 'ring-blue-200',   softBg: 'bg-blue-50',   border: 'border-blue-200',   hoverBorder: 'hover:border-blue-300',   chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  green:  { bg: 'bg-emerald-100',text: 'text-emerald-600',ring: 'ring-emerald-200',softBg: 'bg-emerald-50',border: 'border-emerald-200',hoverBorder: 'hover:border-emerald-300',chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600', ring: 'ring-purple-200', softBg: 'bg-purple-50', border: 'border-purple-200', hoverBorder: 'hover:border-purple-300', chip: 'bg-purple-50 text-purple-700 border-purple-200' },
};
