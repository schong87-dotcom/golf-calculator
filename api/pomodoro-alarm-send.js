// 큐가 예약 시각에 넘겨준 알람을 웹 푸시로 휴대폰에 보낸다. 소리로 울릴지 진동으로 울릴지는 휴대폰 설정이 정한다.
/* global process */
// 원본은 드라이브 뽀모도로 폴더의 api/pomodoro-alarm-send.js 다. 앱 모음 vercel.json 의 experimentalTriggers 가 큐 「pomodoro-alarm」을 이 함수로 보낸다.
import { QueueClient } from '@vercel/queue';
import webpush from 'web-push';
import { validSubscription, vapidPublicKey } from './pomodoro-alarm.js';

const subject = 'https://golf-calculator-six.vercel.app/pomodoro/';
const lateLimit = 10 * 60_000;

export function createSender({ fetchImpl = (...args) => fetch(...args), env = process.env, publicKey = vapidPublicKey, now = () => Date.now() } = {}) {
  return async function deliver(message) {
    const subscription = validSubscription(message?.subscription);
    if (!subscription) return { skipped: 'bad-subscription' };
    if (now() > Number(message.fireAt) + lateLimit) return { skipped: 'late' };
    if (!env.POMODORO_VAPID_PRIVATE_KEY) throw new Error('POMODORO_VAPID_PRIVATE_KEY 환경변수가 없습니다.');
    const details = webpush.generateRequestDetails(subscription, JSON.stringify({ title: message.title, body: message.body, fireAt: message.fireAt }), {
      vapidDetails: { subject, publicKey, privateKey: env.POMODORO_VAPID_PRIVATE_KEY },
      TTL: 600,
      urgency: 'high',
    });
    // fetch 가 본문 길이를 직접 붙이므로 Content-Length 는 빼고, 숫자 헤더는 글자로 바꾼다.
    const headers = Object.fromEntries(Object.entries(details.headers)
      .filter(([name]) => name.toLowerCase() !== 'content-length')
      .map(([name, value]) => [name, String(value)]));
    const response = await fetchImpl(details.endpoint, { method: details.method, headers, body: details.body, signal: AbortSignal.timeout(10000) });
    // 일시정지나 초기화 때 앱이 구독을 바꿔 옛 주소는 사라진다. 그 알림은 버린다.
    if (response.status === 404 || response.status === 410) return { skipped: 'gone' };
    if (response.status < 200 || response.status >= 300) throw new Error(`푸시 서비스 응답 ${response.status}`);
    return { sent: true };
  };
}

const deliver = createSender();

// 예약 시각보다 얼마나 늦게 보냈는지(lagMs)를 로그에 남긴다.
export default new QueueClient().handleNodeCallback(async (message) => {
  const lagMs = Date.now() - Number(message?.fireAt);
  try {
    console.log('pomodoro-alarm', JSON.stringify({ ...(await deliver(message)), lagMs }));
  } catch (error) {
    console.error('pomodoro-alarm', JSON.stringify({ error: error.message, lagMs }));
    throw error;
  }
}, {
  // 알람은 늦으면 소용이 없어서 5초 간격으로 다섯 번까지만 다시 보낸다.
  retry: (error, metadata) => (metadata.deliveryCount >= 5 ? { acknowledge: true } : { afterSeconds: 5 }),
});
