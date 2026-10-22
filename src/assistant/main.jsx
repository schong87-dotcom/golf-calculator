// 노션 비서 페이지(/assistant/)의 진입 파일
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './assistant.css'
import AssistantApp from './AssistantApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AssistantApp />
  </StrictMode>,
)
