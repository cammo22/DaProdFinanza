import { useCallback, useEffect, useState } from 'react'
import { convertPptxToSvg, type FontBuffer } from 'pptx-glimpse'
import carlito400 from '@fontsource/carlito/files/carlito-latin-400-normal.woff?inline'
import carlito700 from '@fontsource/carlito/files/carlito-latin-700-normal.woff?inline'
import arimo400 from '@fontsource/arimo/files/arimo-latin-400-normal.woff?inline'
import arimo700 from '@fontsource/arimo/files/arimo-latin-700-normal.woff?inline'
import { Attesa } from './DocumentViewer'

/**
 * Presentazioni PowerPoint (.pptx) con pptx-glimpse (MIT): ogni slide diventa
 * un disegno SVG, mostrato come immagine (dentro un <img> nessuno script può
 * partire).
 *
 * Il testo si disegna come tracciati con due caratteri liberi inclusi nel
 * programma, Carlito (stesse misure di Calibri) e Arimo (stesse misure di
 * Arial): le slide vengono uguali sul computer e sul telefono, anche dove
 * Office non c'è. Sono incorporati come dati (`?inline`) e non letti con
 * fetch: nel programma per computer la pagina è un file locale, e fetch sui
 * file locali non funziona.
 */

function daDataUrl(url: string): Uint8Array {
  const base64 = url.slice(url.indexOf(',') + 1)
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

let caratteri: FontBuffer[] | null = null
function fonts(): FontBuffer[] {
  caratteri ??= [
    { name: 'Carlito', data: daDataUrl(carlito400) },
    { name: 'Carlito', data: daDataUrl(carlito700) },
    { name: 'Arimo', data: daDataUrl(arimo400) },
    { name: 'Arimo', data: daDataUrl(arimo700) }
  ]
  return caratteri
}

/** Le slide si convertono a gruppi: la prima si vede subito, le altre arrivano. */
const GRUPPO = 4

export default function PptxViewer({ blob }: { blob: Blob }): React.JSX.Element {
  const [slide, setSlide] = useState<{ numero: number; url: string }[]>([])
  const [totale, setTotale] = useState<number | null>(null)
  const [attiva, setAttiva] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    let annullato = false
    const urls: string[] = []
    ;(async () => {
      const dati = new Uint8Array(await blob.arrayBuffer())
      // Quante slide ci sono: la prima conversione le conta.
      const primo = await convertPptxToSvg(dati, { fonts: fonts(), textOutput: 'path', slides: [1] })
      const numeri = contaSlide(primo, dati)
      if (annullato) return
      setTotale(numeri)
      for (let da = 1; da <= numeri; da += GRUPPO) {
        const gruppo = Array.from({ length: Math.min(GRUPPO, numeri - da + 1) }, (_, i) => da + i)
        const r = da === 1 && primo.slides.length ? await convertiResto(dati, gruppo, primo) : await convertPptxToSvg(dati, { fonts: fonts(), textOutput: 'path', slides: gruppo })
        if (annullato) return
        const nuove = r.slides.map((s) => {
          const url = URL.createObjectURL(new Blob([s.svg], { type: 'image/svg+xml' }))
          urls.push(url)
          return { numero: s.slideNumber, url }
        })
        setSlide((prima) => [...prima, ...nuove].sort((a, b) => a.numero - b.numero))
      }
    })().catch(() => {
      if (!annullato) setErrore('La presentazione non si apre qui (forse è un .ppt vecchio o è rovinata): prova col programma del computer.')
    })
    return () => {
      annullato = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [blob])

  const vai = useCallback(
    (n: number) => setAttiva((a) => Math.max(0, Math.min((totale ?? 1) - 1, n < 0 ? a - 1 : n === Infinity ? a + 1 : n))),
    [totale]
  )

  useEffect(() => {
    const tasto = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') vai(Infinity)
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') vai(-1)
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [vai])

  if (errore) return <p className="p-6 text-sm text-negative">{errore}</p>
  if (!slide.length) return <Attesa testo="Disegno le slide…" />
  const corrente = slide.find((s) => s.numero === attiva + 1)

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {corrente ? (
          <img src={corrente.url} alt={`Slide ${attiva + 1}`} className="max-h-full max-w-full rounded bg-white shadow-2xl" />
        ) : (
          <Attesa testo={`Disegno la slide ${attiva + 1}…`} />
        )}
        <button type="button" onClick={() => vai(-1)} disabled={attiva === 0} className="absolute left-3 rounded-full bg-black/40 px-3 py-2 text-xl text-white hover:bg-black/60 disabled:opacity-20" aria-label="Slide precedente">
          ‹
        </button>
        <button type="button" onClick={() => vai(Infinity)} disabled={attiva >= (totale ?? 1) - 1} className="absolute right-3 rounded-full bg-black/40 px-3 py-2 text-xl text-white hover:bg-black/60 disabled:opacity-20" aria-label="Slide successiva">
          ›
        </button>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto border-t border-ink-700 bg-ink-900 px-3 py-2">
        <span className="shrink-0 font-mono text-xs text-ink-400">
          {attiva + 1} / {totale ?? '…'}
        </span>
        {slide.map((s) => (
          <button
            key={s.numero}
            type="button"
            onClick={() => setAttiva(s.numero - 1)}
            className={`shrink-0 overflow-hidden rounded border-2 ${s.numero === attiva + 1 ? 'border-brand-400' : 'border-transparent opacity-70 hover:opacity-100'}`}
            aria-label={`Vai alla slide ${s.numero}`}
          >
            <img src={s.url} alt="" className="h-14 bg-white" />
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Il numero di slide: si contano le parti "ppt/slides/slideN.xml"
 * nell'archivio (i nomi dei file in uno ZIP non sono mai compressi). La
 * copertura di pptx-glimpse descrive solo le slide appena convertite, quindi
 * serve solo se dice di più.
 */
function contaSlide(r: Awaited<ReturnType<typeof convertPptxToSvg>>, dati: Uint8Array): number {
  const testo = new TextDecoder('latin1').decode(dati)
  const trovate = new Set(testo.match(/ppt\/slides\/slide\d+\.xml/g) ?? []).size
  const copertura = (r as unknown as { supportCoverage?: { slides?: unknown[] } }).supportCoverage
  const dichiarate = Array.isArray(copertura?.slides) ? copertura.slides.length : 0
  return Math.max(1, trovate, dichiarate)
}

/** Il primo gruppo riusa la slide 1 già convertita. */
async function convertiResto(
  dati: Uint8Array,
  gruppo: number[],
  primo: Awaited<ReturnType<typeof convertPptxToSvg>>
): Promise<Awaited<ReturnType<typeof convertPptxToSvg>>> {
  const resto = gruppo.filter((n) => n !== 1)
  if (!resto.length) return primo
  const altri = await convertPptxToSvg(dati, { fonts: fonts(), textOutput: 'path', slides: resto })
  return { ...altri, slides: [...primo.slides, ...altri.slides] }
}
