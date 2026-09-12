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
 *    nella colonna `Descrizione`, le colonne dai nomi nella prima riga.
 * 2. **Mai un import silenzioso su dati contabili.** Questo modulo si ferma a
 *    produrre un *riepilogo*: righe riconosciute, righe da mappare a mano,
 *    doppioni. Scrivere sul database è un passo separato, che parte solo dopo
 *    una conferma esplicita.
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
 * Etichette di sezione come compaiono nel file del consulente → codice della
 * sezione nel database. Dove la stessa etichetta vale per due sezioni
 * ("Rimanenze Finali" esiste sia nel conto economico sia nell'attivo) si
 * disambigua con il TIPO dei conti che stanno sotto.
 */
const SECTION_BY_LABEL: Record<string, string | { RICAVO?: string; ATTIVITA?: string }> = {
  'ricavi operativi': 'ricavi_operativi',
  'rimanenze finali': { RICAVO: 'rimanenze_finali_ricavo', ATTIVITA: 'rimanenze_finali_magazzino' },
  'proventi straordinari': 'proventi_straordinari',
  'proventi finanziari': 'proventi_finanziari',
  'esistenze iniziali': 'esistenze_iniziali',
  'costi materie prime': 'costi_materie_prime',
  'costi produzione': 'costi_produzione',
  'ammortamenti operativi': 'ammortamenti_operativi',
  'costi personale': 'costi_personale',
  'costi commerciali': 'costi_commerciali',
  'costi generali e amministrativi': 'costi_generali_amministrativi',
  'ammortamenti non operativi': 'ammortamenti_non_operativi',
  'oneri straordinari': 'oneri_straordinari',
  'oneri finanziari': 'oneri_finanziari',
  imposte: 'imposte',
  'immobilizzazioni immateriali': 'immobilizzazioni_immateriali',
  'immobilizzazioni materiali': 'immobilizzazioni_materiali',
  'immobilizzazioni finanziarie': 'immobilizzazioni_finanziarie',
  'liquidita differite': 'liquidita_differite',
  'liquidita immediate': 'liquidita_immediate',
  'patrimonio netto': 'patrimonio_netto',
  'debiti a medio/lungo termine': 'debiti_medio_lungo',
  'debiti a breve termine': 'debiti_breve'
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
const DETAIL_TAG_BY_HEADER: Record<string, string> = {
  'crediti commerciali': 'Crediti Commerciali',
  'crediti diversi': 'Crediti Diversi',
  'erario c/iva': 'Erario c/IVA',
  'utile a nuovo': 'Utile a nuovo',
  utile: 'Utile',
  'fondo tfr': 'Fondo TFR',
  'debiti diversi': 'Debiti Diversi',
  'debiti verso fornitori costi variabili': 'Debiti v/Fornitori (costi variabili)',
  'debiti verso fornitori costi fissi': 'Debiti v/Fornitori (costi fissi)',
  'debiti v/enti previdenziali': 'Debiti v/Enti Previdenziali',
  'debiti verso enti previdenziali': 'Debiti v/Enti Previdenziali'
}

/** Intestazioni delle colonne che servono, con le varianti già incontrate. */
const COLUMN_ALIASES: Record<string, string[]> = {
  type: ['tipo'],
  code: ['codice conto mastro', 'codice conto', 'codice'],
  name: ['descrizione'],
  period: ['periodo (t)', 'periodo'],
  directCostPct: ['% costo diretto']
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
  rows: number
  withValue: number
}

export interface ImportPreview {
  file: { name: string; sha256: string; sheet: string }
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

function cellNumber(cell: ExcelJS.Cell | undefined): number | null {
  if (!cell) return null
  const value = cell.value
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value
  if (typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result
  }
  // Numeri scritti come testo: "1.234,56" all'italiana oppure "1234.56".
  const text = cellText(cell).replace(/[\s€]/g, '')
  if (!text) return null
  const italian = /,\d{1,2}$/.test(text)
  const cleaned = italian ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/** Euro → centesimi interi, senza passare dalla virgola mobile all'arrotondamento. */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export async function readPreview(
  filePath: string,
  options: { valueColumn?: string } = {}
): Promise<ImportPreview> {
  const buffer = await readFile(filePath)
  const sha256 = createHash('sha256').update(buffer).digest('hex')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

  const sheet =
    workbook.worksheets.find((w) => norm(w.name) === 'piano dei conti') ?? workbook.worksheets[0]
  if (!sheet) throw new Error('Il file non contiene alcun foglio.')

  const warnings: string[] = []

  // --- colonne, per nome e non per posizione ---------------------------------
  const headerRow = sheet.getRow(1)
  const headers = new Map<number, string>()
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const text = norm(cellText(cell))
    if (text) headers.set(col, text)
  })

  const findColumn = (aliases: string[]): number | null => {
    for (const [col, text] of headers) {
      if (aliases.includes(text)) return col
    }
    return null
  }

  const col = {
    type: findColumn(COLUMN_ALIASES.type),
    code: findColumn(COLUMN_ALIASES.code),
    name: findColumn(COLUMN_ALIASES.name),
    period: findColumn(COLUMN_ALIASES.period),
    directCostPct: findColumn(COLUMN_ALIASES.directCostPct)
  }

  for (const [key, index] of Object.entries(col)) {
    if (index === null && key !== 'period' && key !== 'directCostPct') {
      throw new Error(
        `Nel foglio "${sheet.name}" manca la colonna "${COLUMN_ALIASES[key][0]}". ` +
          'Il file non ha la forma di un piano dei conti.'
      )
    }
  }

  // Colonne di valore: quelle con un'intestazione tipo "VALORE T", "BUDGET
  // Gennaio", "CONSUNT Marzo". Sono quelle fra cui il consulente sceglie.
  const valueColumns = new Map<string, number>()
  for (const [index, text] of headers) {
    if (/^(valore t|budget |consunt|previsionale)/.test(text)) {
      valueColumns.set(cellText(headerRow.getCell(index)).replace(/\s+/g, ' ').trim(), index)
    }
  }

  // Colonne di sotto-classificazione presenti in questo file.
  const detailColumns: { col: number; tag: string }[] = []
  for (const [index, text] of headers) {
    const tag = DETAIL_TAG_BY_HEADER[text]
    if (tag) detailColumns.push({ col: index, tag })
  }

  const availableValueColumns = [...valueColumns.keys()]
  const chosenName =
    options.valueColumn ??
    availableValueColumns.find((name) => norm(name) === 'valore t') ??
    availableValueColumns[0] ??
    null
  const valueCol = chosenName ? (valueColumns.get(chosenName) ?? null) : null

  if (options.valueColumn && !valueCol) {
    warnings.push(`La colonna valore "${options.valueColumn}" non esiste in questo file.`)
  }

  // --- scorrimento delle righe ----------------------------------------------
  const accounts: ParsedAccount[] = []
  const unmapped: UnmappedRow[] = []
  const sections = new Map<string, SectionSummary>()
  const seenCodes = new Map<string, number[]>()
  let templateRows = 0

  let currentLabel: string | null = null
  let currentCode: string | null | undefined = undefined

  const lastRow = sheet.rowCount
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r)
    const rawType = cellText(row.getCell(col.type!)).trim()
    const name = cellText(row.getCell(col.name!)).trim()
    const code = cellText(row.getCell(col.code!)).trim()

    // Intestazione di sezione: descrizione presente, TIPO assente.
    if (!rawType && name) {
      currentLabel = name
      const mapping = SECTION_BY_LABEL[norm(name)]
      currentCode = typeof mapping === 'string' ? mapping : undefined
      if (mapping === undefined) {
        currentCode = null
        warnings.push(`Sezione non riconosciuta alla riga ${r}: "${name}".`)
      }
      sections.set(`${r}:${name}`, {
        label: name,
        section_code: typeof mapping === 'string' ? mapping : null,
        rows: 0,
        withValue: 0
      })
      continue
    }

    if (!rawType) continue

    const accountType = parseAccountType(rawType)
    const sectionKey = [...sections.keys()].at(-1)
    const summary = sectionKey ? sections.get(sectionKey) : undefined

    // Sezioni ambigue per nome: si sceglie in base al TIPO dei conti sotto.
    let sectionCode = currentCode ?? null
    if (currentLabel && sectionCode === undefined) sectionCode = null
    const mapping = currentLabel ? SECTION_BY_LABEL[norm(currentLabel)] : undefined
    if (mapping && typeof mapping !== 'string' && accountType) {
      sectionCode =
        accountType === 'RICAVO'
          ? (mapping.RICAVO ?? null)
          : accountType.startsWith('ATTIVITA')
            ? (mapping.ATTIVITA ?? null)
            : null
      if (summary && sectionCode) summary.section_code = sectionCode
    }

    if (summary) summary.rows++

    // Riga del modello: struttura pronta ma nessun conto dentro. Non è un
    // errore, è un file non ancora compilato.
    if (!code && !name) {
      templateRows++
      continue
    }

    if (!accountType) {
      unmapped.push({
        row: r,
        reason: `TIPO non riconosciuto: "${rawType}".`,
        code: code || null,
        name: name || null,
        section_label: currentLabel,
        raw_type: rawType
      })
      continue
    }

    if (!sectionCode) {
      unmapped.push({
        row: r,
        reason: currentLabel
          ? `La sezione "${currentLabel}" non corrisponde a nessuna categoria nota.`
          : 'Riga fuori da qualsiasi sezione.',
        code: code || null,
        name: name || null,
        section_label: currentLabel,
        raw_type: rawType
      })
      continue
    }

    if (!code) {
      unmapped.push({
        row: r,
        reason: 'Manca il codice del conto mastro.',
        code: null,
        name: name || null,
        section_label: currentLabel,
        raw_type: rawType
      })
      continue
    }

    // La prima colonna di dettaglio marcata vince: sono alternative, non
    // cumulabili. Se ce n'è più d'una è un errore nel file, e va detto.
    const marked = detailColumns.filter(({ col: c }) => {
      const text = cellText(row.getCell(c)).trim().toLowerCase()
      return text === 'x' || text === 'si' || text === 'sì' || text === 'true'
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
      direct_cost_pct: col.directCostPct ? cellNumber(row.getCell(col.directCostPct)) : null,
      amount_cents: amount === null ? null : toCents(amount)
    })
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
    valueColumn: chosenName,
    availableValueColumns,
    sections: [...sections.values()],
    accounts,
    unmapped,
    templateRows,
    duplicates,
    warnings
  }
}
