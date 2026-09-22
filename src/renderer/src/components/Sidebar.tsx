import type { Modulo, VistaCondivisibile } from '@shared/settings'
import type { Company } from '@shared/types'
import { Logo } from './Logo'

/**
 * Menu laterale — il pattern di navigazione dei mockup analizzati (AGENTS.md §0).
 *
 * In alto quello che vale per tutto lo studio, sotto le viste dell'azienda
 * aperta, raggruppate per mestiere (dalla 1.3.0 le voci sono tante, e una
 * lista lunga senza titoli non si legge più). I moduli spenti nelle
 * Impostazioni non compaiono; all'operatore Azienda compaiono solo le viste
 * che il consulente gli ha acceso.
 */

export type Vista =
  | 'anagrafica'
  | 'impostazioni'
  | 'profilo'
  | 'panoramica'
  | 'conto-economico'
  | 'stato-patrimoniale'
  | 'capitale-circolante'
  | 'tesoreria'
  | 'banche'
  | 'simulazioni'
  | 'dati'
  | 'attivita'
  | 'impostazioni-azienda'

interface Voce {
  id: Vista
  label: string
  icona: React.JSX.Element
  /** Il modulo da cui dipende: spento nelle Impostazioni, la voce sparisce. */
  modulo?: Modulo
}

const icona = (d: string): React.JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ANAGRAFICA: Voce = {
  id: 'anagrafica',
  label: 'Clienti e Aziende',
  icona: icona('M4 20v-1a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 20v-1a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6')
}

const IMPOSTAZIONI: Voce = {
  id: 'impostazioni',
  label: 'Impostazioni',
  icona: icona('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1')
}

const PROFILO: Voce = {
  id: 'profilo',
  label: 'Profilo',
  icona: icona('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8')
}

const V: Record<Exclude<Vista, 'anagrafica' | 'impostazioni' | 'profilo'>, Voce> = {
  panoramica: {
    id: 'panoramica',
    label: 'Panoramica',
    icona: icona('M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z')
  },
  'conto-economico': {
    id: 'conto-economico',
    label: 'Conto Economico',
    icona: icona('M4 19h16M7 16V9M12 16V5M17 16v-4')
  },
  'stato-patrimoniale': {
    id: 'stato-patrimoniale',
    label: 'Stato Patrimoniale',
    icona: icona('M3 9.5 12 4l9 5.5M5 10v9M19 10v9M9 10v9M15 10v9M3 20h18')
  },
  'capitale-circolante': {
    id: 'capitale-circolante',
    label: 'Capitale Circolante',
    icona: icona('M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M18 3v3.5h-3.5M6 21v-3.5h3.5')
  },
  tesoreria: {
    id: 'tesoreria',
    label: 'Tesoreria / Cash Flow',
    icona: icona('M3 7h18v12H3zM3 11h18M7 15h3M16 4H6')
  },
  banche: {
    id: 'banche',
    label: 'Banche e Finanziamenti',
    icona: icona('M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z')
  },
  simulazioni: {
    id: 'simulazioni',
    label: 'Analisi & Simulazioni',
    icona: icona('M4 18l5-6 4 3 7-9M15 6h5v5'),
    modulo: 'simulazioni'
  },
  attivita: {
    id: 'attivita',
    label: 'Attività e Tempi',
    icona: icona('M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'),
    modulo: 'attivita'
  },
  dati: {
    id: 'dati',
    label: 'Dati contabili',
    icona: icona('M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2')
  },
  'impostazioni-azienda': {
    id: 'impostazioni-azienda',
    label: "Impostazioni dell'azienda",
    icona: icona('M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2M3 21h18')
  }
}

/** I gruppi del menu del consulente, nell'ordine in cui si lavora. */
const GRUPPI_CONSULENTE: { titolo: string; voci: Vista[] }[] = [
  { titolo: 'Analisi', voci: ['panoramica', 'conto-economico', 'stato-patrimoniale', 'capitale-circolante'] },
  { titolo: 'Cassa e banche', voci: ['tesoreria', 'banche'] },
  { titolo: 'Pianificazione', voci: ['simulazioni'] },
  { titolo: "Lavoro con l'azienda", voci: ['attivita'] },
  { titolo: 'Dati e impostazioni', voci: ['dati', 'impostazioni-azienda'] }
]

/** Le viste condivisibili, nell'ordine del menu dell'azienda. */
const VISTE_AZIENDA_ORDINE: Extract<VistaCondivisibile, Vista>[] = [
  'panoramica',
  'conto-economico',
  'stato-patrimoniale',
  'capitale-circolante',
  'tesoreria',
  'banche',
  'simulazioni'
]

function Bottone({
  voce,
  attiva,
  onClick
}: {
  voce: Voce
  attiva: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        attiva
          ? 'bg-brand-500/15 font-medium text-brand-300'
          : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
      }`}
    >
      <span className="h-4.5 w-4.5 shrink-0">{voce.icona}</span>
      <span className="truncate">{voce.label}</span>
    </button>
  )
}

function Titolo({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="mt-3 px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">{children}</p>
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
  version,
  aperta = false,
  onChiudi
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
  version: string
  /** Sul telefono il menu è a scomparsa: aperto o chiuso dal tasto ☰. */
  aperta?: boolean
  onChiudi?: () => void
}): React.JSX.Element {
  const visibile = (id: Vista): boolean => {
    const voce = id in V ? V[id as keyof typeof V] : null
    return !voce?.modulo || moduloAttivo(voce.modulo)
  }

  return (
    <>
      {aperta && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onChiudi} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-ink-700 bg-ink-900 transition-transform md:static md:z-auto md:w-60 md:translate-x-0 ${
          aperta ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <Logo size={30} />
          <span className="text-sm font-semibold tracking-tight text-ink-100">
            DaProd<span className="text-brand-300">Finanza</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
          {consulente && (
            <Bottone voce={ANAGRAFICA} attiva={vista === 'anagrafica'} onClick={onAnagrafica} />
          )}

          {company && (
            <>
              <div className="mt-4 px-3 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  {consulente ? 'Azienda' : 'La tua azienda'}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-300" title={company.name}>
                  {company.name}
                </p>
              </div>

              {consulente
                ? GRUPPI_CONSULENTE.map((g) => {
                    const voci = g.voci.filter(visibile)
                    if (voci.length === 0) return null
                    return (
                      <div key={g.titolo}>
                        <Titolo>{g.titolo}</Titolo>
                        {voci.map((id) => (
                          <Bottone key={id} voce={V[id as keyof typeof V]} attiva={vista === id} onClick={() => onVista(id)} />
                        ))}
                      </div>
                    )
                  })
                : VISTE_AZIENDA_ORDINE.filter((v) => visteAzienda.includes(v)).map((id) => (
                    <Bottone key={id} voce={V[id as keyof typeof V]} attiva={vista === id} onClick={() => onVista(id)} />
                  ))}
            </>
          )}
        </nav>

        <div className="border-t border-ink-800 px-3 py-2">
          {consulente ? (
            <Bottone voce={IMPOSTAZIONI} attiva={vista === 'impostazioni'} onClick={() => onVista('impostazioni')} />
          ) : (
            <Bottone voce={PROFILO} attiva={vista === 'profilo'} onClick={() => onVista('profilo')} />
          )}
          <p className="px-3 pt-1 font-mono text-[11px] text-ink-600">v{version || '—'}</p>
        </div>
      </aside>
    </>
  )
}
