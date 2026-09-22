import { useEffect, useMemo, useState } from 'react'
import ExcelJS from 'exceljs/dist/exceljs.min.js'
import { estensione } from '@shared/documents'
import { Attesa } from './DocumentViewer'

/**
 * Fogli di calcolo (.xlsx, .xlsm) con ExcelJS — la stessa libreria dell'import
 * del piano dei conti, nella sua versione per il browser — e i .csv letti a
 * mano. Si vede com'è: fogli, celle unite, grassetti, allineamenti, numeri e
 * date all'italiana. Le formule mostrano il risultato salvato nel file.
 *
 * ⚠ SheetJS (che legge anche .xls e .ods) sarebbe stata la scelta naturale, ma
 * si installa solo dal suo sito e non dal registro npm: la configurazione di
 * questo computer rifiuta i pacchetti presi fuori dal registro, ed è giusto
 * così. I formati vecchi (.xls) e OpenDocument (.ods) si aprono col programma
 * del computer.
 */

const MAX_RIGHE = 1500
const MAX_COLONNE = 60

interface Cella {
  testo: string
  numero: boolean
  grassetto: boolean
  corsivo: boolean
  allinea?: 'left' | 'center' | 'right'
  sfondo?: string
  colore?: string
  span?: { r: number; c: number }
}

interface Foglio {
  nome: string
  righe: (Cella | null | 'coperta')[][]
  larghezze: number[]
  troncato: boolean
}

function lettere(n: number): string {
  let s = ''
  let x = n + 1
  while (x > 0) {
    const r = (x - 1) % 26
    s = String.fromCharCode(65 + r) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

/** Un colore ARGB di Excel ("FF1F4E79") come CSS; il bianco puro non si disegna. */
function argb(v: string | undefined): string | undefined {
  if (!v || v.length !== 8) return undefined
  const rgb = v.slice(2).toLowerCase()
  return rgb === 'ffffff' ? undefined : `#${rgb}`
}

const DATA = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Il numero come lo mostrerebbe Excel col formato della cella, all'italiana. */
function formatta(v: number, fmt: string | undefined): string {
  const f = fmt ?? 'General'
  // "0.00" → due decimali; senza indicazione decide il valore.
  const m = /0\.(0+)/.exec(f)
  const decimali = m ? m[1].length : null
  if (f.includes('%')) {
    return `${(v * 100).toLocaleString('it-IT', { minimumFractionDigits: decimali ?? 0, maximumFractionDigits: decimali ?? 2 })}%`
  }
  const euro = /€|EUR/.test(f)
  const migliaia = f.includes('#,##') || euro
  const opzioni: Intl.NumberFormatOptions = {
    useGrouping: migliaia ? 'always' : false,
    minimumFractionDigits: decimali ?? (euro ? 2 : 0),
    maximumFractionDigits: decimali ?? (euro ? 2 : 10)
  }
  const testo = v.toLocaleString('it-IT', opzioni)
  return euro ? `${testo} €` : testo
}

function testoCella(cell: ExcelJS.Cell): { testo: string; numero: boolean } {
  const v = cell.value as unknown
  if (v === null || v === undefined) return { testo: '', numero: false }
  if (typeof v === 'number') return { testo: formatta(v, cell.numFmt), numero: true }
  if (typeof v === 'boolean') return { testo: v ? 'VERO' : 'FALSO', numero: false }
  if (v instanceof Date) return { testo: DATA.format(v), numero: true }
  if (typeof v === 'string') return { testo: v, numero: false }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (Array.isArray(o.richText)) {
      return { testo: (o.richText as { text: string }[]).map((t) => t.text).join(''), numero: false }
    }
    if ('result' in o || 'formula' in o || 'sharedFormula' in o) {
      const r = o.result
      if (typeof r === 'number') return { testo: formatta(r, cell.numFmt), numero: true }
      if (r instanceof Date) return { testo: DATA.format(r), numero: true }
      if (r && typeof r === 'object' && 'error' in (r as object)) return { testo: String((r as { error: string }).error), numero: false }
      return { testo: r === undefined || r === null ? '' : String(r), numero: false }
    }
    if ('text' in o) return { testo: String(o.text), numero: false }
    if ('error' in o) return { testo: String(o.error), numero: false }
  }
  return { testo: String(v), numero: false }
}

async function leggiXlsx(dati: ArrayBuffer): Promise<Foglio[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(dati)
  const fogli: Foglio[] = []
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== 'visible') return
    const nr = Math.min(ws.rowCount, MAX_RIGHE)
    const nc = Math.min(ws.columnCount, MAX_COLONNE)
    const righe: Foglio['righe'] = Array.from({ length: nr }, () => Array.from({ length: nc }, () => null))
    // Celle unite: la prima porta le misure, le altre si saltano.
    const unite = ((ws as unknown as { model: { merges?: string[] } }).model.merges ?? []) as string[]
    for (const zona of unite) {
      const [da, a] = zona.split(':')
      const inizio = ws.getCell(da)
      const fine = ws.getCell(a)
      const r0 = Number(inizio.row) - 1
      const c0 = Number(inizio.col) - 1
      const r1 = Math.min(Number(fine.row) - 1, nr - 1)
      const c1 = Math.min(Number(fine.col) - 1, nc - 1)
      if (r0 >= nr || c0 >= nc) continue
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r !== r0 || c !== c0) righe[r][c] = 'coperta'
      const { testo, numero } = testoCella(inizio)
      righe[r0][c0] = { testo, numero, grassetto: Boolean(inizio.font?.bold), corsivo: Boolean(inizio.font?.italic), span: { r: r1 - r0 + 1, c: c1 - c0 + 1 } }
    }
    for (let r = 0; r < nr; r++) {
      const row = ws.getRow(r + 1)
      for (let c = 0; c < nc; c++) {
        if (righe[r][c] === 'coperta') continue
        const cell = row.getCell(c + 1)
        const gia = righe[r][c]
        const { testo, numero } = testoCella(cell)
        const fill = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined
        righe[r][c] = {
          testo,
          numero,
          grassetto: Boolean(cell.font?.bold),
          corsivo: Boolean(cell.font?.italic),
          allinea: (cell.alignment?.horizontal as Cella['allinea']) ?? undefined,
          sfondo: fill?.type === 'pattern' ? argb(fill.fgColor?.argb) : undefined,
          colore: argb((cell.font?.color as { argb?: string } | undefined)?.argb),
          span: gia && gia !== 'coperta' ? gia.span : undefined
        }
      }
    }
    const larghezze = Array.from({ length: nc }, (_, c) => {
      const w = ws.getColumn(c + 1).width
      return Math.max(48, Math.min(420, Math.round((w ?? 10) * 7.5 + 8)))
    })
    fogli.push({ nome: ws.name, righe, larghezze, troncato: ws.rowCount > MAX_RIGHE || ws.columnCount > MAX_COLONNE })
  })
  return fogli
}

/** CSV all'italiana (punto e virgola) o all'inglese (virgola): si sceglie dal primo rigo. */
function leggiCsv(testo: string): Foglio[] {
  const primo = testo.split(/\r?\n/, 1)[0] ?? ''
  const sep = [';', '\t', ','].sort((a, b) => primo.split(b).length - primo.split(a).length)[0]
  const righe: string[][] = []
  let riga: string[] = []
  let campo = ''
  let virgolette = false
  for (let i = 0; i < testo.length && righe.length < MAX_RIGHE; i++) {
    const ch = testo[i]
    if (virgolette) {
      if (ch === '"' && testo[i + 1] === '"') {
        campo += '"'
        i++
      } else if (ch === '"') virgolette = false
      else campo += ch
    } else if (ch === '"') virgolette = true
    else if (ch === sep) {
      riga.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && testo[i + 1] === '\n') i++
      riga.push(campo)
      righe.push(riga)
      riga = []
      campo = ''
    } else campo += ch
  }
  if (campo || riga.length) {
    riga.push(campo)
    righe.push(riga)
  }
  const nc = Math.min(MAX_COLONNE, Math.max(0, ...righe.map((r) => r.length)))
  return [
    {
      nome: 'CSV',
      righe: righe.map((r) =>
        Array.from({ length: nc }, (_, c) => {
          const t = r[c] ?? ''
          const numero = /^-?[\d.]+(,\d+)?$|^-?\d+(\.\d+)?$/.test(t.trim())
          return { testo: t, numero, grassetto: false, corsivo: false }
        })
      ),
      larghezze: Array.from({ length: nc }, () => 120),
      troncato: righe.length >= MAX_RIGHE
    }
  ]
}

export default function SheetViewer({ blob, nome }: { blob: Blob; nome: string }): React.JSX.Element {
  const [fogli, setFogli] = useState<Foglio[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [attivo, setAttivo] = useState(0)

  useEffect(() => {
    let annullato = false
    const ext = estensione(nome)
    const lettura = ext === 'csv' ? blob.text().then(leggiCsv) : blob.arrayBuffer().then(leggiXlsx)
    lettura
      .then((f) => {
        if (!annullato) setFogli(f)
      })
      .catch(() => {
        if (!annullato) setErrore('Il foglio non si apre qui: forse è protetto da password o rovinato. Prova col programma del computer.')
      })
    return () => {
      annullato = true
    }
  }, [blob, nome])

  const foglio = fogli?.[attivo] ?? null
  const totale = useMemo(() => foglio?.larghezze.reduce((s, w) => s + w, 0) ?? 0, [foglio])

  if (errore) return <p className="p-6 text-sm text-negative">{errore}</p>
  if (!fogli) return <Attesa testo="Apro il foglio di calcolo…" />
  if (!foglio || foglio.righe.length === 0) return <p className="p-6 text-sm text-ink-300">Il foglio è vuoto.</p>

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-white" data-selectable>
        <table className="border-collapse text-[12px] text-slate-900" style={{ width: totale + 44, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 44 }} />
            {foglio.larghezze.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 border border-slate-300 bg-slate-100" />
              {foglio.larghezze.map((_, c) => (
                <th key={c} className="sticky top-0 z-10 border border-slate-300 bg-slate-100 px-1 py-0.5 text-center font-normal text-slate-500">
                  {lettere(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {foglio.righe.map((riga, r) => (
              <tr key={r}>
                <th className="sticky left-0 z-10 border border-slate-300 bg-slate-100 px-1 text-right font-normal text-slate-500">{r + 1}</th>
                {riga.map((cella, c) => {
                  if (cella === 'coperta') return null
                  if (!cella) return <td key={c} className="border border-slate-200" />
                  return (
                    <td
                      key={c}
                      rowSpan={cella.span?.r}
                      colSpan={cella.span?.c}
                      className="overflow-hidden border border-slate-200 px-1.5 py-0.5 whitespace-nowrap"
                      style={{
                        textAlign: cella.allinea ?? (cella.numero ? 'right' : 'left'),
                        fontWeight: cella.grassetto ? 600 : undefined,
                        fontStyle: cella.corsivo ? 'italic' : undefined,
                        background: cella.sfondo,
                        color: cella.colore
                      }}
                      title={cella.testo.length > 20 ? cella.testo : undefined}
                    >
                      {cella.testo}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto border-t border-ink-700 bg-ink-900 px-2 py-1">
        {fogli.map((f, i) => (
          <button
            key={f.nome + i}
            type="button"
            onClick={() => setAttivo(i)}
            className={`shrink-0 rounded px-3 py-1 text-xs ${i === attivo ? 'bg-brand-500 text-white' : 'text-ink-300 hover:bg-ink-800'}`}
          >
            {f.nome}
          </button>
        ))}
        {foglio.troncato && (
          <span className="ml-auto shrink-0 px-2 text-[11px] text-warning">
            Mostrate le prime {MAX_RIGHE} righe e {MAX_COLONNE} colonne: per tutto il resto, il programma del computer.
          </span>
        )}
      </div>
    </div>
  )
}
