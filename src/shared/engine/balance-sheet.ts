import {
  DETAIL,
  SECTION,
  detailTotal,
  sectionTotals,
  total,
  type EngineAccount
} from './aggregates'

/**
 * Riclassificazione dello Stato Patrimoniale — docs/MODELLO_FINANZIARIO.md §4.
 *
 *   Attivo fisso netto + Capitale circolante = Totale attivo
 *   Patrimonio netto + Debiti M/L + Debiti a breve = Totale passivo
 *
 * Il Capitale Circolante **Netto** è un'altra cosa dal "capitale circolante"
 * lato attivo: è la versione netta usata nell'analisi di liquidità, e si
 * costruisce dalle sotto-classificazioni dei conti, non dalle sezioni.
 */

export interface BalanceSheet {
  immobilizzazioniImmateriali: number
  immobilizzazioniMateriali: number
  immobilizzazioniFinanziarie: number
  attivoFissoNetto: number

  magazzino: number
  liquiditaDifferite: number
  liquiditaImmediate: number
  attivoCircolante: number

  totaleAttivo: number
  /** Sinonimo di totale attivo nel modello del consulente (§2.3). */
  capitaleInvestito: number

  patrimonioNetto: number
  debitiMedioLungo: number
  debitiBreve: number
  totalePassivo: number

  /** Attivo − passivo: deve essere zero su un bilancio quadrato. */
  sbilancio: number

  // Componenti del capitale circolante netto (§4, §6).
  creditiCommerciali: number
  altriCrediti: number
  debitiFornitori: number
  altriDebitiCorrenti: number
  capitaleCircolanteNetto: number
}

export function balanceSheet(accounts: EngineAccount[]): BalanceSheet {
  const t = sectionTotals(accounts)

  const immobilizzazioniImmateriali = total(t, SECTION.immobilizzazioniImmateriali)
  const immobilizzazioniMateriali = total(t, SECTION.immobilizzazioniMateriali)
  const immobilizzazioniFinanziarie = total(t, SECTION.immobilizzazioniFinanziarie)
  const attivoFissoNetto =
    immobilizzazioniImmateriali + immobilizzazioniMateriali + immobilizzazioniFinanziarie

  const magazzino = total(t, SECTION.rimanenzeFinaliMagazzino)
  const liquiditaDifferite = total(t, SECTION.liquiditaDifferite)
  const liquiditaImmediate = total(t, SECTION.liquiditaImmediate)
  const attivoCircolante = magazzino + liquiditaDifferite + liquiditaImmediate

  const totaleAttivo = attivoFissoNetto + attivoCircolante

  const patrimonioNetto = total(t, SECTION.patrimonioNetto)
  const debitiMedioLungo = total(t, SECTION.debitiMedioLungo)
  const debitiBreve = total(t, SECTION.debitiBreve)
  const totalePassivo = patrimonioNetto + debitiMedioLungo + debitiBreve

  // CCN = (crediti commerciali + magazzino + altri crediti)
  //     − (debiti fornitori + altri debiti correnti)
  const creditiCommerciali = detailTotal(accounts, DETAIL.creditiCommerciali)
  const altriCrediti =
    detailTotal(accounts, DETAIL.creditiDiversi) + detailTotal(accounts, DETAIL.erarioIva)
  const debitiFornitori =
    detailTotal(accounts, DETAIL.debitiFornitoriVariabili) +
    detailTotal(accounts, DETAIL.debitiFornitoriFissi)

  // "Altri debiti correnti": quello che sta nei debiti a breve senza essere
  // fornitori. I debiti diversi a medio/lungo non entrano nel circolante.
  const altriDebitiCorrenti = accounts
    .filter(
      (a) =>
        a.section_code === SECTION.debitiBreve &&
        a.detail_tag !== DETAIL.debitiFornitoriVariabili &&
        a.detail_tag !== DETAIL.debitiFornitoriFissi
    )
    .reduce((sum, a) => sum + a.amount_cents, 0)

  return {
    immobilizzazioniImmateriali,
    immobilizzazioniMateriali,
    immobilizzazioniFinanziarie,
    attivoFissoNetto,
    magazzino,
    liquiditaDifferite,
    liquiditaImmediate,
    attivoCircolante,
    totaleAttivo,
    capitaleInvestito: totaleAttivo,
    patrimonioNetto,
    debitiMedioLungo,
    debitiBreve,
    totalePassivo,
    sbilancio: totaleAttivo - totalePassivo,
    creditiCommerciali,
    altriCrediti,
    debitiFornitori,
    altriDebitiCorrenti,
    capitaleCircolanteNetto:
      creditiCommerciali + magazzino + altriCrediti - debitiFornitori - altriDebitiCorrenti
  }
}
