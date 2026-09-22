import { lazy, Suspense, useEffect, useState } from 'react'
import { conMacro, dimensione, eseguibile, tipoAnteprima, type DocumentItem } from '@shared/documents'
import { api } from '../../lib/api'
import { Alert, Button } from '../ui'

/**
 * Apre un documento del cassetto al volo, dentro il programma — AGENTS.md §10.13.
 *
 * Niente Office da installare: PDF, fogli di calcolo, documenti Word e
 * presentazioni si aprono con visualizzatori open source (PDF.js, ExcelJS,
 * docx-preview, pptx-glimpse) caricati solo quando servono, così il programma
 * non diventa più lento ad aprirsi. Sul computer c'è anche "Apri con il
 * programma del computer", per modificare il file con Excel o LibreOffice.
 */

const PdfViewer = lazy(() => import('./PdfViewer'))
const SheetViewer = lazy(() => import('./SheetViewer'))
const DocxViewer = lazy(() => import('./DocxViewer'))
const PptxViewer = lazy(() => import('./PptxViewer'))

function quando(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

export function DocumentViewer({
  companyUuid,
  documento,
  onClose
}: {
  companyUuid: string
  documento: DocumentItem
  onClose: () => void
}): React.JSX.Element {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const tipo = tipoAnteprima(documento.name)
  const esterni = window.daprod.documenti?.esterni ?? false

  useEffect(() => {
    let annullato = false
    api
      .blob(`/api/companies/${companyUuid}/documents/${documento.uuid}/content`)
      .then((b) => {
        if (!annullato) setBlob(b)
      })
      .catch((err) => {
        if (!annullato) setErrore(err instanceof Error ? err.message : 'Il file non si apre.')
      })
    return () => {
      annullato = true
    }
  }, [companyUuid, documento.uuid])

  // Esc chiude, come ogni finestra che si rispetti.
  useEffect(() => {
    const tasto = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [onClose])

  const percorso = async (): Promise<string> =>
    (await api.get<{ path: string }>(`/api/companies/${companyUuid}/documents/${documento.uuid}/path`)).path

  const apriFuori = async (): Promise<void> => {
    setAvviso(null)
    if (conMacro(documento.name) && !confirm('Questo file contiene macro. Aprilo solo se ti fidi di chi l’ha mandato. Continuare?')) {
      return
    }
    try {
      await window.daprod.documenti.apri(await percorso())
    } catch (err) {
      setAvviso(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Non si apre.')
    }
  }

  const salvaCopia = async (): Promise<void> => {
    setAvviso(null)
    try {
      const dove = await window.daprod.documenti.salvaCopia(await percorso())
      if (dove) setAvviso(`Copia salvata: ${dove}`)
    } catch (err) {
      setAvviso(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Copia non riuscita.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80" role="dialog" aria-label={documento.name}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-700 bg-ink-900 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-100" title={documento.name}>
            {documento.name}
          </p>
          <p className="truncate text-xs text-ink-400">
            {dimensione(documento.size_bytes)} · {documento.category} · caricato da {documento.uploaded_by_name} il{' '}
            {quando(documento.created_at)}
          </p>
        </div>
        {esterni && !eseguibile(documento.name) && (
          <Button className="px-3 py-1 text-xs" onClick={() => void apriFuori()} title="Per modificarlo con Excel, Word, LibreOffice…">
            Apri con il programma del computer
          </Button>
        )}
        {esterni && (
          <Button className="px-3 py-1 text-xs" onClick={() => void salvaCopia()}>
            Salva una copia
          </Button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2.5 py-0.5 text-2xl leading-none text-ink-300 hover:bg-ink-800 hover:text-ink-100"
          aria-label="Chiudi"
        >
          ×
        </button>
      </header>
      {avviso && (
        <div className="bg-ink-900 px-4 pb-2">
          <Alert tone="info">{avviso}</Alert>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden bg-ink-950">
        {errore ? (
          <div className="p-6">
            <Alert>{errore}</Alert>
          </div>
        ) : !blob ? (
          <Attesa testo="Apro il file…" />
        ) : (
          <Suspense fallback={<Attesa testo="Preparo il visualizzatore…" />}>
            <Contenuto tipo={tipo} blob={blob} nome={documento.name} esterni={esterni} onApriFuori={() => void apriFuori()} />
          </Suspense>
        )}
      </div>
    </div>
  )
}

export function Attesa({ testo }: { testo: string }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="animate-pulse text-sm text-ink-300">{testo}</p>
    </div>
  )
}

function Contenuto({
  tipo,
  blob,
  nome,
  esterni,
  onApriFuori
}: {
  tipo: ReturnType<typeof tipoAnteprima>
  blob: Blob
  nome: string
  esterni: boolean
  onApriFuori: () => void
}): React.JSX.Element {
  switch (tipo) {
    case 'pdf':
      return <PdfViewer blob={blob} />
    case 'foglio':
      return <SheetViewer blob={blob} nome={nome} />
    case 'word':
      return <DocxViewer blob={blob} />
    case 'presentazione':
      return <PptxViewer blob={blob} />
    case 'immagine':
      return <Immagine blob={blob} nome={nome} />
    case 'testo':
      return <Testo blob={blob} />
    case 'audio':
    case 'video':
      return <Media blob={blob} video={tipo === 'video'} />
    default:
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-ink-100">Questo tipo di file non si apre dentro il programma.</p>
          <p className="max-w-md text-xs text-ink-400">
            {eseguibile(nome)
              ? 'È un programma o uno script: per sicurezza non si apre da qui. Salvane una copia solo se sai da dove arriva.'
              : esterni
                ? 'Si apre con il programma del computer adatto (per esempio LibreOffice, gratuito e open source, apre i formati di Office e OpenDocument).'
                : 'Aprilo dal programma per computer.'}
          </p>
          {esterni && !eseguibile(nome) && (
            <Button variant="primary" onClick={onApriFuori}>
              Apri con il programma del computer
            </Button>
          )}
        </div>
      )
  }
}

/** Un blob come indirizzo temporaneo, ritirato quando non serve più. */
export function useBlobUrl(blob: Blob | null, tipo?: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(tipo ? new Blob([blob], { type: tipo }) : blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob, tipo])
  return url
}

function Immagine({ blob, nome }: { blob: Blob; nome: string }): React.JSX.Element {
  // Un SVG si mostra come immagine: dentro un <img> i suoi eventuali script non partono.
  const url = useBlobUrl(blob, nome.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : undefined)
  const [intera, setIntera] = useState(false)
  if (!url) return <Attesa testo="Apro l'immagine…" />
  return (
    <div className="h-full overflow-auto p-4">
      <img
        src={url}
        alt={nome}
        onClick={() => setIntera(!intera)}
        className={`mx-auto cursor-zoom-in rounded bg-white ${intera ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full object-contain'}`}
      />
    </div>
  )
}

function Testo({ blob }: { blob: Blob }): React.JSX.Element {
  const [testo, setTesto] = useState<string | null>(null)
  useEffect(() => {
    // Oltre il mezzo mega un file di testo nel riquadro non si legge comunque.
    blob.slice(0, 512 * 1024).text().then(setTesto)
  }, [blob])
  if (testo === null) return <Attesa testo="Apro il testo…" />
  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap p-6 font-mono text-xs text-ink-100" data-selectable>
      {testo}
      {blob.size > 512 * 1024 && '\n\n… (il file continua: aprilo col programma del computer per leggerlo tutto)'}
    </pre>
  )
}

function Media({ blob, video }: { blob: Blob; video: boolean }): React.JSX.Element {
  const url = useBlobUrl(blob)
  if (!url) return <Attesa testo="Preparo…" />
  return (
    <div className="flex h-full items-center justify-center p-6">
      {video ? <video src={url} controls className="max-h-full max-w-full" /> : <audio src={url} controls className="w-full max-w-xl" />}
    </div>
  )
}
