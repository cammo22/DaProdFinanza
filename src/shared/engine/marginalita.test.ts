import { describe, expect, it } from 'vitest'
import {
  calcolaVoce,
  costoUtile,
  marginalitaPredefinita,
  menuEngineering,
  normalizzaMarginalita,
  tipoDaAttivita,
  type ContestoCosti,
  type RigaCalcolo,
  type VoceCalcolo
} from './marginalita'

const ctx: ContestoCosti = {
  materiali: new Map([['a', { uuid: 'a', name: 'Farina', unit: 'kg', unit_cost_cents: 1000, waste_pct: 20 }]]),
  costoOrarioPersona: (u) => (u === 'p1' ? 3000 : null),
  costoOrario: 2000
}

const riga = (p: Partial<RigaCalcolo>): RigaCalcolo => ({
  uuid: Math.random().toString(),
  phase: 'preventivo',
  kind: 'materiale',
  material_uuid: null,
  employee_uuid: null,
  description: null,
  qty: 1,
  unit: null,
  unit_cost_cents: null,
  ...p
})

const ricetta: VoceCalcolo = {
  uuid: 'r1',
  kind: 'ricetta',
  name: 'Prova',
  price_cents: 2000,
  vat_pct: 10,
  yield_qty: 2,
  monthly_volume: 100,
  overhead_pct: 20
}

const righe = [
  riga({ kind: 'materiale', material_uuid: 'a', qty: 0.4 }),
  riga({ kind: 'manodopera', qty: 0.5 }),
  riga({ kind: 'esterno', unit_cost_cents: 300, qty: 1 })
]

describe('marginalità (conti fatti a mano)', () => {
  it('lo scarto alza il costo utile: 10 €/kg con il 20% di scarto = 12,50 €/kg', () => {
    expect(costoUtile({ unit_cost_cents: 1000, waste_pct: 20 })).toBe(1250)
  })

  it('ricetta da due porzioni: costi per porzione, generali, margini, food cost', () => {
    const c = calcolaVoce(ricetta, righe, ctx, { ...marginalitaPredefinita('ristorazione'), obiettivoFoodCost: 25 })
    // 0,4 kg × 12,50 = 5,00 € → 2,50 a porzione · 0,5 h × 20 € = 10 € → 5,00 · esterno 3 € → 1,50
    expect(c.materiali).toBe(250)
    expect(c.manodopera).toBe(500)
    expect(c.esterni).toBe(150)
    expect(c.diretti).toBe(900)
    expect(c.generali).toBe(180) // 20% del diretto
    expect(c.costoPieno).toBe(1080)
    expect(c.margineContribuzione).toBe(1100)
    expect(c.margineNetto).toBe(920)
    expect(c.marginePct).toBeCloseTo(46)
    expect(c.foodCostPct).toBeCloseTo(12.5)
    expect(c.ricaricoPct).toBeCloseTo(122.22, 1)
    expect(c.prezzoIvato).toBe(2200)
    // Food cost al 25%: 2,50 / 0,25 = 10,00 €
    expect(c.prezzoConsigliato).toBe(1000)
    expect(c.costiMancanti).toBe(false)
  })

  it('fuori dalla ristorazione il prezzo consigliato rispetta il margine obiettivo', () => {
    const c = calcolaVoce({ ...ricetta, kind: 'prodotto' }, righe, ctx, { ...marginalitaPredefinita('produzione'), obiettivoMargine: 20 })
    expect(c.prezzoConsigliato).toBe(1350) // 10,80 / 0,8
  })

  it('una commessa è un totale; la manodopera di una persona usa il suo costo orario', () => {
    const c = calcolaVoce(
      { ...ricetta, kind: 'commessa', yield_qty: 10, overhead_pct: null, price_cents: 100_000 },
      [riga({ kind: 'manodopera', employee_uuid: 'p1', qty: 10 }), riga({ kind: 'materiale', material_uuid: 'a', qty: 2 })],
      ctx,
      marginalitaPredefinita('servizi')
    )
    expect(c.manodopera).toBe(30_000)
    expect(c.materiali).toBe(2_500)
    expect(c.generali).toBe(4_875) // 15% di 32.500
    expect(c.margineNetto).toBe(100_000 - 37_375)
  })

  it('segnala le righe senza un costo', () => {
    const c = calcolaVoce(ricetta, [riga({ kind: 'materiale', material_uuid: 'sparito', qty: 1 })], ctx, marginalitaPredefinita('ristorazione'))
    expect(c.costiMancanti).toBe(true)
    expect(c.materiali).toBe(0)
  })
})

describe('menu engineering', () => {
  it('stelle, cavalli da lavoro, enigmi e cani', () => {
    const r = menuEngineering([
      { uuid: 'A', volume: 100, margine: 300 },
      { uuid: 'B', volume: 10, margine: 500 },
      { uuid: 'C', volume: 60, margine: 100 },
      { uuid: 'D', volume: 30, margine: 150 }
    ])
    // Quota media 50, soglia al 70% = 35; margine medio pesato = 45.500 / 200 = 227,5
    expect(r.sogliaVolume).toBe(35)
    expect(r.margineMedio).toBe(227.5)
    expect(Object.fromEntries(r.classi)).toEqual({ A: 'stella', B: 'enigma', C: 'cavallo', D: 'cane' })
  })
})

describe('tipo di attività', () => {
  it('dal testo dell’anagrafica', () => {
    expect(tipoDaAttivita('Ristorazione')).toBe('ristorazione')
    expect(tipoDaAttivita('Pizzeria')).toBe('ristorazione')
    expect(tipoDaAttivita('Edilizia')).toBe('servizi')
    expect(tipoDaAttivita('Commercio al dettaglio')).toBe('commercio')
    expect(tipoDaAttivita('Produzione di mobili')).toBe('produzione')
  })

  it('le impostazioni restano nei limiti', () => {
    const n = normalizzaMarginalita({ tipo: 'inventato', obiettivoFoodCost: 150, costoOrarioCents: '1950' }, marginalitaPredefinita('ristorazione'))
    expect(n.tipo).toBe('ristorazione')
    expect(n.obiettivoFoodCost).toBe(95)
    expect(n.costoOrarioCents).toBe(1950)
    expect(normalizzaMarginalita({ costoOrarioCents: null }, n).costoOrarioCents).toBeNull()
  })
})
