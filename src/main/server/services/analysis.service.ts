import {
  balanceSheet,
  incomeStatement,
  periodDays,
  ratios,
  DEFAULT_SCHEME,
  SCHEMES,
  type EngineAccount,
  type IncomeAggregates,
  type Scheme
} from '@shared/engine'
import type { Analysis, IncomeComparison, SeriesPoint } from '@shared/analysis'
import type { FiscalPeriod, Scenario } from '@shared/types'
import { getDatabase } from '../../db'
import { HttpError } from '../http-error'
import { debtServiceFor } from './banks.service'
import { getCompany } from './companies.service'

/**
 * Il ponte fra i saldi sul database e il motore di calcolo.
 *
 * Il motore (`@shared/engine`) è fatto di funzioni pure: non sa che esiste un
 * database. Qui si leggono i conti di un periodo e si passano al motore, così
 * le formule restano verificabili in isolamento dai test.
 */

export function listPeriods(companyUuid: string): FiscalPeriod[] {
  getCompany(companyUuid)
  const righe = getDatabase()
    .prepare(
      `SELECT p.*,
              (SELECT group_concat(DISTINCT b.scenario) FROM account_balances b
                WHERE b.period_uuid = p.uuid AND b.deleted = 0) AS scenarios
         FROM fiscal_periods p
        WHERE p.company_uuid = ? AND p.deleted = 0
        ORDER BY p.year DESC, ifnull(p.month, 0) DESC`
    )
    .all(companyUuid) as (Omit<FiscalPeriod, 'scenarios'> & { scenarios: string | null })[]

  // Quali scenari hanno davvero dei saldi: il periodo più recente può essere un
  // mese di solo budget, e la UI non deve aprire su una schermata vuota.
  return righe.map((riga) => ({
    ...riga,
    scenarios: riga.scenarios ? (riga.scenarios.split(',') as Scenario[]) : []
  }))
}

/** Ultimo giorno di un periodo contabile, `YYYY-MM-DD`. */
export function periodEnd(year: number, month: number | null): string {
  const m = month ?? 12
  const d = month === null ? 31 : periodDays(year, month)
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function getPeriod(companyUuid: string, periodUuid: string): FiscalPeriod {
  const period = getDatabase()
    .prepare('SELECT * FROM fiscal_periods WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(periodUuid, companyUuid) as FiscalPeriod | undefined
  if (!period) throw new HttpError(404, 'Periodo non trovato per questa azienda.')
  return period
}

/** I conti con il loro saldo in un periodo, nella forma che il motore si aspetta. */
export function engineAccounts(
  companyUuid: string,
  periodUuid: string,
  scenario: Scenario
): EngineAccount[] {
  return getDatabase()
    .prepare(
      `SELECT a.code, a.name, a.section_code, a.account_type, a.detail_tag, b.amount_cents
         FROM account_balances b
         JOIN accounts a ON a.uuid = b.account_uuid
        WHERE b.company_uuid = ? AND b.period_uuid = ? AND b.scenario = ?
          AND b.deleted = 0 AND a.deleted = 0 AND a.active = 1`
    )
    .all(companyUuid, periodUuid, scenario) as EngineAccount[]
}

/**
 * Serie storica per i grafici a 12 mesi di §10.2 e §10.3.
 *
 * "Costi totali" qui sono i costi operativi prima degli ammortamenti: così
 * `ricavi − costi = EBITDA` esattamente, e le tre linee del grafico si leggono
 * senza doverci credere sulla parola.
 */
export function series(
  companyUuid: string,
  options: { scenario?: Scenario; limit?: number; until?: FiscalPeriod } = {}
): SeriesPoint[] {
  getCompany(companyUuid)
  const scenario = options.scenario ?? 'actual'
  const limit = options.limit ?? 24

  // Mesi e anni non si mescolano sullo stesso asse: un punto annuale in mezzo
  // ai mesi varrebbe dodici volte gli altri. Gli anni si usano solo se non c'è
  // nessun mese. Il limite si applica dopo aver scartato i periodi senza saldi
  // per lo scenario, altrimenti i mesi di solo budget rubano posto alla storia.
  const tutti = listPeriods(companyUuid).filter((p) => p.scenarios?.includes(scenario))
  const mesi = tutti.filter((p) => p.period_type === 'month')
  const until = options.until
  const scelti = (mesi.length > 0 ? mesi : tutti.filter((p) => p.period_type === 'year'))
    .filter(
      (p) =>
        !until ||
        p.year * 100 + (p.month ?? 12) <= until.year * 100 + (until.month ?? 12)
    )
    .slice(0, limit)
    // Dal più vecchio al più recente: è l'ordine in cui si legge un grafico.
    .sort((a, b) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0))

  return scelti
    .map((period) => {
      const accounts = engineAccounts(companyUuid, period.uuid, scenario)
      if (accounts.length === 0) return null
      const income = incomeStatement(accounts, DEFAULT_SCHEME).aggregates
      const balance = balanceSheet(accounts)
      return {
        period_uuid: period.uuid,
        label: period.label,
        ricavi: income.ricaviNetti,
        costiTotali: income.costiVariabili + income.costiFissi,
        ebitda: income.ebitda,
        utile: income.utile,
        liquidita: balance.liquiditaImmediate
      }
    })
    .filter((point): point is SeriesPoint => point !== null)
}

/**
 * EBITDA degli ultimi 12 mesi che terminano col periodo — §5, per PFN/EBITDA e
 * DSCR. Su un periodo annuale non serve (`undefined`); su un mese servono
 * tutti e dodici i mesi precedenti, altrimenti `null`: meglio un indice
 * indefinito che uno calcolato su un anno a metà.
 */
function ebitdaUltimi12Mesi(
  companyUuid: string,
  period: FiscalPeriod,
  scenario: Scenario
): number | null | undefined {
  if (period.month === null) return undefined
  const periodi = listPeriods(companyUuid)
  let somma = 0
  for (let i = 0; i < 12; i++) {
    const indice = period.year * 12 + (period.month - 1) - i
    const anno = Math.floor(indice / 12)
    const mese = (indice % 12) + 1
    const trovato = periodi.find(
      (p) => p.period_type === 'month' && p.year === anno && p.month === mese
    )
    if (!trovato) return null
    const conti = engineAccounts(companyUuid, trovato.uuid, scenario)
    if (conti.length === 0) return null
    somma += incomeStatement(conti, DEFAULT_SCHEME).aggregates.ebitda
  }
  return somma
}

export function analyse(
  companyUuid: string,
  periodUuid: string,
  options: { scenario?: Scenario; scheme?: Scheme } = {}
): Analysis {
  getCompany(companyUuid)
  const period = getPeriod(companyUuid, periodUuid)
  const scenario = options.scenario ?? 'actual'
  const scheme = options.scheme ?? DEFAULT_SCHEME

  if (!SCHEMES.includes(scheme)) {
    throw new HttpError(400, `Schema di riclassificazione non riconosciuto: "${scheme}".`)
  }

  const accounts = engineAccounts(companyUuid, periodUuid, scenario)
  const statement = incomeStatement(accounts, scheme)
  const balance = balanceSheet(accounts)

  return {
    period,
    scenario,
    scheme,
    accountCount: accounts.length,
    incomeStatement: statement,
    alternativeSchemes: SCHEMES.filter((s) => s !== scheme).map((s) => incomeStatement(accounts, s)),
    balanceSheet: balance,
    ratios: ratios({
      accounts,
      income: statement.aggregates,
      balance,
      days: periodDays(period.year, period.month),
      // §5: le rate attese nei 12 mesi successivi — alla fine del periodo
      // analizzato, così il DSCR di un periodo non cambia col giorno in cui
      // lo si guarda.
      debtServiceCents: debtServiceFor(companyUuid, periodEnd(period.year, period.month)),
      ebitdaLtmCents: ebitdaUltimi12Mesi(companyUuid, period, scenario)
    }),
    comparison: comparison(companyUuid, period, scenario, statement.aggregates)
  }
}

/**
 * Costruisce le colonne di confronto di §10.3.
 *
 * - **Periodo**: quello selezionato.
 * - **YTD**: la somma dei mesi da gennaio fino a quello selezionato. Ha senso
 *   solo su un periodo mensile: su un anno coinciderebbe col periodo stesso.
 * - **Budget**: lo stesso periodo, scenario budget.
 * - **Anno precedente**: lo stesso mese dell'anno prima, a consuntivo.
 *
 * Una colonna senza dati resta `null` invece di tornare zeri: zero e "non c'è"
 * su un bilancio sono due informazioni diverse.
 */
function aggregatesOf(companyUuid: string, periodUuid: string, scenario: Scenario) {
  const accounts = engineAccounts(companyUuid, periodUuid, scenario)
  return accounts.length === 0 ? null : incomeStatement(accounts, DEFAULT_SCHEME).aggregates
}

export function findPeriod(
  periods: FiscalPeriod[],
  year: number,
  month: number | null
): FiscalPeriod | undefined {
  return periods.find(
    (p) => p.year === year && (p.month ?? null) === month && p.period_type === (month === null ? 'year' : 'month')
  )
}

export function comparison(
  companyUuid: string,
  period: FiscalPeriod,
  scenario: Scenario,
  current: IncomeAggregates
): IncomeComparison {
  const periods = listPeriods(companyUuid)

  // YTD: somma dei mesi da gennaio al mese selezionato, compreso.
  let ytd: IncomeAggregates | null = null
  if (period.month !== null) {
    const mesi = periods.filter(
      (p) => p.period_type === 'month' && p.year === period.year && (p.month ?? 0) <= period.month!
    )
    const conti = mesi.flatMap((p) => engineAccounts(companyUuid, p.uuid, scenario))
    if (conti.length > 0) ytd = incomeStatement(conti, DEFAULT_SCHEME).aggregates
  }

  const budgetPeriod = scenario === 'budget' ? null : period
  const annoPrima = findPeriod(periods, period.year - 1, period.month)

  return {
    columns: [
      { key: 'current', label: period.label, aggregates: current },
      {
        key: 'ytd',
        label: period.month === null ? 'Anno' : `YTD ${period.year}`,
        aggregates: ytd
      },
      {
        key: 'budget',
        label: `Budget ${period.year}`,
        aggregates: budgetPeriod ? aggregatesOf(companyUuid, budgetPeriod.uuid, 'budget') : null
      },
      {
        key: 'previousYear',
        label: annoPrima ? annoPrima.label : `${period.year - 1}`,
        aggregates: annoPrima ? aggregatesOf(companyUuid, annoPrima.uuid, 'actual') : null
      }
    ]
  }
}
