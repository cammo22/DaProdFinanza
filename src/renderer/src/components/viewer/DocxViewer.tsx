import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { Attesa } from './DocumentViewer'

/**
 * Documenti Word (.docx) con docx-preview (Apache-2.0), impaginati a pagine
 * come in Word.
 *
 * Il documento si disegna in un riquadro isolato (`<iframe sandbox>` senza
 * `allow-scripts`): i suoi stili non toccano quelli del programma, e un link
 * cliccato dentro non porta via la finestra. Il file arriva da fuori: dentro
 * quel riquadro nessuno script può partire.
 */
export default function DocxViewer({ blob }: { blob: Blob }): React.JSX.Element {
  const riquadro = useRef<HTMLIFrameElement>(null)
  const [stato, setStato] = useState<'apro' | 'pronto' | 'errore'>('apro')

  // Le pagine di Word sono larghe come un A4: su uno schermo stretto si
  // rimpiccioliscono fino a starci, senza scorrere di lato.
  const adattaPagina = (): void => {
    const f = riquadro.current
    const doc = f?.contentDocument
    const pagina = doc?.querySelector<HTMLElement>('section.docx')
    if (!f || !doc || !pagina) return
    doc.body.style.zoom = '1'
    const larga = pagina.offsetWidth
    if (!larga) return
    doc.body.style.zoom = String(Math.min(1, (f.clientWidth - 24) / larga))
  }

  useEffect(() => {
    const f = riquadro.current
    if (!f) return
    const osservatore = new ResizeObserver(() => adattaPagina())
    osservatore.observe(f)
    return () => osservatore.disconnect()
  }, [])

  useEffect(() => {
    const doc = riquadro.current?.contentDocument
    if (!doc) return
    let annullato = false
    doc.open()
    doc.write(
      `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
        html, body { margin: 0; background: #d9dee6; }
        .docx-wrapper { background: #d9dee6 !important; padding: 24px 0 !important; }
        .docx-wrapper > section.docx { box-shadow: 0 2px 10px rgba(0,0,0,.25); margin-bottom: 24px !important; }
      </style></head><body></body></html>`
    )
    doc.close()
    renderAsync(blob, doc.body, doc.head, {
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      // Immagini e caratteri come data: e non come blob: legati alla finestra.
      useBase64URL: true
    })
      .then(() => {
        if (annullato) return
        adattaPagina()
        setStato('pronto')
      })
      .catch(() => {
        if (!annullato) setStato('errore')
      })
    return () => {
      annullato = true
    }
  }, [blob])

  return (
    <div className="relative h-full">
      {stato === 'apro' && (
        <div className="absolute inset-0 z-10 bg-ink-950">
          <Attesa testo="Impagino il documento…" />
        </div>
      )}
      {stato === 'errore' && (
        <p className="p-6 text-sm text-negative">
          Il documento non si apre qui (forse è un .doc vecchio rinominato, o è rovinato): prova col programma del computer.
        </p>
      )}
      <iframe
        ref={riquadro}
        title="Documento Word"
        sandbox="allow-same-origin"
        className={`h-full w-full border-0 ${stato === 'errore' ? 'hidden' : ''}`}
      />
    </div>
  )
}
