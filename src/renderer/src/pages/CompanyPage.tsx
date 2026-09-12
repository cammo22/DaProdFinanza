import type { Company } from '@shared/types'
import { Button, Card } from '../components/ui'

/**
 * Suite Business di una singola azienda — AGENTS.md §10.2-§10.8.
 *
 * In Fase 1 è volutamente un segnaposto: le sette viste richiedono il motore di
 * riclassificazione (Fase 3) e non vengono mostrate con dati finti, che su un
 * gestionale contabile sarebbero fuorvianti.
 */
const MODULES: { name: string; description: string; phase: string }[] = [
  {
    name: 'Panoramica',
    description: 'Alert automatici, KPI economici e finanziari, 4 grafici a 12 mesi.',
    phase: 'Fase 4'
  },
  {
    name: 'Conto Economico',
    description: 'Riclassificato a margine di contribuzione, con budget e anno precedente.',
    phase: 'Fase 4'
  },
  {
    name: 'Stato Patrimoniale',
    description: 'Attivo e passivo riclassificati, CCN, PFN, indici patrimoniali.',
    phase: 'Fase 4'
  },
  {
    name: 'Capitale Circolante',
    description: 'DSO, DIO, DPO, Cash Conversion Cycle con trend e note automatiche.',
    phase: 'Fase 5'
  },
  {
    name: 'Tesoreria / Cash Flow',
    description: 'Previsione di liquidità a 7/30/60/90 giorni e scadenziario.',
    phase: 'Fase 5'
  },
  {
    name: 'Banche e Finanziamenti',
    description: 'Fidi, mutui e leasing, con le rate che alimentano il cash flow.',
    phase: 'Fase 6'
  },
  {
    name: 'Analisi & Simulazioni',
    description: 'Scenari "cosa succede se" su ricavi, costi, investimenti, finanziamenti.',
    phase: 'Fase 7'
  }
]

export function CompanyPage({
  company,
  onBack
}: {
  company: Company
  onBack: (() => void) | null
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-4 border-b border-ink-700 px-8 py-5">
        {onBack && (
          <Button className="px-3 py-1.5 text-xs" onClick={onBack}>
            ← Clienti
          </Button>
        )}
        <div>
          <h1 className="text-lg font-semibold text-ink-100">{company.name}</h1>
          <p className="mt-0.5 font-mono text-xs text-ink-400">
            {company.code}
            {company.vat_number ? ` · P.IVA ${company.vat_number}` : ''}
            {company.legal_form ? ` · ${company.legal_form}` : ''}
            {company.business_type ? ` · ${company.business_type}` : ''}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <Card title="Suite Business">
          <div className="px-5 py-4">
            <p className="mb-5 max-w-3xl text-sm text-ink-400">
              I sette moduli di analisi si attivano quando il motore di riclassificazione e
              l&apos;import del piano dei conti saranno operativi. Fino ad allora questa azienda
              esiste solo in anagrafica: nessun dato contabile è stato ancora caricato.
            </p>

            <ul className="grid grid-cols-2 gap-3">
              {MODULES.map((module) => (
                <li
                  key={module.name}
                  className="flex items-start gap-3 rounded-lg border border-ink-800 bg-ink-900 px-4 py-3"
                >
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-ink-300">{module.name}</h3>
                    <p className="mt-0.5 text-xs text-ink-400">{module.description}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-ink-800 px-2 py-0.5 text-xs text-ink-400">
                    {module.phase}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  )
}
