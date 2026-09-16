import { addDays, addMonths, formatDate, parseDate } from '@shared/engine'
import { saveBank, saveLine, saveLoan } from '../server/services/banks.service'
import { todayLocal } from '../server/services/treasury.service'

/**
 * Banche e finanziamenti della Pizzeria DaProd dimostrativa (Fase 6).
 *
 * Come per la tesoreria, le date sono relative al primo avvio: un mutuo con
 * la prima rata fissa nel 2024 sarebbe finito, in una demo aperta fra qualche
 * anno. Tre istituti, le linee tipiche di un ristorante (fido, anticipo delle
 * fatture di catering, carta aziendale) e tre piani diversi: un mutuo
 * francese, un leasing col riscatto e un finanziamento con preammortamento.
 */

const euro = (value: number): number => Math.round(value * 100)

/** Il 28 del mese, `months` mesi prima (o dopo) di oggi. */
function il28(today: string, months: number): string {
  const t = new Date(parseDate(addMonths(today, months)))
  return formatDate(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 28))
}

export function seedDemoBanks(companyUuid: string, today = todayLocal()): void {
  const vesuvio = saveBank(companyUuid, {
    name: 'Banca del Vesuvio',
    branch: 'Filiale di Pizzolandia centro',
    contact: 'Dott.ssa Esposito'
  })
  const partenopeo = saveBank(companyUuid, { name: 'Credito Partenopeo', branch: 'Agenzia 12' })
  const leasing = saveBank(companyUuid, { name: 'Sud Leasing', notes: 'Società di leasing strumentale' })

  saveLine(companyUuid, {
    bank_uuid: vesuvio.uuid, kind: 'fido_cassa', label: 'Fido di cassa c/c',
    granted_cents: euro(30_000), used_cents: euro(8_500), used_as_of: addDays(today, -2),
    annual_rate_percent: 6.9, expiry_date: addMonths(today, 7)
  })
  saveLine(companyUuid, {
    bank_uuid: vesuvio.uuid, kind: 'anticipo_fatture', label: 'Anticipo fatture catering',
    granted_cents: euro(20_000), used_cents: euro(4_000), used_as_of: addDays(today, -2),
    annual_rate_percent: 5.4, expiry_date: addMonths(today, 7)
  })
  saveLine(companyUuid, {
    bank_uuid: partenopeo.uuid, kind: 'carta', label: 'Carta aziendale',
    granted_cents: euro(5_000), used_cents: euro(1_200), used_as_of: addDays(today, -2)
  })
  saveLine(companyUuid, {
    bank_uuid: partenopeo.uuid, kind: 'fido_cassa', label: 'Fido di cassa c/c',
    granted_cents: euro(15_000), used_cents: euro(12_900), used_as_of: addDays(today, -2),
    annual_rate_percent: 7.4, expiry_date: addMonths(today, 3),
    notes: 'Utilizzato quasi per intero: da rinegoziare.'
  })

  saveLoan(companyUuid, {
    bank_uuid: vesuvio.uuid, kind: 'mutuo', label: 'Mutuo ristrutturazione del locale',
    principal_cents: euro(130_000), annual_rate_percent: 4.2,
    first_due_date: il28(today, -32), installments: 96, frequency: 'monthly',
    grace_installments: 0, amortization: 'francese', balloon_cents: 0
  })
  saveLoan(companyUuid, {
    bank_uuid: leasing.uuid, kind: 'leasing', label: 'Leasing forno a legna e abbattitore',
    principal_cents: euro(38_000), annual_rate_percent: 5.5,
    first_due_date: il28(today, -14), installments: 60, frequency: 'monthly',
    grace_installments: 0, amortization: 'francese', balloon_cents: euro(3_800)
  })
  saveLoan(companyUuid, {
    bank_uuid: partenopeo.uuid, kind: 'finanziamento', label: 'Finanziamento liquidità garantito',
    principal_cents: euro(40_000), annual_rate_percent: 3.9,
    first_due_date: il28(today, -5), installments: 20, frequency: 'quarterly',
    grace_installments: 4, amortization: 'italiano', balloon_cents: 0
  })
}
