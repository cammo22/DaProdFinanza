import { describe, expect, it } from 'vitest'
import { DETAIL, SECTION, type EngineAccount } from './aggregates'
import { schedule, type LoanInput } from './loans'
import { impactRows, PARAMETRI_ZERO, simulate, type SimulationBase } from './simulation'

/**
 * Simulazioni su un'azienda di prova con numeri tondi: un anno da 1.000.000 €
 * di ricavi, 400.000 di materie prime, 100.000 di produzione, 250.000 di
 * personale, 100.000 di altri costi fissi. EBITDA 150.000.
 */

const e = (euro: number): number => Math.round(euro * 100)

function conto(
  code: string,
  section: string,
  euro: number,
  extra: Partial<EngineAccount> = {}
): EngineAccount {
  return {
    code,
    name: code,
    section_code: section,
    account_type: 'COSTO',
    detail_tag: null,
    amount_cents: e(euro),
    ...extra
  }
}

const INCOME: EngineAccount[] = [
  conto('ric', SECTION.ricaviOperativi, 1_000_000, { account_type: 'RICAVO' }),
  conto('mp', SECTION.costiMateriePrime, 400_000),
  conto('prod', SECTION.costiProduzione, 100_000),
  conto('pers', SECTION.costiPersonale, 250_000),
  conto('comm', SECTION.costiCommerciali, 40_000),
  conto('gen', SECTION.costiGenerali, 60_000),
  conto('amm', SECTION.ammortamentiOperativi, 30_000),
  conto('int', SECTION.oneriFinanziari, 20_000),
  // Utile ante imposte 100.000, imposte 25.000: aliquota effettiva 25%.
  conto('tax', SECTION.imposte, 25_000)
]

const ATTIVO = { account_type: "ATTIVITA'" as const }
const PASSIVO = { account_type: "PASSIVITA'" as const }

const BALANCE: EngineAccount[] = [
  conto('imm', SECTION.immobilizzazioniMateriali, 300_000, ATTIVO),
  conto('mag', SECTION.rimanenzeFinaliMagazzino, 50_000, ATTIVO),
  // DSO = 100.000 / (1.000.000 / 365) = 36,5 giorni
  conto('cli', SECTION.liquiditaDifferite, 100_000, {
    ...ATTIVO,
    detail_tag: DETAIL.creditiCommerciali
  }),
  conto('cassa', SECTION.liquiditaImmediate, 80_000, ATTIVO),
  conto('pn', SECTION.patrimonioNetto, 250_000, PASSIVO),
  conto('mutuo', SECTION.debitiMedioLungo, 200_000, PASSIVO),
  conto('forn', SECTION.debitiBreve, 80_000, {
    ...PASSIVO,
    detail_tag: DETAIL.debitiFornitoriVariabili
  })
]

const MUTUO: LoanInput = {
  uuid: 'm',
  kind: 'mutuo',
  label: 'Mutuo',
  principal_cents: e(200_000),
  annual_rate_percent: 4,
  first_due_date: '2026-10-31',
  installments: 120,
  frequency: 'monthly',
  grace_installments: 0,
  amortization: 'francese',
  balloon_cents: 0
}

const BASE: SimulationBase = {
  label: 'Anno di prova',
  incomeAccounts: INCOME,
  balanceAccounts: BALANCE,
  liquiditaOggi: e(80_000),
  loans: [MUTUO],
  today: '2026-10-15'
}

const rataMutuo = schedule(MUTUO)[0]!.total

describe('simulazione', () => {
  const attuale = simulate(BASE, PARAMETRI_ZERO)

  it('senza variazioni riproduce la base', () => {
    expect(attuale.ricavi).toBe(e(1_000_000))
    expect(attuale.ebitda).toBe(e(150_000))
    expect(attuale.utile).toBe(e(75_000))
    expect(attuale.aliquotaImposte).toBeCloseTo(0.25)
    expect(attuale.variazioneCircolante).toBe(0)
    // Dodici rate del mutuo, dalla prima del 31 ottobre.
    expect(attuale.servizioDebito).toBe(12 * rataMutuo)
    expect(attuale.cashFlowAnnuo).toBe(e(150_000) - e(25_000) - 12 * rataMutuo)
    expect(attuale.liquiditaFinale).toBe(e(80_000) + attuale.cashFlowAnnuo)
  })

  it('la curva mensile arriva alla liquidità finale', () => {
    expect(attuale.curva).toHaveLength(13)
    expect(attuale.curva[0]).toBe(e(80_000))
    expect(Math.abs(attuale.curva[12]! - attuale.liquiditaFinale)).toBeLessThanOrEqual(1)
  })

  it('+10% di ricavi: i costi variabili seguono, i fissi no', () => {
    const s = simulate(BASE, { ...PARAMETRI_ZERO, ricaviPercent: 10 })
    expect(s.aggregates.costiMateriePrime).toBe(e(440_000))
    expect(s.aggregates.costiProduzione).toBe(e(110_000))
    expect(s.aggregates.costiPersonale).toBe(e(250_000))
    // +100.000 di ricavi, +50.000 di variabili.
    expect(s.ebitda).toBe(e(200_000))
    // Imposte al 25% sul nuovo utile ante imposte (150.000).
    expect(s.aggregates.imposte).toBe(e(37_500))
    // A giorni invariati crediti, magazzino e fornitori crescono del 10%.
    expect(s.variazioneCircolante).toBe(e(10_000) + e(5_000) - e(8_000))
  })

  it("il prezzo delle merci si somma all'effetto volume", () => {
    const s = simulate(BASE, { ...PARAMETRI_ZERO, ricaviPercent: 10, costoMercePercent: 5 })
    expect(s.aggregates.costiMateriePrime).toBe(e(462_000))
  })

  it("due dipendenti in più pesano sul personale e sull'EBITDA", () => {
    const s = simulate(BASE, {
      ...PARAMETRI_ZERO,
      nuoviDipendenti: 2,
      costoDipendenteCents: e(35_000)
    })
    expect(s.aggregates.costiPersonale).toBe(e(320_000))
    expect(s.ebitda).toBe(e(80_000))
  })

  it('gli altri costi fissi sono commerciali e generali', () => {
    const s = simulate(BASE, { ...PARAMETRI_ZERO, altriCostiFissiPercent: -10 })
    expect(s.aggregates.costiCommerciali + s.aggregates.costiGenerali).toBe(e(90_000))
  })

  it('un investimento esce subito dalla cassa e si ammortizza a quote costanti', () => {
    const s = simulate(BASE, {
      ...PARAMETRI_ZERO,
      investimentoCents: e(50_000),
      investimentoAnni: 5
    })
    expect(s.ammortamentoInvestimento).toBe(e(10_000))
    expect(s.aggregates.ammortamenti).toBe(e(40_000))
    expect(s.ebitda).toBe(e(150_000))
    expect(s.curva[0]).toBe(e(80_000))
    // Meno l'investimento, più le minori imposte sull'ammortamento (25% di 10.000).
    expect(s.cashFlowAnnuo).toBe(attuale.cashFlowAnnuo - e(50_000) + e(2_500))
  })

  it('un finanziamento entra in cassa, porta interessi e rate', () => {
    const s = simulate(BASE, {
      ...PARAMETRI_ZERO,
      finanziamentoCents: e(60_000),
      finanziamentoMesi: 60,
      finanziamentoTasso: 6
    })
    const piano = schedule({
      ...MUTUO,
      uuid: 'n',
      principal_cents: e(60_000),
      annual_rate_percent: 6,
      installments: 60,
      first_due_date: '2026-11-15'
    })
    const primi12 = piano.slice(0, 12)
    const interessi12 = primi12.reduce((t, r) => t + r.interest, 0)
    const rate12 = primi12.reduce((t, r) => t + r.total, 0)
    const capitale12 = primi12.reduce((t, r) => t + r.capital, 0)

    expect(s.nuovoFinanziamento?.rata).toBe(piano[0]!.total)
    expect(s.aggregates.oneriFinanziari).toBe(e(20_000) + interessi12)
    expect(s.servizioDebito).toBe(12 * rataMutuo + rate12)
    // Il debito cresce del residuo del nuovo finanziamento, la liquidità del
    // cash flow in più: la PFN si muove della differenza.
    const deltaPfn = s.posizioneFinanziariaNetta - attuale.posizioneFinanziariaNetta
    const deltaCassa = s.liquiditaFinale - attuale.liquiditaFinale
    expect(deltaPfn).toBe(e(60_000) - capitale12 - deltaCassa)
  })

  it('i giorni obiettivo spostano il circolante', () => {
    // DSO da 36,5 a 30 giorni: i crediti scendono.
    const s = simulate(BASE, { ...PARAMETRI_ZERO, dsoTarget: 30 })
    expect(s.variazioneCircolante).toBe(Math.round((30 * e(1_000_000)) / 365) - e(100_000))
    expect(s.cashFlowAnnuo).toBeGreaterThan(attuale.cashFlowAnnuo)
  })

  it('le note del dettaglio impatti spiegano la differenza', () => {
    const p = { ...PARAMETRI_ZERO, ricaviPercent: 10, nuoviDipendenti: 1 }
    const righe = impactRows(attuale, simulate(BASE, p), p)
    expect(righe.find((r) => r.key === 'ricavi')?.nota).toBe('Ricavi +10%')
    expect(righe.find((r) => r.key === 'personale')?.nota).toBe('+1 dipendente')
    expect(righe.find((r) => r.key === 'variabili')?.nota).toBe('Seguono i volumi')
  })

  it('un cursore fuori scala non rompe il calcolo', () => {
    expect(() =>
      simulate(BASE, {
        ...PARAMETRI_ZERO,
        finanziamentoCents: e(10_000),
        finanziamentoTasso: 99,
        finanziamentoMesi: 5000,
        finanziamentoPreammortamentoMesi: 9999
      })
    ).not.toThrow()
  })
})
