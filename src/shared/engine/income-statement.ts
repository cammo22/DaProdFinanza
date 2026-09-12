import { SECTION, sectionTotals, total, type EngineAccount, type SectionTotals } from './aggregates'

/**
 * Riclassificazione del Conto Economico — docs/MODELLO_FINANZIARIO.md §3.
 *
 * I tre schemi (§3.1 Valore Aggiunto, §3.2 Margine di Contribuzione, §3.3 Costo
 * del Venduto) sono tre **presentazioni dello stesso risultato**: cambiano i
 * subtotali intermedi, non EBIT né l'utile. Il test di riconciliazione in
 * `income-statement.test.ts` lo verifica, ed è la rete di sicurezza migliore
 * che abbiamo contro un errore di trascrizione in una delle formule.
 */

export const SCHEMES = ['margine_contribuzione', 'valore_aggiunto', 'costo_venduto'] as const
export type Scheme = (typeof SCHEMES)[number]

/** §3.2 è lo schema principale: è quello dei mockup analizzati. */
export const DEFAULT_SCHEME: Scheme = 'margine_contribuzione'

export const SCHEME_LABELS: Record<Scheme, string> = {
  margine_contribuzione: 'A margine di contribuzione',
  valore_aggiunto: 'A valore aggiunto',
  costo_venduto: 'A costo del venduto'
}

export type LineKind = 'voce' | 'subtotale' | 'risultato'

export interface IncomeLine {
  key: string
  label: string
  /** Importo in centesimi, col segno con cui compare nel prospetto. */
  amount_cents: number
  kind: LineKind
  /** Segno mostrato accanto alla voce nel file del consulente: −, +, =. */
  sign: '+' | '-' | '='
}

/**
 * Le grandezze che servono agli indici (§5) e ai KPI, indipendenti dallo schema
 * scelto. Sempre in centesimi.
 */
export interface IncomeAggregates {
  ricaviOperativi: number
  rimanenzeFinali: number
  /** Ricavi operativi + rimanenze finali: la riga di partenza di tutti gli schemi. */
  ricaviNetti: number
  rimanenzeIniziali: number
  variazioneRimanenze: number
  costiMateriePrime: number
  costiProduzione: number
  costiPersonale: number
  costiCommerciali: number
  costiGenerali: number
  ammortamentiOperativi: number
  ammortamentiNonOperativi: number
  ammortamenti: number
  oneriFinanziari: number
  proventiFinanziari: number
  oneriStraordinari: number
  proventiStraordinari: number
  imposte: number
  /** §3.2 — esistenze iniziali + materie prime + produzione. Imposte escluse. */
  costiVariabili: number
  /** §3.2 — personale + commerciali + G&A. Ammortamenti e oneri esclusi. */
  costiFissi: number
  margineContribuzione: number
  valoreAggiunto: number
  costoDelVenduto: number
  grossProfit: number
  ebitda: number
  ebit: number
  utileAnteImposte: number
  utile: number
}

export function incomeAggregates(accounts: EngineAccount[]): IncomeAggregates {
  const t: SectionTotals = sectionTotals(accounts)

  const ricaviOperativi = total(t, SECTION.ricaviOperativi)
  const rimanenzeFinali = total(t, SECTION.rimanenzeFinaliRicavo)
  const ricaviNetti = ricaviOperativi + rimanenzeFinali
  const rimanenzeIniziali = total(t, SECTION.esistenzeIniziali)

  const costiMateriePrime = total(t, SECTION.costiMateriePrime)
  const costiProduzione = total(t, SECTION.costiProduzione)
  const costiPersonale = total(t, SECTION.costiPersonale)
  const costiCommerciali = total(t, SECTION.costiCommerciali)
  const costiGenerali = total(t, SECTION.costiGenerali)
  const ammortamentiOperativi = total(t, SECTION.ammortamentiOperativi)
  const ammortamentiNonOperativi = total(t, SECTION.ammortamentiNonOperativi)
  const ammortamenti = ammortamentiOperativi + ammortamentiNonOperativi

  const oneriFinanziari = total(t, SECTION.oneriFinanziari)
  const proventiFinanziari = total(t, SECTION.proventiFinanziari)
  const oneriStraordinari = total(t, SECTION.oneriStraordinari)
  const proventiStraordinari = total(t, SECTION.proventiStraordinari)
  const imposte = total(t, SECTION.imposte)

  // §3.2: "Costi Variabili (esclusi oneri finanziari, straordinari e imposte)".
  // Le esistenze iniziali sono un costo variabile (§2.2).
  const costiVariabili = rimanenzeIniziali + costiMateriePrime + costiProduzione
  // §3.2: costi fissi "esclusi oneri finanziari, straordinari e imposte, esclusi
  // ammortamenti" — quelli si sottraggono dopo, per fermarsi a EBITDA.
  const costiFissi = costiPersonale + costiCommerciali + costiGenerali

  const margineContribuzione = ricaviNetti - costiVariabili
  const ebitda = margineContribuzione - costiFissi
  const ebit = ebitda - ammortamenti

  // §3.1 — il valore aggiunto toglie tutto il non-personale della gestione
  // caratteristica; il personale si sottrae subito dopo, per arrivare a EBITDA.
  const valoreAggiunto =
    ricaviNetti - (costiMateriePrime + rimanenzeIniziali) - costiProduzione - costiGenerali - costiCommerciali

  // §3.3 — costo del venduto: la parte di costo assorbita dal prodotto venduto.
  const costoDelVenduto =
    costiMateriePrime + rimanenzeIniziali + costiProduzione + ammortamentiOperativi + costiPersonale
  const grossProfit = ricaviNetti - costoDelVenduto

  const utileAnteImposte =
    ebit - oneriFinanziari + proventiFinanziari - oneriStraordinari + proventiStraordinari
  const utile = utileAnteImposte - imposte

  return {
    ricaviOperativi,
    rimanenzeFinali,
    ricaviNetti,
    rimanenzeIniziali,
    variazioneRimanenze: rimanenzeFinali - rimanenzeIniziali,
    costiMateriePrime,
    costiProduzione,
    costiPersonale,
    costiCommerciali,
    costiGenerali,
    ammortamentiOperativi,
    ammortamentiNonOperativi,
    ammortamenti,
    oneriFinanziari,
    proventiFinanziari,
    oneriStraordinari,
    proventiStraordinari,
    imposte,
    costiVariabili,
    costiFissi,
    margineContribuzione,
    valoreAggiunto,
    costoDelVenduto,
    grossProfit,
    ebitda,
    ebit,
    utileAnteImposte,
    utile
  }
}

const line = (
  key: string,
  label: string,
  amount_cents: number,
  sign: IncomeLine['sign'],
  kind: LineKind = 'voce'
): IncomeLine => ({ key, label, amount_cents, sign, kind })

/** La coda comune ai tre schemi: da EBIT all'utile di esercizio. */
function tail(a: IncomeAggregates): IncomeLine[] {
  return [
    line('oneri_finanziari', 'Oneri finanziari', a.oneriFinanziari, '-'),
    line('proventi_finanziari', 'Proventi finanziari', a.proventiFinanziari, '+'),
    line('oneri_straordinari', 'Oneri straordinari', a.oneriStraordinari, '-'),
    line('proventi_straordinari', 'Proventi straordinari', a.proventiStraordinari, '+'),
    line('utile_ante_imposte', 'Utile ante imposte', a.utileAnteImposte, '=', 'subtotale'),
    line('imposte', 'Imposte', a.imposte, '-'),
    line('utile', 'Utile / perdita di esercizio', a.utile, '=', 'risultato')
  ]
}

export interface IncomeStatement {
  scheme: Scheme
  label: string
  lines: IncomeLine[]
  aggregates: IncomeAggregates
}

export function incomeStatement(
  accounts: EngineAccount[],
  scheme: Scheme = DEFAULT_SCHEME
): IncomeStatement {
  const a = incomeAggregates(accounts)
  const head = line('ricavi_netti', 'Ricavi operativi + rimanenze finali', a.ricaviNetti, '+')

  let lines: IncomeLine[]

  if (scheme === 'margine_contribuzione') {
    lines = [
      head,
      line('costi_variabili', 'Costi variabili', a.costiVariabili, '-'),
      line('margine_contribuzione', 'Margine di contribuzione', a.margineContribuzione, '=', 'subtotale'),
      line('costi_fissi', 'Costi fissi', a.costiFissi, '-'),
      line('ebitda', 'Margine operativo lordo (EBITDA / MOL)', a.ebitda, '=', 'subtotale'),
      line('ammortamenti', 'Ammortamenti', a.ammortamenti, '-'),
      line('ebit', 'Reddito operativo (EBIT)', a.ebit, '=', 'subtotale'),
      ...tail(a)
    ]
  } else if (scheme === 'valore_aggiunto') {
    lines = [
      head,
      line('materie_prime', 'Costi materie prime + rimanenze iniziali', a.costiMateriePrime + a.rimanenzeIniziali, '-'),
      line('costi_produzione', 'Costi produzione', a.costiProduzione, '-'),
      line('costi_generali', 'Costi generali e amministrativi', a.costiGenerali, '-'),
      line('costi_commerciali', 'Costi commerciali', a.costiCommerciali, '-'),
      line('valore_aggiunto', 'Valore aggiunto', a.valoreAggiunto, '=', 'subtotale'),
      line('costi_personale', 'Costi personale', a.costiPersonale, '-'),
      line('ebitda', 'Margine operativo lordo (EBITDA / MOL)', a.ebitda, '=', 'subtotale'),
      line('ammortamenti', 'Ammortamenti operativi e non operativi', a.ammortamenti, '-'),
      line('ebit', 'Reddito operativo (EBIT)', a.ebit, '=', 'subtotale'),
      ...tail(a)
    ]
  } else {
    lines = [
      head,
      line('materie_prime', 'Costi materie prime + rimanenze iniziali', a.costiMateriePrime + a.rimanenzeIniziali, '-'),
      line('costi_produzione', 'Costi produzione', a.costiProduzione, '-'),
      line('ammortamenti_operativi', 'Ammortamenti operativi', a.ammortamentiOperativi, '-'),
      line('costi_personale', 'Costi personale', a.costiPersonale, '-'),
      line('costo_venduto', 'Costo del venduto', a.costoDelVenduto, '=', 'subtotale'),
      line('gross_profit', 'Gross profit', a.grossProfit, '=', 'subtotale'),
      line('costi_generali', 'Costi generali e amministrativi', a.costiGenerali, '-'),
      line('costi_commerciali', 'Costi commerciali', a.costiCommerciali, '-'),
      line('ammortamenti_non_operativi', 'Ammortamenti non operativi', a.ammortamentiNonOperativi, '-'),
      line('ebit', 'Reddito operativo (EBIT)', a.ebit, '=', 'subtotale'),
      ...tail(a)
    ]
  }

  return { scheme, label: SCHEME_LABELS[scheme], lines, aggregates: a }
}
