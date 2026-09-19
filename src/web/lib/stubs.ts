/**
 * Al posto di tre moduli di `src/main` nella versione Android (lo decide
 * vite.android.config.ts):
 *
 * - `build-flags.ts`: la versione Android è sempre e solo la demo;
 * - `lib/paths.ts`: sul telefono non ci sono cartelle di lavoro;
 * - `lib/secrets.ts`: la demo non cifra il database e non firma sessioni.
 */
export const DEMO_BUILD = true

export const ROOT_FOLDER_NAME = 'DaProdFinanza Demo'
const nessuna = (): string => '/'
export const dataRoot = nessuna
export const companiesRoot = nessuna
export const companyFolder = nessuna
export const backupRoot = nessuna
export const userDataDir = nessuna
export const secretsDir = nessuna
export const databaseFile = nessuna

export const getOrCreateSecret = (): string => ''
export const databaseKey = (): string => ''
export const jwtSecret = (): string => ''
