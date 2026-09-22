import Database from 'better-sqlite3-multiple-ciphers'
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { backupRoot, databaseFile } from '../lib/paths'
import { databaseKey } from '../lib/secrets'
import { runMigrations } from './migrations'

/**
 * Database SQLite cifrato a riposo (SQLCipher via better-sqlite3-multiple-ciphers)
 * — AGENTS.md §2/§12: i dati finanziari (saldi banca, fidi, utili) sono più
 * sensibili di un CRM, quindi il DB nasce cifrato invece di aggiungerlo dopo.
 *
 * La chiave a 256 bit è generata al primo avvio e custodita da DPAPI
 * (`lib/secrets.ts`): non esiste in chiaro su disco.
 */
let instance: Database.Database | null = null

export function openDatabase(): Database.Database {
  if (instance) return instance

  const file = databaseFile()
  const db = new Database(file)

  db.pragma(`cipher = 'sqlcipher'`)
  db.pragma(`key = "x'${databaseKey()}'"`)
  // Subito dopo la chiave: se un'altra copia sta ancora chiudendo il file,
  // anche la prima lettura e le migrazioni aspettano invece di fallire.
  db.pragma('busy_timeout = 10000')

  // Prima lettura: fallisce subito e con un errore chiaro se la chiave non apre il file.
  try {
    db.prepare('SELECT count(*) AS n FROM sqlite_master').get()
  } catch (cause) {
    db.close()
    throw new Error(
      `Impossibile aprire il database cifrato (${file}). ` +
        'La chiave di cifratura non corrisponde: il file appartiene a un’altra installazione ' +
        'oppure i segreti in userData/secrets sono stati rimossi.',
      { cause }
    )
  }

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const version = runMigrations(db)
  console.log(`[db] aperto ${file} — schema v${version}`)

  instance = db
  return db
}

export function getDatabase(): Database.Database {
  if (!instance) throw new Error('Database non ancora aperto.')
  return instance
}

export function isDatabaseHealthy(): boolean {
  try {
    getDatabase().prepare('SELECT 1').get()
    return true
  } catch {
    return false
  }
}

export function closeDatabase(): void {
  instance?.close()
  instance = null
}

/**
 * Backup del database (pulsante "Backup" della status bar — AGENTS.md §7).
 * Usa l'API di backup online di SQLite via VACUUM INTO: il file prodotto resta cifrato
 * con la stessa chiave, quindi è leggibile solo da questa installazione.
 */
export function backupDatabase(
  target = join(backupRoot(), `daprodfinanza-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
): string {
  const db = getDatabase()

  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  } catch {
    // WAL attivo o VACUUM INTO non disponibile: ripiego sulla copia del file.
    db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(databaseFile(), target)
  }

  return target
}
