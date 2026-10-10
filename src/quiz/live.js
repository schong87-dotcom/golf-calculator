// 퀴즈게임 실시간 알림: 바뀌면 신호만 보내고 받는 쪽이 서버에서 다시 읽는다. 신호가 빠져도 주기적으로 다시 읽는다
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';

// 수강생 전원이 듣는 채널과 강사만 듣는 채널을 나눠, 한 사람의 제출이 다른 수강생 폰을 깨우지 않게 한다
export const stateTopic = code => `quiz-${code}`;
export const hostTopic = code => `quiz-host-${code}`;

const senders = new Map();

// 채널에 들어가지 않고 REST로 신호만 보낸다
export function ping(topic, event) {
  if (!senders.has(topic)) senders.set(topic, supabase.channel(topic));
  return senders.get(topic).httpSend(event, { at: Date.now() }).catch(() => {});
}

// 동시에 여러 번 불려도 한 번에 하나씩만 돌고, 도는 중에 다시 불리면 끝난 뒤 한 번 더 돈다
export function useSerial(fn) {
  const fnRef = useRef(fn);
  const state = useRef({ running: false, again: false });
  useEffect(() => { fnRef.current = fn; });
  return useCallback(async () => {
    const s = state.current;
    if (s.running) { s.again = true; return; }
    s.running = true;
    try {
      do { s.again = false; await fnRef.current(); } while (s.again);
    } finally {
      s.running = false;
    }
  }, []);
}

// topic 의 event 신호를 받으면 refresh. 연결이 안 되면 fast, 연결되면 slow 간격으로도 다시 읽는다
export function useLive(topic, event, refresh, { fast = 2500, slow = 8000 } = {}) {
  useEffect(() => {
    if (!topic) return undefined;
    let connected = false;
    let timer;
    const channel = supabase.channel(topic)
      .on('broadcast', { event }, () => refresh())
      .subscribe(status => {
        connected = status === 'SUBSCRIBED';
        if (connected) refresh();
      });
    const loop = () => { timer = setTimeout(() => { refresh(); loop(); }, connected ? slow : fast); };
    loop();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [topic, event, refresh, fast, slow]);
}
