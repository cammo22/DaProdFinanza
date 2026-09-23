import ExcelJS from 'exceljs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AccountType } from '@shared/types'
import { SECTIONS } from '../db/migrations/002_financial_model'
import { detailTagFromHeader, parseAmount, readPreview } from './chart-of-accounts'

/**
 * Fase 9 (§13): file "simili" ma non identici. Qui un piano dei conti come
 * potrebbe uscire da un altro studio o da un gestionale: titolo sopra le
 * intestazioni, un foglio di note prima, sinonimi al posto dei nomi del
 * modello, sezioni numerate, importi scritti come testo all'italiana.
 */

const CATALOGO = SECTIONS.map((s) => ({
  code: s.code,
  label: s.label,
  account_type: s.account_type as AccountType
}))

let dir: string
let filePath: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'daprodfinanza-import-tollerante-'))
  filePath = join(dir, 'bilancio-altro-studio.xlsx')

  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Note').addRow(['Bilancio di verifica fornito dal cliente'])

  const sheet = workbook.addWorksheet('Foglio1')
  sheet.addRow(['Rossi S.r.l. — bilancio al 31/12'])
  sheet.addRow([])
  sheet.addRow([
    'Tipologia',
    'Codice',
    'Descrizione conto',
    'Saldo',
    '% diretto',
    'Debiti v/fornitori (costi variabili)',
    'Crediti verso clienti'
  ])
  const rows: (string | number | null)[][] = [
    [null, null, '1. Ricavi operativi:'],
    ['RICAVO', '60.01', 'Vendite', 1_000_000],
    [null, null, 'B) Costi del personale'],
    ['COSTO', '70.40', 'Stipendi', '250.000,50', 0.7],
    // senza TIPO: con il catalogo prende quello della sezione
    [null, '70.41', 'Contributi', '80.000'],
    // TIPO incoerente con la sezione: si ferma nel riepilogo
    ['RICAVO', '70.42', 'Rimborso dipendente', 100],
    [null, null, 'Liquidità differite'],
    ["ATTIVITA'", '21.01', 'Clienti Italia', 180_000, null, null, 'x'],
    [null, null, 'Debiti a m/l termine'],
    ["PASSIVITA'", '32.01', 'Mutuo', '(1.234,56)'],
    [null, null, 'Debiti a breve termine'],
    ["PASSIVITA'", '40.01', 'Fornitori merci', '5.000,00-', null, 'X'],
    ["PASSIVITA'", '40.02', 'Fornitori vari', '-'],
    [null, null, 'Spese varie di gestione'],
    ['COSTO', '75.01', 'Cancelleria', 1_200]
  ]
  for (const row of rows) sheet.addRow(row)
  // La colonna "% diretto" formattata come percentuale: la cella contiene 0,7.
  sheet.getCell('E7').numFmt = '0%'

  await workbook.xlsx.writeFile(filePath)
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('Import tollerante (fase 9)', () => {
  it('trova il foglio e la riga di intestazione anche se non sono i primi', async () => {
    const preview = await readPreview(filePath, { sections: CATALOGO })
    expect(preview.file.sheet).toBe('Foglio1')
    expect(preview.availableSheets).toEqual(['Foglio1'])
    expect(preview.valueColumn).toBe('Saldo')
  })

  it('riconosce le sezioni numerate e scritte con altre parole', async () => {
    const preview = await readPreview(filePath, { sections: CATALOGO })
    const per = new Map(preview.accounts.map((a) => [a.code, a.section_code]))
    expect(per.get('60.01')).toBe('ricavi_operativi')
    expect(per.get('70.40')).toBe('costi_personale')
    expect(per.get('21.01')).toBe('liquidita_differite')
    expect(per.get('32.01')).toBe('debiti_medio_lungo')
    expect(per.get('40.01')).toBe('debiti_breve')
  })

  it('legge gli importi scritti come testo all’italiana, negativi compresi', async () => {
    const preview = await readPreview(filePath, { sections: CATALOGO })
    const cents = new Map(preview.accounts.map((a) => [a.code, a.amount_cents]))
    expect(cents.get('70.40')).toBe(25_000_050)
    expect(cents.get('70.41')).toBe(8_000_000)
    expect(cents.get('32.01')).toBe(-123_456)
    expect(cents.get('40.01')).toBe(-500_000)
    expect(cents.get('40.02')).toBeNull()
  })

  it('porta a 70 una percentuale di costo diretto scritta come cella percentuale', async () => {
    const preview = await readPreview(filePath, { sections: CATALOGO })
    expect(preview.accounts.find((a) => a.code === '70.40')?.direct_cost_pct).toBe(70)
  })

  it('riconosce le sotto-classificazioni scritte con altre parole', async () => {
    const preview = await readPreview(filePath, { sections: CATALOGO })
    const tag = new Map(preview.accounts.map((a) => [a.code, a.detail_tag]))
    expect(tag.get('21.01')).toBe('Crediti Commerciali')
    expect(tag.get('40.01')).toBe('Debiti v/Fornitori (costi variabili)')
    expect(detailTagFromHeader('DEBITI V/ENTI PREVIDENZIALI')).toBe('Debiti v/Enti Previdenziali')
  })

  it('dà a un conto senza TIPO quello della sua sezione, e lo dice', async () => {
    const preview = await readPreview(filePath, { sections: CATALOGO })
    expect(preview.accounts.find((a) => a.code === '70.41')?.account_type).toBe('COSTO')
    expect(preview.warnings.join(' ')).toContain('1 conti senza TIPO')
  })

  it('senza catalogo non indovina il TIPO mancante', async () => {
    const preview = await readPreview(filePath)
    expect(preview.accounts.find((a) => a.code === '70.41')).toBeUndefined()
    expect(preview.unmapped.find((u) => u.code === '70.41')?.reason).toMatch(/manca il tipo/i)
  })

  it('ferma nel riepilogo un TIPO incoerente con la sezione', async () => {
    const preview = await readPreview(filePath, { sections: CATALOGO })
    expect(preview.accounts.find((a) => a.code === '70.42')).toBeUndefined()
    expect(preview.unmapped.find((u) => u.code === '70.42')?.reason).toMatch(/incoerente/)
  })

  it('lascia abbinare a mano una sezione sconosciuta', async () => {
    const prima = await readPreview(filePath, { sections: CATALOGO })
    const sconosciuta = prima.sections.find((s) => s.label === 'Spese varie di gestione')
    expect(sconosciuta?.section_code).toBeNull()
    expect(prima.unmapped.find((u) => u.code === '75.01')).toBeDefined()

    const dopo = await readPreview(filePath, {
      sections: CATALOGO,
      sectionMap: { 'Spese varie di gestione': 'costi_generali_amministrativi' }
    })
    const abbinata = dopo.sections.find((s) => s.label === 'Spese varie di gestione')
    expect(abbinata).toMatchObject({ section_code: 'costi_generali_amministrativi', manual: true })
    expect(dopo.accounts.find((a) => a.code === '75.01')?.section_code).toBe(
      'costi_generali_amministrativi'
    )
    expect(dopo.warnings.join(' ')).not.toContain('Spese varie di gestione')
  })

  it('ignora un abbinamento verso una sezione che non esiste', async () => {
    const preview = await readPreview(filePath, {
      sections: CATALOGO,
      sectionMap: { 'Spese varie di gestione': 'non_esiste' }
    })
    expect(preview.warnings.join(' ')).toContain('Abbinamento ignorato')
    expect(preview.accounts.find((a) => a.code === '75.01')).toBeUndefined()
  })

  it('usa il foglio chiesto, e avvisa se non c’è', async () => {
    const preview = await readPreview(filePath, { sheet: 'Inesistente' })
    expect(preview.file.sheet).toBe('Foglio1')
    expect(preview.warnings.join(' ')).toContain('"Inesistente" non esiste')
  })
})

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1.234', 1234],
    ['1.234.567', 1234567],
    ['1234.56', 1234.56],
    ['1,234.56', 1234.56],
    ['€ 12,5', 12.5],
    ['(1.000)', -1000],
    ['1.000,00-', -1000],
    ['-250', -250],
    ['70%', 70],
    ['-', null],
    ['', null],
    ['abc', null]
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected)
  })
})
