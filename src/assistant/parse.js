// 빠른 입력 한 줄(「내일 오후 3시 치과 @강남」)을 종류, 날짜, 시각, 영역, 태그로 나누는 해석기. 순수 함수라 now 를 주입한다.
import { ymd, toLocalISO, addDays, addMinutes, startOfDay, startOfWeek } from './dates.js';

const WEEKDAY = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const HALF = '(오전|오후|아침|낮|점심|저녁|밤|새벽)';
const CLOCK = '(\\d{1,2})(?::(\\d{2})|시(?!간)(?:\\s*(\\d{1,2})\\s*분|\\s*(반))?)';
const ALL_DAY_WORDS = /(생일|기념일|휴가|여행|출장|연차|휴무|결혼식|돌잔치|제사|명절|종일)/;
const INFO_WORDS = /(비번|비밀번호|와이파이|wifi|계좌|전화번호|연락처|레시피|사이즈|치수)/i;
const SOMEDAY_WORDS = /(언젠가|해보고\s?싶|가보고\s?싶|버킷\s?리스트)/;
const PREFIXES = [
  [/^\s*(?:💡|메모|정보|알아두기)\s*[:：]?\s*/, 'info'],
  [/^\s*(?:참고|기억)\s*[:：]\s*/, 'info'],
  [/^\s*(?:💭|언젠가|나중에|someday)\s*[:：]?\s*/i, 'someday'],
  [/^\s*(?:📅|일정|약속)\s*[:：]\s*/, 'event'],
  [/^\s*(?:✅|할\s?일|todo)\s*[:：]\s*/i, 'task'],
];

function resolveHour(hour, half, eveningHint) {
  if (half === '오전' || half === '아침' || half === '새벽') return hour === 12 ? 0 : hour;
  if (half === '오후' || half === '낮' || half === '저녁' || half === '밤') return hour < 12 ? hour + 12 : hour;
  if (half === '점심') return hour <= 4 ? hour + 12 : hour;
  if (eveningHint && hour < 12) return hour + 12;
  return hour >= 1 && hour <= 6 ? hour + 12 : hour;
}

const minuteOf = (colon, minute, half) => Number(colon || minute || 0) + (half ? 30 : 0);

export function parseQuickInput(text, now = new Date(), { areas = [] } = {}) {
  let s = ` ${String(text || '').replace(/\s+/g, ' ').trim()} `;
  const out = {
    title: '', type: null, start: null, end: null, allDay: false,
    important: false, urgent: false, areaIds: [], tags: [], place: '', link: '', deadline: false,
  };
  const original = s;
  // 처음 맞은 곳 하나만 지우고 그 결과를 돌려준다
  const grab = (re) => {
    const m = re.exec(s);
    if (!m) return null;
    s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`;
    return m;
  };

  let explicitType = null;
  for (const [re, type] of PREFIXES) {
    if (re.test(s)) {
      s = ` ${s.replace(re, '')}`;
      explicitType = type;
      break;
    }
  }

  const link = grab(/https?:\/\/[^\s]+/);
  if (link) out.link = link[0];
  const place = grab(/@([^\s#@]+)/);
  if (place) out.place = place[1];
  for (let tag = grab(/#([^\s#@]+)/); tag; tag = grab(/#([^\s#@]+)/)) {
    const area = areas.find((a) => a.name.toLowerCase() === tag[1].toLowerCase());
    if (area) out.areaIds.push(area.id);
    else out.tags.push(tag[1]);
  }

  if (grab(/(?<=\s)!!(?=\s)/)) out.important = out.urgent = true;
  if (grab(/(?<=\s)!(?=\s)/)) out.important = true;
  if (grab(/(?<=\s)중요(?=\s)/)) out.important = true;
  if (grab(/(?<=\s)(?:긴급|급함|ASAP|asap)(?=\s)/)) out.urgent = true;
  if (/(급하게|급히|급한)/.test(s)) out.urgent = true;

  // 시각: 범위 → 한 시각 → 정오 순
  const eveningHint = /(저녁|밤)/.test(original);
  let time = null;
  let endTime = null;
  const range = grab(new RegExp(`(?:${HALF}\\s*)?${CLOCK}\\s*(?:부터|~|-|–)\\s*(?:${HALF}\\s*)?${CLOCK}(?:\\s*까지)?`));
  if (range) {
    const [, h1, hr1, c1, m1, b1, h2, hr2, c2, m2, b2] = range;
    const startHour = resolveHour(Number(hr1), h1, eveningHint);
    let endHour = resolveHour(Number(hr2), h2 || (startHour >= 12 && Number(hr2) < 12 ? '오후' : null), eveningHint);
    time = { h: startHour, m: minuteOf(c1, m1, b1) };
    if (endHour * 60 + minuteOf(c2, m2, b2) <= time.h * 60 + time.m) endHour += 12;
    endTime = { h: endHour % 24, m: minuteOf(c2, m2, b2) };
  } else {
    const single = grab(new RegExp(`(?:${HALF}\\s*)?${CLOCK}`));
    if (single) {
      const [, half, hour, colon, minute, halfHour] = single;
      time = { h: resolveHour(Number(hour), half, eveningHint), m: minuteOf(colon, minute, halfHour) };
    } else if (grab(/정오/)) {
      time = { h: 12, m: 0 };
    }
  }
  let duration = null;
  if (time && !endTime) {
    const d = grab(/(\d+)\s*시간(?:\s*(반|(\d+)\s*분))?(?:\s*동안)?/) ;
    if (d) duration = Number(d[1]) * 60 + (d[2] === '반' ? 30 : Number(d[3] || 0));
    else {
      const m = grab(/(\d+)\s*분\s*동안/);
      if (m) duration = Number(m[1]);
    }
  }

  // 날짜
  const today = startOfDay(now);
  let date = null;
  let m;
  if ((m = grab(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})일?/))) {
    date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  } else if ((m = grab(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/))) {
    date = new Date(Number(m[1] || today.getFullYear()), Number(m[2]) - 1, Number(m[3]));
    if (!m[1] && date < addDays(today, -60)) date.setFullYear(date.getFullYear() + 1);
  } else if ((m = grab(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/))) {
    date = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (date < addDays(today, -60)) date.setFullYear(date.getFullYear() + 1);
  } else if ((m = grab(/(다음|이번)\s?달\s*(\d{1,2})일/))) {
    date = new Date(today.getFullYear(), today.getMonth() + (m[1] === '다음' ? 1 : 0), Number(m[2]));
  } else if ((m = grab(/(\d+)\s*(일|주|개월|달)\s*(?:뒤|후)/))) {
    const n = Number(m[1]);
    if (m[2] === '일') date = addDays(today, n);
    else if (m[2] === '주') date = addDays(today, n * 7);
    else date = new Date(today.getFullYear(), today.getMonth() + n, today.getDate());
  } else if ((m = grab(/(오늘|내일|모레|글피)/))) {
    date = addDays(today, { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }[m[1]]);
  } else if ((m = grab(/(이번\s?주|담주|다음\s?주|다다음\s?주)?\s*([월화수목금토일])요일/) || grab(/(이번\s?주|담주|다음\s?주|다다음\s?주)\s*([월화수목금토일])(?![가-힣])/))) {
    const target = WEEKDAY[m[2]];
    if (m[1]) {
      const weeks = /다다음/.test(m[1]) ? 2 : /(다음|담)/.test(m[1]) ? 1 : 0;
      date = addDays(startOfWeek(today), weeks * 7 + ((target + 6) % 7));
    } else {
      date = addDays(today, (target - today.getDay() + 7) % 7);
    }
  } else if (grab(/(이번\s?주\s?)?주말/)) {
    date = addDays(today, (6 - today.getDay() + 7) % 7);
  } else if (grab(/(이번\s?달\s?말|월말)/)) {
    date = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if ((m = grab(/(?<!\d)(\d{1,2})일(?!\s*(?:뒤|후|동안|간))/))) {
    date = new Date(today.getFullYear(), today.getMonth(), Number(m[1]));
    if (date < today) date = new Date(today.getFullYear(), today.getMonth() + 1, Number(m[1]));
  }

  if (/(?<=\s)까지(?=\s)/.test(s) && (date || time)) out.deadline = true;
  s = s.replace(/(?<=\s)(?:까지|부터|에|에는|쯤|경)(?=\s)/g, ' ');

  if (time) {
    let day = date || today;
    let startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.h, time.m);
    if (!date && startAt < now) {
      day = addDays(day, 1);
      startAt = addDays(startAt, 1);
    }
    out.start = toLocalISO(startAt);
    if (endTime) out.end = toLocalISO(new Date(day.getFullYear(), day.getMonth(), day.getDate(), endTime.h, endTime.m));
    else if (!out.deadline) out.end = toLocalISO(addMinutes(startAt, duration ?? 60));
  } else if (date) {
    out.start = ymd(date);
  }

  if (explicitType) out.type = explicitType;
  else if (SOMEDAY_WORDS.test(original) && !date && !time) out.type = 'someday';
  else if (time && !out.deadline) out.type = 'event';
  else if (date && ALL_DAY_WORDS.test(original)) out.type = 'event';
  else if (date || time) out.type = 'task';
  else if (out.link || INFO_WORDS.test(original)) out.type = 'info';
  else out.type = 'task';

  if (out.type === 'task' && out.end) out.end = null;
  out.allDay = Boolean(out.start && out.start.length === 10);
  out.title = s.replace(/\s+/g, ' ').replace(/^[\s:：,.-]+|[\s:：,-]+$/g, '').trim();
  return out;
}
