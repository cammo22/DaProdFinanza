import type { TreasuryItemInput } from './treasury'

/**
 * Area fiscale e contributi — AGENTS.md §10.17 (versione 1.3.0).
 *
 * Una **stima** di imposte e contributi dell'anno, per sapere quanto mettere
 * da parte ogni mese e quando si paga. Non è la dichiarazione dei redditi:
 * niente detrazioni personali, crediti d'imposta o agevolazioni, che dipendono
 * dalla persona e dall'anno. Le aliquote sono modificabili; i valori di
 * partenza sono quelli in vigore per il 2026 dove noti (IRPEF 23/33/43), per
 * i contributi INPS quelli pubblicati per il 2025, da aggiornare ogni anno.
 *
 * Regimi:
 * - **società di capitali** (SRL, SPA): IRES sul reddito, IRAP sul valore
 *   della produzione.
 * - **società di persone** (SNC, SAS): IRAP alla società; il reddito si divide
 *   fra i soci, ognuno paga IRPEF, addizionali e contributi INPS sulla sua quota.
 * - **ditta individuale** (ordinaria o semplificata): IRPEF, addizionali e INPS
 *   del titolare; niente IRAP (abolita per le persone fisiche dal 2022).
 * - **forfettario**: reddito = ricavi × coefficiente di redditività, meno i
 *   contributi versati; imposta sostitutiva del 15% (5% nei primi cinque anni);
 *   niente IRAP né addizionali.
 *
 * Scadenze (metodo storico): acconto sulle imposte dell'anno = 100% di quelle
 * dell'anno prima, in due rate, 40% al 30 giugno e 60% al 30 novembre (50 e 50
 * per chi applica gli ISA); il saldo dell'anno si paga il 30 giugno dopo. I
 * contributi INPS fissi di artigiani e commercianti si pagano in quattro rate
 * (16 maggio, 20 agosto, 16 novembre, 16 febbraio); la parte sul reddito oltre
 * il minimale va con saldo e acconti (50 e 50).
 *
 * Importi in centesimi.
 */

export const REGIMI = ['capitali', 'persone', 'individuale', 'forfettario'] as const
export type Regime = (typeof REGIMI)[number]

export const REGIME_LABELS: Record<Regime, string> = {
  capitali: 'Società di capitali (SRL, SPA)',
  persone: 'Società di persone (SNC, SAS)',
  individuale: 'Ditta individuale',
  forfettario: 'Regime forfettario'
}

export const GESTIONI_INPS = ['artigiani', 'commercianti', 'separata', 'nessuna'] as const
export type GestioneInps = (typeof GESTIONI_INPS)[number]

export const GESTIONE_LABELS: Record<GestioneInps, string> = {
  artigiani: 'Artigiani',
  commercianti: 'Commercianti',
  separata: 'Gestione separata',
  nessuna: 'Nessuna (o cassa professionale)'
}

/** Scaglioni IRPEF 2026: fino a 28.000 € 23%, fino a 50.000 € 33%, oltre 43%. */
export const SCAGLIONI_IRPEF: { fino: number | null; aliquota: number }[] = [
  { fino: 2_800_000, aliquota: 23 },
  { fino: 5_000_000, aliquota: 33 },
  { fino: null, aliquota: 43 }
]

export interface ImpostazioniFiscali {
  regime: Regime
  /** Società di persone: quanti soci si dividono il reddito (in parti uguali). */
  soci: number
  iresPct: number
  irapPct: number
  /** Addizionali regionale e comunale insieme, in % del reddito IRPEF. */
  addizionaliPct: number
  gestioneInps: GestioneInps
  /** Reddito minimale INPS (artigiani e commercianti), in centesimi. */
  inpsMinimaleCents: number
  inpsAliquota: number
  /** Reddito oltre cui l'INPS non si paga più, in centesimi. */
  inpsMassimaleCents: number
  gestioneSeparataPct: number
  forfettarioCoeff: number
  forfettarioAliquota: number
  /** Forfettari artigiani/commercianti: contributi ridotti del 35%. */
  riduzioneInps35: boolean
  /** Rettifiche fiscali all'utile: costi non deducibili e simili (in aumento), agevolazioni (in diminuzione). */
  variazioniAumentoCents: number
  variazioniDiminuzioneCents: number
  /** Costi non deducibili ai fini IRAP (es. collaboratori, interessi impliciti), in centesimi. */
  variazioniIrapCents: number
  /** Reddito stimato a mano, se non si vuole usare quello del bilancio. */
  redditoManualeCents: number | null
  /** Imposte dell'anno scorso (dalla dichiarazione): la base degli acconti. Null = si usa la stima. */
  impostePrecedentiCents: number | null
  /** Acconti già versati l'anno scorso: servono per il saldo di giugno. */
  accontiVersatiCents: number | null
  /** Soggetto agli ISA: acconti 50% + 50% invece di 40% + 60%. */
  isa: boolean
  /** Scadenze fiscali nella previsione di tesoreria. */
  inTesoreria: boolean
}

export const FISCALE_PREDEFINITO: ImpostazioniFiscali = {
  regime: 'capitali',
  soci: 2,
  iresPct: 24,
  irapPct: 3.9,
  addizionaliPct: 2,
  gestioneInps: 'commercianti',
  inpsMinimaleCents: 1_855_500,
  inpsAliquota: 24.48,
  inpsMassimaleCents: 12_060_700,
  gestioneSeparataPct: 26.07,
  forfettarioCoeff: 40,
  forfettarioAliquota: 15,
  riduzioneInps35: false,
  variazioniAumentoCents: 0,
  variazioniDiminuzioneCents: 0,
  variazioniIrapCents: 0,
  redditoManualeCents: null,
  impostePrecedentiCents: null,
  accontiVersatiCents: null,
  isa: true,
  // Spenta di partenza: chi ha già scritto le imposte nello scadenziario le conterebbe due volte.
  inTesoreria: false
}

/** Il regime più probabile dalla forma giuridica dell'anagrafica. */
export function regimeDaForma(forma: string | null | undefined): Regime {
  const f = (forma ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  if (['SRL', 'SRLS', 'SPA', 'SAPA', 'COOP', 'SCARL'].includes(f)) return 'capitali'
  if (['SNC', 'SAS', 'SS'].includes(f)) return 'persone'
  if (f === 'DI' || f.includes('DITTA') || f.includes('INDIVIDUAL')) return 'individuale'
  return 'capitali'
}

function num(v: unknown, base: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : base
}

function centsONull(v: unknown, base: number | null): number | null {
  if (v === null) return null
  if (v === undefined || v === '') return base
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : base
}

export function normalizzaFiscale(v: unknown, base: ImpostazioniFiscali = FISCALE_PREDEFINITO): ImpostazioniFiscali {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const scelta = <T extends string>(x: unknown, valori: readonly T[], b: T): T => (valori.includes(x as T) ? (x as T) : b)
  const bool = (x: unknown, b: boolean): boolean => (typeof x === 'boolean' ? x : b)
  return {
    regime: scelta(o.regime, REGIMI, base.regime),
    soci: Math.round(num(o.soci, base.soci, 1, 50)),
    iresPct: num(o.iresPct, base.iresPct, 0, 50),
    irapPct: num(o.irapPct, base.irapPct, 0, 15),
    addizionaliPct: num(o.addizionaliPct, base.addizionaliPct, 0, 10),
    gestioneInps: scelta(o.gestioneInps, GESTIONI_INPS, base.gestioneInps),
    inpsMinimaleCents: Math.round(num(o.inpsMinimaleCents, base.inpsMinimaleCents, 0, 100_000_000)),
    inpsAliquota: num(o.inpsAliquota, base.inpsAliquota, 0, 50),
    inpsMassimaleCents: Math.round(num(o.inpsMassimaleCents, base.inpsMassimaleCents, 0, 1_000_000_000)),
    gestioneSeparataPct: num(o.gestioneSeparataPct, base.gestioneSeparataPct, 0, 50),
    forfettarioCoeff: num(o.forfettarioCoeff, base.forfettarioCoeff, 1, 100),
    forfettarioAliquota: num(o.forfettarioAliquota, base.forfettarioAliquota, 0, 30),
    riduzioneInps35: bool(o.riduzioneInps35, base.riduzioneInps35),
    variazioniAumentoCents: Math.round(num(o.variazioniAumentoCents, base.variazioniAumentoCents, 0, 10_000_000_000)),
    variazioniDiminuzioneCents: Math.round(num(o.variazioniDiminuzioneCents, base.variazioniDiminuzioneCents, 0, 10_000_000_000)),
    variazioniIrapCents: Math.round(num(o.variazioniIrapCents, base.variazioniIrapCents, -10_000_000_000, 10_000_000_000)),
    redditoManualeCents: centsONull(o.redditoManualeCents, base.redditoManualeCents),
    impostePrecedentiCents: centsONull(o.impostePrecedentiCents, base.impostePrecedentiCents),
    accontiVersatiCents: centsONull(o.accontiVersatiCents, base.accontiVersatiCents),
    isa: bool(o.isa, base.isa),
    inTesoreria: bool(o.inTesoreria, base.inTesoreria)
  }
}

// --- calcolo ------------------------------------------------------------------------

/** IRPEF lorda sugli scaglioni, senza detrazioni. */
export function irpef(reddito: number): number {
  let resto = Math.max(0, reddito)
  let prima = 0
  let imposta = 0
  for (const s of SCAGLIONI_IRPEF) {
    const tetto = s.fino === null ? Infinity : s.fino - prima
    const quota = Math.min(resto, tetto)
    imposta += (quota * s.aliquota) / 100
    resto -= quota
    if (s.fino !== null) prima = s.fino
    if (resto <= 0) break
  }
  return Math.round(imposta)
}

export interface DatiBilancioFiscale {
  /** Utile prima delle imposte dell'anno (o degli ultimi 12 mesi). */
  utileAnteImposte: number
  /** Reddito operativo: la base di partenza dell'IRAP. */
  ebit: number
  /** Ricavi dell'anno: la base del forfettario. */
  ricavi: number
}

export interface RigaImposta {
  chiave: string
  voce: string
  base: number
  /** In %; null se non è una percentuale semplice (IRPEF a scaglioni). */
  aliquota: number | null
  importo: number
  tipo: 'imposta' | 'contributo'
  nota?: string
}

export interface StimaFiscale {
  regime: Regime
  /** Reddito di partenza (dal bilancio o scritto a mano). */
  reddito: number
  redditoManuale: boolean
  /** Reddito su cui si calcolano le imposte, dopo le rettifiche. */
  imponibile: number
  righe: RigaImposta[]
  imposte: number
  contributi: number
  totale: number
  /** Totale su utile ante imposte, in %; null se l'utile non è positivo. */
  aliquotaEffettiva: number | null
  /** Quanto mettere da parte ogni mese. */
  accantonamentoMensile: number
}

/** Contributi INPS di artigiani e commercianti: fissi sul minimale, poi una % fino al massimale. */
function inpsImprenditore(
  reddito: number,
  imp: ImpostazioniFiscali
): { fissi: number; eccedenza: number } {
  if (imp.gestioneInps === 'nessuna') return { fissi: 0, eccedenza: 0 }
  const riduzione = imp.regime === 'forfettario' && imp.riduzioneInps35 ? 0.65 : 1
  if (imp.gestioneInps === 'separata') {
    const base = Math.min(Math.max(0, reddito), imp.inpsMassimaleCents)
    return { fissi: 0, eccedenza: Math.round(((base * imp.gestioneSeparataPct) / 100) * riduzione) }
  }
  const fissi = Math.round(((imp.inpsMinimaleCents * imp.inpsAliquota) / 100) * riduzione)
  const oltre = Math.max(0, Math.min(reddito, imp.inpsMassimaleCents) - imp.inpsMinimaleCents)
  return { fissi, eccedenza: Math.round(((oltre * imp.inpsAliquota) / 100) * riduzione) }
}

export function stimaFiscale(dati: DatiBilancioFiscale, imp: ImpostazioniFiscali): StimaFiscale {
  const redditoManuale = imp.redditoManualeCents !== null
  let reddito = imp.redditoManualeCents ?? dati.utileAnteImposte
  const righe: RigaImposta[] = []
  let imponibile = 0

  if (imp.regime === 'forfettario') {
    // Reddito forfettario: una quota dei ricavi (scritti a mano, se ci sono), meno i contributi versati.
    const ricavi = imp.redditoManualeCents ?? dati.ricavi
    const lordo = Math.round((Math.max(0, ricavi) * imp.forfettarioCoeff) / 100)
    // Nel forfettario il reddito è questo, non l'utile del bilancio.
    reddito = lordo
    const inps = inpsImprenditore(lordo, imp)
    const contributi = inps.fissi + inps.eccedenza
    imponibile = Math.max(0, lordo - contributi)
    if (inps.fissi) righe.push({ chiave: 'inps-fissi', voce: 'INPS, contributi fissi', base: imp.inpsMinimaleCents, aliquota: imp.inpsAliquota, importo: inps.fissi, tipo: 'contributo', nota: imp.riduzioneInps35 ? 'con la riduzione del 35%' : undefined })
    if (inps.eccedenza) righe.push({ chiave: 'inps-eccedenza', voce: imp.gestioneInps === 'separata' ? 'INPS, gestione separata' : 'INPS, oltre il minimale', base: lordo, aliquota: imp.gestioneInps === 'separata' ? imp.gestioneSeparataPct : imp.inpsAliquota, importo: inps.eccedenza, tipo: 'contributo' })
    righe.push({
      chiave: 'sostitutiva',
      voce: 'Imposta sostitutiva',
      base: imponibile,
      aliquota: imp.forfettarioAliquota,
      importo: Math.round((imponibile * imp.forfettarioAliquota) / 100),
      tipo: 'imposta',
      nota: `ricavi × ${String(imp.forfettarioCoeff).replace('.', ',')}% meno i contributi`
    })
  } else {
    imponibile = Math.max(0, reddito + imp.variazioniAumentoCents - imp.variazioniDiminuzioneCents)

    // IRAP: società sì, persone fisiche no.
    if (imp.regime !== 'individuale') {
      const base = Math.max(0, dati.ebit + imp.variazioniIrapCents)
      righe.push({ chiave: 'irap', voce: 'IRAP', base, aliquota: imp.irapPct, importo: Math.round((base * imp.irapPct) / 100), tipo: 'imposta', nota: 'sul reddito operativo, prima degli interessi' })
    }

    if (imp.regime === 'capitali') {
      righe.push({ chiave: 'ires', voce: 'IRES', base: imponibile, aliquota: imp.iresPct, importo: Math.round((imponibile * imp.iresPct) / 100), tipo: 'imposta' })
    } else {
      // Persone fisiche: il reddito (di ciascun socio) paga INPS, poi IRPEF e addizionali sul resto.
      const teste = imp.regime === 'persone' ? Math.max(1, imp.soci) : 1
      const quota = Math.round(imponibile / teste)
      const inps = inpsImprenditore(quota, imp)
      const contributiTesta = inps.fissi + inps.eccedenza
      const baseIrpef = Math.max(0, quota - contributiTesta)
      const perTesta = teste > 1 ? ` · ${teste} soci, ${euroTesto(quota)} ciascuno` : ''
      if (inps.fissi) righe.push({ chiave: 'inps-fissi', voce: 'INPS, contributi fissi', base: imp.inpsMinimaleCents * teste, aliquota: imp.inpsAliquota, importo: inps.fissi * teste, tipo: 'contributo', nota: teste > 1 ? `per ${teste} soci` : undefined })
      if (inps.eccedenza) righe.push({ chiave: 'inps-eccedenza', voce: imp.gestioneInps === 'separata' ? 'INPS, gestione separata' : 'INPS, oltre il minimale', base: quota * teste, aliquota: imp.gestioneInps === 'separata' ? imp.gestioneSeparataPct : imp.inpsAliquota, importo: inps.eccedenza * teste, tipo: 'contributo' })
      righe.push({ chiave: 'irpef', voce: 'IRPEF', base: baseIrpef * teste, aliquota: null, importo: irpef(baseIrpef) * teste, tipo: 'imposta', nota: `a scaglioni 23/33/43%, senza detrazioni${perTesta}` })
      righe.push({ chiave: 'addizionali', voce: 'Addizionali regionale e comunale', base: baseIrpef * teste, aliquota: imp.addizionaliPct, importo: Math.round((baseIrpef * imp.addizionaliPct) / 100) * teste, tipo: 'imposta' })
    }
  }

  const imposte = righe.filter((r) => r.tipo === 'imposta').reduce((s, r) => s + r.importo, 0)
  const contributi = righe.filter((r) => r.tipo === 'contributo').reduce((s, r) => s + r.importo, 0)
  const totale = imposte + contributi
  return {
    regime: imp.regime,
    reddito,
    redditoManuale,
    imponibile,
    righe,
    imposte,
    contributi,
    totale,
    aliquotaEffettiva: reddito > 0 ? (totale / reddito) * 100 : null,
    accantonamentoMensile: Math.round(totale / 12)
  }
}

function euroTesto(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString('it-IT')} €`
}

// --- scadenze -------------------------------------------------------------------------

export interface ScadenzaFiscale {
  data: string
  descrizione: string
  importo: number
  tipo: 'imposte' | 'contributi'
}

/**
 * Le scadenze dei prossimi mesi (dopo `oggi`), metodo storico. La stima vale
 * per l'anno di `oggi`: l'anno dopo si suppone uguale.
 */
export function scadenzeFiscali(stima: StimaFiscale, imp: ImpostazioniFiscali, oggi: string, mesi = 15): ScadenzaFiscale[] {
  const anno = Number(oggi.slice(0, 4))
  const limite = (() => {
    const d = new Date(`${oggi}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + mesi)
    return d.toISOString().slice(0, 10)
  })()
  const out: ScadenzaFiscale[] = []
  const add = (data: string, descrizione: string, importo: number, tipo: ScadenzaFiscale['tipo']): void => {
    if (importo > 0 && data > oggi && data <= limite) out.push({ data, descrizione, importo: Math.round(importo), tipo })
  }

  // Imposte (e INPS oltre il minimale, che segue le stesse date ma 50 e 50).
  const imposteAnno = stima.imposte
  const eccedenza = stima.righe.filter((r) => r.chiave === 'inps-eccedenza').reduce((s, r) => s + r.importo, 0)
  const fissi = stima.righe.filter((r) => r.chiave === 'inps-fissi').reduce((s, r) => s + r.importo, 0)
  const precedenti = imp.impostePrecedentiCents ?? imposteAnno
  const [p1, p2] = imp.isa ? [0.5, 0.5] : [0.4, 0.6]

  // Anno corrente: saldo dell'anno scorso (se si sa) e acconti.
  const saldoPrecedente =
    imp.impostePrecedentiCents !== null && imp.accontiVersatiCents !== null
      ? imp.impostePrecedentiCents - imp.accontiVersatiCents
      : null
  if (saldoPrecedente !== null && saldoPrecedente > 0) add(`${anno}-06-30`, `Saldo imposte ${anno - 1}`, saldoPrecedente, 'imposte')
  add(`${anno}-06-30`, `Primo acconto imposte ${anno}`, precedenti * p1, 'imposte')
  add(`${anno}-11-30`, `Secondo acconto imposte ${anno}`, precedenti * p2, 'imposte')
  // Anno dopo: saldo della stima e primo acconto sul nuovo anno.
  add(`${anno + 1}-06-30`, `Saldo imposte ${anno}`, imposteAnno - precedenti, 'imposte')
  add(`${anno + 1}-06-30`, `Primo acconto imposte ${anno + 1}`, imposteAnno * p1, 'imposte')
  add(`${anno + 1}-11-30`, `Secondo acconto imposte ${anno + 1}`, imposteAnno * p2, 'imposte')

  if (eccedenza > 0) {
    add(`${anno}-06-30`, `INPS oltre il minimale, primo acconto ${anno}`, eccedenza * 0.5, 'contributi')
    add(`${anno}-11-30`, `INPS oltre il minimale, secondo acconto ${anno}`, eccedenza * 0.5, 'contributi')
    add(`${anno + 1}-06-30`, `INPS oltre il minimale, primo acconto ${anno + 1}`, eccedenza * 0.5, 'contributi')
    add(`${anno + 1}-11-30`, `INPS oltre il minimale, secondo acconto ${anno + 1}`, eccedenza * 0.5, 'contributi')
  }
  if (fissi > 0) {
    for (const a of [anno, anno + 1]) {
      add(`${a}-02-16`, `INPS contributi fissi, rata 4 del ${a - 1}`, fissi / 4, 'contributi')
      add(`${a}-05-16`, `INPS contributi fissi, rata 1 del ${a}`, fissi / 4, 'contributi')
      add(`${a}-08-20`, `INPS contributi fissi, rata 2 del ${a}`, fissi / 4, 'contributi')
      add(`${a}-11-16`, `INPS contributi fissi, rata 3 del ${a}`, fissi / 4, 'contributi')
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data))
}

/** Le scadenze come movimenti della tesoreria (fonte "fiscale"). */
export function flussiFiscali(scadenze: ScadenzaFiscale[]): TreasuryItemInput[] {
  return scadenze.map((s, i) => ({
    uuid: `fiscale#${s.data}#${i}`,
    direction: 'out',
    source: 'fiscale',
    category: 'Imposte e contributi',
    description: s.descrizione,
    due_date: s.data,
    amount_cents: s.importo,
    paid_cents: 0,
    paid_date: null,
    recurrence: 'none',
    recurrence_until: null
  }))
}
