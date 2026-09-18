import { useEffect, useState } from 'react'

/**
 * Zoom dell'interfaccia, scelto da chi usa il programma e ricordato.
 *
 * Senza una scelta, parte adatto allo schermo: su un 1080p con il ridimensionamento
 * di Windows al 125% la finestra ha solo 1536 px "logici" e tutto sembra troppo
 * grande, quindi si rimpicciolisce fino a riavere lo spazio di un 1920. Su 2K e
 * sui 5K di Apple (2560 px logici) resta al 100%.
 */

const KEY = 'daprodfinanza.zoom'
export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 1.6
export const ZOOM_PASSO = 0.05

const arrotonda = (z: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z / ZOOM_PASSO) * ZOOM_PASSO))

export function zoomAutomatico(): number {
  return arrotonda(Math.min(1, window.screen.width / 1920))
}

export function zoomSalvato(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? arrotonda(v) : null
  } catch {
    return null
  }
}

const ascoltatori = new Set<(z: number) => void>()

export function applicaZoom(z: number | null): number {
  const valore = z === null ? zoomAutomatico() : arrotonda(z)
  try {
    if (z === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(valore))
  } catch {
    // resta solo per questa sessione
  }
  window.daprod.zoom.set(valore)
  ascoltatori.forEach((f) => f(valore))
  return valore
}

/** Da chiamare una volta all'avvio: zoom salvato o automatico, e scorciatoie. */
export function avviaZoom(): void {
  window.daprod.zoom.set(zoomSalvato() ?? zoomAutomatico())
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      const attuale = window.daprod.zoom.get()
      if (e.key === '+' || e.key === '=') applicaZoom(attuale + ZOOM_PASSO)
      else if (e.key === '-') applicaZoom(attuale - ZOOM_PASSO)
      else if (e.key === '0') applicaZoom(null)
      else return
      e.preventDefault()
      e.stopPropagation()
    },
    true
  )
}

export function useZoom(): { zoom: number; automatico: boolean } {
  const [zoom, setZoom] = useState(() => window.daprod.zoom.get())
  useEffect(() => {
    ascoltatori.add(setZoom)
    return () => {
      ascoltatori.delete(setZoom)
    }
  }, [])
  return { zoom, automatico: zoomSalvato() === null }
}
