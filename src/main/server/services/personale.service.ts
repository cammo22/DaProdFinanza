import {
  CONTRATTI,
  flussiPersonale,
  normalizzaPersonale,
  type Contratto,
  type ImpostazioniPersonale,
  type TreasuryItemInput
} from '@shared/engine'
import type { Employee, EmployeeInput } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { HttpError } from '../http-error'
import { getCompany } from './companies.service'
import { leggiImpostazione, scriviImpostazione } from './settings.service'

/**
 * Personale — AGENTS.md §10.16. Le persone si salvano qui; costi e flussi li
 * calcola il motore condiviso (`shared/engine/personale.ts`), anche nella
 * schermata, così ogni numero cambia mentre si scrive.
 */

const CHIAVE = 'personale'

export function getPersonaleSettings(companyUuid: string): ImpostazioniPersonale {
  return normalizzaPersonale(leggiImpostazione('company', companyUuid, CHIAVE))
}

export function savePersonaleSettings(companyUuid: string, input: unknown): ImpostazioniPersonale {
  getCompany(companyUuid)
  const nuove = normalizzaPersonale(input, getPersonaleSettings(companyUuid))
  scriviImpostazione('company', companyUuid, CHIAVE, nuove)
  return nuove
}

export function listEmployees(companyUuid: string): Employee[] {
  getCompany(companyUuid)
  return getDatabase()
    .prepare(
      `SELECT * FROM employees WHERE company_uuid = ? AND deleted = 0
        ORDER BY ifnull(department, 'zzz') COLLATE NOCASE, name COLLATE NOCASE`
    )
    .all(companyUuid) as Employee[]
}

function getEmployee(companyUuid: string, uuid: string): Employee {
  const row = getDatabase()
    .prepare('SELECT * FROM employees WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(uuid, companyUuid) as Employee | undefined
  if (!row) throw new HttpError(404, 'Persona non trovata.')
  return row
}

const testo = (v: unknown, max = 120): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t || null
}

function numero(v: unknown, campo: string, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${campo}: valore non valido.`)
  return n
}

function data(v: unknown, campo: string): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `${campo}: data non valida.`)
  return v
}

/** Crea o aggiorna una persona: quello che manca resta com'era (o prende il predefinito). */
export function saveEmployee(companyUuid: string, input: EmployeeInput, uuid?: string): Employee {
  getCompany(companyUuid)
  const prima = uuid ? getEmployee(companyUuid, uuid) : null
  const v = <K extends keyof EmployeeInput>(k: K): EmployeeInput[K] | undefined =>
    input[k] !== undefined ? input[k] : prima ? (prima[k as keyof Employee] as EmployeeInput[K]) : undefined

  const name = testo(v('name'))
  if (!name) throw new HttpError(400, 'Scrivi il nome della persona.')
  const contract = (v('contract') ?? 'indeterminato') as Contratto
  if (!CONTRATTI.includes(contract)) throw new HttpError(400, 'Tipo di contratto non valido.')
  const facoltativo = (k: 'employer_contrib_pct' | 'inail_pct', campo: string, max: number): number | null => {
    const x = v(k)
    return x === null || x === undefined || (x as unknown) === '' ? null : numero(x, campo, 0, max)
  }
  const riga = {
    name,
    role: testo(v('role')),
    department: testo(v('department'), 60),
    contract,
    ccnl_level: testo(v('ccnl_level'), 60),
    hours_week: numero(v('hours_week') ?? 40, 'Ore settimanali', 0, 60),
    gross_annual_cents: Math.round(numero(v('gross_annual_cents') ?? 0, 'Retribuzione annua lorda', 0, 100_000_000)),
    monthly_payments: Math.round(numero(v('monthly_payments') ?? 13, 'Mensilità', 12, 14)),
    employer_contrib_pct: facoltativo('employer_contrib_pct', 'Contributi', 60),
    inail_pct: facoltativo('inail_pct', 'INAIL', 30),
    other_costs_cents: Math.round(numero(v('other_costs_cents') ?? 0, 'Altri costi', 0, 100_000_000)),
    direct: v('direct') === 0 || (v('direct') as unknown) === false ? 0 : 1,
    start_date: data(v('start_date'), 'Data di assunzione'),
    end_date: data(v('end_date'), 'Data di fine'),
    notes: testo(v('notes'), 500)
  }
  if (riga.start_date && riga.end_date && riga.end_date < riga.start_date) {
    throw new HttpError(400, 'La fine del rapporto viene prima dell’assunzione.')
  }

  const db = getDatabase()
  const now = nowIso()
  if (prima) {
    db.prepare(
      `UPDATE employees SET name = @name, role = @role, department = @department, contract = @contract,
              ccnl_level = @ccnl_level, hours_week = @hours_week, gross_annual_cents = @gross_annual_cents,
              monthly_payments = @monthly_payments, employer_contrib_pct = @employer_contrib_pct,
              inail_pct = @inail_pct, other_costs_cents = @other_costs_cents, direct = @direct,
              start_date = @start_date, end_date = @end_date, notes = @notes, updated_at = @now, synced = 0
        WHERE uuid = @uuid`
    ).run({ ...riga, now, uuid: prima.uuid })
    return getEmployee(companyUuid, prima.uuid)
  }
  const nuovo = newUuid()
  db.prepare(
    `INSERT INTO employees (uuid, company_uuid, name, role, department, contract, ccnl_level, hours_week,
                            gross_annual_cents, monthly_payments, employer_contrib_pct, inail_pct,
                            other_costs_cents, direct, start_date, end_date, notes, created_at, updated_at,
                            synced, deleted)
     VALUES (@uuid, @company, @name, @role, @department, @contract, @ccnl_level, @hours_week,
             @gross_annual_cents, @monthly_payments, @employer_contrib_pct, @inail_pct,
             @other_costs_cents, @direct, @start_date, @end_date, @notes, @now, @now, 0, 0)`
  ).run({ ...riga, uuid: nuovo, company: companyUuid, now })
  return getEmployee(companyUuid, nuovo)
}

export function deleteEmployee(companyUuid: string, uuid: string): { uuid: string } {
  getEmployee(companyUuid, uuid)
  getDatabase()
    .prepare('UPDATE employees SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { uuid }
}

/** Stipendi, F24 e INAIL nella previsione di tesoreria, se l'azienda li ha accesi. */
export function personaleTreasuryItemsFor(companyUuid: string, today: string): TreasuryItemInput[] {
  const imp = getPersonaleSettings(companyUuid)
  if (!imp.inTesoreria) return []
  return flussiPersonale(listEmployees(companyUuid), imp, today)
}
