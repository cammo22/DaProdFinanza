import type { AccountType } from '../types'

/**
 * Aggregazione dei saldi per sezione — il primo passo di ogni riclassificazione.
 *
 * Convenzione di segno, valida per tutto il motore: **i costi sono positivi**.
 * Un conto di sezione `costi_personale` con 50.000 € porta `amount_cents`
 * 5_000_000, e sono le formule a sottrarlo. Lo stesso vale per i debiti nel
 * passivo. L'unica eccezione è `ATTIVITA' NEGATIVO` (fondi ammortamento e
 * svalutazione), che si sottrae dentro la propria sezione.
 *
 * Tutti gli importi restano interi in centesimi fino al bordo (UI, export).
 */

/** Codici delle sezioni — devono coincidere con la migrazione 002. */
export const SECTION = {
  ricaviOperativi: 'ricavi_operativi',
  rimanenzeFinaliRicavo: 'rimanenze_finali_ricavo',
  proventiStraordinari: 'proventi_straordinari',
  proventiFinanziari: 'proventi_finanziari',

  esistenzeIniziali: 'esistenze_iniziali',
  costiMateriePrime: 'costi_materie_prime',
  costiProduzione: 'costi_produzione',
  ammortamentiOperativi: 'ammortamenti_operativi',
  costiPersonale: 'costi_personale',
  costiCommerciali: 'costi_commerciali',
  costiGenerali: 'costi_generali_amministrativi',
  ammortamentiNonOperativi: 'ammortamenti_non_operativi',
  oneriStraordinari: 'oneri_straordinari',
  oneriFinanziari: 'oneri_finanziari',
  imposte: 'imposte',

  immobilizzazioniImmateriali: 'immobilizzazioni_immateriali',
  immobilizzazioniMateriali: 'immobilizzazioni_materiali',
  immobilizzazioniFinanziarie: 'immobilizzazioni_finanziarie',
  rimanenzeFinaliMagazzino: 'rimanenze_finali_magazzino',
  liquiditaDifferite: 'liquidita_differite',
  liquiditaImmediate: 'liquidita_immediate',

  patrimonioNetto: 'patrimonio_netto',
  debitiMedioLungo: 'debiti_medio_lungo',
  debitiBreve: 'debiti_breve'
} as const

export type SectionCode = (typeof SECTION)[keyof typeof SECTION]

/** Sotto-classificazioni scelte per conto (docs/MODELLO_FINANZIARIO.md §2.3-§2.4). */
export const DETAIL = {
  creditiCommerciali: 'Crediti Commerciali',
  creditiDiversi: 'Crediti Diversi',
  erarioIva: 'Erario c/IVA',
  utileANuovo: 'Utile a nuovo',
  utile: 'Utile',
  fondoTfr: 'Fondo TFR',
  debitiDiversi: 'Debiti Diversi',
  debitiFornitoriVariabili: 'Debiti v/Fornitori (costi variabili)',
  debitiFornitoriFissi: 'Debiti v/Fornitori (costi fissi)',
  debitiEntiPrevidenziali: 'Debiti v/Enti Previdenziali'
} as const

/** Un conto con il suo saldo in un periodo: l'input del motore. */
export interface EngineAccount {
  code: string
  name: string
  section_code: string
  account_type: AccountType
  detail_tag: string | null
  amount_cents: number
}

export type SectionTotals = Record<string, number>

/**
 * Somma i saldi per sezione. `ATTIVITA' NEGATIVO` si sottrae: un fondo
 * ammortamento vive dentro Immobilizzazioni Materiali e ne riduce il valore.
 */
export function sectionTotals(accounts: EngineAccount[]): SectionTotals {
  const totals: SectionTotals = {}
  for (const account of accounts) {
    const sign = account.account_type === "ATTIVITA' NEGATIVO" ? -1 : 1
    totals[account.section_code] = (totals[account.section_code] ?? 0) + sign * account.amount_cents
  }
  return totals
}

/** Somma i saldi dei conti che portano una certa sotto-classificazione. */
export function detailTotal(accounts: EngineAccount[], detailTag: string): number {
  return accounts
    .filter((account) => account.detail_tag === detailTag)
    .reduce((sum, account) => sum + account.amount_cents, 0)
}

export function total(totals: SectionTotals, ...sections: string[]): number {
  return sections.reduce((sum, section) => sum + (totals[section] ?? 0), 0)
}
