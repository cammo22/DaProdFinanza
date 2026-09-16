import { addMonths, parseDate } from './treasury'

/**
 * Banche e finanziamenti — AGENTS.md §10.7.
 *
 * Il modello del consulente non tratta i piani di ammortamento: qui c'è la
 * matematica finanziaria standard, con le scelte dichiarate.
 *
 * - **Ammortamento francese** (rata costante) o **italiano** (quota capitale
 *   costante), con eventuale **preammortamento**: le prime rate pagano solo
 *   gli interessi.
 * - **Leasing**: rata costante con **riscatto** finale; l'eventuale maxi-canone
 *   iniziale si indica come rata a parte (un movimento manuale).
 * - **Tasso nominale annuo** diviso per il numero di rate dell'anno: è la
 *   convenzione dei piani bancari italiani, non il tasso effettivo.
 * - **Arrotondamento al centesimo** su ogni rata; l'ultima assorbe i residui,
 *   così il debito si chiude esattamente a zero (o al riscatto).
 * - **Le rate già scadute si considerano pagate**: in Italia sono quasi sempre
 *   addebitate in automatico. Il debito residuo di oggi è quello dopo l'ultima
 *   rata scaduta.
 */

export type LoanKind = 'mutuo' | 'finanziamento' | 'leasing'
export type Amortization = 'francese' | 'italiano'
export type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

export const FREQUENCY_MONTHS: Record<Frequency, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  monthly: 'Mensile',
  quarterly: 'Trimestrale',
  semiannual: 'Semestrale',
  annual: 'Annuale'
}

export interface LoanInput {
  uuid: string
  kind: LoanKind
  label: string
  principal_cents: number
  /** Tasso nominale annuo in percentuale, es. 4.5. */
  annual_rate_percent: number
  /** Data della prima rata. */
  first_due_date: string
  /** Numero totale di rate, preammortamento compreso. */
  installments: number
  frequency: Frequency
  /** Rate di solo interessi all'inizio. */
  grace_installments: number
  amortization: Amortization
  /** Valore di riscatto del leasing, che resta da pagare dopo l'ultima rata. */
  balloon_cents: number
}

export interface Installment {
  number: number
  date: string
  capital: number
  interest: number
  total: number
  /** Debito residuo dopo questa rata. */
  residual: number
  /** Rata di solo interessi. */
  grace: boolean
}

export interface LoanValidation {
  ok: boolean
  error?: string
}

export function validateLoan(loan: LoanInput): LoanValidation {
  if (!Number.isInteger(loan.principal_cents) || loan.principal_cents <= 0) {
    return { ok: false, error: "L'importo finanziato deve essere maggiore di zero." }
  }
  if (!Number.isFinite(loan.annual_rate_percent) || loan.annual_rate_percent < 0 || loan.annual_rate_percent > 50) {
    return { ok: false, error: 'Il tasso annuo deve stare fra 0 e 50%.' }
  }
  if (!Number.isInteger(loan.installments) || loan.installments < 1 || loan.installments > 600) {
    return { ok: false, error: 'Il numero di rate deve stare fra 1 e 600.' }
  }
  if (!Number.isInteger(loan.grace_installments) || loan.grace_installments < 0 || loan.grace_installments >= loan.installments) {
    return { ok: false, error: 'Le rate di preammortamento devono essere meno delle rate totali.' }
  }
  if (!Number.isInteger(loan.balloon_cents) || loan.balloon_cents < 0 || loan.balloon_cents >= loan.principal_cents) {
    return { ok: false, error: "Il riscatto deve essere minore dell'importo finanziato." }
  }
  if (!(loan.frequency in FREQUENCY_MONTHS)) {
    return { ok: false, error: 'Periodicità non valida.' }
  }
  return { ok: true }
}

/** Il piano di ammortamento completo. */
export function schedule(loan: LoanInput): Installment[] {
  const check = validateLoan(loan)
  if (!check.ok) throw new Error(check.error)

  const step = FREQUENCY_MONTHS[loan.frequency]
  const i = loan.annual_rate_percent / 100 / (12 / step)
  const amortizing = loan.installments - loan.grace_installments
  const balloon = loan.balloon_cents
  const out: Installment[] = []
  let residual = loan.principal_cents

  // Rata costante del francese, riscatto compreso: il valore attuale delle
  // rate più quello del riscatto deve dare il capitale.
  let rataFrancese = 0
  if (loan.amortization === 'francese') {
    if (i === 0) {
      rataFrancese = (loan.principal_cents - balloon) / amortizing
    } else {
      const v = Math.pow(1 + i, -amortizing)
      rataFrancese = ((loan.principal_cents - balloon * v) * i) / (1 - v)
    }
  }
  const quotaItaliana = (loan.principal_cents - balloon) / amortizing

  for (let n = 1; n <= loan.installments; n++) {
    const date = addMonths(loan.first_due_date, (n - 1) * step)
    const interest = Math.round(residual * i)
    const grace = n <= loan.grace_installments
    let capital: number

    if (grace) {
      capital = 0
    } else if (n === loan.installments) {
      // L'ultima rata chiude il debito al centesimo.
      capital = residual - balloon
    } else if (loan.amortization === 'francese') {
      capital = Math.round(rataFrancese) - interest
    } else {
      capital = Math.round(quotaItaliana)
    }

    residual -= capital
    out.push({ number: n, date, capital, interest, total: capital + interest, residual, grace })
  }

  return out
}

export interface LoanStatus {
  /** Debito residuo dopo l'ultima rata scaduta (il capitale, se non ne è scaduta nessuna). */
  residual: number
  paidInstallments: number
  next: Installment | null
  last: Installment | null
  /** Rata ricondotta al mese: una trimestrale da 3.000 € vale 1.000 € al mese. */
  monthlyEquivalent: number
  /** Scadenza dell'ultima rata. */
  endDate: string
}

export function loanStatus(loan: LoanInput, today: string, plan = schedule(loan)): LoanStatus {
  const t = parseDate(today)
  const paid = plan.filter((r) => parseDate(r.date) <= t)
  const next = plan.find((r) => parseDate(r.date) > t) ?? null
  const last = plan[plan.length - 1]!
  // Dopo il riscatto di un leasing non resta più niente da pagare.
  const riscattato = loan.balloon_cents > 0 && parseDate(riscattoDate(loan, last)) <= t
  return {
    residual: riscattato
      ? 0
      : paid.length > 0
        ? paid[paid.length - 1]!.residual
        : loan.principal_cents,
    paidInstallments: paid.length,
    next,
    last: plan[plan.length - 1] ?? null,
    monthlyEquivalent: next ? Math.round(next.total / FREQUENCY_MONTHS[loan.frequency]) : 0,
    endDate: plan[plan.length - 1]!.date
  }
}

/**
 * Rate (capitale + interessi) con scadenza nei 12 mesi successivi a `from`,
 * escluso `from`: il denominatore del DSCR (docs/MODELLO_FINANZIARIO.md §5).
 * Il riscatto di un leasing che cade nella finestra è compreso.
 */
export function debtServiceNext12Months(loans: LoanInput[], from: string): number {
  const start = parseDate(from)
  const end = parseDate(addMonths(from, 12))
  let total = 0
  for (const loan of loans) {
    const plan = schedule(loan)
    for (const r of plan) {
      const t = parseDate(r.date)
      if (t > start && t <= end) total += r.total
    }
    const last = plan[plan.length - 1]
    if (loan.balloon_cents > 0 && last) {
      const t = parseDate(riscattoDate(loan, last))
      if (t > start && t <= end) total += loan.balloon_cents
    }
  }
  return total
}

/** Il riscatto si paga una rata dopo l'ultima. */
function riscattoDate(loan: LoanInput, last: Installment): string {
  return addMonths(last.date, FREQUENCY_MONTHS[loan.frequency])
}

/**
 * Le rate come movimenti di tesoreria (`source = 'finanziamento'`): alimentano
 * la previsione di cassa, come chiede §10.7. Le rate scadute sono pagate, quindi
 * non generano movimenti.
 */
export function loanTreasuryItems(loan: LoanInput, today: string) {
  const t = parseDate(today)
  const plan = schedule(loan)
  const categoria = 'Rate finanziamenti'
  const items = plan
    .filter((r) => parseDate(r.date) > t)
    .map((r) => ({
      uuid: `${loan.uuid}#${r.number}`,
      direction: 'out' as const,
      source: 'finanziamento' as const,
      category: categoria,
      description: `${loan.label} — rata ${r.number}/${loan.installments}`,
      due_date: r.date,
      amount_cents: r.total,
      paid_cents: 0,
      paid_date: null,
      recurrence: 'none' as const,
      recurrence_until: null
    }))
  const last = plan[plan.length - 1]
  if (loan.balloon_cents > 0 && last) {
    const date = riscattoDate(loan, last)
    if (parseDate(date) > t) {
      items.push({
        uuid: `${loan.uuid}#riscatto`,
        direction: 'out',
        source: 'finanziamento',
        category: categoria,
        description: `${loan.label} — riscatto`,
        due_date: date,
        amount_cents: loan.balloon_cents,
        paid_cents: 0,
        paid_date: null,
        recurrence: 'none',
        recurrence_until: null
      })
    }
  }
  return items
}

// --- linee di credito -----------------------------------------------------------

export type CreditLineKind = 'fido_cassa' | 'anticipo_fatture' | 'carta' | 'altro'

export const CREDIT_LINE_LABELS: Record<CreditLineKind, string> = {
  fido_cassa: 'Fido di cassa',
  anticipo_fatture: 'Anticipo fatture / SBF',
  carta: 'Carte di credito',
  altro: 'Altre linee'
}

export const LOAN_LABELS: Record<LoanKind, string> = {
  mutuo: 'Mutui',
  finanziamento: 'Finanziamenti',
  leasing: 'Leasing'
}

export interface CreditLineInput {
  kind: CreditLineKind
  granted_cents: number
  used_cents: number
}

export interface CreditSummary {
  accordato: number
  utilizzato: number
  disponibile: number
  /** Utilizzo in percentuale sull'accordato, null senza accordato. */
  utilizzoPercent: number | null
}

export function creditSummary(lines: CreditLineInput[]): CreditSummary {
  const accordato = lines.reduce((s, l) => s + l.granted_cents, 0)
  const utilizzato = lines.reduce((s, l) => s + l.used_cents, 0)
  return {
    accordato,
    utilizzato,
    // Si somma linea per linea: lo sconfinamento su una carta non toglie
    // disponibilità al fido di cassa di un'altra linea.
    disponibile: lines.reduce((s, l) => s + Math.max(0, l.granted_cents - l.used_cents), 0),
    utilizzoPercent: accordato > 0 ? (utilizzato / accordato) * 100 : null
  }
}

/** Soglia oltre la quale l'utilizzo degli affidamenti diventa un avviso (§10.2). */
export const SOGLIA_UTILIZZO_AFFIDAMENTI = 80
