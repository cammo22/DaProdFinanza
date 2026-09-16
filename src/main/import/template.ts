import ExcelJS from 'exceljs'
import type { AccountType } from '@shared/types'
import { DETAIL_TAG_TEMPLATE_HEADERS } from './chart-of-accounts'

/**
 * Modello Excel scaricabile — la porta d'ingresso per chi non ha già il file
 * del consulente.
 *
 * Produce esattamente la forma che `readPreview()` sa leggere: stesse
 * intestazioni, sezioni riconosciute dal nome, sotto-classificazioni a "X".
 * Se l'azienda ha già un piano dei conti, lo riporta: il consulente deve solo
 * scrivere i valori del periodo, non ricostruire la struttura ogni mese.
 */

export interface TemplateSection {
  code: string
  label: string
  statement: 'CE' | 'SP'
  account_type: string
  detail_tags: string[]
}

export interface TemplateAccount {
  code: string
  name: string
  section_code: string
  account_type: AccountType
  detail_tag: string | null
  direct_cost_pct: number | null
}

/** Righe vuote per sezione, col TIPO già scritto, dove aggiungere conti. */
const EMPTY_ROWS_PER_SECTION = 3

const TYPES: AccountType[] = ['RICAVO', 'COSTO', "ATTIVITA'", "ATTIVITA' NEGATIVO", "PASSIVITA'"]

/**
 * Nel file del consulente "Rimanenze Finali" compare due volte, una nel conto
 * economico e una nell'attivo, con la stessa etichetta: la distingue il TIPO.
 * Le etichette del database portano la precisazione fra parentesi, che il
 * file non ha.
 */
function fileLabel(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, '')
}

export async function buildTemplate(
  sections: TemplateSection[],
  accounts: TemplateAccount[],
  options: { companyName?: string } = {}
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'DaProdFinanza'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('PIANO DEI CONTI', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }]
  })

  const detailTags = Object.keys(DETAIL_TAG_TEMPLATE_HEADERS)
  const headers = [
    'TIPO',
    'Codice Conto Mastro',
    'Descrizione',
    'VALORE T',
    '% COSTO DIRETTO',
    ...detailTags.map((tag) => DETAIL_TAG_TEMPLATE_HEADERS[tag]!)
  ]
  const valueCol = 4
  const pctCol = 5
  const firstDetailCol = 6

  sheet.columns = headers.map((_, i) => ({
    width: i === 2 ? 42 : i === 1 ? 20 : i < 5 ? 16 : 14
  }))

  const header = sheet.addRow(headers)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.alignment = { vertical: 'middle', wrapText: true }
  header.height = 32
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  })

  const typeList = `"${TYPES.join(',')}"`

  const addAccountRow = (
    type: string,
    values: { code?: string; name?: string; pct?: number | null; tag?: string | null },
    allowedTags: string[]
  ): void => {
    const row = sheet.addRow([type, values.code ?? null, values.name ?? null])
    row.getCell(valueCol).numFmt = '#,##0.00'
    if (values.pct !== null && values.pct !== undefined) row.getCell(pctCol).value = values.pct

    row.getCell(1).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [typeList],
      showErrorMessage: true,
      errorTitle: 'TIPO non valido',
      error: 'Scegli uno dei cinque tipi di conto.'
    }

    // Le colonne di sotto-classificazione hanno senso solo dove la sezione le
    // prevede: le altre si lasciano grigie, per non invitare a marcarle.
    detailTags.forEach((tag, i) => {
      const cell = row.getCell(firstDetailCol + i)
      if (allowedTags.includes(tag)) {
        cell.alignment = { horizontal: 'center' }
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"X"'] }
        if (values.tag === tag) cell.value = 'X'
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
      }
    })
  }

  for (const section of sections) {
    const titleRow = sheet.addRow([null, null, fileLabel(section.label)])
    titleRow.font = { bold: true }
    titleRow.getCell(3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: section.statement === 'CE' ? 'FFDBEAFE' : 'FFDCFCE7' }
    }

    for (const account of accounts.filter((a) => a.section_code === section.code)) {
      addAccountRow(
        account.account_type,
        {
          code: account.code,
          name: account.name,
          pct: account.direct_cost_pct,
          tag: account.detail_tag
        },
        section.detail_tags
      )
    }
    for (let i = 0; i < EMPTY_ROWS_PER_SECTION; i++) {
      addAccountRow(section.account_type, {}, section.detail_tags)
    }
  }

  const guide = workbook.addWorksheet('ISTRUZIONI')
  guide.getColumn(1).width = 110
  const lines = [
    `Modello del piano dei conti${options.companyName ? ` — ${options.companyName}` : ''}`,
    '',
    'Come si compila',
    '1. Nel foglio PIANO DEI CONTI ogni riga è un conto. Le righe in grassetto sono le sezioni: non vanno modificate.',
    '2. Per aggiungere un conto usa le righe vuote sotto la sezione giusta: scrivi codice e descrizione.',
    '3. Nella colonna VALORE T scrivi il saldo del periodo. Il periodo (mese o anno) e lo scenario si scelgono al momento dell\'import.',
    "4. I costi si scrivono positivi. I fondi (ammortamento, svalutazione) vanno nella loro sezione con TIPO \"ATTIVITA' NEGATIVO\".",
    '5. Nelle colonne a destra marca con una X la sotto-classificazione del conto, dove la sezione lo prevede (celle bianche).',
    '   Servono a distinguere crediti commerciali, debiti verso fornitori, TFR: senza, giorni di incasso e pagamento e posizione finanziaria non si calcolano.',
    '6. La colonna % COSTO DIRETTO è facoltativa: se vuota vale quella della sezione.',
    '',
    'Le righe vuote vengono ignorate. Prima di scrivere qualsiasi cosa, DaProdFinanza mostra un riepilogo di quello che ha letto.',
    'Lo stesso file si può riusare: basta cambiare i valori e importarlo su un altro periodo.'
  ]
  lines.forEach((text, i) => {
    const row = guide.addRow([text])
    if (i === 0) row.font = { bold: true, size: 14 }
    if (text === 'Come si compila') row.font = { bold: true }
  })

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
