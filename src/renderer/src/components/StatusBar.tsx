import { useCallback, useEffect, useState } from 'react'
import type { HealthState } from '@shared/types'
import { api } from '../lib/api'
import { Button } from './ui'
import { UpdateDialog, useUpdates } from './UpdateDialog'

/**
 * Status bar sempre visibile in basso — AGENTS.md §7.
 * Tailscale e "ultima sync" restano grigi finché non arriva la Fase 8.
 */
type Tone = 'ok' | 'warn' | 'off'

const DOT: Record<Tone, string> = {
  ok: 'bg-positive',
  warn: 'bg-warning',
  off: 'bg-ink-600'
}

function Indicator({ tone, label }: { tone: Tone; label: string }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
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
      setMessage(`Backup creato: ${path.split(/[\/]/).pop()}`)
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
    <footer className="flex items-center gap-5 border-t border-ink-700 bg-ink-900 px-5 py-2 text-xs">
      <span className="font-mono text-ink-400">v{version || '—'}</span>
      <Indicator tone={dbTone} label="Database" />
      <Indicator tone={serverTone} label="Server" />
      {/* Fase 8: qui comparirà "via Tailscale" o "via fallback" (§7). */}
      <Indicator tone="off" label="Tailscale" />
      <span className="text-ink-400">
        Ultima sync: {health?.last_sync ?? 'mai sincronizzato'}
      </span>

      <span className="ml-auto flex items-center gap-3">
        {message && <span className="text-ink-300">{message}</span>}
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
          {nuova ? `⬆ Nuova versione ${updates?.latest}` : 'Aggiornamenti'}
        </Button>
      </span>
      {showUpdates && updates && <UpdateDialog state={updates} onClose={() => setShowUpdates(false)} />}
    </footer>
  )
}
