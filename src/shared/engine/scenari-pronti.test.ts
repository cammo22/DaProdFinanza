import { describe, expect, it } from 'vitest'
import { SCENARI_PRONTI } from './scenari-pronti'
import { PARAMETRI_ZERO } from './simulation'

const contesto = { ricavi: 100_000_000, dso: 45, dio: 20, dpo: 60 }

describe('scenari pronti', () => {
  it('sono almeno dieci, con identificativi unici', () => {
    expect(SCENARI_PRONTI.length).toBeGreaterThanOrEqual(10)
    expect(new Set(SCENARI_PRONTI.map((s) => s.id)).size).toBe(SCENARI_PRONTI.length)
  })

  it('toccano solo leve che esistono, con numeri validi', () => {
    for (const s of SCENARI_PRONTI) {
      const leve = s.leve(contesto)
      expect(Object.keys(leve).length).toBeGreaterThan(0)
      for (const [k, v] of Object.entries(leve)) {
        expect(k in PARAMETRI_ZERO).toBe(true)
        if (v !== null) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('gli estremi sono due e dichiarano di essere solo per test', () => {
    const estremi = SCENARI_PRONTI.filter((s) => s.tono === 'estremo')
    expect(estremi).toHaveLength(2)
    for (const s of estremi) expect(s.nome).toMatch(/solo test/)
  })

  it('importi in proporzione ai ricavi e giorni mai negativi', () => {
    const espansione = SCENARI_PRONTI.find((s) => s.id === 'espansione')!.leve(contesto)
    expect(espansione.investimentoCents).toBe(20_000_000)
    const fornitori = SCENARI_PRONTI.find((s) => s.id === 'fornitori')!.leve({ ...contesto, dpo: 10 })
    expect(fornitori.dpoTarget).toBe(0)
  })
})
