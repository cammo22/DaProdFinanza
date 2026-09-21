import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Attesa } from './DocumentViewer'

/**
 * PDF con PDF.js (Mozilla, Apache-2.0): pagine disegnate su canvas, una sotto
 * l'altra, e disegnate solo quando entrano in vista — un bilancio di 200
 * pagine si apre subito come uno di due.
 *
 * Il PDF arriva da fuori (dall'azienda): PDF.js lo disegna e basta, nessuno
 * script contenuto nel PDF viene mai eseguito (serve il suo "scripting", che
 * qui non è attivo).
 */
GlobalWorkerOptions.workerSrc = workerUrl

const ZOOM = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export default function PdfViewer({ blob }: { blob: Blob }): React.JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  // Si parte adattati alla larghezza (mai oltre il 125%): su telefono la
  // pagina non esce dai bordi, sul computer resta leggibile.
  const [zoom, setZoom] = useState<number | null>(null)
  const [pagina, setPagina] = useState(1)
  const contenitore = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let annullato = false
    let caricamento: ReturnType<typeof getDocument> | null = null
    blob
      .arrayBuffer()
      .then((dati) => {
        caricamento = getDocument({ data: new Uint8Array(dati) })
        return caricamento.promise
      })
      .then((d) => {
        if (!annullato) setPdf(d)
      })
      .catch((err) => {
        if (!annullato) {
          setErrore(
            err?.name === 'PasswordException'
              ? 'Il PDF è protetto da password: aprilo col programma del computer.'
              : 'Il PDF non si apre: forse è rovinato.'
          )
        }
      })
    return () => {
      annullato = true
      void (caricamento as ReturnType<typeof getDocument> | null)?.destroy()
    }
  }, [blob])

  const adatta = (): void => {
    const el = contenitore.current
    if (!el || !pdf) return
    void pdf.getPage(1).then((p) => {
      const larga = p.getViewport({ scale: 1 }).width
      setZoom(Math.max(0.3, Math.min(1.25, (el.clientWidth - 32) / larga)))
    })
  }

  useEffect(() => {
    if (pdf && zoom === null) adatta()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf])

  // Il numero di pagina segue lo scorrimento.
  useEffect(() => {
    const el = contenitore.current
    if (!el || !pdf) return
    const aggiorna = (): void => {
      const centro = el.scrollTop + el.clientHeight / 3
      let corrente: HTMLElement | null = null
      for (const p of el.querySelectorAll<HTMLElement>('[data-pagina]')) {
        if (p.offsetTop <= centro) corrente = p
      }
      if (corrente) setPagina(Number(corrente.dataset.pagina))
    }
    el.addEventListener('scroll', aggiorna, { passive: true })
    return () => el.removeEventListener('scroll', aggiorna)
  }, [pdf])

  if (errore) return <p className="p-6 text-sm text-negative">{errore}</p>
  if (!pdf) return <Attesa testo="Apro il PDF…" />

  const vai = (n: number): void => {
    const p = contenitore.current?.querySelector(`[data-pagina="${n}"]`)
    p?.scrollIntoView({ block: 'start' })
  }
  const meno = [...ZOOM].reverse().find((z) => zoom !== null && z < zoom - 0.01)
  const piu = ZOOM.find((z) => zoom !== null && z > zoom + 0.01)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center gap-3 border-b border-ink-800 bg-ink-900 px-3 py-1.5 text-xs text-ink-300">
        <button type="button" className="rounded px-2 py-0.5 hover:bg-ink-800" onClick={() => vai(Math.max(1, pagina - 1))} aria-label="Pagina precedente">
          ‹
        </button>
        <span className="font-mono">
          {pagina} / {pdf.numPages}
        </span>
        <button type="button" className="rounded px-2 py-0.5 hover:bg-ink-800" onClick={() => vai(Math.min(pdf.numPages, pagina + 1))} aria-label="Pagina successiva">
          ›
        </button>
        <span className="mx-2 h-4 w-px bg-ink-700" />
        <button type="button" className="rounded px-2 py-0.5 hover:bg-ink-800 disabled:opacity-40" disabled={!meno} onClick={() => meno && setZoom(meno)} aria-label="Riduci">
          −
        </button>
        <span className="w-12 text-center font-mono">{zoom === null ? '…' : `${Math.round(zoom * 100)}%`}</span>
        <button type="button" className="rounded px-2 py-0.5 hover:bg-ink-800 disabled:opacity-40" disabled={!piu} onClick={() => piu && setZoom(piu)} aria-label="Ingrandisci">
          +
        </button>
        <button type="button" className="rounded px-2 py-0.5 hover:bg-ink-800" onClick={adatta} title="Adatta alla larghezza">
          ↔
        </button>
      </div>
      <div ref={contenitore} className="min-h-0 flex-1 overflow-auto bg-ink-800/60 py-4">
        {zoom !== null &&
          Array.from({ length: pdf.numPages }, (_, i) => (
            <Pagina key={`${i}-${zoom}`} pdf={pdf} numero={i + 1} zoom={zoom} radice={contenitore} />
          ))}
      </div>
    </div>
  )
}

function Pagina({
  pdf,
  numero,
  zoom,
  radice
}: {
  pdf: PDFDocumentProxy
  numero: number
  zoom: number
  radice: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [misura, setMisura] = useState<{ w: number; h: number }>({ w: 595 * zoom, h: 842 * zoom })
  const [visibile, setVisibile] = useState(numero <= 2)

  // Le misure vere della pagina, per riservare lo spazio prima di disegnarla.
  useEffect(() => {
    let annullato = false
    pdf.getPage(numero).then((p) => {
      const v = p.getViewport({ scale: zoom })
      if (!annullato) setMisura({ w: v.width, h: v.height })
    })
    return () => {
      annullato = true
    }
  }, [pdf, numero, zoom])

  useEffect(() => {
    const el = box.current
    if (!el || visibile) return
    const osservatore = new IntersectionObserver(
      (voci) => {
        if (voci.some((v) => v.isIntersecting)) setVisibile(true)
      },
      { root: radice.current, rootMargin: '600px 0px' }
    )
    osservatore.observe(el)
    return () => osservatore.disconnect()
  }, [visibile, radice])

  useEffect(() => {
    if (!visibile || !canvas.current) return
    let annullato = false
    let compito: { cancel: () => void } | null = null
    pdf.getPage(numero).then((p) => {
      if (annullato || !canvas.current) return
      // Disegno alla densità dello schermo: su un 2K/5K il testo resta nitido.
      const dpr = window.devicePixelRatio || 1
      const v = p.getViewport({ scale: zoom * dpr })
      const c = canvas.current
      c.width = Math.floor(v.width)
      c.height = Math.floor(v.height)
      const task = p.render({ canvas: c, viewport: v })
      compito = task
      task.promise.catch(() => undefined)
    })
    return () => {
      annullato = true
      compito?.cancel()
    }
  }, [visibile, pdf, numero, zoom])

  return (
    <div ref={box} data-pagina={numero} className="mx-auto mb-4 bg-white shadow-lg" style={{ width: misura.w, height: misura.h }}>
      <canvas ref={canvas} style={{ width: misura.w, height: misura.h }} />
    </div>
  )
}
