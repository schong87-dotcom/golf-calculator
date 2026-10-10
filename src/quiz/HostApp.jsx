// 퀴즈게임 강사 쪽 입구: 로그인 확인 후 내 퀴즈 목록, 편집기(?edit=), 진행 화면(?run=)을 주소로 오간다
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import QuizList from './QuizList';
import QuizEditor from './QuizEditor';
import RunSession from './RunSession';

function readRoute() {
  const p = new URLSearchParams(window.location.search);
  return { edit: p.get('edit'), run: p.get('run') };
}

export default function HostApp() {
  const [user, setUser] = useState(undefined);
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    const onPop = () => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const go = (params, { replace = false } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    window.history[replace ? 'replaceState' : 'pushState'](null, '', qs ? `?${qs}` : window.location.pathname);
    setRoute(readRoute());
  };

  if (user === undefined) return <p className="qz-loading">불러오는 중...</p>;
  if (!user) return <Welcome />;
  if (route.run) return <RunSession id={route.run} onExit={() => go({})} />;
  if (route.edit) return <QuizEditor id={route.edit === 'new' ? null : route.edit} go={go} />;
  return <QuizList user={user} go={go} />;
}

// 로그인하지 않은 사람: 입장코드로 참여하거나, 퀴즈를 만들려면 앱 모음에서 로그인
function Welcome() {
  const [code, setCode] = useState('');
  const digits = code.replace(/\D/g, '');

  const join = e => {
    e.preventDefault();
    if (digits.length === 6) window.location.assign(`/quiz/?c=${digits}`);
  };

  return (
    <div className="qz-page">
      <main className="qz-main qz-welcome">
        <h1>퀴즈게임</h1>
        <form className="qz-card" onSubmit={join}>
          <h2>참여하기</h2>
          <label htmlFor="qz-code" className="qz-join-label">입장코드</label>
          <input
            id="qz-code" className="qz-input" inputMode="numeric" maxLength={6} placeholder="6자리 숫자"
            value={code} onChange={e => setCode(e.target.value)}
          />
          <button type="submit" className="qz-btn qz-primary qz-wide" disabled={digits.length !== 6}>참여</button>
        </form>
        <section className="qz-card">
          <h2>퀴즈 만들기</h2>
          <p className="qz-muted">퀴즈를 만들고 진행하려면 로그인이 필요합니다.</p>
          <a className="qz-btn qz-wide" href="/">앱 모음에서 로그인</a>
        </section>
      </main>
    </div>
  );
}
