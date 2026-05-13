import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@brickops/ui/src/tokens.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
