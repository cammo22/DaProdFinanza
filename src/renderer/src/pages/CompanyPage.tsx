import { useCallback, useEffect, useState } from 'react'
import type { Analysis, SeriesPoint } from '@shared/analysis'
import { DEFAULT_SCHEME, type Scheme } from '@shared/engine'
import type { Company, FiscalPeriod, Scenario } from '@shared/types'
import { api } from '../lib/api'
import type { Vista } from '../components/Sidebar'
import { Alert, Button, Card, EmptyState, Select } from '../components/ui'
import { BalanceSheetView } from './business/BalanceSheetView'
import { ImportPanel, TemplateButton } from './business/ImportPanel'
import { IncomeStatementView } from './business/IncomeStatementView'
import { OverviewView } from './business/OverviewView'

/**
 * Area di lavoro di una singola azienda — AGENTS.md §10.2-§10.9.
 *
 * La navigazione sta nel menu laterale; qui restano i selettori che valgono per
 * tutte le viste: periodo e scenario. Le viste leggono tutte lo stesso payload
 * di analisi — un solo calcolo per periodo, tre modi di guardarlo.
 */

const SCENARI: { id: Scenario; label: string }[] = [
  { id: 'actual', label: 'Consuntivo' },
  { id: 'budget', label: 'Budget' },
  { id: 'forecast', label: 'Forecast' }
]

export function CompanyPage({
  company,
  vista,
  onVista,
  canImport
}: {
  company: Company
  vista: Vista
  onVista: (vista: Vista) => void
  canImport: boolean
}): React.JSX.Element {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [periodUuid, setPeriodUuid] = useState<string>('')
  const [scenario, setScenario] = useState<Scenario>('actual')
  const [scheme, setScheme] = useState<Scheme>(DEFAULT_SCHEME)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [serie, setSerie] = useState<SeriesPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const caricaPeriodi = useCallback(async () => {
    try {
      const result = await api.get<FiscalPeriod[]>(`/api/companies/${company.uuid}/periods`)
      setPeriods(result)
      // Si apre sul periodo più recente con dati a consuntivo: il più recente in
      // assoluto può essere un mese di solo budget, e la prima schermata
      // sarebbe vuota.
      const predefinito = result.find((p) => p.scenarios?.includes('actual')) ?? result[0]
      setPeriodUuid((corrente) =>
        corrente && result.some((p) => p.uuid === corrente) ? corrente : (predefinito?.uuid ?? '')
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Caricamento dei periodi non riuscito.')
    } finally {
      setLoading(false)
    }
  }, [company.uuid])

  useEffect(() => {
    caricaPeriodi()
  }, [caricaPeriodi])

  useEffect(() => {
    api
      .get<SeriesPoint[]>(`/api/companies/${company.uuid}/series?scenario=${scenario}`)
      .then(setSerie)
      .catch(() => setSerie([]))
  }, [company.uuid, scenario, periods.length])

  useEffect(() => {
    if (!periodUuid) {
      setAnalysis(null)
      return
    }
    let annullato = false
    api
      .get<Analysis>(
        `/api/companies/${company.uuid}/periods/${periodUuid}/analysis?scenario=${scenario}&scheme=${scheme}`
      )
      .then((result) => {
        if (!annullato) {
          setAnalysis(result)
          setError(null)
        }
      })
      .catch((err) => {
        if (!annullato) setError(err instanceof Error ? err.message : 'Analisi non riuscita.')
      })
    return () => {
      annullato = true
    }
  }, [company.uuid, periodUuid, scenario, scheme])

  const conDati = analysis !== null && analysis.accountCount > 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-4 border-b border-ink-700 px-8 py-4">
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-ink-100">{company.name}</h1>
          <p className="mt-0.5 font-mono text-xs text-ink-400">
            {company.code}
            {company.vat_number ? ` · P.IVA ${company.vat_number}` : ''}
            {company.business_type ? ` · ${company.business_type}` : ''}
          </p>
        </div>

        {periods.length > 0 && vista !== 'import' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-400">Periodo</span>
            <Select
              value={periodUuid}
              onChange={(e) => setPeriodUuid(e.target.value)}
              className="w-60 py-1.5 text-xs"
            >
              {periods.map((p) => {
                // Un periodo senza lo scenario scelto lo dichiara già nel menu,
                // invece di farlo scoprire aprendolo.
                const altri =
                  p.scenarios && p.scenarios.length > 0 && !p.scenarios.includes(scenario)
                    ? ` · solo ${p.scenarios
                        .map((s) => SCENARI.find((x) => x.id === s)?.label.toLowerCase())
                        .join(', ')}`
                    : ''
                return (
                  <option key={p.uuid} value={p.uuid}>
                    {p.label}
                    {altri}
                  </option>
                )
              })}
            </Select>
            <Select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as Scenario)}
              className="w-40 py-1.5 text-xs"
            >
              {SCENARI.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {error && (
          <div className="mb-5">
            <Alert>{error}</Alert>
          </div>
        )}

        {vista === 'import' && canImport && (
          <ImportPanel company={company} onImported={caricaPeriodi} />
        )}

        {vista !== 'import' &&
          (loading ? (
            <p className="text-sm text-ink-400">Caricamento…</p>
          ) : !conDati ? (
            <Card>
              <EmptyState
                title={
                  periods.length === 0 ? 'Nessun dato caricato' : 'Nessun saldo per questa scelta'
                }
                description={
                  periods.length === 0
                    ? canImport
                      ? "Questa azienda non ha ancora un bilancio. Scarica il modello Excel, compilalo con i saldi e importalo: le analisi compaiono da sole."
                      : 'Il consulente non ha ancora caricato un bilancio per questa azienda.'
                    : `Il periodo selezionato non ha saldi per lo scenario "${
                        SCENARI.find((s) => s.id === scenario)?.label
                      }".`
                }
                action={
                  periods.length === 0 &&
                  canImport && (
                    <div className="flex items-start gap-3">
                      <TemplateButton company={company} />
                      <Button variant="primary" onClick={() => onVista('import')}>
                        Importa un file
                      </Button>
                    </div>
                  )
                }
              />
            </Card>
          ) : vista === 'panoramica' ? (
            <OverviewView analysis={analysis} serie={serie} />
          ) : vista === 'conto-economico' ? (
            <IncomeStatementView
              analysis={analysis}
              serie={serie}
              scheme={scheme}
              onScheme={setScheme}
            />
          ) : (
            <BalanceSheetView analysis={analysis} />
          ))}
      </div>
    </div>
  )
}
