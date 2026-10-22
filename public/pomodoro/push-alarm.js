// 타이머가 끝나는 시각에 서버가 휴대폰 알림을 보내도록 예약한다. 화면이 꺼져 있어도 휴대폰 설정대로 소리나 진동으로 울린다.
(() => {
  const endpoint = '/api/pomodoro-alarm';
  // 서버(api/pomodoro-alarm.js)의 vapidPublicKey 와 같은 값이다.
  const publicKey = 'BDos1Yj7la03p0_4rA628-GHhN3gv9x6nZ3BSuQC6SMyHbkZwx7JciqkJoPXOjeieFzngLEcYVQUawgpUIV_Phg';
  const storageKey = 'pomodoro-dial-push-v1';
  const byId = (id) => document.getElementById(id);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
  let chain = Promise.resolve();
  let lastError = '';

  function read() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch {
      return {};
    }
  }

  function remember(values) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...read(), ...values }));
    } catch { /* 저장소를 못 쓰면 다음 시작 때 다시 묻는다. */ }
  }

  const permission = () => (supported ? Notification.permission : 'unsupported');
  const keyBytes = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
  const sameKey = (subscription) => {
    const key = subscription.options?.applicationServerKey;
    return !key || new Uint8Array(key).join() === keyBytes(publicKey).join();
  };

  function render() {
    const state = permission();
    byId('push-button').hidden = state !== 'default';
    const text = {
      unsupported: ios
        ? '아이폰은 Safari 공유 버튼에서 「홈 화면에 추가」로 설치하고 그 아이콘으로 열어야 알림을 켤 수 있습니다. 지금은 화면을 켜 두면 소리로 알립니다.'
        : '이 브라우저는 알림을 지원하지 않습니다. 화면을 켜 두면 소리로 알립니다.',
      default: '알림을 켜면 화면이 꺼져 있어도 끝나는 시각에 알립니다. 소리 모드면 소리, 진동 모드면 진동으로 울립니다.',
      granted: '알림 켜짐. 끝나는 시각에 휴대폰 설정대로 소리나 진동으로 알립니다.',
      denied: '알림이 차단되어 있습니다. 브라우저나 휴대폰 설정에서 이 사이트의 알림을 허용해 주세요.',
    }[state];
    byId('push-status').textContent = lastError ? `${text} 마지막 예약 실패, ${lastError}` : text;
    byId('push-status').dataset.error = String(Boolean(lastError));
  }

  // 사파리는 누른 순간에만 권한 창을 띄운다. 그래서 await 앞에서 부른다.
  function ask() {
    remember({ asked: true });
    return Promise.resolve(Notification.requestPermission()).then(render, render);
  }

  function queue(task) {
    chain = chain.then(task).catch((error) => {
      lastError = error.message || '알림을 예약하지 못했습니다.';
      render();
    });
  }

  function registration() {
    const timeout = new Promise((resolve, reject) => window.setTimeout(() => reject(new Error('서비스 워커가 준비되지 않았습니다.')), 10000));
    return Promise.race([navigator.serviceWorker.ready, timeout]);
  }

  // 첫 시작 때 한 번만 권한을 묻는다. 그 뒤로는 설정의 「알림 켜기」로 묻는다.
  function schedule(alarm) {
    if (!supported) return;
    const asking = permission() === 'default' && !read().asked ? ask() : null;
    queue(async () => {
      await asking;
      if (permission() !== 'granted') return;
      const { pushManager } = await registration();
      let subscription = await pushManager.getSubscription();
      if (subscription && !sameKey(subscription)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ||= await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), ...alarm }),
      });
      if (!response.ok) throw new Error(`서버 응답 ${response.status}`);
      lastError = '';
      render();
    });
  }

  // 서버 큐에 넣은 예약은 지울 수 없다. 구독을 끊어 옛 주소로 가는 알림을 푸시 서비스가 버리게 한다.
  function cancel() {
    if (permission() !== 'granted') return;
    queue(async () => {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    });
  }

  byId('push-button').addEventListener('click', () => {
    if (permission() === 'default') void ask();
  });

  window.pomodoroPush = { schedule, cancel };
  render();
})();
