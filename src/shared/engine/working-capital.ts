import type { BalanceSheet } from './balance-sheet'
import type { Ratios } from './ratios'

/**
 * Capitale circolante — docs/MODELLO_FINANZIARIO.md §6, AGENTS.md §10.5.
 *
 * Gli indici (DSO, DIO, DPO, CCC) li calcola già `ratios()`. Qui c'è quello che
 * serve alla vista dedicata: le componenti, i confronti e le **note
 * automatiche**.
 *
 * §6 dice che le note si generano "con regole semplici su soglie di
 * variazione", senza fissare le soglie (§9 lo elenca fra le cose mancanti). Le
 * soglie qui sotto sono quindi una scelta dichiarata, da validare col
 * consulente, e stanno tutte in `SOGLIE_NOTE` per poterle cambiare in un punto.
 */

export interface WorkingCapitalSnapshot {
  creditiCommerciali: number
  magazzino: number
  altriCrediti: number
  debitiFornitori: number
  altriDebitiCorrenti: number
  capitaleCircolanteNetto: number
  dso: number | null
  dio: number | null
  dpo: number | null
  ccc: number | null
}

export function snapshot(balance: BalanceSheet, r: Ratios): WorkingCapitalSnapshot {
  return {
    creditiCommerciali: balance.creditiCommerciali,
    magazzino: balance.magazzino,
    altriCrediti: balance.altriCrediti,
    debitiFornitori: balance.debitiFornitori,
    altriDebitiCorrenti: balance.altriDebitiCorrenti,
    capitaleCircolanteNetto: balance.capitaleCircolanteNetto,
    dso: r.dso,
    dio: r.dio,
    dpo: r.dpo,
    ccc: r.ccc
  }
}

export const SOGLIE_NOTE = {
  /** Giorni di differenza oltre i quali un indice di ciclo "si muove". */
  giorni: 5,
  /** Variazione % oltre la quale una componente "si muove". */
  percento: 10,
  /** Quota dei crediti scaduti da oltre 60 giorni che merita un avviso. */
  scadutiOltre60: 10
} as const

/** Variazione assoluta, o null se uno dei due valori manca. */
export function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null
  return current - previous
}

/** Variazione %, o null se il valore di partenza è zero o manca. */
export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/**
 * Media mobile semplice su `window` punti. I primi punti, che non hanno
 * abbastanza storia, valgono null: una media su due mesi chiamata "a tre mesi"
 * sarebbe un'altra cosa.
 */
export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < window) return null
    const slice = values.slice(i + 1 - window, i + 1)
    if (slice.some((v) => v === null)) return null
    return (slice as number[]).reduce((s, v) => s + v, 0) / window
  })
}

export type NoteTone = 'positive' | 'negative' | 'neutral'

export interface WorkingCapitalNote {
  /** A quale riga o indice si riferisce la nota. */
  subject: keyof WorkingCapitalSnapshot | 'scaduti'
  tone: NoteTone
  text: string
}

export interface NoteInput {
  current: WorkingCapitalSnapshot
  /** Stesso periodo dell'anno precedente. */
  previousYear: WorkingCapitalSnapshot | null
  /** Crediti aperti e scaduti da oltre 60 giorni, dallo scadenziario (centesimi). */
  receivablesOverdue60Cents?: number
  /** Totale dei crediti aperti nello scadenziario (centesimi). */
  receivablesOpenCents?: number
}

const giorni = (n: number): string => `${Math.round(Math.abs(n))} giorn${Math.round(Math.abs(n)) === 1 ? 'o' : 'i'}`

/**
 * Le note automatiche della vista. Ogni nota dice da quale numero arriva:
 * non è un giudizio, è la lettura di una variazione.
 */
export function workingCapitalNotes(input: NoteInput): WorkingCapitalNote[] {
  const { current, previousYear } = input
  const notes: WorkingCapitalNote[] = []
  const s = SOGLIE_NOTE

  if (previousYear) {
    const dDso = delta(current.dso, previousYear.dso)
    if (dDso !== null && Math.abs(dDso) >= s.giorni) {
      notes.push({
        subject: 'dso',
        tone: dDso > 0 ? 'negative' : 'positive',
        text:
          dDso > 0
            ? `I clienti pagano mediamente ${giorni(dDso)} più tardi rispetto allo scorso anno.`
            : `I clienti pagano mediamente ${giorni(dDso)} prima rispetto allo scorso anno.`
      })
    }

    const dDio = delta(current.dio, previousYear.dio)
    if (dDio !== null && Math.abs(dDio) >= s.giorni) {
      notes.push({
        subject: 'dio',
        tone: dDio > 0 ? 'negative' : 'positive',
        text:
          dDio > 0
            ? `Rotazione del magazzino peggiorata: la merce resta ferma ${giorni(dDio)} in più.`
            : `Rotazione del magazzino migliorata: la merce resta ferma ${giorni(dDio)} in meno.`
      })
    }

    const dDpo = delta(current.dpo, previousYear.dpo)
    if (dDpo !== null && Math.abs(dDpo) >= s.giorni) {
      // Pagare più tardi i fornitori aiuta la cassa, ma non è di per sé una
      // buona notizia: può essere un segnale di tensione. Nota neutra.
      notes.push({
        subject: 'dpo',
        tone: 'neutral',
        text:
          dDpo > 0
            ? `I fornitori vengono pagati ${giorni(dDpo)} più tardi rispetto allo scorso anno.`
            : `I fornitori vengono pagati ${giorni(dDpo)} prima rispetto allo scorso anno.`
      })
    }

    const dCcc = delta(current.ccc, previousYear.ccc)
    if (dCcc !== null && Math.abs(dCcc) >= s.giorni) {
      notes.push({
        subject: 'ccc',
        tone: dCcc > 0 ? 'negative' : 'positive',
        text:
          dCcc > 0
            ? `Il ciclo di cassa si è allungato di ${giorni(dCcc)}: serve più liquidità per finanziare l'attività.`
            : `Il ciclo di cassa si è accorciato di ${giorni(dCcc)}: l'attività assorbe meno liquidità.`
      })
    }

    const componenti: {
      key: keyof WorkingCapitalSnapshot
      nome: string
      /** Un aumento è un assorbimento di cassa (attivo) o una fonte (passivo). */
      attivo: boolean
    }[] = [
      { key: 'creditiCommerciali', nome: 'Crediti commerciali', attivo: true },
      { key: 'magazzino', nome: 'Magazzino', attivo: true },
      { key: 'altriCrediti', nome: 'Altri crediti', attivo: true },
      { key: 'debitiFornitori', nome: 'Debiti verso fornitori', attivo: false },
      { key: 'altriDebitiCorrenti', nome: 'Altri debiti correnti', attivo: false }
    ]
    for (const c of componenti) {
      const pct = deltaPercent(current[c.key], previousYear[c.key])
      if (pct === null || Math.abs(pct) < s.percento) continue
      const su = pct > 0
      notes.push({
        subject: c.key,
        tone: 'neutral',
        text: `${c.nome} ${su ? 'in aumento' : 'in calo'} del ${Math.round(Math.abs(pct))}% sullo stesso periodo dell'anno scorso${
          c.attivo
            ? su
              ? ': assorbono più liquidità.'
              : ': liberano liquidità.'
            : su
              ? ': finanziano una parte maggiore del circolante.'
              : ': finanziano una parte minore del circolante.'
        }`
      })
    }
  }

  const aperti = input.receivablesOpenCents ?? 0
  const scaduti = input.receivablesOverdue60Cents ?? 0
  if (aperti > 0 && (scaduti / aperti) * 100 >= s.scadutiOltre60) {
    notes.push({
      subject: 'scaduti',
      tone: 'negative',
      text: `Il ${Math.round((scaduti / aperti) * 100)}% dei crediti aperti nello scadenziario è scaduto da oltre 60 giorni.`
    })
  }

  return notes
}
