// 허브(/)에서 만든 구글 세션을 읽어 쓰고 게임 기록을 Supabase에 저장 (화면 코드가 쓰는 공개 API는 동기 시그니처 유지)
// 로그인 화면은 허브에만 있다. 이 파일은 세션을 만들지 않고 복원만 한다.
(function(){
  let sb = null;         // supabase 클라이언트
  let session = null;    // 현재 세션
  let cache = {};        // { gameId: [{ timeSec, at }, ...] } — 최신이 앞

  function client() {
    if (sb) return sb;
    const cfg = window.SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) throw new Error('SUPABASE_CONFIG가 비어 있습니다. js/supabase-config.js를 확인하세요.');
    sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    return sb;
  }

  function userFromSession(s) {
    if (!s || !s.user) return null;
    const meta = s.user.user_metadata || {};
    const name = meta.full_name || meta.name || (s.user.email || '').split('@')[0];
    return { name, id: s.user.id };
  }

  // 현재 사용자의 전체 기록을 읽어 메모리 캐시에 적재. RLS가 본인 행만 돌려준다.
  async function hydrate() {
    cache = {};
    if (!session) return;
    const { data, error } = await client()
      .from('game_records')
      .select('game_id, time_sec, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[fsg] 기록 불러오기 실패', error);
      UI.toast('기록을 불러오지 못했습니다.', 'error', 2600);
      return;
    }
    (data || []).forEach(row => {
      (cache[row.game_id] = cache[row.game_id] || []).push({
        timeSec: row.time_sec,
        at: new Date(row.created_at).getTime(),
      });
    });
  }

  window.Auth = {
    // 앱 부팅 시 허브에서 만든 세션을 복원하고 기록을 적재한다.
    // 같은 오리진이라 localStorage의 세션을 그대로 읽는다.
    async restore() {
      try {
        const { data } = await client().auth.getSession();
        session = data.session || null;
      } catch (e) {
        console.error('[fsg] 세션 복원 실패', e);
        session = null;
      }
      if (session) await hydrate();
      return userFromSession(session);
    },

    getUser() { return userFromSession(session); },

    async signOut() {
      try { await client().auth.signOut(); }
      catch (e) { console.error('[fsg] 로그아웃 실패', e); }
      session = null;
      cache = {};
    },
  };

  // 게임 기록: 읽기는 메모리 캐시(동기), 쓰기는 캐시를 먼저 갱신하고 서버 반영은 백그라운드
  window.Records = {
    // 해당 게임의 전체 히스토리 배열 반환 (최신 → 과거)
    listFor(userName, gameId) {
      return cache[gameId] || [];
    },
    // 최고 기록 반환 (가장 짧은 시간)
    best(userName, gameId) {
      const list = this.listFor(userName, gameId);
      if (list.length === 0) return null;
      return list.reduce((b, r) => (!b || r.timeSec < b.timeSec) ? r : b, null);
    },
    // 새 결과를 최신으로 추가
    save(userName, gameId, timeSec) {
      const list = cache[gameId] || (cache[gameId] = []);
      const prevBest = list.reduce((b, r) => (!b || r.timeSec < b.timeSec) ? r : b, null);
      const record = { timeSec, at: Date.now() };
      list.unshift(record);

      const uid = session && session.user.id;
      if (uid) {
        client().from('game_records')
          .insert({ user_id: uid, game_id: gameId, time_sec: Math.max(0, Math.round(timeSec)) })
          .then(({ error }) => {
            if (error) {
              console.error('[fsg] 기록 저장 실패', error);
              UI.toast('기록을 서버에 저장하지 못했습니다.', 'error', 2800);
            }
          }, e => console.error('[fsg] 기록 저장 실패', e));
      }
      return { improved: !prevBest || timeSec < prevBest.timeSec, record, prevBest };
    },
    clear(userName, gameId) {
      cache[gameId] = [];
      const uid = session && session.user.id;
      if (uid) {
        client().from('game_records').delete().eq('user_id', uid).eq('game_id', gameId)
          .then(({ error }) => {
            if (error) {
              console.error('[fsg] 기록 삭제 실패', error);
              UI.toast('서버에서 기록을 지우지 못했습니다.', 'error', 2800);
            }
          }, e => console.error('[fsg] 기록 삭제 실패', e));
      }
    },
  };
})();
