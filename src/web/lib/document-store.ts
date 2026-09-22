import { nomeSicuro } from '@shared/documents'

/**
 * Al posto di `src/main/lib/document-store.ts` nella versione Android: i file
 * del cassetto stanno nell'IndexedDB del telefono, in un archivio separato da
 * quello del database (così il database resta piccolo da salvare a ogni
 * modifica). Stesse funzioni, stesse chiavi.
 */

const NOME = 'daprodfinanza-documenti'
const STORE = 'file'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function salvaDocumento(
  companyCode: string,
  uuid: string,
  nome: string,
  bytes: Uint8Array
): Promise<string> {
  const chiave = `aziende/${companyCode}/documenti/${uuid}/${nomeSicuro(nome)}`
  const db = await idb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(bytes, chiave)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return chiave
}

export function percorsoDocumento(): string | null {
  return null
}

export async function leggiDocumento(storageKey: string): Promise<Uint8Array> {
  const db = await idb()
  const dati = await new Promise<Uint8Array | undefined>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(storageKey)
    req.onsuccess = () => resolve(req.result as Uint8Array | undefined)
    req.onerror = () => reject(req.error)
  })
  if (!dati) throw new Error('Il file non si trova più in questo telefono.')
  return dati
}

export async function statoDocumento(storageKey: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const dati = await leggiDocumento(storageKey)
    return { size: dati.byteLength, mtimeMs: 0 }
  } catch {
    return null
  }
}

export function cartellaDocumento(): string | null {
  return null
}

export const APERTURA_ESTERNA = false
