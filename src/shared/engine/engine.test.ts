import { describe, expect, it } from 'vitest'
import { DETAIL, SECTION, type EngineAccount } from './aggregates'
import { balanceSheet } from './balance-sheet'
import { incomeAggregates, incomeStatement, SCHEMES } from './income-statement'
import { periodDays, ratios } from './ratios'

/**
 * Azienda di prova, numeri scelti a mano perché i conti tornino tondi e le
 * attese siano verificabili a mente. Tutti gli importi in centesimi.
 *
 * Il file del cliente è un modello vuoto (nessun saldo), quindi non esiste un
 * caso reale su cui tarare il motore: questi numeri sono inventati, ma le
 * formule che verificano sono quelle di docs/MODELLO_FINANZIARIO.md.
 */
const euro = (value: number): number => Math.round(value * 100)

function account(
  code: string,
  section_code: string,
  amount: number,
  extra: Partial<EngineAccount> = {}
): EngineAccount {
  return {
    code,
    name: code,
    section_code,
    account_type: 'COSTO',
    detail_tag: null,
    amount_cents: euro(amount),
    ...extra
  }
}

const RICAVO = { account_type: 'RICAVO' as const }
const ATTIVO = { account_type: "ATTIVITA'" as const }
const ATTIVO_NEG = { account_type: "ATTIVITA' NEGATIVO" as const }
const PASSIVO = { account_type: "PASSIVITA'" as const }

const CONTI: EngineAccount[] = [
  // Conto economico
  account('60.01', SECTION.ricaviOperativi, 1_000_000, RICAVO),
  account('60.20', SECTION.rimanenzeFinaliRicavo, 50_000, RICAVO),
  account('60.30', SECTION.proventiStraordinari, 3_000, RICAVO),
  account('60.40', SECTION.proventiFinanziari, 2_000, RICAVO),
  account('70.01', SECTION.esistenzeIniziali, 30_000),
  account('70.10', SECTION.costiMateriePrime, 400_000),
  account('70.20', SECTION.costiProduzione, 60_000),
  account('70.30', SECTION.ammortamentiOperativi, 50_000),
  account('70.40', SECTION.costiPersonale, 250_000),
  account('70.50', SECTION.costiCommerciali, 40_000),
  account('70.60', SECTION.costiGenerali, 60_000),
  account('70.70', SECTION.ammortamentiNonOperativi, 10_000),
  account('70.80', SECTION.oneriStraordinari, 5_000),
  account('70.90', SECTION.oneriFinanziari, 12_000),
  account('70.99', SECTION.imposte, 25_000),

  // Stato patrimoniale — attivo
  account('10.01', SECTION.immobilizzazioniImmateriali, 20_000, ATTIVO),
  account('11.01', SECTION.immobilizzazioniMateriali, 300_000, ATTIVO),
  account('11.09', SECTION.immobilizzazioniMateriali, 100_000, ATTIVO_NEG), // fondo ammortamento
  account('20.01', SECTION.rimanenzeFinaliMagazzino, 50_000, ATTIVO),
  account('21.01', SECTION.liquiditaDifferite, 180_000, {
    ...ATTIVO,
    detail_tag: DETAIL.creditiCommerciali
  }),
  account('21.02', SECTION.liquiditaDifferite, 5_000, {
    ...ATTIVO,
    detail_tag: DETAIL.creditiDiversi
  }),
  account('21.03', SECTION.liquiditaDifferite, 2_000, { ...ATTIVO, detail_tag: DETAIL.erarioIva }),
  account('22.01', SECTION.liquiditaImmediate, 40_000, ATTIVO),

  // Stato patrimoniale — passivo
  account('30.01', SECTION.patrimonioNetto, 100_000, PASSIVO),
  account('30.02', SECTION.patrimonioNetto, 100_000, { ...PASSIVO, detail_tag: DETAIL.utileANuovo }),
  account('40.01', SECTION.debitiMedioLungo, 150_000, PASSIVO), // mutuo: debito finanziario
  account('40.02', SECTION.debitiMedioLungo, 30_000, { ...PASSIVO, detail_tag: DETAIL.fondoTfr }),
  account('50.01', SECTION.debitiBreve, 80_000, {
    ...PASSIVO,
    detail_tag: DETAIL.debitiFornitoriVariabili
  }),
  account('50.02', SECTION.debitiBreve, 20_000, {
    ...PASSIVO,
    detail_tag: DETAIL.debitiFornitoriFissi
  }),
  account('50.03', SECTION.debitiBreve, 7_000, {
    ...PASSIVO,
    detail_tag: DETAIL.debitiEntiPrevidenziali
  }),
  account('50.04', SECTION.debitiBreve, 10_000, { ...PASSIVO, detail_tag: DETAIL.debitiDiversi })
]

describe('Conto economico riclassificato (§3)', () => {
  const a = incomeAggregates(CONTI)

  it('costruisce la riga di partenza come ricavi operativi + rimanenze finali', () => {
    expect(a.ricaviNetti).toBe(euro(1_050_000))
  })

  it('calcola il margine di contribuzione togliendo i costi variabili (§3.2)', () => {
    // Esistenze iniziali + materie prime + produzione. Le imposte non entrano.
    expect(a.costiVariabili).toBe(euro(490_000))
    expect(a.margineContribuzione).toBe(euro(560_000))
  })

  it('si ferma a EBITDA prima degli ammortamenti, poi scende a EBIT', () => {
    // Nota di implementazione di §3.2: i costi fissi sono al netto degli
    // ammortamenti, che si sottraggono dopo per separare EBITDA da EBIT.
    expect(a.costiFissi).toBe(euro(350_000))
    expect(a.ebitda).toBe(euro(210_000))
    expect(a.ammortamenti).toBe(euro(60_000))
    expect(a.ebit).toBe(euro(150_000))
  })

  it('chiude su utile ante imposte e utile di esercizio', () => {
    expect(a.utileAnteImposte).toBe(euro(138_000))
    expect(a.utile).toBe(euro(113_000))
  })

  it('calcola il valore aggiunto di §3.1', () => {
    expect(a.valoreAggiunto).toBe(euro(460_000))
    // Tolto il personale si ritrova lo stesso EBITDA.
    expect(a.valoreAggiunto - a.costiPersonale).toBe(a.ebitda)
  })

  it('calcola costo del venduto e gross profit di §3.3', () => {
    expect(a.costoDelVenduto).toBe(euro(790_000))
    expect(a.grossProfit).toBe(euro(260_000))
  })

  /**
   * Il test che conta davvero: i tre schemi sono tre presentazioni dello
   * stesso risultato. Se una formula viene trascritta male, qui si spacca.
   */
  it('i tre schemi arrivano allo stesso EBIT e allo stesso utile', () => {
    const risultati = SCHEMES.map((scheme) => {
      const statement = incomeStatement(CONTI, scheme)
      const riga = (key: string): number =>
        statement.lines.find((l) => l.key === key)?.amount_cents ?? Number.NaN
      return { scheme, ebit: riga('ebit'), utile: riga('utile') }
    })

    for (const r of risultati) {
      expect(r.ebit, `EBIT dello schema ${r.scheme}`).toBe(euro(150_000))
      expect(r.utile, `utile dello schema ${r.scheme}`).toBe(euro(113_000))
    }
  })

  it('ogni schema espone le proprie righe caratteristiche', () => {
    const chiavi = (s: (typeof SCHEMES)[number]): string[] =>
      incomeStatement(CONTI, s).lines.map((l) => l.key)

    expect(chiavi('margine_contribuzione')).toContain('margine_contribuzione')
    expect(chiavi('valore_aggiunto')).toContain('valore_aggiunto')
    expect(chiavi('costo_venduto')).toContain('gross_profit')
    expect(chiavi('margine_contribuzione')).not.toContain('valore_aggiunto')
  })
})

describe('Stato patrimoniale riclassificato (§4)', () => {
  const b = balanceSheet(CONTI)

  it("sottrae i fondi (ATTIVITA' NEGATIVO) dentro la loro sezione", () => {
    // 300.000 di immobilizzazioni materiali meno 100.000 di fondo ammortamento.
    expect(b.immobilizzazioniMateriali).toBe(euro(200_000))
    expect(b.attivoFissoNetto).toBe(euro(220_000))
  })

  it('somma il capitale circolante lato attivo', () => {
    expect(b.attivoCircolante).toBe(euro(277_000))
    expect(b.totaleAttivo).toBe(euro(497_000))
  })

  it('quadra attivo e passivo', () => {
    expect(b.totalePassivo).toBe(euro(497_000))
    expect(b.sbilancio).toBe(0)
  })

  it('costruisce il CCN dalle sotto-classificazioni, non dalle sezioni', () => {
    expect(b.creditiCommerciali).toBe(euro(180_000))
    expect(b.altriCrediti).toBe(euro(7_000))
    expect(b.debitiFornitori).toBe(euro(100_000))
    expect(b.altriDebitiCorrenti).toBe(euro(17_000))
    expect(b.capitaleCircolanteNetto).toBe(euro(120_000))
  })
})

describe('Indici di bilancio (§5, §6)', () => {
  const income = incomeAggregates(CONTI)
  const balance = balanceSheet(CONTI)
  const r = ratios({ accounts: CONTI, income, balance, days: 365 })
  const vicino = (value: number | null, atteso: number): void =>
    expect(value).toBeCloseTo(atteso, 2)

  it('redditività', () => {
    vicino(r.roe, 56.5)
    vicino(r.roi, 30.18)
    vicino(r.ros, 14.71) // denominatore rettificato dalla variazione rimanenze
    vicino(r.molPercent, 21)
  })

  it('struttura e liquidità', () => {
    vicino(r.indipendenzaFinanziaria, 40.24)
    expect(r.margineStrutturaPrimario).toBe(euro(-20_000)) // negativo: non è di per sé un allarme
    expect(r.margineStrutturaSecondario).toBe(euro(160_000))
    vicino(r.indiceDisponibilita, 2.368)
    vicino(r.indiceLiquidita, 1.94)
  })

  it('punto di pareggio e margine di sicurezza', () => {
    vicino(r.bepRatio, 0.625)
    expect(r.bepCents).toBe(euro(656_250))
    vicino(r.margineSicurezzaPercent, 37.5)
  })

  it('ciclo del capitale circolante', () => {
    vicino(r.dso, 65.7)
    vicino(r.dio, 23.1)
    vicino(r.dpo, 79.35)
    vicino(r.ccc, 9.45)
  })

  it('indebitamento, escludendo dai debiti le voci non finanziarie', () => {
    // Fornitori, enti previdenziali e TFR non sono debito finanziario.
    expect(r.posizioneFinanziariaNetta).toBe(euro(120_000))
    vicino(r.pfnSuEbitda, 0.571)
    vicino(r.debtEquity, 0.8)
  })

  it("usa l'EBITDA degli ultimi 12 mesi per la leva, non quello del periodo", () => {
    // Su un mese, confrontare il debito con l'EBITDA di quel mese soltanto lo
    // farebbe sembrare dodici volte più pesante.
    const mensile = ratios({
      accounts: CONTI,
      income,
      balance,
      days: 30,
      ebitdaLtmCents: euro(2_520_000),
      debtServiceCents: euro(1_000_000)
    })
    vicino(mensile.pfnSuEbitda, 0.0476)
    vicino(mensile.dscr, 2.52)

    const senzaStorico = ratios({ accounts: CONTI, income, balance, days: 30, ebitdaLtmCents: null })
    expect(senzaStorico.pfnSuEbitda).toBeNull()
  })

  it('lascia il DSCR indefinito finché non arrivano le rate (Fase 6)', () => {
    expect(r.dscr).toBeNull()
    const conRate = ratios({ accounts: CONTI, income, balance, days: 365, debtServiceCents: euro(100_000) })
    vicino(conRate.dscr, 2.1)
  })

  it('restituisce null invece di zero quando il denominatore è zero', () => {
    const vuoto = ratios({
      accounts: [],
      income: incomeAggregates([]),
      balance: balanceSheet([]),
      days: 365
    })
    expect(vuoto.roe).toBeNull()
    expect(vuoto.roi).toBeNull()
    expect(vuoto.molPercent).toBeNull()
    expect(vuoto.dso).toBeNull()
    expect(vuoto.indiceDisponibilita).toBeNull()
  })
})

describe('Giorni del periodo (§6)', () => {
  it('usa i giorni veri del mese e dell’anno', () => {
    expect(periodDays(2026, null)).toBe(365)
    expect(periodDays(2028, null)).toBe(366)
    expect(periodDays(2026, 2)).toBe(28)
    expect(periodDays(2028, 2)).toBe(29)
    expect(periodDays(2026, 1)).toBe(31)
    expect(periodDays(2026, 4)).toBe(30)
  })
})
