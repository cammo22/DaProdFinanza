import {
  CREDIT_LINE_LABELS,
  creditSummary,
  debtServiceNext12Months,
  LOAN_LABELS,
  loanStatus,
  loanTreasuryItems,
  schedule,
  validateLoan,
  type CreditLineKind,
  type LoanInput,
  type LoanKind
} from '@shared/engine'
import type { BankingView } from '@shared/analysis'
import type { Bank, CreditLine, Loan } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { HttpError } from '../http-error'
import { getCompany } from './companies.service'

/**
 * Banche e finanziamenti — AGENTS.md §10.7.
 *
 * I finanziamenti si salvano come parametri: il piano di ammortamento lo
 * ricalcola sempre il motore, e le rate entrano nella previsione di cassa da
 * lì (vedi `loanTreasuryItemsFor`).
 */

type Row = Record<string, unknown>

const DATA = /^\d{4}-\d{2}-\d{2}$/

function testo(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t ? t : null
}

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

function intero(value: unknown, campo: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new HttpError(400, `${campo}: valore non valido.`)
  }
  return value
}

function tasso(value: unknown, campo: string, obbligatorio: boolean): number | null {
  if (value === null || value === undefined || value === '') {
    if (obbligatorio) throw new HttpError(400, `${campo}: obbligatorio.`)
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 50) {
    throw new HttpError(400, `${campo}: deve stare fra 0 e 50%.`)
  }
  return value
}

// --- istituti ------------------------------------------------------------------

export function listBanks(companyUuid: string): Bank[] {
  return getDatabase()
    .prepare('SELECT * FROM banks WHERE company_uuid = ? AND deleted = 0 ORDER BY name COLLATE NOCASE')
    .all(companyUuid) as Bank[]
}

function getBank(companyUuid: string, uuid: string): Bank {
  const bank = getDatabase()
    .prepare('SELECT * FROM banks WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(uuid, companyUuid) as Bank | undefined
  if (!bank) throw new HttpError(404, 'Istituto non trovato.')
  return bank
}

export function saveBank(companyUuid: string, input: Row, uuid?: string): Bank {
  getCompany(companyUuid)
  const current = uuid ? getBank(companyUuid, uuid) : null
  const merged = { ...current, ...input }
  const name = testo(merged.name)
  if (!name) throw new HttpError(400, "Il nome dell'istituto è obbligatorio.")

  const doppione = getDatabase()
    .prepare(
      `SELECT uuid FROM banks WHERE company_uuid = ? AND name = ? COLLATE NOCASE
          AND deleted = 0 AND uuid <> ?`
    )
    .get(companyUuid, name, uuid ?? '') as { uuid: string } | undefined
  if (doppione) throw new HttpError(409, `"${name}" è già fra gli istituti di questa azienda.`)

  const row = {
    name,
    branch: testo(merged.branch),
    contact: testo(merged.contact),
    notes: testo(merged.notes),
    now: nowIso()
  }
  const db = getDatabase()
  if (current) {
    db.prepare(
      `UPDATE banks SET name = @name, branch = @branch, contact = @contact, notes = @notes,
              updated_at = @now, synced = 0 WHERE uuid = @uuid`
    ).run({ ...row, uuid: current.uuid })
    return getBank(companyUuid, current.uuid)
  }
  const nuovo = newUuid()
  db.prepare(
    `INSERT INTO banks (uuid, company_uuid, name, branch, contact, notes, created_at, updated_at, synced, deleted)
     VALUES (@uuid, @company, @name, @branch, @contact, @notes, @now, @now, 0, 0)`
  ).run({ ...row, uuid: nuovo, company: companyUuid })
  return getBank(companyUuid, nuovo)
}

export function deleteBank(companyUuid: string, uuid: string): { uuid: string } {
  getBank(companyUuid, uuid)
  const db = getDatabase()
  const legati = db
    .prepare(
      `SELECT (SELECT count(*) FROM credit_lines WHERE bank_uuid = ? AND deleted = 0)
            + (SELECT count(*) FROM loans WHERE bank_uuid = ? AND deleted = 0) AS n`
    )
    .get(uuid, uuid) as { n: number }
  if (legati.n > 0) {
    throw new HttpError(409, "L'istituto ha ancora linee di credito o finanziamenti: eliminali prima.")
  }
  db.prepare('UPDATE banks SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?').run(nowIso(), uuid)
  return { uuid }
}

// --- linee di credito ------------------------------------------------------------

const LINE_KINDS = Object.keys(CREDIT_LINE_LABELS) as CreditLineKind[]

export function listLines(companyUuid: string): CreditLine[] {
  return getDatabase()
    .prepare('SELECT * FROM credit_lines WHERE company_uuid = ? AND deleted = 0 ORDER BY kind, label')
    .all(companyUuid) as CreditLine[]
}

function getLine(companyUuid: string, uuid: string): CreditLine {
  const line = getDatabase()
    .prepare('SELECT * FROM credit_lines WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(uuid, companyUuid) as CreditLine | undefined
  if (!line) throw new HttpError(404, 'Linea di credito non trovata.')
  return line
}

export function saveLine(companyUuid: string, input: Row, uuid?: string): CreditLine {
  getCompany(companyUuid)
  const current = uuid ? getLine(companyUuid, uuid) : null
  const merged = { ...current, ...input }

  const bankUuid = testo(merged.bank_uuid)
  if (!bankUuid) throw new HttpError(400, "Scegli l'istituto.")
  getBank(companyUuid, bankUuid)
  const kind = merged.kind as CreditLineKind
  if (!LINE_KINDS.includes(kind)) throw new HttpError(400, 'Tipo di linea non valido.')

  const row = {
    bank_uuid: bankUuid,
    kind,
    label: testo(merged.label) ?? CREDIT_LINE_LABELS[kind],
    granted_cents: intero(merged.granted_cents, 'Accordato'),
    used_cents: intero(merged.used_cents ?? 0, 'Utilizzato'),
    used_as_of: data(merged.used_as_of, 'Utilizzo alla data'),
    annual_rate_percent: tasso(merged.annual_rate_percent, 'Tasso', false),
    expiry_date: data(merged.expiry_date, 'Scadenza'),
    notes: testo(merged.notes),
    now: nowIso()
  }

  const db = getDatabase()
  if (current) {
    db.prepare(
      `UPDATE credit_lines SET bank_uuid = @bank_uuid, kind = @kind, label = @label,
              granted_cents = @granted_cents, used_cents = @used_cents, used_as_of = @used_as_of,
              annual_rate_percent = @annual_rate_percent, expiry_date = @expiry_date, notes = @notes,
              updated_at = @now, synced = 0
        WHERE uuid = @uuid`
    ).run({ ...row, uuid: current.uuid })
    return getLine(companyUuid, current.uuid)
  }
  const nuovo = newUuid()
  db.prepare(
    `INSERT INTO credit_lines (uuid, company_uuid, bank_uuid, kind, label, granted_cents, used_cents,
                               used_as_of, annual_rate_percent, expiry_date, notes,
                               created_at, updated_at, synced, deleted)
     VALUES (@uuid, @company, @bank_uuid, @kind, @label, @granted_cents, @used_cents,
             @used_as_of, @annual_rate_percent, @expiry_date, @notes, @now, @now, 0, 0)`
  ).run({ ...row, uuid: nuovo, company: companyUuid })
  return getLine(companyUuid, nuovo)
}

export function deleteLine(companyUuid: string, uuid: string): { uuid: string } {
  getLine(companyUuid, uuid)
  getDatabase()
    .prepare('UPDATE credit_lines SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { uuid }
}

// --- finanziamenti ---------------------------------------------------------------

const LOAN_KINDS = Object.keys(LOAN_LABELS) as LoanKind[]

export function listLoans(companyUuid: string): Loan[] {
  return getDatabase()
    .prepare('SELECT * FROM loans WHERE company_uuid = ? AND deleted = 0 ORDER BY first_due_date')
    .all(companyUuid) as Loan[]
}

function getLoan(companyUuid: string, uuid: string): Loan {
  const loan = getDatabase()
    .prepare('SELECT * FROM loans WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(uuid, companyUuid) as Loan | undefined
  if (!loan) throw new HttpError(404, 'Finanziamento non trovato.')
  return loan
}

export function saveLoan(companyUuid: string, input: Row, uuid?: string): Loan {
  getCompany(companyUuid)
  const current = uuid ? getLoan(companyUuid, uuid) : null
  const merged = { ...current, ...input }

  const bankUuid = testo(merged.bank_uuid)
  if (!bankUuid) throw new HttpError(400, "Scegli l'istituto.")
  getBank(companyUuid, bankUuid)
  const kind = merged.kind as LoanKind
  if (!LOAN_KINDS.includes(kind)) throw new HttpError(400, 'Tipo di finanziamento non valido.')

  const row = {
    bank_uuid: bankUuid,
    kind,
    label: testo(merged.label) ?? LOAN_LABELS[kind],
    principal_cents: intero(merged.principal_cents, 'Importo', 1),
    annual_rate_percent: tasso(merged.annual_rate_percent, 'Tasso annuo', true)!,
    first_due_date: data(merged.first_due_date, 'Prima rata', true)!,
    installments: intero(merged.installments, 'Numero di rate', 1),
    frequency: merged.frequency as LoanInput['frequency'],
    grace_installments: intero(merged.grace_installments ?? 0, 'Preammortamento'),
    amortization: (merged.amortization ?? 'francese') as LoanInput['amortization'],
    balloon_cents: intero(merged.balloon_cents ?? 0, 'Riscatto'),
    notes: testo(merged.notes),
    now: nowIso()
  }
  if (row.amortization !== 'francese' && row.amortization !== 'italiano') {
    throw new HttpError(400, 'Tipo di ammortamento non valido.')
  }
  // Il motore controlla la coerenza del piano: le stesse regole valgono ovunque.
  const check = validateLoan({ ...row, uuid: 'verifica' })
  if (!check.ok) throw new HttpError(400, check.error!)

  const db = getDatabase()
  if (current) {
    db.prepare(
      `UPDATE loans SET bank_uuid = @bank_uuid, kind = @kind, label = @label,
              principal_cents = @principal_cents, annual_rate_percent = @annual_rate_percent,
              first_due_date = @first_due_date, installments = @installments, frequency = @frequency,
              grace_installments = @grace_installments, amortization = @amortization,
              balloon_cents = @balloon_cents, notes = @notes, updated_at = @now, synced = 0
        WHERE uuid = @uuid`
    ).run({ ...row, uuid: current.uuid })
    return getLoan(companyUuid, current.uuid)
  }
  const nuovo = newUuid()
  db.prepare(
    `INSERT INTO loans (uuid, company_uuid, bank_uuid, kind, label, principal_cents,
                        annual_rate_percent, first_due_date, installments, frequency,
                        grace_installments, amortization, balloon_cents, notes,
                        created_at, updated_at, synced, deleted)
     VALUES (@uuid, @company, @bank_uuid, @kind, @label, @principal_cents,
             @annual_rate_percent, @first_due_date, @installments, @frequency,
             @grace_installments, @amortization, @balloon_cents, @notes, @now, @now, 0, 0)`
  ).run({ ...row, uuid: nuovo, company: companyUuid })
  return getLoan(companyUuid, nuovo)
}

export function deleteLoan(companyUuid: string, uuid: string): { uuid: string } {
  getLoan(companyUuid, uuid)
  getDatabase()
    .prepare('UPDATE loans SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { uuid }
}

// --- letture per gli altri moduli -----------------------------------------------

/** Le rate future di tutti i finanziamenti, come movimenti di tesoreria. */
export function loanTreasuryItemsFor(companyUuid: string, today: string) {
  return listLoans(companyUuid).flatMap((loan) => loanTreasuryItems(loan, today))
}

/** Rate dei 12 mesi successivi a una data: il denominatore del DSCR. */
export function debtServiceFor(companyUuid: string, from: string): number | null {
  const loans = listLoans(companyUuid)
  if (loans.length === 0) return null
  return debtServiceNext12Months(loans, from)
}

export function creditLinesSummary(companyUuid: string) {
  return creditSummary(listLines(companyUuid))
}

// --- vista -----------------------------------------------------------------------

export function bankingView(companyUuid: string, today: string): BankingView {
  getCompany(companyUuid)
  const banks = listBanks(companyUuid)
  const lines = listLines(companyUuid)
  const loans = listLoans(companyUuid).map((loan) => {
    const plan = schedule(loan)
    return { ...loan, schedule: plan, status: loanStatus(loan, today, plan) }
  })

  // Per istituto si leggono i finanziamenti come fa la Centrale Rischi: per i
  // "rischi a scadenza" accordato e utilizzato coincidono col debito residuo.
  const perBanca = banks.map((bank) => {
    const proprie = lines.filter((l) => l.bank_uuid === bank.uuid)
    const residuo = loans
      .filter((l) => l.bank_uuid === bank.uuid)
      .reduce((s, l) => s + l.status.residual, 0)
    const linee = creditSummary(proprie)
    const accordato = linee.accordato + residuo
    const utilizzato = linee.utilizzato + residuo
    return {
      bank_uuid: bank.uuid,
      name: bank.name,
      accordato,
      utilizzato,
      disponibile: linee.disponibile,
      // L'utilizzo guarda solo le linee a revoca: un finanziamento è per
      // definizione utilizzato al 100%, e farebbe scattare un avviso finto.
      utilizzoPercent: linee.utilizzoPercent
    }
  })

  const perTipologia = [
    ...LINE_KINDS.map((kind) => ({
      kind,
      label: CREDIT_LINE_LABELS[kind],
      utilizzato: lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.used_cents, 0)
    })),
    ...LOAN_KINDS.map((kind) => ({
      kind,
      label: LOAN_LABELS[kind],
      utilizzato: loans.filter((l) => l.kind === kind).reduce((s, l) => s + l.status.residual, 0)
    }))
  ].filter((t) => t.utilizzato > 0)

  return {
    today,
    banks,
    lines,
    loans,
    affidamenti: creditSummary(lines),
    rataMensile: loans.reduce((s, l) => s + l.status.monthlyEquivalent, 0),
    debitoResiduo: loans.reduce((s, l) => s + l.status.residual, 0),
    rate12Mesi: loans.length > 0 ? debtServiceNext12Months(loans, today) : 0,
    perBanca,
    perTipologia
  }
}
