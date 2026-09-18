import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ReportPage } from './pages/report/ReportPage'
import { avviaZoom } from './lib/zoom'
import './index.css'

// La stessa pagina fa da finestra del report PDF, aperta nascosta dal main.
const report = window.location.hash === '#report'
// Il report si impagina sempre al 100%: lo zoom vale solo per le schermate.
if (!report) avviaZoom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>{report ? <ReportPage /> : <App />}</StrictMode>
)
