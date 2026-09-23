import type {
  AccountRow,
  AccountType,
  FiscalPeriod,
  PeriodBalances,
  SaveBalancesResult,
  Scenario
} from '@shared/types'
import { getDatabase } from '../../db'
import { typesForSection } from '../../import/chart-of-accounts'
import { newUuid, nowIso } from '../../lib/ids'
import { HttpError } from '../http-error'
import { getCompany } from './companies.service'
import { listSections } from './reference.service'

/**
 * Dati contabili inseriti nel programma: piano dei conti e saldi.
 *
 * È la strada principale per caricare i numeri: il consulente non deve più
 * preparare un file Excel. L'import da Excel resta per chi il file ce l'ha già,
 * e scrive nelle stesse tabelle.
 *
 * Le regole sono quelle dell'import (§11.1): un periodo chiuso non si tocca,
 * il tipo di conto deve essere coerente con la sezione, la sotto-classificazione
 * è una delle alternative della sezione.
 */

type Row = Record<string, unknown>

const SCENARI: Scenario[] = ['actual', 'budget', 'forecast']

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

export function periodLabel(year: number, month: number | null): string {
  return month === null ? String(year) : `${MESI[month - 1]} ${year}`
}

function testo(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t ? t : null
}

// --- piano dei conti ------------------------------------------------------------

export function listAccounts(companyUuid: string): AccountRow[] {
  getCompany(companyUuid)
  return getDatabase()
    .prepare(
      `SELECT a.*,
              (SELECT count(*) FROM account_balances b
                WHERE b.account_uuid = a.uuid AND b.deleted = 0) AS balance_count
         FROM accounts a
         JOIN account_sections s ON s.code = a.section_code
        WHERE a.company_uuid = ? AND a.deleted = 0
        ORDER BY s.sort_order, a.code`
    )
    .all(companyUuid) as AccountRow[]
}

function getAccount(companyUuid: string, uuid: string): AccountRow {
  const account = listAccounts(companyUuid).find((a) => a.uuid === uuid)
  if (!account) throw new HttpError(404, 'Conto non trovato.')
  return account
}

export function saveAccount(companyUuid: string, input: Row, uuid?: string): AccountRow {
  getCompany(companyUuid)
  const current = uuid ? getAccount(companyUuid, uuid) : null
  const merged: Row = { ...current, ...input }

  const code = testo(merged.code)
  const name = testo(merged.name)
  if (!code) throw new HttpError(400, 'Il codice del conto è obbligatorio.')
  if (!name) throw new HttpError(400, 'Il nome del conto è obbligatorio.')

  const section = listSections().find((s) => s.code === merged.section_code)
  if (!section) throw new HttpError(400, 'Scegli la sezione del conto.')

  const allowed = typesForSection(section.account_type)
  const type = (testo(merged.account_type) ?? section.account_type) as AccountType
  if (input.account_type !== undefined && !allowed.includes(type)) {
    throw new HttpError(400, `Un conto della sezione ${section.label} non può essere di tipo ${type}.`)
  }
  // Cambiando sezione il tipo di prima può non valere più: si prende quello della sezione.
  const accountType = allowed.includes(type) ? type : section.account_type

  let detailTag = testo(merged.detail_tag)
  if (detailTag && !section.detail_tags.includes(detailTag)) {
    if (input.detail_tag !== undefined) {
      throw new HttpError(400, `"${detailTag}" non è una voce della sezione ${section.label}.`)
    }
    detailTag = null // veniva dalla sezione precedente
  }

  let pct: number | null = null
  const rawPct = merged.direct_cost_pct
  if (rawPct !== null && rawPct !== undefined && rawPct !== '') {
    if (typeof rawPct !== 'number' || !Number.isFinite(rawPct) || rawPct < 0 || rawPct > 100) {
      throw new HttpError(400, 'La % di costo diretto deve stare fra 0 e 100.')
    }
    pct = section.account_type === 'COSTO' ? rawPct : null
  }

  const active = merged.active === false || merged.active === 0 ? 0 : 1
  const notes = testo(merged.notes)

  const db = getDatabase()
  const doppione = db
    .prepare(
      `SELECT uuid FROM accounts WHERE company_uuid = ? AND code = ? AND deleted = 0 AND uuid <> ?`
    )
    .get(companyUuid, code, uuid ?? '') as { uuid: string } | undefined
  if (doppione) throw new HttpError(409, `Il codice ${code} è già usato da un altro conto.`)

  const row = {
    code,
    name,
    section: section.code,
    type: accountType,
    detail: detailTag,
    pct,
    active,
    notes,
    now: nowIso()
  }

  if (current) {
    db.prepare(
      `UPDATE accounts SET code = @code, name = @name, section_code = @section,
              account_type = @type, detail_tag = @detail, direct_cost_pct = @pct,
              active = @active, notes = @notes, updated_at = @now, synced = 0
        WHERE uuid = @uuid`
    ).run({ ...row, uuid: current.uuid })
    return getAccount(companyUuid, current.uuid)
  }

  const nuovo = newUuid()
  db.prepare(
    `INSERT INTO accounts (uuid, company_uuid, code, name, section_code, account_type,
                           detail_tag, direct_cost_pct, active, notes,
                           created_at, updated_at, synced, deleted)
     VALUES (@uuid, @company, @code, @name, @section, @type, @detail, @pct, @active, @notes,
             @now, @now, 0, 0)`
  ).run({ ...row, uuid: nuovo, company: companyUuid })
  return getAccount(companyUuid, nuovo)
}

/** Si elimina solo un conto senza saldi; uno usato si disattiva. */
export function deleteAccount(companyUuid: string, uuid: string): { ok: true } {
  const account = getAccount(companyUuid, uuid)
  if (account.balance_count > 0) {
    throw new HttpError(
      409,
      `Il conto ${account.code} ha ${account.balance_count} saldi: non si può eliminare. ` +
        'Disattivalo, così resta nei periodi passati e sparisce dai nuovi.'
    )
  }
  getDatabase()
    .prepare('UPDATE accounts SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { ok: true }
}

/**
 * Piano dei conti di partenza: un conto per ciascuna delle 24 sezioni, con il
 * nome della sezione. Dove la sezione distingue delle voci (crediti
 * commerciali / diversi / IVA, i debiti, gli utili) un conto per voce, con il
 * nome della voce: sono quelle che servono agli indici (DSO, DPO…). Basta a
 * far girare tutte le analisi; il consulente poi rinomina, aggiunge e dettaglia.
 */
export function createStarterChart(companyUuid: string): { created: number } {
  getCompany(companyUuid)
  const db = getDatabase()
  const existing = db
    .prepare('SELECT count(*) AS n FROM accounts WHERE company_uuid = ? AND deleted = 0')
    .get(companyUuid) as { n: number }
  if (existing.n > 0) {
    throw new HttpError(409, 'Questa azienda ha già un piano dei conti.')
  }

  const now = nowIso()
  const insert = db.prepare(
    `INSERT INTO accounts (uuid, company_uuid, code, name, section_code, account_type,
                           detail_tag, direct_cost_pct, active, notes,
                           created_at, updated_at, synced, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL, ?, ?, 0, 0)`
  )
  const sections = listSections()
  let created = 0
  db.transaction(() => {
    for (const section of sections) {
      const code = String(section.sort_order).padStart(3, '0')
      const voci =
        section.detail_tags.length > 0
          ? section.detail_tags.map((tag, i) => ({ code: `${code}.${i + 1}`, name: tag, tag }))
          : [{ code, name: section.label.replace(/\s*\(.*\)$/, ''), tag: null }]
      for (const voce of voci) {
        insert.run(
          newUuid(),
          companyUuid,
          voce.code,
          voce.name,
          section.code,
          section.account_type,
          voce.tag,
          now,
          now
        )
        created++
      }
    }
  })()
  return { created }
}

// --- periodi ----------------------------------------------------------------------

function findPeriod(companyUuid: string, year: number, month: number | null): FiscalPeriod | undefined {
  return getDatabase()
    .prepare(
      `SELECT * FROM fiscal_periods
        WHERE company_uuid = ? AND period_type = ? AND year = ?
          AND ifnull(month, 0) = ? AND deleted = 0`
    )
    .get(companyUuid, month === null ? 'year' : 'month', year, month ?? 0) as FiscalPeriod | undefined
}

function checkPeriod(yearValue: unknown, monthValue: unknown): { year: number; month: number | null } {
  const year = Number(yearValue)
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    throw new HttpError(400, 'Anno non valido.')
  }
  if (monthValue === null || monthValue === undefined || monthValue === '' || monthValue === 'null') {
    return { year, month: null }
  }
  const month = Number(monthValue)
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new HttpError(400, 'Mese non valido.')
  return { year, month }
}

function checkScenario(value: unknown): Scenario {
  const scenario = (value ?? 'actual') as Scenario
  if (!SCENARI.includes(scenario)) throw new HttpError(400, 'Scenario non valido.')
  return scenario
}

export function setPeriodClosed(companyUuid: string, periodUuid: string, closed: boolean): FiscalPeriod {
  getCompany(companyUuid)
  const db = getDatabase()
  const result = db
    .prepare(
      `UPDATE fiscal_periods SET closed = ?, updated_at = ?, synced = 0
        WHERE uuid = ? AND company_uuid = ? AND deleted = 0`
    )
    .run(closed ? 1 : 0, nowIso(), periodUuid, companyUuid)
  if (result.changes === 0) throw new HttpError(404, 'Periodo non trovato.')
  return db.prepare('SELECT * FROM fiscal_periods WHERE uuid = ?').get(periodUuid) as FiscalPeriod
}

/** Elimina un periodo con tutti i suoi saldi. Un periodo chiuso va prima riaperto. */
export function deletePeriod(companyUuid: string, periodUuid: string): { ok: true } {
  getCompany(companyUuid)
  const db = getDatabase()
  const period = db
    .prepare('SELECT * FROM fiscal_periods WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(periodUuid, companyUuid) as FiscalPeriod | undefined
  if (!period) throw new HttpError(404, 'Periodo non trovato.')
  if (period.closed) throw new HttpError(409, 'Il periodo è chiuso: riaprilo prima di eliminarlo.')

  const now = nowIso()
  db.transaction(() => {
    db.prepare(
      `UPDATE account_balances SET deleted = 1, updated_at = ?, synced = 0
        WHERE period_uuid = ? AND deleted = 0`
    ).run(now, periodUuid)
    db.prepare('UPDATE fiscal_periods SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?').run(
      now,
      periodUuid
    )
  })()
  return { ok: true }
}

// --- saldi ------------------------------------------------------------------------

export function getBalances(companyUuid: string, query: Row): PeriodBalances {
  getCompany(companyUuid)
  const { year, month } = checkPeriod(query.year, query.month)
  const scenario = checkScenario(query.scenario)
  const period = findPeriod(companyUuid, year, month) ?? null

  const amounts: Record<string, number> = {}
  if (period) {
    const rows = getDatabase()
      .prepare(
        `SELECT account_uuid, amount_cents FROM account_balances
          WHERE period_uuid = ? AND scenario = ? AND deleted = 0`
      )
      .all(period.uuid, scenario) as { account_uuid: string; amount_cents: number }[]
    for (const row of rows) amounts[row.account_uuid] = row.amount_cents
  }
  return { year, month, scenario, period, amounts }
}

/**
 * Salva i saldi di un periodo. Si mandano solo i conti toccati: un importo
 * `null` toglie il saldo, un numero lo scrive. Il periodo si crea al primo
 * salvataggio.
 *
 * Si aggiorna riga per riga invece di cancellare e riscrivere tutto: un
 * saldo non cambiato resta com'è, con la sua data e la sua origine (import o
 * mano), e alla sincronizzazione viaggiano solo le differenze.
 */
export function saveBalances(companyUuid: string, input: Row): SaveBalancesResult {
  getCompany(companyUuid)
  const { year, month } = checkPeriod(input.year, input.month)
  const scenario = checkScenario(input.scenario)
  const changes = input.amounts
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new HttpError(400, 'Nessun saldo da salvare.')
  }

  const accounts = new Map(listAccounts(companyUuid).map((a) => [a.uuid, a]))
  const clean: [string, number | null][] = []
  for (const [accountUuid, value] of Object.entries(changes as Row)) {
    if (!accounts.has(accountUuid)) throw new HttpError(400, 'Uno dei conti non esiste più: ricarica la pagina.')
    if (value === null) {
      clean.push([accountUuid, null])
      continue
    }
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new HttpError(400, `Importo non valido per il conto ${accounts.get(accountUuid)!.code}.`)
    }
    clean.push([accountUuid, value])
  }

  const db = getDatabase()
  const now = nowIso()

  return db.transaction((): SaveBalancesResult => {
    let period = findPeriod(companyUuid, year, month)
    if (period?.closed) {
      throw new HttpError(409, `${period.label} è chiuso: riaprilo per modificare i saldi.`)
    }
    if (!period) {
      const uuid = newUuid()
      db.prepare(
        `INSERT INTO fiscal_periods (uuid, company_uuid, period_type, year, month, label,
                                     closed, created_at, updated_at, synced, deleted)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0)`
      ).run(uuid, companyUuid, month === null ? 'year' : 'month', year, month, periodLabel(year, month), now, now)
      period = db.prepare('SELECT * FROM fiscal_periods WHERE uuid = ?').get(uuid) as FiscalPeriod
    }

    const find = db.prepare(
      `SELECT uuid, amount_cents FROM account_balances
        WHERE account_uuid = ? AND period_uuid = ? AND scenario = ? AND deleted = 0`
    )
    const update = db.prepare(
      `UPDATE account_balances SET amount_cents = ?, import_document_uuid = NULL,
              updated_at = ?, synced = 0 WHERE uuid = ?`
    )
    const remove = db.prepare(
      'UPDATE account_balances SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?'
    )
    const insert = db.prepare(
      `INSERT INTO account_balances (uuid, company_uuid, account_uuid, period_uuid, scenario,
                                     amount_cents, import_document_uuid,
                                     created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, 0)`
    )

    let written = 0
    let removed = 0
    let unchanged = 0
    for (const [accountUuid, cents] of clean) {
      const existing = find.get(accountUuid, period.uuid, scenario) as
        | { uuid: string; amount_cents: number }
        | undefined
      if (cents === null) {
        if (existing) {
          remove.run(now, existing.uuid)
          removed++
        }
      } else if (existing) {
        if (existing.amount_cents === cents) {
          unchanged++
        } else {
          update.run(cents, now, existing.uuid)
          written++
        }
      } else {
        insert.run(newUuid(), companyUuid, accountUuid, period.uuid, scenario, cents, now, now)
        written++
      }
    }

    db.prepare('UPDATE fiscal_periods SET updated_at = ?, synced = 0 WHERE uuid = ?').run(now, period.uuid)
    return { period, written, removed, unchanged }
  })()
}
