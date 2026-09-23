import { useCallback, useEffect, useState } from 'react'
import type { HealthState } from '@shared/types'
import { api } from '../lib/api'
import { Button } from './ui'
import { UpdateDialog, useUpdates } from './UpdateDialog'
import { applicaZoom, useZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_PASSO } from '../lib/zoom'

/**
 * Status bar sempre visibile in basso — AGENTS.md §7.
 * Collegamento e "ultima sync" restano grigi finché non arriva la Fase 8.
 */
type Tone = 'ok' | 'warn' | 'off'

const DOT: Record<Tone, string> = {
  ok: 'bg-positive',
  warn: 'bg-warning',
  off: 'bg-ink-600'
}

function Indicator({
  tone,
  label,
  title
}: {
  tone: Tone
  label: string
  title?: string
}): React.JSX.Element {
  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className={`h-2 w-2 rounded-full ${DOT[tone]}`} />
      <span className={tone === 'off' ? 'text-ink-400' : 'text-ink-300'}>{label}</span>
    </span>
  )
}

export function StatusBar({ version }: { version: string }): React.JSX.Element {
  const [health, setHealth] = useState<HealthState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const updates = useUpdates()
  const [showUpdates, setShowUpdates] = useState(false)
  const nuova =
    updates && (updates.status === 'available' || updates.status === 'ready' || updates.status === 'downloading')

  const refresh = useCallback(async () => {
    try {
      setHealth(await api.get<HealthState>('/api/health'))
    } catch {
      setHealth(null)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 15_000)
    return () => clearInterval(timer)
  }, [refresh])

  const onBackup = async (): Promise<void> => {
    setBusy(true)
    try {
      const path = await window.daprod.backupDatabase()
      setMessage(`Backup creato: ${path.split(/[\\/]/).pop()}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup non riuscito.')
    } finally {
      setBusy(false)
      setTimeout(() => setMessage(null), 6000)
    }
  }

  const dbTone: Tone = health?.database === 'ok' ? 'ok' : 'off'
  const serverTone: Tone = health?.server === 'ok' ? 'ok' : 'off'

  return (
    // Sul telefono la barra non c'è: Backup e Aggiornamenti stanno in fondo al menu.
    <footer className="flex items-center gap-3 overflow-x-auto border-t border-ink-700 bg-ink-900 px-3 py-2 text-xs max-md:hidden md:gap-5 md:px-5">
      <span className="font-mono text-ink-400">v{version || '—'}</span>
      <Indicator tone={dbTone} label="Database" />
      <span className="hidden md:contents">
        <Indicator tone={serverTone} label="Server" />
        {/* Fase 8: qui comparirà lo stato del canale con le aziende (§3, §7). */}
        <Indicator
          tone="off"
          label="Collegamento"
          title="Il collegamento fra studio e aziende arriva con la fase 8."
        />
        <span className="text-ink-400">
          Ultima sync: {health?.last_sync ?? 'mai sincronizzato'}
        </span>
      </span>

      <span className="ml-auto flex items-center gap-3">
        {message && <span className="text-ink-300">{message}</span>}
        <ZoomControl />
        <Button onClick={onBackup} disabled={busy} className="px-3 py-1 text-xs">
          Backup
        </Button>
        <Button
          onClick={refresh}
          className="px-2.5 py-1 text-xs"
          title="Ricontrolla database e server"
          aria-label="Ricontrolla database e server"
        >
          ↻
        </Button>
        <Button
          variant={nuova ? 'primary' : 'ghost'}
          onClick={() => setShowUpdates(true)}
          className="px-3 py-1 text-xs"
          title="Cerca e installa la nuova versione da GitHub"
        >
          {nuova ? `Nuova versione ${updates?.latest}` : 'Aggiornamenti'}
        </Button>
      </span>
      {showUpdates && updates && <UpdateDialog state={updates} onClose={() => setShowUpdates(false)} />}
    </footer>
  )
}

/** Zoom dell'interfaccia: − percentuale +, e "Automatico" per tornare a quello adatto allo schermo. */
function ZoomControl(): React.JSX.Element {
  const { zoom, automatico } = useZoom()
  const pct = Math.round(zoom * 100)
  const bottone =
    'h-6 w-6 rounded-md border border-ink-700 bg-ink-800 text-ink-200 hover:border-brand-400/70 hover:bg-brand-500/20 disabled:opacity-40'
  return (
    // Sul telefono lo zoom non serve (le schermate si ridispongono da sole): via i pulsanti.
    <span className="flex items-center gap-1.5 max-md:hidden" title="Zoom dell'interfaccia (Ctrl + / Ctrl − / Ctrl 0)">
      <span className="text-ink-400">Zoom</span>
      <button type="button" className={bottone} disabled={zoom <= ZOOM_MIN + 0.001} onClick={() => applicaZoom(zoom - ZOOM_PASSO)} aria-label="Riduci">
        −
      </button>
      <button
        type="button"
        onClick={() => applicaZoom(null)}
        className={`w-14 rounded-md px-1 py-0.5 text-center font-mono ${automatico ? 'text-brand-300' : 'text-ink-200 hover:text-brand-300'}`}
        title={automatico ? 'Adatto allo schermo' : 'Clic: torna allo zoom adatto allo schermo'}
      >
        {pct}%{automatico ? ' A' : ''}
      </button>
      <button type="button" className={bottone} disabled={zoom >= ZOOM_MAX - 0.001} onClick={() => applicaZoom(zoom + ZOOM_PASSO)} aria-label="Ingrandisci">
        +
      </button>
    </span>
  )
}

/** In fondo al menu del telefono: gli stessi Backup e Aggiornamenti della barra di stato. */
export function StrumentiTelefono({ onEsci }: { onEsci: () => void }): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const updates = useUpdates()
  const [showUpdates, setShowUpdates] = useState(false)
  const nuova =
    updates && (updates.status === 'available' || updates.status === 'ready' || updates.status === 'downloading')

  const onBackup = async (): Promise<void> => {
    setBusy(true)
    try {
      const path = await window.daprod.backupDatabase()
      setMessage(`Backup creato: ${path.split(/[\\/]/).pop()}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup non riuscito.')
    } finally {
      setBusy(false)
      setTimeout(() => setMessage(null), 6000)
    }
  }

  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onBackup} disabled={busy} className="px-3 py-2 text-xs">
          Backup
        </Button>
        <Button variant={nuova ? 'primary' : 'ghost'} onClick={() => setShowUpdates(true)} className="px-3 py-2 text-xs">
          {nuova ? `Nuova ${updates?.latest}` : 'Aggiornamenti'}
        </Button>
      </div>
      {message && <p className="text-[11px] text-ink-300">{message}</p>}
      <Button variant="danger" onClick={onEsci} className="px-3 py-2 text-xs">
        Esci
      </Button>
      {showUpdates && updates && <UpdateDialog state={updates} onClose={() => setShowUpdates(false)} />}
    </div>
  )
}
