import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Struttura dati su disco — AGENTS.md §8.
 *
 *   Documenti/DaProdFinanza/
 *   ├── aziende/[codice-azienda]/{import,export,backup}
 *   └── backup/
 *
 * Il database e i segreti vivono invece in userData (non in Documenti):
 * non sono file che l'utente deve aprire a mano.
 */
export const ROOT_FOLDER_NAME = 'DaProdFinanza'

function ensure(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function dataRoot(): string {
  return ensure(join(app.getPath('documents'), ROOT_FOLDER_NAME))
}

export function companiesRoot(): string {
  return ensure(join(dataRoot(), 'aziende'))
}

/** Cartelle di lavoro di una singola azienda (import/export/backup) — §8. */
export function companyFolder(companyCode: string): string {
  const base = ensure(join(companiesRoot(), companyCode))
  ensure(join(base, 'import'))
  ensure(join(base, 'export'))
  ensure(join(base, 'backup'))
  return base
}

export function backupRoot(): string {
  return ensure(join(dataRoot(), 'backup'))
}

export function userDataDir(): string {
  return ensure(app.getPath('userData'))
}

export function secretsDir(): string {
  return ensure(join(userDataDir(), 'secrets'))
}

export function databaseFile(): string {
  return join(userDataDir(), 'daprodfinanza.db')
}
