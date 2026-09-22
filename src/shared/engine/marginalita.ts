/**
 * Marginalità — AGENTS.md §10.18 (versione 1.3.0).
 *
 * Quanto costa fare ciò che si vende e quanto resta: il **food cost** di una
 * pizza, la **distinta base** di un prodotto, il **costo di una commessa** a
 * preventivo e a consuntivo. La sezione cambia nome e schede col tipo di
 * attività, il calcolo è lo stesso:
 *
 *   costo diretto  = materiali (con lo scarto) + manodopera + lavorazioni esterne + altro
 *   costi generali = costo diretto × % della struttura (affitto, utenze, amministrazione…)
 *   costo pieno    = costo diretto + costi generali
 *   margine di contribuzione = prezzo − costo diretto
 *   margine netto  = prezzo − costo pieno
 *
 * Per ricette e prodotti tutto è **per porzione/pezzo**: la ricetta può fare
 * più porzioni (un impasto da 10 pizze). La manodopera costa quanto l'ora di
 * chi lavora sulla produzione, dal Personale, se non si scrive un altro valore.
 *
 * Prezzi IVA esclusa; l'IVA serve solo a mostrare il prezzo in carta.
 * Importi in centesimi.
 */

export const TIPI_ATTIVITA = ['ristorazione', 'produzione', 'commercio', 'servizi'] as const
export type TipoAttivita = (typeof TIPI_ATTIVITA)[number]

export const TIPO_ATTIVITA_LABELS: Record<TipoAttivita, string> = {
  ristorazione: 'Ristorazione (ricette e food cost)',
  produzione: 'Produzione (distinta base)',
  commercio: 'Commercio (prodotti e ricarico)',
  servizi: 'Servizi, edilizia, progetti (commesse)'
}

export const KIND_VOCI = ['ricetta', 'prodotto', 'commessa', 'servizio'] as const
export type KindVoce = (typeof KIND_VOCI)[number]

export const KIND_RIGHE = ['materiale', 'manodopera', 'esterno', 'altro'] as const
export type KindRiga = (typeof KIND_RIGHE)[number]

export const KIND_RIGA_LABELS: Record<KindRiga, string> = {
  materiale: 'Materiale',
  manodopera: 'Manodopera',
  esterno: 'Lavorazione esterna',
  altro: 'Altro costo'
}

/** Cosa si chiamano le cose, per tipo di attività. */
export const PRESET: Record<
  TipoAttivita,
  {
    kind: KindVoce
    voce: string
    voci: string
    materiale: string
    materiali: string
    obiettivoLabel: string
    iva: number
  }
> = {
  ristorazione: { kind: 'ricetta', voce: 'ricetta', voci: 'Ricette e prodotti', materiale: 'ingrediente', materiali: 'Ingredienti', obiettivoLabel: 'Food cost obiettivo', iva: 10 },
  produzione: { kind: 'prodotto', voce: 'prodotto', voci: 'Prodotti', materiale: 'materiale', materiali: 'Materiali', obiettivoLabel: 'Margine obiettivo', iva: 22 },
  commercio: { kind: 'prodotto', voce: 'prodotto', voci: 'Prodotti', materiale: 'articolo', materiali: 'Listino acquisti', obiettivoLabel: 'Margine obiettivo', iva: 22 },
  servizi: { kind: 'commessa', voce: 'commessa', voci: 'Commesse', materiale: 'materiale', materiali: 'Materiali e costi', obiettivoLabel: 'Margine obiettivo', iva: 22 }
}

/** Il tipo di attività più probabile dal "tipo di attività" dell'anagrafica. */
export function tipoDaAttivita(testo: string | null | undefined): TipoAttivita {
  const t = (testo ?? '').toLowerCase()
  if (/ristor|pizz|bar\b|caff|pasticc|gelat|trattor|osteria|pub|food|catering|panific|forno/.test(t)) return 'ristorazione'
  if (/edil|costruz|impiant|cantier|serviz|consulen|studio|progett|agenzia|software|manutenz|trasport/.test(t)) return 'servizi'
  if (/commerc|negozio|vendita|ingrosso|dettaglio|shop|e-?commerce/.test(t)) return 'commercio'
  if (/produz|manifatt|industr|artigian|officina|laborator|fabbric/.test(t)) return 'produzione'
  return 'servizi'
}

export interface ImpostazioniMarginalita {
  tipo: TipoAttivita
  /** Ristorazione: food cost obiettivo in % del prezzo. */
  obiettivoFoodCost: number
  /** Margine netto obiettivo in % del prezzo (per il prezzo consigliato). */
  obiettivoMargine: number
  /** Costi generali in % del costo diretto. */
  costiGeneraliPct: number
  /** Costo di un'ora di manodopera; null = quello dei "diretti" nel Personale. */
  costoOrarioCents: number | null
  /** IVA di partenza delle voci nuove. */
  ivaPct: number
}

export function marginalitaPredefinita(tipo: TipoAttivita = 'servizi'): ImpostazioniMarginalita {
  return {
    tipo,
    obiettivoFoodCost: 30,
    obiettivoMargine: tipo === 'commercio' ? 25 : 20,
    costiGeneraliPct: tipo === 'ristorazione' ? 25 : 15,
    costoOrarioCents: null,
    ivaPct: PRESET[tipo].iva
  }
}

function num(v: unknown, base: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : base
}

export function normalizzaMarginalita(v: unknown, base: ImpostazioniMarginalita): ImpostazioniMarginalita {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const tipo = TIPI_ATTIVITA.includes(o.tipo as TipoAttivita) ? (o.tipo as TipoAttivita) : base.tipo
  let costoOrarioCents = base.costoOrarioCents
  if (o.costoOrarioCents === null) costoOrarioCents = null
  else if (o.costoOrarioCents !== undefined && o.costoOrarioCents !== '') {
    const n = Number(o.costoOrarioCents)
    if (Number.isFinite(n) && n >= 0) costoOrarioCents = Math.round(n)
  }
  return {
    tipo,
    obiettivoFoodCost: num(o.obiettivoFoodCost, base.obiettivoFoodCost, 1, 95),
    obiettivoMargine: num(o.obiettivoMargine, base.obiettivoMargine, 0, 95),
    costiGeneraliPct: num(o.costiGeneraliPct, base.costiGeneraliPct, 0, 300),
    costoOrarioCents,
    ivaPct: num(o.ivaPct, base.ivaPct, 0, 30)
  }
}

// --- calcolo ------------------------------------------------------------------------

export interface MaterialeCalcolo {
  uuid: string
  name: string
  unit: string
  unit_cost_cents: number
  /** Scarto in %: pulitura, calo peso, sfridi. Il costo utile sale di conseguenza. */
  waste_pct: number
}

export interface RigaCalcolo {
  uuid: string
  phase: 'preventivo' | 'consuntivo'
  kind: KindRiga
  material_uuid: string | null
  employee_uuid: string | null
  description: string | null
  qty: number
  unit: string | null
  /** null = dal listino, dal Personale o dal costo orario dell'azienda. */
  unit_cost_cents: number | null
}

export interface VoceCalcolo {
  uuid: string
  kind: KindVoce
  name: string
  /** Prezzo di vendita IVA esclusa (per porzione/pezzo; per una commessa, il totale). */
  price_cents: number
  vat_pct: number
  /** Porzioni o pezzi che la ricetta produce. */
  yield_qty: number
  /** Pezzi venduti in un mese (menu engineering, margine totale). */
  monthly_volume: number | null
  /** null = i costi generali dell'azienda. */
  overhead_pct: number | null
}

/** Costo di un'unità di un materiale, tenuto conto dello scarto. */
export function costoUtile(m: Pick<MaterialeCalcolo, 'unit_cost_cents' | 'waste_pct'>): number {
  const scarto = Math.min(95, Math.max(0, m.waste_pct))
  return m.unit_cost_cents / (1 - scarto / 100)
}

export interface ContestoCosti {
  materiali: Map<string, MaterialeCalcolo>
  /** Costo orario di una persona del Personale. */
  costoOrarioPersona: (uuid: string) => number | null
  /** Costo orario di chi non ha una persona indicata. */
  costoOrario: number | null
}

/** Costo unitario e totale di una riga (in centesimi, non arrotondati). */
export function costoRiga(r: RigaCalcolo, ctx: ContestoCosti): { unitario: number; totale: number; manca: boolean } {
  let unitario: number | null = r.unit_cost_cents
  if (unitario === null) {
    if (r.kind === 'materiale' && r.material_uuid) {
      const m = ctx.materiali.get(r.material_uuid)
      unitario = m ? costoUtile(m) : null
    } else if (r.kind === 'manodopera') {
      unitario = (r.employee_uuid ? ctx.costoOrarioPersona(r.employee_uuid) : null) ?? ctx.costoOrario
    }
  }
  const qty = Math.max(0, r.qty)
  return { unitario: unitario ?? 0, totale: qty * (unitario ?? 0), manca: unitario === null }
}

export interface CalcoloVoce {
  materiali: number
  manodopera: number
  esterni: number
  altro: number
  /** Costo diretto per unità (porzione/pezzo; commessa: totale). */
  diretti: number
  generali: number
  costoPieno: number
  prezzo: number
  prezzoIvato: number
  margineContribuzione: number
  margineNetto: number
  /** Margine netto in % del prezzo; null senza prezzo. */
  marginePct: number | null
  /** Materiali in % del prezzo (il food cost); null senza prezzo. */
  foodCostPct: number | null
  /** Ricarico sul costo diretto, in %. */
  ricaricoPct: number | null
  /** Prezzo che rispetta l'obiettivo (IVA esclusa). */
  prezzoConsigliato: number | null
  /** Qualche riga non ha un costo (materiale tolto, costo orario mancante). */
  costiMancanti: boolean
}

export function calcolaVoce(
  voce: VoceCalcolo,
  righe: RigaCalcolo[],
  ctx: ContestoCosti,
  imp: ImpostazioniMarginalita
): CalcoloVoce {
  const somma = { materiale: 0, manodopera: 0, esterno: 0, altro: 0 }
  let mancano = false
  for (const r of righe) {
    const c = costoRiga(r, ctx)
    somma[r.kind] += c.totale
    if (c.manca) mancano = true
  }
  // Ricette e prodotti per porzione/pezzo; le commesse sono un totale.
  const resa = voce.kind === 'commessa' || voce.kind === 'servizio' ? 1 : Math.max(0.0001, voce.yield_qty)
  const materiali = Math.round(somma.materiale / resa)
  const manodopera = Math.round(somma.manodopera / resa)
  const esterni = Math.round(somma.esterno / resa)
  const altro = Math.round(somma.altro / resa)
  const diretti = materiali + manodopera + esterni + altro
  const generali = Math.round((diretti * (voce.overhead_pct ?? imp.costiGeneraliPct)) / 100)
  const costoPieno = diretti + generali
  const prezzo = Math.max(0, voce.price_cents)
  const margineNetto = prezzo - costoPieno
  const pct = (x: number): number | null => (prezzo > 0 ? (x / prezzo) * 100 : null)

  let prezzoConsigliato: number | null = null
  if (imp.tipo === 'ristorazione' && voce.kind === 'ricetta' && materiali > 0) {
    prezzoConsigliato = Math.round(materiali / (imp.obiettivoFoodCost / 100))
  } else if (costoPieno > 0 && imp.obiettivoMargine < 100) {
    prezzoConsigliato = Math.round(costoPieno / (1 - imp.obiettivoMargine / 100))
  }

  return {
    materiali,
    manodopera,
    esterni,
    altro,
    diretti,
    generali,
    costoPieno,
    prezzo,
    prezzoIvato: Math.round(prezzo * (1 + voce.vat_pct / 100)),
    margineContribuzione: prezzo - diretti,
    margineNetto,
    marginePct: pct(margineNetto),
    foodCostPct: pct(materiali),
    ricaricoPct: diretti > 0 ? ((prezzo - diretti) / diretti) * 100 : null,
    prezzoConsigliato,
    costiMancanti: mancano
  }
}

// --- menu engineering ---------------------------------------------------------------

export type ClasseMenu = 'stella' | 'cavallo' | 'enigma' | 'cane'

export const CLASSE_MENU: Record<ClasseMenu, { nome: string; cosaFare: string }> = {
  stella: { nome: 'Stella', cosaFare: 'Vende tanto e rende bene: tienila in vista e non toccarla.' },
  cavallo: { nome: 'Cavallo da lavoro', cosaFare: 'Vende tanto ma rende poco: ritocca il prezzo o la ricetta.' },
  enigma: { nome: 'Enigma', cosaFare: 'Rende bene ma si vende poco: mettila più in vista, falla consigliare.' },
  cane: { nome: 'Cane', cosaFare: 'Vende poco e rende poco: ripensala o toglila.' }
}

export interface VoceMenuEngineering {
  uuid: string
  volume: number
  /** Margine di contribuzione per porzione. */
  margine: number
}

/**
 * Menu engineering (Kasavana e Smith): una voce è "popolare" se vende almeno
 * il 70% della sua quota media (1/n del totale), "redditizia" se il suo margine
 * di contribuzione supera la media pesata sulle vendite.
 */
export function menuEngineering(voci: VoceMenuEngineering[]): {
  sogliaVolume: number
  margineMedio: number
  classi: Map<string, ClasseMenu>
} {
  const valide = voci.filter((v) => v.volume > 0)
  const totale = valide.reduce((s, v) => s + v.volume, 0)
  const sogliaVolume = valide.length ? (totale / valide.length) * 0.7 : 0
  const margineMedio = totale ? valide.reduce((s, v) => s + v.margine * v.volume, 0) / totale : 0
  const classi = new Map<string, ClasseMenu>()
  for (const v of valide) {
    const popolare = v.volume >= sogliaVolume
    const redditizia = v.margine >= margineMedio
    classi.set(v.uuid, popolare ? (redditizia ? 'stella' : 'cavallo') : redditizia ? 'enigma' : 'cane')
  }
  return { sogliaVolume, margineMedio, classi }
}
