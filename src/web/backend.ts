import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import { seedDemoData } from '../main/db/seed'
import { createServerApp } from '../main/server'
import { apriDatabase, leggiSalvato, salvaDatabase } from './db'
import { CompatDatabase } from './sqlite'
import type { App, Risposta } from './shims/express'

/**
 * Il backend della versione Android: lo stesso Express del programma per
 * computer (stesse rotte, stessi servizi, stesso motore di calcolo), ma
 * dentro la pagina, sopra un SQLite in WebAssembly.
 */

let app: App | null = null

export async function avviaBackend(): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const salvato = await leggiSalvato()
  try {
    apriDatabase(new CompatDatabase(new SQL.Database(salvato ?? undefined)))
  } catch (err) {
    // Un salvataggio rovinato non deve bloccare la demo: si riparte da zero.
    console.error('[db] database salvato illeggibile, riparto dai dati di esempio:', err)
    apriDatabase(new CompatDatabase(new SQL.Database()))
  }
  seedDemoData()
  await salvaDatabase()

  app = createServerApp() as unknown as App
}

export async function richiesta(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<Risposta> {
  if (!app) throw new Error('Backend non ancora pronto.')
  const risposta = await app.richiesta(method, url, headers, body)
  if (method.toUpperCase() !== 'GET') void salvaDatabase()
  return risposta
}
