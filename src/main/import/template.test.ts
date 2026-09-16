import ExcelJS from 'exceljs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SECTIONS } from '../db/migrations/002_financial_model'
import { DETAIL_TAG_TEMPLATE_HEADERS, detailTagFromHeader, readPreview } from './chart-of-accounts'
import { buildTemplate, type TemplateAccount } from './template'

/**
 * Il modello scaricabile ha senso solo se l'import lo rilegge senza perdite:
 * tutte le sezioni riconosciute, nessuna riga da sistemare, sotto-classificazioni
 * intatte.
 */

const ACCOUNTS: TemplateAccount[] = [
  { code: '60.01', name: 'Vendite', section_code: 'ricavi_operativi', account_type: 'RICAVO', detail_tag: null, direct_cost_pct: null },
  { code: '60.20', name: 'Rimanenze finali CE', section_code: 'rimanenze_finali_ricavo', account_type: 'RICAVO', detail_tag: null, direct_cost_pct: null },
  { code: '70.40', name: 'Stipendi', section_code: 'costi_personale', account_type: 'COSTO', detail_tag: null, direct_cost_pct: 60 },
  { code: '11.01', name: 'Impianti', section_code: 'immobilizzazioni_materiali', account_type: "ATTIVITA'", detail_tag: null, direct_cost_pct: null },
  { code: '11.91', name: 'Fondo ammortamento impianti', section_code: 'immobilizzazioni_materiali', account_type: "ATTIVITA' NEGATIVO", detail_tag: null, direct_cost_pct: null },
  { code: '20.01', name: 'Magazzino', section_code: 'rimanenze_finali_magazzino', account_type: "ATTIVITA'", detail_tag: null, direct_cost_pct: null },
  { code: '21.01', name: 'Clienti', section_code: 'liquidita_differite', account_type: "ATTIVITA'", detail_tag: 'Crediti Commerciali', direct_cost_pct: null },
  { code: '40.01', name: 'Fornitori merci', section_code: 'debiti_breve', account_type: "PASSIVITA'", detail_tag: 'Debiti v/Fornitori (costi variabili)', direct_cost_pct: null },
  { code: '32.01', name: 'TFR', section_code: 'debiti_medio_lungo', account_type: "PASSIVITA'", detail_tag: 'Fondo TFR', direct_cost_pct: null }
]

let dir: string
let path: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'daprodfinanza-template-'))
  path = join(dir, 'modello.xlsx')
  await writeFile(path, await buildTemplate(SECTIONS, ACCOUNTS, { companyName: 'Prova' }))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('modello Excel scaricabile', () => {
  it('ogni sotto-classificazione ha un\'intestazione che l\'import riconosce', () => {
    for (const [tag, header] of Object.entries(DETAIL_TAG_TEMPLATE_HEADERS)) {
      expect(detailTagFromHeader(header)).toBe(tag)
    }
    const allDetailTags = new Set(SECTIONS.flatMap((s) => s.detail_tags))
    for (const tag of allDetailTags) expect(DETAIL_TAG_TEMPLATE_HEADERS[tag]).toBeDefined()
  })

  it('si rilegge con tutte le sezioni e nessuna riga da sistemare', async () => {
    const preview = await readPreview(path)
    expect(preview.sections).toHaveLength(SECTIONS.length)
    expect(preview.sections.every((s) => s.section_code !== null)).toBe(true)
    expect(preview.unmapped).toEqual([])
    expect(preview.duplicates).toEqual([])
    expect(preview.valueColumn).toBe('VALORE T')
    expect(preview.templateRows).toBe(SECTIONS.length * 3)
  })

  it('riporta i conti esistenti con sezione, tipo e sotto-classificazione', async () => {
    const preview = await readPreview(path)
    expect(preview.accounts).toHaveLength(ACCOUNTS.length)
    for (const expected of ACCOUNTS) {
      const found = preview.accounts.find((a) => a.code === expected.code)
      expect(found, expected.code).toMatchObject({
        section_code: expected.section_code,
        account_type: expected.account_type,
        detail_tag: expected.detail_tag,
        amount_cents: null
      })
    }
    expect(preview.accounts.find((a) => a.code === '70.40')?.direct_cost_pct).toBe(60)
  })

  it('una volta compilato, i valori arrivano all\'import', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(path)
    const sheet = workbook.getWorksheet('PIANO DEI CONTI')!
    let aggiunto = false
    sheet.eachRow((row) => {
      if (row.getCell(2).value === '60.01') row.getCell(4).value = 12345.67
      // Un conto nuovo su una riga vuota della sezione.
      if (row.getCell(1).value === 'COSTO' && !row.getCell(2).value && !aggiunto) {
        row.getCell(2).value = '70.99'
        row.getCell(3).value = 'Consulenze'
        row.getCell(4).value = 800
        aggiunto = true
      }
    })
    const filled = join(dir, 'compilato.xlsx')
    await workbook.xlsx.writeFile(filled)

    const preview = await readPreview(filled)
    expect(preview.accounts.find((a) => a.code === '60.01')?.amount_cents).toBe(1_234_567)
    expect(preview.accounts.find((a) => a.code === '70.99')?.amount_cents).toBe(80_000)
    expect(preview.unmapped).toEqual([])
  })
})
