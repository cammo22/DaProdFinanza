import type { Database } from 'better-sqlite3-multiple-ciphers'
import { up as up001 } from './001_initial'
import { up as up002 } from './002_financial_model'

export interface Migration {
  version: number
  name: string
  up: (db: Database) => void
}

/**
 * Migrazioni versionate (AGENTS.md §13, Fase 2 "migrazioni versionate").
 * La versione applicata è tenuta in `PRAGMA user_version`.
 * Aggiungere sempre in coda, mai riscrivere una migrazione già rilasciata.
 */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_initial', up: up001 },
  { version: 2, name: '002_financial_model', up: up002 }
]

export function runMigrations(db: Database): number {
  const current = db.pragma('user_version', { simple: true }) as number
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version)

  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db)
      db.pragma(`user_version = ${migration.version}`)
    })
    apply()
    console.log(`[db] migrazione applicata: ${migration.name}`)
  }

  return db.pragma('user_version', { simple: true }) as number
}
