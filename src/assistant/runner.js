// 동기화 계획(planSync)을 실제로 실행한다. 구글 쪽은 브라우저에서 바로 쓰고, 노션 쪽은 서버 함수에 여러 건씩 묶어 보낸다.
import { addDays, startOfDay } from './dates.js';
import { eventBody, planSync, stateAfter, taskBody } from './sync.js';
import { TASK_LIST_TITLE } from './google.js';

// 기본 캘린더가 아닌 일정은 「일정ID@@캘린더ID」로 적어 어느 캘린더 것인지 남긴다
export const eventKey = (calendarId, eventId) => (calendarId === 'primary' ? eventId : `${eventId}@@${calendarId}`);
export function splitEventKey(key) {
  const [eventId, calendarId = 'primary'] = String(key).split('@@');
  return { eventId, calendarId };
}
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';

// 할 일을 맞출 구글 할 일 목록. 정해 둔 것이 없으면 「노션 비서」 목록을 찾고, 없으면 만든다.
export async function resolveTaskList(google, settings) {
  if (settings.tasksList) return settings.tasksList;
  const lists = await google.listTaskLists();
  const found = lists.find((l) => l.title === TASK_LIST_TITLE);
  return found ? found.id : (await google.createTaskList(TASK_LIST_TITLE)).id;
}

// 앱에서 하나를 만들거나 고친 직후 그 항목만 구글에 반영한다. 바뀐 항목(노션에 다시 써야 할 것)을 돌려준다.
export async function pushItem(item, google, settings) {
  let next = { ...item };
  let changed = false;
  if (next.type === 'event' && next.start) {
    if (next.gcalId) {
      const { eventId, calendarId } = splitEventKey(next.gcalId);
      const ev = await google.patchEvent(calendarId, eventId, eventBody(next, timeZone()));
      next = { ...next, syncState: stateAfter(next, ev.updated) };
      changed = true;
    } else if (!next.done) {
      const ev = await google.createEvent(settings.writeCalendar, eventBody(next, timeZone()));
      next = { ...next, gcalId: eventKey(settings.writeCalendar, ev.id), googleUrl: ev.htmlLink || '' };
      next.syncState = stateAfter(next, ev.updated);
      changed = true;
    }
  } else if (next.gcalId) {
    const { eventId, calendarId } = splitEventKey(next.gcalId);
    await google.deleteEvent(calendarId, eventId);
    next = { ...next, gcalId: null, googleUrl: '', syncState: '' };
    changed = true;
  }
  if (next.type === 'task') {
    if (next.gtaskId) {
      const task = await google.patchTask(settings.tasksList, next.gtaskId, taskBody(next));
      next = { ...next, syncState: stateAfter(next, task.updated) };
      changed = true;
    } else if (!next.done) {
      const task = await google.createTask(settings.tasksList, taskBody(next));
      next = { ...next, gtaskId: task.id, googleUrl: task.webViewLink || '' };
      next.syncState = stateAfter(next, task.updated);
      changed = true;
    }
  } else if (next.gtaskId) {
    await google.deleteTask(settings.tasksList, next.gtaskId);
    next = { ...next, gtaskId: null, googleUrl: next.gcalId ? next.googleUrl : '', syncState: next.gcalId ? next.syncState : '' };
    changed = true;
  }
  return changed ? next : null;
}

export async function removeFromGoogle(item, google, settings) {
  if (item.gcalId) {
    const { eventId, calendarId } = splitEventKey(item.gcalId);
    await google.deleteEvent(calendarId, eventId);
  }
  if (item.gtaskId) await google.deleteTask(settings.tasksList, item.gtaskId);
}

/**
 * 구글 일정과 할 일을 읽어 노션 항목과 맞춘다.
 * @returns {{created: number, updated: number, trashed: number, pushed: number, errors: string[]}}
 */
export async function runFullSync({ items, google, settings, notion, now = new Date(), onProgress = () => {} }) {
  const from = addDays(startOfDay(now), -1);
  const to = addDays(startOfDay(now), 31);
  onProgress('구글 캘린더를 읽는 중');
  const calendars = settings.readCalendars?.length ? settings.readCalendars : ['primary'];
  const events = (await Promise.all(calendars.map(async (calendarId) => (await google.listEvents(calendarId, from, to))
    .map((e) => ({ ...e, id: eventKey(calendarId, e.id), _rawId: e.id, _cal: calendarId }))))).flat();
  onProgress('구글 할 일을 읽는 중');
  const tasks = await google.listTasks(settings.tasksList, addDays(now, -14));
  const ops = planSync({ items, events, tasks, now });

  const current = new Map(items.map((i) => [i.id, i]));
  const touched = new Set();
  const notionOps = [];
  const errors = [];
  let pushed = 0;
  const update = (id, patch) => {
    current.set(id, { ...current.get(id), ...patch });
    touched.add(id);
  };
  const tz = timeZone();

  for (const op of ops) {
    const item = op.item ? current.get(op.item.id) : null;
    try {
      switch (op.kind) {
        case 'createEvent': {
          const ev = await google.createEvent(settings.writeCalendar, eventBody(item, tz));
          const next = { ...item, gcalId: eventKey(settings.writeCalendar, ev.id), googleUrl: ev.htmlLink || '' };
          update(item.id, { ...next, syncState: stateAfter(next, ev.updated) });
          pushed += 1;
          break;
        }
        case 'linkEvent':
          update(item.id, { gcalId: op.event.id, googleUrl: op.event.htmlLink || '', syncState: stateAfter(item, op.event.updated) });
          break;
        case 'patchEvent': {
          const ev = await google.patchEvent(op.event._cal, op.event._rawId, eventBody(item, tz));
          update(item.id, { syncState: stateAfter(item, ev.updated) });
          pushed += 1;
          break;
        }
        case 'pullEvent': {
          const next = { ...item, ...op.fields };
          update(item.id, { ...op.fields, syncState: stateAfter(next, op.event.updated) });
          break;
        }
        case 'deleteEvent': {
          const { eventId, calendarId } = splitEventKey(item.gcalId);
          await google.deleteEvent(calendarId, eventId);
          update(item.id, { gcalId: null, googleUrl: '', syncState: '' });
          break;
        }
        case 'createTask': {
          const task = await google.createTask(settings.tasksList, taskBody(item));
          const next = { ...item, gtaskId: task.id, googleUrl: task.webViewLink || '' };
          update(item.id, { ...next, syncState: stateAfter(next, task.updated) });
          pushed += 1;
          break;
        }
        case 'linkTask':
          update(item.id, { gtaskId: op.task.id, googleUrl: op.task.webViewLink || '', syncState: stateAfter(item, op.task.updated) });
          break;
        case 'patchTask': {
          const task = await google.patchTask(settings.tasksList, item.gtaskId, taskBody(item));
          update(item.id, { syncState: stateAfter(item, task.updated) });
          pushed += 1;
          break;
        }
        case 'pullTask': {
          const doneAt = op.fields.done ? (item.doneAt || op.task.completed || now.toISOString()) : null;
          const next = { ...item, ...op.fields, doneAt };
          update(item.id, { ...op.fields, doneAt, syncState: stateAfter(next, op.task.updated) });
          break;
        }
        case 'deleteTask':
          await google.deleteTask(settings.tasksList, item.gtaskId);
          update(item.id, { gtaskId: null, syncState: '' });
          break;
        case 'trashItem':
          notionOps.push({ op: 'trash', id: item.id });
          touched.delete(item.id);
          current.delete(item.id);
          break;
        case 'importEvent': {
          const fresh = {
            type: 'event', ...op.fields, source: 'gcal', gcalId: op.event.id, googleUrl: op.event.htmlLink || '',
            done: false, important: false, urgent: false, areaIds: [], tags: [],
          };
          notionOps.push({ op: 'create', item: { ...fresh, syncState: stateAfter(fresh, op.event.updated) } });
          break;
        }
        case 'importTask': {
          const fresh = {
            type: 'task', ...op.fields, end: null, source: 'gtask', gtaskId: op.task.id, googleUrl: op.task.webViewLink || '',
            doneAt: op.fields.done ? op.task.completed || null : null, important: false, urgent: false, areaIds: [], tags: [],
          };
          notionOps.push({ op: 'create', item: { ...fresh, syncState: stateAfter(fresh, op.task.updated) } });
          break;
        }
        default:
          break;
      }
    } catch (error) {
      errors.push(`${item?.title || op.fields?.title || op.kind}: ${error.message}`);
    }
  }

  for (const id of touched) if (current.has(id)) notionOps.push({ op: 'update', item: current.get(id) });
  const results = [];
  for (let i = 0; i < notionOps.length; i += 15) {
    onProgress(`노션에 쓰는 중 ${Math.min(i + 15, notionOps.length)}/${notionOps.length}`);
    results.push(...(await notion.batch(notionOps.slice(i, i + 15))));
  }
  results.forEach((r, i) => { if (!r.ok) errors.push(`${notionOps[i].item?.title || '항목'}: ${r.error}`); });
  const count = (kind) => notionOps.filter((o, i) => o.op === kind && results[i]?.ok).length;
  return { created: count('create'), updated: count('update'), trashed: count('trash'), pushed, errors };
}
