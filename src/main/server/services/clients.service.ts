import type { Client, ClientWithCompanies, Company, CreateClientInput } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { HttpError } from '../http-error'

/** Codice leggibile progressivo `CLI-0001` — AGENTS.md §5. */
function nextClientCode(): string {
  const row = getDatabase()
    .prepare(
      `SELECT max(CAST(substr(code, 5) AS INTEGER)) AS n
         FROM clients WHERE code LIKE 'CLI-%'`
    )
    .get() as { n: number | null }
  return `CLI-${String((row.n ?? 0) + 1).padStart(4, '0')}`
}

function nullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function listClients(includeArchived = false): ClientWithCompanies[] {
  const db = getDatabase()

  const clients = db
    .prepare(
      `SELECT * FROM clients
        WHERE deleted = 0 ${includeArchived ? '' : 'AND archived = 0'}
        ORDER BY name COLLATE NOCASE`
    )
    .all() as Client[]

  const companies = db
    .prepare(
      `SELECT * FROM companies
        WHERE deleted = 0 ${includeArchived ? '' : 'AND archived = 0'}
        ORDER BY name COLLATE NOCASE`
    )
    .all() as Company[]

  return clients.map((client) => ({
    ...client,
    companies: companies.filter((company) => company.client_uuid === client.uuid)
  }))
}

export function getClient(uuid: string): Client {
  const client = getDatabase()
    .prepare('SELECT * FROM clients WHERE uuid = ? AND deleted = 0')
    .get(uuid) as Client | undefined
  if (!client) throw new HttpError(404, 'Cliente non trovato.')
  return client
}

export function createClient(input: CreateClientInput): Client {
  const name = input.name?.trim()
  if (!name) throw new HttpError(400, 'La denominazione del cliente è obbligatoria.')

  const now = nowIso()
  const client: Client = {
    uuid: newUuid(),
    code: nextClientCode(),
    name,
    contact_person: nullable(input.contact_person),
    email: nullable(input.email),
    phone: nullable(input.phone),
    notes: nullable(input.notes),
    start_date: nullable(input.start_date),
    archived: 0,
    created_at: now,
    updated_at: now,
    synced: 0,
    deleted: 0
  }

  getDatabase()
    .prepare(
      `INSERT INTO clients (uuid, code, name, contact_person, email, phone, notes,
                            start_date, archived, created_at, updated_at, synced, deleted)
       VALUES (@uuid, @code, @name, @contact_person, @email, @phone, @notes,
               @start_date, @archived, @created_at, @updated_at, @synced, @deleted)`
    )
    .run(client)

  return client
}

export function setClientArchived(uuid: string, archived: boolean): Client {
  getClient(uuid)
  getDatabase()
    .prepare('UPDATE clients SET archived = ?, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(archived ? 1 : 0, nowIso(), uuid)
  return getClient(uuid)
}

/**
 * Rimozione = soft delete (AGENTS.md §6): il record resta per il sync e per
 * l'audit, con `deleted = 1`. Le aziende del cliente seguono lo stesso destino,
 * insieme agli operatori lato Azienda che vi erano collegati.
 */
export function deleteClient(uuid: string): { companies_deleted: number; users_deleted: number } {
  const db = getDatabase()
  getClient(uuid)
  const now = nowIso()

  const run = db.transaction(() => {
    const users = db
      .prepare(
        `UPDATE users SET deleted = 1, active = 0, updated_at = ?, synced = 0
          WHERE deleted = 0 AND company_uuid IN
                (SELECT uuid FROM companies WHERE client_uuid = ?)`
      )
      .run(now, uuid)

    const companies = db
      .prepare(
        `UPDATE companies SET deleted = 1, updated_at = ?, synced = 0
          WHERE client_uuid = ? AND deleted = 0`
      )
      .run(now, uuid)

    db.prepare('UPDATE clients SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?').run(
      now,
      uuid
    )

    return { companies_deleted: companies.changes, users_deleted: users.changes }
  })

  return run()
}
