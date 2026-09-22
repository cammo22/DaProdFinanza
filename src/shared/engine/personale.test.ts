import { describe, expect, it } from 'vitest'
import {
  costoDipendente,
  flussiPersonale,
  normalizzaPersonale,
  PERSONALE_PREDEFINITO,
  riepilogoPersonale,
  type DipendenteCalcolo
} from './personale'

const base: DipendenteCalcolo = {
  uuid: 'd1',
  name: 'Prova',
  department: 'Cucina',
  contract: 'indeterminato',
  hours_week: 40,
  gross_annual_cents: 3_000_000,
  monthly_payments: 14,
  employer_contrib_pct: null,
  inail_pct: null,
  other_costs_cents: 100_000,
  direct: 1,
  start_date: null,
  end_date: null
}

describe('costo del personale', () => {
  it('costo aziendale e costo orario di un tempo pieno (conti fatti a mano)', () => {
    // RAL 30.000 € · contributi 30% = 9.000 · INAIL 1% = 300 · TFR 30.000/13,5 = 2.222,22 · altri 1.000
    const c = costoDipendente(base, PERSONALE_PREDEFINITO)
    expect(c.contributi).toBe(900_000)
    expect(c.inail).toBe(30_000)
    expect(c.tfr).toBe(222_222)
    expect(c.totale).toBe(4_252_222)
    expect(c.fte).toBe(1)
    expect(c.oreAnno).toBe(1720)
    // 42.522,22 € / 1.720 ore = 24,72 €/h
    expect(c.costoOrario).toBe(2472)
    expect(c.mensile).toBe(354_352)
  })

  it('part-time: le ore in proporzione, il costo orario non cambia', () => {
    const c = costoDipendente({ ...base, hours_week: 24, gross_annual_cents: 1_800_000, other_costs_cents: 60_000 }, PERSONALE_PREDEFINITO)
    expect(c.fte).toBeCloseTo(0.6)
    expect(c.oreAnno).toBe(1032)
    // 18.000 + 5.400 + 180 + 1.333,33 + 600 = 25.513,33 € / 1.032 h = 24,72 €/h
    expect(c.totale).toBe(2_551_333)
    expect(c.costoOrario).toBe(2472)
  })

  it('apprendista con contributi ridotti, collaboratore senza TFR', () => {
    const a = costoDipendente({ ...base, contract: 'apprendistato', gross_annual_cents: 1_900_000, employer_contrib_pct: 11.61, other_costs_cents: 0 }, PERSONALE_PREDEFINITO)
    expect(a.contributi).toBe(220_590)
    const co = costoDipendente({ ...base, contract: 'collaborazione' }, PERSONALE_PREDEFINITO)
    expect(co.tfr).toBe(0)
  })

  it('riepilogo: solo chi è in forza, diretti e indiretti, reparti', () => {
    const lista: DipendenteCalcolo[] = [
      base,
      { ...base, uuid: 'd2', department: 'Amministrazione', direct: 0 },
      { ...base, uuid: 'd3', end_date: '2026-01-31' }
    ]
    const r = riepilogoPersonale(lista, PERSONALE_PREDEFINITO, '2026-09-21')
    expect(r.persone).toBe(2)
    expect(r.fte).toBe(2)
    expect(r.totale).toBe(8_504_444)
    expect(r.diretti).toBe(4_252_222)
    expect(r.indiretti).toBe(4_252_222)
    expect(r.costoOrarioDiretti).toBe(2472)
    expect(r.perReparto.map((x) => x.reparto).sort()).toEqual(['Amministrazione', 'Cucina'])
  })

  it('le impostazioni fuori misura tornano nei limiti', () => {
    const n = normalizzaPersonale({ contributiPct: '31,5', oreAnnue: 99999, giornoStipendio: 40, inTesoreria: true })
    expect(n.contributiPct).toBe(31.5)
    expect(n.oreAnnue).toBe(2500)
    expect(n.giornoStipendio).toBe(28)
    expect(n.inTesoreria).toBe(true)
  })
})

describe('stipendi e F24 in tesoreria', () => {
  // RAL 26.000 € su 13 mensilità: 2.000 € lordi al mese, dicembre doppio.
  const d: DipendenteCalcolo = { ...base, gross_annual_cents: 2_600_000, monthly_payments: 13, other_costs_cents: 0 }
  const flussi = flussiPersonale([d], PERSONALE_PREDEFINITO, '2026-11-20', 2)
  const trova = (id: string) => flussi.find((f) => f.uuid === `personale#${id}`)

  it('lo stipendio di novembre si paga il 10 dicembre, netto delle trattenute', () => {
    expect(trova('stipendi-2026-11')).toMatchObject({ due_date: '2026-12-10', amount_cents: 150_000, category: 'Personale', source: 'personale' })
    // F24: trattenute 500 € + contributi 30% di 2.000 = 600 €
    expect(trova('f24-2026-11')).toMatchObject({ due_date: '2026-12-16', amount_cents: 110_000, category: 'Imposte e contributi' })
  })

  it('dicembre porta la tredicesima', () => {
    expect(trova('stipendi-2026-12')).toMatchObject({ due_date: '2027-01-10', amount_cents: 300_000 })
    expect(trova('f24-2026-12')?.amount_cents).toBe(220_000)
  })

  it('niente movimenti già passati; INAIL il 16 febbraio', () => {
    expect(trova('stipendi-2026-10')).toBeUndefined()
    expect(trova('f24-2026-10')).toBeUndefined()
    expect(trova('inail-2026')).toBeUndefined()
    expect(trova('inail-2027')).toMatchObject({ due_date: '2027-02-16', amount_cents: 26_000 })
  })
})
