import { safeStorage } from 'electron'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { secretsDir } from './paths'

/**
 * Segreti per-installazione (chiave del database, segreto JWT) — AGENTS.md §12.
 *
 * Non vengono MAI scritti in chiaro su disco: sono cifrati con DPAPI tramite
 * `safeStorage` di Electron, come in IrideeCRM. Se DPAPI non è disponibile
 * l'app si ferma con un errore esplicito invece di degradare a file in chiaro.
 */

function secretPath(name: string): string {
  return join(secretsDir(), `${name}.bin`)
}

function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Cifratura di sistema non disponibile (DPAPI). ' +
        'DaProdFinanza non avvia il database senza poter proteggere la chiave.'
    )
  }
}

/**
 * Restituisce il segreto `name`, creandolo al primo avvio con `bytes` byte casuali.
 * Il valore torna come stringa esadecimale.
 */
export function getOrCreateSecret(name: string, bytes = 32): string {
  assertEncryptionAvailable()
  const file = secretPath(name)

  if (existsSync(file)) {
    const decrypted = safeStorage.decryptString(readFileSync(file))
    if (decrypted.length > 0) return decrypted
  }

  const created = randomBytes(bytes).toString('hex')
  writeFileSync(file, safeStorage.encryptString(created), { mode: 0o600 })
  return created
}

/** Chiave AES a 256 bit del database SQLite cifrato (hex, 64 caratteri). */
export function databaseKey(): string {
  return getOrCreateSecret('db-key', 32)
}

/** Segreto di firma dei JWT, diverso per ogni installazione — §12. */
export function jwtSecret(): string {
  return getOrCreateSecret('jwt-secret', 48)
}
