import ExcelJS from 'exceljs'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { AccountType } from '@shared/types'

/**
 * Import del file Excel "Piano dei Conti" — AGENTS.md §11.1.
 *
 * Due requisiti, non due buone pratiche:
 *
 * 1. **Niente numeri di riga fissi.** File di clienti e periodi diversi non
 *    sono identici: le sezioni si riconoscono dalle intestazioni di categoria
 *    nella colonna `Descrizione`, le colonne dai nomi nella riga di
 *    intestazione — che non è per forza la prima, né sul primo foglio.
 * 2. **Mai un import silenzioso su dati contabili.** Questo modulo si ferma a
 *    produrre un *riepilogo*: righe riconosciute, righe da mappare a mano,
 *    doppioni. Scrivere sul database è un passo separato, che parte solo dopo
 *    una conferma esplicita.
 *
 * Dalla fase 9 (§13) la lettura è tollerante: sinonimi nelle intestazioni,
 * punteggiatura e numerazioni diverse nelle sezioni, importi scritti come
 * testo in più forme. Quello che non si riconosce non si indovina: si chiede
 * (una sezione sconosciuta si abbina a mano, e l'anteprima si rifà).
 */

/** Normalizza per il confronto: minuscole, senza accenti, spazi compattati. */
function norm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Chiave di confronto per intestazioni ed etichette: oltre a `norm`, toglie la
 * punteggiatura che cambia da un file all'altro. "Debiti v/Fornitori (costi
 * variabili)" e "DEBITI VERSO FORNITORI COSTI VARIABILI" danno la stessa chiave.
 * Restano "/" (c/IVA, medio/lungo), "%" e "-" (VALORE T -1), che distinguono.
 */
function key(value: string): string {
  return norm(value)
    .replace(/[’`]/g, "'")
    .replace(/\bv\//g, 'verso ')
    .replace(/&/g, ' e ')
    .replace(/[()[\]{}.,;:_*"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Come `key`, senza la numerazione davanti: "1. Ricavi operativi", "B) Costi personale". */
function labelKey(value: string): string {
  return key(norm(value).replace(/^(\d{1,2}|[a-z]|[ivxl]{1,4})\s*[.)-]\s+/, ''))
}

const ACCOUNT_TYPES: AccountType[] = [
  'RICAVO',
  'COSTO',
  "ATTIVITA'",
  "ATTIVITA' NEGATIVO",
  "PASSIVITA'"
]

/** Riconosce il TIPO tollerando apostrofi tipografici e spazi. */
function parseAccountType(raw: string): AccountType | null {
  const n = norm(raw).replace(/[’`]/g, "'")
  return ACCOUNT_TYPES.find((type) => norm(type).replace(/[’`]/g, "'") === n) ?? null
}

/**
 * Il tipo di un conto segue la sezione. L'unica scelta è nelle sezioni
 * dell'attivo, dove un fondo (ammortamento, svalutazione) è ATTIVITA' NEGATIVO
 * e si sottrae (MODELLO_FINANZIARIO.md §1). Vale per l'import e per i conti
 * scritti nel programma.
 */
export function typesForSection(sectionType: AccountType): AccountType[] {
  return sectionType === "ATTIVITA'" ? ["ATTIVITA'", "ATTIVITA' NEGATIVO"] : [sectionType]
}

type SectionMapping = string | { RICAVO?: string; ATTIVITA?: string }

/**
 * Etichette di sezione come compaiono nel file del consulente → codice della
 * sezione nel database. Dove la stessa etichetta vale per due sezioni
 * ("Rimanenze Finali" esiste sia nel conto economico sia nell'attivo) si
 * disambigua con il TIPO dei conti che stanno sotto. Dopo le etichette del
 * modello, i sinonimi incontrati o prevedibili: stessa sezione, altre parole.
 */
const SECTION_LABELS: [string, SectionMapping][] = [
  ['ricavi operativi', 'ricavi_operativi'],
  ['rimanenze finali', { RICAVO: 'rimanenze_finali_ricavo', ATTIVITA: 'rimanenze_finali_magazzino' }],
  ['proventi straordinari', 'proventi_straordinari'],
  ['proventi finanziari', 'proventi_finanziari'],
  ['esistenze iniziali', 'esistenze_iniziali'],
  ['costi materie prime', 'costi_materie_prime'],
  ['costi produzione', 'costi_produzione'],
  ['ammortamenti operativi', 'ammortamenti_operativi'],
  ['costi personale', 'costi_personale'],
  ['costi commerciali', 'costi_commerciali'],
  ['costi generali e amministrativi', 'costi_generali_amministrativi'],
  ['ammortamenti non operativi', 'ammortamenti_non_operativi'],
  ['oneri straordinari', 'oneri_straordinari'],
  ['oneri finanziari', 'oneri_finanziari'],
  ['imposte', 'imposte'],
  ['immobilizzazioni immateriali', 'immobilizzazioni_immateriali'],
  ['immobilizzazioni materiali', 'immobilizzazioni_materiali'],
  ['immobilizzazioni finanziarie', 'immobilizzazioni_finanziarie'],
  ['liquidita differite', 'liquidita_differite'],
  ['liquidita immediate', 'liquidita_immediate'],
  ['patrimonio netto', 'patrimonio_netto'],
  ['debiti a medio/lungo termine', 'debiti_medio_lungo'],
  ['debiti a breve termine', 'debiti_breve'],
  // sinonimi
  ['rimanenze iniziali', 'esistenze_iniziali'],
  ['costi per materie prime', 'costi_materie_prime'],
  ['costi di produzione', 'costi_produzione'],
  ['costi del personale', 'costi_personale'],
  ['costi generali amministrativi', 'costi_generali_amministrativi'],
  ['costi generali ed amministrativi', 'costi_generali_amministrativi'],
  ['debiti a medio lungo termine', 'debiti_medio_lungo'],
  ['debiti a medio-lungo termine', 'debiti_medio_lungo'],
  ['debiti a m/l termine', 'debiti_medio_lungo'],
  ['debiti medio/lungo termine', 'debiti_medio_lungo'],
  ['debiti a breve', 'debiti_breve'],
  ['debiti breve termine', 'debiti_breve']
]

const SECTION_BY_LABEL = new Map(SECTION_LABELS.map(([label, code]) => [labelKey(label), code]))

/** Sezione di un'etichetta del file; `undefined` se l'etichetta non è nota. */
function sectionFromLabel(label: string): SectionMapping | undefined {
  return SECTION_BY_LABEL.get(labelKey(label))
}

/**
 * Colonne di sotto-classificazione: nel file del consulente sono marcate con
 * una "X" sulla riga del conto. Sono quelle che distinguono un credito
 * commerciale da un credito diverso, e un debito verso fornitori da un debito
 * finanziario — senza, DSO, DPO, CCN e PFN non sono calcolabili.
 *
 * Le colonne che nel modello sono già tag di sezione (Magazzino, Cassa/cc
 * Banca) non compaiono qui: le porta la sezione stessa.
 */
const DETAIL_TAG_HEADERS: [string, string][] = [
  ['Crediti Commerciali', 'Crediti Commerciali'],
  ['Crediti verso clienti', 'Crediti Commerciali'],
  ['Crediti Diversi', 'Crediti Diversi'],
  ['Erario c/IVA', 'Erario c/IVA'],
  ['Utile a nuovo', 'Utile a nuovo'],
  ['Utile', 'Utile'],
  ['Fondo TFR', 'Fondo TFR'],
  ['Debiti Diversi', 'Debiti Diversi'],
  ['Debiti verso Fornitori costi variabili', 'Debiti v/Fornitori (costi variabili)'],
  ['Debiti verso Fornitori costi fissi', 'Debiti v/Fornitori (costi fissi)'],
  ['Debiti verso Enti Previdenziali', 'Debiti v/Enti Previdenziali']
]

const DETAIL_TAG_BY_HEADER = new Map(DETAIL_TAG_HEADERS.map(([header, tag]) => [key(header), tag]))

/**
 * Intestazione con cui il modello scaricabile scrive ogni sotto-classificazione.
 * Ognuna deve essere riconosciuta da `detailTagFromHeader`: il modello si deve
 * rileggere senza perdite (lo verifica un test).
 */
export const DETAIL_TAG_TEMPLATE_HEADERS: Record<string, string> = {
  'Crediti Commerciali': 'Crediti Commerciali',
  'Crediti Diversi': 'Crediti Diversi',
  'Erario c/IVA': 'Erario c/IVA',
  'Utile a nuovo': 'Utile a nuovo',
  Utile: 'Utile',
  'Fondo TFR': 'Fondo TFR',
  'Debiti Diversi': 'Debiti Diversi',
  'Debiti v/Fornitori (costi variabili)': 'Debiti verso Fornitori costi variabili',
  'Debiti v/Fornitori (costi fissi)': 'Debiti verso Fornitori costi fissi',
  'Debiti v/Enti Previdenziali': 'Debiti v/Enti Previdenziali'
}

/** Riconosce una sotto-classificazione dall'intestazione di colonna. */
export function detailTagFromHeader(header: string): string | null {
  return DETAIL_TAG_BY_HEADER.get(key(header)) ?? null
}

/** Intestazioni delle colonne che servono, con le varianti già incontrate o prevedibili. */
const COLUMN_ALIASES: Record<'type' | 'code' | 'name' | 'period' | 'directCostPct', string[]> = {
  type: ['tipo', 'tipo conto', 'tipologia'],
  code: ['codice conto mastro', 'codice conto', 'codice mastro', 'codice', 'cod conto', 'cod', 'conto', 'mastro'],
  name: ['descrizione', 'descrizione conto', 'denominazione', 'nome conto'],
  period: ['periodo t', 'periodo'],
  directCostPct: ['% costo diretto', '% diretto', 'costo diretto %', 'percentuale costo diretto']
}

/**
 * Colonne di valore: "VALORE T", "VALORE T -1", "BUDGET Gennaio", "CONSUNT
 * Marzo", e nei file esportati da un gestionale "Saldo" o "Importo".
 */
const VALUE_COLUMN = /^(valore|saldo|importo|budget |consunt|previsionale)/

/** Fin dove si cerca la riga di intestazione: sopra ci possono essere titolo, azienda, data. */
const HEADER_SEARCH_ROWS = 20

/** Sezione del catalogo, quanto basta al parser per dedurre e controllare il TIPO. */
export interface ParserSection {
  code: string
  label: string
  account_type: AccountType
}

export interface ReadOptions {
  /** Colonna dei valori da leggere; senza, "VALORE T" o la prima trovata. */
  valueColumn?: string
  /** Foglio da leggere; senza, "PIANO DEI CONTI" o il primo che ne ha la forma. */
  sheet?: string
  /**
   * Abbinamenti fatti a mano: etichetta di sezione come scritta nel file →
   * codice della sezione. Vincono sul riconoscimento automatico.
   */
  sectionMap?: Record<string, string>
  /**
   * Catalogo delle sezioni (migrazione 002). Con il catalogo un conto senza
   * TIPO prende quello della sezione, e un TIPO incoerente con la sezione si
   * ferma nel riepilogo invece di finire nel bilancio col segno sbagliato.
   */
  sections?: ParserSection[]
}

export interface ParsedAccount {
  row: number
  code: string
  name: string
  section_code: string
  section_label: string
  account_type: AccountType
  /** Sotto-classificazione letta dalle colonne marcate "X", se presente. */
  detail_tag: string | null
  direct_cost_pct: number | null
  /** Importo in centesimi, o null se la colonna valore è vuota su questa riga. */
  amount_cents: number | null
}

export interface UnmappedRow {
  row: number
  reason: string
  code: string | null
  name: string | null
  section_label: string | null
  raw_type: string | null
}

export interface SectionSummary {
  label: string
  section_code: string | null
  /** true quando la sezione è stata abbinata a mano (`sectionMap`). */
  manual: boolean
  rows: number
  withValue: number
}

export interface ImportPreview {
  file: { name: string; sha256: string; sheet: string }
  /** Fogli del file che hanno la forma di un piano dei conti. */
  availableSheets: string[]
  /** Colonna valore scelta, e tutte quelle disponibili nel file. */
  valueColumn: string | null
  availableValueColumns: string[]
  sections: SectionSummary[]
  accounts: ParsedAccount[]
  unmapped: UnmappedRow[]
  /** Righe del modello senza codice né descrizione: struttura, non dati. */
  templateRows: number
  duplicates: { code: string; rows: number[] }[]
  warnings: string[]
}

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ''
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('')
  }
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '')
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '')
  return String(value)
}

/**
 * Un importo, numerico o scritto come testo. Il testo si legge nelle forme
 * che un file italiano usa davvero: "1.234,56", "1.234" (migliaia), "1234.56",
 * "(1.234,56)" e "1.234,56-" per i negativi, "-" per il vuoto.
 */
export function parseAmount(raw: string): number | null {
  let text = raw.replace(/[\s€]/g, '')
  if (!text || /^[-–—]+$/.test(text)) return null

  let sign = 1
  if (/^\(.*\)$/.test(text)) {
    sign = -1
    text = text.slice(1, -1)
  }
  if (/\d-$/.test(text)) {
    sign = -sign
    text = text.slice(0, -1)
  }
  text = text.replace(/%$/, '')

  let cleaned: string
  if (/,\d{1,2}$/.test(text)) cleaned = text.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) cleaned = text.replace(/\./g, '')
  else cleaned = text.replace(/,/g, '')

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? sign * parsed : null
}

function cellNumber(cell: ExcelJS.Cell | undefined): number | null {
  if (!cell) return null
  const value = cell.value
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value
  if (typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result
  }
  return parseAmount(cellText(cell))
}

/**
 * Una percentuale di costo diretto. Una cella formattata come percentuale
 * contiene 0,7 per "70%": nel database si tiene 70.
 */
function cellPercent(cell: ExcelJS.Cell | undefined): number | null {
  const value = cellNumber(cell)
  if (value === null || !cell) return null
  const numeric = typeof cell.value === 'number' || (typeof cell.value === 'object' && cell.value !== null && 'result' in cell.value)
  return numeric && cell.numFmt?.includes('%') ? Math.round(value * 10000) / 100 : value
}

/** Euro → centesimi interi, senza passare dalla virgola mobile all'arrotondamento. */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

type ColumnKey = keyof typeof COLUMN_ALIASES

interface HeaderInfo {
  row: number
  /** colonna → chiave dell'intestazione */
  headers: Map<number, string>
  col: Record<ColumnKey, number | null>
}

/** Cerca la riga di intestazione di un foglio: la prima con codice e descrizione. */
function findHeader(sheet: ExcelJS.Worksheet): HeaderInfo | null {
  const last = Math.min(sheet.rowCount, HEADER_SEARCH_ROWS)
  for (let r = 1; r <= last; r++) {
    const headers = new Map<number, string>()
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
      const text = key(cellText(cell))
      if (text) headers.set(c, text)
    })

    const find = (aliases: string[]): number | null => {
      // Si prova alias per alias, così "codice conto" vince su "conto" se ci sono entrambe.
      for (const alias of aliases) {
        for (const [c, text] of headers) if (text === alias) return c
      }
      return null
    }
    const col = {
      type: find(COLUMN_ALIASES.type),
      code: find(COLUMN_ALIASES.code),
      name: find(COLUMN_ALIASES.name),
      period: find(COLUMN_ALIASES.period),
      directCostPct: find(COLUMN_ALIASES.directCostPct)
    }
    if (col.code !== null && col.name !== null && col.code !== col.name) {
      return { row: r, headers, col }
    }
  }
  return null
}

export async function readPreview(
  filePath: string,
  options: ReadOptions = {}
): Promise<ImportPreview> {
  const buffer = await readFile(filePath)
  const sha256 = createHash('sha256').update(buffer).digest('hex')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

  const warnings: string[] = []

  // --- foglio e intestazioni: per nome, e non per posizione ------------------
  const candidates = workbook.worksheets
    .map((sheet) => ({ sheet, header: findHeader(sheet) }))
    .filter((c): c is { sheet: ExcelJS.Worksheet; header: HeaderInfo } => c.header !== null)

  if (candidates.length === 0) {
    throw new Error(
      workbook.worksheets.length === 0
        ? 'Il file non contiene alcun foglio.'
        : 'Nessun foglio ha la forma di un piano dei conti: servono almeno le colonne ' +
            '"Codice conto" e "Descrizione" (e di solito "TIPO").'
    )
  }

  // Preferenze: il foglio chiesto, poi quello che si chiama "Piano dei conti",
  // poi il primo con la colonna TIPO, poi il primo che ha codice e descrizione.
  const requested = options.sheet
    ? candidates.find((c) => norm(c.sheet.name) === norm(options.sheet!))
    : undefined
  if (options.sheet && !requested) {
    warnings.push(`Il foglio "${options.sheet}" non esiste o non ha la forma di un piano dei conti.`)
  }
  const chosen =
    requested ??
    candidates.find((c) => key(c.sheet.name) === 'piano dei conti') ??
    candidates.find((c) => c.header.col.type !== null) ??
    candidates[0]
  const { sheet, header } = chosen
  const { col, headers } = header
  const headerRow = sheet.getRow(header.row)

  if (col.type === null) {
    warnings.push(
      options.sections
        ? 'Il file non ha la colonna TIPO: ogni conto prende il tipo della sua sezione.'
        : 'Il file non ha la colonna TIPO.'
    )
  }

  // Colonne di valore: quelle fra cui il consulente sceglie.
  const valueColumns = new Map<string, number>()
  for (const [index, text] of headers) {
    if (VALUE_COLUMN.test(text)) {
      valueColumns.set(cellText(headerRow.getCell(index)).replace(/\s+/g, ' ').trim(), index)
    }
  }

  // Colonne di sotto-classificazione presenti in questo file.
  const detailColumns: { col: number; tag: string }[] = []
  for (const [index, text] of headers) {
    const tag = DETAIL_TAG_BY_HEADER.get(text)
    if (tag) detailColumns.push({ col: index, tag })
  }

  const availableValueColumns = [...valueColumns.keys()]
  const chosenName =
    options.valueColumn ??
    availableValueColumns.find((name) => key(name) === 'valore t') ??
    availableValueColumns[0] ??
    null
  const valueCol = chosenName ? (valueColumns.get(chosenName) ?? null) : null

  if (options.valueColumn && !valueCol) {
    warnings.push(`La colonna valore "${options.valueColumn}" non esiste in questo file.`)
  }

  // --- catalogo e abbinamenti a mano ------------------------------------------
  const catalog = new Map((options.sections ?? []).map((s) => [s.code, s]))
  const manualMap = new Map<string, string>()
  for (const [label, code] of Object.entries(options.sectionMap ?? {})) {
    if (catalog.size > 0 && !catalog.has(code)) {
      warnings.push(`Abbinamento ignorato: "${label}" → sezione sconosciuta "${code}".`)
      continue
    }
    manualMap.set(labelKey(label), code)
  }

  /** Sezione di un conto, dall'etichetta sotto cui si trova e dal suo TIPO. */
  const resolveSection = (label: string | null, type: AccountType | null): string | null => {
    if (!label) return null
    const manual = manualMap.get(labelKey(label))
    if (manual) return manual
    const mapping = sectionFromLabel(label)
    if (mapping === undefined) return null
    if (typeof mapping === 'string') return mapping
    if (type === 'RICAVO') return mapping.RICAVO ?? null
    if (type?.startsWith('ATTIVITA')) return mapping.ATTIVITA ?? null
    return null
  }

  // --- scorrimento delle righe ----------------------------------------------
  const accounts: ParsedAccount[] = []
  const unmapped: UnmappedRow[] = []
  const sections: SectionSummary[] = []
  const seenCodes = new Map<string, number[]>()
  let templateRows = 0
  let typeFromSection = 0

  let currentLabel: string | null = null

  const lastRow = sheet.rowCount
  for (let r = header.row + 1; r <= lastRow; r++) {
    const row = sheet.getRow(r)
    const rawType = col.type !== null ? cellText(row.getCell(col.type)).trim() : ''
    const name = cellText(row.getCell(col.name!)).trim()
    const code = cellText(row.getCell(col.code!)).trim()

    // Intestazione di sezione: descrizione senza TIPO, e senza codice — a meno
    // che la descrizione sia proprio il nome di una sezione ("60 RICAVI OPERATIVI").
    const knownLabel = name ? sectionFromLabel(name) !== undefined || manualMap.has(labelKey(name)) : false
    if (!rawType && name && (!code || knownLabel)) {
      currentLabel = name
      const manual = manualMap.get(labelKey(name))
      const mapping = sectionFromLabel(name)
      if (!manual && mapping === undefined) {
        warnings.push(`Sezione non riconosciuta alla riga ${r}: "${name}". Si può abbinare a mano.`)
      }
      sections.push({
        label: name,
        section_code: manual ?? (typeof mapping === 'string' ? mapping : null),
        manual: manual !== undefined,
        rows: 0,
        withValue: 0
      })
      continue
    }

    const summary = sections.at(-1)

    // Riga vuota, o riga del modello senza conto dentro.
    if (!code && !name) {
      if (!rawType) continue
      if (summary) {
        summary.rows++
        // Le righe del modello portano il TIPO: bastano a disambiguare la sezione.
        const t = parseAccountType(rawType)
        if (summary.section_code === null && t) summary.section_code = resolveSection(currentLabel, t)
      }
      templateRows++
      continue
    }

    if (summary) summary.rows++

    const fail = (reason: string): void => {
      unmapped.push({
        row: r,
        reason,
        code: code || null,
        name: name || null,
        section_label: currentLabel,
        raw_type: rawType || null
      })
    }

    let accountType = rawType ? parseAccountType(rawType) : null
    if (rawType && !accountType) {
      fail(`TIPO non riconosciuto: "${rawType}".`)
      continue
    }

    const sectionCode = resolveSection(currentLabel, accountType)
    if (summary && sectionCode && summary.section_code === null) summary.section_code = sectionCode

    if (!sectionCode) {
      const mapping = currentLabel ? sectionFromLabel(currentLabel) : undefined
      fail(
        !currentLabel
          ? 'Riga fuori da qualsiasi sezione.'
          : mapping !== undefined
            ? `Manca il TIPO, che in "${currentLabel}" serve a distinguere conto economico e attivo.`
            : `La sezione "${currentLabel}" non corrisponde a nessuna categoria nota.`
      )
      continue
    }

    const section = catalog.get(sectionCode)
    if (!accountType) {
      if (!section) {
        fail('Manca il TIPO del conto.')
        continue
      }
      accountType = section.account_type
      typeFromSection++
    }

    if (section && !typesForSection(section.account_type).includes(accountType)) {
      fail(
        `TIPO "${accountType}" incoerente con la sezione "${section.label}", ` +
          `che contiene conti di tipo ${section.account_type}.`
      )
      continue
    }

    if (!code) {
      fail('Manca il codice del conto mastro.')
      continue
    }

    // La prima colonna di dettaglio marcata vince: sono alternative, non
    // cumulabili. Se ce n'è più d'una è un errore nel file, e va detto.
    const marked = detailColumns.filter(({ col: c }) => {
      const text = norm(cellText(row.getCell(c)))
      return text === 'x' || text === 'si' || text === 'true' || text === '1'
    })
    if (marked.length > 1) {
      warnings.push(
        `Riga ${r}: più sotto-classificazioni marcate (${marked
          .map((m) => m.tag)
          .join(', ')}). È stata presa la prima.`
      )
    }

    const amount = valueCol ? cellNumber(row.getCell(valueCol)) : null
    if (amount !== null && summary) summary.withValue++

    seenCodes.set(code, [...(seenCodes.get(code) ?? []), r])

    accounts.push({
      row: r,
      code,
      name: name || code,
      section_code: sectionCode,
      section_label: currentLabel ?? '',
      account_type: accountType,
      detail_tag: marked[0]?.tag ?? null,
      direct_cost_pct: col.directCostPct !== null ? cellPercent(row.getCell(col.directCostPct)) : null,
      amount_cents: amount === null ? null : toCents(amount)
    })
  }

  if (typeFromSection > 0 && col.type !== null) {
    warnings.push(`${typeFromSection} conti senza TIPO: hanno preso quello della loro sezione.`)
  }

  const duplicates = [...seenCodes.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([code, rows]) => ({ code, rows }))

  if (duplicates.length > 0) {
    warnings.push(
      `${duplicates.length} codice/i conto compaiono più volte nel file: vanno risolti prima di importare.`
    )
  }

  if (accounts.length > 0 && accounts.every((a) => a.amount_cents === null)) {
    warnings.push(
      'Nessuna riga ha un valore nella colonna scelta: il file contiene la struttura del piano dei conti, non i saldi.'
    )
  }

  return {
    file: { name: basename(filePath), sha256, sheet: sheet.name },
    availableSheets: candidates.map((c) => c.sheet.name),
    valueColumn: chosenName,
    availableValueColumns,
    sections,
    accounts,
    unmapped,
    templateRows,
    duplicates,
    warnings
  }
}
