import type { SimulationParams } from './simulation'

/**
 * Scenari pronti per Analisi & Simulazioni: un clic imposta le leve, poi le
 * si ritocca e, se serve, si salva lo scenario con un nome.
 *
 * Si adattano all'azienda: importi in proporzione ai ricavi annui della base,
 * giorni di incasso e pagamento a partire da quelli attuali. Sono ipotesi di
 * lavoro scelte da noi, non previsioni: servono a vedere in fretta come
 * reagiscono utile, cassa e debito.
 *
 * I due scenari "estremi" hanno valori volutamente fuori scala e servono solo
 * a collaudare il programma (grafici, avvisi, numeri enormi o negativi): non
 * vanno mai presentati come ipotesi realistiche.
 */

export type ToniScenario = 'positivo' | 'negativo' | 'imprevisto' | 'estremo'

export interface ContestoScenario {
  /** Ricavi annui della base, in centesimi. */
  ricavi: number
  dso: number | null
  dio: number | null
  dpo: number | null
}

export interface ScenarioPronto {
  id: string
  nome: string
  descrizione: string
  tono: ToniScenario
  leve: (c: ContestoScenario) => Partial<SimulationParams>
}

/** Una quota dei ricavi annui, arrotondata ai mille euro. */
const quota = (c: ContestoScenario, q: number): number => Math.max(0, Math.round((c.ricavi * q) / 100_000) * 100_000)
const giorni = (base: number | null, delta: number, minimo = 0): number =>
  Math.max(minimo, Math.round((base ?? 30) + delta))

export const SCENARI_PRONTI: ScenarioPronto[] = [
  // --- positivi -----------------------------------------------------------------
  {
    id: 'crescita',
    nome: 'Crescita solida',
    descrizione: 'Ricavi +15% e un dipendente in più per reggerli.',
    tono: 'positivo',
    leve: () => ({ ricaviPercent: 15, nuoviDipendenti: 1 })
  },
  {
    id: 'prezzi',
    nome: 'Aumento dei prezzi del 5%',
    descrizione: 'Stessi volumi venduti a prezzi più alti: i costi variabili non salgono.',
    tono: 'positivo',
    // I costi variabili seguono i ricavi: si compensa perché i volumi restino uguali.
    leve: () => ({ ricaviPercent: 5, costoMercePercent: -4.8, costiVariabiliPercent: -4.8 })
  },
  {
    id: 'efficienza',
    nome: 'Efficienza sui costi',
    descrizione: 'Costi commerciali e generali −10%, costi di produzione −5%.',
    tono: 'positivo',
    leve: () => ({ altriCostiFissiPercent: -10, costiVariabiliPercent: -5 })
  },
  {
    id: 'incassi-rapidi',
    nome: 'Incassi più rapidi',
    descrizione: 'I clienti pagano 20 giorni prima: si libera cassa senza vendere di più.',
    tono: 'positivo',
    leve: (c) => ({ dsoTarget: giorni(c.dso, -20) })
  },
  {
    id: 'espansione',
    nome: 'Espansione finanziata',
    descrizione:
      'Ricavi +25%, tre dipendenti, un investimento pari al 20% dei ricavi coperto da un finanziamento a 5 anni.',
    tono: 'positivo',
    leve: (c) => ({
      ricaviPercent: 25,
      nuoviDipendenti: 3,
      investimentoCents: quota(c, 0.2),
      investimentoAnni: 5,
      finanziamentoCents: quota(c, 0.2),
      finanziamentoMesi: 60,
      finanziamentoTasso: 5
    })
  },
  {
    id: 'anno-eccezionale',
    nome: 'Anno eccezionale',
    descrizione: 'Ricavi +40%, acquisti a prezzi migliori (−3%), due dipendenti in più.',
    tono: 'positivo',
    leve: () => ({ ricaviPercent: 40, costoMercePercent: -3, nuoviDipendenti: 2 })
  },

  // --- negativi -----------------------------------------------------------------
  {
    id: 'calo-domanda',
    nome: 'Calo della domanda',
    descrizione: 'Ricavi −20% con la stessa struttura di costi fissi.',
    tono: 'negativo',
    leve: () => ({ ricaviPercent: -20 })
  },
  {
    id: 'rincari',
    nome: 'Rincaro di materie prime ed energia',
    descrizione: 'Materie prime +20%, costi di produzione +10%, prezzi di vendita fermi.',
    tono: 'negativo',
    leve: () => ({ costoMercePercent: 20, costiVariabiliPercent: 10 })
  },
  {
    id: 'crisi-liquidita',
    nome: 'Stretta di liquidità',
    descrizione: 'Ricavi −15%, clienti che pagano 30 giorni dopo, fornitori che vogliono 20 giorni prima.',
    tono: 'negativo',
    leve: (c) => ({ ricaviPercent: -15, dsoTarget: giorni(c.dso, 30), dpoTarget: giorni(c.dpo, -20) })
  },

  // --- imprevisti ---------------------------------------------------------------
  {
    id: 'cliente-insolvente',
    nome: 'Un cliente importante non paga',
    descrizione: 'Incassi rallentati di 60 giorni e ricavi −10% per la perdita del cliente.',
    tono: 'imprevisto',
    leve: (c) => ({ ricaviPercent: -10, dsoTarget: giorni(c.dso, 60) })
  },
  {
    id: 'guasto',
    nome: 'Guasto di un impianto',
    descrizione:
      'Una spesa imprevista pari al 10% dei ricavi, pagata di tasca propria, e un mese di fermo (ricavi −8%).',
    tono: 'imprevisto',
    leve: (c) => ({ investimentoCents: quota(c, 0.1), investimentoAnni: 5, ricaviPercent: -8 })
  },
  {
    id: 'fornitori',
    nome: 'I fornitori chiedono di pagare prima',
    descrizione: 'Pagamenti ai fornitori anticipati di 30 giorni.',
    tono: 'imprevisto',
    leve: (c) => ({ dpoTarget: giorni(c.dpo, -30) })
  },

  // --- estremi, solo per collaudo -------------------------------------------------------
  {
    id: 'estremo-incassi',
    nome: 'ESTREMO — si incassa troppo (solo test)',
    descrizione:
      'Valori volutamente fuori scala per collaudare il programma: ricavi +300% e clienti che pagano subito. Non è un’ipotesi realistica.',
    tono: 'estremo',
    leve: () => ({ ricaviPercent: 300, dsoTarget: 0 })
  },
  {
    id: 'estremo-perdite',
    nome: 'ESTREMO — si perde troppo (solo test)',
    descrizione:
      'Valori volutamente fuori scala per collaudare il programma: ricavi −80%, materie prime +60%, costi fissi +50%. Non è un’ipotesi realistica.',
    tono: 'estremo',
    leve: () => ({ ricaviPercent: -80, costoMercePercent: 60, altriCostiFissiPercent: 50 })
  }
]
