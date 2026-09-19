import { is } from '@electron-toolkit/utils'
import { createClient } from '../server/services/clients.service'
import { createCompany } from '../server/services/companies.service'
import { insertUser } from '../server/services/auth.service'
import { DEMO_BUILD } from '../build-flags'
import { seedDemoActivities } from './demo-activities'
import { seedDemoFinancials } from './demo-data'
import { seedDemoBanks } from './demo-banks'
import { seedDemoTreasury } from './demo-treasury'
import { getDatabase } from './index'

/**
 * Seed dimostrativo: un cliente, la sua azienda e i due account che servono a
 * provare i ruoli di AGENTS.md §4 senza passare dal wizard di primo avvio.
 *
 * ⚠️ Non deve MAI finire in un'installazione reale: sono credenziali note e con
 * password fuori policy. Gira solo in sviluppo (`npm run dev`) oppure con
 * `DAPROD_DEMO=1` impostata a mano, nella versione demo costruita da
 * `npm run dist:demo`, e solo su un database ancora vuoto. La versione demo usa
 * una cartella dati tutta sua (vedi build-flags.ts).
 */
export const DEMO_PASSWORD = '1234'

export interface DemoAccount {
  role: 'consultant' | 'company'
  username: string
  password: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'consultant', username: 'cammo', password: DEMO_PASSWORD },
  { role: 'company', username: 'Pizzeria DaProd', password: DEMO_PASSWORD }
]

export function isDemoMode(): boolean {
  return DEMO_BUILD || is.dev || process.env['DAPROD_DEMO'] === '1'
}

/** true quando il seed è attivo e i dati sono effettivamente presenti. */
export function demoDataAvailable(): boolean {
  if (!isDemoMode()) return false
  const row = getDatabase()
    .prepare(`SELECT count(*) AS n FROM users WHERE username = ? AND deleted = 0`)
    .get(DEMO_ACCOUNTS[0].username) as { n: number }
  return row.n > 0
}

export function seedDemoData(): void {
  if (!isDemoMode()) return

  const row = getDatabase()
    .prepare('SELECT count(*) AS n FROM users WHERE deleted = 0')
    .get() as { n: number }
  if (row.n > 0) {
    aggiornaDemoEsistente()
    return
  }

  const client = createClient({
    name: 'Gruppo DaProd',
    contact_person: 'Camillo',
    email: 'demo@daprod.example',
    start_date: '2026-01-07'
  })

  const company = createCompany({
    client_uuid: client.uuid,
    name: 'Pizzeria DaProd S.r.l.',
    vat_number: '01234567890',
    legal_form: 'SRL',
    business_type: 'Ristorazione',
    start_date: '2026-01-07',
    notes: 'Azienda dimostrativa creata dal seed di sviluppo.'
  })

  // I bilanci: 2025 completo, 2026 fino ad agosto, budget 2026.
  seedDemoFinancials(company.uuid)
  // Scadenziario e previsioni di cassa, con date relative a oggi.
  seedDemoTreasury(company.uuid)
  // Istituti, linee di credito e finanziamenti.
  seedDemoBanks(company.uuid)
  // Attività e ore del consulente.
  seedDemoActivities(company.uuid)

  insertUser(
    {
      username: DEMO_ACCOUNTS[0].username,
      password: DEMO_ACCOUNTS[0].password,
      full_name: 'Camillo — Consulente',
      role: 'consultant',
      company_uuid: null
    },
    { enforcePasswordPolicy: false }
  )

  insertUser(
    {
      username: DEMO_ACCOUNTS[1].username,
      password: DEMO_ACCOUNTS[1].password,
      full_name: 'Pizzeria DaProd',
      role: 'company',
      company_uuid: company.uuid
    },
    { enforcePasswordPolicy: false }
  )

  console.log('[db] seed dimostrativo creato (cammo / Pizzeria DaProd)')
}

/**
 * Un database dimostrativo creato da una versione precedente non ha le
 * tabelle arrivate dopo: le si riempie una volta sola, senza toccare il resto.
 */
function aggiornaDemoEsistente(): void {
  const db = getDatabase()
  const azienda = db
    .prepare(`SELECT uuid FROM companies WHERE vat_number = '01234567890' AND deleted = 0`)
    .get() as { uuid: string } | undefined
  if (!azienda) return

  const tesoreria = db
    .prepare(
      `SELECT (SELECT count(*) FROM treasury_items WHERE company_uuid = ?)
            + (SELECT count(*) FROM company_treasury_settings WHERE company_uuid = ?) AS n`
    )
    .get(azienda.uuid, azienda.uuid) as { n: number }
  if (tesoreria.n === 0) {
    seedDemoTreasury(azienda.uuid)
    console.log('[db] seed dimostrativo: aggiunta la tesoreria della Pizzeria DaProd')
  }

  const banche = db
    .prepare('SELECT count(*) AS n FROM banks WHERE company_uuid = ?')
    .get(azienda.uuid) as { n: number }
  if (banche.n === 0) {
    // Fino alla Fase 5 la rata del mutuo era una previsione manuale: ora la
    // genera il piano di ammortamento, e tenerle entrambe la conterebbe due volte.
    db.prepare(
      `UPDATE treasury_items SET deleted = 1, updated_at = ?, synced = 0
        WHERE company_uuid = ? AND source = 'manuale' AND deleted = 0
          AND description = 'Rata mutuo ristrutturazione'`
    ).run(new Date().toISOString(), azienda.uuid)
    seedDemoBanks(azienda.uuid)
    console.log('[db] seed dimostrativo: aggiunti banche e finanziamenti della Pizzeria DaProd')
  }

  const attivita = db
    .prepare('SELECT count(*) AS n FROM tasks WHERE company_uuid = ?')
    .get(azienda.uuid) as { n: number }
  if (attivita.n === 0) {
    seedDemoActivities(azienda.uuid)
    console.log('[db] seed dimostrativo: aggiunte attività e ore della Pizzeria DaProd')
  }
}
