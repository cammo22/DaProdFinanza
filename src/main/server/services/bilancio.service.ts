import { INCOME_SECTIONS, incomeAggregates, type EngineAccount, type IncomeAggregates } from '@shared/engine'
import type { Scenario } from '@shared/types'
import { engineAccounts, listPeriods } from './analysis.service'

/**
 * Il conto economico di un anno "recente": gli ultimi 12 mesi a consuntivo se
 * ci sono tutti, altrimenti l'ultimo bilancio annuale. Serve alle sezioni che
 * confrontano un calcolo col bilancio (Personale: il costo calcolato contro
 * quello scritto nei conti; Area fiscale: le imposte stimate sull'utile).
 */

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

export interface ContoEconomicoRecente {
  /** "12 mesi fino a Agosto 2026" oppure "Anno 2025". */
  label: string
  aggregates: IncomeAggregates
  /** Anno a cui si riferisce (quello dell'ultimo mese). */
  anno: number
}

function somma(liste: EngineAccount[][]): EngineAccount[] {
  const perCodice = new Map<string, EngineAccount>()
  for (const lista of liste) {
    for (const a of lista) {
      const c = perCodice.get(a.code)
      if (c) c.amount_cents += a.amount_cents
      else perCodice.set(a.code, { ...a })
    }
  }
  return [...perCodice.values()]
}

export function contoEconomicoRecente(
  companyUuid: string,
  scenario: Scenario = 'actual'
): ContoEconomicoRecente | null {
  const periodi = listPeriods(companyUuid).filter((p) => p.scenarios?.includes(scenario))
  const economici = (uuid: string): EngineAccount[] =>
    engineAccounts(companyUuid, uuid, scenario).filter((a) => INCOME_SECTIONS.includes(a.section_code))

  // I periodi arrivano dal più recente: il primo mese con 12 mesi completi alle spalle.
  for (const p of periodi) {
    if (p.period_type !== 'month' || p.month === null) continue
    const liste: EngineAccount[][] = []
    for (let i = 11; i >= 0; i--) {
      const indice = p.year * 12 + (p.month - 1) - i
      const anno = Math.floor(indice / 12)
      const mese = (indice % 12) + 1
      const q = periodi.find((x) => x.period_type === 'month' && x.year === anno && x.month === mese)
      const conti = q ? economici(q.uuid) : []
      if (conti.length === 0) break
      liste.push(conti)
    }
    if (liste.length === 12) {
      return { label: `12 mesi fino a ${MESI[p.month - 1]} ${p.year}`, aggregates: incomeAggregates(somma(liste)), anno: p.year }
    }
    break
  }
  const annuale = periodi.find((p) => p.period_type === 'year')
  if (annuale) {
    const conti = economici(annuale.uuid)
    if (conti.length) return { label: `Anno ${annuale.year}`, aggregates: incomeAggregates(conti), anno: annuale.year }
  }
  return null
}
