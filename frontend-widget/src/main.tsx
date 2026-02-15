import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ChatWidget from './ChatWidget'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatWidget
      apiKey="2b76dd8a-8206-4354-9ea6-cf4a8916c11e"
      backendUrl="http://localhost:3000"
    />
  </StrictMode>,
)
