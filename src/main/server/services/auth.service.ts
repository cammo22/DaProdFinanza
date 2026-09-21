import { ROLE_LABELS, type Role } from '@shared/enums'
import type { LoginResponse, Profile, SessionUser, User, UserListItem } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { hashPassword, validatePassword, verifyPassword } from '../../lib/password'
import { signToken } from '../../lib/tokens'
import { HttpError } from '../http-error'

type UserRow = User & { password_hash: string }

/** Telefono o email facoltativi: vuoto diventa null, troppo lungo è un errore. */
function recapito(value: unknown, campo: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new HttpError(400, `${campo} non valido.`)
  const t = value.trim()
  if (t.length > 120) throw new HttpError(400, `${campo}: al massimo 120 caratteri.`)
  return t || null
}

function toSessionUser(row: UserRow): SessionUser {
  return {
    uuid: row.uuid,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    company_uuid: row.company_uuid
  }
}

/** L'installazione è "configurata" quando esiste almeno un utente — §10.1 primo avvio. */
export function isConfigured(): boolean {
  const row = getDatabase()
    .prepare('SELECT count(*) AS n FROM users WHERE deleted = 0')
    .get() as { n: number }
  return row.n > 0
}

function findByUsername(username: string): UserRow | undefined {
  return getDatabase()
    .prepare('SELECT * FROM users WHERE username = ? AND deleted = 0')
    .get(username.trim()) as UserRow | undefined
}

/**
 * Inserimento a basso livello. `enforcePasswordPolicy: false` è usato solo dal
 * seed dimostrativo (`db/seed.ts`), che crea account con password corte
 * volutamente memorabili; tutto ciò che passa dalla REST usa il default.
 */
export function insertUser(
  input: {
    username: string
    password: string
    full_name: string
    role: Role
    company_uuid: string | null
    phone?: string | null
    email?: string | null
  },
  options: { enforcePasswordPolicy?: boolean } = {}
): SessionUser {
  const username = (input.username ?? '').trim()
  if (username.length < 3) throw new HttpError(400, 'Lo username deve avere almeno 3 caratteri.')
  if (!(input.full_name ?? '').trim()) throw new HttpError(400, 'Il nome completo è obbligatorio.')
  if (typeof input.password !== 'string') throw new HttpError(400, 'La password è obbligatoria.')

  if (options.enforcePasswordPolicy !== false) {
    const passwordError = validatePassword(input.password)
    if (passwordError) throw new HttpError(400, passwordError)
  }

  if (findByUsername(username)) {
    throw new HttpError(409, `Lo username "${username}" è già in uso.`)
  }

  const now = nowIso()
  const row: UserRow = {
    uuid: newUuid(),
    username,
    password_hash: hashPassword(input.password),
    full_name: input.full_name.trim(),
    role: input.role,
    company_uuid: input.company_uuid,
    active: 1,
    last_login: null,
    phone: recapito(input.phone, 'Telefono'),
    email: recapito(input.email, 'Email'),
    created_at: now,
    updated_at: now,
    synced: 0,
    deleted: 0
  }

  getDatabase()
    .prepare(
      `INSERT INTO users (uuid, username, password_hash, full_name, role, company_uuid,
                          active, last_login, phone, email, created_at, updated_at, synced, deleted)
       VALUES (@uuid, @username, @password_hash, @full_name, @role, @company_uuid,
               @active, @last_login, @phone, @email, @created_at, @updated_at, @synced, @deleted)`
    )
    .run(row)

  return toSessionUser(row)
}

/**
 * Primo avvio: crea l'account Consulente (Master). Consentito solo finché
 * l'installazione non è configurata — dopo, gli utenti si creano da autenticati.
 */
export function setupFirstConsultant(input: {
  username: string
  password: string
  full_name: string
}): LoginResponse {
  if (isConfigured()) {
    throw new HttpError(409, 'Questa installazione è già configurata.')
  }
  const user = insertUser({ ...input, role: 'consultant', company_uuid: null })
  return { token: signToken(user), user }
}

/** Operatore lato Azienda (§4): vede soltanto la propria azienda. */
export function createCompanyUser(input: {
  username: string
  password: string
  full_name: string
  company_uuid: string
  phone?: string | null
  email?: string | null
}): SessionUser {
  const exists = getDatabase()
    .prepare('SELECT uuid FROM companies WHERE uuid = ? AND deleted = 0')
    .get(input.company_uuid)
  if (!exists) throw new HttpError(404, 'Azienda non trovata.')

  return insertUser({
    username: input.username,
    password: input.password,
    full_name: input.full_name,
    role: 'company',
    company_uuid: input.company_uuid,
    phone: input.phone,
    email: input.email
  })
}

/**
 * Un collega dello studio (versione 1.3.0). I consulenti sono gli
 * amministratori: vedono tutte le aziende e gestiscono gli accessi.
 */
export function createConsultant(input: {
  username: string
  password: string
  full_name: string
  phone?: string | null
  email?: string | null
}): SessionUser {
  return insertUser({ ...input, role: 'consultant', company_uuid: null })
}

/**
 * `expectedRole` arriva dal selettore di ruolo iniziale della UI: serve solo a
 * dare un errore comprensibile a chi sbaglia porta d'ingresso, non è un
 * controllo di sicurezza (il ruolo vero resta quello scritto nel token).
 */
export function login(username: string, password: string, expectedRole?: Role): LoginResponse {
  const row = findByUsername(username ?? '')
  // Messaggio volutamente identico per utente inesistente e password errata.
  const invalid = new HttpError(401, 'Username o password non validi.')

  if (!row || !verifyPassword(password ?? '', row.password_hash)) throw invalid
  if (!row.active) {
    throw new HttpError(
      403,
      row.role === 'company'
        ? 'Questo accesso è disattivato: chiedi al tuo consulente di riattivarlo.'
        : 'Questo accesso è disattivato: può riattivarlo un altro consulente dello studio.'
    )
  }

  if (expectedRole && row.role !== expectedRole) {
    throw new HttpError(
      403,
      `Questo è un account ${ROLE_LABELS[row.role]}. Torna indietro e scegli "${ROLE_LABELS[row.role]}".`
    )
  }

  const now = nowIso()
  getDatabase()
    .prepare('UPDATE users SET last_login = ?, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(now, now, row.uuid)

  const user = toSessionUser(row)
  return { token: signToken(user), user }
}

/** Tutti gli accessi, consulenti prima; `companyUuid` restringe a quelli di un'azienda. */
export function listUsers(companyUuid?: string): UserListItem[] {
  const filtro = companyUuid ? 'AND u.company_uuid = ?' : ''
  return getDatabase()
    .prepare(
      `SELECT u.uuid, u.username, u.full_name, u.role, u.company_uuid, u.active, u.last_login,
              u.phone, u.email, u.created_at, u.updated_at, c.name AS company_name
         FROM users u
         LEFT JOIN companies c ON c.uuid = u.company_uuid
        WHERE u.deleted = 0 ${filtro}
        ORDER BY u.role DESC, u.full_name COLLATE NOCASE`
    )
    .all(...(companyUuid ? [companyUuid] : [])) as UserListItem[]
}

function getUserRow(uuid: string): UserRow {
  const row = getDatabase()
    .prepare('SELECT * FROM users WHERE uuid = ? AND deleted = 0')
    .get(uuid) as UserRow | undefined
  if (!row) throw new HttpError(404, 'Utente non trovato.')
  return row
}

/** Quanti consulenti possono ancora entrare, escluso eventualmente uno. */
function consulentiAttivi(tranne?: string): number {
  const row = getDatabase()
    .prepare(
      `SELECT count(*) AS n FROM users
        WHERE role = 'consultant' AND active = 1 AND deleted = 0 AND uuid <> ?`
    )
    .get(tranne ?? '') as { n: number }
  return row.n
}

/**
 * Modifica di un accesso da parte di un consulente: nome, recapiti, attivo sì/no.
 * Due guardie: non ci si disattiva da soli (si resterebbe chiusi fuori a metà
 * lavoro) e non si spegne l'ultimo consulente (nessuno potrebbe più riaccenderlo).
 */
export function updateUser(
  uuid: string,
  input: { full_name?: unknown; phone?: unknown; email?: unknown; active?: unknown },
  actorUuid: string
): UserListItem {
  const row = getUserRow(uuid)
  const fullName =
    input.full_name === undefined ? row.full_name : typeof input.full_name === 'string' ? input.full_name.trim() : ''
  if (!fullName) throw new HttpError(400, 'Il nome completo è obbligatorio.')
  const phone = input.phone === undefined ? row.phone : recapito(input.phone, 'Telefono')
  const email = input.email === undefined ? row.email : recapito(input.email, 'Email')
  const active = input.active === undefined ? row.active : input.active ? 1 : 0

  if (!active && row.active) {
    if (uuid === actorUuid) throw new HttpError(409, 'Non puoi disattivare il tuo stesso accesso.')
    if (row.role === 'consultant' && consulentiAttivi(uuid) === 0) {
      throw new HttpError(409, "È l'ultimo consulente attivo: senza, nessuno potrebbe più entrare.")
    }
  }

  getDatabase()
    .prepare(
      `UPDATE users SET full_name = ?, phone = ?, email = ?, active = ?, updated_at = ?, synced = 0
        WHERE uuid = ?`
    )
    .run(fullName, phone, email, active, nowIso(), uuid)
  return listUsers().find((u) => u.uuid === uuid)!
}

/** Un consulente assegna una password nuova (chi l'ha dimenticata non può farlo da sé). */
export function resetPassword(uuid: string, password: unknown): { uuid: string } {
  getUserRow(uuid)
  if (typeof password !== 'string') throw new HttpError(400, 'La password è obbligatoria.')
  const errore = validatePassword(password)
  if (errore) throw new HttpError(400, errore)
  getDatabase()
    .prepare('UPDATE users SET password_hash = ?, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(hashPassword(password), nowIso(), uuid)
  return { uuid }
}

export function deleteUser(uuid: string, actorUuid: string): { uuid: string } {
  const row = getUserRow(uuid)
  if (uuid === actorUuid) throw new HttpError(409, 'Non puoi eliminare il tuo stesso accesso.')
  if (row.role === 'consultant' && row.active && consulentiAttivi(uuid) === 0) {
    throw new HttpError(409, "È l'ultimo consulente attivo: senza, nessuno potrebbe più entrare.")
  }
  getDatabase()
    .prepare('UPDATE users SET deleted = 1, active = 0, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { uuid }
}

// --- il proprio profilo ---------------------------------------------------------

export function getProfile(uuid: string): Profile {
  const row = getUserRow(uuid)
  return { ...toSessionUser(row), phone: row.phone ?? null, email: row.email ?? null }
}

/** Ognuno cambia da sé nome e recapiti; lo username resta quello (serve a entrare). */
export function updateProfile(uuid: string, input: { full_name?: unknown; phone?: unknown; email?: unknown }): Profile {
  updateUser(uuid, { full_name: input.full_name, phone: input.phone, email: input.email }, uuid)
  return getProfile(uuid)
}

export function changeOwnPassword(uuid: string, current: unknown, next: unknown): { uuid: string } {
  const row = getUserRow(uuid)
  if (typeof current !== 'string' || !verifyPassword(current, row.password_hash)) {
    throw new HttpError(400, 'La password attuale non è corretta.')
  }
  return resetPassword(uuid, next)
}

/**
 * Un accesso disattivato o eliminato smette di funzionare subito, non alla
 * scadenza della sessione: il controllo è su ogni richiesta (`requireAuth`).
 */
export function isUserActive(uuid: string): boolean {
  const row = getDatabase()
    .prepare('SELECT active FROM users WHERE uuid = ? AND deleted = 0')
    .get(uuid) as { active: number } | undefined
  return row?.active === 1
}
