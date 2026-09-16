import {
  balanceSheet,
  dueDate,
  forecast,
  receivablesAging,
  type OpeningCash,
  type PaymentTerms
} from '@shared/engine'
import type { TreasuryView } from '@shared/analysis'
import type { TreasuryItem, TreasuryItemInput, TreasurySettings } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { HttpError } from '../http-error'
import { engineAccounts, listPeriods, periodEnd, series } from './analysis.service'
import { creditLinesSummary, loanTreasuryItemsFor } from './banks.service'
import { getCompany } from './companies.service'

/**
 * Tesoreria e scadenziario — AGENTS.md §10.6.
 *
 * Qui si leggono e scrivono le righe; la previsione la calcola il motore
 * (`@shared/engine/treasury`), che resta una funzione pura.
 */

/** La data di oggi nel fuso della macchina: un pagamento "di oggi" è di oggi in Italia. */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

function data(value: unknown, campo: string, obbligatoria = false): string | null {
  if (value === null || value === undefined || value === '') {
    if (obbligatoria) throw new HttpError(400, `${campo}: data obbligatoria.`)
    return null
  }
  if (typeof value !== 'string' || !DATA.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${campo}: data non valida (atteso AAAA-MM-GG).`)
  }
  return value
}

function testo(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t ? t : null
}

function centesimi(value: unknown, campo: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new HttpError(400, `${campo}: importo non valido.`)
  }
  return value
}

// --- righe ---------------------------------------------------------------------

export function listItems(companyUuid: string): TreasuryItem[] {
  getCompany(companyUuid)
  return getDatabase()
    .prepare(
      `SELECT * FROM treasury_items
        WHERE company_uuid = ? AND deleted = 0
        ORDER BY due_date, created_at`
    )
    .all(companyUuid) as TreasuryItem[]
}

function getItem(companyUuid: string, uuid: string): TreasuryItem {
  const item = getDatabase()
    .prepare('SELECT * FROM treasury_items WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(uuid, companyUuid) as TreasuryItem | undefined
  if (!item) throw new HttpError(404, 'Movimento non trovato.')
  return item
}

/** Valida e completa una riga: da un input parziale a una riga coerente. */
type ItemRow = Omit<
  TreasuryItem,
  'uuid' | 'company_uuid' | 'created_at' | 'updated_at' | 'synced' | 'deleted'
>

function normalize(input: TreasuryItemInput, base?: TreasuryItem): ItemRow {
  const merged = { ...base, ...input }

  const direction = merged.direction
  if (direction !== 'in' && direction !== 'out') {
    throw new HttpError(400, 'Indicare se è un incasso o un pagamento.')
  }
  const source = merged.source
  // Le rate dei finanziamenti le genera il modulo Banche, non si scrivono a mano.
  if (source !== 'scadenziario' && source !== 'manuale') {
    throw new HttpError(400, 'Origine del movimento non valida.')
  }

  const category = testo(merged.category)
  if (!category) throw new HttpError(400, 'La categoria è obbligatoria.')
  const description = testo(merged.description)
  if (!description) throw new HttpError(400, 'La descrizione è obbligatoria.')

  const terms = merged.payment_terms ?? null
  if (terms !== null && !['RD', 'DF', 'FM'].includes(terms)) {
    throw new HttpError(400, 'Condizione di pagamento non valida.')
  }
  const days = merged.payment_days ?? null
  if (days !== null && (!Number.isInteger(days) || days < 0)) {
    throw new HttpError(400, 'I giorni di pagamento devono essere un numero intero positivo.')
  }

  const documentDate = data(merged.document_date, 'Data documento')
  // La scadenza si ricava dalle condizioni se non è indicata a mano.
  let due = data(merged.due_date, 'Scadenza')
  if (!due && documentDate && terms) {
    due = dueDate(documentDate, terms as PaymentTerms, days ?? 0)
  }
  if (!due) throw new HttpError(400, 'Indicare la data di scadenza o la data del documento con le condizioni.')

  const amount = centesimi(merged.amount_cents, 'Importo')
  if (amount <= 0) throw new HttpError(400, "L'importo deve essere maggiore di zero.")
  const paid = centesimi(merged.paid_cents ?? 0, 'Importo pagato')
  if (paid < 0 || paid > amount) {
    throw new HttpError(400, "L'importo già pagato deve stare fra zero e il totale.")
  }
  const paidDate = paid > 0 ? (data(merged.paid_date, 'Data pagamento') ?? todayLocal()) : null

  const recurrence = merged.recurrence ?? 'none'
  if (recurrence !== 'none' && recurrence !== 'monthly') {
    throw new HttpError(400, 'Ricorrenza non valida.')
  }
  if (recurrence !== 'none' && source === 'scadenziario') {
    throw new HttpError(400, 'Una fattura dello scadenziario non si ripete: usa una previsione manuale.')
  }
  const until = recurrence === 'none' ? null : data(merged.recurrence_until, 'Fine ricorrenza')
  if (until && until < due) {
    throw new HttpError(400, 'La ricorrenza finisce prima di cominciare.')
  }

  return {
    direction,
    source,
    category,
    description,
    counterparty: testo(merged.counterparty),
    document_ref: testo(merged.document_ref),
    document_date: documentDate,
    payment_terms: terms as TreasuryItem['payment_terms'],
    payment_days: days,
    payment_method: testo(merged.payment_method),
    due_date: due,
    amount_cents: amount,
    paid_cents: recurrence === 'none' ? paid : 0,
    paid_date: recurrence === 'none' ? paidDate : null,
    recurrence,
    recurrence_until: until,
    notes: testo(merged.notes)
  }
}

export function createItem(companyUuid: string, input: TreasuryItemInput): TreasuryItem {
  getCompany(companyUuid)
  const row = normalize(input)
  const uuid = newUuid()
  const now = nowIso()
  getDatabase()
    .prepare(
      `INSERT INTO treasury_items (uuid, company_uuid, direction, source, category, description,
          counterparty, document_ref, document_date, payment_terms, payment_days, payment_method,
          due_date, amount_cents, paid_cents, paid_date, recurrence, recurrence_until, notes,
          created_at, updated_at, synced, deleted)
       VALUES (@uuid, @company_uuid, @direction, @source, @category, @description,
          @counterparty, @document_ref, @document_date, @payment_terms, @payment_days, @payment_method,
          @due_date, @amount_cents, @paid_cents, @paid_date, @recurrence, @recurrence_until, @notes,
          @now, @now, 0, 0)`
    )
    .run({ ...row, uuid, company_uuid: companyUuid, now })
  return getItem(companyUuid, uuid)
}

export function updateItem(companyUuid: string, uuid: string, input: TreasuryItemInput): TreasuryItem {
  const current = getItem(companyUuid, uuid)
  if (current.source === 'finanziamento') {
    throw new HttpError(409, 'Le rate dei finanziamenti si modificano dal modulo Banche.')
  }
  const row = normalize(input, current)
  getDatabase()
    .prepare(
      `UPDATE treasury_items SET direction = @direction, source = @source, category = @category,
          description = @description, counterparty = @counterparty, document_ref = @document_ref,
          document_date = @document_date, payment_terms = @payment_terms, payment_days = @payment_days,
          payment_method = @payment_method, due_date = @due_date, amount_cents = @amount_cents,
          paid_cents = @paid_cents, paid_date = @paid_date, recurrence = @recurrence,
          recurrence_until = @recurrence_until, notes = @notes, updated_at = @now, synced = 0
        WHERE uuid = @uuid`
    )
    .run({ ...row, uuid, now: nowIso() })
  return getItem(companyUuid, uuid)
}

/**
 * Registra un incasso o un pagamento, anche parziale. Senza importo salda il
 * residuo: è il caso più comune, "segna come pagata".
 */
export function registerPayment(
  companyUuid: string,
  uuid: string,
  input: { amount_cents?: number; date?: string }
): TreasuryItem {
  const item = getItem(companyUuid, uuid)
  if (item.recurrence !== 'none') {
    throw new HttpError(400, 'Una previsione ricorrente non si salda: modificala o eliminala.')
  }
  const residuo = item.amount_cents - item.paid_cents
  if (residuo <= 0) throw new HttpError(409, 'Il movimento risulta già saldato.')
  const importo = input.amount_cents === undefined ? residuo : centesimi(input.amount_cents, 'Importo')
  if (importo <= 0 || importo > residuo) {
    throw new HttpError(400, `L'importo deve stare fra 0,01 € e il residuo di ${(residuo / 100).toFixed(2)} €.`)
  }
  const date = data(input.date, 'Data') ?? todayLocal()
  getDatabase()
    .prepare(
      `UPDATE treasury_items SET paid_cents = paid_cents + ?, paid_date = ?, updated_at = ?, synced = 0
        WHERE uuid = ?`
    )
    .run(importo, date, nowIso(), uuid)
  return getItem(companyUuid, uuid)
}

export function deleteItem(companyUuid: string, uuid: string): { uuid: string } {
  const item = getItem(companyUuid, uuid)
  if (item.source === 'finanziamento') {
    throw new HttpError(409, 'Le rate dei finanziamenti si eliminano dal modulo Banche.')
  }
  getDatabase()
    .prepare('UPDATE treasury_items SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { uuid }
}

// --- impostazioni --------------------------------------------------------------

export function getSettings(companyUuid: string): TreasurySettings {
  getCompany(companyUuid)
  const row = getDatabase()
    .prepare(
      `SELECT min_liquidity_cents, opening_cash_cents, opening_cash_date
         FROM company_treasury_settings WHERE company_uuid = ? AND deleted = 0`
    )
    .get(companyUuid) as TreasurySettings | undefined
  return row ?? { min_liquidity_cents: null, opening_cash_cents: null, opening_cash_date: null }
}

export function updateSettings(companyUuid: string, input: Partial<TreasurySettings>): TreasurySettings {
  const merged = { ...getSettings(companyUuid), ...input }

  const min = merged.min_liquidity_cents ?? null
  if (min !== null && (!Number.isInteger(min) || min < 0)) {
    throw new HttpError(400, 'La soglia minima di liquidità deve essere un importo positivo.')
  }
  const cash = merged.opening_cash_cents ?? null
  if (cash !== null && !Number.isInteger(cash)) {
    throw new HttpError(400, 'Saldo di cassa non valido.')
  }
  const cashDate = cash === null ? null : (data(merged.opening_cash_date, 'Data del saldo') ?? todayLocal())
  if (cashDate && cashDate > todayLocal()) {
    throw new HttpError(400, 'Il saldo di cassa non può avere una data futura.')
  }

  const db = getDatabase()
  const now = nowIso()
  const exists = db
    .prepare('SELECT uuid FROM company_treasury_settings WHERE company_uuid = ? AND deleted = 0')
    .get(companyUuid) as { uuid: string } | undefined

  if (exists) {
    db.prepare(
      `UPDATE company_treasury_settings
          SET min_liquidity_cents = ?, opening_cash_cents = ?, opening_cash_date = ?,
              updated_at = ?, synced = 0
        WHERE uuid = ?`
    ).run(min, cash, cashDate, now, exists.uuid)
  } else {
    db.prepare(
      `INSERT INTO company_treasury_settings (uuid, company_uuid, min_liquidity_cents,
          opening_cash_cents, opening_cash_date, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`
    ).run(newUuid(), companyUuid, min, cash, cashDate, now, now)
  }
  return getSettings(companyUuid)
}

// --- previsione ----------------------------------------------------------------

/**
 * Il saldo di partenza: il più recente fra quello inserito a mano e le
 * liquidità immediate dell'ultimo bilancio a consuntivo. Se non c'è né l'uno né
 * l'altro, la previsione parte da zero e lo dice.
 */
export function openingCash(companyUuid: string, today = todayLocal()): OpeningCash {
  const settings = getSettings(companyUuid)

  let fromBalance: OpeningCash | null = null
  for (const period of listPeriods(companyUuid)) {
    if (!period.scenarios?.includes('actual')) continue
    const end = periodEnd(period.year, period.month)
    if (end > today) continue
    const accounts = engineAccounts(companyUuid, period.uuid, 'actual')
    if (accounts.length === 0) continue
    fromBalance = {
      cents: balanceSheet(accounts).liquiditaImmediate,
      date: end,
      origin: 'bilancio',
      label: `liquidità immediate del bilancio di ${period.label}`
    }
    break
  }

  const manual: OpeningCash | null =
    settings.opening_cash_cents !== null && settings.opening_cash_date
      ? {
          cents: settings.opening_cash_cents,
          date: settings.opening_cash_date,
          origin: 'manuale',
          label: `saldo inserito al ${settings.opening_cash_date.split('-').reverse().join('/')}`
        }
      : null

  if (manual && (!fromBalance || manual.date >= fromBalance.date)) return manual
  if (fromBalance) return fromBalance
  return { cents: 0, date: today, origin: 'manuale', label: 'nessun saldo disponibile: si parte da zero' }
}

export function treasuryView(companyUuid: string, today = todayLocal()): TreasuryView {
  const items = listItems(companyUuid)
  const settings = getSettings(companyUuid)
  const opening = openingCash(companyUuid, today)
  // Le rate dei finanziamenti entrano nella previsione senza essere copiate
  // nello scadenziario: il piano di ammortamento resta l'unica fonte (§10.7).
  const result = forecast({
    opening,
    items: [...items, ...loanTreasuryItemsFor(companyUuid, today)],
    today,
    minLiquidityCents: settings.min_liquidity_cents
  })

  // Lo storico della liquidità: le liquidità immediate dei mesi a consuntivo.
  const storico = series(companyUuid, { scenario: 'actual', limit: 12 })
  const periodi = listPeriods(companyUuid)
  const consuntivo = storico.map((p) => {
    const period = periodi.find((x) => x.uuid === p.period_uuid)!
    return { label: p.label, date: periodEnd(period.year, period.month), liquidita: p.liquidita }
  })

  return {
    ...result,
    items,
    settings,
    consuntivo,
    aging: receivablesAging(items, today),
    affidamenti: creditLinesSummary(companyUuid)
  }
}

/** Crediti aperti e scaduti oltre 60 giorni, per le note del circolante. */
export function agingFor(companyUuid: string, today = todayLocal()) {
  return receivablesAging(listItems(companyUuid), today)
}
