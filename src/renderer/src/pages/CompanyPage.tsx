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
import { nomeVista, type Vista, type Voce } from '../components/Sidebar'
import { Alert, Button, CaricamentoPagina, Card, EmptyState, Segmentato, Select } from '../components/ui'
import { FoglioBasso } from '../components/Guscio'
import { Icona } from '../components/icone'
import { mostraAvviso } from '../components/Avvisi'
import { useRegistraComandi } from '../lib/comandi'
import { ActivitiesView } from './business/ActivitiesView'
import { BalanceSheetView } from './business/BalanceSheetView'
import { BanksView } from './business/BanksView'
import { SimulationView } from './business/SimulationView'
import { DataView } from './business/DataView'
import { BloccoPannelli, EVENTO_RIPRISTINA, MenuPannelli } from '../components/Pannelli'
import { CompanySettingsView } from './business/CompanySettingsView'
import { CompanyHome } from './business/CompanyHome'
import { DocumentsView } from './business/DocumentsView'
import { RequestsBoard } from '../components/RequestsBoard'
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

/**
 * Le viste che non guardano un periodo di bilancio: dati contabili, tesoreria e
 * banche guardano da oggi in avanti; attività e impostazioni sono il lavoro e
 * le regole dello studio, non i conti dell'azienda.
 */
const SENZA_PERIODO: Vista[] = [
  'dati',
  'tesoreria',
  'banche',
  'attivita',
  'impostazioni-azienda',
  'riepilogo',
  'documenti',
  'richieste'
]

/** Viste senza pannelli spostabili: il menu "Pannelli" non ha niente da fare. */
const SENZA_PANNELLI: Vista[] = ['dati', 'impostazioni-azienda', 'riepilogo', 'documenti', 'richieste']

export function CompanyPage({
  company,
  vista,
  onVista,
  canImport,
  onCompanyChanged,
  richiestaScelta = null,
  schede = []
}: {
  company: Company
  vista: Vista
  onVista: (vista: Vista) => void
  canImport: boolean
  /** Dopo una modifica dei dati dell'azienda (Impostazioni dell'azienda). */
  onCompanyChanged?: (company: Company) => void
  /** Una richiesta da aprire subito (dal campanello). */
  richiestaScelta?: { companyUuid: string; requestUuid: string } | null
  /** Sul telefono: le sezioni vicine (stesso gruppo), come schede sotto il titolo. */
  schede?: Voce[]
}): React.JSX.Element {
  // Solo le viste sui bilanci chiedono i periodi: all'operatore Azienda che
  // vede, per esempio, soltanto la tesoreria il server li rifiuterebbe (§10.12).
  const servonoPeriodi = !SENZA_PERIODO.includes(vista) || vista === 'dati'
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
    if (servonoPeriodi) caricaPeriodi()
    else setLoading(false)
  }, [caricaPeriodi, servonoPeriodi])

  useEffect(() => {
    if (!servonoPeriodi) return
    api
      .get<SeriesPoint[]>(`/api/companies/${company.uuid}/series?scenario=${scenario}`)
      .then(setSerie)
      .catch(() => setSerie([]))
  }, [company.uuid, scenario, periods.length, servonoPeriodi])

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
  const caricaTesoreria = useCallback(
    async (silenzioso = false) => {
      try {
        setTesoreria(await api.get<TreasuryPayload>(`/api/companies/${company.uuid}/treasury`))
      } catch (err) {
        if (!silenzioso) setError(err instanceof Error ? err.message : 'Tesoreria non disponibile.')
      }
    },
    [company.uuid]
  )

  useEffect(() => {
    if (vista === 'tesoreria' || vista === 'panoramica') caricaTesoreria()
    // Le simulazioni la usano solo per la soglia minima di liquidità: a
    // un'azienda che vede le simulazioni ma non la tesoreria basta farne a meno.
    if (vista === 'simulazioni') caricaTesoreria(true)
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
      setReport(null)
      if (path) mostraAvviso(`Report salvato: ${path.split(/[\\/]/).pop()}`)
    } catch (err) {
      setReport(null)
      mostraAvviso(err instanceof Error ? err.message : 'Report non riuscito.', 'errore')
    }
  }
  const senzaPeriodo = SENZA_PERIODO.includes(vista)
  const conSelettori = periods.length > 0 && !senzaPeriodo
  const conPannelli = !SENZA_PANNELLI.includes(vista)
  const periodo = periods.find((p) => p.uuid === periodUuid)
  const scenarioLabel = SCENARI.find((x) => x.id === scenario)?.label ?? ''
  // Sul telefono periodo, scenario e report stanno in un foglio che sale dal basso.
  const [foglio, setFoglio] = useState(false)

  // Comandi rapidi di questa schermata (Ctrl+K e pulsante "Nuovo").
  useRegistraComandi(
    'azienda',
    [
      ...(conSelettori && conDati
        ? [
            {
              id: 'report-pdf',
              titolo: 'Report PDF del periodo',
              gruppo: 'Azioni' as const,
              icona: 'report' as const,
              parole: 'stampa esporta pdf bilancio',
              dettaglio: `${periodo?.label ?? ''} · ${scenarioLabel}`,
              rapido: true,
              esegui: () => void esportaReport()
            }
          ]
        : []),
      ...(conPannelli
        ? [
            {
              id: 'pannelli-ripristina',
              titolo: 'Ripristina la disposizione dei pannelli',
              gruppo: 'Programma' as const,
              icona: 'pannelli' as const,
              parole: 'layout riquadri',
              esegui: () => window.dispatchEvent(new CustomEvent(EVENTO_RIPRISTINA, { detail: vista }))
            }
          ]
        : []),
      ...SCENARI.filter((x) => x.id !== scenario && conSelettori).map((x) => ({
        id: `scenario-${x.id}`,
        titolo: `Guarda il ${x.label.toLowerCase()}`,
        gruppo: 'Programma' as const,
        icona: 'andamento' as const,
        parole: 'scenario',
        esegui: () => setScenario(x.id)
      }))
    ],
    [vista, conSelettori, conDati, periodUuid, scenario, conPannelli].join('|')
  )

  const selettorePeriodo = (
    <Select
      value={periodUuid}
      onChange={(e) => setPeriodUuid(e.target.value)}
      className="min-w-0 py-1.5 text-xs md:w-56"
      aria-label="Periodo"
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
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-ink-700">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 md:gap-x-3 md:px-8 md:py-3">
          <div className="min-w-0 flex-1 md:min-w-[14rem]">
            <h1 className="truncate text-base font-semibold text-ink-100 md:text-lg">{nomeVista(vista)}</h1>
            <p className="truncate text-xs text-ink-400">
              <span className="md:hidden">{company.name}</span>
              <span className="font-mono max-md:hidden">
                {company.name} · {company.code}
                {company.vat_number ? ` · P.IVA ${company.vat_number}` : ''}
                {company.business_type ? ` · ${company.business_type}` : ''}
              </span>
            </p>
          </div>

          {conSelettori && (
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {selettorePeriodo}
              <Segmentato
                piccolo
                valore={scenario}
                onChange={setScenario}
                opzioni={SCENARI.map((x) => ({ id: x.id, label: x.label }))}
              />
              <Button
                variant="primary"
                className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs"
                disabled={!conDati || report !== null}
                onClick={esportaReport}
                title="Report completo del periodo scelto, da stampare o consegnare al cliente"
              >
                <Icona nome="report" className="h-4 w-4" />
                {report ? 'Preparo…' : 'Report PDF'}
              </Button>
            </div>
          )}
          {conPannelli && (
            <div className="max-md:hidden">
              <MenuPannelli vista={vista} />
            </div>
          )}
          {conPannelli && <BloccoPannelli className="md:hidden" />}
          {conSelettori && (
            <button
              type="button"
              onClick={() => setFoglio(true)}
              className="flex max-w-[45%] shrink-0 items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs text-ink-200 md:hidden"
              aria-label="Periodo, scenario e report"
            >
              <Icona nome="calendario" className="h-3.5 w-3.5 text-ink-400" />
              <span className="truncate">
                {periodo?.label ?? '—'}
                {scenario !== 'actual' ? ` · ${scenarioLabel}` : ''}
              </span>
              <Icona nome="giu" className="h-3 w-3 text-ink-400" />
            </button>
          )}
        </div>

        {schede.length > 1 && (
          <nav className="flex gap-1.5 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Sezioni vicine">
            {schede.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onVista(v.id)}
                aria-current={v.id === vista ? 'page' : undefined}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                  v.id === vista
                    ? 'border-brand-400/60 bg-brand-500/15 font-medium text-brand-200'
                    : 'border-ink-700 bg-ink-900 text-ink-300'
                }`}
              >
                {v.breve ?? v.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {foglio && (
        <FoglioBasso titolo="Periodo e scenario" onChiudi={() => setFoglio(false)}>
          <div className="flex flex-col gap-4 px-4 py-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-300">Periodo</span>
              {selettorePeriodo}
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-300">Scenario</span>
              <Segmentato
                valore={scenario}
                onChange={setScenario}
                className="w-full"
                opzioni={SCENARI.map((x) => ({ id: x.id, label: x.label }))}
              />
            </div>
            <Button
              variant="primary"
              disabled={!conDati || report !== null}
              onClick={() => {
                setFoglio(false)
                void esportaReport()
              }}
            >
              <Icona nome="report" className="h-4 w-4" />
              Report PDF del periodo
            </Button>
            {conPannelli && (
              <Button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent(EVENTO_RIPRISTINA, { detail: vista }))
                  setFoglio(false)
                }}
              >
                <Icona nome="pannelli" className="h-4 w-4" />
                Ripristina la disposizione dei pannelli
              </Button>
            )}
          </div>
        </FoglioBasso>
      )}

      {/* Le richieste hanno elenco e dettaglio che scorrono ognuno per conto suo. */}
      <div
        className={`min-h-0 flex-1 px-3 py-4 md:px-8 md:py-6 ${
          vista === 'richieste' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'
        }`}
      >
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

        {vista === 'attivita' && canImport && <ActivitiesView company={company} />}

        {vista === 'impostazioni-azienda' && canImport && (
          <CompanySettingsView company={company} onCompanyChanged={(c) => onCompanyChanged?.(c)} />
        )}

        {vista === 'riepilogo' && <CompanyHome company={company} onVista={onVista} />}

        {vista === 'documenti' && <DocumentsView company={company} />}

        {vista === 'richieste' && (
          <div className="min-h-0 flex-1">
            <RequestsBoard
              companyUuid={company.uuid}
              selezioneIniziale={richiestaScelta?.companyUuid === company.uuid ? richiestaScelta : null}
            />
          </div>
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
            <CaricamentoPagina />
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
            <CaricamentoPagina />
          ))}

        {!senzaPeriodo &&
          (loading ? (
            <CaricamentoPagina />
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
              <CaricamentoPagina />
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
              <CaricamentoPagina />
            )
          ) : (
            <BalanceSheetView analysis={analysis} />
          ))}
      </div>
    </div>
  )
}
