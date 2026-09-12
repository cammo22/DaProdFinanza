import {
  balanceSheet,
  incomeStatement,
  periodDays,
  ratios,
  DEFAULT_SCHEME,
  SCHEMES,
  type EngineAccount,
  type Scheme
} from '@shared/engine'
import type { Analysis, SeriesPoint } from '@shared/analysis'
import type { FiscalPeriod, Scenario } from '@shared/types'
import { getDatabase } from '../../db'
import { HttpError } from '../http-error'
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
  return getDatabase()
    .prepare(
      `SELECT * FROM fiscal_periods WHERE company_uuid = ? AND deleted = 0
        ORDER BY year DESC, ifnull(month, 0) DESC`
    )
    .all(companyUuid) as FiscalPeriod[]
}

function getPeriod(companyUuid: string, periodUuid: string): FiscalPeriod {
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
  options: { scenario?: Scenario; limit?: number } = {}
): SeriesPoint[] {
  getCompany(companyUuid)
  const scenario = options.scenario ?? 'actual'
  const limit = options.limit ?? 24

  const periods = listPeriods(companyUuid)
    .filter((p) => p.period_type === 'month')
    .concat(listPeriods(companyUuid).filter((p) => p.period_type === 'year'))
    .slice(0, limit)
    // Dal più vecchio al più recente: è l'ordine in cui si legge un grafico.
    .sort((a, b) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0))

  return periods
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

export function analyse(
  companyUuid: string,
  periodUuid: string,
  options: { scenario?: Scenario; scheme?: Scheme; debtServiceCents?: number | null } = {}
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
      debtServiceCents: options.debtServiceCents ?? null
    })
  }
}
