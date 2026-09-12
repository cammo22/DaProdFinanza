import type { BalanceSheet, IncomeAggregates, IncomeStatement, Ratios, Scheme } from './engine'
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
  /** Le colonne di confronto di §10.3. */
  comparison: IncomeComparison
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

/**
 * Le colonne di confronto del Conto Economico — AGENTS.md §10.3.
 *
 * Il prospetto del consulente affianca quattro letture dello stesso periodo:
 * il mese, il progressivo da inizio anno, il budget e lo stesso periodo
 * dell'anno prima. Una colonna che non ha dati resta `null` e la UI la nasconde:
 * una colonna di zeri sembrerebbe un'azienda a fatturato zero.
 */
export type ComparisonKey = 'current' | 'ytd' | 'budget' | 'previousYear'

export interface ComparisonColumn {
  key: ComparisonKey
  label: string
  /** Aggregati del periodo, oppure null se per quella colonna non ci sono dati. */
  aggregates: IncomeAggregates | null
}

export interface IncomeComparison {
  columns: ComparisonColumn[]
}
