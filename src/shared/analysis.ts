import type { BalanceSheet, IncomeStatement, Ratios, Scheme } from './engine'
import type { FiscalPeriod, Scenario } from './types'

/**
 * Il risultato completo dell'analisi di un periodo: è il payload che il
 * backend restituisce e che le schermate di §10.2-§10.4 consumano.
 *
 * Sta in un file a parte per non far dipendere `types.ts` dal motore: il
 * motore già dipende da `types.ts` per `AccountType`.
 */
export interface Analysis {
  period: FiscalPeriod
  scenario: Scenario
  scheme: Scheme
  /** Quanti conti hanno concorso al calcolo: zero conti non significa zero euro. */
  accountCount: number
  incomeStatement: IncomeStatement
  /** Gli altri due schemi di §3, per la vista alternativa. */
  alternativeSchemes: IncomeStatement[]
  balanceSheet: BalanceSheet
  ratios: Ratios
}

/** Un punto della serie storica: tutti gli importi in centesimi. */
export interface SeriesPoint {
  period_uuid: string
  label: string
  ricavi: number
  /** Costi operativi prima degli ammortamenti: ricavi − costi = EBITDA. */
  costiTotali: number
  ebitda: number
  utile: number
  liquidita: number
}
