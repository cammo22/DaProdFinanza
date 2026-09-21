import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { InboxSummary } from '@shared/documents'
import { api } from './api'
import { useAuth } from './auth'
import { useImpostazioni } from './impostazioni'

/**
 * Il campanello (AGENTS.md §10.14): ogni pochi secondi si chiede al servizio
 * interno se ci sono novità. Lo usano il pallino nel menu, la casella delle
 * richieste e il pannello delle chiamate in arrivo.
 *
 * Quando cambia qualcosa (l'istante dell'ultima novità) parte l'evento
 * `daprod:richieste-cambiate`: le schermate aperte si ricaricano da sole.
 * Oggi tutto sta nello stesso programma; con la sincronizzazione (Fase 8) le
 * novità arriveranno da un altro computer, e questo meccanismo resta uguale.
 */

export const EVENTO_RICHIESTE = 'daprod:richieste-cambiate'

export type Riepilogo = InboxSummary & { per_company: Record<string, number> }

interface InboxValue {
  riepilogo: Riepilogo | null
  aggiorna: () => Promise<void>
}

const Ctx = createContext<InboxValue | null>(null)
const OGNI_MS = 8_000

export function InboxProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth()
  const { moduloAttivo, portale } = useImpostazioni()
  const attivo = user?.role === 'consultant' ? moduloAttivo('richieste') : Boolean(portale?.permessi.richieste)
  const [riepilogo, setRiepilogo] = useState<Riepilogo | null>(null)
  const ultimo = useRef<string | null | undefined>(undefined)

  const aggiorna = useCallback(async () => {
    try {
      const r = await api.get<Riepilogo>('/api/inbox/summary')
      setRiepilogo(r)
      if (ultimo.current !== undefined && ultimo.current !== r.last_event_at) {
        window.dispatchEvent(new CustomEvent(EVENTO_RICHIESTE))
      }
      ultimo.current = r.last_event_at
    } catch {
      // Il campanello tace se il servizio non risponde: riprova al giro dopo.
    }
  }, [])

  useEffect(() => {
    if (!attivo) {
      setRiepilogo(null)
      return
    }
    void aggiorna()
    const timer = setInterval(() => void aggiorna(), OGNI_MS)
    // Chi fa un'azione (risponde, carica un file) aggiorna subito, senza aspettare il giro.
    const subito = (): void => void aggiorna()
    window.addEventListener('daprod:azione-richiesta', subito)
    return () => {
      clearInterval(timer)
      window.removeEventListener('daprod:azione-richiesta', subito)
    }
  }, [attivo, aggiorna])

  const value = useMemo(() => ({ riepilogo, aggiorna }), [riepilogo, aggiorna])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useInbox(): InboxValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useInbox va usato dentro <InboxProvider>.')
  return ctx
}

/** Dopo un'azione su una richiesta o un documento: campanello e schermate si aggiornano subito. */
export function segnalaAzione(): void {
  window.dispatchEvent(new CustomEvent('daprod:azione-richiesta'))
}

/** Si ricarica quando il campanello vede una novità. */
export function useAlCambioRichieste(ricarica: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENTO_RICHIESTE, ricarica)
    return () => window.removeEventListener(EVENTO_RICHIESTE, ricarica)
  }, [ricarica])
}
