import { BUSINESS_TYPES, LEGAL_FORMS } from '@shared/enums'
import type { Company, CreateCompanyInput } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { companyFolder } from '../../lib/paths'
import { HttpError } from '../http-error'
import { getClient } from './clients.service'

/** Codice leggibile `CLI-0001-AZ-01` — AGENTS.md §5. */
function nextCompanyCode(clientCode: string): string {
  const prefix = `${clientCode}-AZ-`
  const row = getDatabase()
    .prepare(
      `SELECT max(CAST(substr(code, ?) AS INTEGER)) AS n
         FROM companies WHERE code LIKE ?`
    )
    .get(prefix.length + 1, `${prefix}%`) as { n: number | null }
  return `${prefix}${String((row.n ?? 0) + 1).padStart(2, '0')}`
}

function nullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * P.IVA italiana: 11 cifre. Non è una validazione fiscale completa (manca il
 * check digit): serve solo a intercettare errori di battitura evidenti.
 */
function normalizeVat(value: string | null): string | null {
  if (!value) return null
  const clean = value.replace(/[\s.]/g, '').replace(/^IT/i, '')
  if (!/^\d{11}$/.test(clean)) {
    throw new HttpError(400, 'La Partita IVA deve essere composta da 11 cifre.')
  }
  return clean
}

export function listCompanies(includeArchived = false): Company[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM companies
        WHERE deleted = 0 ${includeArchived ? '' : 'AND archived = 0'}
        ORDER BY name COLLATE NOCASE`
    )
    .all() as Company[]
}

export function getCompany(uuid: string): Company {
  const company = getDatabase()
    .prepare('SELECT * FROM companies WHERE uuid = ? AND deleted = 0')
    .get(uuid) as Company | undefined
  if (!company) throw new HttpError(404, 'Azienda non trovata.')
  return company
}

/** Wizard "+ Nuova azienda" — AGENTS.md §10.1. */
export function createCompany(input: CreateCompanyInput): Company {
  const name = input.name?.trim()
  if (!name) throw new HttpError(400, 'La ragione sociale è obbligatoria.')

  const client = getClient(input.client_uuid)
  const vat = normalizeVat(nullable(input.vat_number))

  if (vat) {
    const clash = getDatabase()
      .prepare('SELECT code FROM companies WHERE vat_number = ? AND deleted = 0')
      .get(vat) as { code: string } | undefined
    if (clash) {
      throw new HttpError(409, `La Partita IVA ${vat} è già registrata (azienda ${clash.code}).`)
    }
  }

  const legalForm = nullable(input.legal_form)
  if (legalForm && !LEGAL_FORMS.includes(legalForm as never)) {
    throw new HttpError(400, `Forma giuridica non riconosciuta: ${legalForm}.`)
  }

  const businessType = nullable(input.business_type)
  if (businessType && !BUSINESS_TYPES.includes(businessType as never)) {
    throw new HttpError(400, `Tipo di attività non riconosciuto: ${businessType}.`)
  }

  const now = nowIso()
  const company: Company = {
    uuid: newUuid(),
    client_uuid: client.uuid,
    code: nextCompanyCode(client.code),
    name,
    vat_number: vat,
    tax_code: nullable(input.tax_code),
    legal_form: legalForm as Company['legal_form'],
    business_type: businessType as Company['business_type'],
    start_date: nullable(input.start_date),
    notes: nullable(input.notes),
    archived: 0,
    created_at: now,
    updated_at: now,
    synced: 0,
    deleted: 0
  }

  getDatabase()
    .prepare(
      `INSERT INTO companies (uuid, client_uuid, code, name, vat_number, tax_code, legal_form,
                              business_type, start_date, notes, archived,
                              created_at, updated_at, synced, deleted)
       VALUES (@uuid, @client_uuid, @code, @name, @vat_number, @tax_code, @legal_form,
               @business_type, @start_date, @notes, @archived,
               @created_at, @updated_at, @synced, @deleted)`
    )
    .run(company)

  // Cartelle di lavoro import/export/backup dell'azienda — AGENTS.md §8.
  companyFolder(company.code)

  return company
}

export function setCompanyArchived(uuid: string, archived: boolean): Company {
  getCompany(uuid)
  getDatabase()
    .prepare('UPDATE companies SET archived = ?, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(archived ? 1 : 0, nowIso(), uuid)
  return getCompany(uuid)
}

/**
 * Soft delete (§6). La cartella su disco dell'azienda NON viene toccata:
 * contiene gli originali importati, conservati per audit (AGENTS.md §12).
 */
export function deleteCompany(uuid: string): { users_deleted: number } {
  const db = getDatabase()
  getCompany(uuid)
  const now = nowIso()

  const run = db.transaction(() => {
    const users = db
      .prepare(
        `UPDATE users SET deleted = 1, active = 0, updated_at = ?, synced = 0
          WHERE company_uuid = ? AND deleted = 0`
      )
      .run(now, uuid)

    db.prepare('UPDATE companies SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?').run(
      now,
      uuid
    )

    return { users_deleted: users.changes }
  })

  return run()
}
