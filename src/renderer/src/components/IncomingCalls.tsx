import { useEffect, useRef, useState } from 'react'
import { preferredTimeLabel, type RequestAction, type RequestItem } from '@shared/documents'
import { api } from '../lib/api'
import { useImpostazioni } from '../lib/impostazioni'
import { segnalaAzione, useInbox } from '../lib/inbox'
import { Button } from './ui'
import { Icona } from './icone'
import { chiama, quandoBreve } from './RequestDetail'

/**
 * Le chiamate in arrivo, per lo studio (AGENTS.md §10.14): quando un'azienda
 * chiede di essere chiamata, in basso a destra compare una scheda con i
 * pulsanti — chiamo ora, richiamo tra poco, rispondo per scritto, la prendo in
 * carico — e il programma squilla (se lo squillo è acceso nelle Impostazioni).
 * Anche le chiamate da richiamare adesso ("avevo detto alle 15") ricompaiono.
 *
 * La scheda resta finché qualcuno dello studio non fa qualcosa: come un
 * telefono che suona. "Più tardi" la nasconde solo su questo computer, per un
 * quarto d'ora.
 */

const SILENZIO_MS = 15 * 60_000

/** Due squilli brevi, fatti col suono del browser: nessun file audio da includere. */
function squilla(): void {
  try {
    const ctx = new AudioContext()
    const nota = (inizio: number, freq: number): void => {
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      vol.gain.setValueAtTime(0.0001, ctx.currentTime + inizio)
      vol.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + inizio + 0.02)
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inizio + 0.35)
      osc.connect(vol).connect(ctx.destination)
      osc.start(ctx.currentTime + inizio)
      osc.stop(ctx.currentTime + inizio + 0.4)
    }
    nota(0, 880)
    nota(0.45, 660)
    nota(1.1, 880)
    nota(1.55, 660)
    setTimeout(() => void ctx.close(), 2500)
  } catch {
    // niente audio disponibile: resta la scheda
  }
}

function avvisoDiSistema(titolo: string, testo: string, onClick: () => void): void {
  try {
    if (!('Notification' in window)) return
    const mostra = (): void => {
      const n = new Notification(titolo, { body: testo, silent: true })
      n.onclick = () => {
        window.focus()
        onClick()
      }
    }
    if (Notification.permission === 'granted') mostra()
    else if (Notification.permission !== 'denied') void Notification.requestPermission().then((p) => p === 'granted' && mostra())
  } catch {
    // avvisi non disponibili (per esempio sul telefono): resta la scheda
  }
}

export function IncomingCalls({ onApri }: { onApri: (companyUuid: string, requestUuid: string) => void }): React.JSX.Element | null {
  const { riepilogo } = useInbox()
  const { utente } = useImpostazioni()
  const [silenziate, setSilenziate] = useState<Record<string, number>>({})
  const [errore, setErrore] = useState<string | null>(null)
  // Sul telefono il riquadro copre metà schermo: si riduce a una pastiglia.
  const [ridotto, setRidotto] = useState(false)
  const viste = useRef<Set<string>>(new Set())
  const nonLette = useRef<number | null>(null)
  const [adesso, setAdesso] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setAdesso(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const chiamate = (riepilogo?.calls ?? []).filter((c) => !silenziate[c.uuid] || silenziate[c.uuid] < adesso)

  // Una chiamata mai vista prima (o un richiamo che scade adesso) squilla una
  // volta. Quelle vecchie, trovate aprendo il programma, compaiono senza squillo.
  useEffect(() => {
    for (const c of riepilogo?.calls ?? []) {
      const chiave = `${c.uuid}|${c.callback_at ?? ''}`
      if (viste.current.has(chiave)) continue
      viste.current.add(chiave)
      const da = Date.now() - new Date(c.callback_at ?? c.created_at).getTime()
      if (da > SILENZIO_MS) continue
      if (utente.suonoChiamate) squilla()
      window.daprod.attenzione?.()
      if (utente.avvisiDesktop) {
        avvisoDiSistema(
          c.callback_at ? `È ora di richiamare ${c.company_name ?? ''}` : `Chiamata richiesta — ${c.company_name ?? ''}`,
          `${c.subject}${c.phone ? ` · ${c.phone}` : ''}`,
          () => onApri(c.company_uuid, c.uuid)
        )
      }
    }
  }, [riepilogo?.calls, utente.suonoChiamate, utente.avvisiDesktop, onApri])

  // Altre novità (messaggi, documenti): un avviso di sistema, senza squillo.
  useEffect(() => {
    const n = riepilogo?.unread ?? null
    if (n !== null && nonLette.current !== null && n > nonLette.current && utente.avvisiDesktop && !document.hasFocus()) {
      avvisoDiSistema('Novità dalle aziende', n === 1 ? 'Una richiesta ha una novità.' : `${n} richieste hanno novità.`, () => undefined)
    }
    nonLette.current = n
  }, [riepilogo?.unread, utente.avvisiDesktop])

  if (!chiamate.length) return null

  // Ridotto a una pastiglia: la chiamata resta in vista senza coprire il lavoro.
  if (ridotto) {
    const c = chiamate[0]!
    return (
      <button
        type="button"
        onClick={() => setRidotto(false)}
        className="compare fixed right-3 top-14 z-40 flex max-w-[calc(100vw-24px)] items-center gap-2 rounded-full border border-brand-500/60 bg-ink-900 py-1.5 pr-3 pl-2 text-xs text-ink-100 shadow-xl shadow-black/50 md:top-auto md:bottom-14"
        title="Mostra le chiamate richieste"
      >
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/25 text-brand-200">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/30" />
          <Icona nome="telefono" className="h-3.5 w-3.5" />
        </span>
        <span className="truncate">
          {chiamate.length === 1 ? c.company_name : `${chiamate.length} chiamate richieste`}
        </span>
        <Icona nome="su" className="h-3.5 w-3.5 text-ink-400 md:rotate-0" />
      </button>
    )
  }

  const azione = async (c: RequestItem, action: RequestAction, extra: Record<string, unknown> = {}): Promise<void> => {
    setErrore(null)
    try {
      await api.post(`/api/companies/${c.company_uuid}/requests/${c.uuid}/actions`, { action, ...extra })
      segnalaAzione()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Operazione non riuscita.')
    }
  }

  return (
    // Sul telefono in alto (sotto l'intestazione), sul computer in basso a destra.
    <div
      className="compare fixed inset-x-3 top-14 z-40 flex flex-col gap-2 md:inset-x-auto md:top-auto md:right-3 md:bottom-14 md:w-[420px]"
      aria-live="polite"
    >
      {errore && <p className="rounded-lg border border-negative/40 bg-ink-900 px-3 py-2 text-xs text-negative">{errore}</p>}
      {chiamate.slice(0, 3).map((c, i) => {
        const richiamo = Boolean(c.callback_at)
        return (
          <div
            key={c.uuid}
            className={`rounded-xl border border-brand-500/50 bg-ink-900 p-3 shadow-2xl shadow-black/50 ${i > 0 ? 'max-md:hidden' : ''}`}
          >
            <div className="flex items-start gap-2">
              <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-200">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/30" />
                <Icona nome="telefono" className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-300">
                  {richiamo ? 'È ora di richiamare' : 'Chiamata richiesta'}
                  {c.urgent ? ' · urgente' : ''}
                </p>
                <p className="truncate text-sm font-medium text-ink-100">{c.company_name}</p>
                <p className="truncate text-xs text-ink-300">«{c.subject}»</p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  {c.created_by_name} · <span className="font-mono">{c.phone}</span>
                  {richiamo && c.callback_at
                    ? ` · promesso ${quandoBreve(c.callback_at)}`
                    : ` · ${preferredTimeLabel(c.preferred_time)?.toLowerCase() ?? ''} · ${quandoBreve(c.created_at)}`}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                onClick={() => setRidotto(true)}
                title="Riduci: resta una pastiglia in un angolo"
                aria-label="Riduci"
              >
                <Icona nome="giu" className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                onClick={() => setSilenziate({ ...silenziate, [c.uuid]: Date.now() + SILENZIO_MS })}
                title="Più tardi: nascondi per un quarto d'ora"
                aria-label="Più tardi"
              >
                <Icona nome="chiudi" className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5 md:flex md:flex-wrap">
              <Button
                variant="primary"
                className="px-2.5 py-1 text-xs"
                onClick={() => {
                  if (c.phone) chiama(c.phone)
                  void azione(c, 'chiamo_ora')
                }}
              >
                <Icona nome="telefono" className="h-3.5 w-3.5" /> Chiamo ora
              </Button>
              <Button
                className="px-2.5 py-1 text-xs"
                onClick={() => void azione(c, 'richiamo', { callback_at: new Date(Date.now() + 15 * 60_000).toISOString() })}
              >
                <Icona nome="orologio" className="h-3.5 w-3.5" /> Tra 15 minuti
              </Button>
              <Button className="px-2.5 py-1 text-xs" onClick={() => onApri(c.company_uuid, c.uuid)}>
                <Icona nome="messaggio" className="h-3.5 w-3.5" /> Rispondo per scritto
              </Button>
              {!richiamo && (
                <Button className="px-2.5 py-1 text-xs" onClick={() => void azione(c, 'prendi_in_carico')}>
                  <Icona nome="spunta" className="h-3.5 w-3.5" /> La prendo io
                </Button>
              )}
            </div>
          </div>
        )
      })}
      {chiamate.length > 3 && (
        <p className="rounded-lg bg-ink-900 px-3 py-1.5 text-center text-xs text-ink-300 max-md:hidden">…e altre {chiamate.length - 3} chiamate in attesa</p>
      )}
    </div>
  )
}

/** Il campanello in alto: quante novità, e un clic porta alle richieste. */
export function Campanello({ onClick }: { onClick: () => void }): React.JSX.Element | null {
  const { riepilogo } = useInbox()
  if (!riepilogo) return null
  const n = riepilogo.unread
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative rounded-lg p-2 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
      title={n ? `${n} richieste con novità` : 'Richieste'}
      aria-label={n ? `Richieste: ${n} con novità` : 'Richieste'}
    >
      <Icona nome="campanello" className="h-4.5 w-4.5" />
      {n > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-4.5 rounded-full bg-negative px-1 text-center text-[10px] font-bold leading-4.5 text-white">
          {n > 99 ? '99+' : n}
        </span>
      )}
    </button>
  )
}
