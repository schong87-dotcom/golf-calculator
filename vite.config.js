import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), gameDirIndex()],
})
