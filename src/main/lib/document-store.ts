import { existsSync, mkdirSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { nomeSicuro } from '@shared/documents'
import { companiesRoot, dataRoot } from './paths'

/**
 * Dove stanno i file del cassetto documenti (AGENTS.md §10.13).
 *
 * Sul computer: `Documenti/DaProdFinanza/aziende/<codice>/documenti/<uuid>/<nome>`,
 * accanto alle cartelle `import/` ed `export/` di §8. Una cartella per file,
 * col nome originale dentro: aprendolo con Excel o col lettore PDF, la
 * finestra mostra il nome vero e non un codice. Il database tiene solo la
 * chiave (il percorso relativo a Documenti/DaProdFinanza) e l'impronta.
 *
 * Nella versione Android questo modulo è sostituito da `src/web/lib/document-store.ts`
 * (i file stanno nel database del browser): stesse funzioni.
 */

export async function salvaDocumento(
  companyCode: string,
  uuid: string,
  nome: string,
  bytes: Uint8Array
): Promise<string> {
  const cartella = join(companiesRoot(), companyCode, 'documenti', uuid)
  if (!existsSync(cartella)) mkdirSync(cartella, { recursive: true })
  const file = join(cartella, nomeSicuro(nome))
  await writeFile(file, bytes)
  return relative(dataRoot(), file).split(sep).join('/')
}

/**
 * Il percorso assoluto di un documento, solo se sta davvero dentro la cartella
 * delle aziende: una chiave manomessa ("../../Windows/…") non porta fuori.
 */
export function percorsoDocumento(storageKey: string): string | null {
  const radice = resolve(companiesRoot())
  const file = resolve(dataRoot(), storageKey)
  if (!file.startsWith(radice + sep)) return null
  return file
}

export async function leggiDocumento(storageKey: string): Promise<Uint8Array> {
  const file = percorsoDocumento(storageKey)
  if (!file || !existsSync(file)) {
    throw new Error('Il file non si trova più sul disco: forse è stato spostato o cancellato a mano.')
  }
  // Un Buffer (che è un Uint8Array): Express lo manda così com'è, senza JSON.
  return readFile(file)
}

/** Peso e data di modifica sul disco: se qualcuno l'ha cambiato aprendolo con Excel, si vede. */
export async function statoDocumento(storageKey: string): Promise<{ size: number; mtimeMs: number } | null> {
  const file = percorsoDocumento(storageKey)
  if (!file || !existsSync(file)) return null
  const s = await stat(file)
  return { size: s.size, mtimeMs: s.mtimeMs }
}

/** true se la cartella del documento esiste (serve ai controlli, non alla UI). */
export function cartellaDocumento(storageKey: string): string | null {
  const file = percorsoDocumento(storageKey)
  return file ? dirname(file) : null
}

/** Sul computer i file si aprono anche col programma di sistema; sul telefono no. */
export const APERTURA_ESTERNA = true
