// 퀴즈게임 갈림길: 주소에 입장코드(?c=)가 있으면 수강생 화면, 없으면 강사 화면
import HostApp from './HostApp';
import PlayerApp from './PlayerApp';

export default function QuizApp() {
  const code = new URLSearchParams(window.location.search).get('c');
  return code ? <PlayerApp code={code} /> : <HostApp />;
}
