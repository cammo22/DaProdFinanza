import type { Company } from '@shared/types'
import { Logo } from './Logo'

/**
 * Menu laterale — il pattern di navigazione dei mockup analizzati (AGENTS.md §0).
 *
 * In alto l'anagrafica, sotto le viste dell'azienda aperta. Le viste non ancora
 * costruite restano elencate e spente, con la fase in cui arriveranno: un menu
 * che si allunga a sorpresa disorienta più di uno che dichiara cosa manca.
 */

export type Vista =
  | 'anagrafica'
  | 'panoramica'
  | 'conto-economico'
  | 'stato-patrimoniale'
  | 'capitale-circolante'
  | 'tesoreria'
  | 'import'

interface Voce {
  id: Vista
  label: string
  icona: React.JSX.Element
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

const VISTE: Voce[] = [
  {
    id: 'panoramica',
    label: 'Panoramica',
    icona: icona('M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z')
  },
  {
    id: 'conto-economico',
    label: 'Conto Economico',
    icona: icona('M4 19h16M7 16V9M12 16V5M17 16v-4')
  },
  {
    id: 'stato-patrimoniale',
    label: 'Stato Patrimoniale',
    icona: icona('M3 9.5 12 4l9 5.5M5 10v9M19 10v9M9 10v9M15 10v9M3 20h18')
  },
  {
    id: 'capitale-circolante',
    label: 'Capitale Circolante',
    icona: icona('M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M18 3v3.5h-3.5M6 21v-3.5h3.5')
  },
  {
    id: 'tesoreria',
    label: 'Tesoreria / Cash Flow',
    icona: icona('M3 7h18v12H3zM3 11h18M7 15h3M16 4H6')
  },
  {
    id: 'import',
    label: 'Import dati',
    icona: icona('M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2')
  }
]

const IN_ARRIVO: { label: string; fase: string }[] = [
  { label: 'Banche e Finanziamenti', fase: 'Fase 6' },
  { label: 'Analisi & Simulazioni', fase: 'Fase 7' }
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

export function Sidebar({
  company,
  vista,
  onVista,
  onAnagrafica,
  mostraAnagrafica,
  mostraImport,
  version
}: {
  company: Company | null
  vista: Vista
  onVista: (vista: Vista) => void
  onAnagrafica: () => void
  /** Il ruolo Azienda non ha un'anagrafica da sfogliare (§4). */
  mostraAnagrafica: boolean
  mostraImport: boolean
  version: string
}): React.JSX.Element {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Logo size={30} />
        <span className="text-sm font-semibold tracking-tight text-ink-100">
          DaProd<span className="text-brand-300">Finanza</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
        {mostraAnagrafica && (
          <Bottone
            voce={ANAGRAFICA}
            attiva={vista === 'anagrafica'}
            onClick={onAnagrafica}
          />
        )}

        {company && (
          <>
            <div className="mt-4 px-3 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                Azienda
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-300" title={company.name}>
                {company.name}
              </p>
            </div>

            {VISTE.filter((v) => v.id !== 'import' || mostraImport).map((voce) => (
              <Bottone
                key={voce.id}
                voce={voce}
                attiva={vista === voce.id}
                onClick={() => onVista(voce.id)}
              />
            ))}

            <div className="mt-4 px-3 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                In arrivo
              </p>
            </div>
            {IN_ARRIVO.map((voce) => (
              <span
                key={voce.label}
                title={voce.fase}
                className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-ink-600"
              >
                <span className="truncate">{voce.label}</span>
                <span className="shrink-0 text-[10px] text-ink-700">{voce.fase.slice(5)}</span>
              </span>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-ink-800 px-4 py-3">
        <span className="font-mono text-[11px] text-ink-600">v{version || '—'}</span>
      </div>
    </aside>
  )
}
