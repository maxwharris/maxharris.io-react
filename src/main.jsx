import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// /radio/ is the radio's own page (radio/index.html, built beside this one) and /radio/embed/ the stream's
// (radio/embed/index.html); either one typed without its slash goes there
if (window.location.pathname === '/radio' || window.location.pathname === '/radio/embed') {
  window.location.replace(`${window.location.pathname}/${window.location.search}${window.location.hash}`)
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
