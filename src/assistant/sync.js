// 노션 항목과 구글 캘린더 일정, 구글 할 일을 비교해 무엇을 어느 쪽에 써야 하는지 계획을 세우는 순수 함수 모음.
// 마지막 동기화 때의 지문(fp)과 구글 수정 시각(gu)을 노션 「동기화 지문」에 남기고, 그와 달라진 쪽을 바뀐 쪽으로 본다.
import { addDays, addMinutes, dayKey, isAllDay, toDate, toLocalISO, ymd } from './dates.js';

const MARK = '노션 비서:';
export const compactId = (id) => String(id || '').replaceAll('-', '').toLowerCase();
export const notionLink = (id) => `https://www.notion.so/${compactId(id)}`;

const normTime = (value) => {
  if (!value) return null;
  if (isAllDay(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const clean = (text) => String(text || '').replace(/\r/g, '').trim();

// 구글 설명이나 메모 끝에 붙인 노션 링크 줄을 떼어 낸다. 구글 캘린더 설명의 HTML 태그도 걷어 낸다.
export function stripMark(text) {
  return clean(
    String(text || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith(MARK))
      .join('\n'),
  );
}

const withMark = (memo, id) => [clean(memo), `${MARK} ${notionLink(id)}`].filter(Boolean).join('\n\n');
export const hasMark = (text) => String(text || '').includes(MARK);

export function itemEventFields(item) {
  return {
    title: clean(item.title),
    start: normTime(item.start),
    end: normTime(item.end),
    place: clean(item.place),
    memo: clean(item.memo),
  };
}

export function itemTaskFields(item) {
  return { title: clean(item.title), due: dayKey(item.start), done: Boolean(item.done), memo: clean(item.memo) };
}

export const fingerprint = (fields) => hash(JSON.stringify(fields));

export function parseSyncState(text) {
  const [fp = '', gu = ''] = String(text || '').split('|');
  return { fp, gu };
}
export const syncStateText = (fp, gu) => `${fp}|${gu || ''}`;

// 구글 캘린더 일정 → 앱 항목 필드. 종일 일정의 끝은 구글이 다음 날(배타)로 주므로 하루 당긴다.
export function eventFields(event) {
  const allDay = Boolean(event.start?.date);
  const start = allDay ? event.start.date : event.start?.dateTime || null;
  let end = allDay ? (event.end?.date ? ymd(addDays(toDate(event.end.date), -1)) : null) : event.end?.dateTime || null;
  if (allDay && end === start) end = null;
  return {
    title: clean(event.summary) || '(제목 없음)',
    start,
    end,
    place: clean(event.location),
    memo: stripMark(event.description),
  };
}

export function eventBody(item, timeZone) {
  const allDay = isAllDay(item.start);
  const startDate = toDate(item.start);
  const end = item.end
    ? toDate(item.end)
    : allDay ? startDate : addMinutes(startDate, 60);
  return {
    summary: clean(item.title) || '(제목 없음)',
    location: clean(item.place),
    description: withMark(item.memo, item.id),
    start: allDay ? { date: ymd(startDate) } : { dateTime: toLocalISO(startDate), timeZone },
    end: allDay ? { date: ymd(addDays(end, 1)) } : { dateTime: toLocalISO(end), timeZone },
    extendedProperties: { private: { notionPageId: compactId(item.id) } },
  };
}

export function taskFields(task) {
  return {
    title: clean(task.title) || '(제목 없음)',
    start: task.due ? task.due.slice(0, 10) : null,
    done: task.status === 'completed',
    memo: stripMark(task.notes),
  };
}

export function taskBody(item) {
  const due = dayKey(item.start);
  return {
    title: clean(item.title) || '(제목 없음)',
    notes: withMark(item.memo, item.id),
    due: due ? `${due}T00:00:00.000Z` : null,
    status: item.done ? 'completed' : 'needsAction',
    ...(item.done ? {} : { completed: null }),
  };
}

const declined = (event) => (event.attendees || []).some((a) => a.self && a.responseStatus === 'declined');

// 어느 쪽이 바뀌었는지 판단한다. 둘 다 바뀌면 나중에 고친 쪽이 이긴다.
function decide(item, localFields, remoteUpdated) {
  const state = parseSyncState(item.syncState);
  const notionChanged = fingerprint(localFields) !== state.fp;
  const googleChanged = Boolean(remoteUpdated) && remoteUpdated !== state.gu;
  if (notionChanged && googleChanged) {
    return new Date(remoteUpdated) > new Date(item.editedAt || 0) ? 'pull' : 'push';
  }
  if (notionChanged) return 'push';
  if (googleChanged) return 'pull';
  return null;
}

/**
 * @param {{items: object[], events: object[], tasks: object[], now?: Date}} input
 *   items 는 노션 항목, events 는 구글 캘린더 일정(showDeleted), tasks 는 구글 할 일(showDeleted)
 * @returns {object[]} 할 일 목록. kind 로 갈린다.
 */
export function planSync({ items, events = [], tasks = [], now = new Date() }) {
  const ops = [];
  const eventById = new Map(events.map((e) => [e.id, e]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const eventByPage = new Map(events.filter((e) => e.extendedProperties?.private?.notionPageId).map((e) => [e.extendedProperties.private.notionPageId, e]));
  const linkedEvents = new Set(items.map((i) => i.gcalId).filter(Boolean));
  const linkedTasks = new Set(items.map((i) => i.gtaskId).filter(Boolean));

  for (const item of items) {
    // 일정 ↔ 구글 캘린더
    if (item.type === 'event' && item.start) {
      if (!item.gcalId) {
        const mine = eventByPage.get(compactId(item.id));
        if (mine && mine.status !== 'cancelled') ops.push({ kind: 'linkEvent', item, event: mine });
        else if (!item.done) ops.push({ kind: 'createEvent', item });
      } else {
        const event = eventById.get(item.gcalId);
        if (event?.status === 'cancelled') ops.push({ kind: 'trashItem', item, reason: 'event-cancelled' });
        else if (event) {
          const action = decide(item, itemEventFields(item), event.updated);
          if (action === 'push') ops.push({ kind: 'patchEvent', item, event });
          if (action === 'pull') ops.push({ kind: 'pullEvent', item, event, fields: eventFields(event) });
        }
      }
    } else if (item.gcalId) {
      ops.push({ kind: 'deleteEvent', item });
    }

    // 할 일 ↔ 구글 할 일
    if (item.type === 'task') {
      if (!item.gtaskId) {
        const mine = tasks.find((t) => !t.deleted && String(t.notes || '').includes(compactId(item.id)));
        if (mine) ops.push({ kind: 'linkTask', item, task: mine });
        else if (!item.done) ops.push({ kind: 'createTask', item });
      } else {
        const task = taskById.get(item.gtaskId);
        if (task?.deleted) ops.push({ kind: 'trashItem', item, reason: 'task-deleted' });
        else if (task) {
          const action = decide(item, itemTaskFields(item), task.updated);
          if (action === 'push') ops.push({ kind: 'patchTask', item, task });
          if (action === 'pull') ops.push({ kind: 'pullTask', item, task, fields: taskFields(task) });
        }
      }
    } else if (item.gtaskId) {
      ops.push({ kind: 'deleteTask', item });
    }
  }

  for (const event of events) {
    if (event.status === 'cancelled' || linkedEvents.has(event.id)) continue;
    if (event.extendedProperties?.private?.notionPageId || declined(event)) continue;
    ops.push({ kind: 'importEvent', event, fields: eventFields(event) });
  }
  const recent = addDays(now, -7);
  for (const task of tasks) {
    if (task.deleted || linkedTasks.has(task.id) || hasMark(task.notes)) continue;
    if (!clean(task.title)) continue;
    if (task.status === 'completed' && new Date(task.completed || 0) < recent) continue;
    ops.push({ kind: 'importTask', task, fields: taskFields(task) });
  }
  return ops;
}

// 동기화가 끝난 항목이 다음 비교 때 「안 바뀜」으로 보이도록 지문을 만든다
export function stateAfter(item, remoteUpdated) {
  const fields = item.type === 'event' ? itemEventFields(item) : itemTaskFields(item);
  return syncStateText(fingerprint(fields), remoteUpdated);
}
