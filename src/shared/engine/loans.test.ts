import { describe, expect, it } from 'vitest'
import {
  creditSummary,
  debtServiceNext12Months,
  loanStatus,
  loanTreasuryItems,
  schedule,
  validateLoan,
  type LoanInput
} from './loans'

/**
 * Piani di ammortamento con numeri da manuale: 12.000 € al 6% nominale annuo
 * in 12 rate mensili. La rata francese vale 1.032,80 € — il valore delle
 * tabelle di matematica finanziaria.
 */

function prestito(extra: Partial<LoanInput> = {}): LoanInput {
  return {
    uuid: 'p1',
    kind: 'finanziamento',
    label: 'Prestito',
    principal_cents: 12_000_00,
    annual_rate_percent: 6,
    first_due_date: '2026-01-31',
    installments: 12,
    frequency: 'monthly',
    grace_installments: 0,
    amortization: 'francese',
    balloon_cents: 0,
    ...extra
  }
}

const somma = (valori: number[]): number => valori.reduce((s, v) => s + v, 0)

describe('piano di ammortamento', () => {
  it('francese: rata costante da 1.032,80 €, capitale restituito al centesimo', () => {
    const piano = schedule(prestito())
    expect(piano).toHaveLength(12)
    expect(piano[0]).toMatchObject({ interest: 60_00, total: 1_032_80, capital: 972_80 })
    // Tutte le rate uguali, tranne l'ultima che assorbe gli arrotondamenti.
    expect(new Set(piano.slice(0, 11).map((r) => r.total))).toEqual(new Set([1_032_80]))
    expect(Math.abs(piano[11]!.total - 1_032_80)).toBeLessThanOrEqual(5)
    expect(somma(piano.map((r) => r.capital))).toBe(12_000_00)
    expect(piano[11]!.residual).toBe(0)
  })

  it('le date scorrono di un mese e il 31 si adatta ai mesi corti', () => {
    const piano = schedule(prestito())
    expect(piano.slice(0, 3).map((r) => r.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('italiano: quota capitale costante, interessi che scendono', () => {
    const piano = schedule(prestito({ amortization: 'italiano' }))
    expect(piano.every((r) => r.capital === 1_000_00)).toBe(true)
    expect(piano[0]!.total).toBe(1_060_00)
    expect(piano[11]!.total).toBe(1_005_00)
    expect(piano[11]!.residual).toBe(0)
  })

  it('preammortamento: solo interessi, poi il piano normale', () => {
    const piano = schedule(prestito({ installments: 14, grace_installments: 2 }))
    expect(piano.slice(0, 2)).toMatchObject([
      { capital: 0, interest: 60_00, residual: 12_000_00, grace: true },
      { capital: 0, interest: 60_00, residual: 12_000_00, grace: true }
    ])
    expect(piano[2]!.total).toBe(1_032_80)
    expect(piano[13]!.residual).toBe(0)
  })

  it('tasso zero: rate uguali di solo capitale', () => {
    const piano = schedule(prestito({ annual_rate_percent: 0 }))
    expect(piano.every((r) => r.total === 1_000_00 && r.interest === 0)).toBe(true)
  })

  it('trimestrale: tasso di periodo a un quarto dell\'annuo', () => {
    const piano = schedule(prestito({ frequency: 'quarterly', installments: 4 }))
    expect(piano[0]!.interest).toBe(180_00)
    expect(piano.map((r) => r.date)).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31'])
    expect(piano[3]!.residual).toBe(0)
  })

  it('leasing: il piano si ferma al riscatto, che resta da pagare dopo', () => {
    const leasing = prestito({ kind: 'leasing', installments: 36, principal_cents: 30_000_00, annual_rate_percent: 5, balloon_cents: 3_000_00 })
    const piano = schedule(leasing)
    expect(piano[35]!.residual).toBe(3_000_00)
    expect(somma(piano.map((r) => r.capital))).toBe(27_000_00)
    const movimenti = loanTreasuryItems(leasing, '2028-11-30')
    expect(movimenti.map((m) => [m.due_date, m.description])).toEqual([
      ['2028-12-31', 'Prestito — rata 36/36'],
      ['2029-01-31', 'Prestito — riscatto']
    ])
    expect(loanStatus(leasing, '2029-02-01').residual).toBe(0)
  })

  it('rifiuta i piani impossibili', () => {
    expect(validateLoan(prestito({ principal_cents: 0 })).ok).toBe(false)
    expect(validateLoan(prestito({ grace_installments: 12 })).ok).toBe(false)
    expect(validateLoan(prestito({ balloon_cents: 12_000_00 })).ok).toBe(false)
    expect(validateLoan(prestito({ annual_rate_percent: -1 })).ok).toBe(false)
    expect(() => schedule(prestito({ installments: 0 }))).toThrow()
  })
})

describe('situazione a una data', () => {
  it('le rate scadute sono pagate, il debito residuo è quello dopo l\'ultima', () => {
    const stato = loanStatus(prestito(), '2026-03-31')
    const piano = schedule(prestito())
    expect(stato.paidInstallments).toBe(3)
    expect(stato.residual).toBe(piano[2]!.residual)
    expect(stato.next?.date).toBe('2026-04-30')
    expect(stato.monthlyEquivalent).toBe(1_032_80)
    expect(stato.endDate).toBe('2026-12-31')
  })

  it('prima della prima rata il debito è tutto il capitale', () => {
    expect(loanStatus(prestito(), '2025-12-31').residual).toBe(12_000_00)
  })

  it('una rata trimestrale vale un terzo al mese', () => {
    const stato = loanStatus(prestito({ frequency: 'quarterly', installments: 4 }), '2026-01-01')
    expect(stato.monthlyEquivalent).toBe(Math.round(stato.next!.total / 3))
  })

  it('la previsione di cassa riceve solo le rate future', () => {
    const movimenti = loanTreasuryItems(prestito(), '2026-10-15')
    expect(movimenti.map((m) => m.due_date)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31'])
    expect(movimenti[0]).toMatchObject({ direction: 'out', source: 'finanziamento', category: 'Rate finanziamenti' })
  })
})

describe('DSCR e affidamenti', () => {
  it('le rate dei 12 mesi successivi escludono il giorno di partenza', () => {
    const piano = schedule(prestito())
    // Dal 31 gennaio: restano le rate da febbraio a dicembre.
    expect(debtServiceNext12Months([prestito()], '2026-01-31')).toBe(somma(piano.slice(1).map((r) => r.total)))
    // Dal 31 dicembre 2025: tutte e dodici.
    expect(debtServiceNext12Months([prestito()], '2025-12-31')).toBe(somma(piano.map((r) => r.total)))
  })

  it('lo sconfinamento di una linea non toglie disponibilità alle altre', () => {
    expect(
      creditSummary([
        { kind: 'fido_cassa', granted_cents: 50_000_00, used_cents: 20_000_00 },
        { kind: 'carta', granted_cents: 5_000_00, used_cents: 6_000_00 }
      ])
    ).toEqual({ accordato: 55_000_00, utilizzato: 26_000_00, disponibile: 30_000_00, utilizzoPercent: (26 / 55) * 100 })
    expect(creditSummary([]).utilizzoPercent).toBeNull()
  })
})
