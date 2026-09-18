import { useCallback, useEffect, useState } from 'react'
import type {
  Analysis,
  BankingView as BankingPayload,
  SeriesPoint,
  TreasuryView as TreasuryPayload,
  WorkingCapitalView as WorkingCapitalPayload
} from '@shared/analysis'
import { DEFAULT_SCHEME, type Scheme, type SimulationBase } from '@shared/engine'
import type { Company, FiscalPeriod, Scenario, SimulationScenario } from '@shared/types'
import { api, getToken } from '../lib/api'
import type { Vista } from '../components/Sidebar'
import { Alert, Button, Card, EmptyState, Select } from '../components/ui'
import { BalanceSheetView } from './business/BalanceSheetView'
import { BanksView } from './business/BanksView'
import { SimulationView } from './business/SimulationView'
import { DataView } from './business/DataView'
import { MenuPannelli } from '../components/Pannelli'
import { IncomeStatementView } from './business/IncomeStatementView'
import { OverviewView } from './business/OverviewView'
import { TreasuryView } from './business/TreasuryView'
import { WorkingCapitalView } from './business/WorkingCapitalView'

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
  const [tesoreria, setTesoreria] = useState<TreasuryPayload | null>(null)
  const [circolante, setCircolante] = useState<WorkingCapitalPayload | null>(null)
  const [banche, setBanche] = useState<BankingPayload | null>(null)
  const [simBase, setSimBase] = useState<{
    key: string
    base: SimulationBase | null
    error: string | null
  } | null>(null)
  const [scenari, setScenari] = useState<SimulationScenario[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Cresce a ogni "Aggiorna" del cruscotto: fa ricaricare l'analisi.
  const [giro, setGiro] = useState(0)

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
  }, [company.uuid, periodUuid, scenario, scheme, giro])

  // La tesoreria guarda avanti da oggi: non dipende dal periodo scelto.
  const caricaTesoreria = useCallback(async () => {
    try {
      setTesoreria(await api.get<TreasuryPayload>(`/api/companies/${company.uuid}/treasury`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tesoreria non disponibile.')
    }
  }, [company.uuid])

  useEffect(() => {
    // Anche le simulazioni la usano, per la soglia minima di liquidità.
    if (vista === 'tesoreria' || vista === 'panoramica' || vista === 'simulazioni') caricaTesoreria()
  }, [vista, caricaTesoreria])

  const caricaBanche = useCallback(async () => {
    try {
      setBanche(await api.get<BankingPayload>(`/api/companies/${company.uuid}/banking`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Banche non disponibili.')
    }
  }, [company.uuid])

  useEffect(() => {
    if (vista === 'banche') caricaBanche()
  }, [vista, caricaBanche])

  const caricaScenari = useCallback(async () => {
    try {
      setScenari(await api.get<SimulationScenario[]>(`/api/companies/${company.uuid}/simulations`))
    } catch {
      setScenari([])
    }
  }, [company.uuid])

  // La base della simulazione dipende dal periodo e dallo scenario scelti.
  useEffect(() => {
    if (vista !== 'simulazioni' || !periodUuid) return
    const key = `${periodUuid}|${scenario}`
    let annullato = false
    caricaScenari()
    api
      .get<SimulationBase>(
        `/api/companies/${company.uuid}/periods/${periodUuid}/simulation-base?scenario=${scenario}`
      )
      .then((base) => {
        if (!annullato) setSimBase({ key, base, error: null })
      })
      .catch((err) => {
        if (!annullato) {
          setSimBase({
            key,
            base: null,
            error: err instanceof Error ? err.message : 'Base della simulazione non disponibile.'
          })
        }
      })
    return () => {
      annullato = true
    }
  }, [company.uuid, vista, periodUuid, scenario, caricaScenari])

  useEffect(() => {
    if (vista !== 'capitale-circolante' || !periodUuid) return
    let annullato = false
    api
      .get<WorkingCapitalPayload>(
        `/api/companies/${company.uuid}/periods/${periodUuid}/working-capital?scenario=${scenario}`
      )
      .then((result) => {
        if (!annullato) setCircolante(result)
      })
      .catch((err) => {
        if (!annullato) {
          setError(err instanceof Error ? err.message : 'Capitale circolante non disponibile.')
        }
      })
    return () => {
      annullato = true
    }
  }, [company.uuid, vista, periodUuid, scenario])

  const conDati = analysis !== null && analysis.accountCount > 0
  const [report, setReport] = useState<string | null>(null)

  const esportaReport = async (): Promise<void> => {
    const period = periods.find((p) => p.uuid === periodUuid)
    const token = getToken()
    if (!period || !token) return
    setReport('Preparo il report…')
    try {
      const path = await window.daprod.exportReport({
        companyUuid: company.uuid,
        companyName: company.name,
        companyCode: company.code,
        periodUuid,
        periodLabel: `${period.label}${scenario === 'actual' ? '' : ` · ${SCENARI.find((s) => s.id === scenario)?.label}`}`,
        scenario,
        scheme,
        token
      })
      setReport(path ? `Report salvato: ${path.split(/[\/]/).pop()}` : null)
    } catch (err) {
      setReport(err instanceof Error ? err.message : 'Report non riuscito.')
    } finally {
      setTimeout(() => setReport(null), 8000)
    }
  }
  // Dati contabili, tesoreria e banche non dipendono dal periodo scelto.
  const senzaPeriodo = vista === 'dati' || vista === 'tesoreria' || vista === 'banche'

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

        {vista !== 'dati' && <MenuPannelli vista={vista} />}
        {periods.length > 0 && !senzaPeriodo && (
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
            <Button
              variant="primary"
              className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs"
              disabled={!conDati || report === 'Preparo il report…'}
              onClick={esportaReport}
              title="Report completo del periodo scelto, da stampare o consegnare al cliente"
            >
              Report PDF
            </Button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {report && (
          <div className="mb-5">
            <Alert tone="info">{report}</Alert>
          </div>
        )}
        {error && (
          <div className="mb-5">
            <Alert>{error}</Alert>
          </div>
        )}

        {vista === 'dati' && canImport && (
          <DataView company={company} periods={periods} canEdit={canImport} onChanged={caricaPeriodi} />
        )}

        {vista === 'tesoreria' &&
          (tesoreria ? (
            <TreasuryView
              vista={tesoreria}
              companyUuid={company.uuid}
              canEdit={canImport}
              onChanged={caricaTesoreria}
            />
          ) : (
            <p className="text-sm text-ink-400">Caricamento…</p>
          ))}

        {vista === 'banche' &&
          (banche ? (
            <BanksView
              vista={banche}
              companyUuid={company.uuid}
              canEdit={canImport}
              onChanged={caricaBanche}
            />
          ) : (
            <p className="text-sm text-ink-400">Caricamento…</p>
          ))}

        {!senzaPeriodo &&
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
                      ? 'Questa azienda non ha ancora numeri. Crea il piano dei conti e scrivi i saldi in Dati contabili (oppure importa un Excel che hai già): le analisi compaiono da sole.'
                      : 'Il consulente non ha ancora caricato un bilancio per questa azienda.'
                    : `Il periodo selezionato non ha saldi per lo scenario "${
                        SCENARI.find((s) => s.id === scenario)?.label
                      }".`
                }
                action={
                  periods.length === 0 &&
                  canImport && (
                    <Button variant="primary" onClick={() => onVista('dati')}>
                      Inserisci i dati
                    </Button>
                  )
                }
              />
            </Card>
          ) : vista === 'panoramica' ? (
            <OverviewView
              company={company}
              analysis={analysis}
              serie={serie}
              tesoreria={tesoreria}
              onVista={onVista}
              onRefresh={() => {
                setGiro((g) => g + 1)
                caricaTesoreria()
                caricaPeriodi()
              }}
            />
          ) : vista === 'conto-economico' ? (
            <IncomeStatementView
              analysis={analysis}
              serie={serie}
              scheme={scheme}
              onScheme={setScheme}
            />
          ) : vista === 'simulazioni' ? (
            !simBase || simBase.key !== `${periodUuid}|${scenario}` ? (
              <p className="text-sm text-ink-400">Caricamento…</p>
            ) : simBase.base ? (
              <SimulationView
                key={simBase.key}
                base={simBase.base}
                companyUuid={company.uuid}
                periodUuid={periodUuid}
                scenario={scenario}
                scenari={scenari}
                soglia={tesoreria?.sogliaMinima ?? null}
                canEdit={canImport}
                onScenariChanged={caricaScenari}
                onVaiTesoreria={() => onVista('tesoreria')}
              />
            ) : (
              <Card>
                <EmptyState title="Simulazione non disponibile" description={simBase.error ?? ''} />
              </Card>
            )
          ) : vista === 'capitale-circolante' ? (
            circolante && circolante.period.uuid === periodUuid ? (
              <WorkingCapitalView vista={circolante} />
            ) : (
              <p className="text-sm text-ink-400">Caricamento…</p>
            )
          ) : (
            <BalanceSheetView analysis={analysis} />
          ))}
      </div>
    </div>
  )
}
