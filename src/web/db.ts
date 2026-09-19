import { runMigrations } from '../main/db/migrations'
import { CompatDatabase } from './sqlite'

/**
 * Al posto di `src/main/db/index.ts` nella versione Android (lo sostituisce il
 * bundler, vedi vite.android.config.ts): stesse funzioni, ma il database è
 * sql.js in memoria, salvato nell'IndexedDB del telefono dopo ogni modifica.
 *
 * Niente cifratura: è la versione dimostrativa, con soli dati di esempio, e
 * i dati restano nello spazio privato dell'app sul telefono.
 */

let instance: CompatDatabase | null = null

const IDB_NOME = 'daprodfinanza-demo'
const IDB_STORE = 'db'
const IDB_CHIAVE = 'database'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NOME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function leggiSalvato(): Promise<Uint8Array | null> {
  try {
    const db = await idb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_CHIAVE)
      req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function scrivi(dati: Uint8Array | null): Promise<void> {
  const db = await idb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    if (dati) tx.objectStore(IDB_STORE).put(dati, IDB_CHIAVE)
    else tx.objectStore(IDB_STORE).delete(IDB_CHIAVE)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function apriDatabase(db: CompatDatabase): number {
  db.pragma('foreign_keys = ON')
  const version = runMigrations(db as never)
  instance = db
  console.log(`[db] database della demo pronto — schema v${version}`)
  return version
}

let salvate = -1
let inCorso: Promise<void> | null = null

/** Salva se c'è qualcosa di nuovo dall'ultima volta. */
export async function salvaDatabase(): Promise<void> {
  if (!instance || instance.inTransazione || instance.modifiche === salvate) return
  if (inCorso) {
    await inCorso
    return salvaDatabase()
  }
  const versione = instance.modifiche
  const dati = instance.raw.export()
  // Esportare azzera alcune impostazioni della connessione.
  instance.pragma('foreign_keys = ON')
  inCorso = scrivi(dati)
    .then(() => {
      salvate = versione
    })
    .catch((err) => console.error('[db] salvataggio non riuscito:', err))
    .finally(() => {
      inCorso = null
    })
  await inCorso
}

/** "Ricomincia da capo": via il database salvato; al riavvio si ricrea la demo. */
export async function cancellaDatabase(): Promise<void> {
  await scrivi(null)
}

export function openDatabase(): CompatDatabase {
  if (!instance) throw new Error('Database non ancora aperto.')
  return instance
}

export function getDatabase(): CompatDatabase {
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

export function backupDatabase(): string {
  throw new Error('Il backup non c’è nella versione Android: i dati sono solo di esempio.')
}
