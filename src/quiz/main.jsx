// 퀴즈게임 페이지(/quiz/)의 진입 파일
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import './quiz.css'
import QuizApp from './QuizApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QuizApp />
  </StrictMode>,
)
