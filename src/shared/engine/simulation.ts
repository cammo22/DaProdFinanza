import { SECTION, type EngineAccount } from './aggregates'
import { balanceSheet } from './balance-sheet'
import { incomeAggregates, type IncomeAggregates } from './income-statement'
import { schedule, type LoanInput } from './loans'
import { ratios } from './ratios'
import { addMonths, parseDate } from './treasury'

/**
 * Analisi & Simulazioni — "cosa succede se…" (AGENTS.md §10.8).
 *
 * È puro calcolo derivato: nessun dato nuovo, solo variazioni applicate ai
 * conti di una base e ripassate negli stessi motori del conto economico,
 * dello stato patrimoniale e degli indici. Così lo scenario è coerente per
 * costruzione con il resto del programma.
 *
 * **La base** sono gli ultimi 12 mesi (o un bilancio annuale): una simulazione
 * ragiona su un anno, e un mese solo porterebbe dentro la sua stagionalità.
 *
 * **La proiezione** guarda ai 12 mesi da oggi, ed è la stessa funzione per la
 * situazione attuale (variazioni a zero) e per lo scenario: il confronto è fra
 * due proiezioni fatte allo stesso modo, non fra un consuntivo e una stima.
 *
 * Scelte dichiarate, da validare col consulente (il modello non tratta le
 * simulazioni):
 *
 * 1. **I costi variabili seguono i ricavi.** Un +10% di ricavi porta un +10% di
 *    materie prime e costi di produzione; le variazioni di "costo merci" e
 *    "costi variabili" sono di prezzo, e si sommano all'effetto volume.
 *    Rimanenze iniziali e finali restano ferme.
 * 2. **"Altri costi fissi"** sono i costi commerciali e generali: il personale
 *    ha la sua leva (dipendenti in più o in meno) e gli ammortamenti seguono
 *    gli investimenti.
 * 3. **Le imposte** applicano all'utile simulato l'aliquota effettiva della
 *    base; se la base non ha utile, il 24% dell'IRES.
 * 4. **Il capitale circolante** segue i volumi: crediti con i ricavi, magazzino e
 *    fornitori con gli acquisti. Un obiettivo di giorni sposta la voce in
 *    proporzione (DSO da 60 a 45 → crediti −25%). La variazione assorbe (o
 *    libera) cassa nei primi tre mesi.
 * 5. **Il cash flow annuo** è un rendiconto semplificato: EBITDA − imposte −
 *    variazione del circolante − investimenti + nuovi finanziamenti − rate dei
 *    12 mesi (esistenti e nuove). Proventi e oneri straordinari restano fuori:
 *    non si ripetono.
 * 6. **Un nuovo investimento** si paga subito e si ammortizza a quote costanti;
 *    **un nuovo finanziamento** si incassa subito, prima rata dopo un mese,
 *    ammortamento francese.
 */

export interface SimulationParams {
  /** Variazione % dei ricavi operativi. */
  ricaviPercent: number
  /** Variazione % di prezzo delle materie prime, oltre all'effetto volume. */
  costoMercePercent: number
  /** Variazione % di prezzo dei costi di produzione, oltre all'effetto volume. */
  costiVariabiliPercent: number
  /** Dipendenti in più (positivo) o in meno (negativo). */
  nuoviDipendenti: number
  /** Costo aziendale annuo di un dipendente, in centesimi. */
  costoDipendenteCents: number
  /** Variazione % dei costi commerciali e generali. */
  altriCostiFissiPercent: number
  /** Giorni obiettivo; null = invariati. */
  dsoTarget: number | null
  dioTarget: number | null
  dpoTarget: number | null
  investimentoCents: number
  /** Anni di ammortamento dell'investimento. */
  investimentoAnni: number
  finanziamentoCents: number
  finanziamentoMesi: number
  finanziamentoTasso: number
  finanziamentoPreammortamentoMesi: number
}

export const PARAMETRI_ZERO: SimulationParams = {
  ricaviPercent: 0,
  costoMercePercent: 0,
  costiVariabiliPercent: 0,
  nuoviDipendenti: 0,
  costoDipendenteCents: 3_500_000,
  altriCostiFissiPercent: 0,
  dsoTarget: null,
  dioTarget: null,
  dpoTarget: null,
  investimentoCents: 0,
  investimentoAnni: 5,
  finanziamentoCents: 0,
  finanziamentoMesi: 60,
  finanziamentoTasso: 5,
  finanziamentoPreammortamentoMesi: 0
}

export interface SimulationBase {
  /** Etichetta della base: "12 mesi a Agosto 2026", "Anno 2025". */
  label: string
  /** Conti economici della base, già su 12 mesi. */
  incomeAccounts: EngineAccount[]
  /** Conti patrimoniali alla fine della base. */
  balanceAccounts: EngineAccount[]
  /** Liquidità di oggi, dalla tesoreria. */
  liquiditaOggi: number
  /** Finanziamenti in essere. */
  loans: LoanInput[]
  today: string
}

export interface SimulationResult {
  aggregates: IncomeAggregates
  ricavi: number
  margineLordoPercent: number | null
  ebitda: number
  utile: number
  breakEven: number | null
  dso: number | null
  dio: number | null
  dpo: number | null
  /** Variazione del capitale circolante rispetto alla base (+ = assorbe cassa). */
  variazioneCircolante: number
  /** Rate dei 12 mesi: esistenti + nuovo finanziamento. */
  servizioDebito: number
  cashFlowAnnuo: number
  liquiditaFinale: number
  posizioneFinanziariaNetta: number
  /** Liquidità mese per mese: indice 0 = oggi, 12 = fra un anno. */
  curva: number[]
  nuovoFinanziamento: {
    rata: number
    interessiTotali: number
    interessi12Mesi: number
    capitale12Mesi: number
  } | null
  ammortamentoInvestimento: number
  aliquotaImposte: number
}

const INCIDENZA_IRES = 0.24

const scala = (cents: number, fattore: number): number => Math.round(cents * fattore)

/**
 * Una voce del circolante nello scenario: segue i volumi del flusso a cui è
 * legata e, se c'è un obiettivo, si sposta in proporzione ai giorni. Senza un
 * valore di partenza per i giorni, l'obiettivo si applica al flusso giornaliero.
 */
function riscala(
  valore: number,
  giorniBase: number | null,
  giorniObiettivo: number | null,
  flussoBase: number,
  flussoSim: number,
  opzioni: { flussoGiorni?: number } = {}
): number {
  const volume = flussoBase > 0 ? flussoSim / flussoBase : 1
  if (giorniObiettivo === null) return Math.round(valore * volume)
  if (giorniBase !== null && giorniBase > 0) {
    return Math.round(valore * (giorniObiettivo / giorniBase) * volume)
  }
  return Math.round((giorniObiettivo * (opzioni.flussoGiorni ?? flussoSim)) / 365)
}

function nuovoPrestito(p: SimulationParams, today: string): LoanInput | null {
  if (p.finanziamentoCents <= 0 || p.finanziamentoMesi < 1) return null
  const rate = Math.min(600, Math.round(p.finanziamentoMesi))
  const grace = Math.min(Math.max(0, Math.round(p.finanziamentoPreammortamentoMesi)), rate - 1)
  return {
    uuid: 'simulazione',
    kind: 'finanziamento',
    label: 'Nuovo finanziamento',
    principal_cents: Math.round(p.finanziamentoCents),
    // Limiti del motore dei finanziamenti: un cursore non deve rompere il calcolo.
    annual_rate_percent: Math.min(50, Math.max(0, p.finanziamentoTasso)),
    first_due_date: addMonths(today, 1),
    installments: rate,
    frequency: 'monthly',
    grace_installments: grace,
    amortization: 'francese',
    balloon_cents: 0
  }
}

/** Le rate di un piano nei 12 mesi da oggi, divise per mese (1..12). */
function rateMensili(plan: ReturnType<typeof schedule>, today: string) {
  const inizio = parseDate(today)
  const mesi = Array.from({ length: 13 }, () => ({ totale: 0, capitale: 0, interessi: 0 }))
  for (let m = 1; m <= 12; m++) {
    const da = m === 1 ? inizio : parseDate(addMonths(today, m - 1))
    const a = parseDate(addMonths(today, m))
    for (const r of plan) {
      const t = parseDate(r.date)
      if (t > da && t <= a) {
        mesi[m]!.totale += r.total
        mesi[m]!.capitale += r.capital
        mesi[m]!.interessi += r.interest
      }
    }
  }
  return mesi
}

export function simulate(base: SimulationBase, p: SimulationParams): SimulationResult {
  const baseIncome = incomeAggregates(base.incomeAccounts)
  const fattoreRicavi = 1 + p.ricaviPercent / 100
  const prestito = nuovoPrestito(p, base.today)
  const pianoNuovo = prestito ? schedule(prestito) : []
  const mesiNuovo = rateMensili(pianoNuovo, base.today)
  const interessiNuovo12 = mesiNuovo.reduce((s, m) => s + m.interessi, 0)
  const ammortamentoInvestimento =
    p.investimentoCents > 0 && p.investimentoAnni > 0
      ? Math.round(p.investimentoCents / p.investimentoAnni)
      : 0

  // --- conto economico simulato, conto per conto -------------------------------
  const conti: EngineAccount[] = base.incomeAccounts.map((a) => {
    switch (a.section_code) {
      case SECTION.ricaviOperativi:
        return { ...a, amount_cents: scala(a.amount_cents, fattoreRicavi) }
      case SECTION.costiMateriePrime:
        return {
          ...a,
          amount_cents: scala(a.amount_cents, fattoreRicavi * (1 + p.costoMercePercent / 100))
        }
      case SECTION.costiProduzione:
        return {
          ...a,
          amount_cents: scala(a.amount_cents, fattoreRicavi * (1 + p.costiVariabiliPercent / 100))
        }
      case SECTION.costiCommerciali:
      case SECTION.costiGenerali:
        return { ...a, amount_cents: scala(a.amount_cents, 1 + p.altriCostiFissiPercent / 100) }
      default:
        return a
    }
  })
  const extra = (section: string, cents: number, name: string): void => {
    if (cents !== 0) {
      conti.push({
        code: `sim-${section}`,
        name,
        section_code: section,
        account_type: 'COSTO',
        detail_tag: null,
        amount_cents: cents
      })
    }
  }
  extra(
    SECTION.costiPersonale,
    Math.round(p.nuoviDipendenti * p.costoDipendenteCents),
    'Variazione organico'
  )
  extra(SECTION.ammortamentiOperativi, ammortamentoInvestimento, 'Ammortamento nuovo investimento')
  extra(SECTION.oneriFinanziari, interessiNuovo12, 'Interessi nuovo finanziamento')

  // Imposte ricalcolate sull'utile simulato con l'aliquota della base.
  const senzaImposte = conti.filter((a) => a.section_code !== SECTION.imposte)
  const ante = incomeAggregates(senzaImposte).utileAnteImposte
  const aliquota =
    baseIncome.utileAnteImposte > 0 ? baseIncome.imposte / baseIncome.utileAnteImposte : INCIDENZA_IRES
  const imposte = Math.max(0, Math.round(ante * aliquota))
  const contiFinali = [
    ...senzaImposte,
    {
      code: 'sim-imposte',
      name: 'Imposte',
      section_code: SECTION.imposte,
      account_type: 'COSTO' as const,
      detail_tag: null,
      amount_cents: imposte
    }
  ]
  const income = incomeAggregates(contiFinali)

  // --- capitale circolante ------------------------------------------------------
  const balance = balanceSheet(base.balanceAccounts)
  const baseRatios = ratios({ accounts: base.balanceAccounts, income: baseIncome, balance, days: 365 })
  const simRatios = ratios({ accounts: base.balanceAccounts, income, balance, days: 365 })
  const acquistiBase = baseIncome.costiMateriePrime + baseIncome.costiProduzione
  const acquistiSim = income.costiMateriePrime + income.costiProduzione

  const dso = p.dsoTarget ?? baseRatios.dso
  const dio = p.dioTarget ?? baseRatios.dio
  const dpo = p.dpoTarget ?? baseRatios.dpo
  const crediti = riscala(
    balance.creditiCommerciali,
    baseRatios.dso,
    p.dsoTarget,
    baseIncome.ricaviOperativi,
    income.ricaviOperativi
  )
  // Il magazzino segue gli acquisti, non il costo del venduto: nel modello
  // quest'ultimo comprende personale diretto e ammortamenti, e un forno nuovo
  // non fa crescere le scorte.
  const magazzino = riscala(balance.magazzino, baseRatios.dio, p.dioTarget, acquistiBase, acquistiSim, {
    flussoGiorni: income.costoDelVenduto
  })
  const fornitori = riscala(
    balance.debitiFornitori,
    baseRatios.dpo,
    p.dpoTarget,
    acquistiBase,
    acquistiSim
  )
  const variazioneCircolante =
    crediti - balance.creditiCommerciali + (magazzino - balance.magazzino) - (fornitori - balance.debitiFornitori)

  // --- cassa ----------------------------------------------------------------------
  const mesiEsistenti = Array.from({ length: 13 }, () => ({ totale: 0, capitale: 0, interessi: 0 }))
  for (const loan of base.loans) {
    rateMensili(schedule(loan), base.today).forEach((m, i) => {
      mesiEsistenti[i]!.totale += m.totale
      mesiEsistenti[i]!.capitale += m.capitale
      mesiEsistenti[i]!.interessi += m.interessi
    })
  }
  const rateEsistenti = mesiEsistenti.reduce((s, m) => s + m.totale, 0)
  const capitaleEsistente = mesiEsistenti.reduce((s, m) => s + m.capitale, 0)
  const rateNuove = mesiNuovo.reduce((s, m) => s + m.totale, 0)
  const capitaleNuovo = mesiNuovo.reduce((s, m) => s + m.capitale, 0)

  const gestione = income.ebitda - income.imposte
  const cashFlowAnnuo =
    gestione -
    variazioneCircolante -
    p.investimentoCents +
    (prestito ? prestito.principal_cents : 0) -
    rateEsistenti -
    rateNuove

  const curva: number[] = [base.liquiditaOggi]
  let saldo = base.liquiditaOggi - p.investimentoCents + (prestito ? prestito.principal_cents : 0)
  for (let m = 1; m <= 12; m++) {
    saldo += gestione / 12
    if (m <= 3) saldo -= variazioneCircolante / 3
    saldo -= mesiEsistenti[m]!.totale + mesiNuovo[m]!.totale
    curva.push(Math.round(saldo))
  }
  const liquiditaFinale = base.liquiditaOggi + cashFlowAnnuo

  // PFN fra 12 mesi: debiti finanziari di oggi, meno il capitale rimborsato,
  // più il nuovo debito residuo, meno la liquidità finale.
  const debitiFinanziari = baseRatios.posizioneFinanziariaNetta + balance.liquiditaImmediate
  const posizioneFinanziariaNetta =
    debitiFinanziari -
    capitaleEsistente +
    (prestito ? prestito.principal_cents - capitaleNuovo : 0) -
    liquiditaFinale

  const primaRataPiena = pianoNuovo.find((r) => !r.grace) ?? pianoNuovo[0]

  return {
    aggregates: income,
    ricavi: income.ricaviNetti,
    margineLordoPercent: income.ricaviNetti ? (income.grossProfit / income.ricaviNetti) * 100 : null,
    ebitda: income.ebitda,
    utile: income.utile,
    breakEven: simRatios.bepCents,
    dso,
    dio,
    dpo,
    variazioneCircolante,
    servizioDebito: rateEsistenti + rateNuove,
    cashFlowAnnuo,
    liquiditaFinale,
    posizioneFinanziariaNetta,
    curva,
    nuovoFinanziamento: prestito
      ? {
          rata: primaRataPiena?.total ?? 0,
          interessiTotali: pianoNuovo.reduce((s, r) => s + r.interest, 0),
          interessi12Mesi: interessiNuovo12,
          capitale12Mesi: capitaleNuovo
        }
      : null,
    ammortamentoInvestimento,
    aliquotaImposte: aliquota
  }
}

export interface ImpactRow {
  key: string
  label: string
  attuale: number
  simulato: number
  nota: string
}

/** Le righe della tabella "dettaglio impatti", con la nota che spiega da dove arriva la differenza. */
export function impactRows(
  attuale: SimulationResult,
  simulato: SimulationResult,
  p: SimulationParams
): ImpactRow[] {
  const a = attuale.aggregates
  const s = simulato.aggregates
  const pct = (v: number): string =>
    `${v > 0 ? '+' : ''}${v.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
  const note = (parti: (string | false)[]): string => parti.filter(Boolean).join(' · ')

  return [
    {
      key: 'ricavi',
      label: 'Ricavi',
      attuale: a.ricaviNetti,
      simulato: s.ricaviNetti,
      nota: note([p.ricaviPercent !== 0 && `Ricavi ${pct(p.ricaviPercent)}`])
    },
    {
      key: 'variabili',
      label: 'Costi variabili',
      attuale: a.costiVariabili,
      simulato: s.costiVariabili,
      nota: note([
        p.ricaviPercent !== 0 && 'Seguono i volumi',
        p.costoMercePercent !== 0 && `Prezzo merci ${pct(p.costoMercePercent)}`,
        p.costiVariabiliPercent !== 0 && `Costi di produzione ${pct(p.costiVariabiliPercent)}`
      ])
    },
    {
      key: 'personale',
      label: 'Personale',
      attuale: a.costiPersonale,
      simulato: s.costiPersonale,
      nota: note([
        p.nuoviDipendenti !== 0 &&
          `${p.nuoviDipendenti > 0 ? '+' : ''}${p.nuoviDipendenti} dipendent${Math.abs(p.nuoviDipendenti) === 1 ? 'e' : 'i'}`
      ])
    },
    {
      key: 'fissi',
      label: 'Altri costi fissi',
      attuale: a.costiCommerciali + a.costiGenerali,
      simulato: s.costiCommerciali + s.costiGenerali,
      nota: note([
        p.altriCostiFissiPercent !== 0 &&
          `Costi commerciali e generali ${pct(p.altriCostiFissiPercent)}`
      ])
    },
    { key: 'ebitda', label: 'EBITDA / MOL', attuale: a.ebitda, simulato: s.ebitda, nota: '' },
    {
      key: 'ammortamenti',
      label: 'Ammortamenti',
      attuale: a.ammortamenti,
      simulato: s.ammortamenti,
      nota: note([simulato.ammortamentoInvestimento > 0 && 'Quota del nuovo investimento'])
    },
    {
      key: 'oneri',
      label: 'Oneri finanziari',
      attuale: a.oneriFinanziari,
      simulato: s.oneriFinanziari,
      nota: note([simulato.nuovoFinanziamento !== null && 'Interessi del nuovo finanziamento nei 12 mesi'])
    },
    {
      key: 'imposte',
      label: 'Imposte',
      attuale: a.imposte,
      simulato: s.imposte,
      nota: `Aliquota effettiva ${pct(Math.round(simulato.aliquotaImposte * 1000) / 10).replace('+', '')}`
    },
    { key: 'utile', label: 'Utile netto', attuale: a.utile, simulato: s.utile, nota: '' },
    {
      key: 'circolante',
      label: 'Assorbimento di cassa del circolante',
      attuale: attuale.variazioneCircolante,
      simulato: simulato.variazioneCircolante,
      nota: note([
        p.dsoTarget !== null && `DSO a ${p.dsoTarget} gg`,
        p.dioTarget !== null && `DIO a ${p.dioTarget} gg`,
        p.dpoTarget !== null && `DPO a ${p.dpoTarget} gg`,
        p.ricaviPercent !== 0 && 'Crediti, magazzino e fornitori seguono i volumi'
      ])
    },
    {
      key: 'debito',
      label: 'Rate dei finanziamenti (12 mesi)',
      attuale: attuale.servizioDebito,
      simulato: simulato.servizioDebito,
      nota: note([simulato.nuovoFinanziamento !== null && 'Comprese le rate del nuovo finanziamento'])
    },
    {
      key: 'cashflow',
      label: 'Cash flow annuo',
      attuale: attuale.cashFlowAnnuo,
      simulato: simulato.cashFlowAnnuo,
      nota: note([
        p.investimentoCents > 0 && 'Investimento pagato subito',
        p.finanziamentoCents > 0 && 'Finanziamento incassato subito'
      ])
    }
  ]
}
