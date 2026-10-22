// 타이머가 끝나는 시각에 휴대폰 알림이 가도록 Vercel 큐에 지연 메시지로 예약하는 서버 함수.
/* global Buffer */
// 원본은 드라이브 뽀모도로 폴더의 api/pomodoro-alarm.js 다. 앱 모음의 사본은 scripts/sync-to-hub.mjs 로만 바꾼다.
import { send } from '@vercel/queue';

export const alarmTopic = 'pomodoro-alarm';
// 앱(push-alarm.js)에 박힌 공개 키와 같은 값이다. 짝인 개인 키는 Vercel 환경변수 POMODORO_VAPID_PRIVATE_KEY 에 있다.
export const vapidPublicKey = 'BDos1Yj7la03p0_4rA628-GHhN3gv9x6nZ3BSuQC6SMyHbkZwx7JciqkJoPXOjeieFzngLEcYVQUawgpUIV_Phg';
// 크롬과 삼성 인터넷(FCM), 사파리(애플), 파이어폭스, 엣지(WNS)의 푸시 서비스만 받는다. 아무 주소로나 요청을 보내지 않게 한다.
const pushHosts = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com'];
const pushHostSuffixes = ['.push.apple.com', '.notify.windows.com'];
const maxDelaySeconds = 61 * 60;

const keyBytes = (value) => (typeof value === 'string' && /^[A-Za-z0-9_-]+=*$/.test(value) ? Buffer.from(value, 'base64url').length : 0);

export function validSubscription(subscription) {
  let url;
  try {
    url = new URL(subscription?.endpoint);
  } catch {
    return null;
  }
  const host = url.hostname;
  const knownHost = pushHosts.includes(host) || pushHostSuffixes.some((suffix) => host.endsWith(suffix));
  if (url.protocol !== 'https:' || !knownHost) return null;
  const { p256dh, auth } = subscription.keys || {};
  if (keyBytes(p256dh) !== 65 || keyBytes(auth) !== 16) return null;
  return { endpoint: url.href, keys: { p256dh, auth } };
}

export function createHandler({ sendImpl = send, now = () => Date.now() } = {}) {
  const fail = (response, code, reason, error) => response.status(code).json({ ok: false, reason, error });

  return async function handler(request, response) {
    if (request.method !== 'POST') return fail(response, 405, 'method', 'POST 요청만 받습니다.');
    let body;
    try {
      body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {};
    } catch {
      return fail(response, 400, 'bad-json', '요청 형식이 올바르지 않습니다.');
    }
    const subscription = validSubscription(body.subscription);
    if (!subscription) return fail(response, 400, 'bad-subscription', '알림 구독 정보가 올바르지 않습니다.');
    const fireAt = Number(body.fireAt);
    const delaySeconds = Math.ceil((fireAt - now()) / 1000);
    // 요청이 오는 사이 몇 초 지난 것은 바로 보낸다. 지난 지 오래되었거나 1시간 넘게 남은 예약은 받지 않는다.
    if (!Number.isFinite(fireAt) || delaySeconds < -30 || delaySeconds > maxDelaySeconds) {
      return fail(response, 400, 'bad-time', '알림 시각이 올바르지 않습니다.');
    }
    const payload = {
      subscription,
      fireAt,
      title: String(body.title || '뽀모도로 타이머').slice(0, 80),
      body: String(body.body || '시간이 끝났습니다.').slice(0, 200),
    };
    const delay = Math.max(0, delaySeconds);
    const { messageId } = await sendImpl(alarmTopic, payload, { delaySeconds: delay, retentionSeconds: Math.max(60, delay + 600) });
    return response.status(200).json({ ok: true, messageId, delaySeconds: delay });
  };
}

export default createHandler();
