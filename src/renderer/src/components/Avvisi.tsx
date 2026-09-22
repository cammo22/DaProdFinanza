import { useEffect, useState } from 'react'
import { Icona } from './icone'

/**
 * Avvisi brevi in basso ("Backup creato", "Tempo registrato"): compaiono,
 * restano qualche secondo e se ne vanno, senza spostare la schermata.
 * Si chiamano da ovunque con `mostraAvviso`.
 */

type Tono = 'ok' | 'errore' | 'info'

interface Avviso {
  id: number
  testo: string
  tono: Tono
}

const EVENTO = 'daprod:avviso'
let prossimo = 1

export function mostraAvviso(testo: string, tono: Tono = 'ok'): void {
  window.dispatchEvent(new CustomEvent<Avviso>(EVENTO, { detail: { id: prossimo++, testo, tono } }))
}

const STILE: Record<Tono, { classe: string; icona: 'spunta' | 'attenzione' | 'info' }> = {
  ok: { classe: 'border-positive/40 text-positive', icona: 'spunta' },
  errore: { classe: 'border-negative/50 text-negative', icona: 'attenzione' },
  info: { classe: 'border-brand-400/40 text-brand-300', icona: 'info' }
}

export function Avvisi(): React.JSX.Element {
  const [avvisi, setAvvisi] = useState<Avviso[]>([])
  useEffect(() => {
    const f = (e: Event): void => {
      const a = (e as CustomEvent<Avviso>).detail
      setAvvisi((l) => [...l.slice(-2), a])
      setTimeout(() => setAvvisi((l) => l.filter((x) => x.id !== a.id)), a.tono === 'errore' ? 7000 : 4000)
    }
    window.addEventListener(EVENTO, f)
    return () => window.removeEventListener(EVENTO, f)
  }, [])
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-2 px-3 md:bottom-14"
      aria-live="polite"
    >
      {avvisi.map((a) => (
        <div
          key={a.id}
          className={`compare pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl border bg-ink-850/95 px-4 py-2.5 text-sm shadow-2xl shadow-black/50 backdrop-blur ${STILE[a.tono].classe}`}
        >
          <Icona nome={STILE[a.tono].icona} className="h-4 w-4" />
          <span className="text-ink-100">{a.testo}</span>
        </div>
      ))}
    </div>
  )
}
