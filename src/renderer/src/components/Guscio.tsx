import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useComandi, type Comando } from '../lib/comandi'
import type { AziendaRecente } from '../lib/recenti'
import { Icona, type NomeIcona } from './icone'

/**
 * I pezzi del guscio nuovo (versione 1.3.0): ricerca e comandi, azioni rapide,
 * cambio d'azienda, menu dell'utente, barra delle sezioni del telefono. Tutti
 * piccoli e senza stato proprio oltre all'aperto/chiuso: i dati li passa App.
 */

// --- mattoni -------------------------------------------------------------------------

/** Chiude quando si clicca fuori o si preme Esc. */
function useChiusura(aperto: boolean, chiudi: () => void): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) chiudi()
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') chiudi()
    }
    document.addEventListener('mousedown', fuori)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuori)
      document.removeEventListener('keydown', esc)
    }
  }, [aperto, chiudi])
  return ref
}

/** Menu a tendina sotto un pulsante. */
export function Tendina({
  etichetta,
  titolo,
  classeBottone,
  destra = true,
  larghezza = 'w-64',
  children
}: {
  etichetta: ReactNode
  titolo?: string
  classeBottone: string
  destra?: boolean
  larghezza?: string
  children: (chiudi: () => void) => ReactNode
}): React.JSX.Element {
  const [aperto, setAperto] = useState(false)
  const chiudi = (): void => setAperto(false)
  const ref = useChiusura(aperto, chiudi)
  return (
    <div ref={ref} className="relative">
      <button type="button" className={classeBottone} onClick={() => setAperto((a) => !a)} title={titolo} aria-expanded={aperto}>
        {etichetta}
      </button>
      {aperto && (
        <div
          className={`compare absolute z-50 mt-1.5 ${larghezza} overflow-hidden rounded-xl border border-ink-600 bg-ink-850 py-1 text-sm shadow-2xl shadow-black/50 ${
            destra ? 'right-0' : 'left-0'
          }`}
        >
          {children(chiudi)}
        </div>
      )}
    </div>
  )
}

export function VoceMenu({
  icona,
  children,
  dettaglio,
  onClick,
  pericolo = false,
  destra
}: {
  icona?: NomeIcona
  children: ReactNode
  dettaglio?: ReactNode
  onClick: () => void
  pericolo?: boolean
  destra?: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
        pericolo ? 'text-negative hover:bg-negative/10' : 'text-ink-200 hover:bg-brand-500/15 hover:text-ink-100'
      }`}
    >
      {icona && <Icona nome={icona} className="h-4 w-4 text-ink-400" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {dettaglio && <span className="block truncate text-xs text-ink-400">{dettaglio}</span>}
      </span>
      {destra}
    </button>
  )
}

export function Separatore(): React.JSX.Element {
  return <div className="my-1 border-t border-ink-700" />
}

/** Foglio che sale dal basso (telefono). */
export function FoglioBasso({
  titolo,
  onChiudi,
  children
}: {
  titolo: string
  onChiudi: () => void
  children: ReactNode
}): React.JSX.Element {
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onChiudi()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onChiudi])
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60" onMouseDown={(e) => e.target === e.currentTarget && onChiudi()}>
      <div className="sale fondo-sicuro max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t border-ink-600 bg-ink-850 shadow-2xl">
        <div className="sticky top-0 flex items-center gap-2 border-b border-ink-700 bg-ink-850 px-4 py-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-ink-600 absolute left-1/2 top-1.5 -translate-x-1/2" aria-hidden="true" />
          <h2 className="flex-1 text-sm font-semibold text-ink-100">{titolo}</h2>
          <button type="button" onClick={onChiudi} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-800" aria-label="Chiudi">
            <Icona nome="chiudi" className="h-5 w-5" />
          </button>
        </div>
        <div className="py-2">{children}</div>
      </div>
    </div>
  )
}

// --- ricerca ---------------------------------------------------------------------------

export function CercaComandi(): React.JSX.Element {
  const { apriTavolozza } = useComandi()
  return (
    <>
      <button
        type="button"
        onClick={() => apriTavolozza()}
        className="hidden h-8 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 text-left text-xs text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-200 md:flex"
        title="Cerca aziende, sezioni e comandi (Ctrl+K)"
      >
        <Icona nome="cerca" className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate">Cerca o fai qualcosa…</span>
        <kbd className="rounded border border-ink-600 px-1.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => apriTavolozza()}
        className="rounded-lg p-2 text-ink-300 hover:bg-ink-800 md:hidden"
        aria-label="Cerca"
      >
        <Icona nome="cerca" className="h-5 w-5" />
      </button>
    </>
  )
}

// --- azioni rapide -----------------------------------------------------------------------

function azioniRapide(comandi: Comando[]): Comando[] {
  return comandi
    .filter((c) => c.rapido)
    .sort((a, b) => Number(b.inPrimoPiano ?? false) - Number(a.inPrimoPiano ?? false))
}

/** Pulsante "Nuovo" dell'intestazione (computer): le azioni più usate. */
export function AzioniRapide(): React.JSX.Element | null {
  const { comandi } = useComandi()
  const azioni = azioniRapide(comandi)
  if (azioni.length === 0) return null
  return (
    <div className="hidden md:block">
      <Tendina
        etichetta={
          <>
            <Icona nome="piu" className="h-4 w-4" />
            <span>Nuovo</span>
            <Icona nome="giu" className="h-3.5 w-3.5 opacity-70" />
          </>
        }
        titolo="Azioni rapide"
        classeBottone="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white shadow-sm shadow-brand-500/30 hover:bg-brand-400"
        larghezza="w-72"
      >
        {(chiudi) =>
          azioni.map((c, i) => (
            <div key={c.id}>
              {i > 0 && c.inPrimoPiano !== azioni[i - 1]?.inPrimoPiano && <Separatore />}
              <VoceMenu
                icona={c.icona}
                dettaglio={c.dettaglio}
                onClick={() => {
                  chiudi()
                  c.esegui()
                }}
              >
                {c.titolo}
              </VoceMenu>
            </div>
          ))
        }
      </Tendina>
    </div>
  )
}

/** Sul telefono: il tondo in basso a destra con le stesse azioni. */
export function PulsanteRapidoTelefono(): React.JSX.Element | null {
  const { comandi } = useComandi()
  const [aperto, setAperto] = useState(false)
  const azioni = azioniRapide(comandi)
  if (azioni.length === 0) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex h-13 w-13 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-black/50 active:scale-95 md:hidden"
        aria-label="Azioni rapide"
      >
        <Icona nome="piu" className="h-6 w-6" />
      </button>
      {aperto && (
        <FoglioBasso titolo="Azioni rapide" onChiudi={() => setAperto(false)}>
          {azioni.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setAperto(false)
                c.esegui()
              }}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-ink-100 active:bg-ink-800"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
                <Icona nome={c.icona ?? 'fulmine'} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{c.titolo}</span>
                {c.dettaglio && <span className="block truncate text-xs text-ink-400">{c.dettaglio}</span>}
              </span>
            </button>
          ))}
        </FoglioBasso>
      )}
    </>
  )
}

// --- cambio d'azienda ----------------------------------------------------------------------

export function SceltaAzienda({
  corrente,
  titolo,
  recenti,
  novita,
  consulente,
  onApri,
  onTutte
}: {
  corrente: { uuid: string; name: string; code: string } | null
  /** Cosa si vede quando non c'è un'azienda aperta (es. "Clienti e Aziende"). */
  titolo: string
  recenti: AziendaRecente[]
  novita: Record<string, number>
  consulente: boolean
  onApri: (uuid: string) => void
  onTutte: () => void
}): React.JSX.Element {
  const { apriTavolozza } = useComandi()
  const nome = corrente?.name ?? titolo
  // L'azienda vede solo la sua: niente menu.
  if (!consulente) {
    return <span className="min-w-0 truncate text-sm font-semibold text-ink-100">{nome}</span>
  }
  const altre = recenti.filter((a) => a.uuid !== corrente?.uuid)
  return (
    <Tendina
      destra={false}
      larghezza="w-80"
      titolo="Cambia azienda"
      classeBottone="flex min-w-0 max-w-[55vw] items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-ink-800 md:max-w-xs"
      etichetta={
        <>
          {corrente && (
            <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-500/15 text-[10px] font-bold text-brand-300 sm:flex">
              {iniziali(corrente.name)}
            </span>
          )}
          <span className="min-w-0 truncate text-sm font-semibold text-ink-100">{nome}</span>
          <Icona nome="giu" className="h-3.5 w-3.5 text-ink-400" />
        </>
      }
    >
      {(chiudi) => (
        <>
          {corrente && (
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              Aperta: <span className="normal-case tracking-normal text-ink-300">{corrente.code}</span>
            </p>
          )}
          {altre.length > 0 && (
            <>
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Recenti</p>
              {altre.map((a) => (
                <VoceMenu
                  key={a.uuid}
                  icona="azienda"
                  dettaglio={a.code}
                  onClick={() => {
                    chiudi()
                    onApri(a.uuid)
                  }}
                  destra={
                    (novita[a.uuid] ?? 0) > 0 ? (
                      <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
                        {novita[a.uuid]}
                      </span>
                    ) : undefined
                  }
                >
                  {a.name}
                </VoceMenu>
              ))}
              <Separatore />
            </>
          )}
          <VoceMenu
            icona="cerca"
            onClick={() => {
              chiudi()
              apriTavolozza('')
            }}
            destra={<kbd className="font-mono text-[10px] text-ink-500">Ctrl K</kbd>}
          >
            Cerca un'altra azienda…
          </VoceMenu>
          <VoceMenu
            icona="utenti"
            onClick={() => {
              chiudi()
              onTutte()
            }}
          >
            Tutti i clienti e le aziende
          </VoceMenu>
        </>
      )}
    </Tendina>
  )
}

export function iniziali(nome: string): string {
  const parole = nome
    .replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?)\b/gi, '')
    .split(/\s+/)
    .filter((p) => /\p{L}/u.test(p))
  return ((parole[0]?.[0] ?? '') + (parole[1]?.[0] ?? '')).toUpperCase() || '·'
}

// --- utente ----------------------------------------------------------------------------------

export function MenuUtente({
  nome,
  ruolo,
  chiaro,
  onTema,
  voci,
  onEsci
}: {
  nome: string
  ruolo: string
  chiaro: boolean
  onTema: () => void
  voci: { icona: NomeIcona; titolo: string; onClick: () => void }[]
  onEsci: () => void
}): React.JSX.Element {
  return (
    <Tendina
      titolo="Il tuo profilo"
      larghezza="w-60"
      classeBottone="flex items-center gap-2 rounded-lg py-1 pr-1.5 pl-1 hover:bg-ink-800"
      etichetta={
        <>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-500 text-[11px] font-bold text-white">
            {iniziali(nome)}
          </span>
          <span className="hidden text-left lg:block">
            <span className="block max-w-36 truncate text-xs text-ink-100">{nome}</span>
            <span className="block text-[10px] text-ink-400">{ruolo}</span>
          </span>
          <Icona nome="giu" className="hidden h-3.5 w-3.5 text-ink-400 lg:block" />
        </>
      }
    >
      {(chiudi) => (
        <>
          <div className="px-3 py-2 lg:hidden">
            <p className="truncate text-sm text-ink-100">{nome}</p>
            <p className="text-xs text-ink-400">{ruolo}</p>
          </div>
          <div className="lg:hidden">
            <Separatore />
          </div>
          {voci.map((v) => (
            <VoceMenu
              key={v.titolo}
              icona={v.icona}
              onClick={() => {
                chiudi()
                v.onClick()
              }}
            >
              {v.titolo}
            </VoceMenu>
          ))}
          <VoceMenu icona={chiaro ? 'luna' : 'sole'} onClick={onTema}>
            {chiaro ? 'Tema scuro' : 'Tema chiaro'}
          </VoceMenu>
          <Separatore />
          <VoceMenu
            icona="esci"
            pericolo
            onClick={() => {
              chiudi()
              onEsci()
            }}
          >
            Esci
          </VoceMenu>
        </>
      )}
    </Tendina>
  )
}

// --- barra delle sezioni del telefono ------------------------------------------------------------

export interface SchedaBasso {
  id: string
  titolo: string
  icona: NomeIcona
  attiva: boolean
  badge?: number
  onClick: () => void
}

export function BarraBasso({ schede }: { schede: SchedaBasso[] }): React.JSX.Element {
  return (
    <nav className="fondo-sicuro flex shrink-0 border-t border-ink-700 bg-ink-900/95 backdrop-blur md:hidden" aria-label="Sezioni">
      {schede.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={s.onClick}
          aria-current={s.attiva ? 'page' : undefined}
          className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] ${
            s.attiva ? 'text-brand-300' : 'text-ink-400 active:text-ink-200'
          }`}
        >
          {s.attiva && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-400" />}
          <span className="relative">
            <Icona nome={s.icona} className="h-5.5 w-5.5" />
            {(s.badge ?? 0) > 0 && (
              <span className="absolute -top-1 -right-2 min-w-4 rounded-full bg-negative px-1 text-center text-[9px] font-bold leading-4 text-white">
                {(s.badge ?? 0) > 99 ? '99+' : s.badge}
              </span>
            )}
          </span>
          <span className="max-w-full truncate px-0.5">{s.titolo}</span>
        </button>
      ))}
    </nav>
  )
}
