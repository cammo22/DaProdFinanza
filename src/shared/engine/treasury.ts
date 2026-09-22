/**
 * Tesoreria e previsione di cassa — AGENTS.md §10.6.
 *
 * `docs/MODELLO_FINANZIARIO.md` non definisce la previsione di cassa: le regole
 * qui sotto sono scelte di implementazione, dichiarate e da validare col
 * consulente.
 *
 * 1. **La previsione è una somma di movimenti datati.** Nessuna proiezione
 *    statistica: entrano le scadenze aperte dello scadenziario, le previsioni
 *    manuali (anche ricorrenti) e — dalla Fase 6 — le rate dei finanziamenti.
 *    Ogni euro della previsione si può ricondurre a una riga.
 * 2. **La liquidità di partenza** è l'ultimo saldo noto (inserito a mano, o le
 *    liquidità immediate dell'ultimo bilancio a consuntivo), più gli incassi e
 *    i pagamenti registrati dopo quella data.
 * 3. **Le scadenze già passate e non saldate** non spariscono: entrano oggi,
 *    marcate come scadute. Un credito scaduto è ancora un incasso atteso, e un
 *    debito scaduto è ancora un'uscita — anzi, la più urgente.
 * 4. **Una previsione manuale passata** non si sposta a oggi: era una stima, e
 *    il consuntivo l'ha superata.
 *
 * Le date sono stringhe `YYYY-MM-DD` e i calcoli si fanno in UTC, così un
 * cambio d'ora non sposta un pagamento al giorno prima.
 */

export type Direction = 'in' | 'out'
/** `personale` e `fiscale` sono calcolati (stipendi, F24, imposte): mai scritti nello scadenziario. */
export type TreasurySource = 'scadenziario' | 'manuale' | 'finanziamento' | 'personale' | 'fiscale'
export type Recurrence = 'none' | 'monthly'

export interface TreasuryItemInput {
  uuid: string
  direction: Direction
  source: TreasurySource
  category: string
  description: string
  counterparty?: string | null
  due_date: string
  amount_cents: number
  /** Quanto è già stato incassato o pagato. */
  paid_cents: number
  /** Data dell'ultimo incasso o pagamento registrato. */
  paid_date?: string | null
  recurrence: Recurrence
  /** Ultima data utile di una ricorrenza; null = fino alla fine dell'orizzonte. */
  recurrence_until?: string | null
}

export interface OpeningCash {
  cents: number
  /** Data a cui il saldo si riferisce. */
  date: string
  origin: 'manuale' | 'bilancio'
  /** Da dove arriva, in parole: "saldo inserito il …", "bilancio di Agosto 2026". */
  label: string
}

export interface Flow {
  item_uuid: string
  date: string
  direction: Direction
  source: TreasurySource
  category: string
  description: string
  cents: number
  /** Scadenza passata e non saldata, spostata a oggi. */
  overdue: boolean
  /** Giorni di ritardo, per le scadenze scadute. */
  overdueDays: number
}

// --- date --------------------------------------------------------------------

const DAY = 86_400_000

export function parseDate(value: string): number {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1)
}

export function formatDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  return formatDate(parseDate(date) + days * DAY)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / DAY)
}

export function endOfMonth(date: string): string {
  const t = new Date(parseDate(date))
  return formatDate(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0))
}

/** Stesso giorno, `months` mesi dopo; il 31 diventa l'ultimo del mese se serve. */
export function addMonths(date: string, months: number): string {
  const t = new Date(parseDate(date))
  const day = t.getUTCDate()
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + months + 1, 0)).getUTCDate()
  return formatDate(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + months, Math.min(day, last)))
}

// --- condizioni di pagamento ---------------------------------------------------

/**
 * Condizioni di pagamento del foglio DICTIONARY (§8): RD, DF, FM. Il file non
 * le spiega; la lettura adottata è quella d'uso comune, da confermare:
 *
 * - **RD** rimessa diretta: alla data del documento, più gli eventuali giorni.
 * - **DF** data fattura: data del documento + giorni.
 * - **FM** fine mese: data del documento + giorni, poi a fine mese
 *   ("30 gg DF FM" → fine del mese successivo alla fattura).
 */
export type PaymentTerms = 'RD' | 'DF' | 'FM'

export const PAYMENT_TERMS: { id: PaymentTerms; label: string }[] = [
  { id: 'RD', label: 'Rimessa diretta' },
  { id: 'DF', label: 'Data fattura' },
  { id: 'FM', label: 'Data fattura fine mese' }
]

export const PAYMENT_DAYS = [0, 30, 60, 90, 120] as const

export function dueDate(documentDate: string, terms: PaymentTerms, days: number): string {
  const base = addDays(documentDate, days)
  return terms === 'FM' ? endOfMonth(base) : base
}

// --- flussi --------------------------------------------------------------------

/** Quanto resta da incassare o pagare. */
export function residual(item: Pick<TreasuryItemInput, 'amount_cents' | 'paid_cents'>): number {
  return Math.max(0, item.amount_cents - item.paid_cents)
}

/**
 * Trasforma le righe in movimenti datati fra oggi e `until`, compresi.
 * Le ricorrenze si espandono mese per mese; le scadenze passate e aperte
 * entrano oggi.
 */
export function expandFlows(items: TreasuryItemInput[], today: string, until: string): Flow[] {
  const flows: Flow[] = []
  const end = parseDate(until)
  const now = parseDate(today)

  for (const item of items) {
    if (item.recurrence === 'monthly') {
      const stop = item.recurrence_until ? Math.min(parseDate(item.recurrence_until), end) : end
      for (let k = 0; k < 600; k++) {
        const date = addMonths(item.due_date, k)
        const t = parseDate(date)
        if (t > stop) break
        if (t < now) continue
        flows.push(flow(item, date, item.amount_cents, false, 0))
      }
      continue
    }

    const open = residual(item)
    if (open === 0) continue
    const t = parseDate(item.due_date)
    if (t > end) continue
    if (t < now) {
      // Una stima passata non si trascina; una scadenza vera sì.
      if (item.source === 'manuale') continue
      flows.push(flow(item, today, open, true, daysBetween(item.due_date, today)))
    } else {
      flows.push(flow(item, item.due_date, open, false, 0))
    }
  }

  return flows.sort((a, b) => parseDate(a.date) - parseDate(b.date))
}

function flow(
  item: TreasuryItemInput,
  date: string,
  cents: number,
  overdue: boolean,
  overdueDays: number
): Flow {
  return {
    item_uuid: item.uuid,
    date,
    direction: item.direction,
    source: item.source,
    category: item.category,
    description: item.description,
    cents,
    overdue,
    overdueDays
  }
}

/**
 * Liquidità a oggi: il saldo di partenza più i movimenti registrati dopo la sua
 * data. Un incasso parziale conta per la parte incassata, alla data
 * dell'ultimo incasso registrato.
 */
export function cashToday(opening: OpeningCash, items: TreasuryItemInput[], today: string): number {
  const from = parseDate(opening.date)
  const to = parseDate(today)
  let cents = opening.cents
  for (const item of items) {
    if (item.recurrence !== 'none' || !item.paid_date || item.paid_cents <= 0) continue
    const t = parseDate(item.paid_date)
    if (t <= from || t > to) continue
    cents += item.direction === 'in' ? item.paid_cents : -item.paid_cents
  }
  return cents
}

// --- previsione ----------------------------------------------------------------

export const HORIZONS = [7, 30, 60, 90, 180] as const

export interface HorizonForecast {
  days: number
  label: string
  end: string
  liquiditaIniziale: number
  entrate: Record<string, number>
  uscite: Record<string, number>
  totaleEntrate: number
  totaleUscite: number
  cashFlow: number
  liquiditaFinale: number
}

export interface ForecastPoint {
  date: string
  liquidita: number
}

export interface TreasuryForecast {
  today: string
  opening: OpeningCash
  liquiditaOggi: number
  horizons: HorizonForecast[]
  /** Categorie presenti, nell'ordine in cui la tabella le mostra. */
  categorieEntrate: string[]
  categorieUscite: string[]
  /** Saldo giorno per giorno a passo settimanale, oggi compreso. */
  curve: ForecastPoint[]
  scaduti: { entrate: number; uscite: number; righe: number }
  /** Soglia minima di liquidità, se impostata. */
  sogliaMinima: number | null
  /** Primo giorno in cui la liquidità prevista scende sotto la soglia (o sotto zero). */
  tensione: { date: string; days: number; liquidita: number; soglia: number } | null
  flows: Flow[]
}

const horizonLabel = (days: number): string =>
  days === 7 ? '7 giorni' : days === 180 ? '6 mesi' : `${days} giorni`

export function forecast(input: {
  opening: OpeningCash
  items: TreasuryItemInput[]
  today: string
  minLiquidityCents?: number | null
  horizons?: readonly number[]
}): TreasuryForecast {
  const { opening, items, today } = input
  const horizons = input.horizons ?? HORIZONS
  const maxDays = Math.max(...horizons)
  const until = addDays(today, maxDays)
  const flows = expandFlows(items, today, until)
  const liquiditaOggi = cashToday(opening, items, today)

  const categorieEntrate = [...new Set(flows.filter((f) => f.direction === 'in').map((f) => f.category))]
  const categorieUscite = [...new Set(flows.filter((f) => f.direction === 'out').map((f) => f.category))]

  const horizonForecasts = horizons.map((days): HorizonForecast => {
    const end = addDays(today, days)
    const inside = flows.filter((f) => parseDate(f.date) <= parseDate(end))
    const entrate: Record<string, number> = {}
    const uscite: Record<string, number> = {}
    for (const f of inside) {
      const bucket = f.direction === 'in' ? entrate : uscite
      bucket[f.category] = (bucket[f.category] ?? 0) + f.cents
    }
    const totaleEntrate = Object.values(entrate).reduce((s, v) => s + v, 0)
    const totaleUscite = Object.values(uscite).reduce((s, v) => s + v, 0)
    return {
      days,
      label: horizonLabel(days),
      end,
      liquiditaIniziale: liquiditaOggi,
      entrate,
      uscite,
      totaleEntrate,
      totaleUscite,
      cashFlow: totaleEntrate - totaleUscite,
      liquiditaFinale: liquiditaOggi + totaleEntrate - totaleUscite
    }
  })

  // Curva giornaliera: serve per trovare il primo giorno sotto soglia, che un
  // campionamento settimanale potrebbe saltare.
  const soglia = input.minLiquidityCents ?? null
  const limite = soglia ?? 0
  const curve: ForecastPoint[] = []
  let saldo = liquiditaOggi
  let tensione: TreasuryForecast['tensione'] = null
  let indice = 0
  for (let d = 0; d <= maxDays; d++) {
    const date = addDays(today, d)
    const t = parseDate(date)
    while (indice < flows.length && parseDate(flows[indice]!.date) <= t) {
      const f = flows[indice]!
      saldo += f.direction === 'in' ? f.cents : -f.cents
      indice++
    }
    if (!tensione && saldo < limite) {
      tensione = { date, days: d, liquidita: saldo, soglia: limite }
    }
    if (d % 7 === 0 || d === maxDays) curve.push({ date, liquidita: saldo })
  }

  const scadute = flows.filter((f) => f.overdue)
  return {
    today,
    opening,
    liquiditaOggi,
    horizons: horizonForecasts,
    categorieEntrate,
    categorieUscite,
    curve,
    scaduti: {
      entrate: scadute.filter((f) => f.direction === 'in').reduce((s, f) => s + f.cents, 0),
      uscite: scadute.filter((f) => f.direction === 'out').reduce((s, f) => s + f.cents, 0),
      righe: scadute.length
    },
    sogliaMinima: soglia,
    tensione,
    flows
  }
}

/**
 * Crediti aperti dello scadenziario e quota scaduta da oltre `days` giorni:
 * alimenta le note del capitale circolante.
 */
export function receivablesAging(
  items: TreasuryItemInput[],
  today: string,
  days = 60
): { openCents: number; overdueCents: number } {
  let openCents = 0
  let overdueCents = 0
  for (const item of items) {
    if (item.source !== 'scadenziario' || item.direction !== 'in' || item.recurrence !== 'none') continue
    const open = residual(item)
    openCents += open
    if (daysBetween(item.due_date, today) > days) overdueCents += open
  }
  return { openCents, overdueCents }
}
