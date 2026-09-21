import { useCallback, useEffect, useState } from 'react'
import type { RunningTimer } from '@shared/types'
import { api } from '../lib/api'
import { EVENTO_TIMER, avvisaTimer, useSecondi } from '../pages/business/ActivitiesView'
import { Icona } from './icone'

/**
 * Il timer acceso, sempre in vista nella barra in alto (AGENTS.md §10.11):
 * si vede da qualunque schermata, si ferma con un clic, e un clic sul nome
 * porta alle attività dell'azienda su cui sta contando.
 */
/** Il timer acceso in tutto il programma (null se spento), sempre aggiornato. */
export function useTimerAcceso(): RunningTimer | null {
  const [timer, setTimer] = useState<RunningTimer | null>(null)
  const carica = useCallback(() => {
    api
      .get<RunningTimer | null>('/api/timer')
      .then(setTimer)
      .catch(() => setTimer(null))
  }, [])
  useEffect(() => {
    carica()
    window.addEventListener(EVENTO_TIMER, carica)
    return () => window.removeEventListener(EVENTO_TIMER, carica)
  }, [carica])
  return timer
}

export function TimerBar({ onApri }: { onApri: (companyUuid: string) => void }): React.JSX.Element | null {
  const [timer, setTimer] = useState<RunningTimer | null>(null)
  const secondi = useSecondi(timer)

  const carica = useCallback(() => {
    api
      .get<RunningTimer | null>('/api/timer')
      .then(setTimer)
      .catch(() => setTimer(null))
  }, [])

  useEffect(() => {
    carica()
    window.addEventListener(EVENTO_TIMER, carica)
    const id = setInterval(carica, 60000)
    return () => {
      window.removeEventListener(EVENTO_TIMER, carica)
      clearInterval(id)
    }
  }, [carica])

  if (!timer) return null

  const h = Math.floor(secondi / 3600)
  const m = Math.floor((secondi % 3600) / 60)
  const s = Math.floor(secondi % 60)
  const tempo = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/10 py-0.5 pl-2.5 pr-1 text-xs">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-400" />
      <button
        type="button"
        onClick={() => onApri(timer.company_uuid)}
        className="min-w-0 truncate text-left text-brand-200 hover:underline"
        title="Apri Attività e Tempi di questa azienda"
      >
        <span className="font-mono tabular-nums text-brand-300">{tempo}</span>{' '}
        <span className="hidden sm:inline">
          · {timer.company_name}
          {timer.task_title ? ` · ${timer.task_title}` : ''}
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          api
            .post('/api/timer/stop')
            .then(avvisaTimer)
            .catch(() => undefined)
        }}
        className="shrink-0 rounded-md px-2 py-0.5 text-negative hover:bg-negative/15"
        title="Ferma il timer e registra il tempo"
        aria-label="Ferma il timer"
      >
        <Icona nome="stop" pieno className="h-3 w-3" />
      </button>
    </div>
  )
}
