import { describe, expect, it } from 'vitest'
import {
  FISCALE_PREDEFINITO,
  flussiFiscali,
  irpef,
  normalizzaFiscale,
  regimeDaForma,
  scadenzeFiscali,
  stimaFiscale,
  type ImpostazioniFiscali
} from './fiscale'

const imp = (p: Partial<ImpostazioniFiscali>): ImpostazioniFiscali => ({ ...FISCALE_PREDEFINITO, ...p })
const importo = (s: ReturnType<typeof stimaFiscale>, chiave: string): number | undefined =>
  s.righe.find((r) => r.chiave === chiave)?.importo

describe('stima di imposte e contributi (conti fatti a mano)', () => {
  it('IRPEF a scaglioni 2026', () => {
    expect(irpef(2_000_000)).toBe(460_000) // 20.000 × 23%
    // 28.000 × 23% + 22.000 × 33% + 10.000 × 43% = 6.440 + 7.260 + 4.300
    expect(irpef(6_000_000)).toBe(1_800_000)
    expect(irpef(-100)).toBe(0)
  })

  it('SRL: IRES sull’utile, IRAP sul reddito operativo', () => {
    const s = stimaFiscale({ utileAnteImposte: 10_000_000, ebit: 11_000_000, ricavi: 90_000_000 }, imp({ regime: 'capitali' }))
    expect(importo(s, 'ires')).toBe(2_400_000) // 100.000 × 24%
    expect(importo(s, 'irap')).toBe(429_000) // 110.000 × 3,9%
    expect(s.totale).toBe(2_829_000)
    expect(s.accantonamentoMensile).toBe(235_750)
    expect(s.aliquotaEffettiva).toBeCloseTo(28.29)
  })

  it('le rettifiche fiscali cambiano l’imponibile IRES', () => {
    const s = stimaFiscale(
      { utileAnteImposte: 10_000_000, ebit: 11_000_000, ricavi: 0 },
      imp({ variazioniAumentoCents: 500_000, variazioniDiminuzioneCents: 1_500_000 })
    )
    expect(s.imponibile).toBe(9_000_000)
    expect(importo(s, 'ires')).toBe(2_160_000)
  })

  it('ditta individuale di commercianti: INPS, poi IRPEF e addizionali sul resto, niente IRAP', () => {
    const s = stimaFiscale({ utileAnteImposte: 4_000_000, ebit: 4_200_000, ricavi: 0 }, imp({ regime: 'individuale', gestioneInps: 'commercianti' }))
    // Fissi: 18.555 × 24,48% = 4.542,26 · oltre il minimale: 21.445 × 24,48% = 5.249,74
    expect(importo(s, 'inps-fissi')).toBe(454_226)
    expect(importo(s, 'inps-eccedenza')).toBe(524_974)
    // IRPEF su 40.000 − 9.792 = 30.208: 6.440 + 2.208 × 33% = 7.168,64
    expect(importo(s, 'irpef')).toBe(716_864)
    expect(importo(s, 'addizionali')).toBe(60_416)
    expect(importo(s, 'irap')).toBeUndefined()
    expect(s.totale).toBe(1_756_480)
  })

  it('società di persone: il reddito si divide fra i soci, IRAP alla società', () => {
    const s = stimaFiscale({ utileAnteImposte: 8_000_000, ebit: 8_500_000, ricavi: 0 }, imp({ regime: 'persone', soci: 2 }))
    expect(importo(s, 'irpef')).toBe(716_864 * 2)
    expect(importo(s, 'inps-fissi')).toBe(454_226 * 2)
    expect(importo(s, 'irap')).toBe(331_500) // 85.000 × 3,9%
  })

  it('forfettario: ricavi × coefficiente meno contributi, imposta sostitutiva', () => {
    const s = stimaFiscale({ utileAnteImposte: 0, ebit: 0, ricavi: 5_000_000 }, imp({ regime: 'forfettario', forfettarioCoeff: 40, forfettarioAliquota: 15 }))
    // Reddito 20.000 · INPS 4.542,26 + 1.445 × 24,48% = 353,74 · imponibile 15.104 · 15% = 2.265,60
    expect(importo(s, 'inps-eccedenza')).toBe(35_374)
    expect(s.imponibile).toBe(1_510_400)
    expect(importo(s, 'sostitutiva')).toBe(226_560)
    expect(importo(s, 'irap')).toBeUndefined()
    const ridotta = stimaFiscale({ utileAnteImposte: 0, ebit: 0, ricavi: 5_000_000 }, imp({ regime: 'forfettario', riduzioneInps35: true }))
    expect(importo(ridotta, 'inps-fissi')).toBe(295_247) // 4.542,26 × 65%
  })

  it('reddito scritto a mano al posto del bilancio', () => {
    const s = stimaFiscale({ utileAnteImposte: 10_000_000, ebit: 0, ricavi: 0 }, imp({ redditoManualeCents: 5_000_000 }))
    expect(s.redditoManuale).toBe(true)
    expect(importo(s, 'ires')).toBe(1_200_000)
  })

  it('il regime dalla forma giuridica', () => {
    expect(regimeDaForma('S.r.l.')).toBe('capitali')
    expect(regimeDaForma('SNC')).toBe('persone')
    expect(regimeDaForma('Ditta individuale')).toBe('individuale')
    expect(normalizzaFiscale({ regime: 'inventato', soci: 0 }).regime).toBe('capitali')
    expect(normalizzaFiscale({ soci: 0 }).soci).toBe(1)
  })
})

describe('scadenze fiscali', () => {
  const srl = stimaFiscale({ utileAnteImposte: 10_000_000, ebit: 11_000_000, ricavi: 0 }, imp({}))

  it('senza la dichiarazione dell’anno scorso: acconti sulla stima, 50 e 50 con gli ISA', () => {
    const s = scadenzeFiscali(srl, imp({ isa: true }), '2026-09-21')
    expect(s.map((x) => [x.data, x.importo])).toEqual([
      ['2026-11-30', 1_414_500],
      ['2027-06-30', 1_414_500],
      ['2027-11-30', 1_414_500]
    ])
  })

  it('con imposte e acconti dell’anno scorso: saldo a giugno, 40 e 60 senza ISA', () => {
    const s = scadenzeFiscali(srl, imp({ isa: false, impostePrecedentiCents: 2_000_000, accontiVersatiCents: 1_800_000 }), '2026-09-21')
    expect(s.map((x) => [x.data, x.descrizione, x.importo])).toEqual([
      ['2026-11-30', 'Secondo acconto imposte 2026', 1_200_000],
      ['2027-06-30', 'Saldo imposte 2026', 829_000],
      ['2027-06-30', 'Primo acconto imposte 2027', 1_131_600],
      ['2027-11-30', 'Secondo acconto imposte 2027', 1_697_400]
    ])
    // Il saldo dell'anno scorso (200 €) era a giugno 2026: già passato.
    expect(s.some((x) => x.descrizione === 'Saldo imposte 2025')).toBe(false)
  })

  it('INPS fissi in quattro rate e movimenti di tesoreria', () => {
    const ditta = stimaFiscale({ utileAnteImposte: 4_000_000, ebit: 0, ricavi: 0 }, imp({ regime: 'individuale' }))
    const s = scadenzeFiscali(ditta, imp({ regime: 'individuale' }), '2026-09-21', 6)
    const fissi = s.filter((x) => x.descrizione.startsWith('INPS contributi fissi'))
    expect(fissi.map((x) => x.data)).toEqual(['2026-11-16', '2027-02-16'])
    expect(fissi[0]!.importo).toBe(113_557) // 4.542,26 / 4
    const flussi = flussiFiscali(s)
    expect(flussi[0]).toMatchObject({ source: 'fiscale', direction: 'out', category: 'Imposte e contributi' })
  })
})
