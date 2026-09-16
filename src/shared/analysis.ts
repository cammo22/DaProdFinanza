import type {
  BalanceSheet,
  CreditSummary,
  Installment,
  LoanStatus,
  IncomeAggregates,
  IncomeStatement,
  Ratios,
  Scheme,
  TreasuryForecast,
  WorkingCapitalNote,
  WorkingCapitalSnapshot
} from './engine'
import type {
  Bank,
  CreditLine,
  FiscalPeriod,
  Loan,
  Scenario,
  TreasuryItem,
  TreasurySettings
} from './types'

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

/**
 * Vista Capitale Circolante — AGENTS.md §10.5, docs/MODELLO_FINANZIARIO.md §6.
 * I confronti sono due, come nei mockup: le card guardano la fine dell'anno
 * precedente, la tabella degli indici lo stesso periodo dell'anno prima.
 */
export interface WorkingCapitalView {
  period: FiscalPeriod
  scenario: Scenario
  current: WorkingCapitalSnapshot
  previousYear: { label: string; snapshot: WorkingCapitalSnapshot } | null
  previousYearEnd: { label: string; snapshot: WorkingCapitalSnapshot } | null
  /** Fino a 24 mesi che terminano col periodo scelto, dal più vecchio. */
  series: WorkingCapitalPoint[]
  notes: WorkingCapitalNote[]
  aging: { openCents: number; overdueCents: number }
}

export interface WorkingCapitalPoint {
  period_uuid: string
  label: string
  dso: number | null
  dio: number | null
  dpo: number | null
  ccc: number | null
  /** Media mobile a 3 mesi del CCC. */
  cccMedia: number | null
  ccn: number
}

/** Vista Tesoreria — AGENTS.md §10.6. */
export interface TreasuryView extends TreasuryForecast {
  items: TreasuryItem[]
  settings: TreasurySettings
  /** Liquidità a fine mese dai bilanci a consuntivo, per la parte storica del grafico. */
  consuntivo: { label: string; date: string; liquidita: number }[]
  aging: { openCents: number; overdueCents: number }
  /** Affidamenti delle linee di credito, per la card "Affidamenti disponibili". */
  affidamenti: CreditSummary
}

/** Vista Banche e Finanziamenti — AGENTS.md §10.7. */
export interface BankingView {
  today: string
  banks: Bank[]
  lines: CreditLine[]
  loans: (Loan & { status: LoanStatus; schedule: Installment[] })[]
  /** Solo le linee di credito: accordato, utilizzato, disponibile. */
  affidamenti: CreditSummary
  /** Somma delle rate ricondotte al mese. */
  rataMensile: number
  debitoResiduo: number
  /** Rate dei prossimi 12 mesi, da oggi. */
  rate12Mesi: number
  /** Una riga per istituto: le linee più il debito residuo dei finanziamenti. */
  perBanca: {
    bank_uuid: string
    name: string
    accordato: number
    utilizzato: number
    disponibile: number
    /** Utilizzo delle sole linee a revoca; null se l'istituto non ne ha. */
    utilizzoPercent: number | null
  }[]
  /** Utilizzo per tipologia, per la ciambella. */
  perTipologia: { kind: string; label: string; utilizzato: number }[]
}
