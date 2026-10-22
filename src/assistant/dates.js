// 노션 비서의 날짜 계산 모음. 기기 시간대 기준이고 'YYYY-MM-DD'(종일)와 오프셋 붙은 ISO(시각)를 오간다.
const pad = (n) => String(n).padStart(2, '0');
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 기기 시간대 오프셋을 붙인 ISO 문자열. 노션과 구글 둘 다 이 모양을 그대로 받는다.
export function toLocalISO(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export const isAllDay = (value) => typeof value === 'string' && value.length === 10;

// 'YYYY-MM-DD' 는 그날 0시(기기 시간대), 시각이 있으면 그 순간.
export function toDate(value) {
  if (!value) return null;
  if (isAllDay(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

// 달력 날짜 차이(시각 무시). b 가 a 보다 뒤면 양수.
export function dayDiff(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86_400_000);
}

// 월요일 시작 주의 첫날
export function startOfWeek(date) {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

export const dayKey = (value) => (value ? ymd(toDate(value)) : null);

export function timeText(value) {
  if (!value || isAllDay(value)) return '';
  const date = toDate(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 「오늘」, 「내일」, 「10월 30일(금)」처럼 사람이 읽는 날짜
export function dayLabel(value, now = new Date()) {
  if (!value) return '';
  const date = toDate(value);
  const diff = dayDiff(now, date);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === 2) return '모레';
  if (diff === -1) return '어제';
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${sameYear ? '' : `${date.getFullYear()}년 `}${date.getMonth() + 1}월 ${date.getDate()}일(${WEEKDAYS[date.getDay()]})`;
}

export function whenText(start, end, now = new Date()) {
  if (!start) return '';
  const time = timeText(start);
  const endTime = end && !isAllDay(end) && dayKey(end) === dayKey(start) ? timeText(end) : '';
  const range = time ? ` ${time}${endTime && endTime !== time ? `~${endTime}` : ''}` : '';
  const multi = end && dayKey(end) !== dayKey(start) ? ` → ${dayLabel(end, now)}` : '';
  return `${dayLabel(start, now)}${range}${multi}`;
}
