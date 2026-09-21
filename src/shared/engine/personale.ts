import type { TreasuryItemInput } from './treasury'

/**
 * Personale — AGENTS.md §10.16 (versione 1.3.0).
 *
 * Quanto costa davvero ogni persona all'azienda, e quanto costa un'ora del suo
 * lavoro: è il numero che serve alla Marginalità (la manodopera di una
 * commessa o di una ricetta) e alla Tesoreria (stipendi e F24).
 *
 * Il calcolo è quello di un consulente del lavoro "a spanne", dichiarato:
 *
 *   costo aziendale = RAL + contributi INPS a carico azienda + INAIL + TFR + altri costi
 *
 * - **RAL**: retribuzione annua lorda, comprese tredicesima e quattordicesima.
 * - **Contributi**: una percentuale della RAL (di solito 28-32%; di meno per
 *   gli apprendisti). Si può scrivere per persona, altrimenti vale quella
 *   dell'azienda.
 * - **INAIL**: il premio, in percentuale della RAL (dipende dal rischio: da
 *   meno dell'1% di un ufficio a diversi punti di un cantiere).
 * - **TFR**: la RAL divisa 13,5 (art. 2120 c.c.); i collaboratori non ce l'hanno.
 * - **Altri costi**: buoni pasto, welfare, formazione, divise, visite mediche.
 *
 * Il **costo orario** divide il costo aziendale per le ore davvero lavorate in
 * un anno (per un tempo pieno di solito 1.650-1.750: 52 settimane meno ferie,
 * permessi e festività), in proporzione alle ore del contratto.
 *
 * Importi in centesimi, come in tutto il motore.
 */

export const CONTRATTI = ['indeterminato', 'determinato', 'apprendistato', 'collaborazione', 'altro'] as const
export type Contratto = (typeof CONTRATTI)[number]

export const CONTRATTO_LABELS: Record<Contratto, string> = {
  indeterminato: 'Tempo indeterminato',
  determinato: 'Tempo determinato',
  apprendistato: 'Apprendistato',
  collaborazione: 'Collaborazione',
  altro: 'Altro'
}

export interface ImpostazioniPersonale {
  /** Ore settimanali di un tempo pieno (il riferimento per il part-time). */
  orePieno: number
  /** Ore lavorate in un anno da un tempo pieno, tolte ferie, permessi e festività. */
  oreAnnue: number
  /** Contributi INPS a carico dell'azienda, in % della RAL. */
  contributiPct: number
  /** Premio INAIL, in % della RAL. */
  inailPct: number
  /**
   * Quota della retribuzione lorda che non va in busta ma si versa con l'F24
   * (contributi del dipendente e ritenute IRPEF): serve solo alla tesoreria.
   */
  trattenutePct: number
  /** Giorno del mese in cui si pagano gli stipendi del mese prima. */
  giornoStipendio: number
  /** Mese (1-12) della tredicesima e della quattordicesima. */
  meseTredicesima: number
  meseQuattordicesima: number
  /** Stipendi, F24 e INAIL entrano nella previsione di tesoreria. */
  inTesoreria: boolean
}

export const PERSONALE_PREDEFINITO: ImpostazioniPersonale = {
  orePieno: 40,
  oreAnnue: 1720,
  contributiPct: 30,
  inailPct: 1,
  trattenutePct: 25,
  giornoStipendio: 10,
  meseTredicesima: 12,
  meseQuattordicesima: 7,
  // Spenta di partenza: chi ha già scritto "Stipendi" e "F24" nello
  // scadenziario li troverebbe contati due volte.
  inTesoreria: false
}

function numero(v: unknown, base: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : base
}

function intero(v: unknown, base: number, min: number, max: number): number {
  return Math.round(numero(v, base, min, max))
}

export function normalizzaPersonale(
  v: unknown,
  base: ImpostazioniPersonale = PERSONALE_PREDEFINITO
): ImpostazioniPersonale {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  return {
    orePieno: numero(o.orePieno, base.orePieno, 1, 60),
    oreAnnue: intero(o.oreAnnue, base.oreAnnue, 500, 2500),
    contributiPct: numero(o.contributiPct, base.contributiPct, 0, 60),
    inailPct: numero(o.inailPct, base.inailPct, 0, 30),
    trattenutePct: numero(o.trattenutePct, base.trattenutePct, 0, 60),
    giornoStipendio: intero(o.giornoStipendio, base.giornoStipendio, 1, 28),
    meseTredicesima: intero(o.meseTredicesima, base.meseTredicesima, 1, 12),
    meseQuattordicesima: intero(o.meseQuattordicesima, base.meseQuattordicesima, 1, 12),
    inTesoreria: typeof o.inTesoreria === 'boolean' ? o.inTesoreria : base.inTesoreria
  }
}

export interface DipendenteCalcolo {
  uuid: string
  name: string
  department: string | null
  contract: Contratto
  /** Ore settimanali del contratto. */
  hours_week: number
  gross_annual_cents: number
  /** 12, 13 o 14 mensilità. */
  monthly_payments: number
  /** null = quella dell'azienda. */
  employer_contrib_pct: number | null
  inail_pct: number | null
  /** Buoni pasto, welfare, formazione… all'anno. */
  other_costs_cents: number
  /** Lavora sulla produzione (costo diretto) o sulla struttura (indiretto). */
  direct: 0 | 1
  start_date: string | null
  end_date: string | null
}

export interface CostoDipendente {
  ral: number
  contributi: number
  inail: number
  tfr: number
  altri: number
  /** Costo aziendale annuo. */
  totale: number
  /** Equivalente tempo pieno (0,6 = 24 ore su 40). */
  fte: number
  /** Ore lavorate in un anno. */
  oreAnno: number
  /** Costo di un'ora di lavoro; null se non ci sono ore. */
  costoOrario: number | null
  /** Costo aziendale di un mese medio. */
  mensile: number
}

export function costoDipendente(d: DipendenteCalcolo, imp: ImpostazioniPersonale): CostoDipendente {
  const ral = Math.max(0, Math.round(d.gross_annual_cents))
  const contributi = Math.round((ral * (d.employer_contrib_pct ?? imp.contributiPct)) / 100)
  const inail = Math.round((ral * (d.inail_pct ?? imp.inailPct)) / 100)
  const tfr = d.contract === 'collaborazione' ? 0 : Math.round(ral / 13.5)
  const altri = Math.max(0, Math.round(d.other_costs_cents))
  const totale = ral + contributi + inail + tfr + altri
  const fte = imp.orePieno > 0 ? Math.max(0, d.hours_week) / imp.orePieno : 0
  const oreAnno = Math.round(imp.oreAnnue * fte)
  return {
    ral,
    contributi,
    inail,
    tfr,
    altri,
    totale,
    fte,
    oreAnno,
    costoOrario: oreAnno > 0 ? Math.round(totale / oreAnno) : null,
    mensile: Math.round(totale / 12)
  }
}

/** In forza a una data: assunto (o senza data) e non ancora uscito. */
export function inForza(d: Pick<DipendenteCalcolo, 'start_date' | 'end_date'>, data: string): boolean {
  if (d.start_date && d.start_date > data) return false
  if (d.end_date && d.end_date < data) return false
  return true
}

export interface RiepilogoPersonale {
  /** Persone in forza oggi. */
  persone: number
  fte: number
  ral: number
  /** Costo aziendale annuo di chi è in forza oggi. */
  totale: number
  diretti: number
  indiretti: number
  /** Costo medio di un'ora, pesato sulle ore di ciascuno. */
  costoOrarioMedio: number | null
  /** Costo orario medio di chi lavora sulla produzione: la manodopera delle commesse. */
  costoOrarioDiretti: number | null
  perReparto: { reparto: string; persone: number; fte: number; totale: number }[]
}

export function riepilogoPersonale(
  lista: DipendenteCalcolo[],
  imp: ImpostazioniPersonale,
  oggi: string
): RiepilogoPersonale {
  const attivi = lista.filter((d) => inForza(d, oggi))
  let fte = 0
  let ral = 0
  let totale = 0
  let diretti = 0
  let ore = 0
  let oreDiretti = 0
  const reparti = new Map<string, { reparto: string; persone: number; fte: number; totale: number }>()
  for (const d of attivi) {
    const c = costoDipendente(d, imp)
    fte += c.fte
    ral += c.ral
    totale += c.totale
    ore += c.oreAnno
    if (d.direct) {
      diretti += c.totale
      oreDiretti += c.oreAnno
    }
    const nome = d.department?.trim() || 'Senza reparto'
    const r = reparti.get(nome) ?? { reparto: nome, persone: 0, fte: 0, totale: 0 }
    r.persone++
    r.fte += c.fte
    r.totale += c.totale
    reparti.set(nome, r)
  }
  return {
    persone: attivi.length,
    fte: Math.round(fte * 100) / 100,
    ral,
    totale,
    diretti,
    indiretti: totale - diretti,
    costoOrarioMedio: ore > 0 ? Math.round(totale / ore) : null,
    costoOrarioDiretti: oreDiretti > 0 ? Math.round(diretti / oreDiretti) : null,
    perReparto: [...reparti.values()].sort((a, b) => b.totale - a.totale)
  }
}

// --- tesoreria --------------------------------------------------------------------

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
]

const pad = (n: number): string => String(n).padStart(2, '0')
const giorno = (anno: number, mese: number, g: number): string => `${anno}-${pad(mese)}-${pad(g)}`

/**
 * Stipendi, F24 e INAIL dei prossimi mesi, come movimenti della tesoreria.
 *
 * - Lo stipendio netto del mese M si paga il `giornoStipendio` del mese dopo:
 *   la retribuzione lorda del mese (RAL / mensilità, più tredicesima e
 *   quattordicesima nei loro mesi) meno le trattenute.
 * - Il 16 del mese dopo l'F24: trattenute del dipendente più contributi a
 *   carico dell'azienda sulla stessa retribuzione.
 * - Gli altri costi (buoni pasto…) un dodicesimo al mese, con gli stipendi.
 * - L'INAIL si paga in autoliquidazione il 16 febbraio.
 * - Il TFR non esce di cassa: resta in azienda fino alla fine del rapporto.
 *
 * Solo movimenti dopo `oggi`, per `mesi` mesi di stipendi.
 */
export function flussiPersonale(
  lista: DipendenteCalcolo[],
  imp: ImpostazioniPersonale,
  oggi: string,
  mesi = 12
): TreasuryItemInput[] {
  const [a0, m0] = oggi.split('-').map(Number) as [number, number]
  const items: TreasuryItemInput[] = []
  const voce = (
    id: string,
    data: string,
    categoria: string,
    descrizione: string,
    cents: number
  ): void => {
    if (cents <= 0 || data <= oggi) return
    items.push({
      uuid: `personale#${id}`,
      direction: 'out',
      source: 'personale',
      category: categoria,
      description: descrizione,
      due_date: data,
      amount_cents: cents,
      paid_cents: 0,
      paid_date: null,
      recurrence: 'none',
      recurrence_until: null
    })
  }

  // Si parte dal mese scorso: il suo stipendio si paga questo mese.
  for (let k = -1; k < mesi; k++) {
    const indice = a0 * 12 + (m0 - 1) + k
    const anno = Math.floor(indice / 12)
    const mese = (indice % 12) + 1
    const fine = giorno(anno, mese, new Date(Date.UTC(anno, mese, 0)).getUTCDate())
    const inizio = giorno(anno, mese, 1)
    let lordo = 0
    let contributi = 0
    let altri = 0
    for (const d of lista) {
      // In forza almeno un giorno del mese.
      if (d.start_date && d.start_date > fine) continue
      if (d.end_date && d.end_date < inizio) continue
      const c = costoDipendente(d, imp)
      const mens = Math.max(1, d.monthly_payments)
      let quote = 1
      if (mens >= 13 && mese === imp.meseTredicesima) quote++
      if (mens >= 14 && mese === imp.meseQuattordicesima) quote++
      const lordoMese = Math.round((c.ral / mens) * quote)
      lordo += lordoMese
      contributi += Math.round((lordoMese * (d.employer_contrib_pct ?? imp.contributiPct)) / 100)
      altri += Math.round(c.altri / 12)
    }
    const trattenute = Math.round((lordo * imp.trattenutePct) / 100)
    const pIndice = indice + 1
    const pAnno = Math.floor(pIndice / 12)
    const pMese = (pIndice % 12) + 1
    const nome = `${MESI[mese - 1]} ${anno}`
    voce(`stipendi-${anno}-${mese}`, giorno(pAnno, pMese, imp.giornoStipendio), 'Personale', `Stipendi di ${nome}`, lordo - trattenute + altri)
    voce(`f24-${anno}-${mese}`, giorno(pAnno, pMese, 16), 'Imposte e contributi', `F24 contributi e ritenute di ${nome}`, trattenute + contributi)
  }

  // INAIL: il 16 febbraio dentro l'orizzonte.
  const inail = lista.filter((d) => inForza(d, oggi)).reduce((s, d) => s + costoDipendente(d, imp).inail, 0)
  for (const anno of [a0, a0 + 1]) {
    voce(`inail-${anno}`, giorno(anno, 2, 16), 'Imposte e contributi', `INAIL, autoliquidazione ${anno}`, inail)
  }
  return items
}
