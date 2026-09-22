import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { avviaTema } from './lib/tema'
import { avviaZoom } from './lib/zoom'
import './index.css'

// Il report si carica solo nella sua finestra: le schermate partono più leggere.
const ReportPage = lazy(() => import('./pages/report/ReportPage').then((m) => ({ default: m.ReportPage })))

// La stessa pagina fa da finestra del report PDF, aperta nascosta dal main.
const report = window.location.hash === '#report'
// Il report si impagina sempre al 100% e su carta bianca: zoom e tema valgono
// solo per le schermate.
if (!report) {
  avviaZoom()
  avviaTema()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {report ? (
      <Suspense fallback={null}>
        <ReportPage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
)
