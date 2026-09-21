import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { crc32, docx, pdf, pptx, xlsx, zip } from './demo-files'

/**
 * I file della demo devono essere file veri: li si rilegge con le stesse
 * librerie che li aprono nel programma (ExcelJS per i fogli, JSZip — quella di
 * docx-preview — per gli archivi Office).
 *
 * `DAPROD_CAMPIONI_DIR=cartella npx vitest run demo-files` li scrive anche su
 * disco, per aprirli a mano con Office o LibreOffice.
 */
const cartella = process.env['DAPROD_CAMPIONI_DIR']
function salva(nome: string, dati: Uint8Array): void {
  if (!cartella) return
  mkdirSync(cartella, { recursive: true })
  writeFileSync(join(cartella, nome), dati)
}

describe('file della demo', () => {
  it('il CRC32 è quello standard', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('lo ZIP senza compressione si rilegge', async () => {
    const z = await JSZip.loadAsync(zip([{ name: 'cartella/à.txt', data: 'ciao' }]))
    expect(await z.file('cartella/à.txt')!.async('string')).toBe('ciao')
  })

  it('il foglio Excel si apre con ExcelJS, con numeri e testi al loro posto', async () => {
    const dati = xlsx([
      { nome: 'Budget', righe: [['Voce', 'Importo'], ['Ricavi', 1234.5], ['Costi', 999]], larghezze: [24, 14] },
      { nome: 'Note', righe: [['Perché sì']] }
    ])
    salva('prova.xlsx', dati)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(dati.buffer as ArrayBuffer)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Budget', 'Note'])
    const ws = wb.getWorksheet('Budget')!
    expect(ws.getCell('A2').value).toBe('Ricavi')
    expect(ws.getCell('B2').value).toBe(1234.5)
    expect(ws.getCell('B2').numFmt).toContain('€')
    expect(ws.getCell('A1').font?.bold).toBe(true)
    expect(wb.getWorksheet('Note')!.getCell('A1').value).toBe('Perché sì')
  })

  it('il documento Word e la presentazione sono archivi Office completi', async () => {
    const w = docx('Titolo', ['Primo paragrafo con l’accento: è.'])
    salva('prova.docx', w)
    const zw = await JSZip.loadAsync(w)
    expect(await zw.file('word/document.xml')!.async('string')).toContain('Primo paragrafo')

    const p = pptx([
      { titolo: 'Uno', punti: ['a', 'b'] },
      { titolo: 'Due', punti: ['c'] }
    ])
    salva('prova.pptx', p)
    const zp = await JSZip.loadAsync(p)
    expect(zp.file('ppt/slides/slide2.xml')).not.toBeNull()
    expect(await zp.file('ppt/presentation.xml')!.async('string')).toContain('r:id="rId4"')
  })

  it('il PDF ha la tabella dei riferimenti giusta', () => {
    const dati = pdf('Bilancio 2025', ['Ricavi: 1.020.000 €', 'Utile: 64.000 €'])
    salva('prova.pdf', dati)
    const testo = new TextDecoder('latin1').decode(dati)
    expect(testo.startsWith('%PDF-1.4')).toBe(true)
    const xref = Number(/startxref\n(\d+)/.exec(testo)![1])
    expect(testo.slice(xref, xref + 4)).toBe('xref')
    // Ogni oggetto sta dove la tabella dice che sta.
    const offsets = [...testo.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
    offsets.forEach((o, i) => expect(testo.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
    // L'euro in WinAnsi è il byte 0x80.
    expect(dati.includes(0x80)).toBe(true)
  })
})
