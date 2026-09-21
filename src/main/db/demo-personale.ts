import { saveEmployee } from '../server/services/personale.service'

/**
 * Il personale della Pizzeria DaProd (demo): dieci persone fra cucina, sala e
 * amministrazione. Il costo aziendale che ne esce (circa 300.000 € l'anno) sta
 * vicino al costo del personale scritto nel bilancio dimostrativo, così il
 * confronto fra "calcolato" e "a bilancio" dice qualcosa di sensato.
 *
 * Nomi di fantasia. La tesoreria resta spenta: la demo ha già "Stipendi" e
 * "F24" fra le previsioni manuali.
 */

interface Persona {
  name: string
  role: string
  department: string
  contract: 'indeterminato' | 'determinato' | 'apprendistato'
  hours_week: number
  ral: number
  direct: 0 | 1
  start_date: string
  contributi?: number
  altri?: number
}

const PERSONE: Persona[] = [
  { name: 'Marco Esposito', role: 'Pizzaiolo capo', department: 'Cucina', contract: 'indeterminato', hours_week: 40, ral: 32_000, direct: 1, start_date: '2019-03-01' },
  { name: 'Luigi Russo', role: 'Pizzaiolo', department: 'Cucina', contract: 'indeterminato', hours_week: 40, ral: 26_000, direct: 1, start_date: '2021-05-10' },
  { name: 'Salvatore De Luca', role: 'Aiuto pizzaiolo', department: 'Cucina', contract: 'apprendistato', hours_week: 40, ral: 19_000, direct: 1, start_date: '2025-02-03', contributi: 11.61 },
  { name: 'Anna Romano', role: 'Cuoca', department: 'Cucina', contract: 'indeterminato', hours_week: 40, ral: 25_000, direct: 1, start_date: '2020-09-14' },
  { name: 'Ciro Ferrara', role: 'Lavapiatti', department: 'Cucina', contract: 'determinato', hours_week: 30, ral: 14_500, direct: 1, start_date: '2026-03-01' },
  { name: 'Giulia Marino', role: 'Responsabile di sala', department: 'Sala', contract: 'indeterminato', hours_week: 40, ral: 27_000, direct: 1, start_date: '2018-06-01' },
  { name: 'Francesco Greco', role: 'Cameriere', department: 'Sala', contract: 'indeterminato', hours_week: 40, ral: 21_500, direct: 1, start_date: '2022-04-04' },
  { name: 'Sara Bruno', role: 'Cameriera', department: 'Sala', contract: 'determinato', hours_week: 24, ral: 12_800, direct: 1, start_date: '2026-04-15' },
  { name: 'Davide Costa', role: 'Cameriere (stagione)', department: 'Sala', contract: 'determinato', hours_week: 30, ral: 15_500, direct: 1, start_date: '2026-05-01' },
  { name: 'Elena Ricci', role: 'Amministrazione e acquisti', department: 'Amministrazione', contract: 'indeterminato', hours_week: 30, ral: 22_000, direct: 0, start_date: '2023-01-09', altri: 600 }
]

export function seedDemoPersonale(companyUuid: string): void {
  for (const p of PERSONE) {
    saveEmployee(companyUuid, {
      name: p.name,
      role: p.role,
      department: p.department,
      contract: p.contract,
      ccnl_level: 'CCNL Turismo — Pubblici esercizi',
      hours_week: p.hours_week,
      gross_annual_cents: p.ral * 100,
      monthly_payments: 14,
      employer_contrib_pct: p.contributi ?? null,
      inail_pct: null,
      // Buoni pasto e formazione.
      other_costs_cents: (p.altri ?? 800) * 100,
      direct: p.direct,
      start_date: p.start_date,
      end_date: null,
      notes: null
    })
  }
}
