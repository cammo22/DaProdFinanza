import { useRef, useState } from 'react'
import {
  DOCUMENT_CATEGORIES,
  dimensione,
  eseguibile,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_BYTES_WEB,
  type RequestItem
} from '@shared/documents'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { segnalaAzione } from '../lib/inbox'
import { Alert, Button, Field, Interruttore, Modal, Select, TextArea, TextInput } from './ui'

/**
 * Caricare file nel cassetto (AGENTS.md §10.13).
 *
 * - Lo studio sceglie se il file lo vede anche l'azienda o resta solo suo.
 * - L'azienda "manda i documenti allo studio": nasce una richiesta di tipo
 *   Documenti con i file attaccati, così lo studio la vede tra le novità, la
 *   prende in carico, e l'azienda sa a che punto è.
 * - Dentro una richiesta, i file si attaccano a quella.
 */
export function UploadDialog({
  companyUuid,
  requestUuid,
  fileIniziali = [],
  onClose,
  onFatto
}: {
  companyUuid: string
  requestUuid?: string
  fileIniziali?: File[]
  onClose: () => void
  onFatto: () => void
}): React.JSX.Element {
  const { user } = useAuth()
  const studio = user?.role === 'consultant'
  const nuovaRichiesta = !studio && !requestUuid
  const [file, setFile] = useState<File[]>(fileIniziali)
  const [categoria, setCategoria] = useState<string>(DOCUMENT_CATEGORIES[0])
  const [condiviso, setCondiviso] = useState(true)
  const [oggetto, setOggetto] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [stato, setStato] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [trascinando, setTrascinando] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const limite = window.daprod.documenti?.esterni ? MAX_DOCUMENT_BYTES : MAX_DOCUMENT_BYTES_WEB

  const aggiungi = (lista: FileList | File[]): void => {
    const nuovi = [...lista].filter((f) => !file.some((g) => g.name === f.name && g.size === f.size))
    setFile((prima) => [...prima, ...nuovi])
  }

  const troppoGrandi = file.filter((f) => f.size > limite)

  const invia = async (): Promise<void> => {
    if (!file.length) return
    setErrore(null)
    try {
      let richiesta = requestUuid ?? null
      if (nuovaRichiesta) {
        setStato('Apro la richiesta…')
        const r = await api.post<RequestItem>(`/api/companies/${companyUuid}/requests`, {
          kind: 'documenti',
          subject: oggetto.trim() || (file.length === 1 ? file[0].name : `${file.length} documenti`),
          body: messaggio.trim() || null
        })
        richiesta = r.uuid
      }
      for (let i = 0; i < file.length; i++) {
        const f = file[i]
        setStato(`Carico ${i + 1} di ${file.length}: ${f.name}`)
        const intestazioni: Record<string, string> = {
          'x-file-name': encodeURIComponent(f.name),
          'x-file-type': encodeURIComponent(f.type || ''),
          'x-category': encodeURIComponent(categoria),
          'x-shared': studio && !condiviso ? '0' : '1'
        }
        if (richiesta) intestazioni['x-request'] = encodeURIComponent(richiesta)
        await api.upload(`/api/companies/${companyUuid}/documents`, f, intestazioni)
      }
      segnalaAzione()
      onFatto()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Caricamento non riuscito.')
      setStato(null)
    }
  }

  return (
    <Modal
      title={studio ? 'Carica file' : requestUuid ? 'Allega file' : 'Manda documenti allo studio'}
      subtitle={
        studio
          ? 'Si aprono al volo dentro il programma: PDF, Excel, Word, PowerPoint, immagini.'
          : 'Lo studio li riceve subito e vedi qui quando li apre e li prende in carico.'
      }
      onClose={onClose}
    >
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-6 py-5">
        {errore && <Alert>{errore}</Alert>}

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setTrascinando(true)
          }}
          onDragLeave={() => setTrascinando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setTrascinando(false)
            aggiungi(e.dataTransfer.files)
          }}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center ${
            trascinando ? 'border-brand-400 bg-brand-500/10' : 'border-ink-600'
          }`}
        >
          <p className="text-sm text-ink-200">Trascina qui i file</p>
          <p className="text-xs text-ink-400">oppure</p>
          <Button onClick={() => input.current?.click()}>Scegli dal computer</Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) aggiungi(e.target.files)
              e.target.value = ''
            }}
          />
          <p className="text-[11px] text-ink-500">Fino a {Math.round(limite / (1024 * 1024))} MB per file.</p>
        </div>

        {file.length > 0 && (
          <ul className="divide-y divide-ink-800 rounded-lg border border-ink-700">
            {file.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink-100">{f.name}</span>
                <span className={`shrink-0 text-xs ${f.size > limite ? 'text-negative' : 'text-ink-400'}`}>{dimensione(f.size)}</span>
                {eseguibile(f.name) && <span className="shrink-0 text-[11px] text-warning">programma</span>}
                <button type="button" className="shrink-0 text-ink-400 hover:text-negative" onClick={() => setFile(file.filter((_, j) => j !== i))} aria-label={`Togli ${f.name}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {troppoGrandi.length > 0 && <Alert>{troppoGrandi.map((f) => f.name).join(', ')}: troppo grandi.</Alert>}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Categoria">
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          {nuovaRichiesta && (
            <Field label="Oggetto" hint="Facoltativo: se lo lasci vuoto usiamo il nome del file.">
              <TextInput value={oggetto} onChange={(e) => setOggetto(e.target.value)} placeholder="Estratti conto di agosto" />
            </Field>
          )}
        </div>
        {nuovaRichiesta && (
          <Field label="Messaggio per lo studio" hint="Facoltativo.">
            <TextArea value={messaggio} onChange={(e) => setMessaggio(e.target.value)} placeholder="Vi mando gli estratti conto, manca quello della carta." />
          </Field>
        )}
        {studio && (
          <Interruttore
            label="Visibile all'azienda"
            descrizione={condiviso ? 'L’azienda lo trova nei suoi documenti.' : 'Resta solo allo studio: l’azienda non lo vede.'}
            acceso={condiviso}
            onChange={setCondiviso}
          />
        )}
      </div>
      <footer className="flex items-center justify-end gap-3 border-t border-ink-700 px-6 py-4">
        {stato && <span className="mr-auto truncate text-xs text-ink-300">{stato}</span>}
        <Button type="button" onClick={onClose} disabled={Boolean(stato)}>
          Annulla
        </Button>
        <Button variant="primary" disabled={!file.length || troppoGrandi.length > 0 || Boolean(stato)} onClick={() => void invia()}>
          {nuovaRichiesta ? 'Manda allo studio' : 'Carica'}
        </Button>
      </footer>
    </Modal>
  )
}
