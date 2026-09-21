import { useEffect, useMemo, useRef, useState } from 'react'
import { punteggio, useComandi, type Comando, type GruppoComando } from '../lib/comandi'
import { Icona } from './icone'

/**
 * La barra dei comandi (Ctrl+K): si scrive, si sceglie con le frecce, Invio.
 * Senza testo mostra le azioni rapide, le aziende recenti e le sezioni
 * dell'azienda aperta; con del testo cerca in tutto.
 */

const ORDINE: GruppoComando[] = ['Azioni', 'Vai a', 'Aziende', 'Programma']
const MASSIMO_PER_GRUPPO = 8

export function TavolozzaComandi(): React.JSX.Element | null {
  const { comandi, tavolozza, chiudiTavolozza } = useComandi()
  const [testo, setTesto] = useState('')
  const [scelto, setScelto] = useState(0)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tavolozza.aperta) {
      setTesto(tavolozza.testo)
      setScelto(0)
      // Il campo prende il cursore dopo la comparsa.
      setTimeout(() => campo.current?.focus(), 0)
    }
  }, [tavolozza])

  const gruppi = useMemo(() => {
    const trovati = comandi
      .map((c) => ({ c, s: punteggio(c, testo) }))
      .filter((x) => x.s > 0)
      // Senza testo: solo le cose utili subito, non l'elenco completo.
      .filter((x) => testo.trim() || x.c.rapido || x.c.gruppo === 'Aziende' || x.c.gruppo === 'Vai a')
    const perGruppo = ORDINE.map((g, ordine) => {
      const voci = trovati
        .filter((x) => x.c.gruppo === g)
        .sort((a, b) => b.s - a.s || Number(b.c.inPrimoPiano ?? false) - Number(a.c.inPrimoPiano ?? false))
        .slice(0, MASSIMO_PER_GRUPPO)
      return { gruppo: g, ordine, migliore: voci[0]?.s ?? 0, voci: voci.map((x) => x.c) }
    }).filter((g) => g.voci.length > 0)
    // Scrivendo, prima il gruppo che ha la voce più somigliante ("personale" → la sezione, non l'azione).
    if (testo.trim()) perGruppo.sort((a, b) => b.migliore - a.migliore || a.ordine - b.ordine)
    return perGruppo
  }, [comandi, testo])

  const piatti = useMemo(() => gruppi.flatMap((g) => g.voci), [gruppi])

  useEffect(() => {
    setScelto((s) => Math.min(s, Math.max(0, piatti.length - 1)))
  }, [piatti.length])

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${scelto}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [scelto])

  if (!tavolozza.aperta) return null

  const esegui = (c: Comando | undefined): void => {
    if (!c) return
    chiudiTavolozza()
    c.esegui()
  }

  const tasto = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setScelto((s) => (piatti.length ? (s + 1) % piatti.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setScelto((s) => (piatti.length ? (s - 1 + piatti.length) % piatti.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      esegui(piatti[scelto])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      chiudiTavolozza()
    }
  }

  let indice = -1
  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-3 pt-3 backdrop-blur-[2px] md:pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) chiudiTavolozza()
      }}
    >
      <div
        role="dialog"
        aria-label="Cerca o esegui un comando"
        className="compare flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-ink-600 bg-ink-850 shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-3 border-b border-ink-700 px-4">
          <Icona nome="cerca" className="h-5 w-5 text-ink-400" />
          <input
            ref={campo}
            autoFocus
            value={testo}
            onChange={(e) => {
              setTesto(e.target.value)
              setScelto(0)
            }}
            onKeyDown={tasto}
            placeholder="Cerca un'azienda, una sezione o un comando…"
            className="min-w-0 flex-1 bg-transparent py-4 text-base text-ink-100 outline-none placeholder:text-ink-500"
            aria-controls="risultati-comandi"
            aria-activedescendant={piatti[scelto] ? `comando-${piatti[scelto].id}` : undefined}
          />
          <kbd className="hidden rounded border border-ink-600 px-1.5 py-0.5 font-mono text-[10px] text-ink-400 md:block">Esc</kbd>
          <button
            type="button"
            onClick={chiudiTavolozza}
            className="rounded-md p-1.5 text-ink-400 hover:bg-ink-800 md:hidden"
            aria-label="Chiudi"
          >
            <Icona nome="chiudi" className="h-5 w-5" />
          </button>
        </div>

        <div ref={lista} id="risultati-comandi" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {piatti.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-ink-400">Niente che si chiami così.</p>
          )}
          {gruppi.map((g) => (
            <div key={g.gruppo} className="mb-1">
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                {g.gruppo}
              </p>
              {g.voci.map((c) => {
                indice++
                const i = indice
                const attivo = i === scelto
                return (
                  <button
                    key={c.id}
                    id={`comando-${c.id}`}
                    type="button"
                    role="option"
                    aria-selected={attivo}
                    data-indice={i}
                    onMouseMove={() => setScelto(i)}
                    onClick={() => esegui(c)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                      attivo ? 'bg-brand-500/15 text-ink-100' : 'text-ink-200'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                        attivo ? 'border-brand-400/50 bg-brand-500/20 text-brand-200' : 'border-ink-700 bg-ink-900 text-ink-400'
                      }`}
                    >
                      <Icona nome={c.icona ?? 'destra'} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.titolo}</span>
                      {c.dettaglio && <span className="block truncate text-xs text-ink-400">{c.dettaglio}</span>}
                    </span>
                    {c.scorciatoia && (
                      <kbd className="hidden shrink-0 rounded border border-ink-600 px-1.5 py-0.5 font-mono text-[10px] text-ink-400 md:block">
                        {c.scorciatoia}
                      </kbd>
                    )}
                    {attivo && <Icona nome="destra" className="h-4 w-4 text-brand-300" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <p className="hidden border-t border-ink-700 px-4 py-2 text-[11px] text-ink-500 md:block">
          <kbd className="font-mono">↑ ↓</kbd> per scegliere · <kbd className="font-mono">Invio</kbd> per eseguire ·{' '}
          <kbd className="font-mono">Ctrl K</kbd> da qualsiasi schermata
        </p>
      </div>
    </div>
  )
}
