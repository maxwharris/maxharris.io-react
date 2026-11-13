import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// /radio/ is the radio's own page (radio/index.html, built beside this one); a stray /radio without the slash goes there
if (window.location.pathname === '/radio') {
  window.location.replace(`/radio/${window.location.search}${window.location.hash}`)
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
