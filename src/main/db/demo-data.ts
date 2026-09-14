import { incomeAggregates, type EngineAccount } from '@shared/engine'
import type { AccountType, Scenario } from '@shared/types'
import { newUuid, nowIso } from '../lib/ids'
import { getDatabase } from './index'

/**
 * Bilanci dimostrativi della Pizzeria DaProd.
 *
 * Servono a far vedere il programma a pieno regime a chi lo prova: dodici mesi
 * del 2025 più il bilancio annuale, il 2026 fino ad agosto e il budget 2026.
 * Così si accendono tutte le colonne del conto economico, i grafici hanno una
 * serie da disegnare e gli indici hanno numeri da pizzeria, non da multinazionale.
 *
 * I numeri sono inventati ma coerenti: le imposte seguono l'utile, lo stato
 * patrimoniale quadra per costruzione (gli utili portati a nuovo chiudono la
 * differenza), il mutuo scende, il fondo ammortamento sale, la cassa cresce con
 * gli utili accumulati.
 */

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

/** Stagionalità di una pizzeria: estate e dicembre in alto, inizio anno in basso. */
const STAGIONE = [0.82, 0.85, 0.95, 1.0, 1.05, 1.12, 1.18, 1.1, 1.0, 0.95, 0.92, 1.08]

interface ContoDemo {
  code: string
  name: string
  section: string
  type: AccountType
  detail?: string
  pct?: number
}

const CONTI: ContoDemo[] = [
  // Conto economico
  { code: '60.01', name: 'Incassi sala e asporto', section: 'ricavi_operativi', type: 'RICAVO' },
  { code: '60.02', name: 'Delivery e catering', section: 'ricavi_operativi', type: 'RICAVO' },
  { code: '60.20', name: 'Rimanenze finali di prodotti', section: 'rimanenze_finali_ricavo', type: 'RICAVO' },
  { code: '60.30', name: 'Sopravvenienze attive', section: 'proventi_straordinari', type: 'RICAVO' },
  { code: '60.40', name: 'Interessi attivi bancari', section: 'proventi_finanziari', type: 'RICAVO' },
  { code: '70.01', name: 'Rimanenze iniziali', section: 'esistenze_iniziali', type: 'COSTO', pct: 100 },
  { code: '70.10', name: 'Farine, mozzarella e ingredienti', section: 'costi_materie_prime', type: 'COSTO', pct: 100 },
  { code: '70.11', name: 'Bevande', section: 'costi_materie_prime', type: 'COSTO', pct: 100 },
  { code: '70.20', name: 'Gas, legna e confezioni', section: 'costi_produzione', type: 'COSTO', pct: 100 },
  { code: '70.30', name: 'Ammortamento forni e attrezzature', section: 'ammortamenti_operativi', type: 'COSTO', pct: 0 },
  { code: '70.40', name: 'Stipendi pizzaioli e sala', section: 'costi_personale', type: 'COSTO', pct: 70 },
  { code: '70.41', name: 'Contributi e TFR', section: 'costi_personale', type: 'COSTO', pct: 70 },
  { code: '70.50', name: 'Commissioni app di consegna', section: 'costi_commerciali', type: 'COSTO', pct: 0 },
  { code: '70.51', name: 'Pubblicità e social', section: 'costi_commerciali', type: 'COSTO', pct: 0 },
  { code: '70.60', name: 'Affitto del locale', section: 'costi_generali_amministrativi', type: 'COSTO', pct: 0 },
  { code: '70.61', name: 'Utenze', section: 'costi_generali_amministrativi', type: 'COSTO', pct: 0 },
  { code: '70.62', name: 'Commercialista e consulenze', section: 'costi_generali_amministrativi', type: 'COSTO', pct: 0 },
  { code: '70.70', name: 'Ammortamento arredi', section: 'ammortamenti_non_operativi', type: 'COSTO', pct: 0 },
  { code: '70.80', name: 'Sopravvenienze passive', section: 'oneri_straordinari', type: 'COSTO', pct: 0 },
  { code: '70.90', name: 'Interessi sul mutuo', section: 'oneri_finanziari', type: 'COSTO', pct: 0 },
  { code: '70.99', name: 'IRES e IRAP', section: 'imposte', type: 'COSTO', pct: 0 },

  // Stato patrimoniale — attivo
  { code: '10.01', name: 'Software di cassa e sito', section: 'immobilizzazioni_immateriali', type: "ATTIVITA'" },
  { code: '11.01', name: 'Forni, banconi e attrezzature', section: 'immobilizzazioni_materiali', type: "ATTIVITA'" },
  { code: '11.09', name: 'Fondo ammortamento attrezzature', section: 'immobilizzazioni_materiali', type: "ATTIVITA' NEGATIVO" },
  { code: '20.01', name: 'Magazzino ingredienti e bevande', section: 'rimanenze_finali_magazzino', type: "ATTIVITA'" },
  { code: '21.01', name: 'Crediti verso piattaforme e catering', section: 'liquidita_differite', type: "ATTIVITA'", detail: 'Crediti Commerciali' },
  { code: '21.02', name: 'Crediti diversi', section: 'liquidita_differite', type: "ATTIVITA'", detail: 'Crediti Diversi' },
  { code: '21.03', name: 'Erario c/IVA', section: 'liquidita_differite', type: "ATTIVITA'", detail: 'Erario c/IVA' },
  { code: '22.01', name: 'Banca c/c', section: 'liquidita_immediate', type: "ATTIVITA'" },

  // Stato patrimoniale — passivo
  { code: '30.01', name: 'Capitale sociale', section: 'patrimonio_netto', type: "PASSIVITA'" },
  { code: '30.02', name: 'Utili portati a nuovo', section: 'patrimonio_netto', type: "PASSIVITA'", detail: 'Utile a nuovo' },
  { code: '40.01', name: 'Mutuo ristrutturazione locale', section: 'debiti_medio_lungo', type: "PASSIVITA'" },
  { code: '40.02', name: 'Fondo TFR', section: 'debiti_medio_lungo', type: "PASSIVITA'", detail: 'Fondo TFR' },
  { code: '50.01', name: 'Fornitori ingredienti', section: 'debiti_breve', type: "PASSIVITA'", detail: 'Debiti v/Fornitori (costi variabili)' },
  { code: '50.02', name: 'Fornitori servizi', section: 'debiti_breve', type: "PASSIVITA'", detail: 'Debiti v/Fornitori (costi fissi)' },
  { code: '50.03', name: 'Debiti v/INPS e INAIL', section: 'debiti_breve', type: "PASSIVITA'", detail: 'Debiti v/Enti Previdenziali' },
  { code: '50.04', name: 'Debiti diversi', section: 'debiti_breve', type: "PASSIVITA'", detail: 'Debiti Diversi' }
]

type Valori = Record<string, number>

/** Mesi trascorsi da gennaio 2025: fa scorrere mutuo, fondi e TFR. */
const mesiDaInizio = (year: number, month: number): number => (year - 2025) * 12 + (month - 1)

/** Ricavi e costi di un mese, in euro. Le imposte si aggiungono dopo, sull'utile. */
function flussi(year: number, month: number, scenario: Scenario): Valori {
  const s = STAGIONE[month - 1]
  const crescita = year === 2025 ? 1 : scenario === 'budget' ? 1.08 : 1.06
  // Un po' di irregolarità sul consuntivo, così i grafici non sembrano disegnati col righello.
  const rumore = scenario === 'budget' ? 1 : 1 + 0.03 * Math.sin(month * 1.7 + year)
  const k = s * crescita * rumore
  // Il personale segue la stagione solo in parte: i contratti non spariscono a gennaio.
  const personale = 0.55 + 0.45 * s

  return {
    '60.01': 62_000 * k,
    '60.02': 16_000 * k,
    '60.20': 1_500,
    '60.30': month % 4 === 0 ? 600 : 0,
    '60.40': 40,
    '70.01': 1_400,
    '70.10': 17_500 * k,
    '70.11': 4_500 * k,
    '70.20': 4_500 * k,
    '70.30': 1_800,
    '70.40': 20_000 * personale,
    '70.41': 6_000 * personale,
    '70.50': 2_400 * k,
    '70.51': 1_100,
    '70.60': 6_000,
    '70.61': 2_200 * (0.85 + 0.15 * s),
    '70.62': 800,
    '70.70': 400,
    '70.80': month % 5 === 0 ? 350 : 0,
    '70.90': Math.max(250, 700 - 12 * mesiDaInizio(year, month))
  }
}

const inCentesimi = (euro: number): number => Math.round(euro * 100)

function contiMotore(valori: Valori): EngineAccount[] {
  return CONTI.filter((c) => c.code in valori).map((c) => ({
    code: c.code,
    name: c.name,
    section_code: c.section,
    account_type: c.type,
    detail_tag: c.detail ?? null,
    amount_cents: inCentesimi(valori[c.code])
  }))
}

/** Aggiunge le imposte (24% dell'utile ante imposte) e restituisce l'utile netto. */
function conImposte(valori: Valori): { valori: Valori; utile: number } {
  const ante = incomeAggregates(contiMotore(valori)).utileAnteImposte / 100
  const imposte = Math.max(0, Math.round(ante * 0.24))
  return { valori: { ...valori, '70.99': imposte }, utile: ante - imposte }
}

/** Stato patrimoniale a fine mese, in euro. Quadra per costruzione. */
function stock(year: number, month: number, utileCumulato: number): Valori {
  const s = STAGIONE[month - 1]
  const mesi = mesiDaInizio(year, month)

  const attivo: Valori = {
    '10.01': 15_000,
    '11.01': 180_000,
    '11.09': 60_000 + 1_800 * mesi,
    '20.01': 9_000 * (0.85 + 0.15 * s),
    '21.01': 6_500 * s,
    '21.02': 1_500,
    '21.03': 2_000,
    '22.01': 38_000 + 0.55 * utileCumulato
  }
  const debiti: Valori = {
    '30.01': 20_000,
    '40.01': Math.max(0, 110_000 - 1_500 * mesi),
    '40.02': 28_000 + 400 * mesi,
    '50.01': 13_000 * s,
    '50.02': 4_000,
    '50.03': 6_500,
    '50.04': 3_000
  }

  const totaleAttivo = Object.entries(attivo).reduce(
    (somma, [code, v]) => somma + (code === '11.09' ? -v : v),
    0
  )
  const totaleDebiti = Object.values(debiti).reduce((somma, v) => somma + v, 0)

  // Gli utili portati a nuovo chiudono il bilancio: attivo − tutto il resto.
  return { ...attivo, ...debiti, '30.02': totaleAttivo - totaleDebiti }
}

export function seedDemoFinancials(companyUuid: string): void {
  const db = getDatabase()
  const now = nowIso()

  const run = db.transaction(() => {
    const insertAccount = db.prepare(
      `INSERT INTO accounts (uuid, company_uuid, code, name, section_code, account_type, detail_tag,
                             direct_cost_pct, active, notes, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, 0, 0)`
    )
    const uuidPerCodice = new Map<string, string>()
    for (const conto of CONTI) {
      const uuid = newUuid()
      insertAccount.run(
        uuid, companyUuid, conto.code, conto.name, conto.section, conto.type,
        conto.detail ?? null, conto.pct ?? null, now, now
      )
      uuidPerCodice.set(conto.code, uuid)
    }

    const insertPeriod = db.prepare(
      `INSERT INTO fiscal_periods (uuid, company_uuid, period_type, year, month, label, closed,
                                   created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0)`
    )
    const periodi = new Map<string, string>()
    const periodo = (year: number, month: number | null): string => {
      const chiave = `${year}-${month ?? 0}`
      let uuid = periodi.get(chiave)
      if (!uuid) {
        uuid = newUuid()
        insertPeriod.run(
          uuid, companyUuid, month === null ? 'year' : 'month', year, month,
          month === null ? String(year) : `${MESI[month - 1]} ${year}`, now, now
        )
        periodi.set(chiave, uuid)
      }
      return uuid
    }

    const insertBalance = db.prepare(
      `INSERT INTO account_balances (uuid, company_uuid, account_uuid, period_uuid, scenario,
                                     amount_cents, import_document_uuid, created_at, updated_at,
                                     synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, 0)`
    )
    const scrivi = (periodUuid: string, scenario: Scenario, valori: Valori): void => {
      for (const [code, euro] of Object.entries(valori)) {
        insertBalance.run(
          newUuid(), companyUuid, uuidPerCodice.get(code), periodUuid, scenario,
          inCentesimi(euro), now, now
        )
      }
    }

    // --- Consuntivo: 2025 intero, 2026 fino ad agosto -----------------------
    let utileCumulato = 0
    const annoDuemila25: Valori = {}
    let utileAnnoCumulatoFineAnno = 0

    const mesiConsuntivo: [number, number][] = [
      ...Array.from({ length: 12 }, (_, i) => [2025, i + 1] as [number, number]),
      ...Array.from({ length: 8 }, (_, i) => [2026, i + 1] as [number, number])
    ]

    for (const [year, month] of mesiConsuntivo) {
      const { valori, utile } = conImposte(flussi(year, month, 'actual'))
      utileCumulato += utile
      const patrimonio = stock(year, month, utileCumulato)
      scrivi(periodo(year, month), 'actual', { ...valori, ...patrimonio })

      if (year === 2025) {
        for (const [code, v] of Object.entries(valori)) {
          annoDuemila25[code] = (annoDuemila25[code] ?? 0) + v
        }
        if (month === 12) utileAnnoCumulatoFineAnno = utileCumulato
      }
    }

    // --- Bilancio annuale 2025: flussi sommati, stato patrimoniale a dicembre --
    scrivi(periodo(2025, null), 'actual', {
      ...annoDuemila25,
      ...stock(2025, 12, utileAnnoCumulatoFineAnno)
    })

    // --- Budget 2026: tutti i mesi, obiettivo di crescita dell'8% -----------
    let utileBudget = utileAnnoCumulatoFineAnno
    for (let month = 1; month <= 12; month++) {
      const { valori, utile } = conImposte(flussi(2026, month, 'budget'))
      utileBudget += utile
      scrivi(periodo(2026, month), 'budget', { ...valori, ...stock(2026, month, utileBudget) })
    }
  })

  run()
}
