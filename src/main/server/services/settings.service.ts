import {
  normalizzaApp,
  normalizzaPortale,
  normalizzaUtente,
  type AppSettings,
  type PortalSettings,
  type UserSettings
} from '@shared/settings'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'

/**
 * Impostazioni salvate nel database (tabella `settings`, migrazione 008).
 *
 * Ogni gruppo è una riga con il valore in JSON. Chi legge riceve sempre un
 * oggetto completo: i predefiniti e i controlli stanno in `shared/settings.ts`,
 * quindi un valore scritto da una versione vecchia (o rovinato) torna al
 * predefinito invece di rompere la schermata.
 */

type Scope = 'app' | 'user' | 'company'

/** Il valore grezzo di un gruppo, o `undefined` se non è mai stato salvato. */
export function leggiImpostazione(scope: Scope, owner: string | null, key: string): unknown {
  const row = getDatabase()
    .prepare(
      `SELECT value FROM settings
        WHERE scope = ? AND ifnull(owner_uuid, '') = ? AND key = ? AND deleted = 0`
    )
    .get(scope, owner ?? '', key) as { value: string } | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.value)
  } catch {
    return undefined
  }
}

export function scriviImpostazione(scope: Scope, owner: string | null, key: string, value: unknown): void {
  const db = getDatabase()
  const now = nowIso()
  const json = JSON.stringify(value)
  const esistente = db
    .prepare(
      `SELECT uuid FROM settings
        WHERE scope = ? AND ifnull(owner_uuid, '') = ? AND key = ? AND deleted = 0`
    )
    .get(scope, owner ?? '', key) as { uuid: string } | undefined
  if (esistente) {
    db.prepare('UPDATE settings SET value = ?, updated_at = ?, synced = 0 WHERE uuid = ?').run(
      json,
      now,
      esistente.uuid
    )
  } else {
    db.prepare(
      `INSERT INTO settings (uuid, scope, owner_uuid, key, value, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`
    ).run(newUuid(), scope, owner, key, json, now, now)
  }
}

// --- programma ------------------------------------------------------------------

export function getAppSettings(): AppSettings {
  return normalizzaApp(leggiImpostazione('app', null, 'programma'))
}

export function saveAppSettings(input: unknown): AppSettings {
  const next = normalizzaApp(input, getAppSettings())
  scriviImpostazione('app', null, 'programma', next)
  return next
}

// --- utente -----------------------------------------------------------------------

export function getUserSettings(userUuid: string): UserSettings {
  return normalizzaUtente(leggiImpostazione('user', userUuid, 'preferenze'))
}

export function saveUserSettings(userUuid: string, input: unknown): UserSettings {
  const next = normalizzaUtente(input, getUserSettings(userUuid))
  scriviImpostazione('user', userUuid, 'preferenze', next)
  return next
}

// --- azienda: cosa vede e cosa può fare l'operatore Azienda --------------------

export function getPortalSettings(companyUuid: string): PortalSettings {
  return normalizzaPortale(leggiImpostazione('company', companyUuid, 'portale'))
}

export function savePortalSettings(companyUuid: string, input: unknown): PortalSettings {
  const next = normalizzaPortale(input, getPortalSettings(companyUuid))
  scriviImpostazione('company', companyUuid, 'portale', next)
  return next
}
