import ExcelJS from 'exceljs'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readPreview, toCents } from './chart-of-accounts'

/**
 * L'importatore si prova su due fronti: un file costruito qui, che copre i casi
 * storti, e — se presente in locale — il file vero del consulente, che copre la
 * forma reale. Il secondo è escluso dalla repo (AGENTS.md §0), quindi in CI
 * quel blocco si salta invece di fallire.
 */

const HEADERS = [
  'TIPO',
  'Codice Conto Mastro',
  'Descrizione',
  'PERIODO (T)',
  'VALORE T -1',
  'VALORE T',
  '% COSTO DIRETTO',
  'BUDGET Gennaio',
  'Crediti Commerciali',
  'Crediti Diversi',
  'Debiti verso Fornitori costi variabili'
]

type Row = (string | number | null)[]

let dir: string
let filePath: string

async function scrivi(rows: Row[], path: string): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('PIANO DEI CONTI')
  sheet.addRow(HEADERS)
  for (const row of rows) sheet.addRow(row)
  await workbook.xlsx.writeFile(path)
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'daprodfinanza-import-'))
  filePath = join(dir, 'piano-dei-conti.xlsx')

  await scrivi(
    [
      // Sezione di ricavo, con una riga valida e una riga di solo modello.
      [null, null, 'RICAVI OPERATIVI'],
      ['RICAVO', '60.01', 'Vendite Italia', 'Anno', 900_000, 1_000_000],
      ['RICAVO', null, null, 'Anno'],
      // "RIMANENZE FINALI" esiste sia nel conto economico sia nell'attivo:
      // la disambiguazione deve avvenire sul TIPO.
      [null, null, 'RIMANENZE FINALI'],
      ['RICAVO', '60.20', 'Rimanenze finali prodotti', 'Anno', 40_000, 50_000],
      [null, null, 'COSTI PERSONALE'],
      ['COSTO', '70.40', 'Stipendi', 'Anno', 240_000, '250.000,50', 70],
      [null, null, 'Immobilizzazioni Materiali'],
      ["ATTIVITA'", '11.01', 'Impianti', 'Anno', 300_000, 300_000],
      ["ATTIVITA' NEGATIVO", '11.09', 'Fondo ammortamento impianti', 'Anno', 90_000, 100_000],
      [null, null, 'Rimanenze Finali'],
      ["ATTIVITA'", '20.01', 'Magazzino materie prime', 'Anno', 45_000, 50_000],
      // Le colonne di sotto-classificazione sono marcate con una "X".
      [null, null, 'Liquidità Differite'],
      ["ATTIVITA'", '21.01', 'Crediti v/clienti', 'Anno', 170_000, 180_000, null, null, 'X'],
      ["ATTIVITA'", '21.02', 'Crediti diversi', 'Anno', 4_000, 5_000, null, null, null, 'X'],
      ["ATTIVITA'", '21.03', 'Doppia marcatura', 'Anno', 1_000, 1_000, null, null, 'X', 'X'],
      [null, null, 'Debiti a breve termine'],
      ["PASSIVITA'", '50.01', 'Fornitori', 'Anno', 70_000, 80_000, null, null, null, null, 'X'],
      // Casi che devono finire nel riepilogo, non nel database.
      [null, null, 'SEZIONE CHE NON ESISTE'],
      ['COSTO', '99.99', 'Conto misterioso', 'Anno', 1, 2],
      [null, null, 'COSTI COMMERCIALI'],
      ['SPESA', '70.50', 'Tipo sbagliato', 'Anno', 1, 2],
      ['COSTO', null, 'Conto senza codice', 'Anno', 1, 2],
      ['COSTO', '60.01', 'Codice gia usato altrove', 'Anno', 1, 2]
    ],
    filePath
  )
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('Import del piano dei conti (§11.1)', () => {
  it('riconosce le sezioni dalle intestazioni, non dai numeri di riga', async () => {
    const preview = await readPreview(filePath)
    const codici = preview.accounts.map((a) => `${a.code}:${a.section_code}`)

    expect(codici).toContain('60.01:ricavi_operativi')
    expect(codici).toContain('70.40:costi_personale')
    expect(codici).toContain('11.01:immobilizzazioni_materiali')
  })

  it('distingue le due "Rimanenze Finali" dal TIPO dei conti sotto', async () => {
    const preview = await readPreview(filePath)
    const perCodice = new Map(preview.accounts.map((a) => [a.code, a.section_code]))

    expect(perCodice.get('60.20')).toBe('rimanenze_finali_ricavo')
    expect(perCodice.get('20.01')).toBe('rimanenze_finali_magazzino')
  })

  it('tiene il fondo ammortamento come ATTIVITA’ NEGATIVO nella sua sezione', async () => {
    const preview = await readPreview(filePath)
    const fondo = preview.accounts.find((a) => a.code === '11.09')

    expect(fondo?.account_type).toBe("ATTIVITA' NEGATIVO")
    expect(fondo?.section_code).toBe('immobilizzazioni_materiali')
  })

  it('legge gli importi in centesimi, anche scritti all’italiana', async () => {
    const preview = await readPreview(filePath)
    // Cercato per sezione, non per codice: "60.01" compare due volte di
    // proposito, ed è il caso che verifica i doppioni.
    const vendite = preview.accounts.find((a) => a.section_code === 'ricavi_operativi')
    const stipendi = preview.accounts.find((a) => a.code === '70.40')

    expect(vendite?.amount_cents).toBe(toCents(1_000_000))
    expect(stipendi?.amount_cents).toBe(25_000_050) // "250.000,50"
  })

  it('sceglie la colonna valore per nome, e le elenca tutte', async () => {
    const preview = await readPreview(filePath)
    expect(preview.valueColumn).toBe('VALORE T')
    expect(preview.availableValueColumns).toEqual(
      expect.arrayContaining(['VALORE T', 'VALORE T -1', 'BUDGET Gennaio'])
    )

    const anno = await readPreview(filePath, { valueColumn: 'VALORE T -1' })
    const vendite = anno.accounts.find((a) => a.section_code === 'ricavi_operativi')
    expect(vendite?.amount_cents).toBe(toCents(900_000))
  })

  it('manda nel riepilogo tutto ciò che non sa collocare, senza scartarlo', async () => {
    const preview = await readPreview(filePath)
    const motivi = preview.unmapped.map((u) => `${u.code ?? '—'}: ${u.reason}`)

    expect(preview.unmapped).toHaveLength(3)
    expect(motivi.some((m) => m.startsWith('99.99') && m.includes('SEZIONE CHE NON ESISTE'))).toBe(true)
    expect(motivi.some((m) => m.includes('TIPO non riconosciuto'))).toBe(true)
    expect(motivi.some((m) => m.includes('Manca il codice'))).toBe(true)
  })

  it('segnala i codici duplicati invece di sovrascrivere', async () => {
    const preview = await readPreview(filePath)
    expect(preview.duplicates).toEqual([{ code: '60.01', rows: expect.any(Array) }])
    expect(preview.warnings.join(' ')).toContain('più volte')
  })

  it('legge la sotto-classificazione dalle colonne marcate con "X"', async () => {
    const preview = await readPreview(filePath)
    const perCodice = new Map(preview.accounts.map((a) => [a.code, a.detail_tag]))

    // Senza questa informazione DSO, DPO, CCN e PFN non sarebbero calcolabili.
    expect(perCodice.get('21.01')).toBe('Crediti Commerciali')
    expect(perCodice.get('21.02')).toBe('Crediti Diversi')
    expect(perCodice.get('50.01')).toBe('Debiti v/Fornitori (costi variabili)')
    expect(perCodice.get('20.01')).toBeNull()
  })

  it('segnala una riga con più sotto-classificazioni marcate', async () => {
    const preview = await readPreview(filePath)
    // Sono alternative, non cumulabili: si prende la prima e lo si dice.
    expect(preview.warnings.join(' ')).toContain('più sotto-classificazioni marcate')
    const doppia = preview.accounts.find((a) => a.code === '21.03')
    expect(doppia?.detail_tag).toBe('Crediti Commerciali')
  })

  it('conta le righe di solo modello senza trattarle come errori', async () => {
    const preview = await readPreview(filePath)
    expect(preview.templateRows).toBe(1)
  })

  it('calcola l’impronta del file, per bloccare le doppie importazioni', async () => {
    const preview = await readPreview(filePath)
    expect(preview.file.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(preview.file.sheet).toBe('PIANO DEI CONTI')
  })

  it('rifiuta un file che non ha la forma di un piano dei conti', async () => {
    const altro = join(dir, 'altro.xlsx')
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Foglio1').addRow(['Data', 'Importo', 'Causale'])
    await workbook.xlsx.writeFile(altro)

    await expect(readPreview(altro)).rejects.toThrow(/piano dei conti/i)
  })
})

/** Il file reale del consulente, quando è presente nella cartella di lavoro. */
const REAL_FILE = resolve('Piano Dei Conti Indy Gennaio 2026.xlsx')

describe.skipIf(!existsSync(REAL_FILE))('Import del file reale del consulente', () => {
  it('riconosce tutte e 24 le sezioni del file vero', async () => {
    const preview = await readPreview(REAL_FILE)

    expect(preview.file.sheet).toBe('PIANO DEI CONTI')
    expect(preview.sections).toHaveLength(24)
    expect(preview.sections.every((s) => s.section_code !== null)).toBe(true)
    expect(preview.warnings.some((w) => w.includes('Sezione non riconosciuta'))).toBe(false)
  })

  it('riconosce che è un modello vuoto e non inventa saldi', async () => {
    const preview = await readPreview(REAL_FILE)

    expect(preview.templateRows).toBeGreaterThan(300)
    expect(preview.accounts).toHaveLength(0)
    expect(preview.unmapped).toHaveLength(0)
  })
})
