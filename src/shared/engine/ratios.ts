import { DETAIL, SECTION, detailTotal, type EngineAccount } from './aggregates'
import type { BalanceSheet } from './balance-sheet'
import type { IncomeAggregates } from './income-statement'

/**
 * Indici di bilancio — docs/MODELLO_FINANZIARIO.md §5 e §6.
 *
 * Ogni indice può valere `null`: un rapporto con denominatore zero non è zero,
 * è indefinito, e mostrarlo come 0% racconterebbe una bugia. La UI deve
 * scrivere "—", non un numero.
 *
 * Le soglie di interpretazione sono quelle del foglio del consulente, dove
 * esistono. Non sono giudizi: sono i riferimenti che lui usa già.
 */

/** Divisione che restituisce null invece di infinito o NaN. */
function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0 || !Number.isFinite(denominator)) return null
  return numerator / denominator
}

function percent(numerator: number, denominator: number): number | null {
  const r = ratio(numerator, denominator)
  return r === null ? null : r * 100
}

export interface Ratios {
  // §5 — redditività
  roe: number | null
  roi: number | null
  ros: number | null
  molPercent: number | null

  // §5 — struttura e solidità
  indipendenzaFinanziaria: number | null
  margineStrutturaPrimario: number
  margineStrutturaSecondario: number

  // §5 — liquidità
  indiceDisponibilita: number | null
  indiceLiquidita: number | null

  // §5 — punto di pareggio
  /** Rapporto costi fissi / margine di contribuzione. */
  bepRatio: number | null
  /** Il pareggio espresso in euro di ricavi (centesimi). */
  bepCents: number | null
  /** Quanto i ricavi possono scendere prima di toccare il pareggio. */
  margineSicurezzaPercent: number | null

  // §6 — ciclo del capitale circolante
  dso: number | null
  dio: number | null
  dpo: number | null
  ccc: number | null

  // §5 — indebitamento
  posizioneFinanziariaNetta: number
  pfnSuEbitda: number | null
  debtEquity: number | null
  /**
   * Richiede le rate di finanziamento attese nei 12 mesi successivi, che
   * arrivano col modulo Banche (Fase 6). Finché non ci sono resta null:
   * meglio un trattino che un numero inventato.
   */
  dscr: number | null
}

export interface RatioInput {
  accounts: EngineAccount[]
  income: IncomeAggregates
  balance: BalanceSheet
  /** Giorni del periodo: 365 per l'anno, i giorni effettivi per un mese (§6). */
  days: number
  /** Rate (quota capitale + interessi) attese nei prossimi 12 mesi, in centesimi. */
  debtServiceCents?: number | null
  /**
   * EBITDA degli ultimi 12 mesi, in centesimi: §5 definisce così PFN/EBITDA e
   * DSCR. Confrontare un debito con l'EBITDA di un solo mese lo farebbe
   * sembrare dodici volte più pesante.
   * - `undefined`: il periodo è già annuale, vale il suo EBITDA.
   * - `null`: periodo mensile senza dodici mesi disponibili, indici indefiniti.
   */
  ebitdaLtmCents?: number | null
}

export function ratios({
  accounts,
  income,
  balance,
  days,
  debtServiceCents = null,
  ebitdaLtmCents
}: RatioInput): Ratios {
  const ebitdaLeva = ebitdaLtmCents === undefined ? income.ebitda : ebitdaLtmCents
  // §5 ROS: il denominatore sono i ricavi operativi rettificati dalla
  // variazione delle rimanenze, non i ricavi netti.
  const ricaviRettificati = income.ricaviOperativi + income.variazioneRimanenze

  const margineStrutturaPrimario = balance.patrimonioNetto - balance.attivoFissoNetto
  const margineStrutturaSecondario =
    balance.patrimonioNetto + balance.debitiMedioLungo - balance.attivoFissoNetto

  const bepRatio = ratio(income.costiFissi, income.margineContribuzione)
  const bepCents = bepRatio === null ? null : Math.round(bepRatio * income.ricaviNetti)
  const margineSicurezzaPercent =
    bepCents === null || income.ricaviNetti === 0
      ? null
      : ((income.ricaviNetti - bepCents) / income.ricaviNetti) * 100

  // §6 — i giorni medi confrontano una grandezza di stato (patrimoniale) con
  // un flusso giornaliero medio (economico).
  const ricaviGiornalieri = ratio(income.ricaviOperativi, days)
  const costoVendutoGiornaliero = ratio(income.costoDelVenduto, days)
  // "Acquisti" non ha una sezione dedicata nel modello: qui sono i costi di
  // acquisto veri e propri. Assunzione dichiarata, da confermare col consulente.
  const acquisti = income.costiMateriePrime + income.costiProduzione
  const acquistiGiornalieri = ratio(acquisti, days)

  const dso = ricaviGiornalieri ? ratio(balance.creditiCommerciali, ricaviGiornalieri) : null
  const dio = costoVendutoGiornaliero ? ratio(balance.magazzino, costoVendutoGiornaliero) : null
  const dpo = acquistiGiornalieri ? ratio(balance.debitiFornitori, acquistiGiornalieri) : null

  // PFN: debiti finanziari meno liquidità. Il modello non ha un tag "debiti
  // finanziari", quindi si arriva per differenza — si escludono dai debiti le
  // voci che finanziarie non sono (fornitori, enti previdenziali, TFR).
  const debitiNonFinanziari =
    detailTotal(accounts, DETAIL.debitiFornitoriVariabili) +
    detailTotal(accounts, DETAIL.debitiFornitoriFissi) +
    detailTotal(accounts, DETAIL.debitiEntiPrevidenziali) +
    detailTotal(accounts, DETAIL.fondoTfr)
  const debitiFinanziari = balance.debitiBreve + balance.debitiMedioLungo - debitiNonFinanziari
  const posizioneFinanziariaNetta = debitiFinanziari - balance.liquiditaImmediate

  return {
    roe: percent(income.utile, balance.patrimonioNetto),
    roi: percent(income.ebit, balance.capitaleInvestito),
    ros: percent(income.ebit, ricaviRettificati),
    molPercent: percent(income.ebitda, income.ricaviOperativi),

    indipendenzaFinanziaria: percent(balance.patrimonioNetto, balance.totalePassivo),
    margineStrutturaPrimario,
    margineStrutturaSecondario,

    indiceDisponibilita: ratio(balance.attivoCircolante, balance.debitiBreve),
    indiceLiquidita: ratio(balance.attivoCircolante - balance.magazzino, balance.debitiBreve),

    bepRatio,
    bepCents,
    margineSicurezzaPercent,

    dso,
    dio,
    dpo,
    ccc: dso !== null && dio !== null && dpo !== null ? dso + dio - dpo : null,

    posizioneFinanziariaNetta,
    pfnSuEbitda: ebitdaLeva === null ? null : ratio(posizioneFinanziariaNetta, ebitdaLeva),
    debtEquity: ratio(debitiFinanziari, balance.patrimonioNetto),
    dscr: debtServiceCents && ebitdaLeva !== null ? ratio(ebitdaLeva, debtServiceCents) : null
  }
}

/** Soglie di interpretazione del foglio del consulente (§5), dove esistono. */
export const THRESHOLDS = {
  ros: { min: 10, unit: '%', note: 'Positivo dal 10% in su.' },
  molPercent: { min: 15, unit: '%', note: 'Positivo dal 15% in su.' },
  indipendenzaFinanziaria: { min: 30, unit: '%', note: 'Positivo sopra il 30%.' },
  margineStrutturaSecondario: {
    min: 0,
    unit: '€',
    note: 'Deve essere positivo: sotto zero le immobilizzazioni sono finanziate anche da debiti a breve.'
  },
  indiceDisponibilita: { min: 1, unit: 'x', note: "Sopra 1 l'attivo circolante copre i debiti a breve." },
  indiceLiquidita: { min: 1, unit: 'x', note: 'Sopra 1 è positivo.' },
  dscr: { min: 1.25, unit: 'x', note: 'Le banche chiedono di norma almeno 1,25x; sotto 1 il reddito non copre il debito.' }
} as const

/** Numero di giorni di un periodo, per i calcoli di §6. */
export function periodDays(year: number, month: number | null): number {
  if (month === null) return isLeapYear(year) ? 366 : 365
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Sezioni di conto economico, per sapere quali saldi alimentano il CE. */
export const INCOME_SECTIONS: string[] = [
  SECTION.ricaviOperativi,
  SECTION.rimanenzeFinaliRicavo,
  SECTION.proventiStraordinari,
  SECTION.proventiFinanziari,
  SECTION.esistenzeIniziali,
  SECTION.costiMateriePrime,
  SECTION.costiProduzione,
  SECTION.ammortamentiOperativi,
  SECTION.costiPersonale,
  SECTION.costiCommerciali,
  SECTION.costiGenerali,
  SECTION.ammortamentiNonOperativi,
  SECTION.oneriStraordinari,
  SECTION.oneriFinanziari,
  SECTION.imposte
]
