import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Modulo, VistaCondivisibile } from '@shared/settings'
import type { Company } from '@shared/types'
import { Icona } from './icone'
import { Logo } from './Logo'

/**
 * Menu laterale — il pattern di navigazione dei mockup analizzati (AGENTS.md §0).
 *
 * In alto quello che vale per tutto lo studio, sotto le viste dell'azienda
 * aperta, raggruppate per mestiere (dalla 1.3.0 le voci sono tante, e una
 * lista lunga senza titoli non si legge più). I moduli spenti nelle
 * Impostazioni non compaiono; all'operatore Azienda compaiono solo le viste
 * che il consulente gli ha acceso.
 *
 * Sul computer il menu si richiude a icone (Ctrl+B) e si allarga o si
 * stringe trascinando il bordo destro; sul telefono è a scomparsa, e in fondo
 * raccoglie gli strumenti che sul computer stanno nella barra di stato.
 */

export type Vista =
  | 'anagrafica'
  | 'impostazioni'
  | 'profilo'
  | 'richieste-studio'
  | 'riepilogo'
  | 'documenti'
  | 'richieste'
  | 'panoramica'
  | 'conto-economico'
  | 'stato-patrimoniale'
  | 'capitale-circolante'
  | 'tesoreria'
  | 'banche'
  | 'simulazioni'
  | 'personale'
  | 'dati'
  | 'attivita'
  | 'impostazioni-azienda'

export interface Voce {
  id: Vista
  label: string
  /** Nome corto per le schede del telefono. */
  breve?: string
  icona: React.JSX.Element
  /** Il modulo da cui dipende: spento nelle Impostazioni, la voce sparisce. */
  modulo?: Modulo
}

const icona = (d: string): React.JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const ANAGRAFICA: Voce = {
  id: 'anagrafica',
  label: 'Clienti e Aziende',
  breve: 'Clienti',
  icona: <Icona nome="utenti" className="h-full w-full" />
}

export const IMPOSTAZIONI: Voce = {
  id: 'impostazioni',
  label: 'Impostazioni',
  icona: <Icona nome="impostazioni" className="h-full w-full" />
}

export const RICHIESTE_STUDIO: Voce = {
  id: 'richieste-studio',
  label: 'Richieste',
  icona: <Icona nome="campanello" className="h-full w-full" />,
  modulo: 'richieste'
}

export const PROFILO: Voce = {
  id: 'profilo',
  label: 'Profilo',
  icona: <Icona nome="utente" className="h-full w-full" />
}

export const V: Record<Exclude<Vista, 'anagrafica' | 'impostazioni' | 'profilo' | 'richieste-studio'>, Voce> = {
  riepilogo: {
    id: 'riepilogo',
    label: 'Riepilogo',
    icona: <Icona nome="casa" className="h-full w-full" />
  },
  documenti: {
    id: 'documenti',
    label: 'Documenti',
    icona: <Icona nome="cartella" className="h-full w-full" />,
    modulo: 'documenti'
  },
  richieste: {
    id: 'richieste',
    label: 'Richieste e chiamate',
    breve: 'Richieste',
    icona: <Icona nome="messaggio" className="h-full w-full" />,
    modulo: 'richieste'
  },
  panoramica: {
    id: 'panoramica',
    label: 'Panoramica',
    icona: icona('M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z')
  },
  'conto-economico': {
    id: 'conto-economico',
    label: 'Conto Economico',
    breve: 'Conto ec.',
    icona: <Icona nome="grafico" className="h-full w-full" />
  },
  'stato-patrimoniale': {
    id: 'stato-patrimoniale',
    label: 'Stato Patrimoniale',
    breve: 'Stato patr.',
    icona: icona('M3 9.5 12 4l9 5.5M5 10v9M19 10v9M9 10v9M15 10v9M3 20h18')
  },
  'capitale-circolante': {
    id: 'capitale-circolante',
    label: 'Capitale Circolante',
    breve: 'Circolante',
    icona: icona('M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M18 3v3.5h-3.5M6 21v-3.5h3.5')
  },
  tesoreria: {
    id: 'tesoreria',
    label: 'Tesoreria / Cash Flow',
    breve: 'Tesoreria',
    icona: <Icona nome="cassa" className="h-full w-full" />
  },
  banche: {
    id: 'banche',
    label: 'Banche e Finanziamenti',
    breve: 'Banche',
    icona: <Icona nome="banca" className="h-full w-full" />
  },
  simulazioni: {
    id: 'simulazioni',
    label: 'Analisi & Simulazioni',
    breve: 'Simulazioni',
    icona: <Icona nome="andamento" className="h-full w-full" />,
    modulo: 'simulazioni'
  },
  personale: {
    id: 'personale',
    label: 'Personale',
    icona: <Icona nome="utenti" className="h-full w-full" />,
    modulo: 'personale'
  },
  attivita: {
    id: 'attivita',
    label: 'Attività e Tempi',
    breve: 'Attività',
    icona: <Icona nome="orologio" className="h-full w-full" />,
    modulo: 'attivita'
  },
  dati: {
    id: 'dati',
    label: 'Dati contabili',
    breve: 'Dati',
    icona: icona('M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2')
  },
  'impostazioni-azienda': {
    id: 'impostazioni-azienda',
    label: "Impostazioni dell'azienda",
    breve: 'Impostazioni',
    icona: <Icona nome="azienda" className="h-full w-full" />
  }
}

/** I gruppi del menu del consulente, nell'ordine in cui si lavora. */
export const GRUPPI_CONSULENTE: { titolo: string; voci: Vista[] }[] = [
  { titolo: 'Analisi', voci: ['panoramica', 'conto-economico', 'stato-patrimoniale', 'capitale-circolante'] },
  { titolo: 'Cassa e banche', voci: ['tesoreria', 'banche'] },
  { titolo: 'Pianificazione', voci: ['simulazioni'] },
  { titolo: 'Costi e margini', voci: ['personale'] },
  { titolo: "Lavoro con l'azienda", voci: ['documenti', 'richieste', 'attivita'] },
  { titolo: 'Dati e impostazioni', voci: ['dati', 'impostazioni-azienda'] }
]

/** Le viste condivisibili, nell'ordine del menu dell'azienda. */
export const VISTE_AZIENDA_ORDINE: Extract<VistaCondivisibile, Vista>[] = [
  'panoramica',
  'conto-economico',
  'stato-patrimoniale',
  'capitale-circolante',
  'tesoreria',
  'banche',
  'simulazioni',
  'personale'
]

export function voceDi(v: Vista): Voce {
  if (v === 'anagrafica') return ANAGRAFICA
  if (v === 'impostazioni') return IMPOSTAZIONI
  if (v === 'profilo') return PROFILO
  if (v === 'richieste-studio') return RICHIESTE_STUDIO
  return V[v]
}

/** Il nome di una vista, per titoli e comandi. */
export const nomeVista = (v: Vista): string => voceDi(v).label

const CHIAVE_COMPATTO = 'daprodfinanza.menu-compatto'
const CHIAVE_LARGHEZZA = 'daprodfinanza.menu-larghezza'
const LARGHEZZA_MIN = 200
const LARGHEZZA_MAX = 340
const LARGHEZZA_BASE = 240

function leggi(chiave: string): string | null {
  try {
    return localStorage.getItem(chiave)
  } catch {
    return null
  }
}

function scrivi(chiave: string, valore: string): void {
  try {
    localStorage.setItem(chiave, valore)
  } catch {
    // resta per questa sessione
  }
}

/** Menu richiuso a icone (sul computer): si ricorda fra un avvio e l'altro. */
export function useMenuCompatto(): [boolean, (v: boolean) => void] {
  const [compatto, setCompatto] = useState(() => leggi(CHIAVE_COMPATTO) === '1')
  const cambia = (v: boolean): void => {
    setCompatto(v)
    scrivi(CHIAVE_COMPATTO, v ? '1' : '0')
  }
  return [compatto, cambia]
}

function Bottone({
  voce,
  attiva,
  onClick,
  badge = 0,
  compatto = false
}: {
  voce: Voce
  attiva: boolean
  onClick: () => void
  /** Novità non lette: un pallino col numero. */
  badge?: number
  /** Menu richiuso: solo l'icona, il nome nel suggerimento. */
  compatto?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={compatto ? voce.label : undefined}
      aria-current={attiva ? 'page' : undefined}
      className={`relative flex w-full items-center gap-3 rounded-lg py-2 text-sm transition-colors ${
        compatto ? 'px-3 md:justify-center md:px-0' : 'px-3'
      } ${
        attiva
          ? 'bg-brand-500/15 font-medium text-brand-300 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand-400'
          : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
      }`}
    >
      <span className="h-4.5 w-4.5 shrink-0">{voce.icona}</span>
      <span className={`truncate ${compatto ? 'md:hidden' : ''}`}>{voce.label}</span>
      {badge > 0 && (
        <span
          className={`ml-auto shrink-0 rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold leading-4 text-white ${
            compatto ? 'md:absolute md:top-0.5 md:right-1 md:ml-0' : ''
          }`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function Titolo({ children, compatto }: { children: React.ReactNode; compatto: boolean }): React.JSX.Element {
  return (
    <>
      <p
        className={`mt-3 px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 ${
          compatto ? 'md:hidden' : ''
        }`}
      >
        {children}
      </p>
      {compatto && <div className="mx-2 my-2 hidden border-t border-ink-800 md:block" />}
    </>
  )
}

export function Sidebar({
  company,
  vista,
  onVista,
  onAnagrafica,
  consulente,
  moduloAttivo,
  visteAzienda,
  permessiAzienda,
  novita,
  version,
  aperta = false,
  onChiudi,
  compatto = false,
  onCompatto,
  strumenti
}: {
  company: Company | null
  vista: Vista
  onVista: (vista: Vista) => void
  onAnagrafica: () => void
  /** Il consulente vede tutto (è l'amministratore); l'azienda solo il suo. */
  consulente: boolean
  moduloAttivo: (m: Modulo) => boolean
  /** Per l'operatore Azienda: le viste che il consulente gli ha acceso. */
  visteAzienda: VistaCondivisibile[]
  /** Per l'operatore Azienda: se vede il cassetto e le richieste. */
  permessiAzienda: { documenti: boolean; richieste: boolean } | null
  /** Novità non lette: in tutto (per lo studio) e per azienda. */
  novita: { totale: number; perAzienda: Record<string, number> }
  version: string
  /** Sul telefono il menu è a scomparsa: aperto o chiuso dal tasto ☰. */
  aperta?: boolean
  onChiudi?: () => void
  /** Sul computer: menu richiuso a icone. */
  compatto?: boolean
  onCompatto?: (v: boolean) => void
  /** In fondo al menu sul telefono: backup, aggiornamenti, uscita. */
  strumenti?: ReactNode
}): React.JSX.Element {
  const visibile = (id: Vista): boolean => {
    const voce = id in V ? V[id as keyof typeof V] : null
    return !voce?.modulo || moduloAttivo(voce.modulo)
  }

  // Larghezza scelta trascinando il bordo destro (menu aperto, sul computer).
  const [larghezza, setLarghezza] = useState(() => {
    const n = Number(leggi(CHIAVE_LARGHEZZA))
    return Number.isFinite(n) && n >= LARGHEZZA_MIN && n <= LARGHEZZA_MAX ? n : LARGHEZZA_BASE
  })
  const presa = useRef<{ x: number; w: number } | null>(null)
  const [trascinando, setTrascinando] = useState(false)
  useEffect(() => {
    if (!trascinando) return
    const muovi = (e: PointerEvent): void => {
      const p = presa.current
      if (p) setLarghezza(Math.min(LARGHEZZA_MAX, Math.max(LARGHEZZA_MIN, p.w + e.clientX - p.x)))
    }
    const fine = (): void => {
      presa.current = null
      setTrascinando(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', muovi)
    window.addEventListener('pointerup', fine)
    return () => {
      window.removeEventListener('pointermove', muovi)
      window.removeEventListener('pointerup', fine)
    }
  }, [trascinando])
  useEffect(() => {
    if (!trascinando) scrivi(CHIAVE_LARGHEZZA, String(Math.round(larghezza)))
  }, [trascinando, larghezza])

  const c = compatto

  return (
    <>
      {aperta && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={onChiudi} aria-hidden="true" />
      )}
      <aside
        style={{ '--larghezza-menu': `${c ? 68 : larghezza}px` } as React.CSSProperties}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] shrink-0 flex-col border-r border-ink-700 bg-ink-900 transition-[transform,width] duration-200 md:relative md:z-auto md:w-[var(--larghezza-menu)] md:translate-x-0 ${
          aperta ? 'translate-x-0 shadow-2xl shadow-black/60' : '-translate-x-full'
        } ${trascinando ? 'md:transition-none' : ''}`}
      >
        <div className={`flex items-center gap-2.5 py-4 ${c ? 'px-4 md:justify-center md:px-0' : 'px-4'}`}>
          <Logo size={30} />
          <span className={`text-sm font-semibold tracking-tight text-ink-100 ${c ? 'md:hidden' : ''}`}>
            DaProd<span className="text-brand-300">Finanza</span>
          </span>
          <button
            type="button"
            onClick={onChiudi}
            className="ml-auto rounded-md p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100 md:hidden"
            aria-label="Chiudi il menu"
          >
            <Icona nome="chiudi" className="h-5 w-5" />
          </button>
        </div>

        <nav className={`flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden pb-4 ${c ? 'px-3 md:px-2' : 'px-3'}`}>
          {consulente && (
            <Bottone voce={ANAGRAFICA} attiva={vista === 'anagrafica'} onClick={onAnagrafica} compatto={c} />
          )}
          {consulente && moduloAttivo('richieste') && (
            <Bottone
              voce={RICHIESTE_STUDIO}
              attiva={vista === 'richieste-studio'}
              onClick={() => onVista('richieste-studio')}
              badge={novita.totale}
              compatto={c}
            />
          )}

          {company && (
            <>
              <div className={`mt-4 px-3 pb-1 ${c ? 'md:hidden' : ''}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  {consulente ? 'Azienda' : 'La tua azienda'}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-300" title={company.name}>
                  {company.name}
                </p>
              </div>

              {consulente ? (
                GRUPPI_CONSULENTE.map((g) => {
                  const voci = g.voci.filter(visibile)
                  if (voci.length === 0) return null
                  return (
                    <div key={g.titolo}>
                      <Titolo compatto={c}>{g.titolo}</Titolo>
                      {voci.map((id) => (
                        <Bottone
                          key={id}
                          voce={voceDi(id)}
                          attiva={vista === id}
                          onClick={() => onVista(id)}
                          badge={id === 'richieste' ? (novita.perAzienda[company.uuid] ?? 0) : 0}
                          compatto={c}
                        />
                      ))}
                    </div>
                  )
                })
              ) : (
                <>
                  <Bottone voce={V.riepilogo} attiva={vista === 'riepilogo'} onClick={() => onVista('riepilogo')} compatto={c} />
                  {permessiAzienda?.documenti && (
                    <Bottone voce={V.documenti} attiva={vista === 'documenti'} onClick={() => onVista('documenti')} compatto={c} />
                  )}
                  {permessiAzienda?.richieste && (
                    <Bottone
                      voce={V.richieste}
                      attiva={vista === 'richieste'}
                      onClick={() => onVista('richieste')}
                      badge={novita.totale}
                      compatto={c}
                    />
                  )}
                  {visteAzienda.length > 0 && <Titolo compatto={c}>I tuoi numeri</Titolo>}
                  {VISTE_AZIENDA_ORDINE.filter((v) => visteAzienda.includes(v)).map((id) => (
                    <Bottone key={id} voce={voceDi(id)} attiva={vista === id} onClick={() => onVista(id)} compatto={c} />
                  ))}
                </>
              )}
            </>
          )}
        </nav>

        <div className={`border-t border-ink-800 py-2 ${c ? 'px-3 md:px-2' : 'px-3'}`}>
          {consulente ? (
            <Bottone voce={IMPOSTAZIONI} attiva={vista === 'impostazioni'} onClick={() => onVista('impostazioni')} compatto={c} />
          ) : (
            <Bottone voce={PROFILO} attiva={vista === 'profilo'} onClick={() => onVista('profilo')} compatto={c} />
          )}
          {strumenti && <div className="mt-2 md:hidden">{strumenti}</div>}
          <div className={`flex items-center pt-1 ${c ? 'md:justify-center' : ''}`}>
            <p className={`px-3 font-mono text-[11px] text-ink-600 ${c ? 'md:hidden' : ''}`}>v{version || '—'}</p>
            {onCompatto && (
              <button
                type="button"
                onClick={() => onCompatto(!c)}
                className={`hidden rounded-md p-1.5 text-ink-500 hover:bg-ink-800 hover:text-ink-100 md:block ${c ? '' : 'ml-auto'}`}
                title={c ? 'Apri il menu (Ctrl+B)' : 'Richiudi il menu a icone (Ctrl+B)'}
                aria-label={c ? 'Apri il menu' : 'Richiudi il menu'}
              >
                <Icona nome={c ? 'doppia-destra' : 'doppia-sinistra'} className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Bordo da trascinare per allargare o stringere il menu (doppio clic: misura di partenza). */}
        {!c && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Allarga o stringi il menu"
            title="Trascina per allargare o stringere il menu"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              presa.current = { x: e.clientX, w: larghezza }
              setTrascinando(true)
              document.body.style.cursor = 'col-resize'
              document.body.style.userSelect = 'none'
            }}
            onDoubleClick={() => setLarghezza(LARGHEZZA_BASE)}
            className={`absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize transition-colors md:block ${
              trascinando ? 'bg-brand-400/40' : 'hover:bg-brand-400/25'
            }`}
          />
        )}
      </aside>
    </>
  )
}
