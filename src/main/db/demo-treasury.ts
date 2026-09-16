import { addDays, formatDate, parseDate } from '@shared/engine'
import type { TreasuryItemInput } from '@shared/types'
import { createItem, openingCash, todayLocal, updateSettings } from '../server/services/treasury.service'

/**
 * Scadenziario e previsioni della Pizzeria DaProd dimostrativa (Fase 5).
 *
 * A differenza dei bilanci, qui le date sono **relative al giorno in cui la
 * demo parte**: una previsione di cassa guarda avanti da oggi, e una demo
 * aperta fra sei mesi con tutte le scadenze nel passato mostrerebbe solo
 * arretrati. Ci sono di proposito un credito scaduto da oltre 60 giorni, un
 * incasso parziale e un pagamento scaduto: sono i casi che la vista deve saper
 * raccontare. Le rate dei finanziamenti non stanno qui: le genera il piano di
 * ammortamento (vedi demo-banks.ts).
 */

const euro = (value: number): number => Math.round(value * 100)

/** Il giorno `day` del mese di `today`: il punto di partenza di una ricorrenza. */
function giornoDelMese(today: string, day: number): string {
  const t = new Date(parseDate(today))
  return formatDate(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), day))
}

export function seedDemoTreasury(companyUuid: string, today = todayLocal()): void {
  const d = (days: number): string => addDays(today, days)

  const scadenze: TreasuryItemInput[] = [
    // --- crediti ------------------------------------------------------------
    {
      direction: 'in', category: 'Clienti', counterparty: 'Famiglia Rossi',
      description: 'Catering matrimonio', document_ref: 'FT 2026/041',
      payment_method: 'Bonifico', due_date: d(-75), amount_cents: euro(4_800)
    },
    {
      direction: 'in', category: 'Clienti', counterparty: 'Studio Bianchi',
      description: 'Catering aziendale di fine estate', document_ref: 'FT 2026/058',
      payment_method: 'Bonifico', due_date: d(-20), amount_cents: euro(2_200),
      paid_cents: euro(1_000), paid_date: d(-5)
    },
    {
      direction: 'in', category: 'Clienti', counterparty: 'Parrocchia San Rocco',
      description: 'Catering battesimo', document_ref: 'FT 2026/061',
      payment_method: 'Bonifico', due_date: d(-10), amount_cents: euro(1_500),
      paid_cents: euro(1_500), paid_date: d(-8)
    },
    {
      direction: 'in', category: 'Clienti', counterparty: 'Just Eat',
      description: 'Liquidazione ordini delivery', payment_method: 'Bonifico',
      due_date: d(5), amount_cents: euro(3_200)
    },
    {
      direction: 'in', category: 'Clienti', counterparty: 'Deliveroo',
      description: 'Liquidazione ordini delivery', payment_method: 'Bonifico',
      due_date: d(12), amount_cents: euro(2_900)
    },
    {
      direction: 'in', category: 'Clienti', counterparty: 'Glovo',
      description: 'Liquidazione ordini delivery', payment_method: 'Bonifico',
      due_date: d(26), amount_cents: euro(1_900)
    },
    {
      direction: 'in', category: 'Clienti', counterparty: 'Comune di Pizzolandia',
      description: 'Stand alla sagra d\'autunno', document_ref: 'FT 2026/066',
      payment_method: 'Bonifico', due_date: d(48), amount_cents: euro(6_500)
    },

    // --- debiti -------------------------------------------------------------
    {
      direction: 'out', category: 'Fornitori', counterparty: 'Assistenza Forni Srl',
      description: 'Manutenzione straordinaria forno', document_ref: 'FT 318',
      payment_method: 'Bonifico', due_date: d(-12), amount_cents: euro(1_200)
    },
    {
      direction: 'out', category: 'Fornitori', counterparty: 'Imballaggi Sud',
      description: 'Cartoni pizza e confezioni', document_ref: 'FT 1102',
      payment_method: 'RI.BA.', due_date: d(-6), amount_cents: euro(900),
      paid_cents: euro(900), paid_date: d(-6)
    },
    {
      direction: 'out', category: 'Fornitori', counterparty: 'Molino Rossi',
      description: 'Farine', document_ref: 'FT 2211',
      payment_method: 'RI.BA.', due_date: d(8), amount_cents: euro(3_900)
    },
    {
      direction: 'out', category: 'Fornitori', counterparty: 'Caseificio Campano',
      description: 'Mozzarella fior di latte', document_ref: 'FT 874',
      payment_method: 'Bonifico', due_date: d(15), amount_cents: euro(5_600)
    },
    {
      direction: 'out', category: 'Fornitori', counterparty: 'Bevande Srl',
      description: 'Bevande e birre', document_ref: 'FT 5530',
      payment_method: 'RI.BA.', due_date: d(22), amount_cents: euro(2_700)
    },
    {
      direction: 'out', category: 'Fornitori', counterparty: 'Molino Rossi',
      description: 'Farine', document_ref: 'FT 2298',
      payment_method: 'RI.BA.', due_date: d(38), amount_cents: euro(3_700)
    },
    {
      direction: 'out', category: 'Fornitori', counterparty: 'Caseificio Campano',
      description: 'Mozzarella fior di latte', document_ref: 'FT 912',
      payment_method: 'Bonifico', due_date: d(45), amount_cents: euro(5_400)
    }
  ]

  const previsioni: TreasuryItemInput[] = [
    // Ricorrenti: le voci che si ripetono ogni mese.
    {
      direction: 'in', category: 'Corrispettivi',
      description: 'Versamento incassi sala e asporto (prima quindicina)',
      due_date: giornoDelMese(today, 5), amount_cents: euro(31_000), recurrence: 'monthly'
    },
    {
      direction: 'in', category: 'Corrispettivi',
      description: 'Versamento incassi sala e asporto (seconda quindicina)',
      due_date: giornoDelMese(today, 20), amount_cents: euro(31_000), recurrence: 'monthly'
    },
    {
      direction: 'out', category: 'Affitti e locazioni', description: 'Affitto del locale',
      due_date: giornoDelMese(today, 5), amount_cents: euro(6_000), recurrence: 'monthly'
    },
    {
      direction: 'out', category: 'Personale', description: 'Stipendi pizzaioli e sala',
      due_date: giornoDelMese(today, 10), amount_cents: euro(19_500), recurrence: 'monthly'
    },
    {
      direction: 'out', category: 'Imposte e contributi', description: 'F24 contributi e ritenute',
      due_date: giornoDelMese(today, 16), amount_cents: euro(7_800), recurrence: 'monthly'
    },
    {
      direction: 'out', category: 'Utenze', description: 'Luce, gas e acqua',
      due_date: giornoDelMese(today, 20), amount_cents: euro(2_200), recurrence: 'monthly'
    },
    {
      direction: 'out', category: 'Fornitori',
      description: 'Altri acquisti di ingredienti non ancora fatturati (stima)',
      due_date: giornoDelMese(today, 28), amount_cents: euro(14_000), recurrence: 'monthly'
    },
    // Una tantum.
    {
      direction: 'in', category: 'Altre entrate', description: 'Rimborso assicurazione per il guasto al forno',
      due_date: d(33), amount_cents: euro(2_500)
    },
    {
      direction: 'out', category: 'Imposte e contributi', description: 'Acconto IRES e IRAP',
      due_date: d(70), amount_cents: euro(16_000)
    }
  ]

  for (const item of scadenze) createItem(companyUuid, { source: 'scadenziario', ...item })
  for (const item of previsioni) createItem(companyUuid, { source: 'manuale', ...item })

  // Saldo di banca di due giorni fa, coerente con l'ultimo bilancio: la cassa
  // di fine periodo, al netto di quello che è successo dopo.
  const bilancio = openingCash(companyUuid, today)
  const saldo = bilancio.origin === 'bilancio' ? bilancio.cents - euro(4_300) : euro(60_000)
  updateSettings(companyUuid, {
    min_liquidity_cents: euro(25_000),
    opening_cash_cents: saldo,
    opening_cash_date: d(-2)
  })
}
