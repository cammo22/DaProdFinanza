import { useEffect, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis
} from 'recharts'
import type {
  Analysis,
  BankingView,
  SeriesPoint,
  TreasuryView,
  WorkingCapitalView
} from '@shared/analysis'
import {
  CREDIT_LINE_LABELS,
  LOAN_LABELS,
  SCHEME_LABELS,
  schemeLines,
  THRESHOLDS
} from '@shared/engine'
import type { ReportParams } from '@shared/report'
import type { Company, SessionUser } from '@shared/types'
import { api, initApi, setToken } from '../../lib/api'
import { dataIt, days, euro, percent, share, times } from '../../lib/format'
import { avvisi } from '../business/OverviewView'
import logo from '../../assets/logo.png'

/**
 * Report PDF — impaginato per un A4 verticale e stampato dal main
 * (vedi src/main/report.ts). Chiaro, tipografico, con i numeri allineati:
 * è il documento che il consulente consegna al cliente.
 *
 * Ogni sezione compare solo se ha dati: un report non deve riempirsi di
 * tabelle vuote. I grafici sono a dimensione fissa e senza animazioni, così
 * la stampa non li coglie a metà.
 */

interface Dati {
  params: ReportParams
  company: Company
  user: SessionUser | null
  version: string
  analysis: Analysis
  serie: SeriesPoint[]
  circolante: WorkingCapitalView | null
  tesoreria: TreasuryView | null
  banche: BankingView | null
}

const SCENARI: Record<string, string> = { actual: 'Consuntivo', budget: 'Budget', forecast: 'Forecast' }

const C = {
  brand: '#1d4ed8',
  brandSoft: '#dbeafe',
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  ricavi: '#059669',
  costi: '#dc2626',
  ebitda: '#7c3aed',
  utile: '#2563eb',
  liquidita: '#0891b2',
  previsione: '#d97706',
  dso: '#2563eb',
  dio: '#d97706',
  dpo: '#db2777',
  ccc: '#7c3aed'
}

const PRINT_CSS = `
  @page { size: A4; }
  html, body, #root { height: auto !important; overflow: visible !important; background: #fff !important; }
  body { color: ${C.ink}; user-select: text; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pagina { break-after: page; }
  .pagina:last-child { break-after: auto; }
  .nobreak { break-inside: avoid; }
  table { border-collapse: collapse; }
`

async function carica(): Promise<Dati> {
  const params = await window.daprod.report.params()
  if (!params) throw new Error('Parametri del report mancanti.')
  const info = await initApi()
  setToken(params.token)
  const base = `/api/companies/${params.companyUuid}`
  const facoltativo = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null)

  const [company, user, analysis, serie, circolante, tesoreria, banche] = await Promise.all([
    api.get<Company>(base),
    facoltativo(api.get<SessionUser>('/api/auth/me')),
    api.get<Analysis>(
      `${base}/periods/${params.periodUuid}/analysis?scenario=${params.scenario}&scheme=${params.scheme}`
    ),
    facoltativo(api.get<SeriesPoint[]>(`${base}/series?scenario=${params.scenario}`)),
    facoltativo(
      api.get<WorkingCapitalView>(`${base}/periods/${params.periodUuid}/working-capital?scenario=${params.scenario}`)
    ),
    facoltativo(api.get<TreasuryView>(`${base}/treasury`)),
    facoltativo(api.get<BankingView>(`${base}/banking`))
  ])

  // La serie si ferma al periodo del report: gli ultimi 12 punti fino a lì.
  const fine = serie?.findIndex((p) => p.period_uuid === params.periodUuid) ?? -1
  const serieFinoA = serie ? (fine >= 0 ? serie.slice(0, fine + 1) : serie).slice(-12) : []

  return {
    params,
    company,
    user,
    version: info.version,
    analysis,
    serie: serieFinoA,
    circolante,
    tesoreria,
    banche: banche && (banche.lines.length > 0 || banche.loans.length > 0) ? banche : null
  }
}

export function ReportPage(): React.JSX.Element {
  const [dati, setDati] = useState<Dati | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    carica()
      .then(setDati)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Report non riuscito.'
        setErrore(msg)
        window.daprod.report.ready(msg)
      })
  }, [])

  // Pronto per la stampa quando i font sono caricati e il layout è fermo.
  useEffect(() => {
    if (!dati) return
    let annullato = false
    document.fonts.ready.then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!annullato) window.daprod.report.ready()
        })
      )
    )
    return () => {
      annullato = true
    }
  }, [dati])

  return (
    <>
      <style>{PRINT_CSS}</style>
      {errore && <p style={{ padding: 40 }}>{errore}</p>}
      {dati && <Report d={dati} />}
    </>
  )
}

// --- impaginazione --------------------------------------------------------------

function Report({ d }: { d: Dati }): React.JSX.Element {
  const a = d.analysis.incomeStatement.aggregates
  const r = d.analysis.ratios
  const b = d.analysis.balanceSheet
  const segnali = avvisi(d.analysis, d.tesoreria)
  let n = 0
  const numero = (): number => ++n

  return (
    <div className="bg-white text-[10.5px] leading-snug text-slate-900">
      <Copertina d={d} />

      <Pagina numero={numero()} titolo="Sintesi" d={d}>
        <div className="grid grid-cols-4 gap-2.5">
          <Tile label="Ricavi" valore={euro(a.ricaviNetti)} />
          <Tile label="EBITDA" valore={euro(a.ebitda)} nota={`${percent(r.molPercent)} dei ricavi`} tono={segno(r.molPercent, THRESHOLDS.molPercent.min)} />
          <Tile label="Utile netto" valore={euro(a.utile)} nota={share(a.utile, a.ricaviNetti)} tono={a.utile >= 0 ? 'ok' : 'ko'} />
          <Tile
            label="Punto di pareggio"
            valore={euro(r.bepCents)}
            nota={r.margineSicurezzaPercent === null ? undefined : `${percent(r.margineSicurezzaPercent)} di margine`}
            tono={segno(r.margineSicurezzaPercent, 0)}
          />
          <Tile label="Posizione finanziaria netta" valore={euro(r.posizioneFinanziariaNetta)} nota={r.pfnSuEbitda === null ? undefined : `${times(r.pfnSuEbitda)} l'EBITDA`} />
          <Tile label="Liquidità" valore={euro(b.liquiditaImmediate)} nota="a fine periodo" />
          <Tile label="DSCR" valore={times(r.dscr)} nota="copertura del debito" tono={segno(r.dscr, THRESHOLDS.dscr.min)} />
          <Tile label="Ciclo del circolante" valore={days(r.ccc)} nota={`incasso ${days(r.dso)} · pagamento ${days(r.dpo)}`} />
        </div>

        <Titoletto>Punti di attenzione</Titoletto>
        {segnali.length === 0 ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
            Nessun segnale d’allarme sulle soglie del modello per questo periodo.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {segnali.map((s) => (
              <li
                key={s.titolo}
                className={`nobreak rounded-md border-l-4 px-3 py-1.5 ${
                  s.livello === 'rosso' ? 'border-red-600 bg-red-50' : 'border-amber-500 bg-amber-50'
                }`}
              >
                <p className="font-semibold">{s.titolo}</p>
                <p className="text-slate-600">{s.dettaglio}</p>
              </li>
            ))}
          </ul>
        )}

        {d.serie.length > 1 && (
          <>
            <Titoletto>Andamento</Titoletto>
            <div className="nobreak">
              <ComposedChart width={680} height={210} data={d.serie.map(migliaia)} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" tickFormatter={corto} tick={{ fontSize: 9, fill: C.muted }} stroke={C.line} />
                <YAxis tick={{ fontSize: 9, fill: C.muted }} stroke={C.line} width={44} tickFormatter={(v) => `${v}k`} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Bar dataKey="ricavi" name="Ricavi" fill={C.ricavi} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                <Bar dataKey="costiTotali" name="Costi operativi" fill={C.costi} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                <Line dataKey="ebitda" name="EBITDA" stroke={C.ebitda} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="utile" name="Utile" stroke={C.utile} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </div>
            <Titoletto>Liquidità a fine mese</Titoletto>
            <div className="nobreak">
              <LineChart width={680} height={150} data={d.serie.map(migliaia)} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" tickFormatter={corto} tick={{ fontSize: 9, fill: C.muted }} stroke={C.line} />
                <YAxis tick={{ fontSize: 9, fill: C.muted }} stroke={C.line} width={44} tickFormatter={(v) => `${v}k`} />
                <Line dataKey="liquidita" name="Liquidità" stroke={C.liquidita} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
              </LineChart>
            </div>
          </>
        )}
      </Pagina>

      <Pagina numero={numero()} titolo="Conto economico riclassificato" d={d}>
        <p className="mb-2 text-slate-500">Schema {SCHEME_LABELS[d.params.scheme].toLowerCase()}. Importi in euro.</p>
        <ContoEconomico d={d} />
      </Pagina>

      <Pagina numero={numero()} titolo="Stato patrimoniale e indici" d={d}>
        <StatoPatrimoniale d={d} />
        <Titoletto>Indici</Titoletto>
        <Indici d={d} />
      </Pagina>

      {d.circolante && (
        <Pagina numero={numero()} titolo="Capitale circolante" d={d}>
          <Circolante v={d.circolante} />
        </Pagina>
      )}

      {d.tesoreria && d.tesoreria.horizons.length > 0 && (
        <Pagina numero={numero()} titolo="Tesoreria e previsione di cassa" d={d}>
          <Tesoreria t={d.tesoreria} />
        </Pagina>
      )}

      {d.banche && (
        <Pagina numero={numero()} titolo="Banche e finanziamenti" d={d}>
          <Banche v={d.banche} />
        </Pagina>
      )}

      <Pagina numero={numero()} titolo="Note" d={d}>
        <div className="flex max-w-[150mm] flex-col gap-2 text-slate-700">
          <p>
            I valori derivano dai saldi contabili inseriti per {d.company.name} e sono riclassificati
            secondo il modello di controllo di gestione del consulente: conto economico{' '}
            {SCHEME_LABELS[d.params.scheme].toLowerCase()}, stato patrimoniale finanziario, indici di
            redditività, solidità, liquidità e ciclo del circolante.
          </p>
          <p>
            Le soglie degli indici (ROS 10%, EBITDA 15%, indipendenza finanziaria 30%, disponibilità e
            liquidità 1x, DSCR 1,25x) sono quelle del modello. Un trattino indica un valore che non si
            può calcolare con i dati disponibili: non equivale a zero.
          </p>
          <p>
            La previsione di cassa parte dalla liquidità di oggi e somma le scadenze dello scadenziario,
            le previsioni inserite e le rate dei finanziamenti; è una stima che dipende dalla
            completezza di quei dati.
          </p>
          <p className="mt-4 text-slate-500">
            Report generato il {new Date().toLocaleDateString('it-IT')} con DaProdFinanza {d.version}.
          </p>
        </div>
      </Pagina>
    </div>
  )
}

function Copertina({ d }: { d: Dati }): React.JSX.Element {
  const c = d.company
  return (
    <section className="pagina relative flex min-h-[265mm] flex-col">
      <div className="h-2 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${C.brand}, #06b6d4)` }} />
      <div className="mt-10 flex items-center gap-3">
        <img src={logo} alt="" className="h-14 w-14" />
        <span className="text-lg font-semibold tracking-tight">
          DaProd<span style={{ color: C.brand }}>Finanza</span>
        </span>
      </div>

      <div className="mt-[55mm]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: C.brand }}>
          Report di controllo di gestione
        </p>
        <h1 className="mt-3 text-[30px] font-bold leading-tight">{c.name}</h1>
        <p className="mt-2 text-[13px] text-slate-600">
          {[c.code, c.vat_number ? `P.IVA ${c.vat_number}` : null, c.business_type].filter(Boolean).join(' · ')}
        </p>
      </div>

      <dl className="mt-12 grid max-w-[120mm] grid-cols-2 gap-x-8 gap-y-3 text-[12px]">
        <Voce label="Periodo" valore={d.params.periodLabel} />
        <Voce label="Scenario" valore={SCENARI[d.params.scenario] ?? d.params.scenario} />
        <Voce label="Schema del conto economico" valore={SCHEME_LABELS[d.params.scheme]} />
        <Voce label="Data" valore={new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })} />
        {d.user && <Voce label="Preparato da" valore={d.user.full_name} />}
      </dl>

      <p className="absolute bottom-0 max-w-[150mm] text-[9px] text-slate-400">
        Documento riservato, destinato a {c.name}. I dati provengono dalla contabilità dell’azienda e non
        sono stati sottoposti a revisione.
      </p>
    </section>
  )
}

function Voce({ label, valore }: { label: string; valore: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium">{valore}</dd>
    </div>
  )
}

function Pagina({
  numero,
  titolo,
  d,
  children
}: {
  numero: number
  titolo: string
  d: Dati
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="pagina">
      <header className="mb-4 flex items-end justify-between border-b-2 pb-1.5" style={{ borderColor: C.brand }}>
        <h2 className="text-[16px] font-bold">
          <span className="mr-2 font-mono" style={{ color: C.brand }}>
            {String(numero).padStart(2, '0')}
          </span>
          {titolo}
        </h2>
        <span className="text-[9px] text-slate-500">
          {d.company.name} · {d.params.periodLabel}
        </span>
      </header>
      {children}
    </section>
  )
}

function Titoletto({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h3 className="mb-2 mt-5 text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.brand }}>
      {children}
    </h3>
  )
}

type Tono = 'ok' | 'ko' | null

function segno(value: number | null, soglia: number): Tono {
  if (value === null || !Number.isFinite(value)) return null
  return value >= soglia ? 'ok' : 'ko'
}

function Tile({ label, valore, nota, tono = null }: { label: string; valore: string; nota?: string; tono?: Tono }): React.JSX.Element {
  return (
    <div className="nobreak rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-[8.5px] uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={`mt-1 font-mono text-[15px] font-semibold ${
          tono === 'ok' ? 'text-emerald-700' : tono === 'ko' ? 'text-red-700' : ''
        }`}
      >
        {valore}
      </p>
      {nota && <p className="mt-0.5 text-[8.5px] text-slate-500">{nota}</p>}
    </div>
  )
}

const migliaia = (p: SeriesPoint): Record<string, number | string> => ({
  label: p.label,
  ricavi: Math.round(p.ricavi / 100_000),
  costiTotali: Math.round(p.costiTotali / 100_000),
  ebitda: Math.round(p.ebitda / 100_000),
  utile: Math.round(p.utile / 100_000),
  liquidita: Math.round(p.liquidita / 100_000)
})

function corto(label: string): string {
  const [mese, anno] = String(label).split(' ')
  return anno ? `${mese!.slice(0, 3)} '${anno.slice(-2)}` : String(label)
}

const TH_BASE = 'px-2 py-1.5 text-[8.5px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap'
const TH = `${TH_BASE} text-right`
const TH_L = `${TH_BASE} text-left`
const TD = 'px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap'

function ContoEconomico({ d }: { d: Dati }): React.JSX.Element {
  const colonne = d.analysis.comparison.columns
    .filter((c) => c.aggregates !== null)
    .map((c) => ({
      key: c.key,
      label: c.label,
      ricavi: c.aggregates!.ricaviNetti,
      righe: new Map(schemeLines(c.aggregates!, d.params.scheme).map((l) => [l.key, l.amount_cents]))
    }))
  const righe = d.analysis.incomeStatement.lines

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-slate-300">
          <th className={TH_L}>Voce</th>
          {colonne.map((c) => (
            <th key={c.key} className={TH} colSpan={2}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {righe.map((riga) => {
          const forte = riga.kind !== 'voce'
          return (
            <tr
              key={riga.key}
              className={`border-b border-slate-100 ${forte ? 'font-semibold' : ''} ${riga.kind === 'risultato' ? 'bg-blue-50' : ''}`}
            >
              <td className="px-2 py-1 text-left">
                <span className="mr-1.5 inline-block w-2 text-slate-400">{riga.sign === '=' ? '' : riga.sign}</span>
                {riga.label}
              </td>
              {colonne.map((c) => {
                const v = c.righe.get(riga.key) ?? null
                return (
                  <FragmentCell key={c.key} valore={v} quota={v === null ? '—' : share(v, c.ricavi)} />
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function FragmentCell({ valore, quota }: { valore: number | null; quota: string }): React.JSX.Element {
  return (
    <>
      <td className={TD}>{euro(valore)}</td>
      <td className={`${TD} w-12 text-slate-400`}>{quota}</td>
    </>
  )
}

function StatoPatrimoniale({ d }: { d: Dati }): React.JSX.Element {
  const b = d.analysis.balanceSheet
  const attivo: [string, number, boolean?][] = [
    ['Immobilizzazioni immateriali', b.immobilizzazioniImmateriali],
    ['Immobilizzazioni materiali', b.immobilizzazioniMateriali],
    ['Immobilizzazioni finanziarie', b.immobilizzazioniFinanziarie],
    ['Attivo fisso netto', b.attivoFissoNetto, true],
    ['Magazzino', b.magazzino],
    ['Liquidità differite', b.liquiditaDifferite],
    ['Liquidità immediate', b.liquiditaImmediate],
    ['Attivo circolante', b.attivoCircolante, true],
    ['Totale attivo', b.totaleAttivo, true]
  ]
  const passivo: [string, number, boolean?][] = [
    ['Patrimonio netto', b.patrimonioNetto],
    ['Debiti a medio/lungo termine', b.debitiMedioLungo],
    ['Debiti a breve termine', b.debitiBreve],
    ['Totale passivo e netto', b.totalePassivo, true]
  ]
  const Tabella = ({ titolo, righe, totale }: { titolo: string; righe: [string, number, boolean?][]; totale: number }): React.JSX.Element => (
    <table className="w-full self-start">
      <thead>
        <tr className="border-b border-slate-300">
          <th className={TH_L}>{titolo}</th>
          <th className={TH}>Euro</th>
          <th className={TH}>%</th>
        </tr>
      </thead>
      <tbody>
        {righe.map(([label, v, forte]) => (
          <tr key={label} className={`border-b border-slate-100 ${forte ? 'font-semibold' : ''}`}>
            <td className="px-2 py-1">{label}</td>
            <td className={TD}>{euro(v)}</td>
            <td className={`${TD} w-12 text-slate-400`}>{share(v, totale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <>
      <div className="grid grid-cols-2 gap-5">
        <Tabella titolo="Attivo" righe={attivo} totale={b.totaleAttivo} />
        <Tabella titolo="Passivo" righe={passivo} totale={b.totalePassivo} />
      </div>
      {b.sbilancio !== 0 && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-1.5 text-amber-800">
          Attivo e passivo non quadrano per {euro(b.sbilancio)}: i saldi del periodo sono incompleti o un conto è nella sezione sbagliata.
        </p>
      )}
      <p className="mt-3 text-slate-600">
        Capitale circolante netto <span className="font-mono font-semibold text-slate-900">{euro(b.capitaleCircolanteNetto)}</span>: crediti commerciali {euro(b.creditiCommerciali)}, magazzino {euro(b.magazzino)}, altri crediti {euro(b.altriCrediti)}, meno debiti verso fornitori {euro(b.debitiFornitori)} e altri debiti correnti {euro(b.altriDebitiCorrenti)}.
      </p>
    </>
  )
}

function Indici({ d }: { d: Dati }): React.JSX.Element {
  const r = d.analysis.ratios
  const righe: { nome: string; valore: string; soglia: string; giudizio: Tono }[] = [
    { nome: 'ROE — rendimento del capitale proprio', valore: percent(r.roe), soglia: '—', giudizio: null },
    { nome: 'ROI — rendimento del capitale investito', valore: percent(r.roi), soglia: '—', giudizio: null },
    { nome: 'ROS — redditività delle vendite', valore: percent(r.ros), soglia: '≥ 10%', giudizio: segno(r.ros, THRESHOLDS.ros.min) },
    { nome: 'EBITDA sui ricavi', valore: percent(r.molPercent), soglia: '≥ 15%', giudizio: segno(r.molPercent, THRESHOLDS.molPercent.min) },
    { nome: 'Indipendenza finanziaria', valore: percent(r.indipendenzaFinanziaria), soglia: '≥ 30%', giudizio: segno(r.indipendenzaFinanziaria, THRESHOLDS.indipendenzaFinanziaria.min) },
    { nome: 'Margine di struttura primario', valore: euro(r.margineStrutturaPrimario), soglia: '—', giudizio: null },
    { nome: 'Margine di struttura secondario', valore: euro(r.margineStrutturaSecondario), soglia: '≥ 0', giudizio: segno(r.margineStrutturaSecondario, 0) },
    { nome: 'Indice di disponibilità', valore: times(r.indiceDisponibilita), soglia: '≥ 1x', giudizio: segno(r.indiceDisponibilita, 1) },
    { nome: 'Indice di liquidità', valore: times(r.indiceLiquidita), soglia: '≥ 1x', giudizio: segno(r.indiceLiquidita, 1) },
    { nome: 'Posizione finanziaria netta', valore: euro(r.posizioneFinanziariaNetta), soglia: '—', giudizio: null },
    { nome: 'PFN / EBITDA', valore: times(r.pfnSuEbitda), soglia: '≤ 3x', giudizio: r.pfnSuEbitda === null ? null : r.pfnSuEbitda <= 3 ? 'ok' : 'ko' },
    { nome: 'Debt / Equity', valore: times(r.debtEquity), soglia: '—', giudizio: null },
    { nome: 'DSCR — copertura del servizio del debito', valore: times(r.dscr), soglia: '≥ 1,25x', giudizio: segno(r.dscr, THRESHOLDS.dscr.min) }
  ]
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-slate-300">
          <th className={TH_L}>Indice</th>
          <th className={TH}>Valore</th>
          <th className={TH}>Riferimento</th>
          <th className={`${TH} w-20`}>Esito</th>
        </tr>
      </thead>
      <tbody>
        {righe.map((riga) => (
          <tr key={riga.nome} className="border-b border-slate-100">
            <td className="px-2 py-1">{riga.nome}</td>
            <td className={TD}>{riga.valore}</td>
            <td className={`${TD} text-slate-500`}>{riga.soglia}</td>
            <td className="px-2 py-1 text-right">
              {riga.giudizio && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[8.5px] font-semibold ${
                    riga.giudizio === 'ok' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {riga.giudizio === 'ok' ? 'In linea' : 'Da seguire'}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Circolante({ v }: { v: WorkingCapitalView }): React.JSX.Element {
  const c = v.current
  const p = v.previousYear?.snapshot ?? null
  const serie = v.series.filter((s) => s.dso !== null || s.dpo !== null)
  return (
    <>
      <div className="grid grid-cols-4 gap-2.5">
        <Tile label="Giorni di incasso (DSO)" valore={days(c.dso)} nota={p ? `anno prima ${days(p.dso)}` : undefined} />
        <Tile label="Giorni di magazzino (DIO)" valore={days(c.dio)} nota={p ? `anno prima ${days(p.dio)}` : undefined} />
        <Tile label="Giorni di pagamento (DPO)" valore={days(c.dpo)} nota={p ? `anno prima ${days(p.dpo)}` : undefined} />
        <Tile label="Ciclo di cassa (CCC)" valore={days(c.ccc)} nota={p ? `anno prima ${days(p.ccc)}` : undefined} />
      </div>

      {serie.length > 1 && (
        <>
          <Titoletto>Andamento dei giorni</Titoletto>
          <LineChart width={680} height={200} data={serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.line} vertical={false} />
            <XAxis dataKey="label" tickFormatter={corto} tick={{ fontSize: 9, fill: C.muted }} stroke={C.line} />
            <YAxis tick={{ fontSize: 9, fill: C.muted }} stroke={C.line} width={34} />
            <Legend wrapperStyle={{ fontSize: 9 }} />
            <Line dataKey="dso" name="Incasso" stroke={C.dso} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="dio" name="Magazzino" stroke={C.dio} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="dpo" name="Pagamento" stroke={C.dpo} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="ccc" name="Ciclo di cassa" stroke={C.ccc} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </>
      )}

      {v.notes.length > 0 && (
        <>
          <Titoletto>Cosa è cambiato</Titoletto>
          <ul className="flex flex-col gap-1">
            {v.notes.map((note) => (
              <li key={note.text} className="flex gap-2">
                <span className={note.tone === 'positive' ? 'text-emerald-600' : note.tone === 'negative' ? 'text-red-600' : 'text-slate-400'}>●</span>
                {note.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Tesoreria({ t }: { t: TreasuryView }): React.JSX.Element {
  const curva = t.curve.map((p) => ({ label: dataIt(p.date).slice(0, 5), liquidita: Math.round(p.liquidita / 100) }))
  return (
    <>
      <div className="grid grid-cols-4 gap-2.5">
        <Tile label="Liquidità oggi" valore={euro(t.liquiditaOggi)} nota={dataIt(t.today)} />
        {t.horizons
          .filter((h) => h.days === 30 || h.days === 90 || h.days === 180)
          .map((h) => (
            <Tile key={h.days} label={`Fra ${h.label}`} valore={euro(h.liquiditaFinale)} tono={h.liquiditaFinale >= (t.sogliaMinima ?? 0) ? 'ok' : 'ko'} />
          ))}
      </div>

      {t.tensione && (
        <p className="mt-3 rounded-md border-l-4 border-red-600 bg-red-50 px-3 py-1.5">
          <span className="font-semibold">Tensione finanziaria fra {t.tensione.days} giorni:</span> il{' '}
          {dataIt(t.tensione.date)} la liquidità prevista scende a {euro(t.tensione.liquidita)}
          {t.tensione.soglia > 0 ? `, sotto la soglia minima di ${euro(t.tensione.soglia)}` : ''}.
        </p>
      )}

      <Titoletto>Liquidità prevista</Titoletto>
      <LineChart width={680} height={200} data={curva} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.muted }} stroke={C.line} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: C.muted }} stroke={C.line} width={52} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        {t.sogliaMinima !== null && (
          <ReferenceLine y={t.sogliaMinima / 100} stroke={C.costi} strokeDasharray="4 3" label={{ value: 'soglia minima', fontSize: 8, fill: C.costi, position: 'insideTopRight' }} />
        )}
        <Line dataKey="liquidita" name="Liquidità" stroke={C.previsione} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>

      <Titoletto>Entrate e uscite previste</Titoletto>
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-300">
            <th className={TH_L}>Orizzonte</th>
            <th className={TH}>Entrate</th>
            <th className={TH}>Uscite</th>
            <th className={TH}>Flusso netto</th>
            <th className={TH}>Liquidità finale</th>
          </tr>
        </thead>
        <tbody>
          {t.horizons.map((h) => (
            <tr key={h.days} className="border-b border-slate-100">
              <td className="px-2 py-1">{h.label} <span className="text-slate-400">(al {dataIt(h.end)})</span></td>
              <td className={`${TD} text-emerald-700`}>{euro(h.totaleEntrate)}</td>
              <td className={`${TD} text-red-700`}>{euro(h.totaleUscite)}</td>
              <td className={TD}>{euro(h.cashFlow)}</td>
              <td className={`${TD} font-semibold`}>{euro(h.liquiditaFinale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {t.scaduti.righe > 0 && (
        <p className="mt-2 text-slate-600">
          Scaduti non registrati: incassi {euro(t.scaduti.entrate)}, pagamenti {euro(t.scaduti.uscite)}. Nella previsione sono considerati a oggi.
        </p>
      )}
    </>
  )
}

function Banche({ v }: { v: BankingView }): React.JSX.Element {
  const banca = (uuid: string): string => v.banks.find((b) => b.uuid === uuid)?.name ?? '—'
  return (
    <>
      <div className="grid grid-cols-4 gap-2.5">
        <Tile label="Affidamenti accordati" valore={euro(v.affidamenti.accordato)} />
        <Tile
          label="Utilizzati"
          valore={euro(v.affidamenti.utilizzato)}
          nota={v.affidamenti.utilizzoPercent === null ? undefined : `${percent(v.affidamenti.utilizzoPercent, 0)} dell'accordato`}
          tono={v.affidamenti.utilizzoPercent === null ? null : v.affidamenti.utilizzoPercent < 80 ? 'ok' : 'ko'}
        />
        <Tile label="Debito residuo finanziamenti" valore={euro(v.debitoResiduo)} />
        <Tile label="Rate dei prossimi 12 mesi" valore={euro(v.rate12Mesi)} nota={`${euro(v.rataMensile)} al mese`} />
      </div>

      {v.lines.length > 0 && (
        <>
          <Titoletto>Linee di credito</Titoletto>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-300">
                <th className={TH_L}>Linea</th>
                <th className={TH_L}>Banca</th>
                <th className={TH}>Accordato</th>
                <th className={TH}>Utilizzato</th>
                <th className={TH}>Tasso</th>
                <th className={TH}>Scadenza</th>
              </tr>
            </thead>
            <tbody>
              {v.lines.map((l) => (
                <tr key={l.uuid} className="border-b border-slate-100">
                  <td className="px-2 py-1">{l.label} <span className="text-slate-400">· {CREDIT_LINE_LABELS[l.kind]}</span></td>
                  <td className="px-2 py-1">{banca(l.bank_uuid)}</td>
                  <td className={TD}>{euro(l.granted_cents)}</td>
                  <td className={TD}>{euro(l.used_cents)}</td>
                  <td className={TD}>{l.annual_rate_percent === null ? '—' : percent(l.annual_rate_percent, 2)}</td>
                  <td className={TD}>{dataIt(l.expiry_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {v.loans.length > 0 && (
        <>
          <Titoletto>Finanziamenti</Titoletto>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-300">
                <th className={TH_L}>Finanziamento</th>
                <th className={TH_L}>Banca</th>
                <th className={TH}>Importo</th>
                <th className={TH}>Tasso</th>
                <th className={TH}>Residuo</th>
                <th className={TH}>Prossima rata</th>
                <th className={TH}>Fine</th>
              </tr>
            </thead>
            <tbody>
              {v.loans.map((l) => (
                <tr key={l.uuid} className="border-b border-slate-100">
                  <td className="px-2 py-1">
                    {l.label}
                    <span className="block text-[8.5px] text-slate-400">{LOAN_LABELS[l.kind]}</span>
                  </td>
                  <td className="px-2 py-1">{banca(l.bank_uuid)}</td>
                  <td className={TD}>{euro(l.principal_cents)}</td>
                  <td className={TD}>{percent(l.annual_rate_percent, 2)}</td>
                  <td className={`${TD} font-semibold`}>{euro(l.status.residual)}</td>
                  <td className={TD}>
                    {l.status.next ? (
                      <>
                        {euro(l.status.next.total)}
                        <span className="block text-[8.5px] text-slate-400">{dataIt(l.status.next.date)}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={TD}>{dataIt(l.status.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
