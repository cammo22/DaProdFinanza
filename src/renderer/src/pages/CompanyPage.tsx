import { useCallback, useEffect, useState } from 'react'
import type { Analysis, SeriesPoint } from '@shared/analysis'
import { DEFAULT_SCHEME, type Scheme } from '@shared/engine'
import type { Company, FiscalPeriod, Scenario } from '@shared/types'
import { api } from '../lib/api'
import type { Vista } from '../components/Sidebar'
import { Alert, Button, Card, EmptyState, Select } from '../components/ui'
import { BalanceSheetView } from './business/BalanceSheetView'
import { ImportPanel } from './business/ImportPanel'
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
      setPeriodUuid((corrente) =>
        corrente && result.some((p) => p.uuid === corrente) ? corrente : (result[0]?.uuid ?? '')
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
              className="w-44 py-1.5 text-xs"
            >
              {periods.map((p) => (
                <option key={p.uuid} value={p.uuid}>
                  {p.label}
                </option>
              ))}
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
                      ? "Questa azienda esiste in anagrafica ma non ha ancora un bilancio. Importa il piano dei conti e le analisi compaiono da sole."
                      : 'Il consulente non ha ancora caricato un bilancio per questa azienda.'
                    : `Il periodo selezionato non ha saldi per lo scenario "${
                        SCENARI.find((s) => s.id === scenario)?.label
                      }".`
                }
                action={
                  periods.length === 0 &&
                  canImport && (
                    <Button variant="primary" onClick={() => onVista('import')}>
                      Vai all&apos;import
                    </Button>
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
