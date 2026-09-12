import { ROLE_LABELS, type Role } from '@shared/enums'
import type { LoginResponse, SessionUser, User } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { hashPassword, validatePassword, verifyPassword } from '../../lib/password'
import { signToken } from '../../lib/tokens'
import { HttpError } from '../http-error'

type UserRow = User & { password_hash: string }

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
  },
  options: { enforcePasswordPolicy?: boolean } = {}
): SessionUser {
  const username = input.username.trim()
  if (username.length < 3) throw new HttpError(400, 'Lo username deve avere almeno 3 caratteri.')
  if (!input.full_name.trim()) throw new HttpError(400, 'Il nome completo è obbligatorio.')

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
    created_at: now,
    updated_at: now,
    synced: 0,
    deleted: 0
  }

  getDatabase()
    .prepare(
      `INSERT INTO users (uuid, username, password_hash, full_name, role, company_uuid,
                          active, last_login, created_at, updated_at, synced, deleted)
       VALUES (@uuid, @username, @password_hash, @full_name, @role, @company_uuid,
               @active, @last_login, @created_at, @updated_at, @synced, @deleted)`
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
    company_uuid: input.company_uuid
  })
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
  if (!row.active) throw new HttpError(403, 'Account disattivato.')

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

export function listUsers(): Omit<User, 'password_hash'>[] {
  return getDatabase()
    .prepare(
      `SELECT uuid, username, full_name, role, company_uuid, active, last_login,
              created_at, updated_at, synced, deleted
         FROM users WHERE deleted = 0 ORDER BY role, username`
    )
    .all() as Omit<User, 'password_hash'>[]
}
