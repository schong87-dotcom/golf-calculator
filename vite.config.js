import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// public/game/ 은 Vite를 거치지 않는 별도 정적 앱(재무제표 게임)이다.
// dev 서버는 /game/ 처럼 확장자 없는 경로를 SPA fallback으로 가로채 React index.html을 돌려주므로,
// 정적 미들웨어가 잡을 수 있도록 index.html을 명시해준다. 빌드 산출물에는 영향이 없다.
function gameDirIndex() {
  return {
    name: 'game-dir-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/game' || req.url === '/game/') req.url = '/game/index.html'
        next()
      })
    },
  }
}

// 개발 서버에서 /pomodoro/ 요청을 타이머의 정적 진입 파일로 연결한다.
function pomodoroDirIndex() {
  return {
    name: 'pomodoro-dir-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/pomodoro' || req.url === '/pomodoro/') req.url = '/pomodoro/index.html'
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), gameDirIndex(), pomodoroDirIndex()],
  // 퀴즈게임은 허브와 같은 React 빌드를 쓰되 /quiz/ 로 따로 열리는 두 번째 페이지다
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        quiz: fileURLToPath(new URL('./quiz/index.html', import.meta.url)),
      },
    },
  },
})
